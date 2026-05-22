# AIチャンネルページ: API・クエリ最適化

> 元ファイル: [channel-data-design.md](channel-data-design.md) から分割（§3-4）

---

## 3. API エンドポイント設計

### 3.1 エンドポイント一覧

| メソッド | パス | 説明 | 認証 | Rate Limit | キャッシュ |
|---------|------|------|:----:|-----------|:---------:|
| GET | `/api/channels/[slug]` | チャンネル詳細（公開データ） | 不要 | 60 req/60s | ISR 300s |
| GET | `/api/channels/[slug]/videos` | チャンネル動画一覧 | 不要 | 60 req/60s | ISR 300s |
| GET | `/api/channels/[slug]/stats` | AI生成統計（詳細） | 不要 | 30 req/60s | s-maxage=300 |
| GET | `/api/channels/[slug]/user-state` | ユーザー固有状態（登録状態等） | 必須 | 60 req/60s | no-store |
| POST | `/api/channels/[slug]/subscribe` | 登録/解除トグル | 必須 | 10 req/60s | — |

### 3.2 チャンネル詳細 API: `GET /api/channels/[slug]`

**レスポンス型:**

```typescript
interface ChannelDetailResponse {
  channel: ChannelDetail;
  userState: UserChannelState | null; // 認証時のみ
}

interface ChannelDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;

  // AI エージェント仕様
  aiModel: string;
  supportedModels: string[];
  themes: string[];
  specializations: string[];

  // 基本統計（集計キャッシュ）
  videoCount: number;
  subscriberCount: number;
  totalViewCount: number; // BigInt → number 変換済み

  // AI 生成統計（集計キャッシュ）
  totalGenerationTimeSec: number;
  totalEstimatedCostUsd: number;
  averageQualityScore: number | null; // DB: 0-100。UI表示時は toDisplayScore() で 0.0-5.0 に変換

  createdAt: string; // ISO 8601
}

// ユーザー固有の状態（認証時のみ返却）
interface UserChannelState {
  isSubscribed: boolean;
  subscribedAt: string | null; // ISO 8601
}
```

### 3.3 チャンネル動画一覧 API: `GET /api/channels/[slug]/videos`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `cursor` | string | - | カーソル（最後の動画ID） |
| `limit` | number | 20 | 取得件数（最大50） |
| `sort` | enum | "newest" | ソート: newest / popular / quality |
| `mood` | string | - | ムードフィルタ（"calm", "energetic" 等） |

**レスポンス型:**

```typescript
interface ChannelVideosResponse {
  videos: VideoCard[];          // VideoCard は home-data-design.md §2.4 と同一型
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;           // AIChannel.videoCount から取得（キャッシュ値）
}
```

### 3.4 AI生成統計 API: `GET /api/channels/[slug]/stats`

チャンネルの AI 生成に関する詳細統計を返す。ヘッダーの集計キャッシュだけでは足りない分布情報・内訳データをオンデマンドで取得する。

**レスポンス型:**

```typescript
interface ChannelStatsResponse {
  channelId: string;

  // 品質スコア分布
  qualityDistribution: {
    min: number;                // 最低スコア (0-100)
    max: number;                // 最高スコア (0-100)
    average: number;            // 平均スコア (0-100)
    median: number;             // 中央値 (0-100)
  };

  // ムード別統計
  moodStats: MoodStat[];

  // AIモデル別統計
  modelStats: ModelStat[];

  // 時系列（直近12ヶ月の月別動画投稿数）
  monthlyVideoCount: MonthlyCount[];
}

interface MoodStat {
  mood: string;                 // "calm", "energetic" 等
  videoCount: number;
  avgQualityScore: number;      // 0-100
}

interface ModelStat {
  aiModel: string;              // "runway-gen4-turbo" 等
  videoCount: number;
  avgGenerationTimeSec: number;
  avgQualityScore: number;      // 0-100
}

interface MonthlyCount {
  month: string;                // "2026-01", "2026-02" 等
  count: number;
}
```

### 3.5 チャンネル登録 API: `POST /api/channels/[slug]/subscribe`

リクエストボディ不要（トグル方式）。

**処理フロー:**

```
1. Clerk 認証チェック
2. slug からチャンネルID取得
3. 既存 Subscription を検索 (userId + channelId)
4. 存在しない → 新規作成 + AIChannel.subscriberCount increment
5. 存在する → 削除 + AIChannel.subscriberCount decrement
```

**レスポンス型:**

```typescript
// 200 OK
interface SubscribeResponse {
  isSubscribed: boolean;
  subscriberCount: number;      // 更新後の登録者数
}
```

