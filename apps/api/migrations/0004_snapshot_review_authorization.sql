-- Capture reviewer authorization when a moderation decision is created. A
-- later role/status change must neither authorize an old decision nor revoke
-- evidence that was authorized when it was recorded.

-- v3 did not retain decision-time authorization. Current user state cannot be
-- used as a truthful backfill, so terminal legacy rows must be recovered or
-- explicitly resolved before this migration can proceed. The runner wraps the
-- preflight, schema change, ledger write, and user_version update in one
-- transaction, leaving v3 untouched on failure.
CREATE TEMP TABLE vynema_v4_legacy_preflight (
  violation TEXT NOT NULL
) STRICT;

CREATE TEMP TRIGGER vynema_v4_legacy_preflight_abort
BEFORE INSERT ON vynema_v4_legacy_preflight BEGIN
  SELECT RAISE(
    ABORT,
    'legacy published or taken-down videos lack provable reviewer authorization snapshots'
  );
END;

INSERT INTO vynema_v4_legacy_preflight (violation)
SELECT 'authorization-snapshot' WHERE EXISTS (
  SELECT 1 FROM videos WHERE status IN ('published', 'taken_down')
);

DROP TRIGGER vynema_v4_legacy_preflight_abort;
DROP TABLE vynema_v4_legacy_preflight;

ALTER TABLE moderation_reviews ADD COLUMN reviewer_role_at_decision TEXT
  CHECK (
    reviewer_role_at_decision IS NULL OR (
      typeof(reviewer_role_at_decision) = 'text'
      AND reviewer_role_at_decision IN ('reviewer', 'admin')
    )
  );

ALTER TABLE moderation_reviews ADD COLUMN reviewer_status_at_decision TEXT
  CHECK (
    reviewer_status_at_decision IS NULL OR (
      typeof(reviewer_status_at_decision) = 'text'
      AND reviewer_status_at_decision = 'active'
    )
  );

ALTER TABLE moderation_reviews ADD COLUMN authorization_snapshot_version INTEGER DEFAULT 0
  CHECK (
    (
      authorization_snapshot_version IS NULL
      AND reviewer_role_at_decision IS NULL
      AND reviewer_status_at_decision IS NULL
    ) OR (
      typeof(authorization_snapshot_version) = 'integer'
      AND authorization_snapshot_version = 0
      AND reviewer_role_at_decision IS NULL
      AND reviewer_status_at_decision IS NULL
    ) OR (
      typeof(authorization_snapshot_version) = 'integer'
      AND authorization_snapshot_version = 1
      AND typeof(reviewer_role_at_decision) = 'text'
      AND reviewer_role_at_decision IN ('reviewer', 'admin')
      AND typeof(reviewer_status_at_decision) = 'text'
      AND reviewer_status_at_decision = 'active'
    )
  );

-- Existing non-terminal decisions have no provable decision-time identity.
-- Preserve them as permanently unverified legacy records instead of inventing
-- a snapshot from mutable current user state.
UPDATE moderation_reviews
SET authorization_snapshot_version = NULL;

DROP TRIGGER videos_publish_requires_approval;
DROP TRIGGER videos_publish_timeline_v3;
DROP TRIGGER videos_takedown_transition_v3;
DROP TRIGGER videos_taken_down_at_immutable_v3;
DROP TRIGGER moderation_review_publication_delete_v3;
DROP TRIGGER moderation_review_publication_insert_v3;
DROP TRIGGER moderation_review_publication_update_v3;

CREATE TRIGGER moderation_reviews_snapshot_input_v4
BEFORE INSERT ON moderation_reviews BEGIN
  SELECT CASE WHEN NEW.reviewer_role_at_decision IS NOT NULL
      OR NEW.reviewer_status_at_decision IS NOT NULL
      OR typeof(NEW.authorization_snapshot_version) <> 'integer'
      OR NEW.authorization_snapshot_version <> 0
    THEN RAISE(ABORT, 'moderation authorization snapshot is database-authored') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM moderation_reviews WHERE id = NEW.id
  ) THEN RAISE(ABORT, 'moderation review id is immutable') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = NEW.reviewer_user_id
      AND u.role IN ('reviewer', 'admin')
      AND u.status = 'active'
  ) THEN RAISE(ABORT, 'moderation review requires an active reviewer or admin') END;
END;

