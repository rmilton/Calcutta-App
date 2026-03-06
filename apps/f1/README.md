# F1 Calcutta App

A dedicated Formula 1 Calcutta app for a full season pool.

## Features

- Live driver auction (real-time via Socket.io)
- Auction queue shuffled randomly once per season, with admin reshuffle for pending drivers
- Admin-configurable per-participant auction budget cap (default $200)
- Event-by-event payouts using percentage-of-pool rules
- Grand Prix and Sprint scoring categories
- Auto-drawn random finishing position bonus per event
- Grand Prix novelty rule for slowest recorded pit stop via OpenF1 `stop_duration`
- Season bonus payouts from remaining pool
- Results sync via provider adapter (`openf1` for real data, `mock` for local/dev/test)
- Admin controls for auction, sync, payout rules, and settings
- Results Sync admin view shows collapsible driver/event lists after provider refreshes
- Public-facing explainer pages for both pool rules (`/guide`) and the agentic build case study (`/built-with-ai`)

## Run

```bash
npm install
npm run dev
```

Client: `http://localhost:5174`
Server: `http://localhost:3002`

## Core endpoints

- `GET /api/events`
- `GET /api/events/:id/payouts`
- `POST /api/admin/results/sync-next`
- `POST /api/admin/results/sync-event/:id`
- `POST /api/admin/results/refresh-drivers`
- `POST /api/admin/results/refresh-schedule`
- `GET /api/admin/results/provider-status`
- `PATCH /api/admin/results/event/:id`
- `PATCH /api/admin/payout-rules`

## Runtime Notes

- Production provider: `F1_RESULTS_PROVIDER=openf1`
- OpenF1 live-session access now requires backend auth:
  - `OPENF1_USERNAME`
  - `OPENF1_PASSWORD`
- optional token override: `OPENF1_TOKEN_URL`
- Driver refresh now uses the latest started non-testing OpenF1 session roster and falls back from session_key to meeting_key lookups when a live session roster is not yet populated; if 2026 weekend data is still unavailable, admin will see a clear "no populated driver roster yet" message instead of a raw provider 404
- Event result sync now preserves unknown substitute/new race drivers by inserting them as inactive season drivers with no auction item; their results still score, but any resulting payouts remain unowned/undistributed unless an owner exists
- If the active season has no bids, ownership, or scored race data yet, driver refresh can now rebuild the season roster directly from OpenF1 when the provider lineup has drifted from the seeded 2026 driver list
- OpenF1 requests are now serialized, spaced, bounded-retried on `429`, and limited against a rolling per-minute budget to match the provider's published rate limits more closely
- Optional auto-poll:
  - `F1_AUTO_POLL_ENABLED=1`
  - `F1_AUTO_POLL_INTERVAL_SECONDS=<seconds>`
- Local/dev/test may continue using `mock`
- Admin Test Data page can load a 2025 OpenF1 driver/event dataset for pre-2026 flow testing
- Admin Test Data page can restore the canonical seeded 2026 F1 drivers and events for recovery from polluted local metadata
- Admin Test Data page can reset only auction state while keeping participants and scored race data
- Admin Test Data page can rescore all scored events after payout-rule changes

## Engineering Docs

For current architecture, operations, and agent workflows, use repo-root docs:

- `/AGENTS.md`
- `/ARCHITECTURE.md`
- `/RUNBOOK.md`
- `/docs/apps/f1.md`