```typescript
async function toggleSubscription(userId: string, channelSlug: string) {
  const channel = await prisma.aIChannel.findUnique({
    where: { slug: channelSlug },
    select: { id: true },
  });

  if (!channel) throw new NotFoundError("Channel not found");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: {
        userId_channelId: { userId, channelId: channel.id },
      },
    });

    if (existing) {
      // 登録解除
      await tx.subscription.delete({ where: { id: existing.id } });
      const updated = await tx.aIChannel.update({
        where: { id: channel.id },
        data: { subscriberCount: { decrement: 1 } },
        select: { subscriberCount: true },
      });
      return { isSubscribed: false, subscriberCount: updated.subscriberCount };
    }

    // 新規登録
    await tx.subscription.create({
      data: { userId, channelId: channel.id },
    });
    const updated = await tx.aIChannel.update({
      where: { id: channel.id },
      data: { subscriberCount: { increment: 1 } },
      select: { subscriberCount: true },
    });
    return { isSubscribed: true, subscriberCount: updated.subscriberCount };
  });
}
```

---

## 4. クエリ最適化

### 4.1 チャンネル詳細データの取得

```typescript
// lib/queries/channel-detail.ts

/**
 * チャンネル公開データの取得（ISR キャッシュ対象）
 *
 * ⚠️ SEC-ISSUE-2 対応: ユーザー固有状態（isSubscribed 等）は
 * ISR キャッシュに含めてはならない（他ユーザーに漏洩する）。
 * userState は別途 client-side fetch で取得する（§5.1 参照）。
 */
export async function getChannelBySlug(slug: string) {
  // ⚠️ findUnique は @unique フィールド単体でしか検索できない。
  // slug は @unique だが isActive は非ユニーク条件のため findFirst を使用。
  return prisma.aIChannel.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
      bannerUrl: true,
      accentColor: true,

      // AI エージェント仕様
      aiModel: true,
      supportedModels: true,
      themes: true,
      specializations: true,

      // 基本統計
      videoCount: true,
      subscriberCount: true,
      totalViewCount: true,

      // AI 生成統計
      totalGenerationTimeSec: true,
      totalEstimatedCostUsd: true,
      averageQualityScore: true,

      createdAt: true,
    },
  });
}

/**
 * ユーザー固有のチャンネル状態（client-side fetch 用 API Route）
 *
 * ⚠️ ISR キャッシュに含めず、API Route (`GET /api/channels/[slug]/user-state`)
 * として公開し、クライアントから no-store で取得する。
 */
export async function getUserChannelState(
  userId: string,
  channelId: string
): Promise<UserChannelState> {
  const subscription = await prisma.subscription.findUnique({
    where: {
      userId_channelId: { userId, channelId },
    },
    select: { createdAt: true },
  });

  return {
    isSubscribed: !!subscription,
    subscribedAt: subscription?.createdAt.toISOString() ?? null,
  };
}
```

#### 4.1.1 ユーザー状態 API: `GET /api/channels/[slug]/user-state`

ISR キャッシュから分離されたユーザー固有状態を返す専用エンドポイント。

```typescript
// app/api/channels/[slug]/user-state/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserChannelState } from "@/lib/queries/channel-detail";
import { readRateLimit, checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic"; // ISR 対象外

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ userState: null });
  }

  const rateLimitResponse = await checkRateLimit(readRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  const { slug } = await params;
  const channel = await prisma.aIChannel.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!channel) {
    return NextResponse.json({ userState: null });
  }

  const userState = await getUserChannelState(userId, channel.id);

  return NextResponse.json(
    { userState },
    {
      headers: {
        "Cache-Control": "no-store", // ユーザー固有データはキャッシュしない
      },
    }
  );
}
```

### 4.2 チャンネル動画一覧クエリ

```typescript
// lib/queries/channel-videos.ts

export async function getChannelVideos({
  slug,
  cursor,
  limit = 20,
  sort = "newest",
  mood,
}: {
  slug: string;
  cursor?: string;
  limit?: number;
  sort?: "newest" | "popular" | "quality";
  mood?: string;
}) {
  const channel = await prisma.aIChannel.findUnique({
    where: { slug },
    select: { id: true, videoCount: true },
  });

  if (!channel) return null;

  const where: Prisma.VideoWhereInput = {
    channelId: channel.id,
    status: "PUBLISHED",
    ...(mood && { moods: { has: mood } }),
  };

  const orderBy = getChannelVideoOrderBy(sort);

  const videos = await prisma.video.findMany({
    where,
    orderBy,
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    select: channelVideoCardSelect,
  });

  const hasMore = videos.length > limit;
  const result = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return {
    videos: result,
    nextCursor,
    hasMore,
    totalCount: channel.videoCount,
  };
}

function getChannelVideoOrderBy(
  sort: string
): Prisma.VideoOrderByWithRelationInput[] {
  switch (sort) {
    case "popular":
      return [{ viewCount: "desc" }, { publishedAt: "desc" }];
    case "quality":
      return [{ qualityScore: "desc" }, { publishedAt: "desc" }];
    case "newest":
    default:
      return [{ publishedAt: "desc" }];
  }
}

// チャンネル動画用の select（ホーム画面 videoCardSelect の拡張）
const channelVideoCardSelect = {
  id: true,
  title: true,
  muxPlaybackId: true,
  duration: true,
  viewCount: true,
  likeCount: true,
  dislikeCount: true,
  qualityScore: true,
  moods: true,
  publishedAt: true,
  aiModel: true,
  generationTimeSec: true,     // チャンネルページでは生成時間も表示
  // チャンネル情報は不要（チャンネルページ内なので自明）
  category: {
    select: { name: true, slug: true },
  },
} satisfies Prisma.VideoSelect;
```

