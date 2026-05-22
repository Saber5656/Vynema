# ホーム画面 ロードバランシング・パフォーマンス設計書

## プロジェクト: AI Theater
作成日: 2026-02-22
担当: tech-lead
Task: #7

**前提: 個人開発レベルの予算制約（月額$20〜$50目標）**

---

## 1. Next.js App Router レンダリング戦略

### 1.1 ホーム画面のレンダリング方式

**Streaming SSR + ISR（Incremental Static Regeneration）のハイブリッド構成**

```
リクエスト
  ↓
[Vercel Edge] ISR キャッシュあり → 即座にHTML返却（TTFB < 100ms）
  ↓ キャッシュなし or revalidate
[Server] Streaming SSR
  ├── シェル（Header + Tabs + Skeleton）→ 即座にストリーム送信
  └── <Suspense> 動画グリッド → データ取得完了後にストリーム送信
  ↓
[ブラウザ] 段階的にレンダリング
  ↓
[Client] Hydration → TanStack Query で追加読み込み可能に
```

### 1.2 ページ別レンダリング戦略

| ページ | 方式 | revalidate | 理由 |
|-------|------|------------|------|
| `/` (ホーム) | **SSR + ISR** | 60秒 | 適度な鮮度。60秒キャッシュでDB負荷削減 |
| `/trending` | **SSR + ISR** | 300秒 | トレンドは5分更新で十分 |
| `/watch/[id]` | **SSR + ISR** | 3600秒 | 動画メタデータは頻繁に変わらない |
| `/channel/[slug]` | **SSR + ISR** | 300秒 | チャンネル情報は低頻度更新 |
| `/search` | **SSR（キャッシュなし）** | 0 | クエリごとに結果が異なる |
| `/category/[slug]` | **SSR + ISR** | 60秒 | ホームと同等 |

### 1.3 実装パターン

```typescript
// app/page.tsx - ホーム画面

import { Suspense } from "react";
import { HomeTabs } from "@/components/home/HomeTabs";
import { HomeVideoGrid } from "@/components/home/HomeVideoGrid";
import { VideoGridSkeleton } from "@/components/video/VideoGridSkeleton";

// ISR: 60秒ごとに再生成
export const revalidate = 60;

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string }>;
}) {
  return (
    <main className="flex-1 px-4 py-6">
      {/* 即座にレンダリング（静的部分） */}
      <HomeTabs />

      {/* Suspense でストリーミング（データ依存部分） */}
      <Suspense fallback={<VideoGridSkeleton count={12} />}>
        <HomeVideoGrid searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
```

```typescript
// components/home/HomeVideoGrid.tsx - Server Component

import { getVideosForHome } from "@/lib/queries/videos";
import { VideoGridClient } from "./VideoGridClient";

export async function HomeVideoGrid({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string }>;
}) {
  const params = await searchParams;
  const data = await getVideosForHome({
    tab: params.tab ?? "recommended",
    categorySlug: params.category,
    limit: 20,
  });

  // 初期データをClient Componentに渡す
  return (
    <VideoGridClient
      initialData={data}
      tab={params.tab ?? "recommended"}
      categorySlug={params.category}
    />
  );
}
```

---

## 2. サムネイル最適化

### 2.1 Mux Thumbnail API の活用

Mux は `image.mux.com` 経由で動的にサムネイルを生成。リサイズ・フォーマット変換をCDN上で行うためサーバー負荷ゼロ。

```
https://image.mux.com/{PLAYBACK_ID}/thumbnail.webp?time=5&width=480&height=270
```

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `time` | 5 | 動画の5秒地点のフレーム |
| `width` | 480 | サムネイル幅（px） |
| `height` | 270 | サムネイル高さ（16:9） |
| フォーマット | `.webp` | WebP形式（JPEG比 25-35% 軽量） |

### 2.2 next/image による最適化

