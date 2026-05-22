# ホーム画面: スキーマ・API設計

> 元ファイル: [home-data-design.md](home-data-design.md) から分割（§1-3）

## プロジェクト: AI Theater
作成日: 2026-02-22
担当: tech-lead
Task: #6

---

## 1. Prisma スキーマ定義

### 1.1 ER図（概要）

```
User (Clerk同期)
  ├── 1:N → Comment
  ├── 1:N → Like
  ├── 1:N → View
  ├── 1:N → SavedVideo
  └── M:N → AIChannel (Subscription)

AIChannel
  ├── 1:N → Video
  └── M:N → User (Subscription)

Video
  ├── N:1 → AIChannel
  ├── N:1 → Category
  ├── M:N → Tag (VideoTag)
  ├── 1:N → Comment
  ├── 1:N → Like
  └── 1:N → View

Category
  └── 1:N → Video

Tag
  └── M:N → Video (VideoTag)
```

### 1.2 スキーマ定義

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")          // Supabase Connection Pooling (Transaction mode)
  directUrl = env("DIRECT_DATABASE_URL")   // Supabase Direct Connection (Migrations用)
}

// =============================================
// User（Clerkから同期）
// =============================================
model User {
  id        String   @id @default(cuid())
  clerkId   String   @unique                // Clerk User ID
  name      String
  imageUrl  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  comments    Comment[]
  likes       Like[]
  views       View[]
  savedVideos SavedVideo[]
  subscriptions Subscription[]

  @@index([clerkId])
  @@map("users")
}

// =============================================
// AIChannel（AI投稿者 = 仮想チャンネル）
// =============================================
model AIChannel {
  id          String   @id @default(cuid())
  name        String                        // "Aurora", "Nexus", "Prism" 等
  slug        String   @unique              // URL用スラッグ
  description String?
  avatarUrl   String?                       // AI生成アバター画像URL
  bannerUrl   String?                       // バナー画像URL
  accentColor String?                       // チャンネル固有カラー (#hex)
  aiModel     String                        // 主に使用するAIモデル名
  themes      String[]                      // 得意ジャンル ["自然", "風景"]
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  videos        Video[]
  subscribers   Subscription[]

  // 集計キャッシュ（パフォーマンス用）
  videoCount      Int @default(0)
  subscriberCount Int @default(0)
  totalViewCount  BigInt @default(0)

  @@index([slug])
  @@index([isActive, createdAt])
  @@map("ai_channels")
}

// =============================================
// Video（動画メタデータ）
// =============================================
model Video {
  id          String      @id @default(cuid())
  title       String
  description String?

  // Mux関連
  muxAssetId    String    @unique           // Mux Asset ID
  muxPlaybackId String    @unique           // Mux Playback ID（再生・サムネイル用）
  muxStatus     MuxStatus @default(PREPARING) // Mux処理ステータス

  duration    Int?                          // 動画長（秒）

  // AI生成情報
  aiModel     String                        // 使用AIモデル (e.g. "runway-gen4-turbo")
  aiPrompt    String?                       // 生成プロンプト
  aiParams    Json?                         // 生成パラメータ（JSON）

  // 品質スコア
  qualityScore  Float?                       // 5軸複合スコア（0-100）
  qualityDetails Json?                       // { technicalQuality, likeRatio, completionRate, promptCreativity, commentQuality }

  // ムード（雰囲気タグ）
  moods       String[]                       // ["calm", "energetic", "dreamy", "fun", "zen", "mystic"]

  // 公開制御
  status      VideoStatus @default(PROCESSING)
  publishedAt DateTime?                     // 公開日時（nullなら未公開）

  // リレーション
  channelId   String
  channel     AIChannel  @relation(fields: [channelId], references: [id])
  categoryId  String?
  category    Category?  @relation(fields: [categoryId], references: [id])

  tags        VideoTag[]
  comments    Comment[]
  likes       Like[]
  views       View[]
  savedBy     SavedVideo[]

  // 集計キャッシュ（パフォーマンス用）
  viewCount    BigInt @default(0)
  likeCount    Int    @default(0)
  dislikeCount Int    @default(0)
  commentCount Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([channelId])
  @@index([categoryId])
  @@index([status, publishedAt])            // 公開動画の新着順取得
  @@index([status, viewCount])              // 公開動画の人気順取得
  @@index([status, publishedAt, viewCount]) // トレンド計算用
  @@index([status, qualityScore])           // 品質スコア順取得
  @@index([muxPlaybackId])
  @@map("videos")
}

