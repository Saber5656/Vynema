# 動画再生ページ: API・クエリ最適化

> 元ファイル: [video-player-data-design.md](video-player-data-design.md) から分割（§3-4）

---

## 3. API エンドポイント設計

### 3.1 エンドポイント一覧

| メソッド | パス | 説明 | 認証 | Rate Limit |
|---------|------|------|:----:|-----------|
| GET | `/api/videos/[id]` | 動画詳細 | 不要 | 60 req/60s |
| GET | `/api/videos/[id]/comments` | コメント一覧 | 不要 | 60 req/60s |
| POST | `/api/videos/[id]/comments` | コメント投稿 | 必須 | 5 req/60s |
| POST | `/api/videos/[id]/like` | いいね/低評価 | 必須 | 10 req/60s |
| DELETE | `/api/videos/[id]/like` | いいね取り消し | 必須 | 10 req/60s |
| POST | `/api/videos/[id]/save` | 保存/保存解除 | 必須 | 10 req/60s |
| POST | `/api/views` | 視聴記録（進捗更新含む） | 任意 | 30 req/60s |
| GET | `/api/videos/[id]/related` | 関連動画 | 不要 | 30 req/60s |
| POST | `/api/comments/[id]/like` | コメントいいね | 必須 | 10 req/60s |

### 3.2 動画詳細 API: `GET /api/videos/[id]`

**レスポンス型:**

```typescript
interface VideoDetailResponse {
  video: VideoDetail;
  userState: UserVideoState | null; // 認証時のみ
}

interface VideoDetail {
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
  publishedAt: string; // ISO 8601
  createdAt: string;

  // チャンネル
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
    subscriberCount: number;
  };

  // カテゴリ/タグ
  category: { name: string; slug: string } | null;
  tags: { name: string }[];
}

interface QualityDetails {
  // ---- MVP（2軸）: 常に算出 ----
  likeRatio: number;                  // 0-100: いいね率（likeCount / viewCount）
  completionRate: number;             // 0-100: 視聴完了率（Mux Data 由来）

  // ---- 将来実装（v2以降）: MVP では null を返却 ----
  technicalQuality: number | null;    // 0-100: 映像品質自動評価（解像度・ノイズ等）
  promptCreativity: number | null;    // 0-100: プロンプト多様性スコア
  commentQuality: number | null;      // 0-100: コメントエンゲージメント品質

  // ---- 移行方針 ----
  // MVP では likeRatio・completionRate の2軸で totalScore を算出する。
  // 残り3軸（technicalQuality, promptCreativity, commentQuality）は DB に null を格納し、
  // UI では null の場合「計測中」バッジを表示して非表示扱いとする。
  // v2 以降、各軸が実装され次第 null → number に移行する。
}

// ユーザー固有の状態（認証時のみ返却）
interface UserVideoState {
  likeType: "LIKE" | "DISLIKE" | null; // 現在のいいね状態
  isSaved: boolean;                     // 保存済みか
  isSubscribed: boolean;                // チャンネル登録済みか
}
```

### 3.3 コメント一覧 API: `GET /api/videos/[id]/comments`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `cursor` | string | - | カーソル（最後のコメントID） |
| `limit` | number | 20 | 取得件数（最大50） |
| `sort` | enum | "newest" | ソート: newest / popular |

**レスポンス型:**

```typescript
interface CommentsResponse {
  comments: CommentThread[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number; // Video.commentCount から取得（キャッシュ値）
}

interface CommentThread {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  user: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  // スレッドの返信（最初の3件のみ。展開時は別リクエスト）
  replies: CommentReply[];
  replyCount: number; // 全返信数
  // ユーザー状態（認証時）
  isLiked: boolean;
}

interface CommentReply {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string;
  user: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  isLiked: boolean;
}
```

### 3.4 コメント投稿 API: `POST /api/videos/[id]/comments`

**リクエストボディ:**

```typescript
interface CreateCommentRequest {
  body: string;       // コメント本文（1-1000文字）
  parentId?: string;  // 返信先コメントID（スレッド返信時）
}
```

**バリデーション:**

| フィールド | ルール |
|-----------|--------|
| `body` | 必須、1-1000文字、HTMLタグ除去 |
| `parentId` | 任意、存在する同一動画のコメントIDであること |

