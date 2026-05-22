# インターフェース定義書

## プロジェクト: AI Theater
作成日: 2026-03-21
担当: tech-leader
Task: A1（準備タスク）

---

## 1. API パス命名規約

### 1.1 規約ルール

| ルール | 説明 | 例 |
|--------|------|-----|
| RESTful 命名 | リソース名は複数形・小文字 | `/api/videos`, `/api/channels` |
| 動的セグメント | `[param]` で表記 | `/api/videos/[id]`, `/api/channels/[slug]` |
| ネストは2階層まで | リソース/ID/サブリソース | `/api/videos/[id]/comments` |
| 動詞エンドポイント | 状態トグル系のみ許容 | `/api/videos/[id]/like`, `/api/channels/[slug]/subscribe` |
| 内部 API | `/api/internal/` プレフィックス | `/api/internal/generate`（Railway Worker 専用） |
| Webhook | `/api/webhooks/` プレフィックス | `/api/webhooks/clerk`, `/api/webhooks/mux` |

### 1.2 全エンドポイント一覧

#### 動画 (Videos)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| GET | `/api/videos` | 動画一覧（ホーム画面メイン） | 不要 | 60 req/60s | home-data-design §2.3 |
| GET | `/api/videos/trending` | トレンド動画 | 不要 | 30 req/60s | home-data-design §2.5 |
| GET | `/api/videos/[id]` | 動画詳細 | 不要 | 60 req/60s | video-player-data-design §3.1 |
| GET | `/api/videos/[id]/comments` | コメント一覧 | 不要 | 60 req/60s | video-player-data-design §3.1 |
| POST | `/api/videos/[id]/comments` | コメント投稿 | 必須 | 5 req/60s | video-player-data-design §3.1 |
| POST | `/api/videos/[id]/like` | いいね/低評価 | 必須 | 10 req/60s | video-player-data-design §3.1 |
| DELETE | `/api/videos/[id]/like` | いいね取り消し | 必須 | 10 req/60s | video-player-data-design §3.1 |
| POST | `/api/videos/[id]/save` | 保存/保存解除 | 必須 | 10 req/60s | video-player-data-design §3.1 |
| GET | `/api/videos/[id]/related` | 関連動画 | 不要 | 30 req/60s | video-player-data-design §3.1 |

#### チャンネル (Channels)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| GET | `/api/channels/[slug]` | チャンネル詳細 | 不要 | 60 req/60s | channel-data-design §3.1 |
| GET | `/api/channels/[slug]/videos` | チャンネル動画一覧 | 不要 | 60 req/60s | channel-data-design §3.1 |
| GET | `/api/channels/[slug]/stats` | AI生成統計 | 不要 | 30 req/60s | channel-data-design §3.1 |
| GET | `/api/channels/[slug]/user-state` | ユーザー固有状態 | 必須 | 60 req/60s | channel-data-design §3.1 |
| POST | `/api/channels/[slug]/subscribe` | 登録/解除トグル | 必須 | 10 req/60s | channel-data-design §3.1 |

#### カテゴリ (Categories)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| GET | `/api/categories` | カテゴリ一覧 | 不要 | 30 req/60s | home-data-design §2.3 |
| GET | `/api/categories/[slug]/videos` | カテゴリ別動画 | 不要 | 30 req/60s | home-data-design §2.3 |

#### 検索 (Search)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| GET | `/api/search` | 動画検索 | 不要 | 30 req/60s | search-data-design §3.1 |
| GET | `/api/search/suggest` | サジェスト候補 | 不要 | 60 req/60s | search-data-design §3.1 |
| GET | `/api/search/popular` | 人気検索ワード | 不要 | 10 req/60s | search-data-design §3.1 |
| GET | `/api/search/history` | 検索履歴取得 | 必須 | 30 req/60s | search-data-design §3.1 |
| DELETE | `/api/search/history` | 検索履歴全削除 | 必須 | 5 req/60s | search-data-design §3.1 |
| DELETE | `/api/search/history/[id]` | 検索履歴個別削除 | 必須 | 10 req/60s | search-data-design §3.1 |