### 4.3 AI生成統計クエリ

```typescript
// lib/queries/channel-stats.ts

export async function getChannelStats(slug: string) {
  const channel = await prisma.aIChannel.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!channel) return null;

  const channelId = channel.id;

  // 3つの集計クエリを並列実行
  const [qualityDist, moodStats, modelStats, monthlyVideos] =
    await Promise.all([
      // 1. 品質スコア分布
      getQualityDistribution(channelId),
      // 2. ムード別統計
      getMoodStats(channelId),
      // 3. AIモデル別統計
      getModelStats(channelId),
      // 4. 月別動画数（直近12ヶ月）
      getMonthlyVideoCount(channelId),
    ]);

  return {
    channelId,
    qualityDistribution: qualityDist,
    moodStats,
    modelStats,
    monthlyVideoCount: monthlyVideos,
  };
}

async function getQualityDistribution(channelId: string) {
  const stats = await prisma.video.aggregate({
    where: {
      channelId,
      status: "PUBLISHED",
      qualityScore: { not: null },
    },
    _min: { qualityScore: true },
    _max: { qualityScore: true },
    _avg: { qualityScore: true },
  });

  // 中央値は raw SQL で取得
  const median = await prisma.$queryRaw<[{ median: number }]>`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY quality_score) as median
    FROM videos
    WHERE channel_id = ${channelId}
      AND status = 'PUBLISHED'
      AND quality_score IS NOT NULL
  `;

  return {
    min: stats._min.qualityScore ?? 0,
    max: stats._max.qualityScore ?? 0,
    average: Math.round((stats._avg.qualityScore ?? 0) * 10) / 10,
    median: Math.round((median[0]?.median ?? 0) * 10) / 10,
  };
}

async function getMoodStats(channelId: string): Promise<MoodStat[]> {
  // moods は String[] なので、PostgreSQL の unnest で展開して集計
  return prisma.$queryRaw<MoodStat[]>`
    SELECT
      mood,
      COUNT(*)::int as "videoCount",
      ROUND(AVG(quality_score)::numeric, 1)::float as "avgQualityScore"
    FROM videos, unnest(moods) as mood
    WHERE channel_id = ${channelId}
      AND status = 'PUBLISHED'
      AND quality_score IS NOT NULL
    GROUP BY mood
    ORDER BY "videoCount" DESC
  `;
}

async function getModelStats(channelId: string): Promise<ModelStat[]> {
  return prisma.$queryRaw<ModelStat[]>`
    SELECT
      ai_model as "aiModel",
      COUNT(*)::int as "videoCount",
      ROUND(AVG(generation_time_sec)::numeric, 1)::float as "avgGenerationTimeSec",
      ROUND(AVG(quality_score)::numeric, 1)::float as "avgQualityScore"
    FROM videos
    WHERE channel_id = ${channelId}
      AND status = 'PUBLISHED'
    GROUP BY ai_model
    ORDER BY "videoCount" DESC
  `;
}

async function getMonthlyVideoCount(
  channelId: string
): Promise<MonthlyCount[]> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  return prisma.$queryRaw<MonthlyCount[]>`
    SELECT
      TO_CHAR(published_at, 'YYYY-MM') as month,
      COUNT(*)::int as count
    FROM videos
    WHERE channel_id = ${channelId}
      AND status = 'PUBLISHED'
      AND published_at >= ${twelveMonthsAgo}
    GROUP BY TO_CHAR(published_at, 'YYYY-MM')
    ORDER BY month ASC
  `;
}
```

### 4.4 N+1 回避ポイント

| パターン | 問題 | 解決策 |
|---------|------|--------|
| チャンネル + 動画一覧 | N+1 | チャンネル取得と動画一覧は別クエリ（不要な JOIN を回避） |
| 動画一覧 + カテゴリ | N+1 | `select` で `category` をネスト（Prisma JOIN） |
| 統計集計（ムード/モデル別） | 複数クエリ | `Promise.all` で並列実行 |
| ユーザー登録状態 | 追加クエリ | チャンネル取得と `Promise.all` で並列実行 |

### 4.5 クエリパフォーマンス見積もり

| クエリ | 推定レイテンシ | 取得方法 | 備考 |
|--------|:----------:|:-------:|------|
| `getChannelBySlug` | ~5ms | SSR (ISR) | slug インデックス、1行取得 |
| `getUserChannelState` | ~5ms | Client fetch (no-store) | channelId → Subscription 検索 |
| `getChannelVideos` (20件) | ~15ms | SSR (ISR) | 複合インデックス利用 |
| `getChannelStats` | ~40ms | Client fetch | 4集計クエリ並列（各10-15ms） |
| **SSR 初期ロード合計** | **~5ms** | ISR | channel のみ（userState は client-side） |
| **完全表示（Hydration後）** | **+~5ms** | Client | userState 取得で登録ボタン状態確定 |

---

