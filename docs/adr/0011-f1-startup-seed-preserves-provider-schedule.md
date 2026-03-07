# ADR 0011: F1 Startup Seed Preserves Provider Schedule

Date: 2026-03-07

## Status

Accepted

## Context

The F1 server seeds a canonical 2026 schedule at startup so a new database has usable events before any provider sync runs.

That startup path previously used an unconditional event upsert keyed by `season_id + round_number + type`. After an admin ran `Refresh Schedule`, later process restarts could overwrite provider-corrected event names and timestamps with the older mock-seeded values.

The failure mode was subtle:

- admin refresh fixed the schedule immediately
- the app looked correct until the next restart or deploy
- startup then silently reverted rows back to seeded values

For the schedule to remain trustworthy, provider-refreshed rows must win over seed data after startup.

## Decision

Treat seeded F1 events as bootstrap defaults only, not as authoritative updates.

Implementation:

1. Keep seeding events during startup for empty or still-mock rows
2. Only let seed upserts update rows whose `external_event_id` is missing or still marked as `mock-*`
3. Preserve provider-refreshed rows once a real provider event id has been written
4. Refresh the canonical `events2026` seed list so a brand-new database still starts from a current 2026 schedule

## Consequences

Positive:

- manual schedule refresh now survives restart and deploy cycles
- startup still repairs drift in mock-seeded local/test data
- a fresh database still gets a usable 2026 event calendar before the first provider call

Tradeoffs:

- seed data is no longer a blunt source of truth for already-synced rows
- correcting provider-backed events now requires another provider refresh or direct admin intervention, not just a restart

## Rollback / Alternatives

Alternative considered:

- stop seeding events after first boot entirely

Rejected because local/dev/test flows still benefit from deterministic seed data and admin reset tooling depends on it.

Rollback:

- remove the mock-row guard from event seed upserts
- accept that startup can overwrite provider schedule data again

## References

- [seed.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/persistence/seed.js)
- [events2026.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/data/events2026.js)
- [resultsAdminService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/admin/resultsAdminService.js)
