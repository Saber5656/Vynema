# 動画再生ページ: データフロー・インフラ設計

> 元ファイル: [video-player-data-design.md](video-player-data-design.md) から分割（§5-12）

---

## 5. Server Component データフロー

### 5.1 ページ構成

```typescript
// app/watch/[id]/page.tsx

import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { getVideoDetail } from "@/lib/queries/video-detail";
import { notFound } from "next/navigation";

// ISR: 1時間ごとに再生成
export const revalidate = 3600;

// OGP メタデータ
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { video } = await getVideoDetail(id);
  if (!video) return {};

  return {
    title: `${video.title} - AI Theater`,
    description: video.description ?? `${video.channel.name}によるAI生成動画`,
    openGraph: {
      title: video.title,
      description: video.description ?? undefined,
      type: "video.other",
      images: [
        {
          url: `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?width=1200&height=630&time=5`,
          width: 1200,
          height: 630,
          alt: video.title,
        },
      ],
    },
    // Twitter Card: "player" を採用（Task #6 パフォーマンス設計と統一）
    // "player" は動画埋め込み再生が可能で UX が良い
    // 非対応プラットフォームでは自動的に summary_large_image にフォールバック
    twitter: {
      card: "player",
      players: [
        {
          playerUrl: `${process.env.NEXT_PUBLIC_APP_URL}/embed/${video.muxPlaybackId}`,
          width: 1280,
          height: 720,
        },
      ],
    },
  };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();

  const { video, userState } = await getVideoDetail(id, userId ?? undefined);
  if (!video) notFound();

  // Figma spec v1.0 準拠: 3段タブUI構成（サイドバー廃止）
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">
      {/* ──── Tier 1: VideoPlayer ──── */}
      <VideoPlayer playbackId={video.muxPlaybackId} title={video.title} />

      {/* ──── Tier 2: タイトル + アクションバー + タブパネル ──── */}
      <VideoMetadata video={video} userState={userState} />

      {/* WatchPageTabPanel: 4タブ（推薦/クリエイター/プロンプト/コメント） */}
      <WatchPageTabPanel
        video={video}
        userState={userState}
        videoId={id}
      />
      {/* タブ内容:
         推薦タブ → <RecommendTab>: 関連動画（3セクション compact card）
         クリエイタータブ → <CreatorTab>: AICreatorCard + QualityScorePanel
         プロンプトタブ → <PromptTab>: AIInfoPanel + 生成メタデータ
         コメントタブ → <CommentsTab>: CommentSection（IntersectionObserver 遅延読み込み）
      */}

      {/* ──── Tier 3: 関連動画グリッド（デスクトップのみ） ──── */}
      <div className="mt-8 hidden lg:block">
        <Suspense fallback={<RelatedVideosSkeleton />}>
          <RelatedVideosGrid videoId={id} />
        </Suspense>
      </div>
    </main>
  );
}
```

### 5.2 データフェッチフロー

```
ユーザーが /watch/[id] にアクセス
    ↓
[Vercel Edge] ISR キャッシュヒット → HTML返却（動画メタ＋OGP）
    ↓ (キャッシュなし)
[Server Component] WatchPage
    ├── auth() → userId 取得
    ├── getVideoDetail(id, userId) → Promise.all
    │     ├── getVideoById(id)          → ~10ms
    │     └── getUserVideoState(userId) → ~15ms
    │     合計: ~15ms (並列)
    │
    ├── <VideoPlayer> (即座にレンダリング — Tier 1)
    ├── <VideoMetadata> (即座にレンダリング — Tier 2)
    ├── <WatchPageTabPanel> (即座にレンダリング — Tier 2)
    │     ├── 推薦タブ: 関連動画（SSR Streaming）
    │     ├── クリエイタータブ: AICreatorCard + QualityScore
    │     ├── プロンプトタブ: AIInfoPanel + 生成メタデータ
    │     └── コメントタブ: Client Component（IntersectionObserver 遅延）
    │
    └── <Suspense> <RelatedVideosGrid> (Tier 3, デスクトップのみ)
          └── getRelatedVideos(videoId) → ~30ms
    ↓
[ブラウザ]
    ├── 動画プレーヤー + メタデータ 即座に表示
    ├── タブパネル表示（初期タブ: 推薦）
    ├── Skeleton → Tier 3 関連動画グリッド表示（SSR Streaming）
    └── Hydration
          ├── Mux Player 初期化
          ├── いいね/保存ボタン → Client Component
          ├── タブ切り替え → Client Component (WatchPageTabPanel)
          └── コメントタブ: IntersectionObserver 監視開始
               → タブ切替またはスクロールで表示領域に近づく（300px手前）
               → TanStack Query でコメント取得（GET /api/videos/{id}/comments）
```

