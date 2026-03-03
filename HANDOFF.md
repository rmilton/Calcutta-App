# Calcutta App — Developer Handoff

This document is the primary context reference for working on this codebase. Read it before making any changes.

---

## What This App Does

A real-time March Madness Calcutta auction web app. Players join with an invite code, then bid on NCAA tournament teams in a live ascending auction. Whoever owns a team earns money when that team wins bracket games. The admin controls the auction, enters bracket results, and configures payouts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js + Express, `better-sqlite3` (SQLite), Socket.io |
| Client | React (Vite), Tailwind CSS, Socket.io client |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Deploy | Railway (single process serves API + static build) |
| DB | SQLite file at `server/calcutta.db` (persisted via Railway volume) |

**Node version:** 18+. There is no TypeScript — everything is plain JS/JSX.

---

## Repository Layout

```
/
├── server/
│   ├── index.js          # Express + Socket.io entrypoint
│   ├── db.js             # ALL database logic, migrations, query helpers
│   ├── socket.js         # Socket.io event handlers + auction timer logic
│   ├── ai.js             # Anthropic API calls (auction commentary, game recap)
│   ├── scheduler.js      # Scheduled auction auto-start timer
│   ├── routes/
│   │   ├── auth.js       # /api/auth — join, admin login, logout, /me
│   │   ├── admin.js      # /api/admin — settings, auction control, bracket, teams
│   │   ├── auction.js    # /api/auction — queue and item reads
│   │   ├── bracket.js    # /api/bracket — read games, set/unset results
│   │   ├── standings.js  # /api/standings — leaderboard
│   │   ├── tournaments.js# /api/tournaments — multi-tournament management
│   │   ├── export.js     # /api/admin/export/csv
│   │   └── middleware.js # requireAuth, requireAdmin
│   └── data/
│       └── teams2025.js  # Hard-coded 64-team bracket data for 2025/2026
│
├── client/src/
│   ├── App.jsx           # Router, context providers, ProtectedRoute
│   ├── utils.js          # fmt(), api(), REGION_COLORS, ROUND_NAMES constants
│   ├── main.jsx          # React entry point
│   ├── index.css         # Tailwind base + custom component classes
│   ├── context/
│   │   ├── AuthContext.jsx       # useAuth() — participant state, join/login/logout
│   │   ├── SocketContext.jsx     # useSocket() — socket.io connection
│   │   └── TournamentContext.jsx # useTournament() — tournament metadata
│   ├── components/
│   │   ├── Nav.jsx
│   │   ├── AiCommentary.jsx  # Overlay that displays AI commentary text
│   │   ├── CountdownTimer.jsx
│   │   ├── ParticipantAvatar.jsx
│   │   └── TeamLogo.jsx
│   └── pages/
│       ├── Join.jsx        # /join — participant join + admin login
│       ├── Auction.jsx     # / and /auction — live bidding UI
│       ├── Bracket.jsx     # /bracket — bracket results view
│       ├── Standings.jsx   # /standings — leaderboard
│       ├── MyTeams.jsx     # /my-teams — owned teams per participant
│       ├── Admin.jsx       # /admin — tab shell, imports sub-tabs
│       └── admin/
│           ├── AuctionTab.jsx
│           ├── BracketAdminTab.jsx
│           ├── ParticipantsTab.jsx
│           ├── PayoutsTab.jsx
│           ├── SettingsTab.jsx
│           ├── TeamsTab.jsx
│           └── TournamentsTab.jsx
│
├── .env                  # Not in git — contains ADMIN_PASSWORD, ANTHROPIC_API_KEY
├── railway.toml
└── package.json          # Root: runs `concurrently` for dev, `node server/index.js` for prod
```

---

## Database Schema

The database lives at `server/calcutta.db`. All schema creation and migrations are in `server/db.js` inside the `init()` function.

### Key tables

**`tournaments`** — one row per tournament (app supports multiple, only one is "active" at a time)
```
id, name, invite_code,
auction_timer_seconds (default 30),
auction_grace_seconds (default 15),
auction_status         ('waiting' | 'open' | 'paused'),
tournament_started     (0 | 1),
auction_order          ('random' | 'seed_asc' | 'seed_desc' | 'region'),
auction_auto_advance   (0 | 1),
ai_commentary_enabled  (0 | 1, default 1),
ai_commentary_end_of_round (0 | 1, default 1),
auction_scheduled_start (unix ms | NULL),
created_at, archived_at
```

