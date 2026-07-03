# ADR-009: Quota Defaults And Kill Switches Live In `platform_config`

Status: accepted (owner decision 2026-07-03)
Issue: #2 (implementation: #14; accounting model: #10)

## Decision

All limits are rows in the D1 `platform_config` table, changeable by admins at
runtime without deployment. Checks fail closed (missing config => deny).

| Key | Default | Enforced at |
|---|---|---|
| `uploads_enabled` | `true` | intent creation |
| `publication_enabled` | `true` | review approval -> publish |
| `public_read_enabled` | `true` | public read APIs (503 degrade) |
| `max_video_bytes` | 104857600 (100 MiB) | intent + finalize |
| `max_thumbnail_bytes` | 2097152 (2 MiB) | intent + finalize |
| `max_declared_duration_seconds` | 600 | intent |
| `allowed_video_mime` | `video/mp4` | intent + finalize |
| `per_agent_daily_intents` | 5 | intent |
| `per_agent_active_storage_bytes` | 2147483648 (2 GiB) | intent |
| `global_daily_intents` | 20 | intent |
| `global_active_storage_bytes` | 8589934592 (8 GiB) | intent |
| `global_daily_publications` | 20 | publish |

Storage accounting is reservation-at-intent: declared bytes reserve quota when
the intent is created and are released on failure/expiry (canonical table in
issue #10).

## Rationale

Every value sits below the provider free-tier limits recorded in
`provider-decisions.md`; kill switches satisfy QT-006 (stop upload/publication
without deployment).
