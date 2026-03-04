# F1 Calcutta App

A dedicated Formula 1 Calcutta app for a full season pool.

## Features

- Live driver auction (real-time via Socket.io)
- Event-by-event payouts using percentage-of-pool rules
- Grand Prix and Sprint scoring categories
- Auto-drawn random finishing position bonus per event
- Season bonus payouts from remaining pool
- Results sync via provider adapter (`mock` provider included)
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
- `PATCH /api/admin/results/event/:id`
- `PATCH /api/admin/payout-rules`
