-- Fix-forward guards for invariants already required by the upload,
-- finalization, publication, and rate-limit designs. Applied migrations remain
-- immutable; existing tables and retained rows are not rewritten.

-- Prospective triggers cannot repair invalid rows retained from v2. Audit the
-- current-state evidence that v3 can enforce before installing any guard. The
-- migration runner wraps this file, its ledger write, and user_version update
-- in one transaction, so any violation rolls the whole migration back.
CREATE TEMP TABLE vynema_v3_legacy_preflight (
  violation TEXT NOT NULL
) STRICT;

CREATE TEMP TRIGGER vynema_v3_legacy_preflight_abort
BEFORE INSERT ON vynema_v3_legacy_preflight BEGIN
  SELECT CASE NEW.violation
    WHEN 'identity' THEN RAISE(ABORT, 'legacy v2 identity keys must use text storage')
    WHEN 'upload' THEN RAISE(ABORT, 'legacy v2 upload rows violate v3 invariants')
    WHEN 'publication' THEN RAISE(ABORT, 'legacy v2 publication rows violate v3 invariants')
    WHEN 'rate-limit' THEN RAISE(ABORT, 'legacy v2 rate-limit rows violate v3 invariants')
    ELSE RAISE(ABORT, 'legacy v2 rows violate v3 invariants')
  END;