**レスポンス:**

```typescript
// 201 Created
interface CreateCommentResponse {
  comment: CommentThread | CommentReply;
}
```

### 3.5 いいね API: `POST /api/videos/[id]/like`

**リクエストボディ:**

```typescript
interface LikeRequest {
  type: "LIKE" | "DISLIKE";
}
```

**処理フロー:**

```
1. 既存の Like レコードを検索 (userId + videoId)
2. 存在しない → 新規作成 + Video.likeCount/dislikeCount increment
3. 同じ type → 取り消し（DELETE + decrement）
4. 異なる type → 更新（UPDATE + 前の type を decrement、新しい type を increment）
```

```typescript
// トランザクションで整合性を保証
async function toggleLike(userId: string, videoId: string, type: LikeType) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.like.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    if (!existing) {
      // 新規いいね
      await tx.like.create({ data: { userId, videoId, type } });
      await tx.video.update({
        where: { id: videoId },
        data: {
          ...(type === "LIKE"
            ? { likeCount: { increment: 1 } }
            : { dislikeCount: { increment: 1 } }),
        },
      });
      return { action: "created", type };
    }

    if (existing.type === type) {
      // 同じタイプ → 取り消し
      await tx.like.delete({
        where: { id: existing.id },
      });
      await tx.video.update({
        where: { id: videoId },
        data: {
          ...(type === "LIKE"
            ? { likeCount: { decrement: 1 } }
            : { dislikeCount: { decrement: 1 } }),
        },
      });
      return { action: "removed", type: null };
    }

    // 異なるタイプ → 切り替え
    await tx.like.update({
      where: { id: existing.id },
      data: { type },
    });
    await tx.video.update({
      where: { id: videoId },
      data: {
        likeCount: { increment: type === "LIKE" ? 1 : -1 },
        dislikeCount: { increment: type === "DISLIKE" ? 1 : -1 },
      },
    });
    return { action: "switched", type };
  });
}
```

### 3.6 視聴記録 API: `POST /api/views`

**リクエストボディ:**

```typescript
interface CreateViewRequest {
  videoId: string;
  watchedSeconds: number; // 現在の視聴位置（秒）
}
```

**処理フロー:**

```
ログインユーザー:
  1. 同一 userId + videoId で直近30分以内の View を検索
  2. 存在する → watchedSeconds を更新（再生位置の進捗）
  3. 存在しない → 新規 View 作成 + Video.viewCount increment

未ログインユーザー:
  1. 常に新規 View 作成（userId = null）
  2. Video.viewCount increment
  ※ 同一セッション内の重複カウント防止はクライアント側で制御
```

```typescript
async function recordView(
  userId: string | null,
  videoId: string,
  watchedSeconds: number
) {
  if (userId) {
    // ログインユーザー: 30分以内の既存Viewを更新
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const existingView = await prisma.view.findFirst({
      where: {
        userId,
        videoId,
        createdAt: { gte: thirtyMinAgo },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingView) {
      // 視聴位置を更新（viewCount は増やさない）
      return prisma.view.update({
        where: { id: existingView.id },
        data: { watchedSeconds },
      });
    }
  }

  // 新規 View 作成 + viewCount increment
  return prisma.$transaction([
    prisma.view.create({
      data: { userId, videoId, watchedSeconds },
    }),
    prisma.$executeRaw`
      UPDATE videos SET view_count = view_count + 1 WHERE id = ${videoId}
    `,
  ]);
}
```

### 3.7 関連動画 API: `GET /api/videos/[id]/related`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `limit` | number | 10 | 取得件数（最大20） |

**関連動画のランキングロジック（MVP）:**

UI設計（Task #4）では推薦タブが3セクション構成（「次に見る」「同じAIモデル」「AI Creator の他の動画」）で定義されている（3段タブUI構成、サイドバー廃止済み）。DB側ではセクション別にグループ化したレスポンスを返し、UI側でそのままセクション表示できるようにする。

```
セクション構成:
1. 「次に見る」: 同一カテゴリ/ムードの高品質動画（最大5件）
2. 「同じAIモデルの動画」: 同一AIモデルの動画（最大5件）
3. 「{チャンネル名} の他の動画」: 同一チャンネルの動画（最大5件）
```

