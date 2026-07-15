# ADR-009: Quota Defaults And Kill Switches Live In `platform_config`

Status: amended (owner decision 2026-07-15; development defaults only)
Issue: #2 (implementation: #14; accounting model: #10)

## Decision

All development limits are rows in the SQLite `platform_config` table, changeable by admins at
runtime without deployment. Checks fail closed (missing config => deny).

| Key | Default | Enforced at |
|---|---|---|
| `uploads_enabled` | `true` | intent creation |
| `publication_enabled` | `true` | review approval -> publish |
| `public_read_enabled` | `true` | development public APIs and media routes (503 degrade). Production hard-stop behavior is blocked on #42 |
| `max_video_bytes` | 104857600 (100 MiB) | intent + finalize |
| `max_thumbnail_bytes` | 2097152 (2 MiB) | intent + finalize |
| `max_declared_duration_seconds` | 600 | intent |
| `allowed_video_mime` | `video/mp4` | intent + finalize |
| `per_agent_daily_intents` | 5 | intent |
| `per_agent_active_storage_bytes` | 2147483648 (2 GiB) | intent |
| `global_daily_intents` | 20 | intent |
| `global_active_storage_bytes` | 8589934592 (8 GiB) | intent |
| `per_agent_daily_publications` | 5 | publish (per-agent cap, QT-002) |
| `global_daily_publications` | 20 | publish |

Storage accounting is reservation-at-intent: declared bytes reserve quota when
the intent is created and are released on failure/expiry (canonical table in
issue #10).

## Notes

- `publication_enabled=false` gates review approval (the public-exposure
  mutation), NOT agent `finalize`: finalize only queues content for review and
  exposes nothing; queue growth is bounded by the upload caps, and the
  emergency-pause runbook flips `uploads_enabled` as well when a full stop is
  needed.
- `max_declared_duration_seconds` is enforced against the agent-declared value
  at intent time. The MVP does not parse media duration server-side; the
  enforcement point for actual duration is mandatory manual review (reviewers
  reject material declared-vs-observed mismatches, issue #12). Automated
  duration parsing is deferred to the #31 automation era.

## Rationale

Development values are bounded application defaults, not claims about any
provider free tier. Issue #42 must select and enforce production limits from
current official pricing before release. Kill switches satisfy the local QT-006
behavior; production provider hard-stop evidence remains part of #42.
