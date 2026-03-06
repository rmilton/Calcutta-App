# ADR 0008: Preserve Unknown Race Drivers As Unowned Season Drivers

## Status

Accepted

## Context

The F1 app now relies on OpenF1 for live session rosters and event results. A live season can introduce substitute or replacement drivers after the auction roster is already fixed.

Before this change, event sync mapped provider result rows only against the season's existing `drivers.external_id` values. Unknown provider drivers were dropped during `upsertEventResults`, which meant:

- substitute/new drivers could disappear from synced race results
- event scoring could become partial or misleading
- the intended house rule of "no owner means undistributed payout" could not be represented correctly

## Decision

When provider event results include a driver not present in the current season roster:

1. Insert that driver into `drivers` for the season
2. Mark the inserted row as `active = 0`
3. Do not create an `auction_items` row for that driver
4. Allow `event_results` and scoring to reference the driver normally
5. Leave payout ownership unresolved unless an `ownership` row exists

This makes substitute/new drivers explicit in the season data model while keeping them out of the auctionable roster.

## Consequences

Positive:

- event results remain complete even when the real race lineup changes
- payout logic can correctly treat substitute-driver winners as unowned/undistributed
- auction queue and participant ownership remain stable after the auction starts

Tradeoffs:

- `drivers.active` now carries an additional semantic: inactive can mean "non-auction substitute/new race driver", not just "not part of the auction roster"
- admin tooling that only reads active drivers will not show substitute drivers in the main auction roster
- if future product rules require manual assignment of substitute-driver ownership, a dedicated admin workflow will still be needed