### 5.3 Mux Player 統合

```typescript
// components/video/VideoPlayer.tsx

"use client";

// ⚠️ 通常 import ("@mux/mux-player-react") は禁止 → バンドルサイズ肥大化
// 必ず /lazy を使用すること（performance-design.md §1.3 参照）
import MuxPlayer from "@mux/mux-player-react/lazy";

interface VideoPlayerProps {
  playbackId: string;
  title: string;
}

export function VideoPlayer({ playbackId, title }: VideoPlayerProps) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <MuxPlayer
        playbackId={playbackId}
        metadata={{
          video_title: title,
          player_name: "AI Theater",
          // ※ Mux Data カスタムディメンション (custom_1..3) の完全版は
          //   video-player-performance-design.md §10.3 を参照
        }}
        streamType="on-demand"
        accentColor="#6C5CE7"
        className="h-full w-full"
      />

      {/* AI生成オーバーレイ（3秒フェードイン → フェードアウト） */}
      <AIGeneratedOverlay />
    </div>
  );
}
```

---

## 6. インデックス設計（動画再生ページ追加分）

### 6.1 追加インデックス

ホーム画面で定義済みのインデックスに加え、以下を追加:

| テーブル | インデックス | 用途 | クエリパターン |
|---------|------------|------|-------------|
| `comment_likes` | `(userId, commentId)` UNIQUE | いいね重複防止 + 状態確認 | `WHERE userId = ? AND commentId = ?` |
| `comment_likes` | `(commentId)` | コメント別いいね取得 | `WHERE commentId IN (...)` |
| `comments` | `(videoId, parentId, createdAt)` | トップレベルコメント取得 | `WHERE videoId = ? AND parentId IS NULL ORDER BY createdAt DESC` |
| `comments` | `(videoId, parentId, likeCount)` | 人気コメント取得 | `WHERE videoId = ? AND parentId IS NULL ORDER BY likeCount DESC` |
| `saved_videos` | `(userId, videoId)` UNIQUE | 保存状態確認 | `WHERE userId = ? AND videoId = ?` |
| `videos` | `(channelId, status, qualityScore)` | 同一チャンネルの関連動画 | `WHERE channelId = ? AND status = 'PUBLISHED' ORDER BY qualityScore DESC` |
| `videos` | `(categoryId, status, qualityScore)` | 同一カテゴリの関連動画 | `WHERE categoryId = ? AND status = 'PUBLISHED' ORDER BY qualityScore DESC` |
| `videos` | `(aiModel, status, qualityScore)` | 同一モデルの関連動画 | `WHERE aiModel = ? AND status = 'PUBLISHED' ORDER BY qualityScore DESC` |

### 6.2 コメントの parentId = NULL インデックス

PostgreSQL では `WHERE parentId IS NULL` の部分インデックスが有効:

```sql
-- カスタムマイグレーション
CREATE INDEX idx_comments_toplevel_newest
  ON comments (video_id, created_at DESC)
  WHERE parent_id IS NULL;

CREATE INDEX idx_comments_toplevel_popular
  ON comments (video_id, like_count DESC)
  WHERE parent_id IS NULL;
```

Prisma の `@@index` では `WHERE` 条件付きインデックスが定義できないため、カスタムマイグレーションで追加。

---

## 7. キャッシュ戦略

### 7.1 レイヤー別キャッシュ

