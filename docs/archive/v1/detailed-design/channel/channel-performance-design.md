# AIチャンネルページ パフォーマンス設計書

## プロジェクト: AI Theater
作成日: 2026-02-26
担当: analyzer
Task: #4

**前提: 個人開発レベルの予算制約（月額$50以下目標）**

---

## 1. レンダリング戦略

### 1.1 チャンネルページの方式

**SSR + ISR（チャンネルメタデータ） + CSR（動画リスト）のハイブリッド構成**

チャンネルヒーローセクション（バナー・アバター・統計・AI仕様）は ISR で高速配信し、
動画グリッドは CSR + TanStack Query useInfiniteQuery で無限スクロールを実現する。

```
リクエスト: /channel/[slug]
  ↓
[Vercel Edge] ISR キャッシュあり → 即座にHTML返却（TTFB < 100ms）
  ↓ キャッシュなし or revalidate
[Server] Streaming SSR
  ├── シェル（Header + ChannelHeroSkeleton）→ 即座にストリーム送信
  ├── Tier 1: <Suspense> チャンネルヘッダー（banner + avatar + name + followBtn）
  │         → DB取得完了後にストリーム送信（ISR revalidate=300秒）
  ├── Tier 2: <Suspense> 統計ダッシュボード + AIエージェント仕様セクション
  │         → 並列DB取得後にストリーム送信（Tier 1と並列実行）
  └── Tier 3: タブUI（Client Component）+ 初期動画グリッド（SSRシード）
  ↓
[ブラウザ] 段階的にレンダリング
  ↓
[Client] TanStack Query useInfiniteQuery → 動画グリッドの無限スクロール
```

### 1.2 ページ別レンダリング設定

| セクション | 方式 | revalidate | 理由 |
|-----------|------|------------|------|
| チャンネルヒーロー（バナー・アバター・名前） | **ISR** | 300秒 | チャンネル情報は低頻度更新（公開データのみ） |
| 統計ダッシュボード（動画数・再生数・フォロワー数） | **ISR** | 300秒 | 5分更新で十分（リアルタイム不要） |
| AIエージェント仕様（使用モデル・ムード・品質分布） | **ISR** | 300秒 | ほぼ変更なし |
| 動画グリッド | **CSR（TanStack Query）** | staleTime=60秒 | 動的フィルタリング・無限スクロール対応 |
| **ユーザー固有状態**（購読状態・いいね状態等） | **CSR（Client Component）** | なし | ISR キャッシュに含めてはならない（SEC-ISSUE-2） |

> **⚠️ ISR キャッシュ境界の重要原則（SEC-ISSUE-2）**
> ISR（revalidate=300）は**公開データのみ**（チャンネル情報・動画リスト・統計）に適用する。
> `userState`（購読状態・いいね状態など、ユーザー固有のデータ）は ISR キャッシュに含めてはならない。
> ユーザー固有状態は Client Component 内で `fetch(url, { cache: "no-store" })` を使用して取得する。
> Server Component に認証ユーザー固有のデータを混在させると、ISR キャッシュが他ユーザーに漏洩するリスクがある。

### 1.3 Suspense 境界の設計

```typescript
// app/channel/[slug]/page.tsx

import { Suspense } from "react";
import { ChannelHero } from "@/components/channel/ChannelHero";
import { ChannelStats } from "@/components/channel/ChannelStats";
import { ChannelVideoGrid } from "@/components/channel/ChannelVideoGrid";
import { ChannelHeroSkeleton } from "@/components/channel/ChannelHeroSkeleton";
import { ChannelStatsSkeleton } from "@/components/channel/ChannelStatsSkeleton";
import { VideoGridSkeleton } from "@/components/video/VideoGridSkeleton";

// ISR: 5分ごとに再生成（チャンネル情報の更新頻度に合わせる）
// ⚠️ 公開データのみ（SEC-ISSUE-2）: userState は含めない
export const revalidate = 300;

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="min-h-screen">
      {/* ──── Tier 1: チャンネルヒーロー（LCP要素: バナー画像） ──── */}
      <Suspense fallback={<ChannelHeroSkeleton />}>
        <ChannelHero slug={slug} />
      </Suspense>

      <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">
        {/* ──── Tier 2: 統計 + AI仕様（Tier 1と並列取得） ──── */}
        <Suspense fallback={<ChannelStatsSkeleton />}>
          <ChannelStats slug={slug} />
        </Suspense>

        {/* ──── Tier 3: タブUI + 動画グリッド（Client Component） ──── */}
        <div className="mt-8">
          <Suspense fallback={<VideoGridSkeleton count={12} />}>
            <ChannelVideoGrid slug={slug} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
```

