# HEARTBEAT.md

Last updated: 2026-03-05
Owner: On-call engineer / active implementer

## Status At A Glance

- Repo state: dual-app monorepo (NCAA + F1)
- Deploy posture: Railway per-app services
- Reliability note: shutdown handling hardened for orchestrator stop cycles

## Current Reality

### NCAA

- Core auction/bracket flows are stable.
- Styling is intentionally conservative.
- Service shutdown path updated to avoid false-failure exits during orchestrator stop.

### F1

- Admin center is modularized (`useAdminData`, admin service modules, persistence split).
- Scoring/payout engine tests passing.
- Service shutdown path updated to avoid false-failure exits during orchestrator stop.

## Active Priorities

1. Confirm Railway deploy health with new deployment IDs after shutdown hardening.
2. Keep docs as single source of truth (no drift back into handoff files).
3. Maintain strict app boundary discipline.

## Known Risks / Watch Items

1. Railway logs can show historical deployment errors; always verify by deployment ID and timestamp.
2. Startup/shutdown race conditions are sensitive to environment timing; monitor first deploy after changes.
3. Shared package changes can cause silent cross-app impact if not scoped carefully.

## Recent Completed Work

1. Introduced docs control plane (`AGENTS`, `SOUL`, `HEARTBEAT`, `ARCHITECTURE`, `DESIGN`, `RUNBOOK`, ADRs).
2. Converted handoff docs to compatibility stubs.
3. Hardened NCAA/F1 shutdown behavior to avoid false deployment-failure exits.

## Next Suggested Actions

1. Trigger one NCAA deploy and one F1 deploy, then verify stop/start logs for clean exits.
2. Add follow-up ADR if additional Railway-specific behavior is discovered.
3. Enforce docs update check in PR template (optional but recommended).

## Update Protocol

Update this file when any of these change:

- production reliability posture
- deployment/runtime assumptions
- current top risks
- active priorities

Each update should be short, dated, and factual.