END;

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'identity' WHERE EXISTS (
  SELECT 1 FROM users WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM sessions WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM agents WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM agent_keys WHERE typeof(key_id) <> 'text'
  UNION ALL SELECT 1 FROM agent_nonces
    WHERE typeof(agent_id) <> 'text' OR typeof(nonce) <> 'text'
  UNION ALL SELECT 1 FROM channels WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM upload_intents WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM upload_capabilities WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM media_blobs WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM videos WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM comments WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM likes
    WHERE typeof(user_id) <> 'text' OR typeof(video_id) <> 'text'
  UNION ALL SELECT 1 FROM saves
    WHERE typeof(user_id) <> 'text' OR typeof(video_id) <> 'text'
  UNION ALL SELECT 1 FROM follows
    WHERE typeof(user_id) <> 'text' OR typeof(channel_id) <> 'text'
  UNION ALL SELECT 1 FROM abuse_reports WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM moderation_reviews WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM quota_ledger WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM quota_counters
    WHERE typeof(scope) <> 'text' OR typeof(scope_id) <> 'text'
      OR typeof(metric) <> 'text'
  UNION ALL SELECT 1 FROM platform_config WHERE typeof(key) <> 'text'
  UNION ALL SELECT 1 FROM audit_events WHERE typeof(id) <> 'text'
  UNION ALL SELECT 1 FROM rate_limits WHERE typeof(key) <> 'text'
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'upload' WHERE EXISTS (
  SELECT 1 FROM upload_intents i
  WHERE json_valid(i.provenance_json) <> 1
    OR (i.status <> 'finalized' AND i.finalized_at IS NOT NULL)
) OR EXISTS (
  SELECT 1 FROM videos v
  WHERE json_valid(v.provenance_json) <> 1 OR NOT EXISTS (
    SELECT 1 FROM upload_intents i
    WHERE i.id = v.intent_id AND i.provenance_json = v.provenance_json
  )
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'upload' WHERE EXISTS (
  SELECT 1 FROM upload_capabilities c
  WHERE (c.claimed_at IS NOT NULL AND (
    c.claimed_at < c.created_at OR c.claimed_at > c.expires_at OR NOT EXISTS (
      SELECT 1 FROM upload_intents i WHERE i.id = c.intent_id
        AND c.claimed_at >= i.created_at AND c.claimed_at <= i.expires_at
    )
  )) OR (c.used_at IS NOT NULL AND (
    c.claimed_at IS NULL OR c.used_at < c.claimed_at OR c.used_at > c.expires_at
    OR NOT EXISTS (
      SELECT 1 FROM upload_intents i
      WHERE i.id = c.intent_id AND c.used_at <= i.expires_at
    )
  )) OR (c.kind = 'video' AND NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = c.intent_id
      AND i.declared_video_bytes = c.expected_size_bytes
      AND i.declared_video_sha256 = c.expected_sha256
      AND i.declared_mime = c.expected_mime
  )) OR (c.kind = 'thumbnail' AND NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = c.intent_id
      AND i.declared_thumbnail_bytes = c.expected_size_bytes
      AND i.declared_thumbnail_sha256 = c.expected_sha256
      AND i.declared_thumbnail_mime = c.expected_mime
  ))
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'upload' WHERE EXISTS (
  SELECT 1 FROM media_blobs b
  WHERE NOT EXISTS (
    SELECT 1 FROM upload_capabilities c
    JOIN upload_intents i ON i.id = c.intent_id
    WHERE c.intent_id = b.intent_id AND c.kind = b.kind
      AND c.claimed_at IS NOT NULL
      AND b.created_at >= c.claimed_at AND b.created_at <= c.expires_at
      AND b.created_at <= i.expires_at
      AND c.expected_size_bytes = b.size_bytes
      AND c.expected_sha256 = b.sha256 AND c.expected_mime = b.mime
  ) AND NOT EXISTS (
    SELECT 1 FROM videos v
    JOIN upload_intents i ON i.id = v.intent_id
    WHERE i.status = 'finalized' AND b.intent_id = i.id
      AND NOT EXISTS (
        SELECT 1 FROM upload_capabilities c
        WHERE c.intent_id = b.intent_id AND c.kind = b.kind
      )
      AND b.created_at >= i.created_at AND b.created_at <= i.finalized_at
      AND b.created_at <= v.created_at
      AND v.provenance_json = i.provenance_json AND (
        (b.kind = 'video' AND v.video_blob_id = b.id
          AND b.size_bytes = i.declared_video_bytes
          AND b.sha256 = i.declared_video_sha256 AND b.mime = i.declared_mime)
        OR (b.kind = 'thumbnail' AND v.thumbnail_blob_id = b.id
          AND b.size_bytes = i.declared_thumbnail_bytes
          AND b.sha256 = i.declared_thumbnail_sha256
          AND b.mime = i.declared_thumbnail_mime)
      )
  )
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'upload' WHERE EXISTS (
  SELECT 1 FROM upload_capabilities c
  WHERE c.used_at IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM media_blobs b
    WHERE b.intent_id = c.intent_id AND b.kind = c.kind
      AND b.created_at >= c.claimed_at AND b.created_at <= c.used_at
      AND b.size_bytes = c.expected_size_bytes
      AND b.sha256 = c.expected_sha256 AND b.mime = c.expected_mime
  ) AND NOT EXISTS (
    SELECT 1 FROM upload_intents i
    LEFT JOIN videos v ON v.intent_id = i.id
    WHERE i.id = c.intent_id AND (
      i.status IN ('failed', 'expired') OR (
        i.status = 'finalized' AND v.status = 'rejected' AND (
          (c.kind = 'video' AND v.video_blob_id IS NULL)
          OR (c.kind = 'thumbnail' AND v.thumbnail_blob_id IS NULL)
        )
      )
    )
  )
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'upload' WHERE EXISTS (
  SELECT 1 FROM upload_intents i
  WHERE i.status = 'finalized' AND (
    i.finalized_at IS NULL OR i.finalized_at < i.created_at
    OR i.finalized_at > i.expires_at OR NOT EXISTS (
      SELECT 1 FROM videos v
      WHERE v.intent_id = i.id AND v.created_at >= i.created_at
        AND v.created_at <= i.finalized_at
        AND v.duration_seconds = i.declared_duration_seconds
        AND v.size_bytes = i.declared_video_bytes
        AND v.sha256 = i.declared_video_sha256
        AND v.provenance_json = i.provenance_json
        AND ((v.status = 'rejected' AND v.video_blob_id IS NULL) OR EXISTS (
          SELECT 1 FROM media_blobs b WHERE b.id = v.video_blob_id
            AND b.intent_id = i.id AND b.kind = 'video'
            AND b.created_at <= v.created_at
            AND b.size_bytes = i.declared_video_bytes
            AND b.sha256 = i.declared_video_sha256 AND b.mime = i.declared_mime
        ))
        AND (NOT EXISTS (
          SELECT 1 FROM upload_capabilities c
          WHERE c.intent_id = i.id AND c.kind = 'video'
        ) OR EXISTS (
          SELECT 1 FROM upload_capabilities c
          WHERE c.intent_id = i.id AND c.kind = 'video'
            AND c.used_at IS NOT NULL AND c.used_at <= v.created_at
        ))
        AND (i.declared_thumbnail_bytes IS NULL
          OR (v.status = 'rejected' AND v.thumbnail_blob_id IS NULL)
          OR EXISTS (
            SELECT 1 FROM media_blobs b WHERE b.id = v.thumbnail_blob_id
              AND b.intent_id = i.id AND b.kind = 'thumbnail'
              AND b.created_at <= v.created_at
              AND b.size_bytes = i.declared_thumbnail_bytes
              AND b.sha256 = i.declared_thumbnail_sha256
              AND b.mime = i.declared_thumbnail_mime
          ))
        AND (i.declared_thumbnail_bytes IS NULL OR NOT EXISTS (
          SELECT 1 FROM upload_capabilities c
          WHERE c.intent_id = i.id AND c.kind = 'thumbnail'
        ) OR EXISTS (
          SELECT 1 FROM upload_capabilities c
          WHERE c.intent_id = i.id AND c.kind = 'thumbnail'
            AND c.used_at IS NOT NULL AND c.used_at <= v.created_at
        ))
    )
  )
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'publication' WHERE EXISTS (
  SELECT 1 FROM videos v
  WHERE v.status IN ('published', 'taken_down') AND (
    v.published_at < v.created_at
    OR (v.status = 'taken_down' AND v.taken_down_at < v.published_at)
    OR NOT EXISTS (
      SELECT 1 FROM upload_intents i WHERE i.id = v.intent_id
        AND i.status = 'finalized' AND i.finalized_at <= v.published_at
    ) OR NOT EXISTS (
      SELECT 1 FROM moderation_reviews r
      WHERE r.video_id = v.id AND r.decision = 'approved'
        AND r.created_at <= v.published_at
    )
  )
);

INSERT INTO vynema_v3_legacy_preflight (violation)
SELECT 'rate-limit' WHERE EXISTS (
  SELECT 1 FROM rate_limits WHERE window_start < 0 OR count < 0
);

DROP TRIGGER vynema_v3_legacy_preflight_abort;
DROP TABLE vynema_v3_legacy_preflight;

CREATE TRIGGER users_identity_storage_insert_v3
BEFORE INSERT ON users WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'users identity key must use text storage');
END;
CREATE TRIGGER users_identity_storage_update_v3
BEFORE UPDATE OF id ON users WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'users identity key must use text storage');
END;

CREATE TRIGGER sessions_identity_storage_insert_v3
BEFORE INSERT ON sessions WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'sessions identity key must use text storage');
END;
CREATE TRIGGER sessions_identity_storage_update_v3
BEFORE UPDATE OF id ON sessions WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'sessions identity key must use text storage');
END;

