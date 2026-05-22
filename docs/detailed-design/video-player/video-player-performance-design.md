# 動画再生ページ パフォーマンス設計書

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: analyzer
Task: #6

**前提: 個人開発レベルの予算制約（月額$50以下目標）**

---

## 1. レンダリング戦略

### 1.1 動画再生ページの方式

**SSR（動的） + ISR（revalidate=3600秒）**

動画再生ページは OGP/SEO 対応が必須のため、完全な SSR を採用する。
動画メタデータ（タイトル・説明文・サムネイル）は頻繁に変化しないため、
1時間キャッシュ（revalidate=3600）でDB負荷を抑制する。

```
リクエスト
  ↓
[Vercel Edge] ISR キャッシュあり → 即座にHTML返却（TTFB < 100ms）
  ↓ キャッシュなし or revalidate
[Server] Streaming SSR（3段タブUI構成）
  ├── シェル（Header + Player骨格 + Skeleton）→ 即座にストリーム送信
  ├── Tier 1: <Suspense> 動画メタデータ + Player → DB取得完了後にストリーム送信
  ├── Tier 2: WatchPageTabPanel（タブ切替 Client Component）
  └── Tier 3: <Suspense> 関連動画グリッド → 遅延でストリーム送信
  ↓
[ブラウザ] 段階的にレンダリング
  ↓
[Client] Hydration → タブ切替 + TanStack Query でコメント/関連動画を追加取得
```

### 1.2 Suspense 境界の設計

```typescript
// app/watch/[id]/page.tsx

import { Suspense } from "react";
import { generateMetadata } from "./metadata";
import { VideoPlayer } from "@/components/watch/VideoPlayer";
import { VideoMetadata } from "@/components/watch/VideoMetadata";
import { CommentSection } from "@/components/watch/CommentSection";
import { RelatedVideos } from "@/components/watch/RelatedVideos";
import { VideoPlayerSkeleton } from "@/components/watch/VideoPlayerSkeleton";
import { CommentSkeleton } from "@/components/watch/CommentSkeleton";
import { RelatedVideosSkeleton } from "@/components/watch/RelatedVideosSkeleton";

// ISR: 1時間ごとに再生成（動画メタデータは頻繁に変わらない）
export const revalidate = 3600;

export { generateMetadata };

// params は Next.js 15 では Promise のため await が必要
export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ページ先頭で params を解決し、全 Suspense ラップコンポーネントに videoId を渡す
  const { id: videoId } = await params;

  // Figma spec v1.0 準拠: 3段タブUI構成（サイドバー廃止）
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">
      {/* ──── Tier 1: Player + メタデータ（LCP要素） ──── */}
      <Suspense fallback={<VideoPlayerSkeleton />}>
        <VideoPlayerSection videoId={videoId} />
      </Suspense>

      {/* ──── Tier 2: タブパネル ──── */}
      {/* WatchPageTabPanel: 推薦/クリエイター/プロンプト/コメント */}
      {/* コメントタブは Client Component で IntersectionObserver 遅延読み込み */}
      <WatchPageTabPanel videoId={videoId} />

      {/* ──── Tier 3: 関連動画グリッド（デスクトップのみ） ──── */}
      <div className="mt-8 hidden lg:block">
        <Suspense fallback={<RelatedVideosSkeleton count={4} />}>
          <RelatedVideosGrid videoId={videoId} />
        </Suspense>
      </div>
    </div>
  );
}
```

### 1.3 並列データフェッチ

```typescript
// components/watch/VideoPlayerSection.tsx

import { getVideoById, getRelatedVideos } from "@/lib/queries/videos";

export async function VideoPlayerSection({
  videoId,
}: {
  videoId: string;
}) {
  // 動画メタデータのみ（Player表示に必要な最小限）
  const video = await getVideoById(videoId);

  if (!video) notFound();

  return (
    <>
      <VideoPlayer playbackId={video.muxPlaybackId} title={video.title} />
      <VideoMetadata video={video} />
    </>
  );
}
```

---

## 2. OGP / SEO 設計

### 2.1 動的 Metadata 生成

