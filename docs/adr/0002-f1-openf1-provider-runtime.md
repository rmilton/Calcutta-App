# 0002 F1 OpenF1 Provider Runtime

## Status

Accepted

## Context

The F1 app previously relied on a mock-only results provider. That was sufficient for UI and scoring development, but not for running the pool against real race data. The app needed a production-capable ingestion path for:

- season driver metadata
- season schedule/session metadata
- classified event results with starting-grid context

The existing admin result sync flow and scoring engine were already structured around a provider abstraction. The missing pieces were a real provider implementation, operational controls for refreshing metadata, and safe production behavior when provider calls fail.

## Decision

The F1 app now supports a real `openf1` results provider behind the existing provider adapter boundary.

The runtime model is:

1. Production uses `F1_RESULTS_PROVIDER=openf1`.
2. `mock` remains available for local/dev/test only.
3. Driver and schedule metadata refresh are explicit admin actions.
4. Event result sync remains admin-triggered by default.
5. Optional server-side auto-poll may call the same sync path when enabled by env var.
6. Provider failures fail closed and surface in admin status rather than silently scoring mock or partial data.
7. Provider refresh and auto-poll state are persisted in `provider_sync_state`.

## Consequences

Positive:

- Real F1 data can be ingested without changing the core scoring engine.
- Admins can refresh drivers and schedule independently of event scoring.
- Production behavior is explicit and safer than silent fallback.
- Auto-poll can be enabled later without changing the scoring contract.

Tradeoffs:

- Event and driver mapping now depend on OpenF1 field stability.
- Metadata refresh is an operational step that must happen before live syncing if mappings drift.
- Auto-poll adds a long-lived server loop, so it remains opt-in.

## Rollback / Alternatives

Rollback:

1. Disable `F1_AUTO_POLL_ENABLED`.
2. Continue using manual results entry if provider incidents occur.
3. Use `mock` only in local/dev/test, not production.

Rejected alternatives:

1. Silent production fallback from `openf1` to `mock`
   - Rejected because it can create incorrect payouts with false confidence.
2. Automatic metadata refresh on startup
   - Rejected because it introduces hidden startup side effects and deploy-time drift.
3. Provider-specific scoring path
   - Rejected because it would duplicate winner resolution and payout behavior.

## References

- `/apps/f1/server/providers/openF1ResultsProvider.js`
- `/apps/f1/server/services/admin/resultsAdminService.js`
- `/apps/f1/server/services/resultsAutoPollService.js`
- `/apps/f1/server/routes/admin.js`
- `/apps/f1/client/src/pages/admin/ResultsPage.jsx`
