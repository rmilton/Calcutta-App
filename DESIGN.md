# DESIGN.md

Last validated: 2026-03-05

## Purpose

This file defines how design work should be done in this repo so implementation quality remains consistent as the codebase grows.

## Design Levels

1. Micro design
- Small local refactors, no contract changes.
- Capture directly in PR description.

2. Feature design
- New feature, endpoint, workflow, or UI flow.
- Use the design template in `docs/templates/design-template.md`.

3. Architecture design
- Changes to boundaries, deployment, data model semantics, or reliability behavior.
- Requires ADR in `docs/adr`.

## Required Sections For Feature/Architecture Design

1. Problem and user/operator impact
2. Scope and explicit non-goals
3. API/interface changes
4. Data model and migration impact
5. Failure modes and rollback plan
6. Test strategy and acceptance criteria
7. Observability and runbook impact

## Design Quality Heuristics

1. Favors explicit over implicit behavior.
2. Defines ownership boundaries clearly.
3. Makes failure behavior predictable.
4. Includes rollback path before implementation starts.
5. Minimizes cross-app coupling.

## Design Review Triggers

Require review from another engineer when any apply:

- payout/scoring behavior changes
- deployment/runtime behavior changes
- new shared package API
- auth/session behavior changes
- schema semantics change

## Documentation Sync Rule

After implementation, reflect final decisions in:

- `ARCHITECTURE.md` (steady-state)
- `HEARTBEAT.md` (current status/risk)
- ADR if architecture-significant
