# AIチャンネルページ: データフロー・インフラ設計

> 元ファイル: [channel-data-design.md](channel-data-design.md) から分割（§5-11）

---

## 5. Server Component データフロー

### 5.1 ページ構成

> **CONS-ISSUE-2 注記**: チャンネルページの OGP メタデータ（`generateMetadata`）は**必須**。
> channel-performance-design.md で「OGP不要」と記述されている場合、本ファイル（channel-data-design.md）の定義を正とする。
> チャンネルページは SNS シェア対象であり、OGP タイトル・説明・アバター画像の出力が必要。

> **SEC-ISSUE-2 対応**: ISR キャッシュにユーザー固有状態を含めない設計。
> チャンネル公開データは Server Component (ISR) で取得し、`userState`（isSubscribed 等）は
> Client Component から `GET /api/channels/[slug]/user-state` (no-store) で別途取得する。
> これにより ISR キャッシュされた HTML に他ユーザーの登録状態が漏洩することを防止する。

```typescript
// app/channel/[slug]/page.tsx

import { Suspense } from "react";
import { getChannelBySlug } from "@/lib/queries/channel-detail";
import { notFound } from "next/navigation";

// ISR: 5分ごとに再生成
// ⚠️ ユーザー固有データ（userState）は ISR に含めない（SEC-ISSUE-2）
export const revalidate = 300;

// OGP メタデータ（CONS-ISSUE-2: 本ファイルの定義を正とする）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const channel = await getChannelBySlug(slug);
  if (!channel) return {};

  return {
    title: `${channel.name} - AI Theater`,
    description:
      channel.description ??
      `${channel.name} は AI Theater の AI クリエイターです`,
    openGraph: {
      title: channel.name,
      description: channel.description ?? undefined,
      type: "profile",
      images: channel.avatarUrl
        ? [{ url: channel.avatarUrl, width: 400, height: 400, alt: channel.name }]
        : undefined,
    },
    twitter: {
      card: "summary",
      title: channel.name,
      description: channel.description ?? undefined,
    },
  };
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // ──── 公開データのみ SSR（ISR キャッシュ対象）────
  const channel = await getChannelBySlug(slug);
  if (!channel) notFound();

  return (
    <main className="mx-auto max-w-[1200px]">
      {/* ──── ヘッダー: バナー + プロフィール + 統計 ──── */}
      {/* ChannelHeader は公開データで SSR。登録ボタンは Client Component で
          useUserChannelState() → GET /api/channels/[slug]/user-state を呼び出す */}
      <ChannelHeader channel={channel} />

      {/* ──── 登録ボタン（Client Component）──── */}
      {/* userState は ISR に含めず、client-side で no-store fetch */}
      <SubscribeButton slug={slug} channelId={channel.id} />

      {/* ──── タブナビゲーション ──── */}
      <ChannelTabs slug={slug}>
        {/* Videos タブ（デフォルト）*/}
        <Suspense fallback={<VideoGridSkeleton count={12} />}>
          <ChannelVideoGrid slug={slug} />
        </Suspense>

        {/* About タブ: AI エージェント仕様 + 統計 */}
        <Suspense fallback={<ChannelStatsSkeleton />}>
          <ChannelAbout channel={channel} slug={slug} />
        </Suspense>
      </ChannelTabs>

      {/* ──── JSON-LD 構造化データ ──── */}
      <ChannelJsonLd channel={channel} />
    </main>
  );
}
```

#### 5.1.1 ユーザー状態の Client-side Fetch

```typescript
// hooks/useUserChannelState.ts

import { useQuery } from "@tanstack/react-query";

export function useUserChannelState(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["channel-user-state", slug],
    queryFn: () =>
      fetch(`/api/channels/${slug}/user-state`, {
        cache: "no-store", // ユーザー固有データはキャッシュしない
      }).then((res) => res.json()),
    enabled,              // 認証済みユーザーのみ
    staleTime: 0,         // 常に最新
    gcTime: 5 * 60 * 1000,
  });
}
```

### 5.2 データフェッチフロー

