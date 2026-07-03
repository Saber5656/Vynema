# Issue #9: Configure direct object storage upload path and bucket policy

GitHub issue: https://github.com/Saber5656/Vynema/issues/9

This file is the canonical implementation design for issue #9. Edit here;
the GitHub issue body only carries a short summary and a link back to this
file.

---

## Summary

Configure object storage for direct agent uploads of short web-ready MP4 files while preventing public access to unreviewed objects and avoiding app-server video byte proxying.

## Scope

- Configure R2 or selected equivalent object storage buckets for upload, private pending objects, and public playback access pattern.
- Define object key naming with agent, channel, intent, and collision-safe segments.
- Configure CORS only for required upload flows.
- Ensure upload capabilities cannot overwrite unrelated objects.
- Document object lifecycle and cleanup rules.

## Out Of Scope

- Server-side transcoding.
- Managed paid video delivery.

## Acceptance Criteria

- [ ] Agents upload directly to object storage using scoped short-lived capability.
- [ ] Pending objects are not publicly accessible.
- [ ] Public playback only becomes available after review and publication.
- [ ] Object keys are unguessable or authorization-safe.
- [ ] Bucket policy prevents broad write/read access.
- [ ] Infra/security review confirms storage policy and CORS restrictions.

## Dependencies

- AIT-MVP-002.
- AIT-MVP-008.

## Notes

- The application must not store video files as frontend assets.

---
Stable Issue Key: AIT-MVP-009
Classification: MVP Blocking
Dependencies: AIT-MVP-002, AIT-MVP-008
Recommended Labels: area/storage, area/infra, type/implementation, priority/p0, mvp-blocking
Source Task: TSK-1260

---

## Implementation Plan & Design (added 2026-07-02)

> Normative. Implements ADR-003. This issue = bucket provisioning + policy + presigner module + policy-evidence docs. Consumed by #8 (presign), #10 (verify/cleanup), #11 (publish copy), #13 (quarantine).

### 1. Buckets & access posture

