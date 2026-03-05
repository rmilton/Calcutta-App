# F1 App - Developer Handoff

Last updated: 2026-03-04

This document is specific to the F1 app under `apps/f1`.

## Scope

- Product: Formula 1 season Calcutta
- Paths: `apps/f1/server`, `apps/f1/client`
- Deployment target: F1 Railway service
- NCAA remains out of scope for F1 work

## Tech Stack

- Server: Node.js, Express, Socket.io, better-sqlite3
- Client: React (Vite), custom CSS (industrial/muted theme)
- DB: SQLite (`DB_PATH`), default `apps/f1/server/f1-calcutta.db`

## Architecture Guardrail

`apps/f1/server` is self-contained for Railway subdirectory deploys.
Do not introduce runtime imports from outside `apps/f1` unless deploy strategy changes.

## Current F1 Route Structure

- Player routes:
  - `/join`
  - `/standings`
  - `/events`
  - `/my-drivers` (non-admin only)
  - `/auction`
- Admin route shell:
  - `/admin` -> redirects to `/admin/overview`
  - `/admin/overview`
  - `/admin/auction`
  - `/admin/results`
  - `/admin/test-data`
  - `/admin/payouts`

## Current Functionality Snapshot

### Navigation and role behavior

- Top nav order: `Standings`, `Events`, `My Drivers`, `Auction`, `Admin`
- Admin users do not see `My Drivers`
- Admin users are blocked from bidding in auction UI and server flow
- Logged-in participant name + avatar shown next to Logout
- Admin top nav active state works for `/admin/*`

### Auction UX

- Telemetry strip includes:
  - auction status
  - pending drivers
  - auction purse total
- Live auction card includes:
  - team logo + driver identity
  - bid clock
  - current leader
  - inline running bid activity feed
- Bid form supports:
  - manual bid entry
  - inline quick bid (`+ $1`)
- Sold notice shows full driver name (not only 3-letter code)
- Sold drivers area is list-based, split into:
  - `Your Garage`
  - `Other Participants`
- Auction complete state shows completion message and final purse context

### Events UX

- Left navigator includes Upcoming/Past toggle (one list visible at a time)
- Default selected event behavior:
  - most recent scored event
  - switches to next upcoming race when within 48h of start
- Event detail uses tabs:
  - `Payouts` (default)
  - `Results`
- Detail header includes event metadata and random bonus position
- Payouts tab now shows:
  - `Race Pot` total
  - `Total Pot` (season pot)
  - each payout line as dollar amount plus `% of pot`
- Results rows use team logo + driver name + team name

### Admin Center

- Admin is split into focused pages with secondary nav
- `Overview`:
  - season/auction summary telemetry
  - season random standing position + draw timestamp
- `Auction`:
  - auction controls and auction timing settings
- `Results Sync`:
  - `Sync Next Available`
  - `Advance Next (Force)`
  - per-event `Sync` and `Force Sync`
- `Test Data`:
  - manual event result editor
  - save manual + score flow
  - season bonus payouts breakdown
  - recalc season bonuses
- `Payout Rules`:
  - editable rule bps per group
  - target total validation pills

Important: race result sync is currently manual/admin-triggered. There is no background auto-sync scheduler.

### Team identity system

- Client-side team metadata map in `client/src/teamMeta.js`
- Official local SVG logos in `client/public/team-logos/`
- Reusable identity components:
  - `TeamLogo`
  - `DriverIdentity`
- Team text colors are desaturated/tempered for readability

## Payout Model V2 (Active)

All allocations are from total pot basis points.
Tie winners split cents evenly.

### Grand Prix rules (`350 bps` total)

1. `race_winner` - 50
2. `second_place` - 25
3. `third_place` - 25
4. `best_p6_or_lower` - 50
5. `best_p11_or_lower` - 50
6. `most_positions_gained` - 50
7. `second_most_positions_gained` - 25
8. `random_finish_bonus` - 75

### Sprint rules (`150 bps` total)

