# 統合 Prisma スキーマ

## プロジェクト: AI Theater
作成日: 2026-03-21
担当: tech-leader
Task: A5（準備タスク）

---

## 1. 概要

本ドキュメントは、全6画面の詳細設計で個別に定義された Prisma モデルを統合した **単一の Source of Truth** スキーマである。

### 1.1 統合元ドキュメント

| 画面/機能 | 定義元 | 定義されたモデル |
|-----------|--------|----------------|
| ホーム画面 | home-data-design.md §1.2 | User, AIChannel, Video, Category, Tag, VideoTag, Comment, Like, View, SavedVideo, Subscription |
| 動画再生ページ | video-player-data-design.md §2 | CommentLike |
| AIチャンネル | channel-data-design.md §2 | AIChannel 拡張（supportedModels, specializations, 生成統計） |
| 認証・ユーザー管理 | auth-data-design.md §2 | User 拡張（email, role, isActive, deletedAt） |
| 検索機能 | search-data-design.md §4 | SearchHistory, PopularSearch |
| AI動画生成パイプライン | ai-pipeline-data-schema.md §2 | GenerationSchedule, GenerationPrompt, GenerationJob, MonthlyQuota |

### 1.2 統合方針

- 各画面で段階的に拡張されたフィールドを **最新・最も拡張された定義** に統合
- フィールド名は **DB/API 側が Source of Truth**（参照: interface-definitions.md §5）
- Enum は interface-definitions.md §2 で一覧化済み
- インデックスは各画面のパフォーマンス設計を反映

---

## 2. 統合スキーマ