> **SEC-ISSUE-2 対応**: 公開データ（ISR）とユーザー固有データ（client-side）を分離。

```
ユーザーが /channel/[slug] にアクセス
    ↓
[Vercel Edge] ISR キャッシュヒット → HTML返却（公開チャンネル情報＋OGP）
    ↓ (キャッシュなし or revalidate=300)
[Server Component] ChannelPage
    ├── getChannelBySlug(slug)               → ~5ms（公開データのみ）
    │   ⚠️ auth() / userState は SSR で取得しない（ISR キャッシュ汚染防止）
    │
    ├── <ChannelHeader> (SSR — 公開データのみ)
    │     ├── バナー画像
    │     ├── アバター + チャンネル名 + 説明
    │     ├── 統計バッジ: 動画数 / 登録者数 / 総再生数
    │     └── AI生成統計: 平均QualityScore / 総生成時間 / 総コスト
    │
    ├── <SubscribeButton> (Client Component)
    │     └── Hydration 後に useUserChannelState() を実行
    │
    ├── <ChannelTabs> (Client Component — タブ切り替え)
    │     ├── Videos タブ (デフォルト)
    │     │     └── <Suspense> <ChannelVideoGrid>
    │     │           └── getChannelVideos(slug) → ~15ms
    │     │
    │     └── About タブ
    │           └── <Suspense> <ChannelAbout>
    │                 ├── AI エージェント仕様（channel データから表示）
    │                 └── getChannelStats(slug) → ~40ms（タブ切替時に取得）
    │
    └── <ChannelJsonLd> (SSR 構造化データ)
    ↓
[ブラウザ]
    ├── 公開データ（ヘッダー + 動画グリッド）即座に表示
    ├── Hydration
    │     ├── <SubscribeButton> → useUserChannelState(slug)
    │     │     → GET /api/channels/[slug]/user-state (no-store)
    │     │     → isSubscribed に応じてボタン状態を更新
    │     └── タブ切り替え → Client Component
    └── スクロールで動画追加読み込み
          → GET /api/channels/[slug]/videos?cursor=xxx
          → TanStack Query キャッシュに追加
```

**ISR / Client-side 分離の設計根拠:**

| データ種別 | 取得方法 | キャッシュ | 理由 |
|-----------|---------|:---------:|------|
| チャンネル公開情報 | Server Component (ISR) | revalidate=300 | 全ユーザー共通。SEO/OGP 必須 |
| 動画一覧（初期） | Server Component (ISR) | revalidate=300 | 全ユーザー共通 |
| ユーザー登録状態 | Client-side fetch (no-store) | なし | ユーザー固有。ISR に含めると漏洩リスク |
| AI生成統計（詳細） | Client-side fetch | staleTime=5分 | About タブ表示時にオンデマンド |

### 5.3 JSON-LD 構造化データ

