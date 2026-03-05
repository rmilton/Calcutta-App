# Calcutta Monorepo - Developer Handoff

This is the top-level handoff for the repository. It explains the split architecture and where to make changes.

## Repository split

The repo now contains two independent web apps:

- `apps/ncaa`: March Madness Calcutta app (legacy app, existing UI styling preserved)
- `apps/f1`: Formula 1 season Calcutta app (new product, separate domain model/UI)

Shared code exists in:

- `packages/core`: generic helper functions used by repo tooling and local development

Important: `apps/f1/server` is intentionally self-contained for Railway subdirectory deploys. Do not add runtime imports from outside `apps/f1` unless the deploy strategy changes.

## Monorepo layout

- `apps/ncaa/server`: NCAA API, socket events, SQLite domain logic
- `apps/ncaa/client`: NCAA React frontend (Tailwind)
- `apps/f1/server`: F1 API, socket events, scoring engine, provider adapter
- `apps/f1/client`: F1 React frontend (custom telemetry-dark CSS)
- `packages/core`: shared money/auth/auction helpers
- `.github/workflows/ci.yml`: split CI jobs (`ncaa`, `f1`, style-freeze check)
- `scripts/check-ncaa-style-freeze.sh`: guard against accidental NCAA style changes

## Running locally

From repo root:

- NCAA only: `npm run dev:ncaa`
- F1 only: `npm run dev:f1`
- Both: `npm run dev`

Default local ports:

- NCAA server/client: `3001` / `5173`
- F1 server/client: `3002` / `5174`

Env overrides supported:

- NCAA: `NCAA_PORT`, `NCAA_CLIENT_ORIGIN`
- F1: `F1_PORT`, `F1_CLIENT_ORIGIN`, `F1_RESULTS_PROVIDER`

## Testing/building

From repo root:

- All tests: `npm run test`
- NCAA tests only: `npm run test:ncaa`
- F1 tests only: `npm run test:f1`
- All builds: `npm run build`
- NCAA style freeze check: `npm run check:ncaa-style-freeze`

## Deployment (Railway)

### NCAA service

- Use root `railway.toml` or `apps/ncaa/railway.toml`
- Healthcheck: `/api/health`
- DB path should be on volume, e.g. `DB_PATH=/data/calcutta.db`

### F1 service

- Service root: `apps/f1`
- Config file: `apps/f1/railway.toml`
- Healthcheck: `/api/health`
- DB path should be on volume, e.g. `DB_PATH=/data/f1-calcutta.db`
- Build must install both server and client deps (already configured in `apps/f1/railway.toml`)

Railway port guidance:

- In production, prefer Railway-provided `PORT`
- Do not force a fixed local dev port in Railway env unless necessary

## Change targeting rules

When requesting updates, always scope explicitly:

- NCAA only: modify `apps/ncaa/**` only
- F1 only: modify `apps/f1/**` only
- Shared only when required: `packages/core/**`

Suggested request format:

- `[NCAA] ... Only touch apps/ncaa/**.`
- `[F1] ... Only touch apps/f1/**.`

## Current product status

### NCAA

- Existing March Madness behavior retained
- Existing visual system intentionally preserved
- CI guard prevents unintended NCAA styling edits

### F1

- Auction + ownership + standings implemented
- Admin center split into routed subpages:
  - `/admin/overview`
  - `/admin/auction`
  - `/admin/results`
  - `/admin/test-data`
  - `/admin/payouts`
- Event results sync implemented via provider adapter (`mock` provider default), triggered by admin actions
- Deterministic scoring engine implemented with payout model V2:
  - GP payouts total `350 bps` (3.5%)
  - Sprint payouts total `150 bps` (1.5%)
  - Season bonuses total `700 bps` (7.0%)
  - Ties split evenly in cents
  - Random finish bonus draw constrained to positions `4-20` (no podium)
  - Season random standing-position bonus persisted on season record
- Events page supports upcoming/past toggle, payouts/results tabs, race pot + total pot, and per-line payout percentage
- Team logos and team-color identity system integrated across core F1 screens

## App-specific docs

- NCAA deep-dive: `apps/ncaa/HANDOFF.md`
- F1 deep-dive: `apps/f1/HANDOFF.md`
- F1 roadmap ideas (including AI features): see `apps/f1/HANDOFF.md` section `Next Feature Ideas (Prioritized)`

## Operator Runbook

### Daily operations

1. Check both service health endpoints:
   - NCAA: `https://<ncaa-domain>/api/health`
   - F1: `https://<f1-domain>/api/health`
2. Verify both services show healthy in Railway deployments.
3. Confirm volume mounts remain attached at `/data`.

### Deploy checklist (after merge)

1. Ensure NCAA service points to root config (`/railway.toml`) or `apps/ncaa/railway.toml`.
2. Ensure F1 service root is `apps/f1` and config path is `apps/f1/railway.toml`.
3. Redeploy NCAA service, then F1 service.
4. Validate app UI and health endpoints after each deploy.

### Required env vars by service

- NCAA:
  - `ADMIN_PASSWORD`
  - `NODE_ENV=production`
  - `DB_PATH=/data/calcutta.db`
  - optional `ANTHROPIC_API_KEY`

- F1:
  - `ADMIN_PASSWORD`
  - `NODE_ENV=production`
  - `DB_PATH=/data/f1-calcutta.db`
  - optional `F1_RESULTS_PROVIDER=mock`
  - avoid setting `F1_PORT` in Railway unless needed

### Railway networking/domain guidance

1. Generate domain per service in the service's **Networking** tab.
2. Use target port `8080` (or Railway-provided `PORT` value shown in service variables).
3. Keep health check path `/api/health`.

### Common failure modes and fixes

- `MODULE_NOT_FOUND` for files outside app root (F1):
  - Cause: subdirectory deploy cannot resolve imports outside `apps/f1`.
  - Fix: keep runtime imports self-contained within `apps/f1`.

- Healthcheck failed immediately after deploy:
  - Check deploy logs for startup exception.
  - Ensure service listens on Railway `PORT` (not hardcoded local port).
  - Verify health path is `/api/health`.

- SQLite reset/lost data:
  - Confirm volume is attached to correct service.
  - Confirm `DB_PATH` points to `/data/...`.

- NCAA loads but F1 fails (or vice versa):
  - Verify service root/config path and build command for the failing service.

### Rollback procedure

1. In Railway, open failing service -> Deployments.
2. Select last known healthy deployment and rollback.
3. Re-verify `/api/health` and basic login flow.
4. Open a follow-up fix PR before attempting forward deploy again.
