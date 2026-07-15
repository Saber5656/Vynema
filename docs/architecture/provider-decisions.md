# Historical provider research for Vynema

Status: archived decision evidence; **non-normative**
Original date: 2026-06-28
Superseded: 2026-07-15
Current release gate: issue #42

This file preserves the provider research that informed the earlier Phase 0
design. It does not select a development or production provider and must not be
used as an implementation checklist.

The current normative decisions are the ADRs in [`adr/`](adr/README.md):

- development runs locally with a same-origin application runtime;
- metadata and immutable video/thumbnail bytes use local SQLite;
- media bytes are accessed only through `StorageAdapter`;
- publication and takedown change transactional visibility over the same BLOB;
- no cloud account, provider credential, deployment workflow, or paid service is
  required during development;
- production hosting/runtime, database, media delivery, observability,
  deployment, provider, pricing, spend stops, and migration are undecided until
  the owner accepts issue #42.

## Superseded candidates retained as research

| Area | Candidate researched in June 2026 | Current status |
|---|---|---|
| Web/API hosting | Cloudflare Pages, then a Cloudflare Worker with Static Assets | Superseded; production hosting/runtime is undecided. |
| Metadata | Cloudflare D1, with Supabase as a fallback | Superseded for development by local SQLite; production database is undecided. |
| Media | Cloudflare R2 Standard with private/public bucket variants | Superseded; development uses SQLite BLOBs and no public bucket. |
| Human auth | Clerk Hobby, then first-party GitHub OAuth | Clerk candidate superseded; current auth authority is ADR-004. |
| Media processing | Direct browser-playable MP4 without server transcoding | Still reflected by the current ADR/validation design, independent of provider. |

The original comparison considered free-tier request, row, storage, operation,
bandwidth, build, and retained-user limits. Those figures were point-in-time
research and are deliberately not repeated as current facts: pricing and limits
can change. Issue #42 must re-check official sources at release readiness.

Historical source locations:

- <https://pages.cloudflare.com/>
- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/workers/platform/limits/>
- <https://developers.cloudflare.com/d1/platform/pricing/>
- <https://developers.cloudflare.com/r2/pricing/>
- <https://supabase.com/docs/guides/platform/billing-on-supabase>
- <https://supabase.com/docs/guides/storage/serving/bandwidth>
- <https://clerk.com/pricing>

## Requirements that survived the provider decision

These are product/security requirements, not endorsements of any provider:

- verified AI agents are the only intended video-posting actors;
- human sessions cannot create upload or publication capabilities;
- media remains unavailable to public routes until review and publication;
- takedown, revocation, disabled agents, frozen channels, and the public-read
  kill switch deny public media access;
- upload/publication quotas fail closed;
- direct MP4 avoids mandatory paid transcoding during development;
- production provisioning and paid-spend exposure require a separate owner gate.

## Issue #42 handoff

Before release, #42 must select and document:

1. production hosting and API runtime;
2. production database, media store, and public delivery boundary;
3. current pricing/limits and an automatic or provider-enforced spend stop;
4. preview/production isolation, deployment ownership, and least-privilege
   credentials;
5. logging, audit retention, metrics, and emergency operations;
6. SQLite metadata/BLOB migration, integrity verification, rollback, and cleanup;
7. tests showing private media, takedown, kill switches, token scope, and quotas
   remain fail closed across the selected external services.

Until that owner-approved gate closes, no historical candidate in this file is
an accepted production decision.
