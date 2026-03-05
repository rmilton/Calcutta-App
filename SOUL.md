# SOUL.md

Last validated: 2026-03-05
Owner: Product + Engineering

## Why This Repo Exists

This repository runs two real-money-adjacent pool products where trust and clarity matter more than novelty:

- NCAA Calcutta for March Madness
- F1 Calcutta for a season-long motorsport pool

Users rely on us to run auctions, payouts, and standings correctly under time pressure.

## Core Principles

1. Operator trust beats feature velocity.
2. Correctness beats cleverness in scoring and payout logic.
3. Deterministic outcomes beat opaque automation.
4. Explainability is part of the product, not optional documentation.
5. Reliability under deploy/restart is a product requirement.

## Product Identity

- NCAA: stable, familiar, low-risk changes; preserve visual continuity unless explicitly requested.
- F1: modern and evolving, but still strict about payout/scoring correctness.

## Decision Tie-Breakers

When choosing between two valid options:

1. Choose lower operational risk.
2. Choose clearer ownership boundaries.
3. Choose easier rollback.
4. Choose better observability/debuggability.
5. Choose lower maintenance burden.

## Non-Goals

- Cross-app entanglement for convenience
- Hidden runtime dependencies across service roots
- Unreviewed changes to payout/scoring semantics
- Docs that drift from behavior

## Reliability Stance

- Deploy-stop cycles from orchestrators must not be treated as fatal app errors.
- Startup and shutdown behavior should be idempotent.
- Health checks should represent true readiness.

## Documentation Philosophy

Docs are operational infrastructure.
If docs are stale, the system is partially broken.

Every architecture-significant change must update:

- `HEARTBEAT.md` (current state)
- `docs/adr/*` (decision record)
- any impacted runbook content
