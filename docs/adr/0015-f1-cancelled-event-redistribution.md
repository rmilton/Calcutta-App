# ADR 0015: F1 Cancelled Event Redistribution And Snapshotting

Date: 2026-03-10

## Status

Accepted

## Context

The F1 app originally assumed the seeded schedule would fully run. If a race or sprint is cancelled, the previous model creates two problems:

- the cancelled event can block season bonus payout readiness because it never becomes `scored`
- the cancelled event's share of the pot can become stranded, leaving less than 100% of the pot paid out

The app also needs to preserve already-scored event history. A later cancellation should not claw back or recompute past earned payouts.

## Decision

Adopt explicit cancelled-event handling with prospective redistribution only.

Implementation:

1. Add `cancelled` as an F1 event lifecycle state plus `cancelled_at`.
2. Cancellation is manual admin-only.
3. Cancelling an unscored event clears its unscored results/random draw and creates redistribution ledger rows:
   - to future unscored same-type events when any remain
   - otherwise to season bonuses
4. Restoring a cancelled event removes only that event's outbound redistribution rows and returns it to `pending`.
5. Score future events using:
   - the base event payout model
   - plus any inbound redistribution ledger value already assigned to that event
6. Persist per-category payout snapshots when an event is scored so audit/history remains stable even after later cancellations.
7. Season bonus readiness excludes cancelled scoring events.

## Consequences

Positive:

- 100% of the pot remains payable even when events are cancelled
- already-scored event payouts remain immutable unless an admin explicitly rescoring action is used
- admin operators can cancel/restore events without direct database edits
- payout audit stays historically accurate after later schedule changes

Tradeoffs:

- payout state now depends on redistribution ledger rows, not only static rules plus event results
- cancellation and restore are operationally significant admin actions and should be done deliberately
- season bonus totals can increase when the last remaining event of a type is cancelled

## Rollback / Alternatives

Alternatives considered:

- recompute all past events after every cancellation
- delete missing provider events automatically and infer cancellation from provider schedule drift
- leave cancelled-event money undistributed

Rejected because:

- recomputing past payouts rewrites participant history
- provider-driven deletion is too implicit for money movement
- undistributed money violates the desired full-pot payout policy

Rollback:

- remove cancelled-event status and redistribution ledger
- return to static event/season payout totals
- accept that cancelled events either strand pot value or require manual data repair

## References

- [resultsAdminService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/admin/resultsAdminService.js)
- [scoringService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/scoringService.js)
- [payoutRedistributionService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/payoutRedistributionService.js)
- [payoutAuditService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/payoutAuditService.js)