**`settings`** — global key/value store. Only one meaningful row: `active_tournament_id`.

**`participants`** — global across all tournaments
```
id, name, color (hex), is_admin (0|1), session_token, created_at
```

**`tournament_participants`** — junction: which participants are in which tournament
```
tournament_id, participant_id, joined_at
```

**`teams`** — scoped to tournament_id
```
id, name, seed, region ('East'|'West'|'South'|'Midwest'), eliminated (0|1),
espn_id, color, tournament_id
```

**`auction_items`** — one per team per tournament
```
id, team_id, tournament_id,
status ('pending' | 'active' | 'sold'),
current_price, current_leader_id, bid_end_time (unix ms),
final_price, winner_id, queue_order
```

**`bids`** — full bid history
```
id, team_id, participant_id, amount, tournament_id, created_at
```

**`ownership`** — final sale records; UNIQUE(tournament_id, team_id)
```
id, tournament_id, team_id, participant_id, purchase_price
```

**`games`** — bracket matchups and results
```
id, round (1-6), region, position, team1_id, team2_id, winner_id, played_at, tournament_id
```

**`payout_config`** — per round per tournament; UNIQUE(tournament_id, round_number)
```
id, tournament_id, round_number (1-6), round_name, amount, payout_type ('fixed'|'percent')
```

**`earnings`** — computed per game win (recalculated on demand)
```
id, participant_id, team_id, game_id, round_number, amount, tournament_id
```

### Adding new tournament settings

All tournament-scoped settings live as **columns on the `tournaments` table**, not in `settings`.

To add a new setting:
1. Add the column name to `TOURNAMENT_SETTING_KEYS` array in `db.js`
2. Add a migration in `init()` using `columnExists()` guard:
   ```js
   if (!columnExists('tournaments', 'my_new_setting')) {
     db.exec('ALTER TABLE tournaments ADD COLUMN my_new_setting INTEGER NOT NULL DEFAULT 0');
   }
   ```
3. Add the column to the `INSERT` in `createTournament()`
4. Add the key to the `allowed` array in `PATCH /api/admin/settings` in `routes/admin.js`
5. Add UI to `client/src/pages/admin/SettingsTab.jsx`

`getTournamentSetting(tid, key)` and `setTournamentSetting(tid, key, val)` always cast to/from String.

---

## Authentication

- Cookie-based: `session` httpOnly cookie containing a UUID token
- `getParticipantByToken(token)` looks up participant by that token
- Admin login: `POST /api/auth/admin` with `ADMIN_PASSWORD` env var (default: `admin123`)
- Participant join: `POST /api/auth/join` with name + invite code
- `requireAuth` middleware: checks cookie, attaches `req.participant`
- `requireAdmin` middleware: checks `req.participant.is_admin === 1`
- Socket.io auth: same token passed via `socket.handshake.auth.token` or cookie

---

## API Routes