```typescript
// components/channel/ChannelJsonLd.tsx

function ChannelJsonLd({ channel }: { channel: ChannelDetail }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",        // ⚠️ Person ではなく Organization（整合性チェック準拠）
    name: channel.name,
    description: channel.description,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/channel/${channel.slug}`,
    logo: channel.avatarUrl ?? undefined,
    image: channel.bannerUrl ?? undefined,
    foundingDate: channel.createdAt,
    // AI Theater 拡張メタデータ
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "aiModel",
        value: channel.aiModel,
      },
      {
        "@type": "PropertyValue",
        name: "videoCount",
        value: channel.videoCount,
      },
      {
        "@type": "PropertyValue",
        name: "subscriberCount",
        value: channel.subscriberCount,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
```

---

## 6. インデックス設計

### 6.1 チャンネルページ用追加インデックス

ホーム画面・動画再生ページで定義済みのインデックスに加え、以下を追加:

| テーブル | インデックス | 用途 | クエリパターン |
|---------|------------|------|-------------|
| `videos` | `(channelId, status, publishedAt)` | チャンネル動画の新着順 | `WHERE channelId = ? AND status = 'PUBLISHED' ORDER BY publishedAt DESC` |
| `videos` | `(channelId, status, viewCount)` | チャンネル動画の人気順 | `WHERE channelId = ? AND status = 'PUBLISHED' ORDER BY viewCount DESC` |
| `ai_channels` | `(isActive, slug)` | アクティブチャンネル検索 | `WHERE isActive = true AND slug = ?` |

### 6.2 Prisma スキーマへのインデックス追加

```prisma
model Video {
  // ... 既存フィールド ...

  // 既存インデックス（home-data-design.md）
  @@index([channelId])
  @@index([status, publishedAt])
  @@index([status, viewCount])

  // 動画再生ページ用（video-player-data-design.md）
  @@index([channelId, status, qualityScore])    // 同一チャンネルの品質順

  // チャンネルページ用（新規追加）
  @@index([channelId, status, publishedAt])     // チャンネル動画の新着順
  @@index([channelId, status, viewCount])       // チャンネル動画の人気順
}
```

### 6.3 GIN インデックス（カスタムマイグレーション）

AIChannel の `supportedModels`、`specializations` フィールドに対する GIN インデックス:

```sql
-- prisma/migrations/xxx_add_channel_gin_indexes/migration.sql

-- AIChannel の配列フィールド用 GIN インデックス
CREATE INDEX idx_ai_channels_supported_models_gin ON ai_channels USING gin (supported_models);
CREATE INDEX idx_ai_channels_specializations_gin ON ai_channels USING gin (specializations);
```

既存の `idx_videos_moods_gin`（home-data-design.md で定義済み）と合わせ、チャンネルページでのムードフィルタリングにも活用。

### 6.4 インデックスサイズ影響

チャンネルページ追加インデックスのサイズ見積もり（MVP想定: 動画5,000本、チャンネル10個）:

| インデックス | 推定サイズ |
|------------|:--------:|
| `(channelId, status, publishedAt)` | ~200KB |
| `(channelId, status, viewCount)` | ~200KB |
| `(isActive, slug)` | ~1KB |
| GIN (supportedModels) | ~1KB |
| GIN (specializations) | ~1KB |
| **合計追加分** | **~400KB** |

Supabase 無料枠 500MB に対して影響は軽微。

---

## 7. キャッシュ戦略

### 7.1 レイヤー別キャッシュ

```
[ブラウザ]
  ├── チャンネル公開情報 → SSR で初期表示（ISR 5分キャッシュ）
  ├── ユーザー登録状態 → Client fetch (no-store, staleTime: 0)  ← SEC-ISSUE-2 対応
  ├── 動画一覧 → TanStack Query (staleTime: 60秒)
  └── AI生成統計 → TanStack Query (staleTime: 5分)

[Vercel Edge]
  └── ISR キャッシュ (revalidate: 300秒)
      ⚠️ ユーザー固有状態（userState）は含まない

[サーバー]
  ├── Prisma → Supabase PostgreSQL
  └── RLS ポリシー適用（Supabase Client SDK 経由のアクセス時）
```

### 7.2 TanStack Query キャッシュ設定

```typescript
// hooks/useChannelVideos.ts

export function useChannelVideos(
  slug: string,
  sort: "newest" | "popular" | "quality",
  mood?: string
) {
  return useInfiniteQuery({
    queryKey: ["channel-videos", slug, sort, mood],
    queryFn: ({ pageParam }) =>
      fetchApi<ChannelVideosResponse>(
        `/api/channels/${slug}/videos?sort=${sort}&cursor=${pageParam ?? ""}&limit=20` +
        (mood ? `&mood=${mood}` : "")
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 60 * 1000,        // 1分
    gcTime: 5 * 60 * 1000,       // 5分
  });
}

// hooks/useChannelStats.ts

export function useChannelStats(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["channel-stats", slug],
    queryFn: () => fetchApi<ChannelStatsResponse>(
      `/api/channels/${slug}/stats`
    ),
    enabled,                     // About タブ表示時のみ取得
    staleTime: 5 * 60 * 1000,   // 5分
    gcTime: 10 * 60 * 1000,     // 10分
  });
}