#### ユーザー (Users)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| GET | `/api/users/me` | 現在のユーザー情報 | 必須 | 60 req/60s | auth-data-design §4.1 |
| PATCH | `/api/users/me` | プロフィール更新 | 必須 | 10 req/60s | auth-data-design §4.1 |
| DELETE | `/api/users/me` | アカウント削除（GDPR） | 必須 | 1 req/60s | auth-data-design §4.1 |
| GET | `/api/users/me/subscriptions` | フォロー中チャンネル一覧 | 必須 | 30 req/60s | auth-data-design §4.1 |
| GET | `/api/users/me/saved` | 保存済み動画一覧 | 必須 | 30 req/60s | auth-data-design §4.1 |
| GET | `/api/users/me/history` | 視聴履歴 | 必須 | 30 req/60s | auth-data-design §4.1 |
| DELETE | `/api/users/me/history` | 視聴履歴全削除 | 必須 | 1 req/3600s | auth-data-design §4.1 |

#### 視聴記録 (Views)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| POST | `/api/views` | 視聴記録（進捗更新含む） | 任意 | 30 req/60s | video-player-data-design §3.1 |

#### コメントいいね (Comment Likes)

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| POST | `/api/comments/[id]/like` | コメントいいね | 必須 | 10 req/60s | video-player-data-design §3.1 |

#### Webhook

| メソッド | パス | 説明 | 認証 | Rate Limit | 定義元 |
|---------|------|------|:----:|-----------|--------|
| POST | `/api/webhooks/clerk` | Clerk イベント受信 | Svix 署名 | 制限なし | auth-data-design §3.3 |
| POST | `/api/webhooks/mux` | Mux イベント受信 | Mux 署名 | 制限なし | ai-pipeline-data-design §7 |

---

## 2. Prisma Enum 定義

全 enum の Source of Truth を一覧化する。

### 2.1 Enum 一覧

```prisma
// =============================================
// VideoStatus（動画の公開ステータス）
// 定義元: home-data-design.md §1.2
// =============================================
enum VideoStatus {
  PROCESSING    // AI生成中 or Muxトランスコード中
  READY         // 公開可能
  PUBLISHED     // 公開済み
  FAILED        // 生成失敗
  MODERATION    // モデレーション待ち
  REJECTED      // モデレーション却下
}

// =============================================
// MuxStatus（Mux Asset の処理ステータス）
// 定義元: home-data-design.md §1.2
// =============================================
enum MuxStatus {
  PREPARING
  READY
  ERRORED
}

// =============================================
// LikeType（いいね/低評価の種別）
// 定義元: home-data-design.md §1.2
// =============================================
enum LikeType {
  LIKE
  DISLIKE
}

// =============================================
// UserRole（ユーザーロール）
// 定義元: auth-data-design.md §2.1
// =============================================
enum UserRole {
  USER          // 一般視聴者
  ADMIN         // 管理者（将来の管理画面用）
}

// =============================================
// PromptStatus（生成プロンプトのステータス）
// 定義元: ai-pipeline-data-design.md §2.2
// =============================================
enum PromptStatus {
  PENDING       // 生成待ち
  APPROVED      // 自動承認済み（安全性チェック通過）
  REJECTED      // 安全性チェック不合格
  USED          // 動画生成に使用済み
}

// =============================================
// JobStatus（動画生成ジョブのステータス）
// 定義元: ai-pipeline-data-design.md §2.3
// =============================================
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

// =============================================
// ModerationStatus（コンテンツモデレーション結果）
// 定義元: ai-pipeline-data-design.md §2.3
// =============================================
enum ModerationStatus {
  PENDING       // 未チェック
  PASSED        // 合格
  FLAGGED       // 要確認（軽度の警告）
  REJECTED      // 不合格（公開不可）
}
```

### 2.2 TypeScript 側での Enum 利用

Prisma が自動生成する enum 型を再エクスポートして使用する。

```typescript
// lib/types/enums.ts
// Prisma Client が生成した enum をアプリ全体で使用する

export {
  VideoStatus,
  MuxStatus,
  LikeType,
  UserRole,
  PromptStatus,
  JobStatus,
  ModerationStatus,
} from "@prisma/client";
```

---

## 3. コスト定数

### 3.1 動画生成コスト

