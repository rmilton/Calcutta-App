# WIQL Patterns

Use these patterns as starting points. Replace placeholders like `@project`, team paths, and dates.

## Active Features

```sql
SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo]
FROM WorkItems
WHERE
  [System.TeamProject] = @project
  AND [System.WorkItemType] = 'Feature'
  AND [System.State] <> 'Closed'
ORDER BY [System.ChangedDate] DESC
```

## Active User Stories By Area Path

```sql
SELECT [System.Id], [System.Title], [System.State], [System.IterationPath]
FROM WorkItems
WHERE
  [System.TeamProject] = @project
  AND [System.WorkItemType] = 'User Story'
  AND [System.AreaPath] UNDER 'MyProject\\Payments'
  AND [System.State] IN ('New', 'Active', 'Resolved')
ORDER BY [System.State], [System.ChangedDate] DESC
```

## Bugs Open Longer Than N Days

```sql
SELECT [System.Id], [System.Title], [System.State], [System.CreatedDate]
FROM WorkItems
WHERE
  [System.TeamProject] = @project
  AND [System.WorkItemType] = 'Bug'
  AND [System.State] <> 'Closed'
  AND [System.CreatedDate] < @StartOfDay('-14d')
ORDER BY [System.CreatedDate] ASC
```

## Features And Their Children (link query)

```sql
SELECT
  [System.Id],
  [System.WorkItemType],
  [System.Title],
  [System.State]
FROM WorkItemLinks
WHERE
  (
    [Source].[System.TeamProject] = @project
    AND [Source].[System.WorkItemType] = 'Feature'
    AND [Source].[System.State] <> 'Closed'
  )
  AND (
    [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
  )
  AND (
    [Target].[System.WorkItemType] IN ('User Story', 'Bug')
  )
MODE (Recursive)
```

## Recently Updated Backlog Items

```sql
SELECT [System.Id], [System.WorkItemType], [System.Title], [System.ChangedDate]
FROM WorkItems
WHERE
  [System.TeamProject] = @project
  AND [System.WorkItemType] IN ('Feature', 'User Story', 'Bug')
  AND [System.ChangedDate] >= @StartOfDay('-7d')
ORDER BY [System.ChangedDate] DESC
```

## Usage With Script

```bash
python scripts/ado_boards.py query \
  --org my-org \
  --project MyProject \
  --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project" \
  --top 100 \
  --expand-relations
```
