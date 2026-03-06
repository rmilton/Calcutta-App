# 0009: F1 Explicit Season Roster Lock

Date: 2026-03-06

## Status

Accepted

## Context

The F1 app already had implicit safeguards that made driver refreshes unsafe once auction or scoring activity existed. That protected data integrity, but it left the operating policy ambiguous:

- admins could still see refresh controls without a clear season-level lock state
- the freeze behavior was inferred from activity, not explicitly declared
- production operation after auction night benefits from a deliberate, visible roster lock

For a live season product, roster stability should be an explicit operational choice.

## Decision

Add a season-level `auction_roster_locked` flag on `seasons`.

Behavior:

1. Default is unlocked (`0`)
2. Admins can explicitly lock or unlock the season roster from the F1 auction admin page
3. Provider status exposes a `driver_roster_guard`
4. The guard reports frozen when either:
   - the roster is explicitly locked, or
   - auction/scoring activity already exists
5. Results Sync disables `Refresh Drivers` whenever that guard is frozen

This makes the season roster policy explicit instead of relying only on inferred activity state.

## Consequences

Positive:

- clearer production operating posture
- safer post-auction workflow
- admin UI now communicates roster stability directly

Tradeoffs:

- introduces one more season setting to manage
- unlocking remains possible, so operators still need discipline

## Notes

This does not replace existing backend safety checks around authoritative roster rebuilds. It adds a clearer operating control on top of them.