```typescript
// app/watch/[id]/metadata.ts

import type { Metadata } from "next";
import { getVideoById } from "@/lib/queries/videos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await getVideoById(id);

  if (!video) {
    return { title: "動画が見つかりません | AI Theater" };
  }

  const thumbnailUrl = `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?time=5&width=1280&height=720`;
  const pageUrl = `https://ai-theater.vercel.app/watch/${id}`;

  return {
    title: `${video.title} | AI Theater`,
    description: video.description ?? `AI生成動画: ${video.title}`,
    openGraph: {
      type: "video.other",
      title: video.title,
      description: video.description ?? `AI生成動画: ${video.title}`,
      url: pageUrl,
      images: [
        {
          url: thumbnailUrl,
          width: 1280,
          height: 720,
          alt: video.title,
        },
      ],
      videos: [
        {
          url: `https://stream.mux.com/${video.muxPlaybackId}.m3u8`,
          type: "application/x-mpegURL",
          width: 1920,
          height: 1080,
        },
      ],
    },
    twitter: {
      card: "player",
      title: video.title,
      description: video.description ?? `AI生成動画: ${video.title}`,
      images: [thumbnailUrl],
    },
  };
}
```

### 2.2 VideoObject 構造化データ（JSON-LD）

```typescript
// components/watch/VideoJsonLd.tsx

interface VideoJsonLdProps {
  video: {
    id: string;
    title: string;
    description: string | null;
    muxPlaybackId: string;
    createdAt: Date;
    duration: number | null;
    channel: { name: string; slug: string };  // AIChannel モデル（DB スキーマ準拠）
  };
}

export function VideoJsonLd({ video }: VideoJsonLdProps) {
  const thumbnailUrl = `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp`;
  const streamUrl = `https://stream.mux.com/${video.muxPlaybackId}.m3u8`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description ?? video.title,
    thumbnailUrl,
    uploadDate: video.createdAt.toISOString(),
    duration: video.duration ? `PT${video.duration}S` : undefined,
    contentUrl: streamUrl,
    embedUrl: `https://ai-theater.vercel.app/watch/${video.id}`,
    // AI Theater: AIChannel が動画クリエイター（DB の AIChannel モデルと対応）
    creator: {
      "@type": "Organization",
      name: video.channel.name,  // 例: "Aurora", "Nexus", "Prism" 等
      url: `/channel/${video.channel.slug}`,
    },
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

## 3. Mux Player 最適化

### 3.1 Mux Player 設定方針

```typescript
// components/watch/VideoPlayer.tsx
// @mux/mux-player-react v3.11.4 (最新)

"use client";

// lazy import: Player の JS バンドルを分割し、初期ロード時に含めない
// → ページの FCP/TTI を改善し、Player が表示されるまで JS 読み込みを遅延
import MuxPlayer from "@mux/mux-player-react/lazy";

interface VideoPlayerProps {
  playbackId: string;
  title: string;
  startTime?: number; // タイムスタンプリンク対応
}

export function VideoPlayer({ playbackId, title, startTime }: VideoPlayerProps) {
  return (
    <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden">
      <MuxPlayer
        playbackId={playbackId}
        streamType="on-demand"       // ストリームタイプ明示（不要なポーリング防止）
        metadata={{ video_title: title }}
        // パフォーマンス最適化設定
        preload="metadata"           // メタデータのみプリロード（bandwidth節約）
        startTime={startTime ?? 0}
        // ポスター画像（LCP最適化）
        poster={`https://image.mux.com/${playbackId}/thumbnail.webp?time=5&width=1920`}
        // UI設定
        style={{ width: "100%", height: "100%", aspectRatio: "16/9" }}
        // Mux Data でのメトリクス収集
        envKey={process.env.NEXT_PUBLIC_MUX_DATA_ENV_KEY}
      />
    </div>
  );
}
```

### 3.2 lazy import の活用（TTI / バンドルサイズ最適化）

`@mux/mux-player-react/lazy` を使うことで、Mux Player の JS が **初期バンドルに含まれない**。
Player が実際に DOM にマウントされる段階で動的に読み込まれるため、FCP・TTI を短縮できる。

```
通常 import:
  page.js バンドル → MuxPlayer JS 含む → パース・実行コスト大
  ↓