### 1.4 並列データフェッチ

```typescript
// components/channel/ChannelStats.tsx (Server Component)
// Tier 1（ChannelHero）と独立した Suspense 境界 → 並列実行

import { getChannelStats, getChannelAgentSpecs } from "@/lib/queries/channels";

export async function ChannelStats({ slug }: { slug: string }) {
  // 統計情報とAI仕様を並列取得（逐次 ~120ms → 並列 ~60ms）
  const [stats, agentSpecs] = await Promise.all([
    getChannelStats(slug),
    getChannelAgentSpecs(slug),
  ]);

  return (
    <>
      <ChannelStatsDisplay stats={stats} />
      <AIAgentSpecsPanel specs={agentSpecs} />
    </>
  );
}
```

---

## 2. Core Web Vitals 目標値

### 2.1 目標値サマリー

| 指標 | 目標値 | Google基準 | チャンネルページのLCP要素 | ホーム画面との差分 |
|------|--------|-----------|----------------------|----------------|
| **LCP** | **≤ 2.5秒** | ≤ 2.5秒 (Good) | チャンネルバナー画像（横幅全面） | LCP要素が大型バナー画像に変化 |
| **INP** | **≤ 200ms** | ≤ 200ms (Good) | タブ切替 / フォローボタン / フィルタ選択 | 同等 |
| **CLS** | **≤ 0.1** | ≤ 0.1 (Good) | バナー・アバター・統計カード | バナー固定高さによる防止が重要 |
| **TTFB** | **≤ 200ms** | ≤ 800ms (Good) | ISR Edge キャッシュヒット時 | 同等（ISR revalidate=300s） |

### 2.2 LCP ボトルネック分析（目標 ≤ 2.5秒）

**LCP要素**: チャンネルバナー画像（ページ最上部、横幅全面）

```
フェーズ                                         時間見積もり
─────────────────────────────────────────────────────────
TTFB (ISR Edge キャッシュヒット)               :  50 〜 200ms
HTML Parse → <link rel="preload"> 検出         :  30 〜  50ms
バナー画像ダウンロード
  (Supabase Storage → Vercel Image Opt → CDN)  : 150 〜 600ms
  (WebP 1200px: 推定 60〜180KB)
画像デコード + 描画                            :  30 〜  80ms
─────────────────────────────────────────────────────────
合計                                           : 260ms 〜 930ms
                                               → LCP ≤ 2.5秒 達成可能
```

**バナー画像が LCP の主な変数:**
- Supabase Storage からの配信遅延（Vercel Image Optimization 経由）
- `priority={true}` + React 19 `preload()` API での先読みが必須

### 2.3 INP ボトルネック分析（目標 ≤ 200ms）

チャンネルページの主要インタラクション:

| インタラクション | 処理内容 | 見積もり | 目標達成見込み |
|----------------|---------|---------|-------------|
| フォローボタン | 楽観的 UI 更新 + API | ~30ms (UI反映) | ✅ |
| タブ切替（Videos/About/AI Specs） | URL params 更新 + re-render | ~80ms | ✅ |
| ムードフィルタ選択 | TanStack Query キー変更 + 再フェッチ | ~60ms (Skeleton表示) | ✅ |
| 動画カードホバー | `router.prefetch()` 実行 | ~20ms | ✅ |
| 無限スクロール発火 | TanStack Query fetchNextPage | ~50ms (Skeleton表示) | ✅ |

### 2.4 CLS ボトルネック分析（目標 ≤ 0.1）

**CLS実装目標: ≤ 0.05**（目標の半分以下）

