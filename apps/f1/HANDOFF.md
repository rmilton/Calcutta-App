# F1 Calcutta App Handoff

## Stack

- Server: Node.js, Express, Socket.io, better-sqlite3
- Client: React + Vite
- Shared: `packages/core` utilities for money/auth/auction math

## Key backend modules

- `server/db.js` - schema + query helpers
- `server/services/auctionService.js` - auction lifecycle
- `server/services/scoringService.js` - event scoring, tie splitting, random bonus draw, season bonuses
- `server/providers/index.js` - results provider adapter
- `server/routes/admin.js` - auction controls, results sync, rule updates

## F1 scoring model

- GP categories total: `3.00%` of pool (`300 bps`)
- Sprint categories total: `1.00%` of pool (`100 bps`)
- Ties split category payout evenly in cents
- Random bonus position is persisted per event and never redrawn
- Season bonus rules allocate percentages of the remaining pool

## Important tables

- `seasons`, `participants`, `season_participants`
- `drivers`, `auction_items`, `bids`, `ownership`
- `events`, `event_results`
- `event_payout_rules`, `event_payouts`
- `season_bonus_rules`, `season_bonus_payouts`

## Sync flow

1. Admin calls `/api/admin/results/sync-next` or `/sync-event/:id`
2. Provider returns event results
3. Results upsert into `event_results`
4. Event payouts recalculated
5. Season bonus payouts recalculated
6. Socket events emitted: `results:sync:*`, `event:scored`, `standings:update`
