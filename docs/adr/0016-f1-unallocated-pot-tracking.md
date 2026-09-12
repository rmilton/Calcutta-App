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
   - For flagged events only, a tier-2 per-category breakdown reads the persisted `event_payout_snapshots`/`event_payouts` rows directly (not `buildEventPayoutAudit`'s live ownership lookup) for status text and unowned-winner identification, so it can't drift from the tier-1 total after an unrelated ownership change (e.g. "Reset Auction Only").
   - Season bonuses: while `isSeasonBonusReady` is false the bonus pool is reported as `pending`, not unallocated. Once the season is complete, bonus leakage is `effectiveTotalCents - SUM(season_bonus_payouts.amount_cents)`, with a per-category breakdown built from the exported `resolveSeasonBonusWinners` / `getChampionshipStandings` / `getAllSeasonResultRows` helpers, likewise matched against persisted payout rows rather than live ownership.
   - `resolveSeasonBonusWinners`'s `season_random_finish_position` branch can draw and persist the season's random bonus position if one isn't set yet (`getSeasonRandomBonusPosition`). Both the admin summary and the dashboard headline call it with `readOnly: true`, which guarantees no draw/persist happens on this read-only path — enforced in `getSeasonRandomBonusPosition` itself, not by a convention callers have to remember.
2. Explicitly excluded: pending/`results_loaded` events (future money), cancelled events (value already moves via `event_redistributions` per ADR 0015), and even-split rounding remainders.
3. `GET /api/admin/payouts/unallocated` and `/export.csv` back an admin "Unallocated" tab under Payouts. This path (`buildSeasonUnallocatedSummary`) always recomputes fresh — no caching — so an admin sees their own corrective actions (re-syncing a race, assigning ownership to a substitute, rescoring) reflected immediately.
4. The participant dashboard payload carries `summary.unallocatedPot = { totalCents, isFinal }`; the dashboard renders a headline panel only when `totalCents > 0`. Once the season is complete, the season-bonus portion of this headline (`getSeasonUnallocatedHeadline`) is cached for 60 seconds, since it would otherwise re-run a full season-wide result/standings scan on every 15-60s dashboard poll for the rest of that season's life. The admin path in point 3 is unaffected by this cache.

## Consequences

Positive:

- The gap between "100% earmarked" and "actually paid" is now a single visible number for admins and participants.
- Derivation means cancellations, rescores, and ownership fixes are reflected automatically.
- The season-end disposition decision can be made against a real total, and the CSV gives a line-item record.

Tradeoffs:

- `scoringService.js` now exports several previously-private season-bonus helpers (`getAllSeasonResultRows`, `getChampionshipStandings`, `resolveSeasonBonusWinners`, `getSeasonScoringEventCounts`), plus a `readOnly` option on `getSeasonRandomBonusPosition`/`resolveSeasonBonusWinners`.
- The participant dashboard's unallocated-pot headline can lag the true total by up to 60 seconds once the season is complete (the season-bonus cache in point 4 above); the admin Unallocated tab is never subject to this and is always live.
- The number is informational only. Actually moving the money (rollover category, redistribution, external use) remains a manual, deliberate action.

## Rollback / Alternatives

Alternatives considered:

- A stored leakage ledger written during scoring. Rejected: needs manual reversal on every rescore/cancellation/ownership fix, adds a migration and a write path, and `event_payout_snapshots` already makes the value derivable.
- Auto-rolling unowned shares into the season-bonus pool. Rejected: pre-commits the disposition decision the league wants to defer.
- Leaving it as today's per-event audit only. Rejected: no season total, no participant visibility.

Rollback: remove `unallocatedPotService.js`, the two routes, the admin tab, the dashboard panel, and the `scoringService` exports listed above. No data to migrate back.

## References

- [unallocatedPotService.js](/Users/ryan/Claude Code/Calcutta App/apps/f1/server/services/unallocatedPotService.js)
- [scoringService.js](/Users/ryan/Claude Code/Calcutta App/apps/f1/server/services/scoringService.js)
- [payoutAuditService.js](/Users/ryan/Claude Code/Calcutta App/apps/f1/server/services/payoutAuditService.js)
- ADR 0008 (unowned substitute driver sync), ADR 0015 (cancelled event redistribution)