enum VideoStatus {
  PROCESSING    // AI生成中 or Muxトランスコード中
  READY         // 公開可能
  PUBLISHED     // 公開済み
  FAILED        // 生成失敗
  MODERATION    // モデレーション待ち
  REJECTED      // モデレーション却下
}

enum MuxStatus {
  PREPARING
  READY
  ERRORED
}

// =============================================
// Category（カテゴリ）
// =============================================
model Category {
  id    String @id @default(cuid())
  name  String @unique                     // "音楽", "ゲーム", "教育" 等
  slug  String @unique                     // URL用スラッグ
  icon  String?                            // Lucide icon名

  videos Video[]

  @@map("categories")
}

// =============================================
// Tag（タグ）
// =============================================
model Tag {
  id   String @id @default(cuid())
  name String @unique

  videos VideoTag[]

  @@map("tags")
}

model VideoTag {
  videoId String
  tagId   String
  video   Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  tag     Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([videoId, tagId])
  @@index([tagId])
  @@map("video_tags")
}

// =============================================
// Comment（コメント）
// =============================================
model Comment {
  id        String   @id @default(cuid())
  body      String

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId   String
  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  // スレッド返信
  parentId  String?
  parent    Comment?  @relation("CommentThread", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("CommentThread")

  likeCount Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([videoId, createdAt])             // 動画別コメント新着順
  @@index([videoId, likeCount])             // 動画別コメント人気順
  @@index([parentId])
  @@map("comments")
}

// =============================================
// Like（いいね / 低評価）
// =============================================
model Like {
  id      String   @id @default(cuid())
  type    LikeType                          // LIKE or DISLIKE

  userId  String
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId String
  video   Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, videoId])               // 1ユーザー1動画に1回
  @@index([videoId])
  @@map("likes")
}

enum LikeType {
  LIKE
  DISLIKE
}

// =============================================
// View（視聴記録）
// =============================================
model View {
  id      String   @id @default(cuid())

  userId  String?                           // 未ログインユーザーはnull
  user    User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  videoId String
  video   Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  watchedSeconds Int @default(0)            // 視聴秒数

  createdAt DateTime @default(now())

  @@index([videoId, createdAt])             // 再生回数集計用
  @@index([userId, createdAt])              // 視聴履歴用
  @@map("views")
}

// =============================================
// SavedVideo（あとで見る / お気に入り）
// =============================================
model SavedVideo {
  id      String @id @default(cuid())

  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId String
  video   Video  @relation(fields: [videoId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, videoId])
  @@index([userId, createdAt])
  @@map("saved_videos")
}