```typescript
// lib/constants/costs.ts

/** AI動画生成のコスト定数（USD） */
export const GENERATION_COSTS = {
  /** Flux Schnell による入力画像生成コスト（1枚） */
  IMAGE_GENERATION_USD: 0.03,

  /** Runway Gen-4 Turbo による5秒動画生成コスト */
  RUNWAY_GEN4_TURBO_5S_USD: 0.25,

  /** Veo 3.1 Fast によるフォールバック動画生成コスト（推定） */
  VEO_31_FAST_5S_USD: 0.20,

  /** 1本あたりの推定コスト（画像 + Gen-4 Turbo 5秒） */
  PER_VIDEO_ESTIMATED_USD: 0.28,
} as const;

/** 月間生成枠 */
export const MONTHLY_QUOTA = {
  /** 月間動画生成上限（プラットフォーム全体） */
  MAX_COUNT: 30,

  /** 月間コスト上限目安（USD） */
  COST_BUDGET_USD: 10,
} as const;
```

### 3.2 インフラコスト

```typescript
// lib/constants/infrastructure.ts

/** インフラサービスの月額コスト目安（USD） */
export const INFRASTRUCTURE_COSTS = {
  CLERK_FREE_TIER: 0,           // 10,000 MAU
  SUPABASE_FREE_TIER: 0,       // 500MB DB
  MUX_FREE_TIER: 0,            // 100,000分/月ストリーミング
  VERCEL_FREE_TIER: 0,         // Hobby プラン
  RAILWAY_WORKER: 5,           // Usage-based（月 $5-10）
  UPSTASH_REDIS: 0,            // Free Tier（10,000コマンド/日）
} as const;

/** 月額予算上限 */
export const BUDGET_LIMIT_USD = 50;
```

### 3.3 Rate Limit 定数

```typescript
// lib/constants/rate-limits.ts

/** Rate Limit 設定（Upstash Sliding Window） */
export const RATE_LIMITS = {
  /** 公開読み取り API */
  PUBLIC_READ: { requests: 60, window: "60s" },
  /** 公開読み取り（低頻度） */
  PUBLIC_READ_LOW: { requests: 30, window: "60s" },
  /** 書き込み API（認証必須） */
  WRITE_LIKE: { requests: 10, window: "60s" },
  WRITE_COMMENT: { requests: 5, window: "60s" },
  WRITE_VIEW: { requests: 30, window: "60s" },
  WRITE_SUBSCRIBE: { requests: 10, window: "60s" },
  WRITE_SAVE: { requests: 10, window: "60s" },
  /** ユーザー管理（高制限） */
  USER_DELETE: { requests: 1, window: "60s" },
  HISTORY_DELETE: { requests: 1, window: "3600s" },
  /** 認証済みユーザーの読み取り倍率 */
  AUTHENTICATED_MULTIPLIER: 2,
} as const;
```

---

## 4. 共有 TypeScript 型定義

### 4.1 動画カード型（全画面共通）

```typescript
// lib/types/video.ts

/** 動画カード表示用の共通型（ホーム、検索、チャンネル、関連動画で共用） */
export interface VideoCard {
  id: string;
  title: string;
  muxPlaybackId: string;
  duration: number | null;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  qualityScore: number | null;   // DB値: 0-100
  moods: string[];
  publishedAt: string;           // ISO 8601
  aiModel: string;
  channel: ChannelBrief;
  category: CategoryBrief | null;
}

/** チャンネル簡易情報（VideoCard 内埋め込み用） */
export interface ChannelBrief {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
}

/** カテゴリ簡易情報 */
export interface CategoryBrief {
  name: string;
  slug: string;
}
```

### 4.2 動画詳細型