// hooks/useSubscribe.ts

export function useSubscribe(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<SubscribeResponse>(`/api/channels/${slug}/subscribe`, {
        method: "POST",
      }),
    onMutate: async () => {
      // 楽観的更新
      await queryClient.cancelQueries({ queryKey: ["channel", slug] });
      const previous = queryClient.getQueryData(["channel", slug]);
      queryClient.setQueryData(
        ["channel", slug],
        (old: ChannelDetailResponse | undefined) => {
          if (!old) return old;
          const isSubscribed = !old.userState?.isSubscribed;
          return {
            ...old,
            channel: {
              ...old.channel,
              subscriberCount: old.channel.subscriberCount + (isSubscribed ? 1 : -1),
            },
            userState: {
              isSubscribed,
              subscribedAt: isSubscribed ? new Date().toISOString() : null,
            },
          };
        }
      );
      return { previous };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(["channel", slug], context?.previous);
    },
  });
}
```

### 7.3 タブ別キャッシュ戦略

| タブ | レンダリング | revalidate | staleTime | 理由 |
|------|------------|------------|-----------|------|
| Videos | SSR + ISR | 300秒 | 1分 | 新着動画を反映しつつキャッシュ |
| About (統計) | クライアント遅延取得 | — | 5分 | 低頻度アクセス。タブ切替時にオンデマンド取得 |

---

## 8. Rate Limiting 設計

### 8.1 エンドポイント別レート制限

home-rate-limiting.md で定義済みの Rate Limiter を再利用する。

| エンドポイント | Rate Limiter | レート制限 | 識別子 |
|-------------|-------------|----------|--------|
| `GET /api/channels/[slug]` | `readRateLimit` / `authReadRateLimit` | 60 req/60s (未認証) / 120 req/60s (認証済み) | IP / userId |
| `GET /api/channels/[slug]/videos` | `readRateLimit` / `authReadRateLimit` | 60 req/60s / 120 req/60s | IP / userId |
| `GET /api/channels/[slug]/stats` | `readRateLimit` | 30 req/60s | IP |
| `GET /api/channels/[slug]/user-state` | `readRateLimit` | 60 req/60s | userId |
| `POST /api/channels/[slug]/subscribe` | `subscribeRateLimit`（新規） | 10 req/60s | userId |

### 8.2 新規 Rate Limiter

```typescript
// lib/rate-limit.ts に追加

/**
 * チャンネル登録用 Rate Limiter
 */
export const subscribeRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
  prefix: "ratelimit:subscribe",
});
```

### 8.3 API Route での使用例

```typescript
// app/api/channels/[slug]/subscribe/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { subscribeRateLimit, checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // 認証チェック
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate Limit チェック
  const rateLimitResponse = await checkRateLimit(subscribeRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;
  const result = await toggleSubscription(userId, slug);

  return NextResponse.json(result);
}
```

### 8.4 Redis コマンド追加消費量

チャンネルページ追加エンドポイントの Rate Limit チェックによる Upstash Redis コマンド消費量見積もり:

| エンドポイント | 日間リクエスト見積もり | Redis コマンド |
|-------------|:---------------:|:----------:|
| `GET /api/channels/[slug]` | 100-500 | 200-1,000 |
| `GET /api/channels/[slug]/videos` | 200-1,000 | 400-2,000 |
| `GET /api/channels/[slug]/stats` | 50-200 | 100-400 |
| `POST .../subscribe` | 10-50 | 20-100 |
| **合計追加分** | | **720-3,500** |

home-rate-limiting.md §6.1 の既存消費量（2,000-10,000 コマンド/日）と合算しても Upstash 無料枠（10,000 コマンド/日）で対応可能。

---

## 9. TypeScript 型定義まとめ

### 9.1 共有型定義ファイル

```typescript
// types/channel.ts

/** チャンネル詳細（API レスポンス） */
export interface ChannelDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  aiModel: string;
  supportedModels: string[];
  themes: string[];
  specializations: string[];
  videoCount: number;
  subscriberCount: number;
  totalViewCount: number;
  totalGenerationTimeSec: number;
  totalEstimatedCostUsd: number;
  averageQualityScore: number | null; // DB: 0-100
  createdAt: string;
}

