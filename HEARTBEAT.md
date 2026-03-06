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
- Results provider layer now supports OpenF1, admin-triggered driver/schedule refresh, and optional result auto-poll.
- OpenF1 live-session windows now require backend auth support with cached token refresh via `OPENF1_USERNAME` / `OPENF1_PASSWORD`.
- F1 driver refresh now supports an authoritative pre-auction roster rebuild from OpenF1 when the seeded 2026 lineup drifts from live provider data and the season has no auction/scoring activity yet.
- F1 driver refresh now pulls the latest started non-testing session roster and falls back from `session_key` to `meeting_key` roster lookups when a live session weekend has started but the session-level roster is not populated yet.
- F1 event sync now preserves unknown substitute/new race drivers as inactive, non-auction season drivers so event scoring can mark their payouts as unowned instead of dropping their result rows.
- F1 OpenF1 access now rate-limits outbound provider calls against both short-burst and rolling minute windows to reduce `429` failures during admin refresh/sync operations.

## Active Priorities

1. Confirm Railway deploy health with `F1_RESULTS_PROVIDER=openf1` plus OpenF1 credentials in production.
2. Validate F1 driver and schedule refresh against live provider data before relying on event sync.
3. Keep docs as single source of truth (no drift back into handoff files).

## Known Risks / Watch Items

1. Railway logs can show historical deployment errors; always verify by deployment ID and timestamp.
2. OpenF1 field stability now affects driver/event mapping; mismatches fail closed and require admin correction.
3. OpenF1 can reject unauthenticated requests during live sessions, so missing credentials now presents as provider-side `401` failures.
4. Auto-poll should remain opt-in until one production verification pass is complete.
5. Shared package changes can cause silent cross-app impact if not scoped carefully.

## Recent Completed Work

1. Introduced docs control plane (`AGENTS`, `SOUL`, `HEARTBEAT`, `ARCHITECTURE`, `DESIGN`, `RUNBOOK`, ADRs).
2. Converted handoff docs to compatibility stubs.
3. Hardened NCAA/F1 shutdown behavior to avoid false deployment-failure exits.
4. Added F1 OpenF1 provider integration with provider diagnostics, metadata refresh controls, optional auto-poll, and live-session auth support.

## Next Suggested Actions

1. Run one F1 deploy with `F1_RESULTS_PROVIDER=openf1`, `OPENF1_USERNAME`, and `OPENF1_PASSWORD`, then verify `/api/admin/results/provider-status`.
2. Refresh F1 drivers and schedule once in admin, then confirm event mappings before syncing results.
3. Add follow-up ADR if additional Railway-specific behavior is discovered.

## Update Protocol

Update this file when any of these change:

- production reliability posture
- deployment/runtime assumptions
- current top risks
- active priorities

Each update should be short, dated, and factual.
