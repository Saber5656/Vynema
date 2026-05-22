# ホーム画面 API Rate Limiting 実装方針

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: tech-leader
Task: #3
関連: SEC-ISSUE-1（レビュー指摘）、パフォーマンス設計書

---

## 1. 背景と目的

### 1.1 レビュー指摘事項

ホーム画面詳細設計レビューにて、APIレート制限の実装が未定義であることが指摘された（SEC-ISSUE-1相当）。本ドキュメントでは、Upstash Redis + `@upstash/ratelimit` を使用した最低限のRate Limiting構成を定義する。

### 1.2 目的

- **DDoS/スクレイピング対策**: 大量リクエストによるDB負荷増大を防止
- **Supabase 無料枠保護**: 過度なDBクエリによるSupabase接続数枯渇の防止
- **Mux API保護**: 間接的にMuxへのアクセスを制限し、配信コスト急増を防止
- **公平なリソース配分**: 全ユーザーに安定したレスポンスを提供

---

## 2. 技術選定

### 2.1 Upstash Redis + @upstash/ratelimit

| 選定理由 | 詳細 |
|---------|------|
| **Vercel Edge 互換** | HTTP ベースの Redis クライアントで Edge Runtime 対応 |
| **無料枠** | 10,000 コマンド/日（Rate Limiting には十分） |
| **SDK の成熟度** | `@upstash/ratelimit` が Sliding Window / Token Bucket 等を内蔵 |
| **レイテンシ** | Upstash のグローバルリージョンで ~5ms の追加レイテンシ |
| **既存技術スタック** | BullMQ 用に Upstash Redis を既に採用予定（追加コストなし） |

### 2.2 アルゴリズム選定: Sliding Window

```
@upstash/ratelimit の Sliding Window を採用
```

**検討過程:**

researcher 調査（Task #3支援）にて Fixed Window / Sliding Window / Token Bucket の3アルゴリズムが比較検討された。researcher は MVP 段階での Fixed Window を推奨したが、以下の理由で Sliding Window を選択した:

| アルゴリズム | 検討結果 | 理由 |
|------------|---------|------|
| Fixed Window | ❌ 不採用 | ウィンドウ境界で2倍のリクエストが通る問題（request stampede）が API 保護の目的に反する |
| **Sliding Window** | **✅ 採用** | 境界問題を回避しつつ、Token Bucket ほど複雑でない。`@upstash/ratelimit` の実装品質が高く Redis コマンド消費も2回/判定と低コスト |
| Token Bucket | ❌ 不採用（MVP） | バースト許容が有用だが、API Rate Limiting にはオーバースペック。将来 Runway API 呼び出し制御で検討 |

**補足**: Fixed Window と Sliding Window の Redis コマンド消費は同等（2コマンド/判定）であり、Sliding Window を選択してもコスト増はない。

---

## 3. 対象エンドポイントとレート制限値

### 3.1 エンドポイント分類

| カテゴリ | エンドポイント | レート制限 | 識別子 | 理由 |
|---------|-------------|----------|--------|------|
| **読み取り（公開）** | `GET /api/videos` | 60 req/60s | IP | ISRキャッシュとの二重防御 |
| **読み取り（公開）** | `GET /api/videos/trending` | 30 req/60s | IP | 更新頻度が低いため厳しめ |
| **読み取り（公開）** | `GET /api/videos/[id]` | 60 req/60s | IP | 動画再生時に呼ばれる |
| **読み取り（公開）** | `GET /api/categories` | 30 req/60s | IP | 低頻度アクセス |
| **読み取り（公開）** | `GET /api/channels/[slug]` | 30 req/60s | IP | 低頻度アクセス |
| **読み取り（公開）** | `GET /api/search` | 30 req/60s | IP | 検索スパム防止 |
| **書き込み** | `POST /api/views` | 30 req/60s | IP or userId | 視聴記録。連打防止 |
| **書き込み（認証）** | `POST /api/videos/[id]/like` | 10 req/60s | userId | いいね/取り消しの連打防止 |
| **書き込み（認証）** | `POST /api/videos/[id]/comments` | 5 req/60s | userId | コメントスパム防止 |
| **Webhook** | `POST /api/webhooks/mux` | 制限なし | — | Mux署名検証で保護 |
| **Webhook** | `POST /api/webhooks/clerk` | 制限なし | — | Svix署名検証で保護 |

### 3.2 レート制限値の根拠

```
通常ユーザーの行動パターン（1分間）:
- ホーム画面表示: 1 req (GET /api/videos)
- 無限スクロール: 2-3 req (GET /api/videos?cursor=...)
- 動画カード クリック: 1 req (GET /api/videos/[id])
- 合計: 4-7 req/分

→ 60 req/分 = 通常利用の約10倍。正当なヘビーユーザーは問題なし。
  スクレイピング/bot は即座にブロック。
```

### 3.3 認証状態による差別化