CREATE TRIGGER agents_identity_storage_insert_v3
BEFORE INSERT ON agents WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'agents identity key must use text storage');
END;
CREATE TRIGGER agents_identity_storage_update_v3
BEFORE UPDATE OF id ON agents WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'agents identity key must use text storage');
END;

CREATE TRIGGER agent_keys_identity_storage_insert_v3
BEFORE INSERT ON agent_keys WHEN typeof(NEW.key_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'agent_keys identity key must use text storage');
END;
CREATE TRIGGER agent_keys_identity_storage_update_v3
BEFORE UPDATE OF key_id ON agent_keys WHEN typeof(NEW.key_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'agent_keys identity key must use text storage');
END;

CREATE TRIGGER agent_nonces_identity_storage_insert_v3
BEFORE INSERT ON agent_nonces
WHEN typeof(NEW.agent_id) <> 'text' OR typeof(NEW.nonce) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'agent_nonces identity key must use text storage');
END;
CREATE TRIGGER agent_nonces_identity_storage_update_v3
BEFORE UPDATE OF agent_id, nonce ON agent_nonces
WHEN typeof(NEW.agent_id) <> 'text' OR typeof(NEW.nonce) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'agent_nonces identity key must use text storage');
END;

CREATE TRIGGER channels_identity_storage_insert_v3
BEFORE INSERT ON channels WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'channels identity key must use text storage');
END;
CREATE TRIGGER channels_identity_storage_update_v3
BEFORE UPDATE OF id ON channels WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'channels identity key must use text storage');
END;

CREATE TRIGGER upload_intents_identity_storage_insert_v3
BEFORE INSERT ON upload_intents WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'upload_intents identity key must use text storage');
END;
CREATE TRIGGER upload_intents_identity_storage_update_v3
BEFORE UPDATE OF id ON upload_intents WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'upload_intents identity key must use text storage');
END;

