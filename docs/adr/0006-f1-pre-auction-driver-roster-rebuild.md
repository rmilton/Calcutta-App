# ADR 0006: F1 Pre-Auction Driver Roster Rebuild From OpenF1

Date: 2026-03-05

## Status

Accepted

## Context

The F1 app seeds a canonical 2026 driver roster locally. During pre-season/live-season provider testing, OpenF1 can expose a 2026 driver lineup that no longer matches that seed. A strict "match existing seeded drivers only" approach causes refresh failures even when the admin is still in a safe pre-auction setup with no bids, ownership, or scoring data.

## Decision

For F1 admin driver refresh:

- keep strict identity-preserving matching when the active season already has auction or scoring activity
- but if the active season has no bids, ownership, event results, event payouts, or season bonus payouts, allow OpenF1 to become authoritative and rebuild the season driver roster plus auction queue directly from provider data

The rebuild remains season-scoped and F1-only.

## Consequences

Positive:

- pre-auction driver refresh can recover from roster drift without requiring manual seed edits
- real provider testing is less blocked by canonical-seed assumptions

Trade-offs:

- pre-auction refresh can now replace the seeded roster count and driver identities when the season is still clean
- once auction or scoring activity exists, refresh still fails closed to avoid corrupting ownership or payout history