```prisma
// ===========================================================
//  AI Theater — 統合 Prisma スキーマ
//  Source of Truth: docs/detailed-design/common/unified-prisma-schema.md
//
//  統合元:
//    - home-data-design.md      (User, AIChannel, Video, Category, Tag, etc.)
//    - video-player-data-design.md  (CommentLike)
//    - channel-data-design.md   (AIChannel 拡張)
//    - auth-data-design.md      (User 拡張)
//    - search-data-design.md    (SearchHistory, PopularSearch)
//    - ai-pipeline-data-schema.md   (GenerationSchedule, GenerationPrompt, GenerationJob, MonthlyQuota)
// ===========================================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")          // Supabase Connection Pooling (Transaction mode)
  directUrl = env("DIRECT_DATABASE_URL")   // Supabase Direct Connection (Migrations用)
}

// =============================================================================
// Enums
// =============================================================================

enum UserRole {
  USER          // 一般視聴者
  ADMIN         // 管理者（将来の管理画面用）
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

enum LikeType {
  LIKE
  DISLIKE
}

enum PromptStatus {
  PENDING       // 生成待ち
  APPROVED      // 自動承認済み（安全性チェック通過）
  REJECTED      // 安全性チェック不合格
  USED          // 動画生成に使用済み
}

enum JobStatus {
  QUEUED            // BullMQ キューに投入済み
  PROMPT_GENERATING // プロンプト生成中（LLM）
  IMAGE_GENERATING  // 入力画像生成中（Flux Schnell → Gen-4 Turbo 用）
  GENERATING        // AI動画生成中
  MODERATING        // コンテンツ安全性チェック中
  UPLOADING         // Mux にアップロード中
  TRANSCODING       // Mux トランスコード中
  PUBLISHING        // メタデータ登録・公開処理中
  COMPLETED         // 正常完了
  FAILED            // 失敗（リトライ上限到達）
  CANCELLED         // 手動キャンセル
}

enum ModerationStatus {
  PENDING       // 未チェック
  PASSED        // 合格
  FLAGGED       // 要確認（軽度の警告）
  REJECTED      // 不合格（公開不可）
}

// =============================================================================
// User（Clerkから同期）
// 定義元: home-data-design.md §1.2 + auth-data-design.md §2.1
// =============================================================================
model User {
  id        String     @id @default(cuid())
  clerkId   String     @unique                // Clerk User ID（"user_xxx" 形式）
  name      String                            // 表示名（Clerk first_name + last_name）
  email     String?                           // メールアドレス（Clerk から同期、通知用）
  imageUrl  String?                           // プロフィール画像URL
  role      UserRole   @default(USER)         // ロール（将来の管理者機能用）

  // アカウント状態
  isActive  Boolean    @default(true)         // アカウント有効フラグ
  deletedAt DateTime?                         // 論理削除日時（GDPR 対応、30日後物理削除）

  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  // リレーション
  comments        Comment[]
  likes           Like[]
  views           View[]
  savedVideos     SavedVideo[]
  subscriptions   Subscription[]
  commentLikes    CommentLike[]
  searchHistories SearchHistory[]

  @@index([clerkId])
  @@index([email])
  @@index([isActive])
  @@map("users")
}

// =============================================================================
// AIChannel（AI投稿者 = 仮想チャンネル）
// 定義元: home-data-design.md §1.2 + channel-data-design.md §2.1
// =============================================================================
model AIChannel {
  id          String   @id @default(cuid())
  name        String                          // "Aurora", "Nexus", "Prism" 等
  slug        String   @unique                // URL用スラッグ
  description String?
  avatarUrl   String?                         // AI生成アバター画像URL
  bannerUrl   String?                         // バナー画像URL
  accentColor String?                         // チャンネル固有カラー (#hex)

  // AI エージェント仕様
  aiModel          String                     // 主に使用するAIモデル名
  supportedModels  String[]                   // サポートモデル一覧 ["runway-gen4-turbo", "veo-3.1-fast"]
  themes           String[]                   // 得意ジャンル ["自然", "風景"]
  specializations  String[]                   // 専門領域 ["cinematic", "animation"]

  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // リレーション
  videos              Video[]
  subscribers         Subscription[]
  generationSchedule  GenerationSchedule?
  generationPrompts   GenerationPrompt[]
  generationJobs      GenerationJob[]

  // 集計キャッシュ（パフォーマンス用）— 基本統計
  videoCount      Int    @default(0)
  subscriberCount Int    @default(0)
  totalViewCount  BigInt @default(0)

  // 集計キャッシュ — AI 生成統計
  totalGenerationTimeSec  Int    @default(0)   // 総生成時間（秒）
  totalEstimatedCostUsd   Float  @default(0)   // 推定総コスト（USD）
  averageQualityScore     Float?               // 平均品質スコア（0-100）

  @@index([slug])
  @@index([isActive, createdAt])
  @@map("ai_channels")
}

// =============================================================================
// Video（動画メタデータ）
// 定義元: home-data-design.md §1.2 + channel-data-design.md §2.3
// =============================================================================
model Video {
  id          String      @id @default(cuid())
  title       String
  description String?

  // Mux関連
  muxAssetId    String    @unique             // Mux Asset ID
  muxPlaybackId String    @unique             // Mux Playback ID（再生・サムネイル用）
  muxStatus     MuxStatus @default(PREPARING) // Mux処理ステータス

  duration    Int?                            // 動画長（秒）

  // AI生成情報
  aiModel     String                          // 使用AIモデル (e.g. "runway-gen4-turbo")
  aiPrompt    String?                         // 生成プロンプト
  aiParams    Json?                           // 生成パラメータ（JSON）

  // 品質スコア（DB値: 0-100。UI表示時は toDisplayScore() で 0.0-5.0 に変換）
  qualityScore   Float?                       // 5軸複合スコア（0-100）
  qualityDetails Json?                        // { likeRatio, completionRate, technicalQuality?, promptCreativity?, commentQuality? }

  // ムード（雰囲気タグ）
  moods       String[]                        // ["calm", "energetic", "dreamy", "fun", "zen", "mystic"]

  // 公開制御
  status      VideoStatus @default(PROCESSING)
  publishedAt DateTime?                       // 公開日時（nullなら未公開）

  // AI生成メトリクス（channel-data-design.md §2.3 追加）
  generationTimeSec  Int?                     // 生成にかかった時間（秒）
  estimatedCostUsd   Float?                   // 推定生成コスト（USD）

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

  // AI生成ジョブとの紐付け（人間アップロード防止の第3層）
  generationJob GenerationJob?

  // 集計キャッシュ（パフォーマンス用）
  viewCount    BigInt @default(0)
  likeCount    Int    @default(0)
  dislikeCount Int    @default(0)
  commentCount Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([channelId])
  @@index([categoryId])
  @@index([status, publishedAt])              // 公開動画の新着順取得
  @@index([status, viewCount])                // 公開動画の人気順取得
  @@index([status, publishedAt, viewCount])   // トレンド計算用
  @@index([status, qualityScore])             // 品質スコア順取得
  @@index([muxPlaybackId])
  @@map("videos")
}

// =============================================================================
// Category（カテゴリ）
// 定義元: home-data-design.md §1.2
// =============================================================================
model Category {
  id    String @id @default(cuid())
  name  String @unique                       // "音楽", "ゲーム", "教育" 等
  slug  String @unique                       // URL用スラッグ
  icon  String?                              // Lucide icon名

  videos Video[]

  @@map("categories")
}

// =============================================================================
// Tag（タグ）
// 定義元: home-data-design.md §1.2
// =============================================================================
model Tag {
  id   String @id @default(cuid())
  name String @unique

  videos VideoTag[]

  @@map("tags")
}

// =============================================================================
// VideoTag（動画-タグ中間テーブル）
// 定義元: home-data-design.md §1.2
// =============================================================================
model VideoTag {
  videoId String
  tagId   String
  video   Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  tag     Tag   @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([videoId, tagId])
  @@index([tagId])
  @@map("video_tags")
}

// =============================================================================
// Comment（コメント — スレッド型）
// 定義元: home-data-design.md §1.2
// =============================================================================
model Comment {
  id        String   @id @default(cuid())
  body      String                            // 1-1000文字

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId   String
  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  // スレッド返信
  parentId  String?
  parent    Comment?  @relation("CommentThread", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("CommentThread")

  // 集計キャッシュ
  likeCount Int      @default(0)

  // コメントいいね
  commentLikes CommentLike[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([videoId, createdAt])               // 動画別コメント新着順
  @@index([videoId, likeCount])               // 動画別コメント人気順
  @@index([parentId])
  @@map("comments")
}

// =============================================================================
// CommentLike（コメントのいいね）
// 定義元: video-player-data-design.md §2.1
// =============================================================================
model CommentLike {
  id        String   @id @default(cuid())

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  commentId String
  comment   Comment  @relation(fields: [commentId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, commentId])               // 1ユーザー1コメントに1回
  @@index([commentId])
  @@map("comment_likes")
}

// =============================================================================
// Like（動画のいいね / 低評価）
// 定義元: home-data-design.md §1.2
// =============================================================================
model Like {
  id      String   @id @default(cuid())
  type    LikeType                            // LIKE or DISLIKE

  userId  String
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId String
  video   Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, videoId])                 // 1ユーザー1動画に1回
  @@index([videoId])
  @@map("likes")
}

// =============================================================================
// View（視聴記録）
// 定義元: home-data-design.md §1.2
// =============================================================================
model View {
  id      String   @id @default(cuid())

  userId  String?                             // 未ログインユーザーはnull
  user    User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  videoId String
  video   Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  watchedSeconds Int @default(0)              // 視聴秒数

  createdAt DateTime @default(now())

  @@index([videoId, createdAt])               // 再生回数集計用
  @@index([userId, createdAt])                // 視聴履歴用
  @@map("views")
}

// =============================================================================
// SavedVideo（あとで見る / お気に入り）
// 定義元: home-data-design.md §1.2
// =============================================================================
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

// =============================================================================
// Subscription（チャンネル登録）
// 定義元: home-data-design.md §1.2
// =============================================================================
model Subscription {
  id        String @id @default(cuid())

  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)

  notify    Boolean @default(true)            // 通知ON/OFF

  createdAt DateTime @default(now())

  @@unique([userId, channelId])
  @@index([channelId])
  @@map("subscriptions")
}

// =============================================================================
// SearchHistory（検索履歴）
// 定義元: search-data-design.md §4.1
// =============================================================================
model SearchHistory {
  id        String   @id @default(cuid())

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  query     String                            // 検索キーワード
  resultCount Int    @default(0)              // 検索結果件数

  createdAt DateTime @default(now())

  @@index([userId, createdAt])                // ユーザー別の検索履歴取得
  @@index([query, createdAt])                 // 人気検索ワード集計用
  @@map("search_histories")
}

// =============================================================================
// PopularSearch（人気検索ワード — 集計キャッシュ）
// 定義元: search-data-design.md §4.2
// =============================================================================
model PopularSearch {
  id        String   @id @default(cuid())

  query     String   @unique                  // 検索キーワード（正規化済み）
  count     Int      @default(0)              // 集計期間内の検索回数
  period    String   @default("weekly")       // 集計期間: "daily" | "weekly"

  updatedAt DateTime @updatedAt

  @@index([period, count])                    // 期間別人気順取得
  @@map("popular_searches")
}

// =============================================================================
// GenerationSchedule（AIチャンネル別の生成スケジュール）
// 定義元: ai-pipeline-data-schema.md §2.1
// =============================================================================
model GenerationSchedule {
  id        String   @id @default(cuid())

  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id])

  cronExpression String                       // Cron 式 (e.g. "0 9 * * *" = 毎日9時)
  timezone       String   @default("Asia/Tokyo")
  isActive       Boolean  @default(true)      // スケジュール有効/無効

  // 生成パラメータ
  defaultModel    String  @default("runway-gen4-turbo")  // デフォルトAIモデル
  defaultDuration Int     @default(10)                    // デフォルト生成秒数

  lastTriggeredAt DateTime?
  nextTriggerAt   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([channelId])                       // 1チャンネル1スケジュール
  @@index([isActive, nextTriggerAt])
  @@map("generation_schedules")
}

// =============================================================================
// GenerationPrompt（LLM が生成したプロンプトセット）
// 定義元: ai-pipeline-data-schema.md §2.2
// =============================================================================
model GenerationPrompt {
  id        String   @id @default(cuid())

  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id])

  // LLM 生成メタデータ
  llmModel     String                         // 使用LLM (e.g. "claude-sonnet-4-6")
  systemPrompt String                         // LLM に渡したシステムプロンプト
  rawResponse  String                         // LLM の生の応答（デバッグ用）

  // 解析済みプロンプト
  videoPrompt  String                         // 動画生成AIに渡すプロンプト
  title        String                         // 動画タイトル
  description  String                         // 動画説明文
  tags         String[]                       // タグ候補
  categorySlug String?                        // カテゴリスラッグ
  moods        String[]                       // ムード候補
  theme        String?                        // テーマ/コンセプト説明

  // 画像生成結果（2段パイプライン: Text to Image → Image to Video）
  inputImageUrl   String?                     // 生成された入力画像URL（Flux Schnell 等）
  inputImageModel String?                     // 使用した画像生成モデル (e.g. "flux-schnell")

  status   PromptStatus @default(PENDING)

  createdAt DateTime @default(now())

  // リレーション
  generationJob GenerationJob?

  @@index([channelId, status])
  @@index([status, createdAt])
  @@map("generation_prompts")
}

// =============================================================================
// GenerationJob（動画生成ジョブの状態管理）
// 定義元: ai-pipeline-data-schema.md §2.3
// =============================================================================
model GenerationJob {
  id        String   @id @default(cuid())

  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id])

  promptId  String   @unique
  prompt    GenerationPrompt @relation(fields: [promptId], references: [id])

  // AI動画生成
  aiModel         String                      // 実際に使用したAIモデル
  aiRequestId     String?                     // 外部API のリクエストID（Runway task ID 等）
  aiRequestParams Json?                       // APIリクエストパラメータ（JSON）
  aiResponseRaw   Json?                       // APIレスポンス生データ（デバッグ用）

  // 生成結果
  outputUrl       String?                     // 生成された動画の一時URL
  outputDuration  Int?                        // 生成された動画の長さ（秒）
  outputResolution String?                    // 解像度 (e.g. "1280x768")

  // コスト・パフォーマンス
  generationTimeSec Int?                      // 生成にかかった時間（秒）
  estimatedCostUsd  Float?                    // 推定コスト（USD）
  retryCount        Int     @default(0)       // リトライ回数

  // モデレーション
  moderationStatus ModerationStatus @default(PENDING)
  moderationResult Json?                      // モデレーション結果の詳細

  // Mux アップロード
  muxUploadId   String?                       // Mux Upload ID
  muxAssetId    String?                       // Mux Asset ID（トランスコード完了後）

  // ジョブ状態
  status       JobStatus @default(QUEUED)
  failReason   String?                        // 失敗理由
  startedAt    DateTime?                      // 処理開始日時
  completedAt  DateTime?                      // 処理完了日時

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // 生成された Video レコード
  videoId String?  @unique
  video   Video?   @relation(fields: [videoId], references: [id])

  @@index([channelId, status])
  @@index([status, createdAt])
  @@index([aiModel, status])
  @@map("generation_jobs")
}

// =============================================================================
// MonthlyQuota（月間生成枠の管理）
// 定義元: ai-pipeline-data-schema.md §2.5
// =============================================================================
model MonthlyQuota {
  id        String   @id @default(cuid())

  yearMonth String   @unique                  // "2026-03" 形式
  maxCount  Int      @default(30)             // 月間上限（固定30本）
  usedCount Int      @default(0)              // 使用済み本数
  totalCostUsd Float @default(0)              // 月間累計コスト

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("monthly_quotas")
}
```

