-- Conventions: PK = uuid v4 TEXT unless noted; timestamps INTEGER epoch ms.

CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','reviewer','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','banned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT NOT NULL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE           -- hex sha256 of the cookie token; raw token never stored
    CHECK (typeof(token_hash) = 'text' AND length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE agents (
  id TEXT NOT NULL PRIMARY KEY,             -- 'agt_' + 12 lowercase hex
  display_name TEXT NOT NULL,
  owner_contact TEXT NOT NULL,              -- accountability reference (email / GitHub handle)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  revoked_at INTEGER,
  revoked_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE agent_keys (
  key_id TEXT NOT NULL PRIMARY KEY,         -- first 16 hex chars of sha256(raw 32-byte ed25519 pubkey)
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
  expires_at INTEGER NOT NULL,              -- seen_at + 24h; purged by #10 cleanup job
  PRIMARY KEY (agent_id, nonce)
);
CREATE INDEX idx_agent_nonces_expires ON agent_nonces(expires_at);

CREATE TABLE channels (
  id TEXT NOT NULL PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  slug TEXT NOT NULL UNIQUE,                -- [a-z0-9-]{3,50}
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen')),
  frozen_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (id, agent_id)
);
CREATE INDEX idx_channels_agent ON channels(agent_id);

CREATE TABLE upload_intents (
  id TEXT NOT NULL PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','finalized','failed','expired')),
  declared_video_bytes INTEGER NOT NULL,
  declared_video_sha256 TEXT NOT NULL,
  declared_thumbnail_bytes INTEGER,
  declared_thumbnail_sha256 TEXT,
  declared_thumbnail_mime TEXT,
  declared_mime TEXT NOT NULL CHECK (declared_mime = 'video/mp4'),
  declared_duration_seconds INTEGER NOT NULL CHECK (typeof(declared_duration_seconds) = 'integer'),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provenance_json TEXT NOT NULL,            -- JSON: {model, promptSummary?, pipeline?, notes?}
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,              -- created_at + 15 min
  finalized_at INTEGER,
  CHECK (typeof(declared_video_bytes) = 'integer' AND declared_video_bytes >= 1024),
  CHECK (typeof(declared_video_sha256) = 'text' AND length(declared_video_sha256) = 64
    AND declared_video_sha256 NOT GLOB '*[^0-9a-f]*'),
  CHECK (
    (declared_thumbnail_bytes IS NULL AND declared_thumbnail_sha256 IS NULL AND declared_thumbnail_mime IS NULL)
    OR
    (declared_thumbnail_bytes IS NOT NULL AND typeof(declared_thumbnail_bytes) = 'integer'
      AND declared_thumbnail_bytes > 0
      AND declared_thumbnail_sha256 IS NOT NULL AND typeof(declared_thumbnail_sha256) = 'text'
      AND length(declared_thumbnail_sha256) = 64
      AND declared_thumbnail_sha256 NOT GLOB '*[^0-9a-f]*'
      AND declared_thumbnail_mime IS NOT NULL
      AND declared_thumbnail_mime IN ('image/jpeg','image/png'))
  ),
  FOREIGN KEY (channel_id, agent_id) REFERENCES channels(id, agent_id)
);
CREATE INDEX idx_intents_agent_created ON upload_intents(agent_id, created_at);
CREATE INDEX idx_intents_status_expires ON upload_intents(status, expires_at);

-- Development-only media capabilities. Only token hashes are persisted.
CREATE TABLE upload_capabilities (
  id TEXT NOT NULL PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES upload_intents(id),
  kind TEXT NOT NULL CHECK (kind IN ('video','thumbnail')),
  token_sha256 TEXT NOT NULL UNIQUE
    CHECK (typeof(token_sha256) = 'text' AND length(token_sha256) = 64
      AND token_sha256 NOT GLOB '*[^0-9a-f]*'),
  expected_size_bytes INTEGER NOT NULL CHECK (typeof(expected_size_bytes) = 'integer'
    AND expected_size_bytes > 0),
  expected_sha256 TEXT NOT NULL CHECK (typeof(expected_sha256) = 'text'
    AND length(expected_sha256) = 64 AND expected_sha256 NOT GLOB '*[^0-9a-f]*'),
  expected_mime TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK ((kind = 'video' AND expected_mime = 'video/mp4') OR
         (kind = 'thumbnail' AND expected_mime IN ('image/jpeg','image/png'))),
  CHECK (used_at IS NULL OR (claimed_at IS NOT NULL AND used_at >= claimed_at)),
  UNIQUE(intent_id, kind)
);
CREATE INDEX idx_upload_capabilities_expires ON upload_capabilities(expires_at);

CREATE TRIGGER upload_capability_expected_metadata
BEFORE INSERT ON upload_capabilities BEGIN
  SELECT CASE WHEN NEW.claimed_at IS NOT NULL OR NEW.used_at IS NOT NULL
    THEN RAISE(ABORT, 'new upload capability must be unused') END;
  SELECT CASE WHEN NEW.kind = 'video' AND NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.declared_video_bytes = NEW.expected_size_bytes
      AND i.declared_video_sha256 = NEW.expected_sha256
      AND i.declared_mime = NEW.expected_mime
  ) THEN RAISE(ABORT, 'video capability metadata mismatch') END;
  SELECT CASE WHEN NEW.kind = 'thumbnail' AND NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.declared_thumbnail_bytes = NEW.expected_size_bytes
      AND i.declared_thumbnail_sha256 = NEW.expected_sha256
      AND i.declared_thumbnail_mime = NEW.expected_mime
  ) THEN RAISE(ABORT, 'thumbnail capability metadata mismatch') END;
