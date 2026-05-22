# ホーム画面: キャッシュ・インフラ設計

> 元ファイル: [home-data-design.md](home-data-design.md) から分割（§4-8）

---

## 4. キャッシュ戦略

### 4.1 レイヤー別キャッシュ構成

```
[ブラウザ] TanStack Query (メモリキャッシュ)
    ↓ staleTime経過後
[Vercel Edge] ISR / Data Cache
    ↓ revalidate経過後
[サーバー] Prisma → Supabase PostgreSQL
```

### 4.2 Server Component でのデータフェッチ（並列クエリ設計）

ホーム画面は複数のセクション（ヒーロー、トレンド、高品質、新着）で構成される。
**`Promise.all` で並列クエリを実行し、ウォーターフォールを回避:**

```typescript
// lib/queries/home.ts

/** ヒーロー動画: 品質スコア最高 + 直近7日以内の動画 */
export async function getHeroVideo() {
  return prisma.video.findFirst({
    where: {
      status: "PUBLISHED",
      publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      qualityScore: { not: null },
    },
    orderBy: { qualityScore: "desc" },
    select: heroVideoSelect,
  });
}

/** トレンド動画: 再生数降順 */
export async function getTrendingVideos(limit: number) {
  return prisma.video.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ viewCount: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: videoCardSelect,
  });
}

/** 高品質動画: 品質スコア降順 */
export async function getTopQualityVideos(limit: number) {
  return prisma.video.findMany({
    where: { status: "PUBLISHED", qualityScore: { not: null } },
    orderBy: [{ qualityScore: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: videoCardSelect,
  });
}

/** 新着動画: 公開日降順（無限スクロールの初期データ） */
export async function getLatestVideos(limit: number) {
  return getVideosForHome({ tab: "new", limit });
}

// 共通の select 定義（DRY原則）
const videoCardSelect = {
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
  channel: {
    select: { id: true, name: true, slug: true, avatarUrl: true },
  },
  category: {
    select: { name: true, slug: true },
  },
} satisfies Prisma.VideoSelect;

const heroVideoSelect = {
  ...videoCardSelect,
  description: true,   // ヒーローセクションでは説明文も表示
} satisfies Prisma.VideoSelect;
```

```typescript
// app/page.tsx (ホーム画面 Server Component)

import {
  getHeroVideo,
  getTrendingVideos,
  getTopQualityVideos,
  getLatestVideos,
} from "@/lib/queries/home";

// ページレベルの revalidate 設定
export const revalidate = 60; // 60秒ごとに再生成

export default async function HomePage() {
  // 4つのクエリを並列実行（ウォーターフォール回避）
  const [hero, trending, topQuality, latest] = await Promise.all([
    getHeroVideo(),
    getTrendingVideos(10),
    getTopQualityVideos(10),
    getLatestVideos(20),
  ]);

  // MVP Phase 1: セクションベース固定推薦理由を付与（home-recommendation-source.md §3.1 準拠）
  // ユーザーデータ不要。追加クエリ 0件。
  const { getStaticRecommendationReason } = await import("@/lib/recommendation-reason");

  return (
    <main>
      <HomeTabs />
      {hero && <HeroSection video={hero} reason={getStaticRecommendationReason("hero")} />}
      <TrendingSection videos={trending} reason={getStaticRecommendationReason("trending")} />
      <TopQualitySection videos={topQuality} reason={getStaticRecommendationReason("top-quality")} />
      <LatestVideoGrid initialData={latest} reason={getStaticRecommendationReason("new")} />
      {/* LatestVideoGrid は Client Component で無限スクロールを担当 */}
    </main>
  );
}

// ---
// MVP Phase 2（将来追加予定 — Clerk認証後に有効化）:
//   resolveRecommendationReasons(userId, videos, sectionDefault)
//   → 購読チャンネル新着・AIモデル嗜好の個別推薦理由をビデオ単位で付与
//   → 詳細: home-recommendation-source.md §3.2
// ---
```

**並列クエリのパフォーマンス効果:**

```
❌ 逐次実行（ウォーターフォール）:
  getHeroVideo()      → 50ms
  getTrendingVideos() → 40ms
  getTopQualityVideos() → 40ms
  getLatestVideos()   → 50ms
  合計: 180ms

✅ Promise.all 並列実行:
  すべて同時開始 → 最も遅いクエリの完了を待つ
  合計: ~50ms（約3.6倍高速化）
```

