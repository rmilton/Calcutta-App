# ADR 0014: F1 Pit Stop Scoring Uses Formula 1 LiveTiming Static Feed

Date: 2026-03-08

## Status

Accepted

## Context

The F1 app introduced a `slowest_pit_stop` novelty payout rule based on stopped pit duration.

The original implementation sourced this value from OpenF1 `pit.stop_duration`. During the
2026 Australian Grand Prix, OpenF1 returned pit rows but `stop_duration` was null for the full
session, which made the rule unscorable even though other public data sources showed stopped pit
times for the race.

Formula 1 LiveTiming exposes a static season `Index.json` and per-session `PitStopSeries.json`
payloads that include `PitStopTime` values per driver stop event.

## Decision

For F1 event sync:

1. OpenF1 remains the primary source for:
   - schedule
   - driver roster
   - classified results
2. Formula 1 LiveTiming becomes the preferred source for stopped pit duration:
   - resolve session path from season `Index.json`
   - read `PitStopSeries.json`
   - compute the maximum `PitStopTime` per driver for the synced session
3. If the LiveTiming static feed is unavailable for a session, fall back to OpenF1
   `pit.stop_duration`.
4. If neither source produces a stopped pit duration, the rule remains unresolved and admin
   manual override remains the operational fallback.

## Consequences

Positive:

- The `slowest_pit_stop` rule now has a reliable stopped-duration source even when OpenF1
  omits `stop_duration` for a race.
- Event sync no longer fails or produces empty pit-stop scoring for races like 2026 Australia.

Tradeoffs:

- The app now depends on an additional undocumented public data surface from Formula 1
  LiveTiming.
- The session path must be resolved dynamically from the season index rather than guessed from
  event names.
- Manual override remains necessary if both external data surfaces are incomplete.
