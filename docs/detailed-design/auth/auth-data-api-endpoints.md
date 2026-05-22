# 認証・ユーザー管理: API エンドポイント設計

> 元ファイル: [auth-data-design.md](auth-data-design.md) から分割（§4）

---

## 4. 認証関連 API エンドポイント設計

### 4.1 エンドポイント一覧

| メソッド | パス | 説明 | 認証 | Rate Limit |
|---------|------|------|:----:|-----------|
| GET | `/api/users/me` | 現在のユーザー情報取得 | 必須 | 60 req/60s |
| PATCH | `/api/users/me` | プロフィール更新（表示名） | 必須 | 10 req/60s |
| GET | `/api/users/me/subscriptions` | フォロー中チャンネル一覧 | 必須 | 30 req/60s |
| GET | `/api/users/me/saved` | 保存済み動画一覧 | 必須 | 30 req/60s |
| GET | `/api/users/me/history` | 視聴履歴 | 必須 | 30 req/60s |
| DELETE | `/api/users/me` | アカウント削除（GDPR） | 必須 | 1 req/60s |
| DELETE | `/api/users/me/history` | 視聴履歴全削除 | 必須 | 1 req/3600s |
| POST | `/api/webhooks/clerk` | Clerk Webhook 受信 | Svix 署名 | 制限なし |

### 4.1.1 /settings タブ別 API・データ設計

> **US-ISSUE-1 対応**: `/settings` ページの各タブに対応する保存先・API・認可・バリデーション・Phase 区分を定義する。

#### プロフィールタブ（MVP）

| 項目 | 内容 |
|------|------|
| Phase | **MVP** |
| 保存先 | Clerk（アバター・メール） / Supabase `users.name`（表示名） |
| API | `GET /api/users/me`, `PATCH /api/users/me` |
| 認可 | Clerk `auth()` で自ユーザーのみ |
| バリデーション | name: 1-50文字、trim。アバター・メールは Clerk UI（`<UserProfile />`）で変更 |
| 備考 | Clerk 側の変更は Webhook で Supabase に自動同期 |

#### 通知設定タブ（Phase 2）

| 項目 | 内容 |
|------|------|
| Phase | **Phase 2**（MVP では UI を disabled 表示） |
| 保存先 | Supabase `user_notification_settings` テーブル（Phase 2 で作成） |
| API（Phase 2）| `GET /api/users/me/notifications/settings`, `PATCH /api/users/me/notifications/settings` |
| 認可 | Clerk `auth()` で自ユーザーのみ |
| バリデーション | 各フラグ: boolean |
| 予定スキーマ | `emailOnNewVideo: boolean`, `emailOnReply: boolean`, `emailDigest: 'daily' \| 'weekly' \| 'none'` |

#### プライバシー設定タブ（Phase 2）

| 項目 | 内容 |
|------|------|
| Phase | **Phase 2**（MVP では UI を disabled 表示） |
| 保存先 | Supabase `user_privacy_settings` テーブル（Phase 2 で作成） |
| API（Phase 2）| `GET /api/users/me/privacy/settings`, `PATCH /api/users/me/privacy/settings` |
| 認可 | Clerk `auth()` で自ユーザーのみ |
| バリデーション | 各フラグ: boolean |
| 予定スキーマ | `showWatchHistory: boolean`, `showSavedVideos: boolean`, `showSubscriptions: boolean` |

#### 視聴履歴管理タブ（MVP）

| 項目 | 内容 |
|------|------|
| Phase | **MVP**（一括削除のみ） |
| 保存先 | Supabase `views` テーブル |
| API | `GET /api/users/me/history`（一覧）, `DELETE /api/users/me/history`（全削除） |
| 認可 | Clerk `auth()` で自ユーザーのみ |
| バリデーション | 削除確認ダイアログ必須（UI 側） |
| Rate Limit | DELETE: 1 req/3600s（誤操作防止） |

```typescript
// app/api/users/me/history/route.ts (DELETE)

export async function DELETE() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResponse = await checkRateLimit(historyDeleteRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  const user = await resolveUser(clerkUserId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.view.deleteMany({
    where: { userId: user.id },
  });

  return NextResponse.json({ success: true });
}
```

#### データダウンロードタブ（Phase 2）