**レスポンス型:**

```typescript
interface RelatedVideosResponse {
  /** 次に見る: カテゴリ/ムード類似の高品質動画 */
  upNext: VideoCard[];
  /** 同じAIモデルの動画 */
  sameModel: {
    modelName: string; // 表示用（例: "Runway Gen-4"）
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

```typescript
async function getRelatedVideos(videoId: string): Promise<RelatedVideosResponse> {
  // 対象動画の情報を取得
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      channelId: true,
      categoryId: true,
      moods: true,
      aiModel: true,
      channel: { select: { name: true, slug: true } },
    },
  });

  if (!video) {
    return { upNext: [], sameModel: { modelName: "", videos: [] }, sameChannel: { channelName: "", channelSlug: "", videos: [] } };
  }

  const excludeIds = [videoId];

  // 3セクションを並列取得（パフォーマンス最適化）
  const [upNextVideos, sameModelVideos, sameChannelVideos] = await Promise.all([
    // 1. 次に見る: 同一カテゴリ + 同一ムードの高品質動画
    prisma.video.findMany({
      where: {
        status: "PUBLISHED",
        id: { notIn: excludeIds },
        OR: [
          ...(video.categoryId ? [{ categoryId: video.categoryId }] : []),
          ...(video.moods.length > 0 ? [{ moods: { hasSome: video.moods } }] : []),
        ],
      },
      orderBy: [{ qualityScore: "desc" }, { viewCount: "desc" }],
      take: 5,
      select: videoCardSelect,
    }),

    // 2. 同じAIモデル
    prisma.video.findMany({
      where: {
        status: "PUBLISHED",
        aiModel: video.aiModel,
        id: { notIn: excludeIds },
      },
      orderBy: [{ qualityScore: "desc" }, { publishedAt: "desc" }],
      take: 5,
      select: videoCardSelect,
    }),

    // 3. 同一チャンネル
    prisma.video.findMany({
      where: {
        status: "PUBLISHED",
        channelId: video.channelId,
        id: { notIn: excludeIds },
      },
      orderBy: [{ qualityScore: "desc" }, { publishedAt: "desc" }],
      take: 5,
      select: videoCardSelect,
    }),
  ]);

  const modelDisplayNames: Record<string, string> = {
    "runway-gen4-turbo": "Runway Gen-4",
    "veo-3.1-fast": "Veo 3.1",
    "kling-ai": "Kling",
    "sora": "Sora",
  };

  return {
    upNext: upNextVideos,
    sameModel: {
      modelName: modelDisplayNames[video.aiModel] ?? video.aiModel,
      videos: sameModelVideos,
    },
    sameChannel: {
      channelName: video.channel.name,
      channelSlug: video.channel.slug,
      videos: sameChannelVideos,
    },
  };
}
```

---

## 4. クエリ最適化

### 4.1 動画詳細データの取得

```typescript
// lib/queries/video-detail.ts

export async function getVideoDetail(videoId: string, userId?: string) {
  // 動画データとユーザー状態を並列取得
  const [video, userState] = await Promise.all([
    getVideoById(videoId),
    userId ? getUserVideoState(userId, videoId) : null,
  ]);

  return { video, userState };
}

async function getVideoById(videoId: string) {
  return prisma.video.findUnique({
    where: { id: videoId, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      description: true,
      muxPlaybackId: true,
      duration: true,

      // AI生成情報（動画再生ページでは全て表示）
      aiModel: true,
      aiPrompt: true,
      aiParams: true,

      // Quality Score
      qualityScore: true,
      qualityDetails: true,

      // ムード
      moods: true,

      // 集計キャッシュ
      viewCount: true,
      likeCount: true,
      dislikeCount: true,
      commentCount: true,

      // 日時
      publishedAt: true,
      createdAt: true,

      // チャンネル
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          subscriberCount: true,
        },
      },

      // カテゴリ
      category: {
        select: { name: true, slug: true },
      },

      // タグ
      tags: {
        select: {
          tag: {
            select: { name: true },
          },
        },
      },
    },
  });
}