END;
CREATE TRIGGER upload_capability_scope_immutable
BEFORE UPDATE OF id, intent_id, kind, token_sha256, expected_size_bytes, expected_sha256, expected_mime, expires_at, created_at
ON upload_capabilities BEGIN
  SELECT RAISE(ABORT, 'upload capability scope is immutable');
END;
CREATE TRIGGER upload_capability_complete_requires_blob
BEFORE UPDATE OF used_at ON upload_capabilities
WHEN NEW.used_at IS NOT NULL AND OLD.used_at IS NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM media_blobs b WHERE b.intent_id = NEW.intent_id
      AND b.kind = NEW.kind AND b.size_bytes = NEW.expected_size_bytes
      AND b.sha256 = NEW.expected_sha256 AND b.mime = NEW.expected_mime
  ) THEN RAISE(ABORT, 'completed capability requires verified media blob') END;
  SELECT CASE WHEN NEW.used_at > NEW.expires_at OR NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.status = 'created' AND i.expires_at >= NEW.used_at
  ) THEN RAISE(ABORT, 'completed capability requires live intent') END;
END;
CREATE TRIGGER upload_capability_state_monotonic
BEFORE UPDATE OF claimed_at, used_at ON upload_capabilities
WHEN (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS NOT OLD.claimed_at)
  OR (OLD.used_at IS NOT NULL AND NEW.used_at IS NOT OLD.used_at) BEGIN
  SELECT RAISE(ABORT, 'upload capability state is monotonic');
END;
CREATE TRIGGER upload_intent_declaration_immutable
BEFORE UPDATE OF declared_video_bytes, declared_video_sha256, declared_mime,
  declared_thumbnail_bytes, declared_thumbnail_sha256, declared_thumbnail_mime
ON upload_intents WHEN EXISTS (
  SELECT 1 FROM upload_capabilities c WHERE c.intent_id = OLD.id
) BEGIN
  SELECT RAISE(ABORT, 'upload declaration is immutable after capability issuance');
END;
CREATE TRIGGER upload_intent_scope_immutable
BEFORE UPDATE OF agent_id, channel_id
ON upload_intents WHEN EXISTS (
  SELECT 1 FROM upload_capabilities c WHERE c.intent_id = OLD.id
) OR EXISTS (
  SELECT 1 FROM media_blobs b WHERE b.intent_id = OLD.id
) OR EXISTS (
  SELECT 1 FROM videos v WHERE v.intent_id = OLD.id
) BEGIN
  SELECT RAISE(ABORT, 'upload intent scope is immutable after downstream issuance');
END;

-- Development media store. The StorageAdapter is the only module that reads or
-- writes this table; production provider/migration selection is issue #42.
CREATE TABLE media_blobs (
  id TEXT NOT NULL PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES upload_intents(id),
  kind TEXT NOT NULL CHECK (kind IN ('video','thumbnail')),
  content BLOB NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (typeof(size_bytes) = 'integer' AND size_bytes > 0),
  sha256 TEXT NOT NULL CHECK (typeof(sha256) = 'text' AND length(sha256) = 64
    AND sha256 NOT GLOB '*[^0-9a-f]*'),
  mime TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(intent_id, kind),
  CHECK (length(content) = size_bytes)
);
CREATE UNIQUE INDEX uq_media_blobs_identity ON media_blobs(id, intent_id, kind);
CREATE INDEX idx_media_blobs_intent ON media_blobs(intent_id);

