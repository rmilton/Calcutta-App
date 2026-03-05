# Calcutta Monorepo

This repository now contains two separate Calcutta products:

- `apps/ncaa` - March Madness Calcutta app (styling preserved)
- `apps/f1` - Formula 1 season Calcutta app with F1-specific domain and UI
- `packages/core` - shared utilities (money math, auth helpers, auction timing helpers)

## Development

Run NCAA app:

```bash
npm run dev:ncaa
```

Run F1 app:

```bash
npm run dev:f1
```

Run both:

```bash
npm run dev
```

## Ports

- NCAA client/server: `5173` / `3001`
- F1 client/server: `5174` / `3002`

Override with env vars:

- `NCAA_PORT`, `NCAA_CLIENT_ORIGIN`
- `F1_PORT`, `F1_CLIENT_ORIGIN`, `F1_RESULTS_PROVIDER`

## Testing

```bash
npm run test:ncaa
npm run test:f1
```

## Documentation

Core engineering docs live at repository root:

- `AGENTS.md` (execution policy)
- `SOUL.md` (principles and decision compass)
- `HEARTBEAT.md` (current state)
- `ARCHITECTURE.md` (system map)
- `DESIGN.md` (design process)
- `RUNBOOK.md` (operations)
- `docs/` (ADRs, app snapshots, templates)

## NCAA style freeze

A guard script is included to prevent accidental style changes in NCAA UI files:

```bash
npm run check:ncaa-style-freeze
```