CREATE TRIGGER moderation_reviews_snapshot_capture_v4
AFTER INSERT ON moderation_reviews BEGIN
  UPDATE moderation_reviews
  SET reviewer_role_at_decision = (
        SELECT role FROM users WHERE id = NEW.reviewer_user_id
      ),
      reviewer_status_at_decision = (
        SELECT status FROM users WHERE id = NEW.reviewer_user_id
      ),
      authorization_snapshot_version = 1
  WHERE id = NEW.id
    AND authorization_snapshot_version = 0
    AND reviewer_role_at_decision IS NULL
    AND reviewer_status_at_decision IS NULL;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM moderation_reviews
    WHERE id = NEW.id
      AND authorization_snapshot_version = 1
      AND reviewer_role_at_decision IN ('reviewer', 'admin')
      AND reviewer_status_at_decision = 'active'
  ) THEN RAISE(ABORT, 'moderation authorization snapshot capture failed') END;
END;

CREATE TRIGGER moderation_reviews_evidence_update_v4
BEFORE UPDATE ON moderation_reviews
WHEN NOT (
  OLD.authorization_snapshot_version IS 0
  AND OLD.reviewer_role_at_decision IS NULL
  AND OLD.reviewer_status_at_decision IS NULL
  AND NEW.authorization_snapshot_version IS 1
  AND (
    NEW.reviewer_role_at_decision IS 'reviewer'
    OR NEW.reviewer_role_at_decision IS 'admin'
  )
  AND NEW.reviewer_status_at_decision IS 'active'
  AND NEW.id IS OLD.id
  AND NEW.video_id IS OLD.video_id
  AND NEW.reviewer_user_id IS OLD.reviewer_user_id
  AND NEW.decision IS OLD.decision
  AND NEW.reason IS OLD.reason
  AND NEW.created_at IS OLD.created_at
) BEGIN
  SELECT RAISE(ABORT, 'moderation review evidence is append-only');
END;

CREATE TRIGGER moderation_reviews_evidence_delete_v4
BEFORE DELETE ON moderation_reviews BEGIN
  SELECT RAISE(ABORT, 'moderation review evidence is append-only');
END;

CREATE TRIGGER moderation_review_publication_insert_v4
BEFORE INSERT ON moderation_reviews
WHEN NEW.decision = 'approved' AND EXISTS (
  SELECT 1 FROM videos v WHERE v.id = NEW.video_id
    AND v.status IN ('published', 'taken_down')
    AND NEW.created_at <= v.published_at
) BEGIN
  SELECT RAISE(ABORT, 'publication approval evidence cannot be backfilled');
END;

CREATE TRIGGER videos_publish_timeline_v4
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
      WHERE r.video_id = OLD.id
        AND r.decision = 'approved'
        AND r.created_at <= NEW.published_at
        AND r.authorization_snapshot_version = 1
        AND r.reviewer_role_at_decision IN ('reviewer', 'admin')
        AND r.reviewer_status_at_decision = 'active'
    ) THEN RAISE(
      ABORT,
      'publication requires an authorized approval no later than published_at'
    ) END;
END;

CREATE TRIGGER videos_takedown_transition_v4
BEFORE UPDATE OF status, taken_down_at ON videos
WHEN NEW.status = 'taken_down' AND OLD.status <> 'taken_down' BEGIN
  SELECT CASE WHEN OLD.status <> 'published' OR NEW.taken_down_at IS NULL
    OR OLD.published_at IS NULL OR NEW.taken_down_at < OLD.published_at OR NOT EXISTS (
      SELECT 1 FROM moderation_reviews r
      WHERE r.video_id = OLD.id
        AND r.decision = 'approved'
        AND r.created_at <= OLD.published_at
        AND r.authorization_snapshot_version = 1
        AND r.reviewer_role_at_decision IN ('reviewer', 'admin')
        AND r.reviewer_status_at_decision = 'active'
    ) THEN RAISE(
      ABORT,
      'taken down videos require retained authorized publication approval and a valid timestamp'
    ) END;
END;

CREATE TRIGGER videos_taken_down_at_immutable_v4
BEFORE UPDATE OF taken_down_at ON videos
WHEN OLD.status = 'taken_down' AND NEW.taken_down_at IS NOT OLD.taken_down_at BEGIN
  SELECT RAISE(ABORT, 'taken_down_at is immutable after takedown');
END;

-- recovery: restore the verified pre-v4 backup; do not infer authorization
-- snapshots from current user role/status values.
