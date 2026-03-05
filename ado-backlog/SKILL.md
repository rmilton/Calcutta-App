---
name: ado-backlog
description: Create, query, and update Azure DevOps Boards backlog work items (User Story, Feature, Bug) through REST API + PAT workflows. Use when generating feature ideas, converting ideas into structured user stories with Given/When/Then acceptance criteria, reading a work item and its links, or planning implementation based on fields, state, and linked items.
---

# ADO Boards Backlog

## Overview

Use this skill to work backlog items end-to-end in Azure DevOps Boards: turn ideas into actionable backlog records, query existing work, and safely update work items with explicit preview-before-apply behavior.

## Quick Start

1. Set auth context:
   - `export AZDO_PAT='***'`
2. Use the helper script:
   - `python scripts/ado_boards.py <command> --org <org> --project <project> ...`
3. For `create` and `update`:
   - Run once without `--apply` to preview JSON Patch.
   - Confirm with user, then rerun with `--apply --confirm YES`.

## Workflow 1: Idea To Backlog Structure

When the user asks for feature ideation or backlog drafting:

1. Clarify goal, users, constraints, and expected outcomes.
2. Decompose into backlog levels:
   - `Feature`: cross-story capability/value slice.
   - `User Story`: independently deliverable behavior.
   - `Bug`: defect with reproduction and impact.
3. Draft each story in this structure:

```md
Problem
- <current pain/risk>

User Story
- As a <role>, I want <capability>, so that <outcome>.

Acceptance Criteria (Given/When/Then)
- Given <context>, when <action>, then <observable result>.
- Given <context>, when <action>, then <observable result>.

Notes
- Dependencies:
- Non-goals:
- Rollout/flags:
```

Formatting rule:
- Keep each section header on its own line and each acceptance criterion on its own bullet line.
- Do not collapse section headers and bullets into one sentence (for example, avoid `Problem - ... User Story - ...` in one line).

4. Create the item with `scripts/ado_boards.py create` in preview mode first.

## Workflow 2: Query Backlog Items

When the user asks to find or summarize backlog work:

1. Pick a WIQL pattern from [references/wiql-patterns.md](references/wiql-patterns.md).
2. Execute:
   - `python scripts/ado_boards.py query --org <org> --project <project> --wiql "<WIQL>"`
3. If relationship context matters, add `--expand-relations`.
4. Summarize by item type, state, and linkage health (orphaned stories, missing parents, blocked bugs).

## Workflow 3: Read Item And Plan Implementation

When the user asks to plan work from an existing work item:

1. Retrieve the item and its relations:
   - `python scripts/ado_boards.py get --org <org> --project <project> <id> --expand-relations`
2. Use [references/planning-from-item.md](references/planning-from-item.md) checklist.
3. Produce an implementation plan with:
   - Scope
   - Dependencies/linked items
   - Risks/open questions
   - Task breakdown with sequencing

## Workflow 4: Safe Mutations (Create/Update)

Use this mutation protocol every time:

1. Build patch preview (`create` or `update`, no `--apply`).
2. Show the exact field/link diffs to the user.
3. Wait for explicit confirmation.
4. Apply with `--apply --confirm YES`.
5. Return updated item summary (id, title, type, state, key fields, relations).

Never skip preview for write operations.

## Field And Link Guidance

- Use generic built-in fields first; map custom fields only when user/org requires them.
- Reference docs:
  - [references/field-map.md](references/field-map.md)
  - [references/link-types.md](references/link-types.md)
- Supported relationship intents in script:
  - Parent (`Hierarchy-Reverse`)
  - Child (`Hierarchy-Forward`)
  - Related (`Related`)

## Script Commands

- `get`: Read one item (optionally expanded relations)
- `query`: Run WIQL + hydrate item details
- `create`: Build/apply JSON Patch for `User Story|Feature|Bug`
- `update`: Build/apply JSON Patch for existing item

Use `python scripts/ado_boards.py <command> --help` for argument details.

## Defaults And Extension Points

- Defaults to `AZDO_PAT` for auth; optional `--pat` override is available.
- Defaults to API version `7.1`.
- Custom field extension:
  - `--field Custom.Namespace.FieldName=value`
- Keep custom field conventions in org-specific notes if needed.
