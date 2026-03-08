# ADR 0013: F1 Season Bonuses Score Only After Season Complete

Date: 2026-03-08

## Status

Accepted

## Context

The F1 scoring service recalculated `season_bonus_payouts` every time any event was scored. That made season bonus money appear in participant standings mid-season even though the categories are defined as full-season awards such as:

- Drivers Champion
- Most Race Wins
- Most Top-10 Finishes Outside Top 4
- Random Finishing Position Bonus
- Biggest Single-Race Climb

Those categories should reflect the complete season, not an in-progress partial season snapshot.

## Decision

Gate season bonus payout calculation behind full scoring completion for the season.

Implementation:

1. Keep event payout scoring unchanged
2. Delete and recompute `season_bonus_payouts` only when every scoring event in the active season is marked `scored`
3. If the season is not complete, keep `season_bonus_payouts` empty
4. Continue using the same full-season metric logic once the season is complete

## Consequences

Positive:

- standings no longer overstate participant earnings mid-season
- season bonus categories now match their intended semantics
- payout timing is easier to explain to participants

Tradeoffs:

- admin/test flows that previously showed provisional season bonus payouts no longer do so
- local/dev databases with old bonus payouts may need cleanup or rescoring to match the new rule

## Rollback / Alternatives

Alternative considered:

- keep mid-season provisional season bonus payouts and label them as provisional

Rejected because payouts are used directly in standings, and provisional payouts create misleading earnings totals during the season.

Rollback:

- remove the season-complete gate
- return to recalculating `season_bonus_payouts` after every scored event

## References

- [scoringService.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/services/scoringService.js)
- [standingsRepo.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/persistence/repositories/standingsRepo.js)
- [scoringService.test.js](/Users/rmilton/Code/Calcutta-App/apps/f1/server/tests/scoringService.test.js)
