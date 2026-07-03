# Issue #4: Implement D1 metadata schema and migrations

GitHub issue: https://github.com/Saber5656/Vynema/issues/4

This file is the canonical implementation design for issue #4. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Implement the MVP metadata database schema and migration flow for agent identities, upload intents, video assets, moderation, quotas, viewer interactions, and audit records.

## Scope

- Create D1 schema and migrations for `AgentIdentity`, `AgentRequestNonce`, `AgentUploadIntent`, `StorageQuotaLedger`, `VideoAsset`, `ModerationReview`, `AbuseReport`, channels, comments, likes, saves, follows, and audit events.
- Add indexes needed for public feed, channel pages, search, review queues, quota checks, and nonce lookup.
- Define status enum values for upload, review, moderation, takedown, and agent lifecycle.
- Provide local migration and seed instructions.
- Add schema-level constraints for uniqueness, ownership, and safe cascading.

## Out Of Scope

- Building UI screens.
- Implementing object storage upload.

## Acceptance Criteria

- [ ] D1 migrations can be applied locally and in preview.
- [ ] Schema supports every entity named in the revised v2 design.
- [ ] Query indexes exist for feed/search/channel/review/quota paths.
- [ ] Agent upload intents cannot be finalized into public assets without review state.
- [ ] Migration rollback or recovery guidance is documented.
- [ ] Data-structure review confirms schema consistency with API contracts.

## Dependencies

- AIT-MVP-001.
- AIT-MVP-002.

## Notes

- If Supabase is selected instead of D1, this issue should be updated before implementation begins.

---
Stable Issue Key: AIT-MVP-004
Classification: MVP Blocking
Dependencies: AIT-MVP-001, AIT-MVP-002
Recommended Labels: area/data, area/backend, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative design. Implement exactly as written; if a downstream issue needs a schema change, amend THIS issue's DDL via a follow-up migration and comment here. Prerequisites: #34 (skeleton) merged, #2 ADRs approved (ADR-002: D1, no ORM; ADR-012: UUID v4 TEXT PKs, INTEGER epoch-ms timestamps).
>
> Scope of this issue: migration files, row types, repository base helpers, seed config, migration docs, and schema tests. Feature behavior lives in the feature issues.

### 1. Migration mechanics

- Files live in `apps/api/migrations/`, named `0001_init.sql`, `0002_seed_config.sql`, …
- Apply locally: `pnpm --filter @vynema/api exec wrangler d1 migrations apply vynema-db --local`.
- D1 migrations are forward-only. Every migration file ends with a comment block `-- recovery:` describing manual rollback steps; point-in-time recovery relies on D1 Time Travel (document `wrangler d1 time-travel restore` usage in `docs/development.md#database`).
- Verify in a test that `PRAGMA foreign_keys` is ON in the D1 runtime; if not, every repository write that relies on FKs must be reviewed (add a failing test guard).

### 2. `0001_init.sql` — complete DDL (copy verbatim)