---

## 3. 統合時の整合性チェック結果

### 3.1 フィールド統合で解消した差分

| モデル | フィールド | home-data | 拡張元 | 統合結果 |
|--------|-----------|-----------|--------|---------|
| User | email | なし | auth §2.1 | **採用** |
| User | role | なし | auth §2.1 | **採用**（UserRole enum） |
| User | isActive | なし | auth §2.1 | **採用** |
| User | deletedAt | なし | auth §2.1 | **採用**（GDPR 論理削除） |
| User | commentLikes | なし | video-player §2.1 | **採用** |
| User | searchHistories | なし | search §4.3 | **採用** |
| AIChannel | supportedModels | なし | channel §2.1 | **採用** |
| AIChannel | specializations | なし | channel §2.1 | **採用** |
| AIChannel | 生成統計3フィールド | なし | channel §2.1 | **採用** |
| AIChannel | generation* リレーション | なし | ai-pipeline §2.4 | **採用** |
| Video | generationTimeSec | なし | channel §2.3 | **採用** |
| Video | estimatedCostUsd | なし | channel §2.3 | **採用** |
| Video | generationJob | なし | ai-pipeline §2.4 | **採用** |
| Comment | commentLikes | なし | video-player §2.2 | **採用** |

### 3.2 矛盾なし確認

