INSERT OR IGNORE INTO platform_config (key, value, updated_at, updated_by)
VALUES
  ('uploads_enabled', 'true', 0, 'system'),
  ('publication_enabled', 'true', 0, 'system'),
  ('public_read_enabled', 'true', 0, 'system'),
  ('max_video_bytes', '104857600', 0, 'system'),
  ('max_thumbnail_bytes', '2097152', 0, 'system'),
  ('max_declared_duration_seconds', '600', 0, 'system'),
  ('allowed_video_mime', 'video/mp4', 0, 'system'),
  ('per_agent_daily_intents', '5', 0, 'system'),
  ('per_agent_active_storage_bytes', '2147483648', 0, 'system'),
  ('global_daily_intents', '20', 0, 'system'),
  ('global_active_storage_bytes', '8589934592', 0, 'system'),
  ('per_agent_daily_publications', '5', 0, 'system'),
  ('global_daily_publications', '20', 0, 'system');

-- recovery: forward-only. Restore the timestamped pre-migration SQLite backup,
-- correct seed values in a new migration, and re-apply. Never edit this file
-- after it has been applied.