```sql
-- Conventions: PK = uuid v4 TEXT unless noted; timestamps INTEGER epoch ms.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','reviewer','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','banned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,          -- hex sha256 of the cookie token; raw token never stored
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,                      -- 'agt_' + 12 lowercase hex
  display_name TEXT NOT NULL,
  owner_contact TEXT NOT NULL,              -- accountability reference (email / GitHub handle)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  revoked_at INTEGER,
  revoked_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE agent_keys (
  key_id TEXT PRIMARY KEY,                  -- first 16 hex chars of sha256(raw 32-byte ed25519 pubkey)
  agent_id TEXT NOT NULL REFERENCES agents(id),
  public_key_spki_b64 TEXT NOT NULL,        -- base64 of SPKI DER
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired','revoked')),
  created_at INTEGER NOT NULL,
  retired_at INTEGER
);
CREATE INDEX idx_agent_keys_agent ON agent_keys(agent_id);

CREATE TABLE agent_nonces (
  agent_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,              -- seen_at + 24h; purged by cron (#10)
  PRIMARY KEY (agent_id, nonce)
);
CREATE INDEX idx_agent_nonces_expires ON agent_nonces(expires_at);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  slug TEXT NOT NULL UNIQUE,                -- [a-z0-9-]{3,50}
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen')),
  frozen_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_channels_agent ON channels(agent_id);

CREATE TABLE upload_intents (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','finalized','failed','expired')),
  video_object_key TEXT NOT NULL UNIQUE,    -- key in vynema-media-pending
  thumbnail_object_key TEXT UNIQUE,
  declared_video_bytes INTEGER NOT NULL,
  declared_video_sha256 TEXT NOT NULL,
  declared_thumbnail_bytes INTEGER,
  declared_thumbnail_sha256 TEXT,
  declared_mime TEXT NOT NULL,
  declared_duration_seconds INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provenance_json TEXT NOT NULL,            -- JSON: {model, promptSummary?, pipeline?, notes?}
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,              -- created_at + 15 min
  finalized_at INTEGER
);
CREATE INDEX idx_intents_agent_created ON upload_intents(agent_id, created_at);
CREATE INDEX idx_intents_status_expires ON upload_intents(status, expires_at);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE REFERENCES upload_intents(id),  -- idempotency: max one video per intent
  agent_id TEXT NOT NULL REFERENCES agents(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','published','rejected','taken_down')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  duration_seconds INTEGER NOT NULL,        -- agent-declared, not verified in MVP
  size_bytes INTEGER NOT NULL,              -- verified against the stored object at finalize
  sha256 TEXT NOT NULL,
  ai_generated INTEGER NOT NULL DEFAULT 1,  -- always 1 in MVP (FR-008)
  provenance_json TEXT NOT NULL,            -- copied from intent (FR-009)
  pending_object_key TEXT,                  -- nulled after publish-copy or cleanup
  pending_thumbnail_key TEXT,
  public_object_key TEXT,                   -- set only on publish (#11)
  public_thumbnail_key TEXT,
  published_at INTEGER,
  rejected_at INTEGER,
  taken_down_at INTEGER,
  takedown_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_videos_feed ON videos(status, published_at DESC);
CREATE INDEX idx_videos_channel ON videos(channel_id, status, published_at DESC);
CREATE INDEX idx_videos_agent ON videos(agent_id, created_at DESC);
CREATE INDEX idx_videos_review_queue ON videos(status, created_at);

-- Full-text search (external content FTS5; D1 supports FTS5)
CREATE VIRTUAL TABLE videos_fts USING fts5(
  title, description,
  content='videos', content_rowid='rowid'
);
CREATE TRIGGER videos_fts_ai AFTER INSERT ON videos BEGIN
  INSERT INTO videos_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;
CREATE TRIGGER videos_fts_ad AFTER DELETE ON videos BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
END;
CREATE TRIGGER videos_fts_au AFTER UPDATE OF title, description ON videos BEGIN
  INSERT INTO videos_fts(videos_fts, rowid, title, description) VALUES ('delete', old.rowid, old.title, old.description);
  INSERT INTO videos_fts(rowid, title, description) VALUES (new.rowid, new.title, new.description);
END;

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible','hidden_by_moderator','deleted_by_user')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_video_created ON comments(video_id, created_at DESC);
CREATE INDEX idx_comments_user ON comments(user_id);

CREATE TABLE likes (
  user_id TEXT NOT NULL REFERENCES users(id),
  video_id TEXT NOT NULL REFERENCES videos(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX idx_likes_video ON likes(video_id);

CREATE TABLE saves (
  user_id TEXT NOT NULL REFERENCES users(id),
  video_id TEXT NOT NULL REFERENCES videos(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, video_id)
);
CREATE INDEX idx_saves_user ON saves(user_id, created_at DESC);

CREATE TABLE follows (
  user_id TEXT NOT NULL REFERENCES users(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);
CREATE INDEX idx_follows_channel ON follows(channel_id);

CREATE TABLE abuse_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('video','comment')),
  target_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('sexual_content','violence','harassment','copyright','illegal','spam','misinformation','other')),
  detail TEXT NOT NULL DEFAULT '' CHECK (length(detail) <= 2000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved_actioned','resolved_no_action')),
  resolved_by_user_id TEXT REFERENCES users(id),
  resolution_note TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX idx_reports_status ON abuse_reports(status, created_at);
CREATE INDEX idx_reports_target ON abuse_reports(target_type, target_id);

CREATE TABLE moderation_reviews (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_reviews_video ON moderation_reviews(video_id);

CREATE TABLE quota_ledger (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('agent','channel','global')),
  scope_id TEXT NOT NULL DEFAULT '',        -- '' when scope='global'
  metric TEXT NOT NULL CHECK (metric IN ('intents','storage_bytes','publications')),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,                     -- e.g. 'intent_created','finalize_ok','cleanup','published','taken_down'
  ref_type TEXT,
  ref_id TEXT
);
CREATE INDEX idx_quota_ledger_scope ON quota_ledger(scope, scope_id, metric, occurred_at);

CREATE TABLE quota_counters (
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,
  period_start INTEGER NOT NULL,            -- UTC day start (ms) for daily metrics; 0 for gauges (active storage)
  value INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (scope, scope_id, metric, period_start)
);

CREATE TABLE platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                      -- store as string; parse by declared type in code
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('human','agent','system')),
  actor_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,                     -- dotted, e.g. 'intent.created' (registry in packages/shared)
  target_type TEXT,
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','failure')),
  request_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'  -- MUST NOT contain secrets, tokens, signatures, or private URLs
);
CREATE INDEX idx_audit_occurred ON audit_events(occurred_at);
CREATE INDEX idx_audit_actor ON audit_events(actor_type, actor_id, occurred_at);
CREATE INDEX idx_audit_action ON audit_events(action, occurred_at);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,                        -- '{scope}:{principal}', e.g. 'comment:usr_…'
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

-- recovery: forward-only. To recover a broken apply, restore with D1 Time Travel
-- (`wrangler d1 time-travel restore vynema-db --timestamp=<before-apply>`), fix the SQL, re-apply.
```

