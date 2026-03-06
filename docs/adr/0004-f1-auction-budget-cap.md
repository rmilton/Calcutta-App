## Status

Accepted - 2026-03-05

## Context

The F1 auction previously had no server-enforced participant spending limit.
That made test auctions easy to run, but it also allowed unrealistic ownership concentration and accidental overspending that could not be distinguished from intentional stress testing.

The product requirement is to introduce a per-participant cap that:

1. is configurable by admins,
2. defaults to a realistic friend-group budget,
3. is enforced deterministically on the server,
4. accounts for a participant's current live leading bid as committed budget,
5. does not rewrite or invalidate existing over-cap test data.

Because this changes season-level auction semantics, the policy needs to be explicit in the decision log.

## Decision

Add an F1 season setting `auction_budget_cap_cents` with a default value of `20000` ($200).

Implementation semantics:

1. The cap applies per participant per season.
2. The cap is enforced in server-side bid placement.
3. A participant's committed auction spend is:
   - sold ownership spend, plus
   - the participant's current leading live bid, if any.
4. Bids that would push committed spend above the cap are rejected.
5. Existing ownership that already exceeds the cap is preserved, but future bids are blocked until the participant is back under the limit.
6. Admin users remain non-bidding users and are not subject to auction participation budget calculations in the client UI.
7. The auction API exposes cap, spent, reserved, and remaining budget values for the authenticated participant so the client can show remaining budget directly.

## Consequences

Positive:

1. Auction behavior is closer to the intended real-money-style constraint model.
2. Overspend prevention is deterministic and does not depend on client behavior.
3. Participants can see remaining budget clearly during live bidding.
4. Existing test setups are not destructively rewritten.

Negative:

1. The server now depends on additional per-bid budget queries and budget-summary bookkeeping.
2. Existing over-cap test data can produce negative remaining budget displays until the season is reset or the cap is raised.
3. Mid-auction cap reductions can immediately block additional bids for already-committed participants, which is intentional but operationally significant.