| 項目 | 内容 |
|------|------|
| Phase | **Phase 2**（MVP では UI を disabled 表示） |
| 保存先 | N/A（エクスポート生成） |
| API（Phase 2）| `POST /api/users/me/data-export`（エクスポートジョブ作成）, `GET /api/users/me/data-export/:id`（ダウンロード） |
| 認可 | Clerk `auth()` で自ユーザーのみ |
| バリデーション | エクスポート形式: `'json'`（Phase 2 初期は JSON のみ） |
| Rate Limit | POST: 1 req/86400s（1日1回） |
| 備考 | BullMQ ジョブでバックグラウンド生成。GDPR データポータビリティ対応 |

#### アカウント削除タブ（MVP）

| 項目 | 内容 |
|------|------|
| Phase | **MVP** |
| 保存先 | Supabase `users` テーブル（論理削除） + Clerk（物理削除） |
| API | `DELETE /api/users/me` |
| 認可 | Clerk `auth()` で自ユーザーのみ |
| バリデーション | 削除確認ダイアログ必須 + テキスト入力確認（「削除」と入力） |
| 備考 | §9 GDPR 削除フローに従う |

### 4.2 プロフィール取得: `GET /api/users/me`

**レスポンス型:**

```typescript
interface UserProfileResponse {
  user: UserProfile;
}

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  createdAt: string;           // ISO 8601

  // 集計情報
  subscriptionCount: number;   // フォロー中チャンネル数
  savedVideoCount: number;     // 保存済み動画数
  commentCount: number;        // 投稿コメント数
}
```

```typescript
// app/api/users/me/route.ts

import { auth } from "@clerk/nextjs/server";
import { resolveUser } from "@/lib/auth/resolve-user";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId, isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      createdAt: true,
      _count: {
        select: {
          subscriptions: true,
          savedVideos: true,
          comments: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      imageUrl: user.imageUrl,
      createdAt: user.createdAt.toISOString(),
      subscriptionCount: user._count.subscriptions,
      savedVideoCount: user._count.savedVideos,
      commentCount: user._count.comments,
    },
  });
}
```

### 4.3 プロフィール更新: `PATCH /api/users/me`

> **注**: アバター画像・メールアドレスの変更は Clerk UI（`<UserProfile />`）で行う。
> Clerk 側の変更は Webhook で自動同期される。
> アプリ側の `PATCH /api/users/me` では表示名のみ更新可能。

**リクエストボディ:**

```typescript
interface UpdateProfileRequest {
  name: string;               // 1-50文字
}
```

**Zod バリデーション:**

```typescript
// lib/validations/user.ts
import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "表示名を入力してください")
    .max(50, "表示名は50文字以内で入力してください")
    .transform((val) => val.trim()),
});
```

```typescript
// app/api/users/me/route.ts (PATCH)

export async function PATCH(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResponse = await checkRateLimit(profileRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const user = await resolveUser(clerkUserId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prisma で更新（Clerk 側にも反映する場合は Clerk Backend API を呼ぶ）
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
    select: { id: true, name: true },
  });

  return NextResponse.json({ user: updated });
}
```

### 4.4 アカウント削除: `DELETE /api/users/me`

GDPR / 個人情報保護法対応のアカウント削除。論理削除（soft delete）→ 30日後に物理削除バッチで完全消去する。

**処理フロー:**

```
1. Clerk 認証チェック
2. Rate Limit チェック（1 req/60s — 誤操作防止）
3. Prisma: User の論理削除（soft delete）
   - isActive = false
   - deletedAt = now()
   - name = "削除済みユーザー"
   - email = null
   - imageUrl = null
4. Clerk Backend API: ユーザー削除（Clerk 側のデータ消去）
5. 30日後: 物理削除バッチで以下を完全消去
   - User レコード
   - 関連する Comment, Like, View, SavedVideo, Subscription, CommentLike
```

```typescript
// app/api/users/me/route.ts (DELETE)

import { clerkClient } from "@clerk/nextjs/server";

export async function DELETE() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResponse = await checkRateLimit(deleteAccountRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  const user = await resolveUser(clerkUserId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // 1. Prisma: 論理削除（soft delete）+ 個人情報マスク
  await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: false,
      deletedAt: new Date(),
      name: "削除済みユーザー",
      email: null,
      imageUrl: null,
    },
  });

  // 2. Clerk: ユーザー削除
  const client = await clerkClient();
  await client.users.deleteUser(clerkUserId);

  return NextResponse.json({ success: true });
}
```

### 4.5 フォロー中チャンネル一覧: `GET /api/users/me/subscriptions`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `cursor` | string | - | カーソル（最後の Subscription ID） |
| `limit` | number | 20 | 取得件数（最大50） |

