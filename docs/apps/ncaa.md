# NCAA App Snapshot

Last validated: 2026-03-05

## Scope

- Runtime paths: `apps/ncaa/client`, `apps/ncaa/server`
- Deployment target: NCAA Railway service

## Current Behavior Highlights

- Live auction, bracket progression, standings, and admin workflows are operational.
- Styling changes should remain conservative unless explicitly requested.

## Key Runtime Modules

- `apps/ncaa/server/index.js`
- `apps/ncaa/server/db.js`
- `apps/ncaa/server/services/auctionService.js`
- `apps/ncaa/server/routes/*`

## Deployment Notes

- Health: `/api/health`
- Persistent DB path: `DB_PATH=/data/calcutta.db`

## Work Guardrails

- Avoid touching F1 runtime code for NCAA-only work.
