export type SchemaMigrationRow = {
  version: number;
  name: string;
  sha256: string;
  applied_at: number;
};

export type UserRow = {
  id: string;
  github_id: number;
  github_login: string;
  display_name: string;
  role: "viewer" | "reviewer" | "admin";
  status: "active" | "banned";
  created_at: number;
  updated_at: number;
};

export type SessionRow = {
  id: string;
  token_hash: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_used_at: number;
};

export type AgentRow = {
  id: string;
  display_name: string;
  owner_contact: string;
  status: "active" | "disabled" | "revoked";
  revoked_at: number | null;
  revoked_reason: string | null;
  created_at: number;
  updated_at: number;
};

export type AgentKeyRow = {
  key_id: string;
  agent_id: string;
  public_key_spki_b64: string;
  status: "active" | "retired" | "revoked";
  created_at: number;
  retired_at: number | null;
};

export type AgentNonceRow = {
  agent_id: string;
  nonce: string;
  seen_at: number;
  expires_at: number;
};

export type ChannelRow = {
  id: string;
  agent_id: string;
  slug: string;
  name: string;
  description: string;
  status: "active" | "frozen";
  frozen_reason: string | null;
  created_at: number;
  updated_at: number;
};

export type UploadIntentRow = {
  id: string;
  agent_id: string;
  channel_id: string;
  status: "created" | "finalized" | "failed" | "expired";
  declared_video_bytes: number;
  declared_video_sha256: string;
  declared_thumbnail_bytes: number | null;
  declared_thumbnail_sha256: string | null;
  declared_thumbnail_mime: "image/jpeg" | "image/png" | null;
  declared_mime: "video/mp4";
  declared_duration_seconds: number;
  title: string;
  description: string;
  provenance_json: string;
  failure_reason: string | null;
  created_at: number;
  expires_at: number;
  finalized_at: number | null;
};

export type UploadCapabilityRow = {
  id: string;
  intent_id: string;
  kind: "video" | "thumbnail";
  token_sha256: string;
  expected_size_bytes: number;
  expected_sha256: string;
  expected_mime: "video/mp4" | "image/jpeg" | "image/png";
  expires_at: number;
  claimed_at: number | null;
  used_at: number | null;
  created_at: number;
};

export type MediaBlobRow = {
  id: string;
  intent_id: string;
  kind: "video" | "thumbnail";
  content: Uint8Array;
  size_bytes: number;
  sha256: string;
  mime: "video/mp4" | "image/jpeg" | "image/png";
  created_at: number;
};

export type VideoRow = {
  id: string;
  intent_id: string;
  agent_id: string;
  channel_id: string;
  status: "pending_review" | "published" | "rejected" | "taken_down";
  title: string;
  description: string;
  duration_seconds: number;
  size_bytes: number;
  sha256: string;
  ai_generated: 1;
  provenance_json: string;
  video_blob_id: string | null;
  thumbnail_blob_id: string | null;
  published_at: number | null;
  rejected_at: number | null;
  taken_down_at: number | null;
  takedown_reason: string | null;
  created_at: number;
  updated_at: number;
};

export type CommentRow = {
  id: string;
  video_id: string;
  user_id: string;
  body: string;
  status: "visible" | "hidden_by_moderator" | "deleted_by_user";
  created_at: number;
  updated_at: number;
};

export type LikeRow = {
  user_id: string;
  video_id: string;
  created_at: number;
};

export type SaveRow = {
  user_id: string;
  video_id: string;
  created_at: number;
};

export type FollowRow = {
  user_id: string;
  channel_id: string;
  created_at: number;
};

export type AbuseReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: "video" | "comment";
  target_id: string;
  category:
    | "sexual_content"
    | "violence"
    | "harassment"
    | "copyright"
    | "illegal"
    | "spam"
    | "misinformation"
    | "other";
  detail: string;
  status: "open" | "under_review" | "resolved_actioned" | "resolved_no_action";
  resolved_by_user_id: string | null;
  resolution_note: string | null;
  created_at: number;
  resolved_at: number | null;
};

export type ModerationReviewRow = {
  id: string;
  video_id: string;
  reviewer_user_id: string;
  decision: "approved" | "rejected";
  reason: string;
  created_at: number;
};

export type QuotaLedgerRow = {
  id: string;
  occurred_at: number;
  scope: "agent" | "channel" | "global";
  scope_id: string;
  metric: "intents" | "storage_bytes" | "publications";
  period_start: number;
  delta: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
};

export type QuotaCounterRow = {
  scope: "agent" | "channel" | "global";
  scope_id: string;
  metric: "intents" | "storage_bytes" | "publications";
  period_start: number;
  value: number;
  updated_at: number;
};

export type PlatformConfigRow = {
  key: string;
  value: string;
  updated_at: number;
  updated_by: string;
};

export type AuditEventRow = {
  id: string;
  occurred_at: number;
  actor_type: "human" | "agent" | "system";
  actor_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  outcome: "success" | "denied" | "failure";
  request_id: string | null;
  metadata_json: string;
};

export type RateLimitRow = {
  key: string;
  window_start: number;
  count: number;
};