### 4.3 TanStack Query（クライアント側キャッシュ）

```typescript
// hooks/useVideos.ts

import { useInfiniteQuery } from "@tanstack/react-query";

export function useVideos(tab: string, categorySlug?: string) {
  return useInfiniteQuery({
    queryKey: ["videos", tab, categorySlug],
    queryFn: ({ pageParam }) =>
      fetch(
        `/api/videos?tab=${tab}&cursor=${pageParam ?? ""}&limit=20` +
        (categorySlug ? `&categorySlug=${categorySlug}` : "")
      ).then((res) => res.json()),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,

    // キャッシュ設定
    staleTime: 60 * 1000,        // 1分間はキャッシュをfreshとみなす
    gcTime: 5 * 60 * 1000,       // 5分間キャッシュ保持
    refetchOnWindowFocus: false,  // タブ切替時の自動再取得を無効化
  });
}
```

### 4.4 タブ別キャッシュ戦略

| タブ | レンダリング | revalidate | staleTime | 理由 |
|------|------------|------------|-----------|------|
| おすすめ | SSR + ISR | 60秒 | 1分 | 適度な鮮度が必要 |
| トレンド | SSR + ISR | 300秒 | 5分 | 頻繁な更新は不要 |
| 新着 | SSR + ISR | 30秒 | 30秒 | 新しい動画をすぐ表示 |
| カテゴリ別 | SSR + ISR | 60秒 | 1分 | おすすめと同等 |

### 4.5 Streaming SSR（React Suspense）

各セクションを個別の `<Suspense>` 境界で囲み、段階的にストリーミング表示:

```typescript
// app/page.tsx - Suspense を使った段階的表示
import { Suspense } from "react";

export default function HomePage() {
  return (
    <main>
      {/* タブバーは即座に表示（静的） */}
      <HomeTabs />

      {/* 各セクションを独立した Suspense でストリーミング */}
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />
      </Suspense>

      <Suspense fallback={<VideoRowSkeleton title="トレンド" count={5} />}>
        <TrendingSection />
      </Suspense>

      <Suspense fallback={<VideoRowSkeleton title="高品質" count={5} />}>
        <TopQualitySection />
      </Suspense>

      <Suspense fallback={<VideoGridSkeleton count={12} />}>
        <LatestVideoGrid />
      </Suspense>
    </main>
  );
}

// 各セクションが独立して非同期データフェッチ → 完了したセクションから順に表示
// Skeleton は shadcn/ui の Skeleton コンポーネントで構成
```

**注:** セクション4.2 の `Promise.all` パターンとの使い分け:
- **`Promise.all` パターン**: すべてのデータが揃ってから一括表示。シンプルでデータ間の整合性が保証される。**推奨（MVP）**
- **個別 `Suspense` パターン**: セクションごとに段階的に表示。体感速度は速いが実装が複雑。将来の最適化オプション

---

## 5. インデックス設計

### 5.1 ホーム画面に必要なインデックス

既にスキーマ定義に `@@index` で記述済み。以下に整理:

| テーブル | インデックス | 用途 | クエリパターン |
|---------|------------|------|-------------|
| `videos` | `(status, publishedAt)` | 公開動画の新着順一覧 | `WHERE status='PUBLISHED' ORDER BY publishedAt DESC` |
| `videos` | `(status, viewCount)` | 公開動画の人気順一覧 | `WHERE status='PUBLISHED' ORDER BY viewCount DESC` |
| `videos` | `(status, publishedAt, viewCount)` | トレンド計算 | トレンドスコア算出クエリ |
| `videos` | `(channelId)` | チャンネル別動画一覧 | `WHERE channelId = ?` |
| `videos` | `(categoryId)` | カテゴリ別動画一覧 | `WHERE categoryId = ?` |
| `videos` | `(status, qualityScore)` | 品質スコア順取得 | `WHERE status='PUBLISHED' ORDER BY qualityScore DESC` |
| `videos` | `(moods)` GIN | ムード検索 | `WHERE moods @> ARRAY['calm']` |
| `videos` | `(muxPlaybackId)` | Mux Webhook処理 | `WHERE muxPlaybackId = ?` |
| `views` | `(videoId, createdAt)` | 期間別再生数集計 | トレンド計算用 |
| `views` | `(userId, createdAt)` | 視聴履歴表示 | `WHERE userId = ? ORDER BY createdAt DESC` |
| `comments` | `(videoId, createdAt)` | 動画コメント新着順 | `WHERE videoId = ? ORDER BY createdAt DESC` |
| `likes` | `(userId, videoId)` UNIQUE | いいね重複防止+状態確認 | `WHERE userId = ? AND videoId = ?` |