```typescript
// components/video/VideoThumbnail.tsx

import Image from "next/image";

interface VideoThumbnailProps {
  playbackId: string;
  title: string;
  priority?: boolean;  // Above the fold の画像に true
}

export function VideoThumbnail({
  playbackId,
  title,
  priority = false,
}: VideoThumbnailProps) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-surface">
      <Image
        src={`https://image.mux.com/${playbackId}/thumbnail.webp?time=5`}
        alt={title}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1440px) 33vw, 25vw"
        className="object-cover"
        priority={priority}
        loading={priority ? "eager" : "lazy"}
      />
    </div>
  );
}
```

### 2.3 サムネイル最適化の詳細

| 最適化手法 | 実装 | 効果 |
|-----------|------|------|
| **WebP フォーマット** | Mux URL で `.webp` 指定 | JPEG比 25-35% ファイルサイズ削減 |
| **レスポンシブ sizes** | `next/image` の `sizes` prop | デバイス幅に応じた最適サイズ配信 |
| **遅延読み込み** | `loading="lazy"`（デフォルト） | 初期ロード時のリクエスト数削減 |
| **優先読み込み** | Above the fold の最初の4-8枚に `priority={true}` | LCP改善 |
| **プレースホルダー** | `bg-surface` (CSS背景色) | CLS防止 |
| **aspect-ratio** | `aspect-video` (16:9固定) | CLS防止 |

### 2.4 サムネイルサイズ戦略

| ブレークポイント | グリッド列数 | サムネイル幅 | Mux URL width |
|----------------|------------|------------|---------------|
| Mobile (< 640px) | 1列 | ~600px | 640 |
| Tablet (640-1024px) | 2列 | ~300px | 480 |
| Desktop (1024-1440px) | 3列 | ~350px | 480 |
| Wide (> 1440px) | 4-5列 | ~300px | 480 |

`next/image` の `sizes` prop がブラウザに最適なサイズを指示し、Vercel Image Optimization が自動でリサイズ。

---

## 3. 無限スクロール実装

### 3.1 カーソルベースページネーション

**オフセットではなくカーソルベースを採用する理由:**

- パフォーマンス: `OFFSET 1000` はDBが1000行をスキャンして捨てる。カーソルはインデックスで直接ジャンプ
- 整合性: 新しい動画が追加されても重複・欠落が発生しない
- 無限スクロールとの相性: ページ番号が不要

### 3.2 実装

```typescript
// components/home/VideoGridClient.tsx

"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { VideoCard } from "@/components/video/VideoCard";
import { VideoCardSkeleton } from "@/components/video/VideoCardSkeleton";
import type { VideosResponse } from "@/lib/types";

interface VideoGridClientProps {
  initialData: VideosResponse;
  tab: string;
  categorySlug?: string;
}