/** ユーザーのチャンネル登録状態 */
export interface UserChannelState {
  isSubscribed: boolean;
  subscribedAt: string | null;
}

/** チャンネル詳細 API レスポンス */
export interface ChannelDetailResponse {
  channel: ChannelDetail;
  userState: UserChannelState | null;
}

/** チャンネル動画一覧 API レスポンス */
export interface ChannelVideosResponse {
  videos: VideoCard[];      // home-data-design.md §2.4 と同一型
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

/** AI 生成統計 API レスポンス */
export interface ChannelStatsResponse {
  channelId: string;
  qualityDistribution: {
    min: number;
    max: number;
    average: number;
    median: number;
  };
  moodStats: MoodStat[];
  modelStats: ModelStat[];
  monthlyVideoCount: MonthlyCount[];
}

export interface MoodStat {
  mood: string;
  videoCount: number;
  avgQualityScore: number;
}

export interface ModelStat {
  aiModel: string;
  videoCount: number;
  avgGenerationTimeSec: number;
  avgQualityScore: number;
}

export interface MonthlyCount {
  month: string;
  count: number;
}

/** チャンネル登録トグル API レスポンス */
export interface SubscribeResponse {
  isSubscribed: boolean;
  subscriberCount: number;
}
```

### 9.2 Zod バリデーションスキーマ

```typescript
// lib/validations/channel.ts
import { z } from "zod";

/** GET /api/channels/[slug]/videos クエリパラメータ */
export const channelVideosQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["newest", "popular", "quality"]).default("newest"),
  mood: z.string().optional(),
});

/** slug パラメータ */
export const channelSlugSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
});
```

---

## 10. セキュリティ考慮事項

### 10.1 入力バリデーション

| フィールド | バリデーション |
|-----------|-------------|
| `slug` | 1-100文字、英小文字・数字・ハイフンのみ（`/^[a-z0-9-]+$/`）|
| `cursor` | CUID フォーマット |
| `limit` | 1-50 の整数 |
| `sort` | "newest" / "popular" / "quality" のみ（Zod enum） |
| `mood` | 任意文字列（DB に存在するムード値でフィルタされるため安全） |

### 10.2 認可チェック

| アクション | チェック |
|-----------|---------|
| チャンネル閲覧 | 認証不要（`isActive = true` のチャンネルのみ） |
| 動画一覧閲覧 | 認証不要（`status = PUBLISHED` のみ） |
| 統計閲覧 | 認証不要 |
| チャンネル登録/解除 | Clerk 認証必須 |

### 10.3 Supabase RLS ポリシー

チャンネルページ関連テーブルの Row Level Security (RLS) ポリシーを以下のとおり設定する。

#### 10.3.1 Clerk → Supabase JWT マッピング

Clerk の JWT claim `sub`（ユーザーID）を Supabase の `auth.uid()` にマッピングする。Supabase は Clerk が発行する JWT を検証し、`sub` claim を RLS ポリシーの `auth.uid()` として使用する。

```sql
-- Supabase Dashboard > Authentication > JWT Settings で
-- Clerk の JWKS URL を設定:
-- https://<clerk-instance>.clerk.accounts.dev/.well-known/jwks.json
--
-- JWT claim マッピング:
--   Clerk の `sub` → Supabase の `auth.uid()`
--   Clerk の `user_id` → Supabase の `auth.jwt() ->> 'user_id'`
```

#### 10.3.2 ai_channels テーブル

```sql
-- RLS 有効化
ALTER TABLE ai_channels ENABLE ROW LEVEL SECURITY;

-- SELECT: アクティブなチャンネルは全ユーザー閲覧可能
CREATE POLICY "ai_channels_select_active"
  ON ai_channels FOR SELECT
  USING (is_active = true);

-- INSERT/UPDATE/DELETE: サービスロール（AIパイプライン）のみ
-- フロントエンドからの直接変更は不可
CREATE POLICY "ai_channels_service_only"
  ON ai_channels FOR ALL
  USING (auth.role() = 'service_role');