CREATE TRIGGER upload_capabilities_identity_storage_insert_v3
BEFORE INSERT ON upload_capabilities WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'upload_capabilities identity key must use text storage');
END;
CREATE TRIGGER upload_capabilities_identity_storage_update_v3
BEFORE UPDATE OF id ON upload_capabilities WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'upload_capabilities identity key must use text storage');
END;

CREATE TRIGGER media_blobs_identity_storage_insert_v3
BEFORE INSERT ON media_blobs WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'media_blobs identity key must use text storage');
END;
CREATE TRIGGER media_blobs_identity_storage_update_v3
BEFORE UPDATE OF id ON media_blobs WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'media_blobs identity key must use text storage');
END;

CREATE TRIGGER videos_identity_storage_insert_v3
BEFORE INSERT ON videos WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'videos identity key must use text storage');
END;
CREATE TRIGGER videos_identity_storage_update_v3
BEFORE UPDATE OF id ON videos WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'videos identity key must use text storage');
END;

CREATE TRIGGER comments_identity_storage_insert_v3
BEFORE INSERT ON comments WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'comments identity key must use text storage');
END;
CREATE TRIGGER comments_identity_storage_update_v3
BEFORE UPDATE OF id ON comments WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'comments identity key must use text storage');
END;

CREATE TRIGGER likes_identity_storage_insert_v3
BEFORE INSERT ON likes
WHEN typeof(NEW.user_id) <> 'text' OR typeof(NEW.video_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'likes identity key must use text storage');
END;
CREATE TRIGGER likes_identity_storage_update_v3
BEFORE UPDATE OF user_id, video_id ON likes
WHEN typeof(NEW.user_id) <> 'text' OR typeof(NEW.video_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'likes identity key must use text storage');
END;

CREATE TRIGGER saves_identity_storage_insert_v3
BEFORE INSERT ON saves
WHEN typeof(NEW.user_id) <> 'text' OR typeof(NEW.video_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'saves identity key must use text storage');
END;
CREATE TRIGGER saves_identity_storage_update_v3
BEFORE UPDATE OF user_id, video_id ON saves
WHEN typeof(NEW.user_id) <> 'text' OR typeof(NEW.video_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'saves identity key must use text storage');
END;

CREATE TRIGGER follows_identity_storage_insert_v3
BEFORE INSERT ON follows
WHEN typeof(NEW.user_id) <> 'text' OR typeof(NEW.channel_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'follows identity key must use text storage');
END;
CREATE TRIGGER follows_identity_storage_update_v3
BEFORE UPDATE OF user_id, channel_id ON follows
WHEN typeof(NEW.user_id) <> 'text' OR typeof(NEW.channel_id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'follows identity key must use text storage');
END;

CREATE TRIGGER abuse_reports_identity_storage_insert_v3
BEFORE INSERT ON abuse_reports WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'abuse_reports identity key must use text storage');
END;
CREATE TRIGGER abuse_reports_identity_storage_update_v3
BEFORE UPDATE OF id ON abuse_reports WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'abuse_reports identity key must use text storage');
END;

CREATE TRIGGER moderation_reviews_identity_storage_insert_v3
BEFORE INSERT ON moderation_reviews WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'moderation_reviews identity key must use text storage');
END;
CREATE TRIGGER moderation_reviews_identity_storage_update_v3
BEFORE UPDATE OF id ON moderation_reviews WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'moderation_reviews identity key must use text storage');
END;

CREATE TRIGGER quota_ledger_identity_storage_insert_v3
BEFORE INSERT ON quota_ledger WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'quota_ledger identity key must use text storage');
END;
CREATE TRIGGER quota_ledger_identity_storage_update_v3
BEFORE UPDATE OF id ON quota_ledger WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'quota_ledger identity key must use text storage');
END;

CREATE TRIGGER quota_counters_identity_storage_insert_v3
BEFORE INSERT ON quota_counters
WHEN typeof(NEW.scope) <> 'text' OR typeof(NEW.scope_id) <> 'text'
  OR typeof(NEW.metric) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'quota_counters identity key must use text storage');
