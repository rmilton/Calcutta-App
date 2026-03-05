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
- optional: `F1_CLIENT_ORIGIN`, `F1_RESULTS_PROVIDER`

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