lazy import:
  page.js バンドル → MuxPlayer JS 除外 → 軽量
  Player 表示タイミングで mux-player.js を別途 fetch
```

| import 方式 | バンドルサイズ | TTI 影響 | 採用判断 |
|------------|------------|---------|---------|
| `from "@mux/mux-player-react"` | +大（Player JS 含む） | 増加 | 不採用 |
| `from "@mux/mux-player-react/lazy"` | 分割（別チャンク） | 短縮 | **採用** |

### 3.3 preload 戦略の選択根拠

| preload 値 | データ転送量 | 再生開始時間 | 採用判断 |
|-----------|-----------|-----------|---------|
| `"none"` | 最小（0） | 遅い（マニフェスト取得から） | 帯域最小だが UX 悪化 |
| `"metadata"` | 小（HLS マニフェスト + 少量） | 中程度 | **採用: コスト/UX バランス最良** |
| `"auto"` | 大（最初のセグメントを先読み） | 速い | 帯域コスト増（Mux課金対象） |

**`preload="metadata"` の採用理由:**
- HLS マニフェスト (.m3u8) のみ取得 → 動画長・チャプター・字幕メタデータが即時利用可能
- 実際の動画セグメント (.ts) はユーザーが再生ボタンを押すまで取得しない
- Mux の課金単位は **視聴分数** のため、事前バッファリングはコスト増の原因になる

### 3.3 ABR（Adaptive Bitrate）設定

Mux HLS は自動 ABR を提供。クライアント側での追加設定は不要。

```
Mux ABR レンダリション（自動）
  ├── 240p  ~ 400 Kbps   （低速回線）
  ├── 360p  ~ 800 Kbps
  ├── 480p  ~ 1.4 Mbps
  ├── 720p  ~ 2.8 Mbps
  └── 1080p ~ 5.0 Mbps   （高速回線）
```

Mux が回線速度を自動検出して最適な品質を選択する。クライアント JS 不要。

### 3.4 Poster 画像最適化（LCP対応）

動画プレイヤーの LCP 要素は **poster 画像**。この画像の高速表示が LCP を左右する。

```
LCP要素: poster 画像 (aspect-video: 16:9)
  ├── URL: https://image.mux.com/{playbackId}/thumbnail.webp?time=5&width=1920
  ├── フォーマット: WebP（JPEG比 25-35% 軽量）
  └── CDN: Mux CDN から直接配信（サーバー経由なし）
```

**追加の LCP 最適化 (poster 画像 preload):**

`generateMetadata` の `other` フィールドは `<link>` タグに変換されない（Next.js 制限）。
代わりに **React 19 / Next.js 15 の `preload` API** を Server Component 内で呼び出す。

```typescript
// components/watch/VideoPlayerSection.tsx
// React 19 の preload API: Server Component 実行時に <link rel="preload"> を <head> に挿入

import { preload } from "react-dom";
import { getVideoById } from "@/lib/queries/videos";
import { notFound } from "next/navigation";