END;
CREATE TRIGGER quota_counters_identity_storage_update_v3
BEFORE UPDATE OF scope, scope_id, metric ON quota_counters
WHEN typeof(NEW.scope) <> 'text' OR typeof(NEW.scope_id) <> 'text'
  OR typeof(NEW.metric) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'quota_counters identity key must use text storage');
END;

CREATE TRIGGER platform_config_identity_storage_insert_v3
BEFORE INSERT ON platform_config WHEN typeof(NEW.key) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'platform_config identity key must use text storage');
END;
CREATE TRIGGER platform_config_identity_storage_update_v3
BEFORE UPDATE OF key ON platform_config WHEN typeof(NEW.key) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'platform_config identity key must use text storage');
END;

CREATE TRIGGER audit_events_identity_storage_insert_v3
BEFORE INSERT ON audit_events WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'audit_events identity key must use text storage');
END;
CREATE TRIGGER audit_events_identity_storage_update_v3
BEFORE UPDATE OF id ON audit_events WHEN typeof(NEW.id) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'audit_events identity key must use text storage');
END;

CREATE TRIGGER rate_limits_identity_storage_insert_v3
BEFORE INSERT ON rate_limits WHEN typeof(NEW.key) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'rate_limits identity key must use text storage');
END;
CREATE TRIGGER rate_limits_identity_storage_update_v3
BEFORE UPDATE OF key ON rate_limits WHEN typeof(NEW.key) <> 'text' BEGIN
  SELECT RAISE(ABORT, 'rate_limits identity key must use text storage');
END;

CREATE TRIGGER upload_capability_claim_window_v3
BEFORE UPDATE OF claimed_at ON upload_capabilities
WHEN NEW.claimed_at IS NOT NULL AND OLD.claimed_at IS NULL BEGIN
  SELECT CASE WHEN NEW.claimed_at < NEW.created_at OR NEW.claimed_at > NEW.expires_at
    OR NOT EXISTS (
      SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
        AND i.status = 'created' AND NEW.claimed_at >= i.created_at
        AND NEW.claimed_at <= i.expires_at
    ) THEN RAISE(ABORT, 'upload capability claim requires a live intent') END;
END;

CREATE TRIGGER media_blob_authorization_window_v3
BEFORE INSERT ON media_blobs BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM upload_capabilities c
    JOIN upload_intents i ON i.id = c.intent_id
    WHERE c.intent_id = NEW.intent_id AND c.kind = NEW.kind
      AND c.claimed_at IS NOT NULL AND c.used_at IS NULL
      AND NEW.created_at >= c.claimed_at AND NEW.created_at <= c.expires_at
      AND NEW.created_at <= i.expires_at
  ) THEN RAISE(ABORT, 'media blob timestamp is outside its upload authorization') END;
END;

CREATE TRIGGER upload_capability_completion_order_v3
BEFORE UPDATE OF used_at ON upload_capabilities
WHEN NEW.used_at IS NOT NULL AND OLD.used_at IS NULL BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM media_blobs b WHERE b.intent_id = NEW.intent_id
      AND b.kind = NEW.kind AND b.size_bytes = NEW.expected_size_bytes
      AND b.sha256 = NEW.expected_sha256 AND b.mime = NEW.expected_mime
  ) AND NOT EXISTS (
    SELECT 1 FROM media_blobs b WHERE b.intent_id = NEW.intent_id
      AND b.kind = NEW.kind AND b.created_at >= NEW.claimed_at
      AND b.created_at <= NEW.used_at
      AND b.size_bytes = NEW.expected_size_bytes
      AND b.sha256 = NEW.expected_sha256 AND b.mime = NEW.expected_mime
  ) THEN RAISE(ABORT, 'completed capability requires ordered media evidence') END;
END;

CREATE TRIGGER upload_intent_provenance_insert_v3
BEFORE INSERT ON upload_intents BEGIN
  SELECT CASE WHEN json_valid(NEW.provenance_json) <> 1
    THEN RAISE(ABORT, 'upload intent provenance must be valid JSON') END;
END;

CREATE TRIGGER upload_intent_provenance_update_v3
BEFORE UPDATE OF provenance_json ON upload_intents BEGIN
  SELECT CASE WHEN json_valid(NEW.provenance_json) <> 1
    THEN RAISE(ABORT, 'upload intent provenance must be valid JSON') END;
END;

