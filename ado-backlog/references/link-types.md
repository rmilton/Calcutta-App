# Link Types

Focus on backlog planning relations used by this skill.

## Hierarchy

- Parent link: `System.LinkTypes.Hierarchy-Reverse`
  - Meaning: current item is a child of target item.
- Child link: `System.LinkTypes.Hierarchy-Forward`
  - Meaning: current item has target item as child.

Typical usage:
- Feature -> Story: add child link from Feature, or parent link on Story.
- Story -> Bug: link bug as child/related based on process preference.

## Related

- Related link: `System.LinkTypes.Related`
  - Use for non-hierarchical dependencies or cross-cutting references.

## CLI Mapping

The helper script maps relation keywords:

- `parent` -> `System.LinkTypes.Hierarchy-Reverse`
- `child` -> `System.LinkTypes.Hierarchy-Forward`
- `related` -> `System.LinkTypes.Related`

Examples:

```bash
# Add parent feature to story
--add-link parent:123

# Add related bug by URL
--add-link related:https://dev.azure.com/org/proj/_apis/wit/workItems/456

# Remove child relation by target id
--remove-link child:789
```

## Relation Hygiene

- Avoid using both parent and related for the same structural relationship.
- Keep one clear hierarchy chain for reporting integrity.
- Remove stale links when scope changes to prevent planning drift.