**レスポンス型:**

```typescript
interface UserSubscriptionsResponse {
  subscriptions: SubscribedChannel[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface SubscribedChannel {
  subscriptionId: string;
  subscribedAt: string;          // ISO 8601
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
    videoCount: number;
    subscriberCount: number;
  };
}
```

```typescript
// lib/queries/user-subscriptions.ts

export async function getUserSubscriptions(
  userId: string,
  cursor?: string,
  limit = 20
) {
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    select: {
      id: true,
      createdAt: true,
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          videoCount: true,
          subscriberCount: true,
        },
      },
    },
  });

  const hasMore = subscriptions.length > limit;
  const result = hasMore ? subscriptions.slice(0, limit) : subscriptions;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return {
    subscriptions: result.map((s) => ({
      subscriptionId: s.id,
      subscribedAt: s.createdAt.toISOString(),
      channel: s.channel,
    })),
    nextCursor,
    hasMore,
  };
}
```

### 4.6 保存済み動画一覧: `GET /api/users/me/saved`

**レスポンス型:**

```typescript
interface UserSavedVideosResponse {
  videos: SavedVideoItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface SavedVideoItem {
  savedAt: string;               // ISO 8601
  video: VideoCard;              // home-data-design.md §2.4 と同一型
}
```

```typescript
// lib/queries/user-saved-videos.ts

export async function getUserSavedVideos(
  userId: string,
  cursor?: string,
  limit = 20
) {
  const savedVideos = await prisma.savedVideo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    select: {
      id: true,
      createdAt: true,
      video: {
        select: videoCardSelect,
      },
    },
  });

  const hasMore = savedVideos.length > limit;
  const result = hasMore ? savedVideos.slice(0, limit) : savedVideos;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return {
    videos: result.map((sv) => ({
      savedAt: sv.createdAt.toISOString(),
      video: sv.video,
    })),
    nextCursor,
    hasMore,
  };
}
```

### 4.7 視聴履歴: `GET /api/users/me/history`

**レスポンス型:**

```typescript
interface UserHistoryResponse {
  views: HistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface HistoryItem {
  viewedAt: string;              // ISO 8601
  watchedSeconds: number;
  video: VideoCard;
}
```

```typescript
// lib/queries/user-history.ts

export async function getUserHistory(
  userId: string,
  cursor?: string,
  limit = 20
) {
  const views = await prisma.view.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    select: {
      id: true,
      createdAt: true,
      watchedSeconds: true,
      video: {
        select: videoCardSelect,
      },
    },
  });

  const hasMore = views.length > limit;
  const result = hasMore ? views.slice(0, limit) : views;
  const nextCursor = hasMore ? result[result.length - 1].id : null;

  return {
    views: result.map((v) => ({
      viewedAt: v.createdAt.toISOString(),
      watchedSeconds: v.watchedSeconds,
      video: v.video,
    })),
    nextCursor,
    hasMore,
  };
}
```

### 4.8 /settings タブ別 API・データ設計（US-ISSUE-1 対応）

> **Note**: `/settings` の各タブ機能に対応する API・データ設計。MVP 外のタブは UI で `disabled` 表示し、Phase 2 以降に実装する。

| タブ | API | 保存先 | 認証 | バリデーション | Phase |
|------|-----|--------|:----:|--------------|-------|
| プロフィール | `PATCH /api/users/me` | Supabase `User` テーブル | 必須 | name: 1-50文字、HTMLタグ除去 | MVP |
| 通知設定 | `GET/PATCH /api/users/me/notifications` | Supabase `UserNotificationSettings` テーブル（新規） | 必須 | Boolean フラグのみ | Phase 2 |
| プライバシー設定 | `GET/PATCH /api/users/me/privacy` | Supabase `UserPrivacySettings` テーブル（新規） | 必須 | Enum 値のみ | Phase 2 |
| 視聴履歴削除 | `DELETE /api/users/me/history` | Supabase `View` テーブル | 必須 | なし（全件削除） | Phase 2 |
| データダウンロード | `POST /api/users/me/data-export` | 非同期バッチ（BullMQ）→ 署名付き URL | 必須 | なし | Phase 2 |

**MVP 実装範囲（プロフィールタブのみ）**:
- 既存の `PATCH /api/users/me`（§4.3）で対応済み
- 通知・プライバシー・履歴削除・データダウンロードタブは `disabled` 状態で表示し、「Phase 2 で対応予定」のツールチップを付与する

---