export async function VideoPlayerSection({ videoId }: { videoId: string }) {
  const video = await getVideoById(videoId);
  if (!video) notFound();

  // poster 画像を <head> にプリロード宣言（LCP改善）
  // Next.js 15 + React 19 で Server Component から直接 <link rel="preload"> を出力できる
  const posterUrl = `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?time=5&width=1920`;
  preload(posterUrl, { as: "image", fetchPriority: "high" });

  return (
    <>
      <VideoPlayer playbackId={video.muxPlaybackId} title={video.title} />
      <VideoMetadata video={video} />
    </>
  );
}
```

> **注**: `preload()` は React 19 の Resource Hints API。`react-dom` からインポートし、
> Server Component のレンダリング中に呼び出すと Next.js が自動で `<head>` に `<link rel="preload">` を挿入する。

---

## 4. Core Web Vitals 目標値

### 4.1 目標値一覧

| 指標 | 目標値 | Google 基準 | 動画ページの LCP 要素 |
|------|--------|------------|---------------------|
| **LCP** (Largest Contentful Paint) | **≤ 2.5秒** | ≤ 2.5秒 (Good) | Mux Player poster 画像 |
| **FCP** (First Contentful Paint) | **≤ 1.8秒** | ≤ 1.8秒 (Good) | シェル HTML（Header + Player骨格） |
| **TTI** (Time to Interactive) | **≤ 3.5秒** | ≤ 3.8秒 (Good) | Player hydration 完了時点 |
| **INP** (Interaction to Next Paint) | **≤ 200ms** | ≤ 200ms (Good) | 再生ボタン / いいねボタン応答 |
| **CLS** (Cumulative Layout Shift) | **≤ 0.1** | ≤ 0.1 (Good) | aspect-ratio 固定で防止 |
| **TTFB** (Time to First Byte) | **≤ 200ms** | ≤ 800ms (Good) | ISR キャッシュヒット時 |

### 4.2 LCP ボトルネック分析（目標 ≤ 2.5秒）

LCP 要素 = **Mux Player の poster 画像**

```
TTFB (ISR Edge キャッシュ)          : ~50-200ms
HTML Parse → poster preload 開始     : ~50ms
poster 画像ダウンロード (WebP, Mux CDN): ~200-800ms
                                       （1920px WebP: ~60-200KB 想定）
画像デコード + レンダリング           : ~50ms
───────────────────────────────────────
合計:                                ~350ms - 1.1秒 → LCP ≤ 2.5秒 達成可能
```

**重要: ホーム画面のサムネイルと異なり、動画ページの poster は 1920px 幅を指定するため画像サイズが大きい。**
**WebP 形式でも ~150KB 程度になるため、CDN配信とプリロードが重要。**

### 4.3 FCP ボトルネック分析（目標 ≤ 1.8秒）

FCP 要素 = **Header + VideoPlayerSkeleton（シェルHTML）**

```
TTFB                          : ~50-200ms
HTML Parse + CSS               : ~50ms
シェル描画（Streaming SSR）     : ~100ms
─────────────────────────────
合計:                          ~200-350ms → FCP ≤ 1.8秒 十分達成可能
```

Streaming SSR でシェルを即座に送信するため、FCP はほぼ問題にならない。

### 4.4 TTI ボトルネック分析（目標 ≤ 3.5秒）

TTI = ページが操作可能になる時点（Player の hydration 完了）

```
FCP                            : ~300ms
JS バンドルダウンロード         : ~300-500ms（Server Components でバンドル最小化）
JS Parse + Execute             : ~200-400ms
MuxPlayer hydration            : ~100-200ms
─────────────────────────────
合計:                          ~900ms - 1.4秒 → TTI ≤ 3.5秒 十分達成可能
```

---

## 5. コメントセクション 遅延読み込み

### 5.1 設計方針

コメントは **below the fold** のコンテンツ。初期ロードには含めず、
ユーザーがスクロールした時点で取得する。

```
初期ロード: 動画メタデータ + Player のみ取得（LCP/FCP最優先）
  ↓
ユーザーがコメントセクションに近づく（300px 手前）
  ↓
TanStack Query でコメントをフェッチ（API /api/videos/{id}/comments）
  ↓
コメントリスト表示
```

### 5.2 実装

```typescript
// components/watch/CommentSection.tsx

"use client";

import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { CommentList } from "./CommentList";
import { CommentSkeleton } from "./CommentSkeleton";
import { CommentInput } from "./CommentInput";

interface CommentSectionProps {
  videoId: string;
}

