# ADR 0012: F1 Dashboard Briefing History And Structured Content

Date: 2026-03-07

## Status

Accepted

## Context

ADR 0010 persisted only the latest dashboard briefing per participant. That fixed refresh and login durability, but it left several product gaps:

- participants could not revisit older race-weekend briefings
- the UI only had a single text blob, which limited readability
- the system could not label a briefing with race context like pre-race, live, or post-race
- future briefing modes such as qualifying would have required another persistence redesign

The dashboard briefing is now becoming a reusable participant feature rather than a one-off generated paragraph.

## Decision

Store dashboard briefings as append-only history entries with structured content.

Implementation:

1. Add `dashboard_briefing_entries` as the source-of-truth table
2. Persist one row per generated briefing instead of overwriting one latest row
3. Store:
   - `event_id`
   - `snapshot_hash`
   - `briefing_phase`
   - `briefing_title`
   - `briefing_summary`
   - `briefing_json`
   - `source`
   - `generated_at`
   - `updated_at`
4. Continue returning the latest saved briefing for convenience, but also return briefing history ordered newest-first
5. Render saved briefings from structured sections in the dashboard UI instead of a single large paragraph
6. Migrate legacy rows from `dashboard_briefings` into the new history table during schema initialization

## Consequences

Positive:

- participants can navigate prior weekend briefings
- briefings carry explicit race context like pre-race, live, and post-race
- the UI can stay readable because the content is sectioned and bullet-based
- future briefing phases such as qualifying can be added without replacing the storage model

Tradeoffs:

- persistence is more complex than the original single-row model
- the database now stores more generated content over time
- prompt design matters more because malformed structured output affects both persistence and rendering

## Rollback / Alternatives

Alternative considered:

- keep one latest briefing row and add a second archive blob column

Rejected because it still couples history shape to one row and does not scale cleanly to multiple weekend entries or future briefing phases.

Rollback:

- stop writing `dashboard_briefing_entries`
- continue reading only the latest row model
- collapse the UI back to one saved briefing card

## References

- [dashboardBriefingService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/dashboardBriefingService.js)
- [dashboardBriefingRepo.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/persistence/repositories/dashboardBriefingRepo.js)
- [schema.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/persistence/schema.js)
- [Dashboard.jsx](/Users/rmilton/Code/Calcutta-App/apps/f1/client/src/pages/Dashboard.jsx)