export function VideoGridClient({
  initialData,
  tab,
  categorySlug,
}: VideoGridClientProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["videos", tab, categorySlug],
      queryFn: async ({ pageParam }): Promise<VideosResponse> => {
        const params = new URLSearchParams({ tab, limit: "20" });
        if (pageParam) params.set("cursor", pageParam);
        if (categorySlug) params.set("categorySlug", categorySlug);
        const res = await fetch(`/api/videos?${params}`);
        return res.json();
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: undefined as string | undefined,
      // SSRの初期データをシード
      initialData: {
        pages: [initialData],
        pageParams: [undefined],
      },
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    });

  // IntersectionObserver で自動ロード
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" } // 400px手前で先読み
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allVideos = data?.pages.flatMap((page) => page.videos) ?? [];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {allVideos.map((video, index) => (
          <VideoCard
            key={video.id}
            video={video}
            variant="grid"
            priority={index < 4} // 最初の4枚のサムネイルを優先読み込み
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
    </>
  );
}
```

### 3.3 パフォーマンス考慮

| 項目 | 対策 |
|------|------|
| 先読み距離 | `rootMargin: "400px"` でスクロール到達前にプリフェッチ |
| 1回の取得数 | 20件（4列 × 5行分）。多すぎるとレンダリング負荷、少なすぎると頻繁なリクエスト |
| DOM量制限 | MVP段階では仮想化不要。動画カード200件程度まで問題なし |
| ローディングUI | Skeleton 4件表示（shadcn/ui Skeleton） |

---

## 4. CDN 活用

### 4.1 CDN構成

```
[ユーザー]
  ├── HTML/JS/CSS → Vercel Edge Network (自動)
  ├── サムネイル → Vercel Image Optimization → Mux CDN
  └── 動画ストリーム → Mux CDN (HLS)
```

### 4.2 Vercel Edge Network

- Next.js のページ・API は自動で Vercel Edge Network から配信
- ISR のキャッシュは Edge にストア → リクエストのたびにオリジンに戻らない
- 静的アセット（JS/CSS/フォント）は自動で長期キャッシュ + CDN配信

**追加設定不要。Vercel にデプロイするだけで自動的にCDN配信される。**

### 4.3 Mux CDN

- 動画ストリーム（HLS .m3u8 / .ts セグメント）は Mux の CDN から配信
- サムネイル画像も `image.mux.com` から CDN 配信
- ABR（Adaptive Bitrate）もMux CDN上で自動処理

**追加設定不要。Mux Playback ID を指定するだけ。**

### 4.4 Next.js のキャッシュヘッダー設定

```typescript
// next.config.ts

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.mux.com",
      },
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // 静的アセットの長期キャッシュ
        source: "/:all*(svg|jpg|png|webp|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // API レスポンスのキャッシュ
        source: "/api/videos",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/api/videos/trending",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
      {
        // セキュリティヘッダー（home-rate-limiting.md §8 準拠）
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
    ];
  },
};
```

---

## 5. 月額コスト概算

### 5.1 個人開発での想定規模

| 指標 | MVP初期（月間） |
|------|---------------|
| 動画本数（累計） | 100〜500本 |
| 月間ページビュー | 1,000〜5,000 PV |
| 月間動画再生数 | 500〜2,000回 |
| 登録ユーザー数 | 50〜200人 |
| 新規動画生成数 | 30〜100本/月 |

### 5.2 サービス別コスト

| サービス | プラン | 月額コスト | 備考 |
|---------|--------|----------|------|
| **Vercel** | Hobby (無料) | **$0** | 100GB帯域、商用利用不可だがMVP検証には十分。Pro必要時は$20/月 |
| **Supabase** | Free | **$0** | 500MB DB、50,000 MAU、2GBストレージ |
| **Clerk** | Free | **$0** | 10,000 MAUまで無料 |
| **Mux** | 従量課金 | **$5〜$15** | 下記内訳参照 |
| **Upstash Redis** | Free | **$0** | 10,000コマンド/日まで無料 |
| **Railway** | Usage-based | **$5〜$10** | AI生成ワーカー。$5クレジット/月付き |

### 5.3 Mux コスト内訳

| 項目 | 単価 | 想定使用量 | 月額 |
|------|------|----------|------|
| Video Encoding | $0.015/分 | 100本 × 1分 = 100分 | $1.50 |
| Storage | $0.007/GB/月 | 100本 × 100MB = 10GB | $0.07 |
| Streaming Delivery | $0.006/分視聴 | 2,000回 × 1分 = 2,000分 | $12.00 |

Mux合計: 約 **$13.57/月**

### 5.4 AI動画生成コスト（最大の変動要素）

| API | 単価 | 月間100本生成 |
|-----|------|-------------|
| Runway Gen-4 Turbo | ~$0.50/10秒動画 | **$50** |
| Veo 3.1 Fast | ~$0.30/10秒動画 | **$30** |

**重要: AI生成コストが最大の支出項目。** 月30本に絞れば$15〜$25に抑制可能。

### 5.5 月額コスト合計

| シナリオ | インフラ | AI生成 | 合計 |
|---------|---------|--------|------|
| **最小構成** (月30本生成) | $5〜$15 | $15〜$25 | **$20〜$40** |
| **標準構成** (月100本生成) | $15〜$25 | $30〜$50 | **$45〜$75** |

**推奨: 月30〜50本の生成で開始し、$30〜$50/月に収める。**

### 5.6 無料枠の活用ポイント

```
Vercel Hobby:   100GB帯域 / 月         → MVP では十分
Supabase Free:  500MB DB / 50K MAU      → 動画5,000本程度まで対応
Clerk Free:     10,000 MAU              → 個人開発では到達しない
Upstash Free:   10,000コマンド/日       → BullMQの軽量利用には十分
Railway:        $5/月クレジット          → ワーカーの基本稼働をカバー
```

---

## 6. Core Web Vitals 達成策

### 6.1 目標値

| 指標 | 目標 | 測定ツール |
|------|------|----------|
| **LCP** (Largest Contentful Paint) | < 2.5秒 | Lighthouse, Web Vitals |
| **INP** (Interaction to Next Paint) | < 200ms | Lighthouse, Web Vitals |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Lighthouse, Web Vitals |

### 6.2 LCP 最適化（< 2.5秒）

ホーム画面のLCP要素 = **最初の行のサムネイル画像**

| 施策 | 効果 | 実装 |
|------|------|------|
| **ISR キャッシュ** | TTFB < 100ms（Edge キャッシュヒット時） | `export const revalidate = 60` |
| **Streaming SSR** | Shell 即座に表示 → 画像のプリロード開始が早まる | `<Suspense>` で段階的レンダリング |
| **サムネイル priority** | 最初の4枚を `priority={true}` で即座にフェッチ | `next/image` の `priority` prop |
| **WebP フォーマット** | 画像サイズ 25-35% 削減 | Mux URL で `.webp` 指定 |
| **フォント最適化** | フォント読み込みによるLCPブロック防止 | `next/font` で最適化（`display: swap`） |
| **JS バンドル最小化** | Hydration の JS を最小化 | Server Components 活用（クライアントJS削減） |

**LCP のボトルネック分析:**

```
TTFB (Edge キャッシュ)          : ~50ms
Server → HTML生成 (Streaming)    : ~100ms (Shell部分)
HTML Parse → 画像リクエスト開始  : ~50ms
画像ダウンロード (WebP, CDN)     : ~200-500ms
画像デコード + レンダリング       : ~50ms
─────────────────────────────────
合計:                            ~450-750ms → LCP < 1秒 で達成可能
```

### 6.3 INP 最適化（< 200ms）

| 施策 | 効果 | 実装 |
|------|------|------|
| **Server Components** | クライアント JS を最小化。インタラクション対象のみ Client Component | ページの大部分を RSC で |
| **動的 import** | 初期バンドルに不要なコンポーネントを遅延読み込み | `dynamic(() => import(...))` |
| **タブ切替の最適化** | URL パラメータで管理、不要な再レンダリングを防止 | `nuqs` で `useQueryState` |
| **仮想化（将来）** | 大量の動画カードでのスクロール性能 | MVP では不要。100件以上で検討 |

```typescript
// タブ切替: URL パラメータで管理（不要な状態管理を排除）
// nuqs ライブラリでシンプルに実装