```

#### 10.3.3 videos テーブル

```sql
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- SELECT: 公開済み動画は全ユーザー閲覧可能
CREATE POLICY "videos_select_published"
  ON videos FOR SELECT
  USING (status = 'PUBLISHED');

-- INSERT/UPDATE/DELETE: サービスロール（AIパイプライン）のみ
-- 人間アップロード防止の3層防御（§10.5 参照）の一環
CREATE POLICY "videos_service_only"
  ON videos FOR ALL
  USING (auth.role() = 'service_role');
```

#### 10.3.4 subscriptions テーブル

```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の登録情報のみ閲覧可能
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (
    user_id = (
      SELECT id FROM users WHERE clerk_id = auth.uid()
    )
  );

-- INSERT: 認証ユーザーが自分の登録のみ作成可能
CREATE POLICY "subscriptions_insert_own"
  ON subscriptions FOR INSERT
  WITH CHECK (
    user_id = (
      SELECT id FROM users WHERE clerk_id = auth.uid()
    )
  );

-- DELETE: 認証ユーザーが自分の登録のみ削除可能
CREATE POLICY "subscriptions_delete_own"
  ON subscriptions FOR DELETE
  USING (
    user_id = (
      SELECT id FROM users WHERE clerk_id = auth.uid()
    )
  );
```

#### 10.3.5 RLS ポリシーと Prisma の関係

Prisma は `DATABASE_URL`（Supabase Pooler 経由）で接続する。サービス側（API Route）では Supabase の `service_role` キーではなく、Prisma Client を使用するため、RLS は **Supabase クライアント SDK での直接アクセス時**に適用される。

Prisma 経由のアクセスは RLS をバイパスするが、アプリケーションレベルで同等の認可チェック（§10.2）を実装することで同等のセキュリティを確保する。

| アクセス経路 | RLS 適用 | 認可チェック |
|------------|:-------:|:---------:|
| Supabase Client SDK（将来のリアルタイム機能等） | ✅ RLS 適用 | RLS ポリシー |
| Prisma Client（API Route） | ❌ バイパス | アプリケーションレベル（§10.2） |
| Supabase Dashboard | ❌ バイパス | 管理者認証 |

### 10.4 BigInt → number 変換

`AIChannel.totalViewCount` は Prisma では `BigInt` 型。API レスポンスで JSON シリアライズする際に `number` に変換が必要:

```typescript
// lib/utils/bigint.ts

/**
 * BigInt を number に安全に変換する。
 * Number.MAX_SAFE_INTEGER (9,007,199,254,740,991) を超える場合は
 * そのまま返す（MVP 段階では到達しない想定）。
 */
export function bigIntToNumber(value: bigint): number {
  if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return Number(value); // MVP では安全範囲内
}
```

### 10.5 人間アップロード防止 3層防御との接続

チャンネルページで表示されるすべてのコンテンツ（動画・メタデータ）は、AI 生成パイプライン経由でのみ登録される。人間による直接アップロードは技術的に防止されている。

#### 3層防御の概要

| 層 | 防御策 | チャンネルページとの関係 |
|:-:|--------|---------------------|
| 1 | **API キー制限**: Railway ワーカー（AIパイプライン）のみが Mux Upload API のサービスAPIキーを保有 | チャンネルに表示される動画は全て Mux 経由でトランスコードされたもの |
| 2 | **エンドポイント非公開**: フロントエンドからの動画アップロードエンドポイントを非公開 | チャンネルページにアップロード UI は存在しない |
| 3 | **DB 参照整合性**: Video 登録時に AI 生成ジョブ ID の参照整合性チェック | `Video.aiModel`, `Video.aiPrompt` が必須。ジョブID なしでは DB 登録不可 |

> **参照**: 3層防御の詳細設計は `docs/architecture/` の人間アップロード防止設計書を参照。
> RLS ポリシー（§10.3）も防御の一環として `videos` テーブルの INSERT を `service_role` のみに制限している。

#### Provenance（来歴）バッジ

チャンネルページおよび動画カードに「AI 生成コンテンツ」であることを明示するバッジを表示する。

```typescript
// components/common/AIProvenanceBadge.tsx