### 5.2 moods GIN インデックス（カスタムマイグレーション）

Prisma の `@@index` では PostgreSQL の GIN インデックスを直接指定できないため、カスタムマイグレーションで追加:

```sql
-- prisma/migrations/xxx_add_moods_gin_index/migration.sql
CREATE INDEX idx_videos_moods_gin ON videos USING gin (moods);
```

このインデックスにより `WHERE moods @> ARRAY['calm']` のようなムード検索が高速化される。

Prisma での利用:
```typescript
// ムードでフィルタリング
const calmVideos = await prisma.video.findMany({
  where: {
    status: "PUBLISHED",
    moods: { has: "calm" },  // Prisma が @> 演算子に変換
  },
});
```

### 5.3 全文検索インデックス（将来）

MVP段階では Prisma の `contains` (ILIKE) で対応。スケール時に PostgreSQL の全文検索インデックスを追加:

```sql
-- 将来追加: 日本語全文検索用
-- pg_bigm 拡張 or pg_trgm 拡張
CREATE INDEX idx_videos_title_gin ON videos USING gin (title gin_trgm_ops);
CREATE INDEX idx_videos_description_gin ON videos USING gin (description gin_trgm_ops);
```

MVP段階のシンプルな検索:

```typescript
// MVP: ILIKE による部分一致検索
const results = await prisma.video.findMany({
  where: {
    status: "PUBLISHED",
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ],
  },
});
```

### 5.4 インデックスサイズの見積もり

MVP想定データ量（最初の6ヶ月）:
- 動画: 約1,000〜5,000本
- ユーザー: 約100〜1,000人
- コメント: 約5,000〜20,000件
- 視聴記録: 約50,000〜200,000件

この規模ではすべてのインデックスが PostgreSQL のメモリに収まるため、パフォーマンス問題は発生しない。Supabase 無料枠（500MB）で十分対応可能。

---

## 6. Server Component データフロー（ホーム画面）

### 6.1 全体フロー

```
ユーザーが / にアクセス
    ↓
[Vercel Edge] ISR キャッシュヒット → 即座にHTML返却 (キャッシュあり)
    ↓ (キャッシュなし or revalidate)
[Server Component] HomePage
    ├── HomeTabs (静的レンダリング、即座に表示)
    └── <Suspense> HomeVideoGrid
         ├── getVideosForHome() → Prisma → Supabase PG
         └── 結果をストリーミング送信
    ↓
[ブラウザ]
    ├── 初期HTML表示（Skeleton → 動画グリッド）
    └── Hydration → TanStack Query にシード
    ↓
[スクロール] IntersectionObserver 発火
    ↓
[Client] useVideos().fetchNextPage()
    → GET /api/videos?cursor=xxx
    → Prisma → JSON レスポンス
    → TanStack Query キャッシュに追加
    → 動画カード追加表示
```

### 6.2 Clerk 連携（User 同期フロー）

```
[Clerk] ユーザー作成/更新イベント
    ↓ Webhook
[POST /api/webhooks/clerk]
    ↓
Prisma: users テーブルに upsert
    {
      clerkId: event.data.id,
      name: event.data.first_name + " " + event.data.last_name,
      imageUrl: event.data.image_url,
    }
```

```typescript
// app/api/webhooks/clerk/route.ts
import { Webhook } from "svix";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  const body = await req.text();
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  const event = wh.verify(body, {
    "svix-id": svixId!,
    "svix-timestamp": svixTimestamp!,
    "svix-signature": svixSignature!,
  });

  if (event.type === "user.created" || event.type === "user.updated") {
    await prisma.user.upsert({
      where: { clerkId: event.data.id },
      update: {
        name: `${event.data.first_name ?? ""} ${event.data.last_name ?? ""}`.trim(),
        imageUrl: event.data.image_url,
      },
      create: {
        clerkId: event.data.id,
        name: `${event.data.first_name ?? ""} ${event.data.last_name ?? ""}`.trim(),
        imageUrl: event.data.image_url,
      },
    });
  }

  return new Response("OK", { status: 200 });
}
```