"use client";

import { useQueryState } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function HomeTabs() {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "recommended" });

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="recommended">おすすめ</TabsTrigger>
        <TabsTrigger value="trending">トレンド</TabsTrigger>
        <TabsTrigger value="new">新着</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

### 6.4 CLS 最適化（< 0.1）

| 施策 | 効果 | 実装 |
|------|------|------|
| **aspect-ratio 固定** | サムネイルのサイズ確保でレイアウトシフト防止 | `aspect-video` (16:9) |
| **Skeleton UI** | データ読み込み前にプレースホルダー表示 | shadcn/ui `<Skeleton>` |
| **フォント `display: swap`** | フォント読み込み時のレイアウトシフト防止 | `next/font` のデフォルト |
| **画像 `fill` + コンテナ** | 画像サイズ不明でもレイアウト確保 | `next/image` の `fill` prop |
| **サイドバー幅固定** | サイドバーの展開/折り畳みでメインコンテンツがシフトしない | CSS `w-60` / `w-[72px]` 固定 |

```typescript
// Skeleton コンポーネント

export function VideoCardSkeleton() {
  return (
    <div className="space-y-3">
      {/* サムネイル Skeleton: aspect-ratio で高さ確保 */}
      <Skeleton className="aspect-video w-full rounded-lg" />
      <div className="flex gap-3">
        {/* アバター */}
        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          {/* タイトル */}
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          {/* メタ情報 */}
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

---

## 7. パフォーマンスモニタリング

### 7.1 Web Vitals 計測

```typescript
// app/layout.tsx

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        {/* Vercel の無料 Web Vitals 計測 */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
```

### 7.2 Mux Data（動画再生品質）

Mux Player は自動で以下のメトリクスを Mux Data に送信:
- 再生開始時間
- バッファリング率
- 視聴完了率
- エラー率

**追加コスト: Mux Data は月10,000視聴まで無料。**

### 7.3 モニタリング構成（無料）

| 対象 | ツール | コスト |
|------|--------|-------|
| Web Vitals (LCP/INP/CLS) | Vercel Speed Insights | 無料（Hobby） |
| ページビュー・トラフィック | Vercel Analytics | 無料（Hobby） |
| 動画再生品質 | Mux Data | 無料（10K視聴/月） |
| エラートラッキング | Vercel ログ | 無料（Hobby） |

**個人開発レベルでは追加のモニタリングサービス不要。すべて無料枠で対応可能。**

---

## 8. ホーム画面 API Rate Limiting 実装方針（MVP 最低限）

### 8.1 方針概要

MVP 着手時点で、ホーム画面の公開 API に対する最低限の Rate Limiting を実装する。
詳細設計は `home-rate-limiting.md` に定義済み。本セクションはその要約と確定値をまとめる。

### 8.2 アルゴリズム選定: Sliding Window（確定）

`home-rate-limiting.md` 2.2 にて tech-leader が Sliding Window を選定済み。

| アルゴリズム | 判定 | 理由 |
|------------|------|------|
| Fixed Window | 不採用 | ウィンドウ境界で2倍のリクエストが通る問題（request stampede） |
| **Sliding Window** | **採用** | 境界問題を回避。Redis コマンド消費は Fixed Window と同等（2回/判定）。`@upstash/ratelimit` の実装品質が高い |
| Token Bucket | 不採用（MVP） | ホーム画面 API にはオーバースペック。Runway API 連携で将来採用 |

> **注**: タスク記述では Fixed Window を推奨としていたが、tech-leader の既存選定（Sliding Window）を優先する。
> 理由: コスト同等（2コマンド/判定）で境界問題を回避でき、`@upstash/ratelimit` の API も同一のため実装負荷に差がない。

### 8.3 ホーム画面 API の確定設定値

| エンドポイント | レート制限 | 識別子 | ウィンドウ | 根拠 |
|-------------|----------|--------|----------|------|
| `GET /api/videos` | **60 req / 60s** | IP | 60秒 | 通常利用の約10倍。正当なヘビーユーザーは問題なし |
| `GET /api/videos/trending` | **30 req / 60s** | IP | 60秒 | 更新頻度が低いため厳しめ |
| `GET /api/categories` | **30 req / 60s** | IP | 60秒 | 低頻度アクセス |
| 上記エンドポイント（認証済み） | **120 req / 60s** | userId | 60秒 | 認証ユーザーは信頼度が高いため2倍に緩和 |

### 8.4 MVP 実装の最小構成

```typescript
// lib/rate-limit.ts（MVP 最小構成）

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 読み取り API（未認証）: 60 req / 60s Sliding Window
export const readRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  prefix: "ratelimit:read",
});