```typescript
// lib/types/video-detail.ts

import type { VideoCard, ChannelBrief, CategoryBrief } from "./video";

/** 動画再生ページ用の詳細型 */
export interface VideoDetail {
  id: string;
  title: string;
  description: string | null;

  // Mux
  muxPlaybackId: string;
  duration: number | null;

  // AI生成情報
  aiModel: string;
  aiPrompt: string | null;
  aiParams: Record<string, unknown> | null;

  // Quality Score（DB値: 0-100。UI表示時は toDisplayScore() で 0.0-5.0 に変換）
  qualityScore: number | null;
  qualityDetails: QualityDetails | null;

  // ムード
  moods: string[];

  // 集計
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;

  // 日時
  publishedAt: string;           // ISO 8601
  createdAt: string;

  // チャンネル
  channel: ChannelBrief & {
    subscriberCount: number;
  };

  // カテゴリ/タグ
  category: CategoryBrief | null;
  tags: { name: string }[];
}

/** 品質スコア詳細 */
export interface QualityDetails {
  // MVP（2軸）: 常に算出
  likeRatio: number;                  // 0-100
  completionRate: number;             // 0-100

  // 将来実装（v2以降）: MVP では null
  technicalQuality: number | null;    // 0-100
  promptCreativity: number | null;    // 0-100
  commentQuality: number | null;      // 0-100
}

/** ユーザー固有の動画状態（認証時のみ返却） */
export interface UserVideoState {
  likeType: "LIKE" | "DISLIKE" | null;
  isSaved: boolean;
  isSubscribed: boolean;
}

/** 動画詳細 API レスポンス */
export interface VideoDetailResponse {
  video: VideoDetail;
  userState: UserVideoState | null;
}
```

### 4.3 チャンネル型

```typescript
// lib/types/channel.ts

/** チャンネル詳細型 */
export interface ChannelDetail {
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
  totalViewCount: number;          // BigInt → number 変換済み

  // AI 生成統計（集計キャッシュ）
  totalGenerationTimeSec: number;
  totalEstimatedCostUsd: number;
  averageQualityScore: number | null;  // DB: 0-100

  createdAt: string;               // ISO 8601
}

/** ユーザー固有のチャンネル状態 */
export interface UserChannelState {
  isSubscribed: boolean;
  subscribedAt: string | null;     // ISO 8601
}

/** チャンネル詳細 API レスポンス */
export interface ChannelDetailResponse {
  channel: ChannelDetail;
  userState: UserChannelState | null;
}

/** チャンネル動画一覧 API レスポンス */
export interface ChannelVideosResponse {
  videos: import("./video").VideoCard[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

/** チャンネル登録トグル API レスポンス */
export interface SubscribeResponse {
  isSubscribed: boolean;
  subscriberCount: number;
}

/** チャンネル AI 生成統計 API レスポンス */
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
  month: string;                   // "2026-01" 形式
  count: number;
}
```

### 4.4 コメント型

```typescript
// lib/types/comment.ts

/** コメントスレッド型 */
export interface CommentThread {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  user: CommentUser;
  replies: CommentReply[];
  replyCount: number;
  isLiked: boolean;                // 認証ユーザーの状態
}

/** コメント返信型 */
export interface CommentReply {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  user: CommentUser;
  isLiked: boolean;
}

/** コメント内のユーザー情報 */
export interface CommentUser {
  id: string;
  name: string;
  imageUrl: string | null;
}

/** コメント一覧 API レスポンス */
export interface CommentsResponse {
  comments: CommentThread[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

/** コメント投稿リクエスト */
export interface CreateCommentRequest {
  body: string;                    // 1-1000文字
  parentId?: string;               // 返信先コメントID
}

/** コメント投稿レスポンス */
export interface CreateCommentResponse {
  comment: CommentThread | CommentReply;
}
```

### 4.5 検索型

```typescript
// lib/types/search.ts

import type { VideoCard, ChannelBrief, CategoryBrief } from "./video";

/** 検索結果型 */
export interface SearchResult extends VideoCard {
  relevanceScore: number;          // pg_trgm 類似度 (0.0-1.0)
  tags: { name: string }[];
}

/** 検索 API レスポンス */
export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  totalPages: number;
  query: string;
  filters: AppliedFilters;
}

/** 適用済みフィルタ */
export interface AppliedFilters {
  sort: SearchSortType;
  duration: DurationFilter;
  date: DateFilter;
  model: string | null;
  categorySlug: string | null;
  mood: string | null;
}

/** 検索ソート種別 */
export type SearchSortType = "relevance" | "date" | "views" | "rating";

/** 再生時間フィルタ */
export type DurationFilter = "any" | "short" | "medium" | "long";

/** 日付フィルタ */
export type DateFilter = "any" | "today" | "week" | "month" | "year";

/** サジェスト API レスポンス */
export interface SuggestResponse {
  suggestions: SuggestItem[];
}

/** サジェスト候補 */
export interface SuggestItem {
  type: "video" | "channel" | "history";
  text: string;
  videoId?: string;
  muxPlaybackId?: string;
  channelSlug?: string;
  avatarUrl?: string;
}
```