export function CommentSection({ videoId }: CommentSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  // IntersectionObserver でビューポート外の間はフェッチしない
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true);
          observer.disconnect(); // 一度表示されたら監視停止
        }
      },
      { rootMargin: "300px" } // 300px手前でフェッチ開始
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["comments", videoId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${videoId}/comments?limit=20`);
      return res.json();
    },
    enabled: shouldLoad,        // IntersectionObserver が発火するまで無効
    staleTime: 30 * 1000,       // 30秒キャッシュ
    refetchOnWindowFocus: false,
  });

  return (
    <section ref={sectionRef} className="mt-6">
      <h2 className="text-lg font-semibold mb-4">コメント</h2>
      <CommentInput videoId={videoId} />
      {isLoading ? (
        <CommentSkeleton count={5} />
      ) : (
        <CommentList comments={comments?.items ?? []} videoId={videoId} />
      )}
    </section>
  );
}
```

### 5.3 コメントページネーション

```typescript
// API: /api/videos/[id]/comments/route.ts

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const comments = await prisma.comment.findMany({
    where: { videoId: id },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      body: true,       // Prisma スキーマ準拠（Comment.body）
      createdAt: true,
      user: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  const hasMore = comments.length > limit;
  const items = hasMore ? comments.slice(0, -1) : comments;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return Response.json({ items, nextCursor });
}
```

---

## 6. 関連動画 プリフェッチ戦略

### 6.1 設計方針

関連動画は **Tier 2 タブパネル「推薦」タブ + Tier 3 グリッド（デスクトップのみ）** に表示。
初期ロードで一緒に取得する（above the fold のコンテンツとして扱う）が、
サムネイル画像は遅延読み込みとし、ホバー時に次の動画をプリフェッチする。

### 6.2 関連動画の取得

```typescript
// components/watch/RelatedVideos.tsx (Server Component)
// DATA設計 §3.7 の RelatedVideosResponse に準拠（3セクション分離）

import { getRelatedVideos } from "@/lib/queries/videos";
import { RelatedVideoCard } from "./RelatedVideoCard";

interface RelatedVideosProps {
  videoId: string;
}

export async function RelatedVideos({ videoId }: RelatedVideosProps) {
  // 3セクション分離: upNext / sameModel / sameChannel（各最大5件）
  const { upNext, sameModel, sameChannel } = await getRelatedVideos(videoId);

  // 全セクションを通じた優先読み込みカウンター（最初の3件のみ priority）
  let priorityCount = 0;

  return (
    <div className="space-y-6">
      {/* セクション1: 次に見る */}
      {upNext.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            次に見る
          </h2>
          <div className="space-y-3">
            {upNext.map((video) => (
              <RelatedVideoCard
                key={video.id}
                video={video}
                priority={priorityCount++ < 3}
              />
            ))}
          </div>
        </section>
      )}

      {/* セクション2: 同じAIモデル */}
      {sameModel.videos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            {sameModel.modelName} の動画
          </h2>
          <div className="space-y-3">
            {sameModel.videos.map((video) => (
              <RelatedVideoCard
                key={video.id}
                video={video}
                priority={priorityCount++ < 3}
              />
            ))}
          </div>
        </section>
      )}

      {/* セクション3: 同一チャンネルの他の動画 */}
      {sameChannel.videos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
            {sameChannel.channelName} の他の動画
          </h2>
          <div className="space-y-3">
            {sameChannel.videos.map((video) => (
              <RelatedVideoCard
                key={video.id}
                video={video}
                priority={priorityCount++ < 3}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

### 6.3 ホバー時プリフェッチ

```typescript
// components/watch/RelatedVideoCard.tsx

"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface RelatedVideoCardProps {
  video: {
    id: string;
    title: string;
    muxPlaybackId: string;
    viewCount: number;
    duration: number | null;
    channel: { name: string; slug: string };  // AIChannel モデル準拠
  };
  priority?: boolean;
}

export function RelatedVideoCard({ video, priority = false }: RelatedVideoCardProps) {
  const router = useRouter();

  return (
    <Link
      href={`/watch/${video.id}`}
      className="flex gap-2 group hover:bg-surface-hover rounded-lg p-1 transition-colors"
      // ホバー時に次ページをプリフェッチ
      onMouseEnter={() => router.prefetch(`/watch/${video.id}`)}
    >
      {/* サムネイル */}
      <div className="relative w-[168px] h-[94px] shrink-0 rounded overflow-hidden bg-surface">
        <Image
          src={`https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?time=5&width=336`}
          alt={video.title}
          fill
          sizes="168px"
          className="object-cover"
          priority={priority}
          loading={priority ? "eager" : "lazy"}
        />
        {video.duration && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
            {formatDuration(video.duration)}
          </span>
        )}
      </div>

      {/* メタデータ */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium line-clamp-2 group-hover:text-primary">
          {video.title}
        </p>
        <p className="text-xs text-text-secondary mt-1">{video.channel.name}</p>
        <p className="text-xs text-text-secondary">
          {formatViewCount(video.viewCount)}回視聴
        </p>
      </div>
    </Link>
  );
}
```

---

## 7. データ並列フェッチ設計

### 7.1 動画ページで必要なデータ

| データ | 取得タイミング | キャッシュ時間 | 理由 |
|--------|-------------|-------------|------|
| 動画メタデータ | SSR（最優先） | ISR 3600秒 | Player表示に必須。OGP生成にも必須 |
| 関連動画リスト | SSR（並列） | ISR 3600秒 | サイドバーはabove the fold |
| コメント | Client遅延読み込み | TanStack 30秒 | below the fold。初期ロードに不要 |
| 視聴数（リアルタイム） | Client hydration後 | なし | SSRキャッシュと乖離する可能性 |

### 7.2 並列フェッチ実装

```typescript
// lib/queries/watch-page.ts

