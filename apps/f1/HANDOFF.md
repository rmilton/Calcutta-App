# F1 App - Developer Handoff

This document is specific to the F1 app under `apps/f1`.

## Scope

- Product: Formula 1 season Calcutta
- Paths: `apps/f1/server`, `apps/f1/client`
- Deployment target: F1 Railway service

## Tech stack

- Server: Node.js, Express, Socket.io, better-sqlite3
- Client: React (Vite), custom CSS theme (telemetry-dark)
- DB: SQLite (`DB_PATH`), default `apps/f1/server/f1-calcutta.db`

## Important architecture note

`apps/f1/server` is self-contained for Railway subdirectory deploys.
Do not introduce runtime imports from outside `apps/f1` unless deploy strategy changes.

Local shared helpers are in:

- `apps/f1/server/lib/core.js`

## Key backend modules

- `server/index.js`: app bootstrap + routes + socket wiring
- `server/db.js`: schema + seed + query helpers
- `server/services/auctionService.js`: auction lifecycle
- `server/services/scoringService.js`: event scoring, ties, random bonus, season bonuses
- `server/providers/index.js`: results provider adapter factory
- `server/providers/mockResultsProvider.js`: deterministic mock provider
- `server/routes/admin.js`: settings, auction control, sync, manual override, rules
- `server/routes/events.js`: events listing and payout details

## F1 scoring model

- Grand Prix categories total `300 bps` (3%) of pot
- Sprint categories total `100 bps` (1%) of pot
- Ties split payout evenly in integer cents
- Random finishing-position bonus is drawn once and persisted per event
- Season bonus payouts allocate remaining pool by configured bonus-rule bps

## Primary tables

- `seasons`, `participants`, `season_participants`
- `drivers`, `auction_items`, `bids`, `ownership`
- `events`, `event_results`
- `event_payout_rules`, `event_payouts`
- `season_bonus_rules`, `season_bonus_payouts`

## Results sync flow

1. Admin calls `/api/admin/results/sync-next` or `/api/admin/results/sync-event/:id`
2. Provider returns event results
3. Results are upserted into `event_results`
4. Event payouts recalculated
5. Season bonus payouts recalculated
6. Socket events emitted: `results:sync:*`, `event:scored`, `standings:update`

## Development commands

From repo root:

- `npm run dev:f1`
- `npm run test:f1`
- `npm run build:f1`

From app root (`apps/f1`):

- `npm run dev`
- `npm run build`

## Deployment notes (Railway)

- Service root: `apps/f1`
- Config file: `apps/f1/railway.toml`
- Health endpoint: `/api/health`
- Preferred DB env: `DB_PATH=/data/f1-calcutta.db`
- Prefer Railway `PORT` in production (avoid forcing local dev port env)

## Monorepo boundary

Do not import runtime F1 code from `apps/ncaa`.

If a change is F1-only, avoid edits to:

- `apps/ncaa/**`
- `packages/core/**` unless explicitly needed for tooling/shared behavior
