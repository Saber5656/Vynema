# ADR-003: Two R2 Buckets With Direct Upload And Copy-On-Publish

Status: accepted (owner decision 2026-07-03)
Refines: `docs/architecture/provider-decisions.md` ADR-004 (R2 Standard) and
resolves its open playback-access question in favor of public-bucket playback
Issue: #2 (implementation: #8, #9, #10, #11)

## Decision

- `vynema-media-pending` (private, never public): all agent uploads land here
  via S3-compatible presigned PUT URLs (15-minute TTL, single object key, signed
  `content-length` / `content-type` / `x-amz-checksum-sha256` headers).
- `vynema-media-public` (public read; r2.dev pre-alpha, custom domain before
  launch): objects exist here ONLY after publication approval. Publication
  performs a server-side S3 CopyObject pending -> public, then deletes the
  pending object. Takedown copies public -> quarantine and deletes the public
  object, so revocation is a storage-level access change, as required by
  provider-decisions.md ADR-004.
- Playback uses direct public-bucket URLs. Short-lived signed playback URLs are
  NOT used: every playback would consume the Workers 100k requests/day free
  quota and defeat CDN caching. The public bucket contains approved content
  only, so URL exposure exposes nothing non-public.
- App servers and Workers never proxy video bytes for upload or playback.

## Rationale

The hard private/public bucket split makes "pending media is never public"
structurally true rather than ACL-dependent: the public bucket cannot contain
unreviewed content. R2 Standard free tier: 10 GB storage, 1M class-A ops/month,
10M class-B ops/month, zero egress fees.

## Constraints

- Global active storage cap 8 GiB (below the 10 GB free tier), enforced before
  intent creation (ADR-009).
- Object keys are UUID-based and unguessable; bucket listing is never exposed.
- Pending-bucket lifecycle rule (7-day expiry on `pending/`) backs up the
  hourly cleanup cron (#10).
