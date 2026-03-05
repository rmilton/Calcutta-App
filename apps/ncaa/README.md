# March Madness Calcutta App

A real-time web app for running a March Madness Calcutta tournament with your friends — live auctions, bracket tracking, and automatic standings.

## Features

- **Live Auction** — Open ascending bidding on all 64 teams with real-time updates via WebSockets
- **Bracket Tracking** — Admin enters game results; bracket and standings update automatically
- **Standings** — Leaderboard with earnings, spend, and net per participant
- **My Teams** — Each participant's portfolio of owned teams
- **Admin Panel** — Control the auction, enter results, configure payouts, manage participants
- **2026 Import** — Admin can import the 2026 bracket on Selection Sunday (March 15)

## Setup

### Requirements
- Node.js 18+
- npm

### Install

```bash
# 1. Install root dependencies
npm install

# 2. Install server dependencies
cd server && npm install && cd ..

# 3. Install client dependencies
cd client && npm install && cd ..

# 4. Configure environment
cp .env.example server/.env
# Edit server/.env and set ADMIN_PASSWORD
```

### Run (development)

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

### Build for production

```bash
npm run build
npm start
```

The server serves the React build as static files. Set `PORT` env var to change the port.

## Deploying to Railway

1. Push to GitHub
2. Create a new Railway project, connect your repo
3. Set environment variables: `ADMIN_PASSWORD`, `NODE_ENV=production`
4. Add a volume mounted at `/app/server` to persist the SQLite database
5. Set the start command to `npm start`

## Engineering Docs

For current architecture, operations, and agent workflows, use repo-root docs:

- `/AGENTS.md`
- `/ARCHITECTURE.md`
- `/RUNBOOK.md`
- `/docs/apps/ncaa.md`

## Usage

### Admin Flow

1. Go to `/join` → click "Admin Login" → enter your admin password
2. **Settings tab**: Copy the invite code and share it with participants
3. **Payouts tab**: Set dollar amounts for each round (R64 → Championship)
4. **Auction tab**: Click "Open Auction" then use "Start Next Team" to put teams up for bid
5. After all teams sold: **Bracket tab** → "Initialize Bracket"
6. Enter game results as games are played

### Participant Flow

1. Go to the app URL → enter name + invite code
2. Watch the live auction, place bids
3. Check Standings and My Teams throughout the tournament

## Auction Rules

- Open ascending bids — anyone can outbid at any time
- Initial timer: 30 seconds (configurable)
- Grace period: 15 seconds reset on each new bid
- No bid cap — pot grows from all purchases
- Admin can manually close any auction or force-start specific teams

## Payout Structure

Configure per round in the Admin → Payouts tab. For example:
- R64 Win: $5
- R32 Win: $10
- Sweet 16: $20
- Elite 8: $40
- Final Four: $80
- Championship: $200

Earnings are calculated automatically when admin records results.