| シフト発生箇所 | シフト量（未対策） | 対策 | 対策後 |
|-------------|--------------|------|-------|
| バナー画像高さ未確定 | 高 | `h-[200px]` または `aspect-[4/1]` で固定 | ≈ 0 |
| アバター画像サイズ未確定 | 中 | `w-[96px] h-[96px]` + `rounded-full` で固定コンテナ | ≈ 0 |
| 統計カード数字読み込み | 低 | `tabular-nums` + Skeleton | ≈ 0 |
| 動画グリッドの初期表示 | 中 | `VideoGridSkeleton` で列・行高さ確保 | ≈ 0 |
| タブ切替時のコンテンツ高さ変化 | 低〜中 | `min-h-[400px]` でタブパネルに最小高さを設定 | ≈ 0 |

---

## 3. バナー・アバター画像最適化

### 3.1 チャンネルバナー画像

バナーはチャンネルページの LCP 要素。React 19 `preload()` API と `priority` prop で先読みする。

```typescript
// components/channel/ChannelHero.tsx (Server Component)

import { preload } from "react-dom";
import Image from "next/image";
import { getChannelById } from "@/lib/queries/channels";
import { notFound } from "next/navigation";

export async function ChannelHero({ slug }: { slug: string }) {
  const channel = await getChannelBySlug(slug);  // slug で検索
  if (!channel) notFound();

  // バナー画像を <head> に preload 宣言（LCP最適化）
  if (channel.bannerImage) {
    preload(channel.bannerImage, { as: "image", fetchPriority: "high" });
  }

  return (
    <div className="relative">
      {/* バナー: 固定高さで CLS 防止 */}
      <div className="relative h-[200px] w-full overflow-hidden bg-surface">
        {channel.bannerImage ? (
          <Image
            src={channel.bannerImage}
            alt={`${channel.name} banner`}
            fill
            sizes="100vw"
            className="object-cover"
            priority  // LCP要素のため優先読み込み
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-primary/20 to-primary/5" />
        )}
      </div>

      {/* アバター + チャンネル情報 */}
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="flex items-end gap-4 -mt-12 pb-4">
          {/* アバター: 固定サイズで CLS 防止 */}
          <div className="relative w-[96px] h-[96px] shrink-0 rounded-full overflow-hidden
                          bg-surface border-4 border-background">
            {channel.profileImage ? (
              <Image
                src={channel.profileImage}
                alt={channel.name}
                fill
                sizes="96px"
                className="object-cover"
                priority  // アバターは above the fold
              />
            ) : (
              <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary">
                  {channel.name[0]}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pt-12">
            <h1 className="text-2xl font-bold truncate">{channel.name}</h1>
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">
              {channel.description}
            </p>
            {/* AIモデルバッジ */}
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full
                            bg-primary/10 text-primary text-xs font-medium">
              {channel.aiModel}
            </span>
          </div>

          {/*
            SEC-ISSUE-2: FollowButton は Client Component。
            購読状態（isFollowing）は ISR キャッシュに含めず、
            FollowButton 内部で fetch(url, { cache: "no-store" }) により取得する。
          */}
          <FollowButton channelId={channel.id} />
        </div>
      </div>
    </div>
  );
}
```

### 3.2 バナー・アバター画像の最適化詳細

| 最適化手法 | 実装 | 効果 |
|-----------|------|------|
| **バナー priority={true}** | `next/image` の `priority` prop | LCP改善（ブラウザが優先ダウンロード） |
| **preload() API** | React 19 の `preload()` Server Component内で呼び出し | `<link rel="preload">` を `<head>` に挿入 |
| **バナー fixed height** | `h-[200px]` で高さ固定 | CLS防止（画像読み込み前からスペース確保） |
| **アバター fixed size** | `w-[96px] h-[96px]` | CLS防止 |
| **WebP/AVIF 自動変換** | Vercel Image Optimization（`next/image`経由） | JPEG比 25-35% ファイルサイズ削減 |
| **sizes prop 指定** | バナー: `100vw`、アバター: `96px` | デバイス幅に応じた最適サイズ配信 |
| **フォールバック** | バナー/アバターなし時の CSS グラデーション | 画像未設定でも CLS なし |

### 3.3 `next.config.ts` の画像ドメイン設定

```typescript
// next.config.ts - Supabase Storage ドメインの追加（既存設定に追記）

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.mux.com",       // Mux サムネイル（既存）
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",        // Clerk アバター（既存）
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",        // Supabase Storage（チャンネル画像）
      },
    ],
  },
};
```

---

