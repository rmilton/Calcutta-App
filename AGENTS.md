# AGENTS.md

Last validated: 2026-03-05
Owner: Engineering

## Purpose

This file is the execution contract for coding agents and humans working in this repository.
It exists to reduce output variance, prevent cross-app regressions, and scale parallel work.

## Instruction Order

When instructions conflict, use this precedence:

1. System/developer runtime instructions
2. This file (`/AGENTS.md`)
3. App-level agent files (`apps/*/AGENTS.md`)
4. Task-specific docs (`DESIGN.md`, ADRs, issue text)
5. Legacy handoff files (`HANDOFF.md` stubs)

## Repo Topology

This monorepo intentionally hosts two independent products:

- `apps/ncaa`: March Madness Calcutta
- `apps/f1`: Formula 1 Calcutta
- `packages/core`: shared utilities only

Runtime coupling between apps is not allowed.

## Non-Negotiable Guardrails

1. Preserve app boundaries.
2. Prefer deterministic logic for money, scoring, and ranking.
3. Avoid hidden side effects in startup/shutdown paths.
4. Keep production deploy assumptions explicit in docs and config.
5. If behavior changes, update docs in the same PR.

## Work Scoping Rules

- NCAA-only requests: edit only `apps/ncaa/**` unless explicitly shared.
- F1-only requests: edit only `apps/f1/**` unless explicitly shared.
- Shared changes: require clear justification and impact review for both apps.

## Quality Gates (Default)

For code changes, run the smallest relevant checks before completion:

- NCAA server changes: `npm run test:ncaa`
- F1 server changes: `npm run test:f1`
- Frontend changes: relevant app build (`npm run build:ncaa` or `npm run build:f1`)

For cross-repo changes, run:

- `npm run test`
- `npm run build`

## Definition Of Done

A task is complete only when all are true:

1. Functional requirement is implemented.
2. Relevant tests/builds pass.
3. No boundary violations introduced.
4. `HEARTBEAT.md` updated if operational state changed.
5. ADR added when architecture/operating policy changed.

## Documentation Control Plane

Canonical docs:

- Repo principles: `SOUL.md`
- Execution policy: `AGENTS.md`
- Current operational state: `HEARTBEAT.md`
- System map: `ARCHITECTURE.md`
- Design workflow/templates: `DESIGN.md`
- Operations and incidents: `RUNBOOK.md`
- Decision ledger: `docs/adr/*`

Legacy `HANDOFF.md` files are compatibility entrypoints and should not be used as canonical source.

## When To Write An ADR

Create or update an ADR when you change:

- deployment/runtime model
- data model semantics
- cross-module ownership boundaries
- reliability strategy (startup/shutdown/retries)
- shared package contracts

## Operational Safety

- Favor graceful shutdown behavior under orchestrator signals.
- Treat expected orchestrator stop conditions as clean exits.
- Never require manual post-deploy repair for normal startup.

## Communication Norms

For every meaningful implementation, capture:

- what changed
- why it changed
- how verified
- what remains risky or unknown

Use concise, factual language and include file references when possible.