async function getUserVideoState(
  userId: string,
  videoId: string
): Promise<UserVideoState> {
  // 3つのクエリを並列実行
  const [like, saved, video] = await Promise.all([
    prisma.like.findUnique({
      where: { userId_videoId: { userId, videoId } },
      select: { type: true },
    }),
    prisma.savedVideo.findUnique({
      where: { userId_videoId: { userId, videoId } },
      select: { id: true },
    }),
    prisma.video.findUnique({
      where: { id: videoId },
      select: { channelId: true },
    }),
  ]);

  let isSubscribed = false;
  if (video) {
    const subscription = await prisma.subscription.findUnique({
      where: {
        userId_channelId: { userId, channelId: video.channelId },
      },
      select: { id: true },
    });
    isSubscribed = !!subscription;
  }

  return {
    likeType: (like?.type as "LIKE" | "DISLIKE") ?? null,
    isSaved: !!saved,
    isSubscribed,
  };
}
```

### 4.2 コメント取得クエリ

```typescript
// lib/queries/comments.ts

export async function getComments({
  videoId,
  cursor,
  limit = 20,
  sort = "newest",
  userId,
}: {
  videoId: string;
  cursor?: string;
  limit?: number;
  sort?: "newest" | "popular";
  userId?: string;
}) {
  const orderBy =
    sort === "popular"
      ? [{ likeCount: "desc" as const }, { createdAt: "desc" as const }]
      : [{ createdAt: "desc" as const }];

  const comments = await prisma.comment.findMany({
    where: {
      videoId,
      parentId: null, // トップレベルコメントのみ
    },
    orderBy,
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    select: {
      id: true,
      body: true,
      likeCount: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
      // 返信の最初の3件
      replies: {
        take: 3,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          likeCount: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
        },
      },
      // 返信の総数（_count）
      _count: {
        select: { replies: true },
      },
    },
  });

  const hasMore = comments.length > limit;
  const result = hasMore ? comments.slice(0, limit) : comments;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  // ユーザーのいいね状態をバッチ取得
  let likedCommentIds = new Set<string>();
  if (userId) {
    const commentIds = result.map((c) => c.id);
    const replyIds = result.flatMap((c) => c.replies.map((r) => r.id));
    const allIds = [...commentIds, ...replyIds];

    const likes = await prisma.commentLike.findMany({
      where: {
        userId,
        commentId: { in: allIds },
      },
      select: { commentId: true },
    });
    likedCommentIds = new Set(likes.map((l) => l.commentId));
  }

  // レスポンス整形
  const formattedComments: CommentThread[] = result.map((comment) => ({
    id: comment.id,
    body: comment.body,
    likeCount: comment.likeCount,
    createdAt: comment.createdAt.toISOString(),
    user: comment.user,
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      likeCount: reply.likeCount,
      createdAt: reply.createdAt.toISOString(),
      user: reply.user,
      isLiked: likedCommentIds.has(reply.id),
    })),
    replyCount: comment._count.replies,
    isLiked: likedCommentIds.has(comment.id),
  }));

  return {
    comments: formattedComments,
    nextCursor,
    hasMore,
  };
}
```

### 4.3 N+1 回避ポイント

| パターン | 問題 | 解決策 |
|---------|------|--------|
| 動画 + チャンネル | N+1 | `select` でネスト（Prisma JOIN） |
| 動画 + タグ | N+1 | `select` でネスト |
| コメント + ユーザー | N+1 | `select` でネスト |
| コメント + 返信 | N+1 | `select` でネスト + `take: 3` |
| コメント + いいね状態 | N+1 | **バッチ取得**: 全コメントIDで一括 `findMany` |
| ユーザー状態（like/saved/subscribed） | 3クエリ | `Promise.all` で並列実行 |

### 4.4 クエリパフォーマンス見積もり

| クエリ | 推定レイテンシ | 備考 |
|--------|:----------:|------|
| `getVideoById` | ~10ms | インデックス利用、1行取得 |
| `getUserVideoState` | ~15ms | 3クエリ並列（各5ms） |
| `getComments` (20件) | ~20ms | インデックス利用 + 返信3件ネスト |
| `getRelatedVideos` | ~30ms | 4-5クエリ逐次（将来並列化） |
| **ページ初期ロード合計** | **~50ms** | video + userState 並列 |

---