| ユーザー種別 | 識別子 | 読み取りレート | 書き込みレート |
|------------|--------|:----------:|:----------:|
| 未認証 | IP アドレス | 60 req/60s | 30 req/60s |
| 認証済み | Clerk userId | 120 req/60s | 書き込みAPIは個別設定 |

認証済みユーザーは信頼度が高いため、読み取りレートを2倍に緩和。

---

## 4. 実装設計

### 4.1 依存パッケージ

```bash
npm install @upstash/redis @upstash/ratelimit
```

### 4.2 環境変数

```env
# .env.local
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

### 4.3 Rate Limiter 初期化

```typescript
// lib/rate-limit.ts

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * 読み取りAPI用 Rate Limiter
 * 60リクエスト / 60秒 (Sliding Window)
 */
export const readRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  analytics: true, // Upstash ダッシュボードで分析可能
  prefix: "ratelimit:read",
});

/**
 * 認証済みユーザー用 Rate Limiter（読み取り緩和版）
 */
export const authReadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, "60 s"),
  analytics: true,
  prefix: "ratelimit:auth-read",
});

/**
 * 書き込みAPI用 Rate Limiter
 */
export const writeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  analytics: true,
  prefix: "ratelimit:write",
});

/**
 * コメント投稿用 Rate Limiter（厳格）
 */
export const commentRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "60 s"),
  analytics: true,
  prefix: "ratelimit:comment",
});

/**
 * いいね用 Rate Limiter
 */
export const likeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
  prefix: "ratelimit:like",
});
```

### 4.4 Rate Limit ミドルウェアヘルパー

```typescript
// lib/rate-limit.ts (続き)

import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { Ratelimit } from "@upstash/ratelimit";

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * リクエストの識別子を取得
 * 認証済み: userId、未認証: IP アドレス
 */
async function getIdentifier(): Promise<{
  identifier: string;
  isAuthenticated: boolean;
}> {
  const { userId } = await auth();
  if (userId) {
    return { identifier: userId, isAuthenticated: true };
  }

  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return { identifier: ip, isAuthenticated: false };
}

/**
 * Rate Limit チェックを実行し、超過時は 429 レスポンスを返す
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  authLimiter?: Ratelimit
): Promise<NextResponse | null> {
  const { identifier, isAuthenticated } = await getIdentifier();
  const activeLimiter =
    isAuthenticated && authLimiter ? authLimiter : limiter;

  const result = await activeLimiter.limit(identifier);

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Too Many Requests",
        message: "リクエストが多すぎます。しばらく待ってから再試行してください。",
        retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((result.reset - Date.now()) / 1000)
          ),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(result.reset),
        },
      }
    );
  }

  return null; // Rate limit OK
}
```

### 4.5 API Route での使用例

```typescript
// app/api/videos/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  readRateLimit,
  authReadRateLimit,
  checkRateLimit,
} from "@/lib/rate-limit";
import { getVideosForHome } from "@/lib/queries/videos";

export async function GET(req: NextRequest) {
  // Rate Limit チェック
  const rateLimitResponse = await checkRateLimit(
    readRateLimit,
    authReadRateLimit
  );
  if (rateLimitResponse) return rateLimitResponse;

  // 通常のビジネスロジック
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "recommended";
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const categorySlug = searchParams.get("categorySlug") ?? undefined;

  const data = await getVideosForHome({ tab, cursor, limit, categorySlug });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
```

```typescript
// app/api/videos/[id]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { commentRateLimit, checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 認証チェック
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate Limit チェック（コメント用の厳格なリミット）
  const rateLimitResponse = await checkRateLimit(commentRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  // コメント作成ロジック...
  const { id: videoId } = await params;
  const body = await req.json();

  // ...
}
```

---

## 5. 超過時レスポンス仕様

### 5.1 HTTP レスポンス

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 23
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708672800000

{
  "error": "Too Many Requests",
  "message": "リクエストが多すぎます。しばらく待ってから再試行してください。",
  "retryAfter": 23
}
```

### 5.2 クライアント側のハンドリング

```typescript
// lib/api-client.ts

export async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? 60);
    // TanStack Query の retry ロジックに任せる
    throw new RateLimitError(retryAfter);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }

  return res.json();
}

class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter}s`);
    this.name = "RateLimitError";
  }
}
```

```typescript
// TanStack Query でのリトライ設定
// hooks/useVideos.ts

export function useVideos(tab: string, categorySlug?: string) {
  return useInfiniteQuery({
    queryKey: ["videos", tab, categorySlug],
    queryFn: ({ pageParam }) => fetchApi<VideosResponse>(
      `/api/videos?tab=${tab}&cursor=${pageParam ?? ""}&limit=20` +
      (categorySlug ? `&categorySlug=${categorySlug}` : "")
    ),
    // 429 の場合は Retry-After 秒後に自動リトライ
    retry: (failureCount, error) => {
      if (error instanceof RateLimitError) return failureCount < 2;
      return failureCount < 3;
    },
    retryDelay: (_, error) => {
      if (error instanceof RateLimitError) return error.retryAfter * 1000;
      return 1000;
    },
    // ...他の設定
  });
}
```

### 5.3 UI 表示（429 発生時）

```
通常ユーザーが 429 に到達する可能性は極めて低いため、
MVP では Toast 通知のみで対応:

"リクエストの制限に達しました。しばらくお待ちください。"
（sonner/toast で表示、3秒後に自動消去）
```

---

## 6. Upstash 無料枠の消費量見積もり

### 6.1 Redis コマンド消費

Sliding Window アルゴリズムの `@upstash/ratelimit` は、1回の `limit()` 呼び出しで **2 Redis コマンド**を消費。

| 想定値 | 計算 |
|--------|------|
| 日間 API リクエスト | 1,000 - 5,000 req |
| Rate Limit チェック | 1,000 - 5,000 回 |
| Redis コマンド | 2,000 - 10,000 コマンド/日 |
| **Upstash 無料枠** | **10,000 コマンド/日** |

**結論**: MVP想定の 5,000 PV/月（~170 req/日）では余裕。日間 5,000 リクエストまでは無料枠で対応可能。

### 6.2 無料枠超過時の対応

1. **アラート設定**: Upstash ダッシュボードで 8,000 コマンド/日でアラート
2. **フォールバック**: Redis 接続失敗時はRate Limitをスキップ（可用性優先）
3. **有料プラン**: 必要時 Pay As You Go ($0.2/100K コマンド) で対応

```typescript
// lib/rate-limit.ts - フォールバック設定

export async function checkRateLimit(
  limiter: Ratelimit,
  authLimiter?: Ratelimit
): Promise<NextResponse | null> {
  try {
    const { identifier, isAuthenticated } = await getIdentifier();
    const activeLimiter =
      isAuthenticated && authLimiter ? authLimiter : limiter;

    const result = await activeLimiter.limit(identifier);

    if (!result.success) {
      // 429 レスポンス生成（前述）
      return NextResponse.json(/* ... */);
    }

    return null;
  } catch (error) {
    // Redis 接続失敗時: Rate Limit をスキップして処理を継続
    // 可用性 > セキュリティ（MVP段階）
    console.error("[RateLimit] Redis error, skipping:", error);
    return null;
  }
}
```

---

## 7. Next.js Middleware での一括適用（代替案）

個別の Route Handler で `checkRateLimit` を呼ぶ代わりに、Next.js Middleware で一括適用する方法もある。

```typescript
// middleware.ts（代替案）