CREATE TRIGGER videos_provenance_insert_v3
BEFORE INSERT ON videos BEGIN
  SELECT CASE WHEN json_valid(NEW.provenance_json) <> 1 OR NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.provenance_json = NEW.provenance_json
  ) THEN RAISE(ABORT, 'video provenance must match its upload intent') END;
END;

CREATE TRIGGER videos_provenance_update_v3
BEFORE UPDATE OF intent_id, provenance_json ON videos BEGIN
  SELECT CASE WHEN json_valid(NEW.provenance_json) <> 1 OR NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.provenance_json = NEW.provenance_json
  ) THEN RAISE(ABORT, 'video provenance must match its upload intent') END;
END;

CREATE TRIGGER upload_intent_no_prefinalized_insert_v3
BEFORE INSERT ON upload_intents
WHEN NEW.status = 'finalized' OR NEW.finalized_at IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'upload intents must transition through finalization');
END;

CREATE TRIGGER upload_intent_finalized_at_state_v3
BEFORE UPDATE OF status, finalized_at ON upload_intents
WHEN NEW.status <> 'finalized' AND NEW.finalized_at IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'only finalized upload intents may have finalized_at');
END;

CREATE TRIGGER upload_intent_finalized_immutable_v3
BEFORE UPDATE OF status, finalized_at, provenance_json,
  declared_video_bytes, declared_video_sha256, declared_mime, declared_duration_seconds,
  declared_thumbnail_bytes, declared_thumbnail_sha256, declared_thumbnail_mime,
  created_at, expires_at ON upload_intents
WHEN OLD.status = 'finalized' AND (
  NEW.status IS NOT OLD.status OR NEW.finalized_at IS NOT OLD.finalized_at
  OR NEW.provenance_json IS NOT OLD.provenance_json
  OR NEW.declared_video_bytes IS NOT OLD.declared_video_bytes
  OR NEW.declared_video_sha256 IS NOT OLD.declared_video_sha256
  OR NEW.declared_mime IS NOT OLD.declared_mime
  OR NEW.declared_duration_seconds IS NOT OLD.declared_duration_seconds
  OR NEW.declared_thumbnail_bytes IS NOT OLD.declared_thumbnail_bytes
  OR NEW.declared_thumbnail_sha256 IS NOT OLD.declared_thumbnail_sha256
  OR NEW.declared_thumbnail_mime IS NOT OLD.declared_thumbnail_mime
  OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at
) BEGIN
  SELECT RAISE(ABORT, 'finalized upload intent evidence is immutable');
END;

CREATE TRIGGER videos_no_direct_takedown_v3
BEFORE INSERT ON videos WHEN NEW.status = 'taken_down' BEGIN
  SELECT RAISE(ABORT, 'taken down videos must transition from published');
END;

CREATE TRIGGER videos_no_direct_rejected_v3
BEFORE INSERT ON videos WHEN NEW.status = 'rejected' BEGIN
  SELECT RAISE(ABORT, 'rejected videos must transition from pending review');
END;

CREATE TRIGGER videos_status_transition_v3
BEFORE UPDATE OF status ON videos
WHEN NEW.status <> OLD.status AND NOT (
  (OLD.status = 'pending_review' AND NEW.status IN ('published', 'rejected'))
  OR (OLD.status = 'published' AND NEW.status = 'taken_down')
) BEGIN
  SELECT RAISE(ABORT, 'invalid video status transition');
END;

CREATE TRIGGER videos_publish_timeline_v3
BEFORE UPDATE OF status, published_at ON videos
WHEN NEW.status = 'published' AND OLD.status = 'pending_review' BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = NEW.intent_id
      AND i.status = 'finalized' AND i.finalized_at IS NOT NULL
      AND i.finalized_at <= NEW.published_at
  ) THEN RAISE(ABORT, 'publication requires a finalized upload intent') END;
  SELECT CASE WHEN NEW.published_at IS NULL OR NEW.published_at < NEW.created_at
    OR NOT EXISTS (
      SELECT 1 FROM moderation_reviews r
      JOIN users u ON u.id = r.reviewer_user_id
      WHERE r.video_id = OLD.id AND r.decision = 'approved'
        AND r.created_at <= NEW.published_at
        AND u.status = 'active' AND u.role IN ('reviewer','admin')
    ) THEN RAISE(ABORT, 'publication requires a current approval no later than published_at') END;
END;

