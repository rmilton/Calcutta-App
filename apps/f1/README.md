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
- Optional auto-poll:
  - `F1_AUTO_POLL_ENABLED=1`
  - `F1_AUTO_POLL_INTERVAL_SECONDS=<seconds>`
- Local/dev/test may continue using `mock`
- Admin Test Data page can load a 2025 OpenF1 driver/event dataset for pre-2026 flow testing
- Admin Test Data page can rescore all scored events after payout-rule changes

## Engineering Docs

For current architecture, operations, and agent workflows, use repo-root docs:

- `/AGENTS.md`
- `/ARCHITECTURE.md`
- `/RUNBOOK.md`
- `/docs/apps/f1.md`
