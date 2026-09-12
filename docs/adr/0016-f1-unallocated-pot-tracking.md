# ADR 0016: F1 Unallocated Pot Tracking

Date: 2026-09-06

## Status

Accepted

## Context

The F1 payout rules earmark exactly 100% of the pot across a season (24 grand prix x 350 bps + 6 sprint x 150 bps + 700 season-bonus bps = 10,000 bps). Scoring only writes payout rows for winners that have an owner (`scoreEvent` and `recalcSeasonBonuses` both skip a winner when `ownershipMap` has no entry). When a category is won by an unauctioned substitute driver (ADR 0008) or when no driver satisfies a rule, that category's share is computed and then never disbursed.

Before this change the only trace of that money was the per-event `undistributed_cents` figure inside a single event's Payout Audit. There was no season total, no participant-facing visibility, and no place to decide what happens to the accumulated amount. Real driver-market churn (injury cover, reserve call-ups) makes this a recurring rather than hypothetical gap.

The league's intent is to track the amount across the season and decide its disposition at season end based on the total (e.g. hosting costs, an even distribution, or a new payout category).

## Decision

Add a derived, read-only "Unallocated Pot" view. No new tables, no migration, no change to any write path.

Implementation:

1. `unallocatedPotService.js` computes leakage from existing state:
   - Per scored scoring event: `SUM(event_payout_snapshots.category_pot_cents) - SUM(event_payouts.amount_cents)`, clamped at zero. This tier-1 figure is authoritative (pool allocated minus pool paid).
   - For flagged events only, a tier-2 per-category breakdown reuses `buildEventPayoutAudit` for status text and unowned-winner identification.
   - Season bonuses: while `isSeasonBonusReady` is false the bonus pool is reported as `pending`, not unallocated. Once the season is complete, bonus leakage is `effectiveTotalCents - SUM(season_bonus_payouts.amount_cents)`, with a per-category breakdown built from the exported `resolveSeasonBonusWinners` / `getChampionshipStandings` / `getAllSeasonResultRows` helpers.
2. Explicitly excluded: pending/`results_loaded` events (future money), cancelled events (value already moves via `event_redistributions` per ADR 0015), and even-split rounding remainders.
3. `GET /api/admin/payouts/unallocated` and `/export.csv` back an admin "Unallocated" tab under Payouts.
4. The participant dashboard payload carries `summary.unallocatedPot = { totalCents, isFinal }`; the dashboard renders a headline panel only when `totalCents > 0`.
5. The figure recomputes on every admin data load and every dashboard poll, so re-syncing a race or assigning ownership to a substitute self-corrects it with no manual reversal.

## Consequences

Positive:

- The gap between "100% earmarked" and "actually paid" is now a single visible number for admins and participants.
- Derivation means cancellations, rescores, and ownership fixes are reflected automatically.
- The season-end disposition decision can be made against a real total, and the CSV gives a line-item record.

Tradeoffs:

- `scoringService.js` now exports three previously-private season-bonus helpers.
- The tier-2 breakdown inherits `buildEventPayoutAudit`'s category-key assumption (no `rank_order` in `event_payouts`); harmless with the default rule set, noted as a follow-up.
- The number is informational only. Actually moving the money (rollover category, redistribution, external use) remains a manual, deliberate action.

## Rollback / Alternatives

Alternatives considered:

- A stored leakage ledger written during scoring. Rejected: needs manual reversal on every rescore/cancellation/ownership fix, adds a migration and a write path, and `event_payout_snapshots` already makes the value derivable.
- Auto-rolling unowned shares into the season-bonus pool. Rejected: pre-commits the disposition decision the league wants to defer.
- Leaving it as today's per-event audit only. Rejected: no season total, no participant visibility.

Rollback: remove `unallocatedPotService.js`, the two routes, the admin tab, the dashboard panel, and the three `scoringService` exports. No data to migrate back.

## References

- [unallocatedPotService.js](/Users/ryan/Claude Code/Calcutta App/apps/f1/server/services/unallocatedPotService.js)
- [scoringService.js](/Users/ryan/Claude Code/Calcutta App/apps/f1/server/services/scoringService.js)
- [payoutAuditService.js](/Users/ryan/Claude Code/Calcutta App/apps/f1/server/services/payoutAuditService.js)
- ADR 0008 (unowned substitute driver sync), ADR 0015 (cancelled event redistribution)