CREATE TRIGGER videos_published_at_immutable_v3
BEFORE UPDATE OF published_at ON videos
WHEN OLD.status IN ('published', 'taken_down')
  AND NEW.published_at IS NOT OLD.published_at BEGIN
  SELECT RAISE(ABORT, 'published_at is immutable after publication');
END;

CREATE TRIGGER videos_takedown_transition_v3
BEFORE UPDATE OF status, taken_down_at ON videos
WHEN NEW.status = 'taken_down' AND OLD.status <> 'taken_down' BEGIN
  SELECT CASE WHEN OLD.status <> 'published' OR NEW.taken_down_at IS NULL
    OR OLD.published_at IS NULL OR NEW.taken_down_at < OLD.published_at OR NOT EXISTS (
    SELECT 1 FROM moderation_reviews r
    WHERE r.video_id = OLD.id AND r.decision = 'approved'
      AND r.created_at <= OLD.published_at
  ) THEN RAISE(ABORT, 'taken down videos require retained publication approval and a valid timestamp') END;
END;

CREATE TRIGGER videos_taken_down_at_immutable_v3
BEFORE UPDATE OF taken_down_at ON videos
WHEN OLD.status = 'taken_down' AND NEW.taken_down_at IS NOT OLD.taken_down_at BEGIN
  SELECT RAISE(ABORT, 'taken_down_at is immutable after takedown');
END;

CREATE TRIGGER moderation_review_publication_delete_v3
BEFORE DELETE ON moderation_reviews
WHEN OLD.decision = 'approved' AND EXISTS (
  SELECT 1 FROM videos v WHERE v.id = OLD.video_id
    AND v.status IN ('published', 'taken_down')
    AND OLD.created_at <= v.published_at
) BEGIN
  SELECT RAISE(ABORT, 'publication approval evidence is immutable');
END;

CREATE TRIGGER moderation_review_publication_insert_v3
BEFORE INSERT ON moderation_reviews
WHEN NEW.decision = 'approved' AND EXISTS (
  SELECT 1 FROM videos v WHERE v.id = NEW.video_id
    AND v.status IN ('published', 'taken_down')
    AND NEW.created_at <= v.published_at
) BEGIN
  SELECT RAISE(ABORT, 'publication approval evidence cannot be backfilled');
END;

CREATE TRIGGER moderation_review_publication_update_v3
BEFORE UPDATE OF id, video_id, reviewer_user_id, decision, reason, created_at ON moderation_reviews
WHEN (
  (OLD.decision = 'approved' AND EXISTS (
    SELECT 1 FROM videos v WHERE v.id = OLD.video_id
      AND v.status IN ('published', 'taken_down')
      AND OLD.created_at <= v.published_at
  )) OR (NEW.decision = 'approved' AND EXISTS (
    SELECT 1 FROM videos v WHERE v.id = NEW.video_id
      AND v.status IN ('published', 'taken_down')
      AND NEW.created_at <= v.published_at
  ))
) AND (
  NEW.id IS NOT OLD.id OR NEW.video_id IS NOT OLD.video_id
  OR NEW.reviewer_user_id IS NOT OLD.reviewer_user_id
  OR NEW.decision IS NOT OLD.decision OR NEW.reason IS NOT OLD.reason
  OR NEW.created_at IS NOT OLD.created_at
) BEGIN
  SELECT RAISE(ABORT, 'publication approval evidence is immutable');
END;

