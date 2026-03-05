# Planning From Existing Work Items

Use this deterministic checklist when asked to plan/implement based on an ADO item.

## 1) Gather Context

1. Read the seed item with relations:
   - `python scripts/ado_boards.py get --org <org> --project <project> <id> --expand-relations`
2. Capture key fields:
   - Type, title, description, acceptance criteria, state, area/iteration, tags.
3. Identify linked items by relation type:
   - Parent, child, related.

## 2) Build Work Graph

1. Group linked items by type and status.
2. Distinguish blockers vs references.
3. Flag missing structure:
   - Stories without parent feature.
   - Bugs without owning story/feature.
   - Items lacking acceptance criteria.

## 3) Produce Implementation Plan

Always produce these sections:

- Scope
  - In-scope capabilities and explicit non-goals.
- Dependencies
  - Required linked work and external constraints.
- Risks
  - Delivery, technical, or ambiguity risks and mitigations.
- Task Breakdown
  - Ordered implementation tasks with validation checkpoints.

## 4) Convert Plan To Backlog Updates

1. Propose item updates or new child items.
2. Generate preview patches first (`create`/`update` without `--apply`).
3. Confirm with user.
4. Apply with `--apply --confirm YES`.

## 5) Exit Criteria

Planning output is complete when:

- Acceptance criteria map to implementation tasks.
- Dependencies and sequencing are explicit.
- Risks have mitigation steps.
- Backlog links reflect actual execution order.