// 読み取り API（認証済み）: 120 req / 60s
export const authReadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, "60 s"),
  prefix: "ratelimit:auth-read",
});
```

### 8.5 適用方式: Route Handler 個別方式（確定）

`home-rate-limiting.md` 7 にて Route Handler 個別方式を推奨済み。
各 API Route で `checkRateLimit()` を呼び出す。Middleware 一括方式は不採用。

```typescript
// app/api/videos/route.ts（適用例）

export async function GET(req: NextRequest) {
  const rateLimitResponse = await checkRateLimit(readRateLimit, authReadRateLimit);
  if (rateLimitResponse) return rateLimitResponse;
  // ... ビジネスロジック
}
```

### 8.6 Upstash 無料枠への影響（確定値）

| 項目 | 値 |
|------|-----|
| 1回の判定で消費する Redis コマンド | 2 |
| 想定日間 API リクエスト（MVP） | ~170 req/日（5,000 PV/月） |
| 日間 Redis コマンド消費 | ~340 コマンド/日 |
| Upstash Free 上限 | 10,000 コマンド/日 |
| **使用率** | **~3.4%** |

### 8.7 超過時レスポンス（確定）

- HTTP Status: `429 Too Many Requests`
- ヘッダー: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Redis 障害時: Rate Limit をスキップして処理を継続（可用性 > セキュリティ、MVP 段階）

---

## 9. パフォーマンス最適化チェックリスト

### 実装時に確認すべき項目

- [ ] ホーム画面の `revalidate = 60` が設定されている
- [ ] `<Suspense>` + Skeleton で Streaming SSR が有効になっている
- [ ] Above the fold の最初の4枚のサムネイルに `priority={true}` が設定されている
- [ ] `next/image` に適切な `sizes` prop が設定されている
- [ ] サムネイルURLが `.webp` フォーマットで指定されている
- [ ] 無限スクロールの `rootMargin` が 400px に設定されている
- [ ] API レスポンスに `Cache-Control` ヘッダーが設定されている
- [ ] Server Components がページの大部分を構成している（クライアントJSが最小）
- [ ] `next/font` でフォントが最適化されている
- [ ] すべてのサムネイルコンテナに `aspect-video` が設定されている（CLS防止）
- [ ] Vercel Speed Insights が導入されている
- [ ] CSP ヘッダーが `next.config.ts` に設定されている（§4.4）
- [ ] `X-Frame-Options: DENY` が設定されている
- [ ] `X-Content-Type-Options: nosniff` が設定されている

### Rate Limiting（§8 準拠）

- [ ] `@upstash/redis` + `@upstash/ratelimit` がインストールされている
- [ ] `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` が環境変数に設定されている
- [ ] `readRateLimit`（Sliding Window 60 req/60s）が `lib/rate-limit.ts` に定義されている
- [ ] `authReadRateLimit`（Sliding Window 120 req/60s）が定義されている
- [ ] `GET /api/videos` に `checkRateLimit()` が適用されている
- [ ] `GET /api/videos/trending` に `checkRateLimit()` が適用されている
- [ ] `GET /api/categories` に `checkRateLimit()` が適用されている
- [ ] 429 レスポンスに `Retry-After` ヘッダーが含まれている
- [ ] Redis 障害時のフォールバック（Rate Limit スキップ）が実装されている

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-22 | 1.0 | 初版作成 | tech-lead |
| 2026-02-23 | 1.1 | [PERF-H-1] §4.4 に CSP + セキュリティヘッダー追加（home-rate-limiting.md §8 準拠） | tech-leader |
| 2026-03-06 | 1.2 | [PERF-H-2] §8 Rate Limiting 実装方針追加（Task #19）。Sliding Window 確定、設定値・チェックリスト追記 | analyzer |