### 4.6 ユーザー型

```typescript
// lib/types/user.ts

/** ユーザープロフィール */
export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  createdAt: string;               // ISO 8601
  subscriptionCount: number;
  savedVideoCount: number;
  commentCount: number;
}

/** プロフィール API レスポンス */
export interface UserProfileResponse {
  user: UserProfile;
}

/** プロフィール更新リクエスト */
export interface UpdateProfileRequest {
  name: string;                    // 1-50文字
}
```

### 4.7 共通ページネーション型

```typescript
// lib/types/pagination.ts

/** カーソルベースのページネーション（ホーム、チャンネル動画、コメント） */
export interface CursorPaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** オフセットベースのページネーション（検索結果） */
export interface OffsetPaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  totalPages: number;
}
```

### 4.8 推薦理由型

```typescript
// lib/types/recommendation.ts

/** 推薦理由のタイプ（6種） */
export type RecommendationReasonType =
  | "quality"
  | "trending"
  | "new"
  | "subscription"
  | "model_preference"
  | "category"
  | "mood"
  | "explore";

/** 推薦理由 */
export interface RecommendationReason {
  type: RecommendationReasonType;
  text: string;
  icon: string;                    // Lucide icon name
}
```

### 4.9 関連動画型

```typescript
// lib/types/related-videos.ts

import type { VideoCard } from "./video";

/** 関連動画 API レスポンス（3セクション構成） */
export interface RelatedVideosResponse {
  /** 次に見る: カテゴリ/ムード類似の高品質動画 */
  upNext: VideoCard[];
  /** 同じAIモデルの動画 */
  sameModel: {
    modelName: string;
    videos: VideoCard[];
  };
  /** AI Creator の他の動画 */
  sameChannel: {
    channelName: string;
    channelSlug: string;
    videos: VideoCard[];
  };
}
```

### 4.10 動画生成パイプライン型

```typescript
// lib/types/pipeline.ts

/** BullMQ ジョブデータ: プロンプト生成 */
export interface GeneratePromptJobData {
  type: "generate-prompt";
  channelId: string;
  scheduleId?: string;
}

/** BullMQ ジョブデータ: 画像生成（2段パイプライン Step 1） */
export interface GenerateImageJobData {
  type: "generate-image";
  generationJobId: string;
  promptId: string;
  channelId: string;
  videoPrompt: string;
  imageModel: string;              // "flux-schnell" | "sdxl-turbo"
}

/** BullMQ ジョブデータ: 動画生成（2段パイプライン Step 2） */
export interface GenerateVideoJobData {
  type: "generate-video";
  generationJobId: string;
  promptId: string;
  channelId: string;
  aiModel: string;                 // "runway-gen4-turbo" | "veo-3.1-fast"
  videoPrompt: string;
  promptImage: string;             // 入力画像URL（Gen-4 Turbo 用。Veo の場合は空文字列）
  duration: number;
  isRetry: boolean;
  retryCount: number;
}

/** BullMQ ジョブデータ: Mux アップロード */
export interface UploadToMuxJobData {
  type: "upload-to-mux";
  generationJobId: string;
  outputUrl: string;
  title: string;
  channelId: string;
}

/** BullMQ ジョブデータの union 型 */
export type VideoGenerationJobData =
  | GeneratePromptJobData
  | GenerateImageJobData
  | GenerateVideoJobData
  | UploadToMuxJobData;
```

### 4.11 いいね・視聴・保存リクエスト型

```typescript
// lib/types/interactions.ts

/** いいねリクエスト */
export interface LikeRequest {
  type: "LIKE" | "DISLIKE";
}

/** 視聴記録リクエスト */
export interface CreateViewRequest {
  videoId: string;
  watchedSeconds: number;
}
```