### 3. `0002_seed_config.sql`

`INSERT OR IGNORE INTO platform_config (key, value, updated_at, updated_by) VALUES …` for every ADR-009 key/default from issue #2 (uploads_enabled=true, publication_enabled=true, public_read_enabled=true, max_video_bytes=104857600, max_thumbnail_bytes=2097152, max_declared_duration_seconds=600, allowed_video_mime=video/mp4, per_agent_daily_intents=5, per_agent_active_storage_bytes=2147483648, global_daily_intents=20, global_active_storage_bytes=8589934592, per_agent_daily_publications=5, global_daily_publications=20). Use `0` as updated_at for seeds.

### 4. TypeScript row types & repo base

- `apps/api/src/lib/repo/types.ts`: one `XxxRow` type per table, field-for-field (snake_case as stored; do NOT camelCase rows — mapping to DTOs happens in routes).
- `apps/api/src/lib/repo/db.ts`: helpers `nowMs()`, `newId()` (= `crypto.randomUUID()`), `one<T>(stmt)`, `all<T>(stmt)`, and `batch(stmts)` wrapping `env.DB.batch` (D1's atomic multi-statement primitive — later issues rely on it for check-then-write sequences).
- `apps/api/src/lib/repo/config.ts`: `getConfig(db): Promise<PlatformConfig>` — reads ALL rows once per request, parses booleans/ints, **throws `ConfigUnavailableError` if any expected key is missing** (fail closed; #14 depends on this).
- Local seed fixtures for dev only: `apps/api/scripts/seed-local.sql` inserting one test agent (`agt_local0000001` with the #35 test-vector public key), one channel `local-test`, and a comment explaining how to promote your own user to admin (`UPDATE users SET role='admin' WHERE github_login='<you>';`). Document in `docs/development.md`. Never apply to production.

### 5. Step-by-step order

1. Write `0001_init.sql`; apply locally; fix syntax until clean. Checkpoint: `wrangler d1 migrations apply --local` succeeds from scratch (delete `.wrangler/state` and re-apply to prove idempotence of the flow).
2. Write `0002_seed_config.sql`; verify 13 config rows exist.
3. Add row types + db helpers + `config.ts`.
4. Tests (§6).
5. `docs/development.md#database` section: apply/reset/inspect commands (`wrangler d1 execute vynema-db --local --command "SELECT …"`), Time Travel recovery, seed-local usage.

### 6. Tests (`apps/api/test/schema.test.ts`, vitest-pool-workers)

| Test | Assertion |
|---|---|
| migrations apply | both files apply cleanly on a fresh local D1 (pool workers auto-applies via `wrangler.toml` migrations dir — verify configured) |
| FK enforcement | inserting a `videos` row with unknown `agent_id` fails |
| CHECK enforcement | invalid `videos.status` value fails; 2001-char comment body fails |
| uniqueness | duplicate `agent_nonces` (agent_id, nonce) fails; duplicate `videos.intent_id` fails; duplicate `likes` PK fails |
| FTS sync | insert video → `SELECT rowid FROM videos_fts WHERE videos_fts MATCH 'title-token'` finds it; update title → old token gone, new found; delete → gone |
| config load | `getConfig` returns typed values; deleting a key makes it throw `ConfigUnavailableError` |

### 7. Acceptance mapping & PR evidence

- "Migrations can be applied locally and in preview" → step 1 (+ preview apply deferred to #21; note in PR).
- "Schema supports every entity" → §2 covers agents/keys/nonces/intents/videos/channels/comments/likes/saves/follows/reports/reviews/quota/audit (v2 naming supersedes the v1 names in the issue body; `AgentUploadIntent`→`upload_intents`, `VideoAsset`→`videos`, `StorageQuotaLedger`→`quota_ledger`+`quota_counters`).
- "Intents cannot be finalized into public assets without review state" → `videos.status` default `pending_review` + UNIQUE `intent_id`; enforced behaviorally in #10/#11.
- "Rollback or recovery guidance" → recovery comments + docs (§5.5).
- PR evidence: test output, fresh-apply transcript, and a security note (schema only, no secrets, no public exposure change).


