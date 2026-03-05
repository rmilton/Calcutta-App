# Field Map

Default to these built-in fields for `Feature`, `User Story`, and `Bug`.

## Core Fields

- `System.Title`: short, specific outcome statement.
- `System.Description`: details, rationale, and scope.
- `Microsoft.VSTS.Common.AcceptanceCriteria`: testable criteria; prefer Given/When/Then format.
- `System.State`: process state (example: New, Active, Resolved, Closed).
- `System.Reason`: reason for state value changes.
- `System.Tags`: semicolon-separated tags.
- `System.AreaPath`: product/domain ownership path.
- `System.IterationPath`: sprint/release bucket.

## Helpful Optional Fields

- `System.AssignedTo`: owner.
- `Microsoft.VSTS.Common.Priority`: relative priority.
- `Microsoft.VSTS.Scheduling.StoryPoints`: story estimate.
- `Microsoft.VSTS.Common.BusinessValue`: business impact.

## Item Type Conventions

### Feature

- Keep title capability-oriented, not task-oriented.
- Include measurable business outcome in description.
- Track child stories and bugs via hierarchy links.

### User Story

- Use: `As a <role>, I want <capability>, so that <outcome>`.
- Put scenario-level criteria in `AcceptanceCriteria`.
- Keep each story independently deliverable.

### Bug

- Include impact and reproducibility in description.
- Include expected vs actual behavior in criteria/notes.
- Link to parent feature/story if bug belongs to planned scope.

## Custom Field Extension

Use `--field` to set org-specific fields:

```bash
--field Contoso.RiskLevel=High
--field Contoso.ReleaseTrain=2026.Q2
```

If your process template uses required custom fields, set them at create-time to avoid server-side validation failures.