## 4. 動画グリッド 無限スクロール設計

### 4.1 CSR ページネーション方針

動画グリッドは **Client-side + TanStack Query useInfiniteQuery** を採用。
チャンネルフィルタ（ムード・AIモデル）が動的に変わるため、CSR が適切。
SSR で初期データをシードすることで、初回表示を高速化する。

```
[Server] ChannelVideoGrid: 初期20件を SSR で取得してシード
  ↓
[Client] useInfiniteQuery にシードデータを渡す（initialData）
  ↓
IntersectionObserver: スクロール400px手前でfetchNextPage
  ↓
API: /api/channels/[slug]/videos?cursor=...&limit=20&mood=...
```

### 4.2 実装

```typescript
// components/channel/ChannelVideoGridClient.tsx

"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { VideoCard } from "@/components/video/VideoCard";
import { VideoCardSkeleton } from "@/components/video/VideoCardSkeleton";
import type { VideosResponse } from "@/lib/types";

interface ChannelVideoGridClientProps {
  slug: string;
  initialData: VideosResponse;
}

export function ChannelVideoGridClient({
  slug,
  initialData,
}: ChannelVideoGridClientProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  // URL パラメータでフィルタ管理（nuqs）
  const [mood] = useQueryState("mood");
  const [sort] = useQueryState("sort", { defaultValue: "newest" });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["channel-videos", slug, mood, sort],
      queryFn: async ({ pageParam }): Promise<VideosResponse> => {
        const params = new URLSearchParams({ limit: "20", sort });
        if (pageParam) params.set("cursor", pageParam);
        if (mood) params.set("mood", mood);
        const res = await fetch(
          `/api/channels/${slug}/videos?${params}`
        );
        return res.json();
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: undefined as string | undefined,
      // フィルタなしの場合のみ SSR 初期データをシード
      initialData: !mood
        ? { pages: [initialData], pageParams: [undefined] }
        : undefined,
      staleTime: 60 * 1000,          // 60秒キャッシュ
      refetchOnWindowFocus: false,
    });

  // IntersectionObserver で自動ロード（400px 手前）
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allVideos = data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <>
      {/* ムード・ソートフィルタバー */}
      <ChannelFilterBar slug={slug} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
        {allVideos.map((video, index) => (
          <VideoCard
            key={video.id}
            video={video}
            variant="grid"
            priority={index < 4}  // 最初の4枚のサムネイルを優先読み込み
          />
        ))}
        {isFetchingNextPage &&
          Array.from({ length: 4 }).map((_, i) => (
            <VideoCardSkeleton key={`skeleton-${i}`} />
          ))}
      </div>

      {/* IntersectionObserver ターゲット */}
      <div ref={loadMoreRef} className="h-1" />

      {!hasNextPage && allVideos.length > 0 && (
        <p className="text-center text-text-secondary py-8">
          すべての動画を表示しました
        </p>
      )}
      {allVideos.length === 0 && !isFetchingNextPage && (
        <p className="text-center text-text-secondary py-8">
          動画がありません
        </p>
      )}
    </>
  );
}
```

### 4.3 カーソルベースページネーション（API）

```typescript
// app/api/channels/[slug]/videos/route.ts

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const mood = searchParams.get("mood");
  const sort = searchParams.get("sort") ?? "newest";

  const videos = await prisma.video.findMany({
    where: {
      channel: { slug },        // slug でチャンネルを絞り込み
      status: "PUBLISHED",      // Prisma Enum 大文字統一（CONS-ISSUE-4）
      ...(mood ? { moods: { has: mood } } : {}),
    },
    orderBy: sort === "popular"
      ? { viewCount: "desc" }
      : { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      title: true,
      muxPlaybackId: true,
      viewCount: true,
      duration: true,
      qualityScore: true,
      aiModel: true,
      createdAt: true,
      channel: { select: { id: true, name: true, slug: true } },
    },
  });

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, -1) : videos;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return Response.json({ videos: items, nextCursor });
}
```

### 4.4 無限スクロール パフォーマンス考慮