export async function getWatchPageData(videoId: string) {
  // 動画メタデータと関連動画を並列取得（逐次 vs 並列: ~200ms → ~80ms）
  // 関連動画は DATA設計 §3.7 の getRelatedVideos (3セクション分離) を使用
  const [video, relatedData] = await Promise.all([
    getVideoById(videoId),
    getRelatedVideos(videoId),  // → { upNext, sameModel, sameChannel }
  ]);

  return { video, relatedData };
}
```

---

## 8. CLS 防止設計

### 8.1 主要なレイアウトシフト要因と対策

| 要因 | 対策 | 実装 |
|------|------|------|
| **Player サイズ未確定** | `aspect-video` で 16:9 を事前確保 | `<div className="aspect-video">` |
| **コメントタブ切替** | Skeleton でスペース確保 | `CommentSkeleton` (高さ固定) |
| **タブパネル/関連動画サムネイル** | `fill` + 固定コンテナ | `<div className="relative w-[168px] h-[94px]">` |
| **動画タイトル改行** | `min-h` でテキスト行数を確保 | `min-h-[3rem]` |
| **視聴数の更新** | `tabular-nums` でフォント幅固定 | `font-variant-numeric: tabular-nums` |

```typescript
// VideoPlayerSkeleton: Player 表示前のプレースホルダー

