# RUNBOOK.md

Last validated: 2026-03-05

## Purpose

Operational guide for deploying, validating, and recovering NCAA/F1 services.

## Service Inventory

- NCAA service: `apps/ncaa`
- F1 service: `apps/f1`

## Pre-Deploy Checklist

1. Confirm relevant tests pass.
2. Confirm app-scoped changes did not cross boundaries.
3. Confirm required env vars exist in Railway.
4. Confirm health endpoint is `/api/health`.
5. Download a fresh F1 database backup before auction night and before the first real race sync.

## Required Environment Variables

### NCAA

- `ADMIN_PASSWORD`
- `NODE_ENV=production`
- `DB_PATH=/data/calcutta.db`
- optional: `NCAA_CLIENT_ORIGIN`, `ANTHROPIC_API_KEY`

### F1

- `ADMIN_PASSWORD`
- `NODE_ENV=production`
- `DB_PATH=/data/f1-calcutta.db`
- `F1_RESULTS_PROVIDER=openf1`
- `OPENF1_USERNAME`
- `OPENF1_PASSWORD`
- optional: `F1_CLIENT_ORIGIN`, `F1_AUTO_POLL_ENABLED`, `F1_AUTO_POLL_INTERVAL_SECONDS`, `OPENF1_BASE_URL`, `OPENF1_TOKEN_URL`

## F1 Provider Defaults

1. Production should use `F1_RESULTS_PROVIDER=openf1`.
2. OpenF1 live-session windows can require authenticated backend requests even for historical endpoints.
3. `mock` is intended for local/dev/test only.
4. Do not set `F1_PORT` in Railway.
5. Keep `F1_AUTO_POLL_ENABLED=0` until one successful manual OpenF1 verification pass is complete.

## Deploy Validation

After deploy:

1. Check Railway deployment is healthy.
2. Hit `/api/health`.
3. Verify login flow works.
4. Verify one representative live socket action (join page/auction page connect).
5. Check logs for uncaught exceptions.

## Railway Notes

1. Use Railway `PORT` in production.
2. Keep SQLite on attached volume path (`/data/...`).
3. Service root/config must match app target.

## Incident Playbooks

### A) Healthcheck Failing

1. Inspect startup logs for thrown error.
2. Verify `PORT` and env vars.
3. Verify DB path points to mounted volume.
4. Roll back if fix is not immediate.

### B) False Deploy Failure On Stop

1. Check log timestamps and deployment ID.
2. Confirm whether error occurred in old deployment during shutdown replacement.
3. Validate current deployment health before action.

### C) SQLite Data Missing

1. Verify volume attachment.
2. Verify `DB_PATH` under `/data`.
3. Verify no accidental path changes in config.

### D) F1 Provider Sync Failing

1. Check `GET /api/admin/results/provider-status`.
2. Verify `F1_RESULTS_PROVIDER=openf1` in production.
3. Verify `OPENF1_USERNAME` and `OPENF1_PASSWORD` are set when OpenF1 returns live-session `401` responses.
4. Run admin `Refresh Drivers` and `Refresh Schedule` before syncing event results.
5. If OpenF1 returns `429`, wait briefly and retry; the F1 provider now serializes requests, spaces them, retries boundedly, and enforces a rolling minute budget, but repeated manual clicks can still queue work and extend refresh latency.
6. If provider responses are incomplete or unmapped, use manual results entry and do not force-score partial provider data.

### E) F1 Backup / Export

1. Open `Admin -> Results Sync`.
2. Use `Download DB Backup`.
3. Store the exported SQLite file before major live operations:
   - before auction night
   - before the first real race sync
   - before any destructive test-data reset

### F) F1 Payout Audit Export

1. Open `Admin -> Payout Audit`.
2. Select the event in question.
3. Use:
   - `Download CSV` for a shareable rule-by-rule export
   - `Download Winner CSV` for spreadsheet-friendly winner rows
   - `Copy Summary` for a concise plain-text explanation
4. Use these outputs when reviewing disputed race payouts with participants.

## Rollback Procedure

1. Open service Deployments in Railway.
2. Roll back to last healthy deployment.
3. Re-run health and login checks.
4. Open follow-up ADR/issue if root cause unclear.

## Escalation Signals

Escalate immediately when:

- scoring/payout outputs are incorrect
- auction state gets stuck or inconsistent
- repeated deploy failures occur with new deployment IDs
