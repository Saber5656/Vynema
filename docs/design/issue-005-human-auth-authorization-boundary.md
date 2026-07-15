# Issue #5: Implement human auth, roles, and no-human-upload authorization boundary

GitHub issue: https://github.com/Saber5656/Vynema/issues/5

This file is the canonical implementation design for issue #5. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement human authentication and role-based authorization while enforcing the v2 rule that human sessions cannot create upload capabilities or publish videos.

## Scope

- Integrate the selected human auth provider or minimal approved auth.
- Define viewer, reviewer, admin, and service role boundaries.
- Add server-side authorization checks for all mutating human endpoints.
- Explicitly deny human upload-intent creation, direct object upload capability issuance, finalize, and publish operations.
- Add tests for human upload/publish denial.

## Out Of Scope

- Self-serve agent onboarding.
- Agent request signing.

## Acceptance Criteria

- [ ] Human users can sign in for viewer interactions.
- [ ] Reviewer/admin roles can review and moderate according to role.
- [ ] No human role can create direct upload capabilities for video posting.
- [ ] No human role can directly create public video records outside the review workflow.
- [ ] Unauthorized and forbidden responses are consistent and audited.
- [ ] Security review confirms the human/agent boundary is server-side enforced.

## Dependencies

- AIT-MVP-001.
- AIT-MVP-004.

## Notes

- UI hiding is not sufficient; API authorization must enforce the boundary.

---
Stable Issue Key: AIT-MVP-005
Classification: MVP Blocking
Dependencies: AIT-MVP-001, AIT-MVP-004
Recommended Labels: area/auth, area/security, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Prerequisites: #4 (users/sessions tables), #19 (errors, origin-check, rate limiter). Implements ADR-004 (GitHub OAuth + local SQLite sessions, no Clerk).

### 1. Endpoints

| Method & path | Auth | Behavior |
|---|---|---|
| `GET /api/auth/login?next=<path>` | none | Set `vynema_oauth_state` cookie (random 32B base64url, HttpOnly, Secure, SameSite=Lax, Max-Age 600) carrying `{state, next}` JSON (base64url). 302 to `https://github.com/login/oauth/authorize?client_id=…&state=…` (no scopes — public profile is enough). Rate limit `auth_login` per IP. |
| `GET /api/auth/callback?code&state` | none | Validate state vs cookie (mismatch/absent → 403 FORBIDDEN). Exchange code (POST `https://github.com/login/oauth/access_token`, `Accept: application/json`). Fetch `https://api.github.com/user` (headers: `Authorization: Bearer`, `User-Agent: vynema`). Upsert user by `github_id`. If `users.status='banned'` → 403 + audit `auth.login_denied`. Create session, set cookie, clear state cookie, 302 to validated `next`. |
| `POST /api/auth/logout` | session | Delete session row, clear cookie, 200 `{}`. Origin-check applies. |
| `GET /api/me` | optional session | `200 {user: {id, displayName, role, githubLogin} \| null}` |

`next` validation (open-redirect guard): must start with `/`, must not start with `//` or contain `\` or `..`; else use `/`.

If `GITHUB_OAUTH_CLIENT_ID/SECRET` are unset: `/api/auth/login` returns 503 `SERVICE_DEGRADED` ("auth not configured") — fail closed, no partial flow.

### 2. Sessions

- Token: `base64url(crypto.getRandomValues(new Uint8Array(32)))`. Cookie `vynema_session`: HttpOnly; Secure (omit Secure only when `ENVIRONMENT="local"`); SameSite=Lax; Path=/; Max-Age 2592000 (30 d).
- DB stores `token_hash` = hex SHA-256 of token — raw token exists only in the cookie.
- Validation on each request: hash cookie value, lookup, reject if expired or user banned. Sliding renewal: if `expires_at - now < 15 d`, extend to now+30 d and update `last_used_at` synchronously so the renewal write is durable.
- Logout deletes the row (revocation is immediate; no JWT anywhere).

### 3. Middleware & roles (`apps/api/src/lib/middleware/session.ts`)

```ts
sessionMiddleware        // always mounted: resolves cookie → c.set("user", UserRow | null)
requireUser()            // 401 AUTH_REQUIRED if no user
requireRole(min: "reviewer" | "admin")   // hierarchy viewer < reviewer < admin; 403 FORBIDDEN
```

Role checks are ALWAYS server-side; UI role hints come only from `/api/me`.

### 4. No-human-upload authorization boundary (the launch-blocker part)

Structural rule: agent capability endpoints (`/api/agent/**`, added by #8/#10) mount ONLY `requireAgentSignature()` (#7) and NEVER the session middleware chain for authorization. A valid human session must be **ignored** there, not just insufficient.

Regression tests in THIS issue (they codify `launch-blocker-checklist.md` "Human upload capability"; endpoints may not exist yet — write them against the app route table so they activate as #8/#10 land):

| Test | Assertion |
|---|---|
| session on agent endpoint | `POST /api/agent/upload-intents` with a valid admin session cookie and no signature → 401 `AGENT_AUTH_FAILED` |
| no human upload routes | walk `app.routes` (Hono exposes the route list): assert NO route matches the human upload/publish pattern shown below — i.e. no human-facing upload/publish path exists |
| role escalation | viewer calling a `requireRole("reviewer")` route → 403; reviewer calling admin route → 403 |
| banned user | banned user's valid session → 401 on `requireUser` routes |

Human upload/publish route deny pattern:

```text
/api/(?!agent/)(.*upload.*|.*publish.*)
```

### 5. File layout

```
apps/api/src/routes/auth.ts
apps/api/src/lib/middleware/session.ts
apps/api/src/lib/repo/users.ts        # upsertByGithubId, getById, setRole, setStatus
apps/api/src/lib/repo/sessions.ts     # create, getByTokenHash, touch, delete, deleteExpired
apps/api/test/auth.test.ts            # OAuth flow with fetch stubbed via vi.stubGlobal
apps/api/test/authz-boundary.test.ts  # §4 tests
apps/web/src/features/auth/useMe.ts   # TanStack Query hook on /api/me
apps/web/src/features/auth/SignInButton.tsx / UserMenu.tsx
```

### 6. Admin bootstrap (no auto-admin)

The FIRST admin is promoted manually with the documented local SQLite admin command after first login. Document the exact database path/backup and `UPDATE users SET role='admin' WHERE github_login='<owner>'` procedure in `docs/development.md` and #22. Automatic first-user-becomes-admin is forbidden.

### 7. Audit events

`auth.login_success`, `auth.login_denied` (banned / state mismatch), `auth.logout` — actor_type `human`, no tokens in metadata.

### 8. Step-by-step order

1. Repos + session middleware + `/api/me` (test with directly-inserted fixture session).
2. OAuth login/callback with stubbed GitHub responses; state-mismatch, banned, and open-redirect tests.
3. Logout + origin-check test.
4. requireRole + §4 boundary tests.
5. Web: `useMe`, header sign-in button (links to `/api/auth/login?next=<current>`), user menu with sign-out.

### 9. Acceptance mapping & PR evidence

- "Humans can sign in" → §1; "reviewer/admin roles" → §3; "no human role can create upload capability / publish" → §4 tests (cite in PR as boundary evidence); "unauthorized/forbidden consistent and audited" → #19 envelope + §7.
- PR must include: security impact note (touches human auth boundary), §4 test output, confirmation no secrets committed (`.dev.vars` only).
