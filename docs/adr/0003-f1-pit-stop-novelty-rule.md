## Status

Accepted - 2026-03-05

## Context

The F1 event payout model originally used `second_most_positions_gained` as a Grand Prix rule.
That category overlapped too heavily with `most_positions_gained` and did not create a meaningfully different payout experience.

For the first season, the product direction is to allow one deliberate novelty/chaos category as long as:

1. the data source is explicit,
2. the scoring is deterministic,
3. the payout audit can explain the outcome.

OpenF1 documents pit-stop `stop_duration` under its pit endpoint. The metric is imperfect as a pure racing-performance signal, but it is well-defined enough for a novelty rule when surfaced transparently.

## Decision

Replace the F1 Grand Prix payout rule `second_most_positions_gained` with `slowest_pit_stop`.

Implementation semantics:

1. Source: OpenF1 `pit` endpoint `stop_duration`
2. Stored per driver per event as `event_results.slowest_pit_stop_seconds`
3. Winner: driver with the highest recorded pit-stop duration in that event
4. Drivers without a recorded pit stop are excluded
5. Ties split using the existing even-cent split logic
6. Manual test-data entry may provide this value directly

## Consequences

Positive:

1. The GP rule set becomes more distinct and intentionally chaotic.
2. The rule remains auditable because the stored per-driver value is explicit.
3. The app can still score historical/manual events without live provider calls.

Negative:

1. The rule rewards an operational mishap rather than a performance outcome.
2. OpenF1 pit-stop coverage may be absent for some sessions, which means the category can resolve to no winner.
3. Existing scored events that used the removed category may need rescore/reset if strict consistency is required.