```
[ブラウザ]
  ├── 動画メタデータ → SSR で初期表示（ISR 1時間キャッシュ）
  ├── いいね/保存状態 → TanStack Query (staleTime: 0, 常に最新)
  ├── コメント → TanStack Query (staleTime: 30秒)
  └── 関連動画 → TanStack Query (staleTime: 5分)

[Vercel Edge]
  └── ISR キャッシュ (revalidate: 3600秒)
      ※ 動的なユーザー状態は含まない

[サーバー]
  └── Prisma → Supabase PostgreSQL
```

### 7.2 TanStack Query キャッシュ設定

```typescript
// hooks/useVideoDetail.ts（クライアント側の最新データ取得用）

// いいね状態: 楽観的更新でUX改善
export function useLike(videoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (type: "LIKE" | "DISLIKE") =>
      fetchApi(`/api/videos/${videoId}/like`, {
        method: "POST",
        body: JSON.stringify({ type }),
      }),
    onMutate: async (type) => {
      // 楽観的更新
      await queryClient.cancelQueries({ queryKey: ["video", videoId] });
      const previous = queryClient.getQueryData(["video", videoId]);
      queryClient.setQueryData(["video", videoId], (old: any) => ({
        ...old,
        userState: { ...old.userState, likeType: type },
      }));
      return { previous };
    },
    onError: (_, __, context) => {
      // ロールバック
      queryClient.setQueryData(["video", videoId], context?.previous);
    },
  });
}

// コメント: カーソルベースの無限スクロール
export function useComments(videoId: string, sort: "newest" | "popular") {
  return useInfiniteQuery({
    queryKey: ["comments", videoId, sort],
    queryFn: ({ pageParam }) =>
      fetchApi<CommentsResponse>(
        `/api/videos/${videoId}/comments?sort=${sort}&cursor=${pageParam ?? ""}&limit=20`
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: 30 * 1000, // 30秒
  });
}
```

### 7.3 楽観的更新パターン

| アクション | 楽観的更新 | ロールバック条件 |
|-----------|:--------:|:----------:|
| いいね/低評価 | ✅ ボタン即座に切替 + カウント ±1 | APIエラー時に元に戻す |
| コメント投稿 | ✅ 投稿即座に表示 | APIエラー時に削除 + エラーToast |
| 保存 | ✅ ボタン即座に切替 | APIエラー時に元に戻す |
| チャンネル登録 | ✅ ボタン即座に切替 + 登録者数 ±1 | APIエラー時に元に戻す |

---

## 8. OGP/SEO 対応

### 8.1 メタデータ生成

```typescript
// 動的OGPサムネイル
// Mux の image API でソーシャルシェア用の最適画像を生成
`https://image.mux.com/${playbackId}/thumbnail.webp?width=1200&height=630&time=5`
```

### 8.2 構造化データ（JSON-LD）

```typescript
// app/watch/[id]/page.tsx に追加

