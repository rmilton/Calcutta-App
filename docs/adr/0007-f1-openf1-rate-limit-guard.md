# ADR 0007: F1 OpenF1 Rate-Limit Guard

Date: 2026-03-05

## Status

Accepted

## Context

OpenF1 enforces a low request-per-second limit. Admin-driven refresh flows and multi-request provider operations can trigger `429 Rate limit exceeded` responses even when the user is following a reasonable workflow.

## Decision

The F1 OpenF1 provider will:

- serialize outbound provider requests through one queue per server process
- add a small minimum delay between outbound provider requests
- enforce a rolling minute-window request budget aligned to the provider's documented 60 requests/minute cap
- retry a bounded number of times on `429` responses
- honor `Retry-After` when available and otherwise use short incremental backoff

The retry strategy remains provider-local and does not change the admin API contract.

## Consequences

Positive:

- admin refresh and sync flows are less likely to fail on transient provider throttling
- provider resilience improves without adding client complexity

Trade-offs:

- refresh/sync actions can take slightly longer under throttling
- repeated manual clicks can still queue work and increase wait time under sustained throttling
