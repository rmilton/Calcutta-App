# ADR 0001: Documentation Control Plane For Agent And Human Execution

- Status: Accepted
- Date: 2026-03-05

## Context

The repo had multiple handoff files containing overlapping architecture, operations, and status details. As the monorepo grows, duplicate narrative docs increase drift risk and reduce execution consistency for both humans and agents.

## Decision

Adopt a documentation control plane with distinct responsibilities:

- `AGENTS.md`: execution policy and quality bar
- `SOUL.md`: principles and decision compass
- `HEARTBEAT.md`: current operational state
- `ARCHITECTURE.md`: steady-state technical map
- `DESIGN.md`: design process and review triggers
- `RUNBOOK.md`: operations and incidents
- `docs/adr/*`: architecture decision ledger

Convert legacy `HANDOFF.md` files into compatibility stubs that point to canonical docs.

## Consequences

Positive:

- Reduced doc drift through clear ownership of each doc type
- Better agent consistency and onboarding speed
- Cleaner separation of policy vs state vs architecture

Tradeoffs:

- Requires discipline to keep `HEARTBEAT.md` current
- Adds lightweight process overhead for architecture-changing work (ADR updates)

## Alternatives Considered

1. Keep handoff-centric model
- Rejected due to overlapping concerns and drift risk.

2. Move all content into one mega doc
- Rejected because state, policy, and architecture change at different rates.

## Rollback Plan

If this model proves too heavy, collapse `DESIGN.md` into `ARCHITECTURE.md` and retain ADRs + RUNBOOK as mandatory minimal set.

## References

- `AGENTS.md`
- `SOUL.md`
- `HEARTBEAT.md`
- `ARCHITECTURE.md`
- `DESIGN.md`
- `RUNBOOK.md`