function VideoJsonLd({ video }: { video: VideoDetail }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description,
    thumbnailUrl: `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?width=1200`,
    uploadDate: video.publishedAt,
    duration: video.duration ? `PT${video.duration}S` : undefined,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/WatchAction",
        userInteractionCount: Number(video.viewCount),
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: video.likeCount,
      },
    ],
    creator: {
      "@type": "Organization",
      name: video.channel.name,
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

## 9. 集計キャッシュ更新フロー（動画再生ページ関連）

| イベント | 更新対象 | 更新方法 |
|---------|---------|---------|
| 視聴 (View) | `Video.viewCount` | `$executeRaw` で `+1`（30分以内の重複は除外） |
| いいね (Like) | `Video.likeCount` / `Video.dislikeCount` | トランザクション内で `increment`/`decrement` |
| コメント作成 | `Video.commentCount` | トランザクション内で `increment: 1` |
| コメント削除 | `Video.commentCount` | トランザクション内で `decrement: 1` |
| コメントいいね | `Comment.likeCount` | トランザクション内で `increment: 1` |
| コメントいいね取り消し | `Comment.likeCount` | トランザクション内で `decrement: 1` |
| チャンネル登録 | `AIChannel.subscriberCount` | トランザクション内で `increment: 1` |
| チャンネル登録解除 | `AIChannel.subscriberCount` | トランザクション内で `decrement: 1` |

---

## 10. セキュリティ考慮事項

### 10.1 入力バリデーション

| フィールド | バリデーション |
|-----------|-------------|
| コメント `body` | 1-1000文字、HTMLタグ除去（`sanitize-html` or DOMPurify）|
| コメント `parentId` | 存在確認 + 同一動画内のコメントであること |
| いいね `type` | `LIKE` / `DISLIKE` のみ（Zod enum） |
| 視聴記録 `watchedSeconds` | 0以上の整数、動画のduration以下 |
| 視聴記録 `videoId` | 存在する PUBLISHED 動画であること |

### 10.2 認可チェック

| アクション | チェック |
|-----------|---------|
| コメント投稿 | Clerk 認証必須 |
| コメント削除 | 投稿者本人のみ (`comment.userId === userId`) |
| いいね | Clerk 認証必須 |
| 保存 | Clerk 認証必須 |
| チャンネル登録 | Clerk 認証必須 |
| 視聴記録 | 認証任意（未ログインは userId=null） |

### 10.3 Zod バリデーションスキーマ

```typescript
// lib/validations/video.ts
import { z } from "zod";

export const createCommentSchema = z.object({
  body: z
    .string()
    .min(1, "コメントを入力してください")
    .max(1000, "コメントは1000文字以内で入力してください")
    .transform((val) => val.trim()),
  parentId: z.string().cuid().optional(),
});

export const likeSchema = z.object({
  type: z.enum(["LIKE", "DISLIKE"]),
});

export const viewSchema = z.object({
  videoId: z.string().cuid(),
  watchedSeconds: z.number().int().min(0),
});
```

---

## 11. 用語マッピング: テーマ / ムード

### 11.1 背景

DB スキーマでは `Video.moods` (String[]) としてデータを保持しているが、UI 設計（Task #4）の AI 生成情報パネルでは「テーマ」として表示する箇所がある。この不整合を明確にマッピングする。

### 11.2 定義

| DB フィールド | UI 表示名 | 用途 | 例 |
|-------------|----------|------|-----|
| `Video.moods` | **テーマ** (AI生成情報パネル内) | 動画再生ページの AI 情報パネルで「テーマ: 夕焼け・海辺」のように表示 | `["calm", "dreamy"]` → 「穏やか・幻想的」 |
| `Video.moods` | **ムード** (ホーム画面/フィルタ) | ホーム画面のムードカード、フィルタチップで使用 | MoodCard: 「Calm / 穏やか」 |
| `Video.categoryId` → `Category` | **カテゴリ** | 推薦タブ、フィルタチップ | 「音楽」「自然」 |

### 11.3 ムード表示名マッピング

```typescript
// lib/constants/moods.ts

export const MOOD_DISPLAY_NAMES: Record<string, { en: string; ja: string; emoji: string }> = {
  calm:      { en: "Calm",      ja: "穏やか",         emoji: "🌅" },
  energetic: { en: "Energetic", ja: "エネルギッシュ",   emoji: "⚡" },
  dreamy:    { en: "Dreamy",    ja: "幻想的",         emoji: "🌙" },
  fun:       { en: "Fun",       ja: "楽しい",         emoji: "🎉" },
  zen:       { en: "Zen",       ja: "禅",             emoji: "🧘" },
  mystic:    { en: "Mystic",    ja: "神秘的",         emoji: "🔮" },
};

/**
 * DB の moods 配列を UI 表示用の日本語テーマ文字列に変換
 * 用途: AI生成情報パネルの「テーマ」表示
 */
export function moodsToThemeLabel(moods: string[]): string {
  return moods
    .map((m) => MOOD_DISPLAY_NAMES[m]?.ja ?? m)
    .join("・");
}
```

### 11.4 UI での使い分け

| コンテキスト | 表示例 | 使用関数 |
|------------|--------|---------|
| AI生成情報パネル「テーマ」 | `テーマ: 穏やか・幻想的` | `moodsToThemeLabel(video.moods)` |
| ホーム画面ムードカード | `Calm / 穏やか` | `MOOD_DISPLAY_NAMES[mood]` |
| VideoCard メタタグ | `🎨 穏やか` | `MOOD_DISPLAY_NAMES[moods[0]]?.ja` |
| フィルタチップ | `🎭 Calm` | `MOOD_DISPLAY_NAMES[mood]?.en` |

---

## 12. Quality Score スケール変換

### 12.1 背景

DB スキーマ（home-data-design.md）では `Video.qualityScore` を **0-100** のスケールで保存する。
一方、UI 設計（video-player-uiux-improvements.md §3）では **0.0-5.0** のスケール（★表示）で表示する。
この差異を吸収するための変換関数を以下に定義する。

### 12.2 変換関数

```typescript
// lib/utils/quality-score.ts

/**
 * DB の Quality Score (0-100) を UI 表示用 (0.0-5.0) に変換
 *
 * 例: 96 → 4.8, 70 → 3.5, 40 → 2.0
 */
export function toDisplayScore(raw: number): number {
  return Math.round((raw / 20) * 10) / 10;
}

/**
 * UI 表示用 (0.0-5.0) を DB の Quality Score (0-100) に変換
 * バッチ計算やテストで使用
 */
export function toRawScore(display: number): number {
  return Math.round(display * 20);
}

/**
 * Quality Score に応じたカラートークンを返す
 * UI設計 §3.2 のスコア別表示色と対応
 */
export function getScoreColor(raw: number): string {
  const display = toDisplayScore(raw);
  if (display >= 4.0) return "quality-gold";    // #FFC107
  if (display >= 3.0) return "quality-silver";  // #8B949E
  return "quality-dim";                          // #7A8390
}
```

### 12.3 使用箇所

| コンテキスト | 値の形式 | 使用関数 |
|------------|---------|---------|
| DB 保存 / API レスポンス | 0-100 (raw) | そのまま |
| Quality Score パネル（★表示） | 0.0-5.0 | `toDisplayScore(video.qualityScore)` |
| VideoCard バッジ（★表示） | 0.0-5.0 | `toDisplayScore(video.qualityScore)` |
| スコア色の決定 | カラートークン | `getScoreColor(video.qualityScore)` |
| ソート / フィルタリング | 0-100 (raw) | そのまま |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成 | tech-leader |
| 2026-02-23 | 1.1 | [DB-V-1] 関連動画APIをセクション別グループ化レスポンスに変更、[DB-V-2] twitter card を "player" に統一、[DB-V-3] テーマ/ムード命名マッピング追加 | tech-leader |
| 2026-02-23 | 1.2 | [DB-V-4] Quality Score スケール変換関数追加（ISSUE-1 対応）、qualityScore コメントにスケール注記追加 | tech-leader |
| 2026-02-23 | 1.3 | [DB-V-5] コメントセクションを SSR Suspense → Client 遅延読み込み（IntersectionObserver）に変更（ISSUE-3 対応）、データフェッチフロー図を更新 | tech-leader |
| 2026-02-23 | 1.4 | [DB-V-6] §5.1 WatchPage JSX を2カラム+サイドバー → 3段タブUI構成に変更（Figma spec v1.0 準拠）。§5.2 データフェッチフロー図を WatchPageTabPanel + Tier 3 構成に更新 | tech-leader |
| 2026-02-23 | 1.5 | [DB-V-7] §5.3 MuxPlayer import を `@mux/mux-player-react/lazy` に統一（VR-3 対応）。通常 import 禁止コメント追加。[DB-V-8] CommentsSection → CommentSection に統一（VR-4 対応） | tech-leader |
| 2026-03-07 | 1.6 | [必須修正] §5.3 MuxPlayer metadata に Mux Data カスタムディメンション (custom_1..3) の正式定義への相互参照コメント追加（VR-2 対応） | tech-leader |