CREATE TRIGGER media_blob_expected_metadata
BEFORE INSERT ON media_blobs BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM upload_capabilities c
    JOIN upload_intents i ON i.id = c.intent_id
    WHERE c.intent_id = NEW.intent_id AND i.status = 'created'
      AND c.kind = NEW.kind AND c.claimed_at IS NOT NULL AND c.used_at IS NULL
      AND c.expected_size_bytes = NEW.size_bytes
      AND c.expected_sha256 = NEW.sha256 AND c.expected_mime = NEW.mime
  ) THEN RAISE(ABORT, 'media blob metadata or capability mismatch') END;
END;
CREATE TRIGGER media_blob_immutable
BEFORE UPDATE OF intent_id, kind, content, size_bytes, sha256, mime
ON media_blobs BEGIN
  SELECT RAISE(ABORT, 'media blob is immutable');
END;

CREATE TABLE videos (
  id TEXT NOT NULL PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE REFERENCES upload_intents(id),  -- idempotency: max one video per intent
  agent_id TEXT NOT NULL REFERENCES agents(id),
  channel_id TEXT NOT NULL REFERENCES channels(id),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','published','rejected','taken_down')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  duration_seconds INTEGER NOT NULL CHECK (typeof(duration_seconds) = 'integer'), -- agent-declared, not verified in MVP
  size_bytes INTEGER NOT NULL CHECK (typeof(size_bytes) = 'integer'), -- verified against the stored object at finalize
  sha256 TEXT NOT NULL CHECK (typeof(sha256) = 'text' AND length(sha256) = 64
    AND sha256 NOT GLOB '*[^0-9a-f]*'),
  ai_generated INTEGER NOT NULL DEFAULT 1 CHECK (ai_generated = 1), -- always 1 in MVP (FR-008)
  provenance_json TEXT NOT NULL,            -- copied from intent (FR-009)
  video_blob_id TEXT REFERENCES media_blobs(id),      -- immutable development media
  thumbnail_blob_id TEXT REFERENCES media_blobs(id),
  published_at INTEGER,
  rejected_at INTEGER,
  taken_down_at INTEGER,
  takedown_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    (status = 'pending_review' AND published_at IS NULL AND rejected_at IS NULL AND taken_down_at IS NULL)
    OR (status = 'published' AND video_blob_id IS NOT NULL AND published_at IS NOT NULL AND rejected_at IS NULL AND taken_down_at IS NULL)
    OR (status = 'rejected' AND published_at IS NULL AND rejected_at IS NOT NULL AND taken_down_at IS NULL)
    OR (status = 'taken_down' AND video_blob_id IS NOT NULL AND published_at IS NOT NULL AND rejected_at IS NULL AND taken_down_at IS NOT NULL)
  )
);
CREATE INDEX idx_videos_feed ON videos(status, published_at DESC);
CREATE INDEX idx_videos_channel ON videos(channel_id, status, published_at DESC);
CREATE INDEX idx_videos_agent ON videos(agent_id, created_at DESC);
CREATE INDEX idx_videos_review_queue ON videos(status, created_at);

-- Bind each media reference to this video's intent and required kind. The
-- default FK delete action remains RESTRICT; cleanup must clear an eligible
-- rejected/failed video's reference and delete its BLOB in one transaction.
CREATE TRIGGER videos_media_refs_insert
BEFORE INSERT ON videos BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.agent_id = NEW.agent_id AND i.channel_id = NEW.channel_id
  ) THEN RAISE(ABORT, 'video intent ownership mismatch') END;
  SELECT CASE WHEN NEW.video_blob_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_blobs b
    WHERE b.id = NEW.video_blob_id AND b.intent_id = NEW.intent_id AND b.kind = 'video'
      AND b.size_bytes = NEW.size_bytes AND b.sha256 = NEW.sha256 AND b.mime = 'video/mp4'
  ) THEN RAISE(ABORT, 'invalid video blob reference') END;
  SELECT CASE WHEN NEW.thumbnail_blob_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_blobs b
    WHERE b.id = NEW.thumbnail_blob_id AND b.intent_id = NEW.intent_id AND b.kind = 'thumbnail'
  ) THEN RAISE(ABORT, 'invalid thumbnail blob reference') END;