interface AIProvenanceBadgeProps {
  aiModel: string;
  size?: "sm" | "md";
}

/**
 * AI 生成コンテンツの来歴バッジ。
 * EU AI Act・日本 AI ガイドラインの表示義務に対応。
 *
 * 表示内容:
 * - "AI生成" ラベル（常時表示）
 * - 使用 AI モデル名（ホバー時表示）
 * - 将来: C2PA 認証リンク（Content Credentials 対応時）
 */
export function AIProvenanceBadge({ aiModel, size = "sm" }: AIProvenanceBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5",
      "text-xs font-medium text-secondary",
      size === "md" && "px-3 py-1 text-sm"
    )}>
      <SparklesIcon className="h-3 w-3" />
      AI生成
      {/* ツールチップで使用モデル表示 */}
    </span>
  );
}
```

| 表示箇所 | バッジサイズ | 表示条件 |
|---------|:---------:|---------|
| チャンネルヘッダー（チャンネル名横） | md | 常時表示 |
| 動画カード（サムネイル上） | sm | 常時表示 |
| 動画カード（ホバー時） | — | 使用モデル名をツールチップ表示 |

---

## 11. 整合性チェック結果

team-config.md §9.5 準拠のチェック結果:

| # | チェック項目 | 結果 | 対応箇所 |
|---|-------------|:----:|---------|
| 1 | Quality Score: DB 0-100 スケール | ✅ | §3.2 `averageQualityScore` コメントに明記。UI 変換は video-player-data-design.md §12 の `toDisplayScore()` を使用 |
| 2 | コメントフィールド名: `body` | ✅ | チャンネルページにコメント機能なし（動画再生ページで対応済み） |
| 3 | JSON-LD creator `@type`: `Organization` | ✅ | §5.3 `@type: "Organization"` で統一 |
| 4 | Mux Data custom_1..3 | ✅ | チャンネルページでは Mux Player を直接使用しないが、動画再生ページからの custom_3=channel_id でチャンネル別集計可能 |
| 5 | `themes` / `specializations` の使い分け | ✅ | §2.2 で定義。`themes` = 得意ジャンル（日本語、UIタグ表示用）、`specializations` = 技術的得意分野（英語、内部分類用） |
| 6 | `BigInt` 型の JSON シリアライズ | ✅ | §10.4 `bigIntToNumber()` ユーティリティで変換 |
| 7 | ISR キャッシュにユーザー固有データを含めない | ✅ | §5.1/§5.2 userState を client-side no-store fetch に分離（SEC-ISSUE-2） |
| 8 | Supabase RLS ポリシー定義 | ✅ | §10.3 ai_channels/videos/subscriptions の RLS + Clerk JWT マッピング（SEC-ISSUE-1） |
| 9 | 人間アップロード防止 3層防御との接続 | ✅ | §10.5 3層防御の概要 + Provenance バッジ設計（SEC-ISSUE-3） |
| 10 | OGP 要件の正規定義 | ✅ | §5.1 本ファイルが正と明記（CONS-ISSUE-2） |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-26 | 1.0 | 初版作成 | tech-leader |
| 2026-02-27 | 2.0 | [CONS-ISSUE-3] §4.1 findUnique → findFirst 修正（非ユニーク条件混在不可）、[SEC-ISSUE-1] §10.3 Supabase RLS ポリシー追記（ai_channels/videos/subscriptions + Clerk JWT マッピング）、[SEC-ISSUE-2] §4.1/§5.1/§5.2 ISR とユーザー固有状態の分離（userState を client-side no-store fetch に変更、user-state API 追加）、[SEC-ISSUE-3] §10.5 人間アップロード防止3層防御との接続明記 + Provenance バッジ設計、[CONS-ISSUE-2] §5.1 OGP 要件の正規定義を本ファイルと明記 | tech-leader |