CREATE TRIGGER upload_intent_finalize_linkage_v3
BEFORE UPDATE OF status, finalized_at, provenance_json ON upload_intents
WHEN NEW.status = 'finalized' AND OLD.status <> 'finalized' BEGIN
  SELECT CASE WHEN OLD.status <> 'created' OR NEW.finalized_at IS NULL
    OR NEW.finalized_at > NEW.expires_at OR json_valid(NEW.provenance_json) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM videos v
      JOIN upload_capabilities c ON c.intent_id = OLD.id AND c.kind = 'video'
      JOIN media_blobs b ON b.intent_id = OLD.id AND b.kind = 'video'
      WHERE v.intent_id = OLD.id AND v.status = 'pending_review'
        AND v.video_blob_id = b.id AND c.used_at IS NOT NULL
        AND b.created_at <= c.used_at AND c.used_at <= v.created_at
        AND v.created_at <= NEW.finalized_at
        AND b.size_bytes = c.expected_size_bytes
        AND b.sha256 = c.expected_sha256 AND b.mime = c.expected_mime
        AND b.size_bytes = NEW.declared_video_bytes
        AND b.sha256 = NEW.declared_video_sha256 AND b.mime = NEW.declared_mime
        AND v.size_bytes = NEW.declared_video_bytes
        AND v.sha256 = NEW.declared_video_sha256
        AND v.duration_seconds = NEW.declared_duration_seconds
        AND v.provenance_json = NEW.provenance_json
    ) OR (NEW.declared_thumbnail_bytes IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM videos v
      JOIN upload_capabilities c ON c.intent_id = OLD.id AND c.kind = 'thumbnail'
      JOIN media_blobs b ON b.intent_id = OLD.id AND b.kind = 'thumbnail'
      WHERE v.intent_id = OLD.id AND v.status = 'pending_review'
        AND v.thumbnail_blob_id = b.id AND c.used_at IS NOT NULL
        AND b.created_at <= c.used_at AND c.used_at <= v.created_at
        AND v.created_at <= NEW.finalized_at
        AND b.size_bytes = c.expected_size_bytes
        AND b.sha256 = c.expected_sha256 AND b.mime = c.expected_mime
        AND b.size_bytes = NEW.declared_thumbnail_bytes
        AND b.sha256 = NEW.declared_thumbnail_sha256
        AND b.mime = NEW.declared_thumbnail_mime
    )) THEN RAISE(ABORT, 'finalized upload intent requires completed reviewable video') END;
END;

CREATE TRIGGER videos_finalized_intent_delete_v3
BEFORE DELETE ON videos WHEN EXISTS (
  SELECT 1 FROM upload_intents i WHERE i.id = OLD.intent_id AND i.status = 'finalized'
) BEGIN
  SELECT RAISE(ABORT, 'finalized upload intents must retain their video record');
END;

CREATE TRIGGER videos_finalized_evidence_immutable_v3
BEFORE UPDATE OF id, intent_id, agent_id, channel_id, duration_seconds, size_bytes, sha256,
  ai_generated, provenance_json, created_at ON videos
WHEN EXISTS (
  SELECT 1 FROM upload_intents i WHERE i.id = OLD.intent_id AND i.status = 'finalized'
) AND (
  NEW.id IS NOT OLD.id OR NEW.intent_id IS NOT OLD.intent_id
  OR NEW.agent_id IS NOT OLD.agent_id OR NEW.channel_id IS NOT OLD.channel_id
  OR NEW.duration_seconds IS NOT OLD.duration_seconds
  OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.sha256 IS NOT OLD.sha256
  OR NEW.ai_generated IS NOT OLD.ai_generated
  OR NEW.provenance_json IS NOT OLD.provenance_json
  OR NEW.created_at IS NOT OLD.created_at
) BEGIN
  SELECT RAISE(ABORT, 'finalized video evidence is immutable');
END;

CREATE TRIGGER videos_finalized_media_update_v3
BEFORE UPDATE OF video_blob_id, thumbnail_blob_id ON videos
WHEN ((NEW.video_blob_id IS NULL AND OLD.video_blob_id IS NOT NULL)
  OR (NEW.thumbnail_blob_id IS NULL AND OLD.thumbnail_blob_id IS NOT NULL))
  AND NEW.status <> 'rejected' AND EXISTS (
    SELECT 1 FROM upload_intents i WHERE i.id = OLD.intent_id AND i.status = 'finalized'
  ) BEGIN
  SELECT RAISE(ABORT, 'finalized non-rejected videos must retain media evidence');
END;

CREATE TRIGGER rate_limits_nonnegative_insert_v3
BEFORE INSERT ON rate_limits BEGIN
  SELECT CASE WHEN NEW.window_start < 0 OR NEW.count < 0
    THEN RAISE(ABORT, 'rate limit state must be nonnegative') END;
END;

CREATE TRIGGER rate_limits_nonnegative_update_v3
BEFORE UPDATE OF window_start, count ON rate_limits BEGIN
  SELECT CASE WHEN NEW.window_start < 0 OR NEW.count < 0
    THEN RAISE(ABORT, 'rate limit state must be nonnegative') END;
END;

-- recovery: forward-only. Restore a verified pre-migration backup, fix this
-- migration, and re-apply. Never rewrite an applied migration ledger row.