// =============================================
// Subscription（チャンネル登録）
// =============================================
model Subscription {
  id        String @id @default(cuid())

  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  notify    Boolean @default(true)          // 通知ON/OFF

  createdAt DateTime @default(now())

  @@unique([userId, channelId])
  @@index([channelId])
  @@map("subscriptions")
}
```

### 1.3 集計キャッシュ戦略

`Video.viewCount`、`Video.likeCount` 等の集計フィールドは、リアルタイムの COUNT クエリを避けるための非正規化キャッシュ。更新方法:

| フィールド | 更新タイミング | 更新方法 |
|-----------|-------------|---------|
| `Video.viewCount` | View INSERT 時 | Prisma の `$executeRaw` で `UPDATE videos SET view_count = view_count + 1` |
| `Video.likeCount` | Like INSERT/DELETE 時 | トランザクション内でカウント更新 |
| `Video.commentCount` | Comment INSERT/DELETE 時 | トランザクション内でカウント更新 |
| `AIChannel.videoCount` | Video PUBLISHED 時 | トランザクション内でカウント更新 |
| `AIChannel.subscriberCount` | Subscription INSERT/DELETE 時 | トランザクション内でカウント更新 |
| `Video.qualityScore` | 定期バッチ（1時間ごと）or いいね/視聴イベント時 | MVP: `likeRatio × 50 + completionRate × 50` で算出。将来的に5軸に拡張 |

```typescript
// いいね追加時の例
async function likeVideo(userId: string, videoId: string) {
  return prisma.$transaction([
    prisma.like.create({
      data: { userId, videoId, type: "LIKE" },
    }),
    prisma.video.update({
      where: { id: videoId },
      data: { likeCount: { increment: 1 } },
    }),
  ]);
}
```

---

## 2. ホーム画面用 API エンドポイント設計

### 2.1 API方式の選定

**Next.js API Routes (Route Handlers) + Server Actions を採用**

tRPC は以下の理由で不採用:
- Server Components + Server Actions で型安全なデータフェッチが既に実現可能
- 追加の依存関係・学習コストを避ける
- API Routes はサードパーティ連携（Mux Webhook 等）にも対応

### 2.2 ホーム画面のデータ取得パターン

ホーム画面は **Server Component でのデータフェッチ** を基本とし、クライアント側の追加読み込み（無限スクロール）は **API Route + TanStack Query** で行う。

```
初回表示: Server Component → Prisma → HTML（SSR/Streaming）
追加読み込み: Client → API Route → Prisma → JSON
```

### 2.3 エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | `/api/videos` | 動画一覧（ホーム画面メイン） | 不要 |
| GET | `/api/videos/trending` | トレンド動画 | 不要 |
| GET | `/api/videos/[id]` | 動画詳細 | 不要 |
| GET | `/api/channels/[slug]` | チャンネル情報 | 不要 |
| GET | `/api/channels/[slug]/videos` | チャンネル動画一覧 | 不要 |
| GET | `/api/categories` | カテゴリ一覧 | 不要 |
| GET | `/api/categories/[slug]/videos` | カテゴリ別動画 | 不要 |
| POST | `/api/views` | 視聴記録 | 任意 |

### 2.4 ホーム画面メインAPI: `GET /api/videos`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `cursor` | string | - | カーソル（最後の動画ID） |
| `limit` | number | 20 | 取得件数（最大50） |
| `tab` | enum | "recommended" | タブ種別: recommended / trending / new / category |
| `categorySlug` | string | - | カテゴリ絞り込み（tab=category時） |
| `channelId` | string | - | チャンネル絞り込み |

**レスポンス型:**

```typescript
// 推薦理由の型定義（home-recommendation-source.md §3.1 準拠）
import type { RecommendationReason } from "@/lib/recommendation-reason";

interface VideosResponse {
  videos: VideoCard[];
  nextCursor: string | null;  // 次ページのカーソル（nullなら末尾）
  hasMore: boolean;
  sectionReason?: RecommendationReason; // セクション全体の推薦理由（MVP Phase 1: 固定テキスト）
}

interface VideoCard {
  id: string;
  title: string;
  muxPlaybackId: string;       // サムネイル・再生用
  duration: number | null;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;        // クライアントでいいね率を計算: likeCount / (likeCount + dislikeCount)
  qualityScore: number | null; // 品質スコア（0-100）
  moods: string[];             // ムードタグ
  publishedAt: string;         // ISO 8601
  aiModel: string;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
  category: {
    name: string;
    slug: string;
  } | null;
}
```

### 2.5 トレンドAPI: `GET /api/videos/trending`

トレンドスコアの算出:

```typescript
// トレンドスコア = 直近の視聴速度 × いいね率
// 簡易実装: 過去24時間の視聴数でソート