| 確認項目 | 結果 |
|---------|------|
| 同名フィールドの型不一致 | なし |
| リレーション方向の矛盾 | なし |
| @@map テーブル名の重複 | なし |
| @@unique 制約の矛盾 | なし |
| onDelete 戦略の不整合 | なし |
| Enum 値の重複定義 | なし（全 enum を冒頭で一元定義） |

### 3.3 CONS-ISSUE-2 対応

| UI/UX 設計側 | 本スキーマのフィールド名 | 備考 |
|-------------|----------------------|------|
| `displayName` | `User.name` | auth-data-design §3.3 が Source of Truth |
| `avatarUrl` | `User.imageUrl` | 同上 |

---

## 4. モデル一覧サマリー

| # | モデル | テーブル名 | レコード増加頻度 | 主要インデックス数 |
|---|--------|-----------|:-----------:|:----------:|
| 1 | User | users | 低 | 3 |
| 2 | AIChannel | ai_channels | 極低（シード） | 2 |
| 3 | Video | videos | 低（月30本） | 6 |
| 4 | Category | categories | 極低（シード） | 0（@unique のみ） |
| 5 | Tag | tags | 低 | 0（@unique のみ） |
| 6 | VideoTag | video_tags | 低 | 1 |
| 7 | Comment | comments | 中 | 3 |
| 8 | CommentLike | comment_likes | 中 | 1 |
| 9 | Like | likes | 中 | 1 |
| 10 | View | views | 高 | 2 |
| 11 | SavedVideo | saved_videos | 低 | 1 |
| 12 | Subscription | subscriptions | 低 | 1 |
| 13 | SearchHistory | search_histories | 中 | 2 |
| 14 | PopularSearch | popular_searches | 低（バッチ） | 1 |
| 15 | GenerationSchedule | generation_schedules | 極低 | 1 |
| 16 | GenerationPrompt | generation_prompts | 低（月30件） | 2 |
| 17 | GenerationJob | generation_jobs | 低（月30件） | 3 |
| 18 | MonthlyQuota | monthly_quotas | 極低（月1件） | 0（@unique のみ） |