END;
CREATE TRIGGER videos_media_refs_update
BEFORE UPDATE OF intent_id, agent_id, channel_id, video_blob_id, thumbnail_blob_id,
  size_bytes, sha256, status ON videos BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.agent_id = NEW.agent_id AND i.channel_id = NEW.channel_id
  ) THEN RAISE(ABORT, 'video intent ownership mismatch') END;
  SELECT CASE WHEN NEW.video_blob_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_blobs b
    WHERE b.id = NEW.video_blob_id AND b.intent_id = NEW.intent_id AND b.kind = 'video'
      AND b.size_bytes = NEW.size_bytes AND b.sha256 = NEW.sha256 AND b.mime = 'video/mp4'
  ) THEN RAISE(ABORT, 'invalid video blob reference') END;
  SELECT CASE WHEN NEW.thumbnail_blob_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_blobs b
    WHERE b.id = NEW.thumbnail_blob_id AND b.intent_id = NEW.intent_id AND b.kind = 'thumbnail'
  ) THEN RAISE(ABORT, 'invalid thumbnail blob reference') END;
END;

-- Full-text search. The migration runner selects this FTS5 block when the
-- bundled SQLite exposes FTS5 and installs a synchronized portable table when
-- the supported Node 22.13 Linux build does not.
-- vynema:fts5:start
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
-- vynema:fts5:end

CREATE TABLE comments (
  id TEXT NOT NULL PRIMARY KEY,
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
  id TEXT NOT NULL PRIMARY KEY,
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
  id TEXT NOT NULL PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id),
  reviewer_user_id TEXT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_reviews_video ON moderation_reviews(video_id);

CREATE TRIGGER videos_no_direct_publish
BEFORE INSERT ON videos WHEN NEW.status = 'published' BEGIN
  SELECT RAISE(ABORT, 'published videos must transition from review');
END;
CREATE TRIGGER videos_publish_requires_approval
BEFORE UPDATE OF status ON videos
WHEN NEW.status = 'published' AND OLD.status <> 'published' BEGIN
  SELECT CASE WHEN OLD.status <> 'pending_review'
    THEN RAISE(ABORT, 'published videos must transition from pending review') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM moderation_reviews r
    JOIN users u ON u.id = r.reviewer_user_id
    WHERE r.video_id = OLD.id AND r.decision = 'approved'
      AND u.status = 'active' AND u.role IN ('reviewer','admin')
  ) THEN RAISE(ABORT, 'published videos require an approval review') END;
END;

CREATE TABLE quota_ledger (
  id TEXT NOT NULL PRIMARY KEY,
  occurred_at INTEGER NOT NULL CHECK (typeof(occurred_at) = 'integer'),
  scope TEXT NOT NULL CHECK (scope IN ('agent','channel','global')),
  scope_id TEXT NOT NULL DEFAULT '',        -- '' when scope='global'
  metric TEXT NOT NULL CHECK (metric IN ('intents','storage_bytes','publications')),
  period_start INTEGER NOT NULL CHECK (typeof(period_start) = 'integer'), -- same period key as the counter mutation
  delta INTEGER NOT NULL CHECK (typeof(delta) = 'integer'),
  reason TEXT NOT NULL,                     -- e.g. 'intent_created','finalize_ok','cleanup','published','taken_down'
  ref_type TEXT,
  ref_id TEXT,
  CHECK (
    (scope = 'global' AND scope_id = '')
    OR (scope IN ('agent','channel') AND length(scope_id) > 0)
  )
);
CREATE INDEX idx_quota_ledger_scope ON quota_ledger(scope, scope_id, metric, period_start, occurred_at);

CREATE TABLE quota_counters (
  scope TEXT NOT NULL CHECK (scope IN ('agent','channel','global')),
  scope_id TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL CHECK (metric IN ('intents','storage_bytes','publications')),
  period_start INTEGER NOT NULL CHECK (typeof(period_start) = 'integer'), -- UTC day start (ms) for daily metrics; 0 for gauges (active storage)
  value INTEGER NOT NULL CHECK (typeof(value) = 'integer' AND value >= 0),
  updated_at INTEGER NOT NULL CHECK (typeof(updated_at) = 'integer'),
  PRIMARY KEY (scope, scope_id, metric, period_start),
  CHECK (
    (scope = 'global' AND scope_id = '')
    OR (scope IN ('agent','channel') AND length(scope_id) > 0)
  )
);

CREATE TABLE platform_config (
  key TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,                      -- store as string; parse by declared type in code
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE audit_events (
  id TEXT NOT NULL PRIMARY KEY,
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

-- recovery: forward-only. Restore the timestamped pre-migration SQLite backup,
-- fix the SQL, and re-apply. Never partially edit an applied migration.