const trendingVideos = await prisma.$queryRaw`
  SELECT v.*,
    (SELECT COUNT(*) FROM views
     WHERE video_id = v.id
     AND created_at > NOW() - INTERVAL '24 hours') as recent_views
  FROM videos v
  WHERE v.status = 'PUBLISHED'
  ORDER BY recent_views DESC
  LIMIT ${limit}
  OFFSET ${offset}
`;
```

MVP段階では `viewCount` の降順 + `publishedAt` の降順で十分。パーソナライズは将来フェーズで追加。

---

## 3. データ取得クエリ最適化

### 3.1 ホーム画面の動画一覧クエリ

**最適化済みクエリ（N+1回避）:**

```typescript
// lib/queries/videos.ts

export async function getVideosForHome({
  tab,
  cursor,
  limit = 20,
  categorySlug,
}: GetVideosParams) {
  const where: Prisma.VideoWhereInput = {
    status: "PUBLISHED",
    publishedAt: { not: null },
    ...(categorySlug && {
      category: { slug: categorySlug },
    }),
  };

  const orderBy = getOrderBy(tab);

  const videos = await prisma.video.findMany({
    where,
    orderBy,
    take: limit + 1,    // 1件多く取得して hasMore を判定
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,           // カーソル自体をスキップ
    }),

    // SELECT最適化: 必要なカラムだけ取得
    select: {
      id: true,
      title: true,
      muxPlaybackId: true,
      duration: true,
      viewCount: true,
      likeCount: true,
      dislikeCount: true,      // いいね率計算用
      qualityScore: true,      // 品質スコア
      moods: true,             // ムードタグ
      publishedAt: true,
      aiModel: true,
      // リレーション（JOINで1クエリ）
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
        },
      },
      category: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  const hasMore = videos.length > limit;
  const result = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return { videos: result, nextCursor, hasMore };
}

function getOrderBy(tab: string): Prisma.VideoOrderByWithRelationInput[] {
  switch (tab) {
    case "trending":
      return [{ viewCount: "desc" }, { publishedAt: "desc" }];
    case "new":
      return [{ publishedAt: "desc" }];
    case "quality":
      return [{ qualityScore: "desc" }, { publishedAt: "desc" }];
    case "recommended":
    default:
      // MVP: 新着 + 人気のミックス（将来的にパーソナライズ）
      return [{ publishedAt: "desc" }];
  }
}
```

### 3.2 N+1問題の回避ポイント

| パターン | 問題 | 解決策 |
|---------|------|--------|
| 動画一覧 + チャンネル情報 | N+1クエリ | `select` 内で `channel` をネスト（Prisma が JOIN に変換） |
| 動画一覧 + カテゴリ | N+1クエリ | `select` 内で `category` をネスト |
| 動画一覧 + タグ | N+1クエリ | ホーム画面ではタグ不要 → 取得しない |
| 動画 + いいね数/コメント数 | COUNT サブクエリ | 集計キャッシュフィールドを使用（`viewCount`, `likeCount`） |

### 3.3 SELECT 最適化

ホーム画面で **不要なカラム** を明示的に除外:

```typescript
// ❌ 悪い例: include は全カラムを取得
const videos = await prisma.video.findMany({
  include: { channel: true, category: true },
});
// → description, aiPrompt, aiParams 等の大きなテキストも取得してしまう

// ✅ 良い例: select で必要なカラムのみ
const videos = await prisma.video.findMany({
  select: {
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
  },
});
```

**効果:** レスポンスサイズを約60%削減（`description`、`aiPrompt`、`aiParams` 等の除外）。

### 3.4 ページネーション: カーソルベース

**オフセットベースではなくカーソルベースを採用:**

| 方式 | メリット | デメリット |
|------|---------|----------|
| OFFSET | 実装が簡単、ページ番号でジャンプ可 | 大きなOFFSETで遅い、データ変動で重複/欠落 |
| **カーソル** | **OFFSETに依存しない安定した性能**、リアルタイムデータに強い | ページ番号ジャンプ不可 |

無限スクロールではページ番号が不要なので、カーソルベースが最適。

```typescript
// カーソルベースの仕組み
// 1ページ目: cursor なし → 先頭から limit+1 件取得
// 2ページ目: cursor = 前ページ最後のID → そのIDの次から limit+1 件取得

// Prismaの cursor オプションが内部で WHERE id > cursor を生成
// → インデックスを活用した高速なクエリ
```

---