**合計: 18モデル、7 enum**

---

## 5. ER図（統合版）

```
User (Clerk同期)
  ├── 1:N → Comment → 1:N → CommentLike ← N:1 User
  ├── 1:N → Like
  ├── 1:N → View
  ├── 1:N → SavedVideo
  ├── 1:N → SearchHistory
  ├── 1:N → CommentLike
  └── M:N → AIChannel (Subscription)

AIChannel
  ├── 1:N → Video
  ├── M:N → User (Subscription)
  ├── 1:1 → GenerationSchedule
  ├── 1:N → GenerationPrompt
  └── 1:N → GenerationJob

Video
  ├── N:1 → AIChannel
  ├── N:1 → Category (optional)
  ├── M:N → Tag (VideoTag)
  ├── 1:N → Comment
  ├── 1:N → Like
  ├── 1:N → View
  ├── 1:N → SavedVideo
  └── 1:1 → GenerationJob (optional)

GenerationPrompt
  ├── N:1 → AIChannel
  └── 1:1 → GenerationJob

GenerationJob
  ├── N:1 → AIChannel
  ├── 1:1 → GenerationPrompt
  └── 1:1 → Video (optional, 生成完了後に紐付け)

Category ── 1:N → Video
Tag ── M:N → Video (VideoTag)
MonthlyQuota (独立テーブル)
PopularSearch (独立テーブル)
```