| 項目 | 対策 |
|------|------|
| 先読み距離 | `rootMargin: "400px"` でスクロール到達前にプリフェッチ |
| 1回の取得数 | 20件（4列 × 5行分）。多すぎるとレンダリング負荷、少なすぎると頻繁なリクエスト |
| フィルタ変更時 | queryKey にフィルタ値を含めることで適切なキャッシュ分離 |
| DOM量制限 | 仮想化は MVP では不要。200件以上になった段階で検討 |
| ローディングUI | Skeleton 4件表示（shadcn/ui Skeleton） |

---

## 5. Mux サムネイル最適化（動画グリッド）

### 5.1 チャンネルページのサムネイル設定

チャンネルページの動画グリッドのサムネイルは、ホーム画面と同一の Mux Thumbnail API を使用。

| ブレークポイント | グリッド列数 | サムネイル幅 | Mux URL width |
|----------------|------------|------------|---------------|
| Mobile (< 640px) | 1列 | ~600px | 640 |
| Tablet (640-1024px) | 2列 | ~300px | 480 |
| Desktop (1024-1440px) | 3列 | ~350px | 480 |
| Wide (> 1440px) | 4列 | ~300px | 480 |

```typescript
// components/video/VideoThumbnail.tsx（既存コンポーネント、変更不要）
// チャンネルページの VideoCard でそのまま使用
src={`https://image.mux.com/${playbackId}/thumbnail.webp?time=5`}
```

### 5.2 フィーチャー動画サムネイル（チャンネルトップ）

チャンネルトップにピン留めされたフィーチャー動画は、大きいサイズで表示。

```typescript
// components/channel/FeaturedVideo.tsx
// フィーチャー動画は 16:9 大サイズ + priority={true}
<Image
  src={`https://image.mux.com/${featuredVideo.muxPlaybackId}/thumbnail.webp?time=5&width=800`}
  alt={featuredVideo.title}
  fill
  sizes="(max-width: 1024px) 100vw, 66vw"
  className="object-cover"
  priority  // above the fold
/>
```

---

## 6. CDN キャッシュ戦略

### 6.1 CDN 構成

```
[ユーザー]
  ├── HTML/JS/CSS         → Vercel Edge Network (自動)
  ├── チャンネルバナー画像  → Supabase Storage → Vercel Image Optimization → CDN配信
  ├── アバター画像          → Supabase Storage → Vercel Image Optimization → CDN配信
  ├── 動画サムネイル        → Vercel Image Optimization → Mux CDN
  └── 動画ストリーム        → Mux CDN (HLS)
```

### 6.2 チャンネルページ API キャッシュヘッダー

```typescript
// next.config.ts headers() に追加

{
  // チャンネルメタデータ API（公開データのみ。userState は含めない: SEC-ISSUE-2）
  source: "/api/channels/:slug",
  headers: [
    {
      key: "Cache-Control",
      value: "public, s-maxage=300, stale-while-revalidate=600",
    },
  ],
},
{
  // チャンネル動画一覧 API（フィルタなし）
  source: "/api/channels/:slug/videos",
  headers: [
    {
      key: "Cache-Control",
      value: "public, s-maxage=60, stale-while-revalidate=300",
    },
  ],
},
```

---

## 7. チャンネルページ固有のモニタリング

### 7.1 Mux Data チャンネル別集計

動画再生ページで設定済みの `custom_3 = channel.id`（performance-design.md §10.3 正式定義）を活用し、
Mux Data でチャンネル別のパフォーマンスをフィルタリングして分析する。

```
Mux Data Dashboard フィルタ設定:
  custom_3 = "{channel.id}"  → チャンネル別の再生品質を抽出（slug ではなく DB id を使用）

確認指標（チャンネル別）:
  - Video Startup Time (TTFF): チャンネルの動画全体の平均起動時間
  - Rebuffer Ratio: チャンネル別バッファリング率
  - Video Completion Rate: チャンネル別視聴完了率
  - Watch Time Distribution: 離脱ポイントの傾向
