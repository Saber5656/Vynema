-- Require every takedown transition to retain an immutable, nonblank reason.
-- Whitespace is intentionally the six ASCII whitespace characters so the
-- database contract is deterministic and does not depend on Unicode tables.

CREATE TEMP TABLE vynema_v5_legacy_preflight (
  violation TEXT NOT NULL
) STRICT;

CREATE TEMP TRIGGER vynema_v5_legacy_preflight_abort
BEFORE INSERT ON vynema_v5_legacy_preflight BEGIN
  SELECT RAISE(
    ABORT,
    'legacy videos require nonblank text takedown reasons only on taken-down rows'
  );
END;

INSERT INTO vynema_v5_legacy_preflight (violation)
SELECT 'takedown-reason' WHERE EXISTS (
  SELECT 1 FROM videos
  WHERE (status = 'taken_down' AND (
      typeof(takedown_reason) <> 'text'
      OR trim(takedown_reason, char(9, 10, 11, 12, 13, 32)) = ''
    )) OR (status <> 'taken_down' AND takedown_reason IS NOT NULL)
);

DROP TRIGGER vynema_v5_legacy_preflight_abort;
DROP TABLE vynema_v5_legacy_preflight;

DROP TRIGGER videos_takedown_transition_v4;
DROP TRIGGER videos_taken_down_at_immutable_v4;

CREATE TRIGGER videos_takedown_reason_insert_v5
BEFORE INSERT ON videos
WHEN NEW.status <> 'taken_down' AND NEW.takedown_reason IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'only taken down videos may retain a takedown reason');
END;

CREATE TRIGGER videos_takedown_reason_update_v5
BEFORE UPDATE OF status, takedown_reason ON videos
WHEN OLD.status <> 'taken_down'
  AND NEW.status <> 'taken_down' AND NEW.takedown_reason IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'only taken down videos may retain a takedown reason');
END;

CREATE TRIGGER videos_takedown_transition_v5
BEFORE UPDATE OF status, taken_down_at, takedown_reason ON videos
WHEN NEW.status = 'taken_down' AND OLD.status <> 'taken_down' BEGIN
  SELECT CASE WHEN OLD.takedown_reason IS NOT NULL
    THEN RAISE(ABORT, 'takedown reason must be recorded by the takedown transition') END;
  SELECT CASE WHEN typeof(NEW.takedown_reason) <> 'text'
      OR trim(NEW.takedown_reason, char(9, 10, 11, 12, 13, 32)) = ''
    THEN RAISE(ABORT, 'taken down videos require a nonblank text reason') END;
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

CREATE TRIGGER videos_takedown_evidence_immutable_v5
BEFORE UPDATE OF taken_down_at, takedown_reason ON videos
WHEN OLD.status = 'taken_down' AND (
  NEW.taken_down_at IS NOT OLD.taken_down_at
  OR NEW.takedown_reason IS NOT OLD.takedown_reason
) BEGIN
  SELECT RAISE(ABORT, 'takedown evidence is immutable');
END;

-- recovery: restore the verified pre-v5 backup; do not invent, trim, or
-- otherwise backfill missing takedown reasons.