1. `sprint_winner` - 25
2. `best_p6_or_lower` - 25
3. `most_positions_gained` - 25
4. `random_finish_bonus` - 75

### Season bonus rules (`700 bps` total)

1. `drivers_champion` - 150
2. `most_race_wins` - 100
3. `most_top10_outside_top4` - 150
4. `season_random_finish_position` - 200
5. `biggest_single_race_climb` - 100

### Random draw behavior

- Event random bonus position:
  - drawn once and persisted per event
  - constrained to finishing positions `4-20` (no podium)
- Season random bonus:
  - draws a random final championship standing position
  - persisted as `season_random_bonus_position` with draw timestamp

## Data Model and Migration Notes

- `seasons` includes:
  - `payout_model_version`
  - `season_random_bonus_position`
  - `season_random_bonus_drawn_at`
- One-time payout model migration upgrades active season to V2 rule set
- Deprecated season categories are deactivated (`most_podiums`, `best_avg_finish`)
- Migration triggers retroactive season rescore for already scored events

## Key Backend Modules

- `server/index.js`: app bootstrap + route wiring + migration rescore trigger
- `server/db.js`: schema, migration logic, seed/query helpers
- `server/services/auctionService.js`: auction lifecycle and timer behavior
- `server/services/scoringService.js`: event/season payout engine and sync logic
- `server/providers/index.js`: results provider adapter factory
- `server/providers/mockResultsProvider.js`: deterministic mock provider
- `server/routes/admin.js`: admin actions (settings, sync, manual override, rules)
- `server/routes/events.js`: event list + payout detail payloads

## API Notes

- `/api/events/:id/payouts` returns:
  - `event`
  - `results`
  - `payouts`
  - `total_pot_cents`
  - `event_payout_cents`
- Results scoring actions remain admin-only under `/api/admin/results/*`

## Development Commands

From repo root:

- `npm run dev:f1`
- `npm run test:f1`
- `npm run build:f1`

From app root (`apps/f1`):

- `npm run dev`
- `npm run build`

Default local ports:

- F1 server: `3002`
- F1 client: `5174`

## Deployment Notes (Railway)

- Service root: `apps/f1`
- Config file: `apps/f1/railway.toml`
- Health endpoint: `/api/health`
- Preferred DB env: `DB_PATH=/data/f1-calcutta.db`
- Prefer Railway `PORT` in production (do not force local port values)

## Next Feature Ideas (Prioritized)

### High-impact core features

1. Race Control Timeline
   - Full audit trail of auction/race actions (who did what, when), with replay and rollback-safe visibility.
2. Manual Race Advance Wizard
   - Explicit controls to move from event to event with guardrails (confirm, preview payouts, commit).
3. Payout Audit Screen
   - Per-event “why this payout happened” breakdown by rule, winners, split math, and % of pot.
4. What-If Simulator
   - Admin tool to simulate result changes before syncing/scoring, so payout impact can be previewed.
5. Participant Performance Dashboard
   - Trends by participant: spend efficiency, ROI by race type, top categories won, season trajectory.

### AI-powered feature ideas

1. AI Admin Copilot
   - Natural language commands like “show unpaid events”, “simulate sprint payout with these results”, “advance to next round preview only”.
2. AI Anomaly Detection
   - Flags odd auction patterns (bid spikes, stalled bidding, unusual winner concentration) and scoring anomalies.
3. AI Result Ingestion Assistant
   - Paste race results text/CSV/PDF, AI extracts structured positions/start order, then shows confidence + diff before apply.
4. AI Forecasting for Auction Value
   - Driver “fair value” suggestions based on standings, event type mix, and remaining calendar.
5. AI Narrative Generator
   - Auto-generates post-race summaries: biggest movers, payout leaders, and season bonus movement.

## Monorepo Boundary

Do not import runtime F1 code from `apps/ncaa`.
For F1-only work, avoid edits outside `apps/f1/**` unless explicitly requested.
