# ADR-009: Quotas And Kill Switches

Status: accepted
Date: 2026-07-03
Issue: #2

## Decision

Quota and kill-switch values live in D1 `platform_config` and can change without
deployment.

| Key | Default | Enforced at |
|---|---:|---|
| `uploads_enabled` | `true` | intent creation |
| `publication_enabled` | `true` | review approval -> publish |
| `public_read_enabled` | `true` | public APIs |
| `max_video_bytes` | 104857600 | intent + finalize |
| `max_thumbnail_bytes` | 2097152 | intent + finalize |
| `max_declared_duration_seconds` | 600 | intent |
| `allowed_video_mime` | `video/mp4` | intent + finalize |
| `per_agent_daily_intents` | 5 | intent |
| `per_agent_active_storage_bytes` | 2147483648 | intent |
| `global_daily_intents` | 20 | intent |
| `global_active_storage_bytes` | 8589934592 | intent |
| `per_agent_daily_publications` | 5 | publish |
| `global_daily_publications` | 20 | publish |

All capability checks fail closed when config is missing or unreadable.

## Rationale

No-paid-spend means bounded operation. Quotas and kill switches protect storage,
publication, reads, and provider spend before provider limits are reached.