---

## 6. マイグレーション・シードデータに関する注記

### 6.1 pg_trgm 拡張

検索機能（search-data-design.md §2）で `pg_trgm` を使用するため、初回マイグレーション時に以下を実行する必要がある。

```sql
-- Supabase SQL Editor または migration ファイルで実行
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN インデックスの作成（Prisma では直接定義不可）
CREATE INDEX idx_videos_title_trgm ON videos USING gin (title gin_trgm_ops);
CREATE INDEX idx_videos_description_trgm ON videos USING gin (description gin_trgm_ops);
CREATE INDEX idx_ai_channels_name_trgm ON ai_channels USING gin (name gin_trgm_ops);
CREATE INDEX idx_tags_name_trgm ON tags USING gin (name gin_trgm_ops);
```

### 6.2 シードデータ

初期データとして以下のレコードが必要:

| テーブル | 件数 | 内容 |
|---------|:----:|------|
| ai_channels | 3 | Aurora, Nexus, Prism |
| categories | 8-10 | 音楽, ゲーム, 教育, 自然, テクノロジー, アート, etc. |
| generation_schedules | 3 | 各チャンネル1件（1日1回トリガー） |
| monthly_quotas | 1 | 当月分（maxCount: 30） |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-21 | 1.0 | 全6画面の詳細設計から統合。18モデル・7 enum の統一スキーマを作成 | tech-leader |