export function VideoPlayerSkeleton() {
  return (
    <div className="space-y-4">
      {/* Player: aspect-ratio で高さ確保 */}
      <Skeleton className="aspect-video w-full rounded-lg" />
      {/* タイトル */}
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
      {/* メタ情報バー */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
    </div>
  );
}
```

---

## 9. Mux 帯域コスト最適化

### 9.1 動画再生ページのコスト要因

Mux の課金は **Streaming Delivery: $0.006/分視聴**。
動画ページのパフォーマンス設計が直接コストに影響する。

| 施策 | コスト影響 | 実装 |
|------|---------|------|
| `preload="metadata"` 採用 | 不要なバッファリングを防止 | MuxPlayer props |
| `preload="none"` は不採用 | UX 悪化 → 直帰率増 → 長期的コスト増 | — |
| `preload="auto"` は不採用 | 視聴しないユーザーの帯域を消費 | — |
| Mux Data の活用 | 視聴離脱ポイントを把握して動画品質改善 | `envKey` 設定 |

### 9.2 Mux プラン選択（researcher 調査による最新情報）

| プラン | 月額 | Delivery 枠 | 対応動画数 | 判断 |
|--------|------|------------|----------|------|
| **Free** | $0 | 100,000分/月 | 10本まで | MVP 初期検証向け（動画数に制限あり） |
| **Starter** | $10 | 無制限（従量課金） | 無制限 | **本運用時の推奨** |

**MVP 初期（〜10本）は Free Tier で開始し、動画本数が増えた時点で Starter（$10/月）へ移行する。**

### 9.3 月額コスト試算（Starter プラン想定）

**前提: 以下の 4,000分はサービス全体の Mux Streaming Delivery の合計値。**
ホーム画面のサムネイルは Mux Image API（`image.mux.com`）経由で別課金体系のため、
Streaming Delivery（動画再生）と加算されない。

| 項目 | 単価 | 想定（サービス全体月間） | 月額 |
|------|------|---------------------|------|
| Mux Starter 基本料 | $10/月 | — | **$10.00** |
| Streaming Delivery（動画再生合計） | $0.006/分 | 2,000回 × 平均2分 = 4,000分 | **$24.00** |
| Mux Data (再生品質モニタリング) | 無料 | 10,000視聴/月まで | **$0** |
| 合計 | — | — | **~$34/月** |

**注: Starter プランでも月$50予算内に収まる。`preload="metadata"` を採用し未視聴ユーザーへの余分な帯域コストを回避する。**

---

## 10. パフォーマンスモニタリング方針

### 10.1 動画ページ固有のモニタリング

| 指標 | ツール | 確認タイミング |
|------|--------|-------------|
| LCP / INP / CLS | Vercel Speed Insights | デプロイ後 |
| 動画再生開始時間 (TTFP) | Mux Data Dashboard | 週次 |
| バッファリング率 | Mux Data Dashboard | 週次 |
| 視聴完了率 | Mux Data Dashboard | 月次 |
| コメント表示遅延 | Vercel Analytics | 月次 |

### 10.2 Mux Data 設定

```typescript
// components/watch/VideoPlayer.tsx に追加

<MuxPlayer
  playbackId={playbackId}
  metadata={{
    video_id: videoId,           // 動画ID（Mux Data でフィルタ可能）
    video_title: title,
    viewer_user_id: userId,      // ユーザー別分析（任意）
    page_type: "watch_page",     // ページ種別
  }}
  envKey={process.env.NEXT_PUBLIC_MUX_DATA_ENV_KEY}
/>
```

### 10.3 Mux Data カスタムディメンション スキーマ定義（単一定義）

> **⚠️ このセクションが唯一の正式定義。** UIUX / Benchmark / その他全ドキュメントはここを参照すること。

AI Theater では Mux Data のカスタムディメンション `custom_1` 〜 `custom_3` を以下の通り定義する。

| フィールド | 意味 | DBフィールド | 値の例 | 分析用途 |
|-----------|------|------------|--------|---------|
| `custom_1` | 生成AIモデル名 | `video.aiModel` | `"runway-gen4-turbo"` | モデル別視聴傾向・完了率の比較 |
| `custom_2` | Quality Score (raw) | `video.qualityScore` (0-100) | `"85"` | 品質スコアと視聴完了率の相関分析 |
| `custom_3` | AI チャンネルID | `video.channel.id` | `"chn_abc123"` | チャンネル別エンゲージメント分析 |

```typescript
// components/watch/VideoPlayer.tsx（完全版）
// ※ custom_N の定義はこの実装例が正式

<MuxPlayer
  playbackId={playbackId}
  metadata={{
    // 標準フィールド（snake_case 統一）
    video_id: videoId,
    video_title: title,
    video_series: video.channel.name,    // AIChannel 名（チャンネル名）
    viewer_user_id: userId ?? "anonymous",
    page_type: "watch_page",
    player_name: "ai-theater-web",
    // カスタムディメンション（定義は §10.3 を参照）
    custom_1: video.aiModel,                          // 生成AIモデル名
    custom_2: String(video.qualityScore ?? ""),       // Quality Score 0-100 raw値
    custom_3: video.channel.id,                       // AI チャンネルID
  }}
  envKey={process.env.NEXT_PUBLIC_MUX_DATA_ENV_KEY}
/>
```

**設計判断メモ**:
- `custom_2` に `quality_score_raw` を採用: UI表示値（0-5 スケール）ではなく DB raw値（0-100）を送ることで、Mux Data ダッシュボードでの数値フィルタが容易になる
- `custom_3` に `channel.id` を採用: consistency-review ISSUE-2 で `agent` モデルは存在せず `AIChannel` が正しい実体。`agent_id` という命名は `channel_id` に読み替える
- `custom_4` 以降は将来拡張用（処理時間、プロンプト長、推定コスト等）

---

## 11. 実装チェックリスト

### パフォーマンス目標

- [ ] **LCP ≤ 2.5秒**: poster 画像が WebP + Mux CDN 配信されている
- [ ] **FCP ≤ 1.8秒**: Streaming SSR でシェルが即座に送信されている
- [ ] **TTI ≤ 3.5秒**: Server Components でクライアント JS が最小化されている
- [ ] **INP ≤ 200ms**: Player / いいね ボタン等のインタラクションが軽量
- [ ] **CLS ≤ 0.1**: `aspect-video` で Player スペースが事前確保されている

### 実装項目

- [ ] `revalidate = 3600` が設定されている（ISR 1時間）
- [ ] `generateMetadata` で OGP タグ（og:title, og:image, og:video）が生成されている
- [ ] `VideoJsonLd` で VideoObject 構造化データが出力されている
- [ ] MuxPlayer を `@mux/mux-player-react/lazy` でインポートしている（バンドル分割）
- [ ] MuxPlayer に `streamType="on-demand"` が設定されている
- [ ] MuxPlayer に `preload="metadata"` が設定されている
- [ ] MuxPlayer に `poster` に WebP URL が設定されている（LCP最適化）
- [ ] WatchPageTabPanel が3段タブUI構成で実装されている（サイドバー不使用）
- [ ] コメントタブに IntersectionObserver 遅延読み込みが実装されている
- [ ] 関連動画は SSR で並列取得されている（`Promise.all`）
- [ ] Tier 3 関連動画グリッドがデスクトップのみ表示されている（`hidden lg:block`）
- [ ] 関連動画カードに `onMouseEnter` で `router.prefetch` が設定されている
- [ ] 関連動画サムネイルの最初の3件に `priority={true}` が設定されている
- [ ] Mux Data `envKey` が設定されている（再生品質モニタリング）
- [ ] Player コンテナに `aspect-video` が設定されている（CLS防止）
- [ ] Vercel Speed Insights が有効になっている

---

## 12. ホーム画面との差分まとめ

| 項目 | ホーム画面 | 動画再生ページ |
|------|----------|-------------|
| レンダリング | SSR + ISR(60秒) | SSR + ISR(3600秒) |
| LCP 要素 | サムネイル画像(480px) | Mux Player poster(1920px) |
| LCP 目標 | < 2.5秒 | < 2.5秒（同等） |
| FCP 目標 | — | < 1.8秒（追加） |
| TTI 目標 | — | < 3.5秒（追加） |
| OGP | 不要 | 必須（og:video 含む） |
| 構造化データ | 不要 | VideoObject JSON-LD |
| レイアウト | シングルカラム + グリッド | 3段タブUI（サイドバー廃止） |
| 遅延読み込み | 無限スクロール | コメントタブ（IntersectionObserver） |
| プリフェッチ | 次ページ（カーソル） | 関連動画（hover） |
| Mux 設定 | CDN サムネイルのみ | Player + Data モニタリング |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成 | analyzer |
| 2026-02-23 | 1.1 | researcher 調査反映: `/lazy` import 追加、Mux Free Tier コスト修正、`streamType` 追加 | analyzer |
| 2026-02-23 | 1.2 | PM レビュー反映: Props 整合修正(PERF-V-1)、JSON-LD creator を AI エージェント名に(PERF-V-2)、poster preload を React 19 `preload()` API に変更(PERF-V-3)、コスト試算前提を明記(PERF-V-4) | analyzer |
| 2026-02-23 | 1.3 | [PERF-V-5] Comment select フィールド名を `content` → `body` に修正（Prisma スキーマ準拠、ISSUE-5 対応） | tech-leader |
| 2026-02-23 | 1.4 | [PERF-V-6] JSON-LD creator を `Person`+agent → `Organization`+channel に修正（ISSUE-2）、[PERF-V-7] 関連動画を3セクション分離に修正（ISSUE-4）、[PERF-V-8] RelatedVideoCard の agent → channel に修正、並列フェッチを getRelatedVideos(videoId) に統一 | tech-leader |
| 2026-02-23 | 1.5 | [PERF-V-9] §1.1-§1.2 を2カラム+サイドバー → 3段タブUI構成に変更（Figma spec v1.0 準拠）。§6.1 関連動画配置説明・§8 CLS表・§11 チェックリスト・§12 差分表を更新 | tech-leader |
