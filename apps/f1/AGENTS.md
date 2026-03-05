# F1 AGENTS Overlay

This file augments root `AGENTS.md` for F1-scoped work.

## Scope

Apply these rules when editing `apps/f1/**`.

## Additional Guardrails

1. Keep `apps/f1/server` runtime self-contained for Railway subdirectory deploys.
2. Treat scoring and payout behavior changes as architecture-sensitive.
3. Validate changes with `npm run test:f1`.
4. If scoring/deploy architecture changes, add/update an ADR.