All routes are prefixed with `/api`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/me` | none | Check current session |
| POST | `/auth/join` | none | Join with name + invite code |
| POST | `/auth/admin` | none | Admin login with password |
| POST | `/auth/logout` | none | Clear session cookie |
| GET | `/auction` | auth | Current auction state + queue |
| GET | `/auction/queue` | auth | Full auction item list |
| GET | `/bracket` | auth | Games + payout config |
| POST | `/bracket/result` | admin | Set a game winner |
| POST | `/bracket/unset` | admin | Remove a game result |
| GET | `/standings` | auth | Full leaderboard |
| GET | `/admin/settings` | admin | All tournament settings |
| PATCH | `/admin/settings` | admin | Update settings |
| POST | `/admin/invite-code/regenerate` | admin | New invite code |
| GET | `/admin/participants` | admin | List participants |
| DELETE | `/admin/participants/:id` | admin | Remove participant |
| GET | `/admin/payouts` | admin | Payout config |
| PATCH | `/admin/payouts` | admin | Update payouts |
| POST | `/admin/payouts/recalc` | admin | Recalculate earnings |
| GET | `/admin/auction/queue` | admin | Queue with full details |
| PATCH | `/admin/auction/queue` | admin | Reorder pending items |
| POST | `/admin/auction/start` | admin | Open auction |
| POST | `/admin/auction/pause` | admin | Pause auction |
| POST | `/admin/auction/next` | admin | Start next team (or specific teamId) |
| POST | `/admin/auction/close` | admin | Close current auction item |
| POST | `/admin/bracket/initialize` | admin | Create round 1 matchups |
| POST | `/admin/bracket/reset` | admin | Wipe bracket + earnings |
| POST | `/admin/teams/import` | admin | Import 64 teams |
| GET | `/admin/export/csv` | admin | Download results CSV |
| GET | `/tournaments` | admin | List all tournaments |
| POST | `/tournaments` | admin | Create new tournament |
| POST | `/tournaments/:id/activate` | admin | Switch active tournament |

---

## Socket.io Events

### Server → Client (emitted via `io.emit`)

| Event | Payload | When |
|---|---|---|
| `auction:state` | `{ active, recentBids, auctionStatus, scheduledStart }` | On connect |
| `auction:started` | `{ itemId, teamId, endTime }` | New team up for bid |
| `auction:update` | `{ itemId, teamId, currentPrice, leaderId, leaderName, leaderColor, endTime, recentBids }` | New bid placed |
| `auction:sold` | `{ itemId, teamId, teamName, winnerId, winnerName, winnerColor, finalPrice }` | Timer expired with bids |
| `auction:nobids` | `{ itemId }` | Timer expired with no bids |
| `auction:complete` | — | All teams sold |
| `auction:status` | `{ status }` | Auction opened/paused |
| `auction:scheduled_start` | `{ ts }` | Schedule set or cleared |
| `auction:commentary:chunk` | `{ token }` | AI commentary text chunk |
| `auction:commentary:done` | `{ text }` | AI commentary complete |
| `bracket:update` | `{ gameId, winnerId, loserId }` | Game result entered |
| `bracket:initialized` | — | Bracket created |
| `bracket:reset` | — | Bracket wiped |
| `bracket:recap:chunk` | `{ token }` | AI game recap chunk |
| `bracket:recap:done` | `{ text }` | AI game recap complete |
| `standings:update` | — | Earnings/payouts changed |
| `teams:imported` | — | Teams imported |

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `auction:bid` | `{ amount }` | Place a bid |

---

## Auction Timer Logic (`server/socket.js`)

- `startTimer(itemId, endTime)` — sets a `setTimeout` to call `closeAuction` at `endTime`
- Only one active timer at a time (`activeTimer` module-level variable)
- On new bid: grace period resets to `Math.max(now + graceSeconds, currentEndTime)`
- `closeAuction(itemId, io)` — sells to leader or marks pending; triggers AI commentary and auto-advance
- `autoAdvanceToNextItem` — if `auction_auto_advance === '1'`, starts the next pending team after 3s
- Timer is restored on server restart (checks for `status = 'active'` item in DB)

---

## AI Integration (`server/ai.js`)

Uses `@anthropic-ai/sdk`. Requires `ANTHROPIC_API_KEY` env var. If absent, AI features are silently skipped.

Two functions:

**`generateAuctionCommentary(data, io)`** — called after each team sells. Emits `auction:commentary:chunk` + `auction:commentary:done`. Gated by `ai_commentary_enabled` setting (checked in `socket.js` before calling).

**`streamGameRecap(data, io)`** — called after each bracket result. Emits `bracket:recap:chunk` + `bracket:recap:done`. Currently always fires when `ANTHROPIC_API_KEY` is set; the `ai_commentary_end_of_round` setting exists in DB and settings UI but the gate check in `bracket.js` has not yet been implemented.

Model used: `claude-sonnet-4-5-20250929`

---

## Client Patterns

### API calls
All API calls go through `api()` from `utils.js`:
```js
import { api } from '../../utils';
const r = await api('/admin/settings');        // GET
await api('/admin/settings', { method: 'PATCH', body: JSON.stringify({...}) });
```
This wraps `fetch('/api' + path, { credentials: 'include', ... })`.

### Dollar formatting
Always use `fmt(n)` from `utils.js` for display. Shows no cents for whole numbers.

### Contexts
- `useAuth()` — `{ participant, join, adminLogin, logout }`
- `useSocket()` — the raw socket.io client instance
- `useTournament()` — tournament metadata (name, status, etc.)

### Tailwind custom classes
Defined in `client/src/index.css`. Key classes:
- `btn-primary`, `btn-secondary`, `btn-danger` — buttons
- `skeleton` — loading placeholder
- `text-status-success`, `text-status-error` — status colors

There are also semantic color tokens (`bg-surface-base`, `text-text-primary`, etc.) that are referenced in newer code. Some may not yet be fully wired into `tailwind.config.js` — check before using.

### Toggle switches (admin settings pattern)
Settings stored as `'0'` or `'1'` strings. The canonical toggle pattern:
```jsx
<button
  role="switch"
  aria-checked={settings.some_setting !== '0'}
  onClick={() => setSettings(s => ({
    ...s,
    some_setting: s.some_setting === '0' ? '1' : '0'
  }))}
  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4 ${
    settings.some_setting !== '0' ? 'bg-orange-500' : 'bg-slate-600'
  }`}
>
  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
    settings.some_setting !== '0' ? 'translate-x-6' : 'translate-x-1'
  }`} />