```

### 7.2 チャンネルページ固有の Web Vitals

Vercel Speed Insights でのフィルタ設定:

```
フィルタ: Path = "/channel/[slug]"  → チャンネルページの Core Web Vitals を独立計測
デバイス: Mobile / Desktop 別に確認
確認指標: LCP (P75), INP (P75), CLS (P75)
```

### 7.3 モニタリング構成（全て無料）

| 計測対象 | ツール | コスト | 確認頻度 |
|---------|--------|-------|---------|
| LCP / INP / CLS / TTFB | Vercel Speed Insights | 無料 (Hobby) | 週次 |
| チャンネル別 TTFF / 視聴完了率 | Mux Data Dashboard (custom_3フィルタ) | 無料 (10K視聴/月) | 月次 |
| ページビュー | Vercel Analytics | 無料 (Hobby) | 月次 |
| エラートラッキング | Vercel ログ | 無料 (Hobby) | 即時（エラー時） |

---

## 8. コスト推計

### 8.1 チャンネルページ固有のコスト要因

| コスト要因 | サービス | 単価 | 月間想定 | 月額 |
|-----------|---------|------|---------|------|
| チャンネルバナー画像配信 | Vercel Image Optimization | Hobby 1000枚/月まで無料 | ~200回/月 | **$0** |
| チャンネルアバター配信 | Vercel Image Optimization | 同上 | ~500回/月 | **$0** |
| Supabase Storage | Supabase Free | 1GB無料 | ~10MB（50チャンネル分画像） | **$0** |
| 動画グリッドサムネイル | Mux CDN + Vercel Image | Mux Image は Storage に含む | 5,000枚/月 | **~$0（無料枠内）** |

**追加コスト: ほぼゼロ。** チャンネルページ固有のインフラコストは Hobby プランの無料枠で吸収できる。

### 8.2 月額コスト全体への影響

| シナリオ | ホーム + 動画ページ（既存） | + チャンネルページ | 合計 |
|---------|--------------------------|----------------|------|
| **最小構成** (月30本生成) | $20〜$40 | +$0 | **$20〜$40** |
| **標準構成** (月100本生成) | $45〜$75 | +$0 | **$45〜$75** |

**チャンネルページはインフラコストに影響しない。** 主要コストは引き続き AI 動画生成費用（Runway/Veo）と Mux Streaming Delivery。

### 8.3 Supabase Storage 利用上限の確認

| 項目 | Free プラン上限 | 想定使用量 | 余裕 |
|------|--------------|---------|------|
| ストレージ容量 | 1GB | 50チャンネル × バナー(200KB) + アバター(50KB) = ~12.5MB | ✅ 十分 |
| 帯域 | 2GB/月 | 5,000回アクセス × 250KB = ~1.2GB | ⚠ 要監視（80GBで十分余裕あり） |

---

## 9. CLS 防止設計（チャンネルページ固有）

### 9.1 Skeleton コンポーネント

```typescript
// components/channel/ChannelHeroSkeleton.tsx

export function ChannelHeroSkeleton() {
  return (
    <div>
      {/* バナー: 固定高さ */}
      <Skeleton className="h-[200px] w-full" />
      <div className="mx-auto max-w-[1200px] px-4 lg:px-6">
        <div className="flex items-end gap-4 -mt-12 pb-4">
          {/* アバター */}
          <Skeleton className="w-[96px] h-[96px] rounded-full shrink-0" />
          <div className="flex-1 space-y-2 pt-12">
            <Skeleton className="h-7 w-48" />  {/* チャンネル名 */}
            <Skeleton className="h-4 w-full" />  {/* 説明 */}
            <Skeleton className="h-5 w-32 rounded-full" />  {/* AIモデルバッジ */}
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />  {/* フォローボタン */}
        </div>
      </div>
    </div>
  );
}

// components/channel/ChannelStatsSkeleton.tsx

export function ChannelStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[80px] rounded-xl" />
      ))}
    </div>
  );
}
```

---

## 10. パフォーマンスモニタリング計画

### 10.1 チャンネルページ 定期レビュースケジュール

| 頻度 | 確認内容 | アクション |
|------|---------|---------|
| **デプロイ時** | Lighthouse CI（LCP/FCP/CLS/TTI） | スコア低下があれば即対応 |
| **週次** | Vercel Speed Insights P75（LCP/INP/CLS） | 目標値との乖離をチェック |
| **月次** | Mux Data チャンネル別視聴完了率・TTFF | コンテンツ品質改善に活用 |

### 10.2 アラート・対応フロー

```
指標劣化検知
  │
  ├─ LCP > 4.0秒（バナー画像遅延）
  │    ├─ Supabase Storage の帯域上限確認
  │    ├─ preload() 設定確認（<link rel="preload"> が <head> に出力されているか）
  │    └─ バナー画像サイズ確認（200KB以下か）
  │
  ├─ CLS > 0.1（レイアウトシフト）
  │    ├─ バナーの固定高さ確認（h-[200px]）
  │    └─ アバターの固定サイズ確認（w-[96px] h-[96px]）
  │
  └─ INP > 200ms（タブ切替・フィルタ遅延）
       ├─ Server Components の割合確認（クライアント JS 最小化）
       └─ TanStack Query のキャッシュ確認（staleTime=60秒）