---

## 5. フィールド名マッピング（Source of Truth）

UI/UX 設計と DB/API 設計でフィールド名が異なる箇所を明示する。**DB/API 側が Source of Truth** とする。

| UI/UX 設計側 | DB/API 側（Source of Truth） | 定義元 |
|-------------|---------------------------|--------|
| `displayName` | `name` | auth-data-design §3.3 (CONS-ISSUE-2) |
| `avatarUrl` | `imageUrl` | auth-data-design §3.3 (CONS-ISSUE-2) |
| Quality Score 表示値 `0.0-5.0` | DB値 `0-100` | video-player-data-design §3.2 |

**変換ユーティリティ:**

```typescript
// lib/utils/quality-score.ts

/** DB値 (0-100) → 表示値 (0.0-5.0) に変換 */
export function toDisplayScore(dbScore: number): number {
  return Math.round((dbScore / 20) * 10) / 10;
}

/** 表示値 (0.0-5.0) → DB値 (0-100) に変換 */
export function toDbScore(displayScore: number): number {
  return Math.round(displayScore * 20);
}
```

---

## 6. 型定義インデックス

```typescript
// lib/types/index.ts

export type { VideoCard, ChannelBrief, CategoryBrief } from "./video";
export type {
  VideoDetail,
  QualityDetails,
  UserVideoState,
  VideoDetailResponse,
} from "./video-detail";
export type {
  ChannelDetail,
  UserChannelState,
  ChannelDetailResponse,
  ChannelVideosResponse,
  SubscribeResponse,
  ChannelStatsResponse,
  MoodStat,
  ModelStat,
  MonthlyCount,
} from "./channel";
export type {
  CommentThread,
  CommentReply,
  CommentUser,
  CommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
} from "./comment";
export type {
  SearchResult,
  SearchResponse,
  AppliedFilters,
  SearchSortType,
  DurationFilter,
  DateFilter,
  SuggestResponse,
  SuggestItem,
} from "./search";
export type {
  UserProfile,
  UserProfileResponse,
  UpdateProfileRequest,
} from "./user";
export type {
  CursorPaginatedResponse,
  OffsetPaginatedResponse,
} from "./pagination";
export type {
  RecommendationReasonType,
  RecommendationReason,
} from "./recommendation";
export type { RelatedVideosResponse } from "./related-videos";
export type {
  GeneratePromptJobData,
  GenerateImageJobData,
  GenerateVideoJobData,
  UploadToMuxJobData,
  VideoGenerationJobData,
} from "./pipeline";
export type {
  LikeRequest,
  CreateViewRequest,
} from "./interactions";
```

---

## 7. 整合性メモ

### 7.1 ページ URL 一覧

| ページ | URL | レンダリング | revalidate |
|--------|-----|------------|-----------|
| ホーム | `/` | SSR + ISR | 60s |
| 動画再生 | `/watch/[id]` | SSR + ISR | 3600s |
| チャンネル | `/channel/[slug]` | SSR + ISR | 300s |
| 検索 | `/search?q=...` | SSR（キャッシュなし） | 0 |
| カテゴリ | `/category/[slug]` | SSR + ISR | 60s |
| 設定 | `/settings` | CSR | - |

### 7.2 認証フロー

```
Clerk（外部 SaaS）
  → Google OAuth / GitHub OAuth（MVP）
  → JWT + Svix Webhook → Supabase users テーブル同期
  → アプリ内部は Prisma User.id（CUID）で操作
  → clerkId は Webhook 受信・auth() 解決時のみ使用
```

### 7.3 全文検索エンジン

- **pg_trgm**（トライグラム）採用。Supabase Free Tier で利用可能。コスト $0。
- 1-2文字クエリ: `ILIKE` フォールバック
- 3文字以上: `pg_trgm` 類似検索 + GIN インデックス

### 7.4 データ検証の共通ルール

| 対象 | ルール |
|------|--------|
| コメント本文 | 1-1000文字、HTMLタグ除去 |
| 表示名 | 1-50文字、trim |
| 検索クエリ | 1-100文字 |
| limit パラメータ | 最大50（デフォルト20） |
| cursor | 存在する CUID であること |