</button>
```

---

## Tournament Lifecycle

1. **Setup** — Admin creates tournament (or uses default id=1), sets invite code
2. **Waiting** — `auction_status = 'waiting'`. Players join with invite code
3. **Import** — Admin imports 64 teams via TeamsTab (uses `TEAMS_2025` data or custom)
4. **Auction** — Admin opens auction (`auction_status = 'open'`), starts teams one at a time
5. **Bracket** — After all teams sold, admin initializes bracket (creates Round 1 games)
6. **Play** — Admin enters game results; earnings auto-calculated; AI recaps fire
7. **Complete** — All 63 games played; standings finalized; CSV export available

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_PASSWORD` | no | `admin123` | Admin login password |
| `ANTHROPIC_API_KEY` | no | — | Enables AI commentary features |
| `PORT` | no | `3001` | Server port |
| `NODE_ENV` | no | — | Set to `production` to serve static build |
| `DB_PATH` | no | `server/calcutta.db` | SQLite file path |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | CORS origin for dev |

`.env` is loaded from the **project root** (not `server/`) via:
```js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
```

---

## Dev Setup

```bash
npm install                    # root
cd server && npm install && cd ..
cd client && npm install && cd ..
# Create .env at project root with ADMIN_PASSWORD and optionally ANTHROPIC_API_KEY
npm run dev                    # starts both server (3001) and client (5173) via concurrently
```

Client proxies `/api` and `/socket.io` to `localhost:3001` (configured in `client/vite.config.js`).

---

## Known Gotchas

- **Settings are strings** — `getTournamentSetting` always returns a string or null. Compare with `=== '0'`, `=== '1'`, not booleans.
- **`ai_commentary_end_of_round` UI exists but backend gate is not yet implemented** — the setting is saved to DB and toggleable in Settings, but `server/routes/bracket.js` doesn't yet check it before calling `streamGameRecap`.
- **Participants are global** — A participant who joins tournament 1 and then joins tournament 2 with the same name gets the same DB record. Their session token is reused.
- **Admin is not scoped to a tournament** — There is one admin account (`is_admin = 1`). It automatically joins every tournament.
- **`auction_timer_seconds` and `auction_grace_seconds`** are stored in the `PATCH /admin/settings` allowed list in `routes/admin.js` but were accidentally omitted in the explicit array — check the current state of that file before assuming they're saved.
- **Bracket round 5 = Final Four, round 6 = Championship** — regions for rounds 5-6 are `'Final Four'` and `'Championship'` strings (not the regional names).
- **`recalcEarnings` is idempotent** — it deletes all earnings for a tournament and reinserts. Safe to call multiple times.

---

## Refactor Backlog (Captured 2026-03-03)

Status update:
- Completed: auction start/close/bid logic consolidated into `server/services/auctionService.js`, with focused server tests in `server/tests/auctionService.test.js`.

Remaining refactor TODOs:
1. Split `server/db.js` into focused modules:
   - migrations (`init` + column/table upgrades),
   - repositories (query/read-write functions),
   - domain services (payout/earnings/bracket helpers).
2. Refactor `GET /api/standings/participant/:id` query to remove many correlated subqueries and replace with CTE/join-based query blocks for readability and performance.
3. Move complex auction UI state in `client/src/pages/Auction.jsx` to a reducer/custom hook (`useAuctionRealtime`) so socket event transitions are centralized and easier to test.
4. Componentize repeated admin settings UI patterns in `client/src/pages/admin/SettingsTab.jsx`:
   - reusable toggle row component,
   - reusable async action/message helper hook.
5. Add request and socket payload validation (for example with Zod) for admin, bracket, auth, and auction socket inputs with a consistent error response format.
6. Expand automated tests beyond auction service:
   - bracket advance/unset behavior,
   - round recap trigger timing,
   - fixture load/clear behavior,
   - game schedule metadata assignment/backfill behavior.