```

---

## 11. 実装チェックリスト

### Core Web Vitals

- [ ] **LCP ≤ 2.5秒**: バナー画像に `priority={true}` と React 19 `preload()` が設定されている
- [ ] **INP ≤ 200ms**: タブ切替・フォローボタンが Client Component で軽量実装されている
- [ ] **CLS ≤ 0.1**: バナー `h-[200px]`、アバター `w-[96px] h-[96px]` で固定されている
- [ ] **TTFB ≤ 200ms**: `revalidate = 300` が設定されている（ISR キャッシュ）

### レンダリング

- [ ] チャンネルヒーロー（Tier 1）に `<Suspense fallback={<ChannelHeroSkeleton />}>` が設定されている
- [ ] 統計 + AI仕様（Tier 2）が Tier 1 と独立した Suspense 境界で並列フェッチされている
- [ ] 動画グリッド（Tier 3）が `<Suspense fallback={<VideoGridSkeleton count={12} />}>` で保護されている
- [ ] `getChannelStats()` と `getChannelAgentSpecs()` が `Promise.all` で並列取得されている

### 画像最適化

- [ ] バナー画像: `next/image` の `fill` + `priority` + `sizes="100vw"` が設定されている
- [ ] アバター画像: `next/image` の `fill` + `priority` + `sizes="96px"` が設定されている
- [ ] Server Component 内で `preload(bannerUrl, { as: "image", fetchPriority: "high" })` が呼ばれている
- [ ] `next.config.ts` の `remotePatterns` に `*.supabase.co` が追加されている

### 動画グリッド

- [ ] `useInfiniteQuery` の `queryKey` にフィルタ値（mood, sort）が含まれている
- [ ] IntersectionObserver の `rootMargin: "400px"` が設定されている
- [ ] 動画グリッド最初の4件に `priority={true}` が設定されている
- [ ] フィルタ変更時に適切なキャッシュ分離（新しい queryKey）が機能している

### モニタリング

- [ ] Vercel Speed Insights が `app/layout.tsx` に導入されている
- [ ] Mux Data で `custom_3 = channel.id` フィルタを使ったチャンネル別分析が確認できる

---

## 12. 前ページとの差分まとめ

| 項目 | ホーム画面 | 動画再生ページ | チャンネルページ |
|------|----------|-------------|--------------|
| revalidate | 60秒 | 3600秒 | **300秒** |
| LCP 要素 | サムネイル(480px) | Player poster(1920px) | **バナー画像(1200px)** |
| LCP 最適化 | `priority` prop | React 19 `preload()` | **両方を採用** |
| 画像ホスト | Mux CDN | Mux CDN | **Supabase Storage + Mux CDN** |
| 動画リスト | SSR + 無限スクロール | 関連動画SSR | **SSRシード + CSR無限スクロール** |
| フィルタリング | タブ（URL params） | なし | **ムード + ソート（URL params）** |
| データ並列化 | 単一クエリ | Promise.all(2) | **Promise.all(2) × 独立Suspense** |
| 追加コスト | — | — | **+$0（無料枠内）** |
| OGP | 不要 | 必須 | **Data設計 §5.1 `generateMetadata` に準拠** |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-26 | 1.0 | 初版作成（Task #4） | analyzer |
| 2026-02-27 | 1.1 | REV-2: CONS-ISSUE-1（APIパスを `/api/channels/` に統一）, USR-ISSUE-1（URLパラムを `slug` に統一）, CONS-ISSUE-4（`PUBLISHED` 大文字化）, CONS-ISSUE-2（OGP矛盾解消・`generateMetadata`参照に変更）, SEC-ISSUE-2（ISR/userState キャッシュ境界を §1.2・§3.1・§6.2 に明記） | analyzer |
