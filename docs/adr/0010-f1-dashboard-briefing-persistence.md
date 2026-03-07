# ADR 0010: F1 Dashboard Briefing Persistence

Date: 2026-03-07

## Status

Accepted

## Context

The F1 dashboard introduced an on-demand Anthropic briefing, but the initial implementation only cached generated text in process memory and tied the client display to a volatile dashboard snapshot hash.

That created two problems:

- the text could disappear after a routine refresh because live-session timestamps changed
- the text did not survive page refreshes, process restarts, or logout/login cycles

For a participant-facing dashboard feature, the most recent generated briefing should behave like saved state, not like ephemeral UI cache.

## Decision

Persist the latest dashboard briefing per `season_id + participant_id` in the F1 database.

Implementation:

1. Add a `dashboard_briefings` table keyed by `(season_id, participant_id)`
2. Store:
   - `event_id`
   - `snapshot_hash`
   - `briefing_text`
   - `source`
   - `generated_at`
   - `updated_at`
3. Return the saved briefing on every `GET /api/standings/dashboard`
4. Keep the in-memory cache as a short-lived optimization, but treat SQLite as the source of truth
5. Build the snapshot hash from stable dashboard fields only; do not include volatile refresh timestamps

## Consequences

Positive:

- briefing text survives refreshes and auth round-trips
- dashboard UX becomes predictable during live polling
- the latest participant briefing is recoverable after process restarts

Tradeoffs:

- adds one more persisted F1 table and maintenance surface
- only the latest briefing is retained; no historical archive is stored

## Rollback / Alternatives

Alternative considered:

- keep briefings in memory only and loosen client invalidation rules

Rejected because it still loses data on restart and does not meet the persistence requirement.

Rollback:

- stop reading/writing `dashboard_briefings`
- fall back to stateless on-demand generation

## References

- [Dashboard.jsx](/Users/rmilton/Code/Calcutta-App/apps/f1/client/src/pages/Dashboard.jsx)
- [dashboardBriefingService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/dashboardBriefingService.js)
- [schema.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/persistence/schema.js)