import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "ratelimit:global",
});

export async function middleware(req: NextRequest) {
  // API Route のみに適用
  if (!req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Webhook は除外
  if (req.nextUrl.pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too Many Requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  }

  // Rate Limit ヘッダーを追加
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(limit));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
```

### 推奨: Route Handler 個別方式

| 観点 | Middleware 一括方式 | Route Handler 個別方式 |
|------|-------------------|---------------------|
| 設定の柔軟性 | △ 全APIに同一ルール | ✅ エンドポイントごとに最適なルール |
| 実装コスト | ✅ 1ファイルで完結 | △ 各 Route Handler に追加 |
| テスト容易性 | △ Middleware のテストが困難 | ✅ 個別にユニットテスト可能 |
| 認証連携 | △ Middleware 内での Clerk 認証は制限あり | ✅ Route Handler 内で柔軟に認証取得 |

**Route Handler 個別方式を推奨。** 将来的にエンドポイントごとの細かなチューニングが必要になるため。

ただし、**グローバルな安全ネット**として Middleware に緩いレート制限（300 req/60s）を追加で設置するのも有効:

```
Layer 1: Middleware      → 300 req/60s (IP) ← 安全ネット
Layer 2: Route Handler   → 60 req/60s (IP or userId) ← 細かな制御
```

---

## 8. CSP ヘッダー（SEC-ISSUE-1 への追加対応）

Rate Limiting と合わせて、レビューで指摘された CSP ヘッダーも定義する:

```typescript
// next.config.ts の headers に追加

{
  source: "/(.*)",
  headers: [
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https://image.mux.com https://img.clerk.com data:",
        "media-src 'self' https://stream.mux.com",
        "frame-src 'self' https://*.clerk.com",
        "connect-src 'self' https://*.clerk.com https://*.mux.com https://*.upstash.io",
        "font-src 'self'",
      ].join("; "),
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
  ],
},
```

**注意**: Next.js の `'unsafe-eval'` は開発モードで必要。本番ビルドでは `nonce` ベースの CSP に移行推奨。

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成 | tech-leader |
| 2026-02-23 | 1.1 | [RL-V-1] Sliding Window 選定の検討経緯を明記（researcher 調査との対比） | tech-leader |
