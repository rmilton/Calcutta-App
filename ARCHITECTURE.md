# ARCHITECTURE.md

Last validated: 2026-03-05

## System Context

This monorepo contains two independent real-time web systems:

- NCAA Calcutta (`apps/ncaa`)
- F1 Calcutta (`apps/f1`)

Both have:

- React client (Vite)
- Node/Express server
- Socket.io for live state updates
- SQLite persistence
- Railway deployment target

## Repository Structure

- `apps/ncaa/client`: NCAA frontend
- `apps/ncaa/server`: NCAA backend + domain logic
- `apps/f1/client`: F1 frontend
- `apps/f1/server`: F1 backend + domain logic
- `packages/core`: shared, app-agnostic helpers
- `docs/adr`: architecture decision records

## Boundary Rules

1. Runtime code in `apps/ncaa` must not import from `apps/f1`.
2. Runtime code in `apps/f1` must not import from `apps/ncaa`.
3. Shared logic must live in `packages/core` and remain domain-neutral.
4. `apps/f1/server` remains self-contained for subdirectory deploy compatibility.

## Data Ownership

- NCAA server owns NCAA schema and lifecycle.
- F1 server owns F1 schema and lifecycle.
- No shared runtime database.

## Deployment Topology (Railway)

- Separate service per app.
- Health endpoint: `/api/health`.
- Persistent volume-backed SQLite paths via `DB_PATH`.

## Runtime Reliability Requirements

1. Service must listen on platform-provided `PORT` in production.
2. Graceful shutdown must be idempotent under `SIGTERM`/`SIGINT`.
3. Orchestrator replacement stops must not be treated as deployment failures.

## Current Architectural Notes

- F1 persistence was decomposed into:
  - `persistence/connection`
  - `persistence/schema`
  - `persistence/seed`
  - `persistence/migrations`
  - `persistence/repositories/*`
- F1 `db.js` remains compatibility facade.
- F1 admin routing decomposed into domain services.

## Evolution Model

When architecture changes:

1. Write/update ADR.
2. Update this file with resulting steady-state architecture.
3. Update `HEARTBEAT.md` if operational behavior changed.
