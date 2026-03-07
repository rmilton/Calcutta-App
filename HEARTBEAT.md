# HEARTBEAT.md

Last updated: 2026-03-07
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
- F1 Results Sync now exposes a DB backup/export path and a visible driver-roster freeze guard once auction or scoring activity exists.
- F1 now has an explicit season roster lock setting in admin so post-auction driver refresh policy is visible and deliberate.
- F1 participant navigation now centers on `/dashboard`, which combines personal standings, full league standings, and current-or-next scoring-session race context.
- F1 dashboard now supports brief live OpenF1 session snapshots with short-lived caching and an optional on-demand Anthropic participant briefing.
- The latest F1 dashboard briefing is now persisted per participant so it survives polling refreshes, logout/login, and process restarts.
- F1 post-auction participant login is now locked to the existing season roster; unmatched invite-code joins fail closed and admin can issue/reset direct participant access links from the Auction page.
- F1 startup seeding now preserves provider-refreshed schedule rows across restart/deploy cycles instead of silently reverting them to mock seed dates.

## Active Priorities

1. Confirm Railway deploy health with `F1_RESULTS_PROVIDER=openf1` plus OpenF1 credentials in production.
2. Validate F1 driver and schedule refresh against live provider data before relying on event sync.
3. Keep docs as single source of truth (no drift back into handoff files).
4. Use DB backup export before auction night and before first live scoring operations.
5. Lock the season roster explicitly after the real auction is complete.

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
5. Fixed F1 startup schedule seeding so provider-refreshed event dates persist after restart/deploy.

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
