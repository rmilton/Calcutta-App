# NCAA App - Developer Handoff

This document is specific to the NCAA app under `apps/ncaa`.

## Scope

- Product: March Madness Calcutta
- Paths: `apps/ncaa/server`, `apps/ncaa/client`
- Deployment target: NCAA Railway service

Important: NCAA styling is intentionally frozen except explicit NCAA UI work. See root style-freeze guard.

## Tech stack

- Server: Node.js, Express, Socket.io, better-sqlite3
- Client: React (Vite), Tailwind CSS
- AI: Anthropic SDK (auction/round commentary)
- DB: SQLite (`DB_PATH`), default `apps/ncaa/server/calcutta.db`

## Repository layout (NCAA app)

- `server/index.js`: Express + Socket.io entrypoint
- `server/db.js`: schema, migrations, query helpers
- `server/services/auctionService.js`: auction lifecycle logic
- `server/routes/*`: auth/admin/auction/bracket/standings/tournaments/export
- `server/data/teams2025.js`, `server/data/gameSchedule2025.js`: seeded NCAA data
- `server/tests/auctionService.test.js`: auction integration tests
- `client/src/pages/*`: Join/Auction/Bracket/Standings/MyTeams/Admin
- `client/src/pages/admin/*`: admin tabs

## Core behavior

- Live ascending auction for teams
- Bracket initialization and game result advancement
- Round-based payouts and standings recalculation
- Tournament switching for historical views

## Development commands

From repo root:

- `npm run dev:ncaa`
- `npm run test:ncaa`
- `npm run build:ncaa`

From app root (`apps/ncaa`):

- `npm run dev`
- `npm run build`

## Deployment notes

- Preferred DB env: `DB_PATH=/data/calcutta.db`
- Health endpoint: `/api/health`
- Railway config files:
  - root fallback: `/railway.toml`
  - app-local: `apps/ncaa/railway.toml`

## Monorepo boundary

Do not import runtime NCAA code from `apps/f1`.

If a change is NCAA-only, avoid edits to:

- `apps/f1/**`
- `packages/core/**` (unless truly shared and required)