| Bucket | Public access | Written by | Read by |
|---|---|---|---|
| `vynema-media-pending` (+ `-preview`) | **NONE** — no r2.dev, no custom domain, ever | agents via presigned PUT; Worker via binding `MEDIA_PENDING` | Worker binding only |
| `vynema-media-public` (+ `-preview`) | r2.dev enabled for pre-alpha; custom domain `media.<domain>` required before launch (#24 item) | Worker (publish copy #11) | anonymous GET via public URL |

- Playback URL construction: `${PUBLIC_MEDIA_BASE_URL}/${public_object_key}` — `PUBLIC_MEDIA_BASE_URL` var per environment (r2.dev URL now, custom domain later; NO code change on switch).
- Public bucket has **no list** exposure (r2.dev/custom domains never allow listing). Key layout `{videoId}/video.mp4` — videoId is a UUID; enumeration infeasible; and everything in this bucket is by-construction approved-public content, so even full enumeration exposes nothing non-public.
- CORS: **none on either bucket.** Agents upload server-to-server (no browser); `<video>` playback does not require CORS for non-`crossorigin` media elements. Any future browser-upload feature would be a requirement change (AGENTS.md boundary).

### 2. Object key layout (normative)

```
pending bucket:
  pending/{agentId}/{channelId}/{intentId}/video.mp4
  pending/{agentId}/{channelId}/{intentId}/thumb.jpg|thumb.png
  quarantine/{videoId}/video.mp4            # takedown evidence (#13)
public bucket:
  {videoId}/video.mp4
  {videoId}/thumb.jpg|thumb.png
```

### 3. Credentials (least privilege)

- One R2 S3 API token, scope: **Object Read & Write on exactly `vynema-media-pending` and `vynema-media-public`** (needed for presigned PUT on pending, and S3 CopyObject pending→public and public→quarantine). Admin/account-level tokens forbidden.
- Worker secrets: `R2_ACCOUNT_ID`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY` (via `wrangler secret put` / `.dev.vars` locally). Never in `wrangler.toml` or code.
- Bindings `MEDIA_PENDING` / `MEDIA_PUBLIC` already exist from #34.

### 4. Presigner (`apps/api/src/lib/storage/presign.ts`)

- Dependency: `aws4fetch` (^1). `new AwsClient({accessKeyId, secretAccessKey, service: "s3", region: "auto"})`.
- `presignPendingPut(env, {key, contentLength, contentType, sha256Hex, expiresSeconds = 900}): Promise<{url, requiredHeaders}>`:
  - URL: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/vynema-media-pending/${key}?X-Amz-Expires=900`.
  - `aws.sign(url, {method:"PUT", headers: {"content-length": …, "content-type": …, "x-amz-checksum-sha256": base64(hexToBytes(sha256Hex))}, aws: {signQuery: true, allHeaders: true}})`.
  - Signing these headers makes R2 enforce them at PUT time: wrong length/type/hash ⇒ upload rejected by storage itself.
- `copyObject(env, {srcBucket, srcKey, destBucket, destKey}): Promise<void>` — S3 CopyObject: signed `PUT https://…/{destBucket}/{destKey}` with header `x-amz-copy-source: /{srcBucket}/{srcKey}`; throw on non-200. Server-side copy — **no video bytes flow through the Worker** (upload: direct to R2; playback: direct from public URL; publish: in-storage copy). This satisfies the no-byte-proxy rule end to end.
- Testability seam: routes call `storage.presignPendingPut` / `storage.copyObject` via a `StorageAdapter` interface (`apps/api/src/lib/storage/adapter.ts`). Tests inject a double whose `copyObject` uses the local R2 bindings (get→put with `arrayBuffer()`, fine for KB-sized fixtures); presign is tested for URL structure (host, path, `X-Amz-Expires`, `X-Amz-SignedHeaders` includes the three headers) using fixed fake credentials + `vi.setSystemTime`.

### 5. Provisioning & lifecycle (manual commands now; #29 owns IaC posture)

```
wrangler r2 bucket create vynema-media-pending
wrangler r2 bucket create vynema-media-public
wrangler r2 bucket lifecycle add vynema-media-pending --prefix pending/ --expire-days 7
wrangler r2 bucket lifecycle add vynema-media-pending --abort-multipart-days 1   # (flag names: verify against current wrangler; intent is: expire pending/ after 7d, abort incomplete multipart after 1d)
```

- 7-day expiry on `pending/` is defense-in-depth behind #10's hourly cleanup (which normally deletes orphans in ≤1 h). `quarantine/` prefix has NO expiry (evidence retention until manual purge).
- Enable r2.dev on the public bucket only; record the URL as `PUBLIC_MEDIA_BASE_URL`.
- Preview-environment buckets: same commands with `-preview` suffix.

### 6. Policy evidence (`docs/security/storage-policy.md` — new file, required for #23)

Contents: the two-bucket table (§1), key layout (§2), token scope (§3), lifecycle rules (§5), plus a **verification checklist with expected results**:

1. `curl -s -o /dev/null -w "%{http_code}" https://<account>.r2.cloudflarestorage.com/vynema-media-pending/pending/test` → 401 (unauthenticated S3 API).
2. Pending bucket has no public development URL: confirm in dashboard/API; screenshot or `wrangler r2 bucket info` output.
3. Presigned URL for key A cannot PUT key B (signature bound to path) → 403; expired URL (>900 s) → 403.
4. Public bucket URL serves a published object 200; a made-up key → 404; no directory listing at bucket root.

Run these once against the preview environment when #21 provisions it and paste outputs into this doc (marked with date).

### 7. Step-by-step order

1. `presign.ts` + adapter interface + structure tests. 2. Local dev support: since presigned URLs point at real R2, local flow uses a dev-only route `PUT /dev-upload/:key` (mounted ONLY when `ENVIRONMENT === "local"`, writes via binding, guarded by a test that it 404s when env != local) — #35 CLI uses it via `PUBLIC_MEDIA_BASE_URL`-style override; document in `docs/development.md`. 3. `docs/security/storage-policy.md`. 4. Provisioning commands doc (execution happens with #21; keep this issue code+docs).

### 8. Acceptance mapping & PR evidence

- "Direct upload with scoped short-lived capability" → §4 presign (900 s, single key, header-bound). "Pending objects not publicly accessible" → §1 posture + §6 checks 1–2. "Public playback only after review" → public bucket contains only #11-copied objects. "Keys unguessable/authorization-safe" → §2 UUIDs + §1 list-denial. "Bucket policy prevents broad access" → §3 token scope + §6. "CORS restricted" → §1 (none, with rationale).
- PR evidence: presigner test output, storage-policy doc, security impact note ("storage capability boundary; no public access to pending").

