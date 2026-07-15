# Issue #19: Standardize API errors, request IDs, rate limits, and CORS

GitHub issue: https://github.com/Saber5656/Vynema/issues/19

This file is the canonical implementation design for issue #19. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Add cross-cutting API platform behavior for safe structured errors, request IDs, rate limits, CORS, and log correlation across human and agent APIs.

## Scope

- Define common response envelope or error shape.
- Generate and propagate request IDs.
- Add rate limits for auth, agent signing, upload intent, finalize, comments, reports, and public reads where practical.
- Configure CORS narrowly for frontend and direct-upload flows.
- Ensure logs avoid secrets, signatures, tokens, and raw private URLs.

## Out Of Scope

- Full WAF implementation.
- Paid bot protection.

## Acceptance Criteria

- [ ] All API errors follow a consistent documented shape.
- [ ] Every mutating request has a request ID in response and logs.
- [ ] Rate limits exist for high-risk endpoints.
- [ ] CORS is restricted to approved origins and flows.
- [ ] Sensitive values are redacted from logs.
- [ ] Tests cover representative error and rate-limit behavior.

## Dependencies

- AIT-MVP-002.

## Notes

- This issue should be implemented early enough for all APIs to reuse the common behavior.

---
Stable Issue Key: AIT-MVP-019
Classification: MVP Blocking
Dependencies: AIT-MVP-002
Recommended Labels: area/api, area/security, area/platform, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. This issue builds the cross-cutting API platform layer that every other API issue mounts. Implement EARLY (right after #4). Prerequisites: #34, #2 ADR-011/ADR-012.

### 1. Deliverables

1. Error envelope + typed error throwing/handling.
2. Request-ID middleware + safe structured logging.
3. SQLite-backed fixed-window rate limiter.
4. Origin-check (CSRF) middleware for session-authenticated mutations.
5. CORS policy (deny-by-default; agent API is CORS-irrelevant, web app is same-origin).
6. Zod validation helper producing consistent 422s.
7. `packages/shared` error-code registry.

### 2. Error model

`packages/shared/src/error-codes.ts` (single source of truth; frontend imports it too):

```ts
export const ERROR_CODES = [
  "AUTH_REQUIRED",          // 401 no/invalid session
  "FORBIDDEN",              // 403 authenticated but not allowed
  "AGENT_AUTH_FAILED",      // 401 signature verification failed (#7; generic on purpose)
  "AGENT_REVOKED",          // 403
  "AGENT_DISABLED",         // 403
  "CHANNEL_FROZEN",         // 403 active agent owns a frozen channel (#8)
  "NOT_FOUND",              // 404 generic
  "VIDEO_NOT_FOUND",        // 404
  "COMMENT_NOT_FOUND",      // 404
  "INTENT_NOT_FOUND",       // 404
  "INTENT_EXPIRED",         // 410
  "VALIDATION_FAILED",      // 422 zod failure; details[] included
  "QUOTA_EXCEEDED",         // 429 quota boundary (#14); detail.metric included
  "RATE_LIMITED",           // 429 request-rate boundary; detail.retryAfterSeconds
  "UPLOADS_DISABLED",       // 503 kill switch (#14)
  "PUBLICATION_DISABLED",   // 503 kill switch
  "SERVICE_DEGRADED",       // 503 public_read_enabled=false
  "CONFLICT",               // 409 state conflict (e.g. finalize twice)
  "INTERNAL",               // 500 anything unexpected; message is always generic
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
```

`apps/api/src/lib/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown,   // JSON-safe, MUST NOT contain secrets/internal paths
  ) { super(message); }
}
export const errors = {
  authRequired: () => new ApiError(401, "AUTH_REQUIRED", "Sign-in required"),
  forbidden: () => new ApiError(403, "FORBIDDEN", "Not allowed"),
  notFound: (code: ErrorCode = "NOT_FOUND") => new ApiError(404, code, "Not found"),
  validation: (details: unknown) => new ApiError(422, "VALIDATION_FAILED", "Validation failed", details),
  rateLimited: (retryAfterSeconds: number) =>
    new ApiError(429, "RATE_LIMITED", "Too many requests", { retryAfterSeconds }),
  // …one helper per code
};
```

Global `app.onError`: if `ApiError`, respond `{error:{code, message, requestId, details?}}` with its status; otherwise log the real error server-side and respond 500 `INTERNAL` with generic message (never leak stack/SQL). `app.notFound` → 404 `NOT_FOUND` envelope. `RATE_LIMITED` responses also set the `Retry-After` header.

### 3. Request ID + logging (`apps/api/src/lib/middleware/request-id.ts`, `logger.ts`)

- Middleware (outermost): `const requestId = crypto.randomUUID()`; store via `c.set("requestId", id)`; set response header `X-Request-Id`.
- `logLine(c, fields)` emits ONE `console.log(JSON.stringify({...}))` per request from a finalization middleware: `{ts, requestId, method, path, status, durationMs, actorType, actorId, errorCode?, quotaOutcome?}`.
- **Redaction rules (normative, default deny)**: never log request/response
  bodies, media bytes, BLOB ids, capability/upload URLs, storage keys,
  `authorization`, `cookie`, `x-vynema-signature`, or
  `x-vynema-upload-token`, nor session/upload tokens. Structured log fields are
  an allowlist; header/body/exception serialization is never merged wholesale.
  `test/logging.test.ts` covers success, validation failure, 500, timeout, and
  aborted upload and asserts the exact signature, upload token, BLOB id, URL,
  and media sample are absent from console/audit/error output.

### 4. Rate limiter (`apps/api/src/lib/middleware/rate-limit.ts`)

SQLite fixed window (table `rate_limits` from #4):

```ts
export function rateLimit(scope: string, opts: { windowSeconds: number; max: number; keyFn: (c) => string | null })
```

- Window start = `floor(nowSec / windowSeconds) * windowSeconds`. Key = `${scope}:${keyFn(c)}`; `keyFn` returns null → skip (e.g., unauthenticated GET).
- Atomic increment: `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count`. If returned count > max → throw `errors.rateLimited(windowEnd - nowSec)`.
- **Fail-closed for capability paths**: if the SQLite write itself fails on agent upload/finalize routes, deny (503); for public GETs, allow (availability over strictness) — flag choice per route via `failMode: "closed" | "open"`.
- Cleanup of old windows happens in the #10 callable cleanup job (`DELETE FROM rate_limits WHERE window_start < now - 2*window`).

Default limits (constants in `apps/api/src/lib/limits.ts`):

| Scope | Key | Window | Max |
|---|---|---|---|
| `auth_login` | trusted client IP | 600 s | 10 |
| `agent_pre_auth` | trusted client IP | 60 s | 60 |
| `agent_pre_auth_global` | one global key | 60 s | 600 |
| `agent_intent` | verified agentId | 3600 s | 10 |
| `agent_finalize` | verified agentId | 3600 s | 20 |
| `agent_any` | verified agentId | 60 s | 30 |
| `comment` | userId | 300 s | 10 |
| `report` | userId | 3600 s | 20 |
| `reaction` | userId | 60 s | 30 |
| `public_search` | IP | 60 s | 30 |
For agent capability routes, middleware order is normative: `agent_pre_auth` →
`agent_pre_auth_global` → signature verification (#7) → `agent_any` → the
endpoint-specific agent bucket. `keyFn` for
an agent bucket reads only the verified request context and returns `null`
before authentication; it never reads a claimed agent header. Tests prove an
invalid request claiming another agent id cannot increment that agent's bucket.

`trustedClientIp(c)` is also normative. In direct local development it uses the
server-observed socket peer address and ignores `CF-Connecting-IP`,
`X-Forwarded-For`, and `Forwarded`. A forwarded client address may be accepted
only when the immediate socket peer is in an explicit trusted-proxy allowlist;
production proxy/provider configuration belongs to #42. Missing/unparseable
addresses use the global bucket, never a caller-selected string. Tests prove
spoofed forwarding headers do not change the key, while a configured trusted
proxy does, and that a global ceiling still applies.

### 5. Origin check (CSRF) middleware

Applied to every `/api` route with method != GET/HEAD/OPTIONS **that uses cookie-session auth** (agent-signed routes are exempt — signatures already bind the request):
- If `Origin` header present: must equal the request URL origin, else 403 `FORBIDDEN`.
- If absent (non-browser client): require `content-type: application/json` (blocks HTML-form CSRF).

### 6. CORS

- Same-origin web app ⇒ NO CORS headers on `/api` by default (absence = deny).
- `OPTIONS` preflights: respond 204 without ACAO (deny) except for future documented needs.
- Development media upload/read routes are same-origin. Production media-domain CORS, if any, is deferred to #42.
- Agent endpoints are server-to-server; CORS irrelevant but harmless to leave denied.

### 7. Validation helper

`apps/api/src/lib/validate.ts`: `parseBody(c, schema)` — reads JSON (reject >64 KiB bodies with 422), runs zod `safeParse`, throws `errors.validation(flattenedIssues)` on failure. All request schemas live in `packages/shared/src/schemas/` so #35 CLI and web can reuse them. Add `zod ^3` to `packages/shared` in this issue.

### 8. File layout

```text
apps/api/src/lib/errors.ts
apps/api/src/lib/limits.ts
apps/api/src/lib/validate.ts
apps/api/src/lib/middleware/request-id.ts
apps/api/src/lib/middleware/logger.ts
apps/api/src/lib/middleware/origin-check.ts
apps/api/src/lib/middleware/rate-limit.ts
packages/shared/src/error-codes.ts
packages/shared/src/schemas/          # grows with each feature issue
apps/api/test/{errors,rate-limit,origin-check,logging}.test.ts
```

Mount order in `app.ts` (normative): request-id → logger → origin-check → routes (each route adds its own rateLimit/auth middlewares).

### 9. Tests

| Test | Assertion |
|---|---|
| envelope shape | thrown `ApiError(422)` → body matches `{error:{code,message,requestId,details}}`, header `X-Request-Id` equals body requestId |
| unexpected error | route throwing `new Error("boom")` → 500 INTERNAL, generic message, no "boom" in body |
| error registry completeness | extract every backticked API error code used by active issue designs; each exists in `ERROR_CODES`, and route contract fixtures assert status/code/envelope (including `CHANNEL_FROZEN` and `INTENT_EXPIRED`) |
| rate limit | scope max=2: 3rd request in window → 429 + `Retry-After`; new window → allowed again |
| rate limit fail-closed | make DB stmt throw (drop table in test) → capability route 503, public route passes |
| origin check | POST with `Origin: https://evil.example` → 403; matching origin → pass; no origin + form content-type → 403 |
| CORS deny | OPTIONS with Origin → response has no `Access-Control-Allow-Origin` |
| sensitive logging | success, 422, 500, timeout, and aborted upload logs contain none of the exact signature/token/URL/BLOB-id/media sample values |

### 10. Acceptance mapping

- "Consistent error shape" → §2. "Request IDs" → §3. "Rate limits on high-risk endpoints" → §4 table (wired per-route in feature issues; THIS issue wires `auth_login` + `public_search` as examples). "CORS restricted" → §6. "Sensitive values redacted" → §3 redaction test.
- PR evidence: test output + a sample log line demonstrating redaction.