---

## 7. Mux 連携データフロー

### 7.1 動画アップロード → 公開フロー

```
[Railway Worker] AI動画生成完了
    ↓
Mux Upload API: POST /video/v1/uploads
    → Direct Upload URL 取得
    ↓
MP4ファイルをMuxにアップロード
    ↓
[Mux] トランスコード開始（自動）
    ↓
[Mux Webhook] video.asset.ready
    ↓
[POST /api/webhooks/mux]
    ↓
Prisma: Video レコード更新
    {
      muxStatus: "READY",
      muxPlaybackId: asset.playback_ids[0].id,
      duration: asset.duration,
      status: "PUBLISHED",
      publishedAt: new Date(),
    }
    ↓
ホーム画面の次回リクエストで新動画が表示
```

### 7.2 Mux Webhook ハンドラ

```typescript
// app/api/webhooks/mux/route.ts

export async function POST(req: Request) {
  const body = await req.json();

  // Mux Webhook署名検証（省略）

  switch (body.type) {
    case "video.asset.ready": {
      const asset = body.data;
      await prisma.video.update({
        where: { muxAssetId: asset.id },
        data: {
          muxStatus: "READY",
          muxPlaybackId: asset.playback_ids?.[0]?.id,
          duration: Math.round(asset.duration ?? 0),
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });
      // チャンネルの動画数キャッシュを更新
      await prisma.aIChannel.update({
        where: { id: video.channelId },
        data: { videoCount: { increment: 1 } },
      });
      break;
    }
    case "video.asset.errored": {
      const asset = body.data;
      await prisma.video.update({
        where: { muxAssetId: asset.id },
        data: { muxStatus: "ERRORED", status: "FAILED" },
      });
      break;
    }
  }

  return new Response("OK", { status: 200 });
}
```

---

## 8. 初期シードデータ

### 8.1 カテゴリマスタ

```typescript
// prisma/seed.ts

const categories = [
  { name: "音楽", slug: "music", icon: "Music" },
  { name: "ゲーム", slug: "gaming", icon: "Gamepad2" },
  { name: "ニュース", slug: "news", icon: "Newspaper" },
  { name: "教育", slug: "education", icon: "GraduationCap" },
  { name: "アート", slug: "art", icon: "Palette" },
  { name: "科学", slug: "science", icon: "FlaskConical" },
  { name: "自然", slug: "nature", icon: "Trees" },
  { name: "テクノロジー", slug: "technology", icon: "Cpu" },
  { name: "エンタメ", slug: "entertainment", icon: "Clapperboard" },
  { name: "スポーツ", slug: "sports", icon: "Trophy" },
];
```

### 8.2 AIチャンネルマスタ

```typescript
const aiChannels = [
  {
    name: "Aurora",
    slug: "aurora",
    description: "自然・風景のフォトリアル映像を生成するAIクリエイター",
    aiModel: "runway-gen4-turbo",
    themes: ["自然", "風景", "タイムラプス"],
    accentColor: "#00D2D3",
  },
  {
    name: "Nexus",
    slug: "nexus",
    description: "サイバーパンク・SF映像を得意とするAIクリエイター",
    aiModel: "veo-3.1-fast",
    themes: ["SF", "テクノロジー", "サイバーパンク"],
    accentColor: "#6C5CE7",
  },
  {
    name: "Prism",
    slug: "prism",
    description: "抽象アート・ジェネラティブアート映像のAIクリエイター",
    aiModel: "kling-ai",
    themes: ["アート", "抽象", "ジェネラティブ"],
    accentColor: "#FD79A8",
  },
];
```

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-22 | 1.0 | 初版作成 | tech-lead |
| 2026-02-22 | 1.1 | qualityScore/moods フィールド追加、APIレスポンスに dislikeCount 追加、並列データフェッチ設計追記、moods GIN インデックス追加 | tech-lead |
| 2026-02-23 | 1.2 | [DB-H-1] VideosResponse に sectionReason フィールド追加（home-recommendation-source.md §3.1 との整合） | tech-leader |
| 2026-03-07 | 1.3 | [必須修正] HomePage Server Component に推薦理由データフロー統合（Phase 1 固定理由 + Phase 2 コメント追加） | tech-leader |
