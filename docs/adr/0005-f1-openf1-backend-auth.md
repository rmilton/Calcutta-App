## Status

Accepted - 2026-03-05

## Context

The F1 app integrates with OpenF1 for driver, schedule, and event result data.
During live F1 sessions, OpenF1 can restrict even historical REST access to authenticated users and return `401 Unauthorized` responses for otherwise public endpoints.

Relying on anonymous access only is therefore not operationally safe for production or for real-time race-weekend testing.

The app also cannot expose OpenF1 credentials to the browser because:

1. provider credentials are secrets,
2. OpenF1 recommends backend-only handling for authentication,
3. the F1 admin UI should continue using the server as the only provider integration point.

## Decision

Implement OpenF1 authentication in the F1 server provider layer only.

Implementation semantics:

1. Runtime config:
   - `OPENF1_USERNAME`
   - `OPENF1_PASSWORD`
   - optional `OPENF1_TOKEN_URL`
2. The provider exchanges credentials against the OpenF1 token endpoint.
3. The returned bearer token is cached in memory until near expiry.
4. OpenF1 data requests use the bearer token when credentials are configured.
5. If OpenF1 returns `401`, the provider clears cached auth state, refreshes the token once, and retries the request once.
6. Tokens are never returned to the client UI and are never persisted in SQLite.
7. Admin-visible errors should remain explicit when authentication fails or credentials are missing.

## Consequences

Positive:

1. F1 real-data sync can continue working during live-session windows when anonymous access is blocked upstream.
2. Credentials remain server-side only.
3. The provider remains the single integration point for auth and request retry behavior.

Negative:

1. F1 runtime now depends on additional secrets for reliable OpenF1 usage.
2. Misconfigured or expired credentials now present as provider auth failures rather than generic sync failures.
3. Token lifecycle is process-local, so every fresh process start must reacquire a token.
