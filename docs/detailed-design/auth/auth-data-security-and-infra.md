# 認証・ユーザー管理: セキュリティ・インフラ設計

> 元ファイル: [auth-data-design.md](auth-data-design.md) から分割（§5-14）

---

## 5. Clerk Middleware 設計

### 5.1 ルート保護定義

```typescript
// middleware.ts

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// ──── 公開ルート（認証不要）────
const isPublicRoute = createRouteMatcher([
  // ページ
  "/",                          // ホーム画面
  "/watch/(.*)",                // 動画再生ページ
  "/channel/(.*)",              // チャンネルページ
  "/search",                    // 検索結果
  "/sign-in(.*)",               // サインインページ
  "/sign-up(.*)",               // サインアップページ

  // ──── 公開 API（GET 公開エンドポイントのみ個別列挙）────
  // ⚠️ SEC-ISSUE-1: ワイルドカード `/api/videos(.*)` `/api/channels/(.*)`
  // を廃止。書き込み系（like/comments POST/save/subscribe）は
  // matcher + handler の両方で認証必須とする。
  "/api/videos",                       // 動画一覧（GET）
  "/api/videos/:id",                   // 動画詳細（GET）
  "/api/videos/:id/comments",          // コメント一覧（GET のみ公開、POST は handler で認証必須）
  "/api/channels/:slug",               // チャンネル詳細（GET）
  "/api/channels/:slug/videos",        // チャンネル動画一覧（GET）
  "/api/channels/:slug/stats",         // チャンネル統計（GET）
  "/api/categories",                   // カテゴリ一覧（GET）
  "/api/categories/:id",               // カテゴリ詳細（GET）
  "/api/search",                       // 検索 API（GET）
  "/api/views",                        // 視聴記録（POST — 未ログインも可）

  // Webhook（署名検証で保護）
  "/api/webhooks/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // 保護ルート: 未認証ならサインインページへリダイレクト
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Next.js 内部ルート・静的ファイルを除外
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // API Route は常に実行
    "/(api|trpc)(.*)",
  ],
};
```

### 5.2 保護ルート一覧

> **SEC-ISSUE-1 対策**: 書き込み系 API は **matcher（§5.1）+ handler（各 route.ts）の両方**で認証必須とする。公開 matcher に含まれないパスは Clerk Middleware で自動的に `auth.protect()` が適用される。

| ルート | 認証 | 防御層 | 説明 |
|--------|:----:|:------:|------|
| `/settings` | 必須 | matcher | ユーザー設定画面 |
| `/saved` | 必須 | matcher | 保存済み動画一覧 |
| `/history` | 必須 | matcher | 視聴履歴 |
| `/api/users/me` | 必須 | matcher + handler | ユーザー情報 CRUD |
| `/api/users/me/subscriptions` | 必須 | matcher + handler | フォロー一覧 |
| `/api/users/me/saved` | 必須 | matcher + handler | 保存済み動画 |
| `/api/users/me/history` | 必須 | matcher + handler | 視聴履歴 |
| `/api/videos/[id]/like` | 必須 | matcher + handler | いいね操作 |
| `/api/videos/[id]/comments` (POST) | 必須 | handler のみ※ | コメント投稿 |
| `/api/videos/[id]/save` | 必須 | matcher + handler | 動画保存 |
| `/api/channels/[slug]/subscribe` | 必須 | matcher + handler | チャンネル登録 |
| `/api/channels/[slug]/user-state` | 必須 | matcher + handler | ユーザー登録状態 |

> ※ `/api/videos/[id]/comments` は GET（コメント一覧取得）が公開のため、パスは公開 matcher に含む。POST（コメント投稿）の認証は handler 内で `auth()` チェックにより担保する。

### 5.3 ISR ページでの auth() 呼び出し禁止

> **SEC-ISSUE-2 教訓**: ISR (revalidate > 0) を使用するページの Server Component 内で `auth()` を呼び出してはならない。
> ISR キャッシュにユーザー固有情報が混入し、他ユーザーに漏洩するリスクがある。

| ページ | ISR | auth() 可否 | userState 取得方法 |
|--------|:---:|:---------:|------------------|
| `/` (ホーム) | revalidate=60 | ❌ 禁止 | Client Component で fetch |
| `/watch/[id]` | revalidate=3600 | ❌ 禁止 | Client Component で fetch |
| `/channel/[slug]` | revalidate=300 | ❌ 禁止 | Client Component で `GET /api/channels/[slug]/user-state` |
| `/search` | dynamic | ✅ 可能 | Server Component 内で直接取得可 |
| `/settings` | dynamic | ✅ 可能 | Server Component 内で直接取得可 |

---

## 6. Supabase RLS ポリシー全体設計

### 6.1 設計方針

channel-data-design.md §10.3 で部分定義した RLS ポリシーを全テーブルに拡張し、統合版として定義する。

> **前提**: Prisma Client は RLS をバイパスするため、RLS は主に以下の用途で機能する:
> 1. Supabase Client SDK 経由の直接アクセス時（将来の Realtime 機能等）
> 2. Supabase Dashboard からの手動操作に対する安全ネット
> 3. 多層防御の一環としてのフェイルセーフ

### 6.2 全テーブル RLS ポリシー

#### users テーブル

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可（コメント・チャンネルでユーザー名表示のため）
-- ただし論理削除されたユーザーの個人情報はマスク済み（§3.3 参照）
CREATE POLICY "users_select_all"
  ON users FOR SELECT
  USING (true);

-- UPDATE: 自分のレコードのみ更新可
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (clerk_id = auth.uid())
  WITH CHECK (clerk_id = auth.uid());

-- INSERT: Webhook (service_role) のみ
CREATE POLICY "users_insert_service"
  ON users FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- DELETE: Webhook (service_role) のみ（物理削除バッチ用）
CREATE POLICY "users_delete_service"
  ON users FOR DELETE
  USING (auth.role() = 'service_role');
```

#### ai_channels テーブル

```sql
ALTER TABLE ai_channels ENABLE ROW LEVEL SECURITY;

-- SELECT: アクティブなチャンネルのみ全ユーザー閲覧可
CREATE POLICY "ai_channels_select_active"
  ON ai_channels FOR SELECT
  USING (is_active = true);

-- INSERT/UPDATE/DELETE: service_role のみ
CREATE POLICY "ai_channels_modify_service"
  ON ai_channels FOR ALL
  USING (auth.role() = 'service_role');
```

#### videos テーブル

```sql
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- SELECT: 公開済み動画のみ全ユーザー閲覧可
CREATE POLICY "videos_select_published"
  ON videos FOR SELECT
  USING (status = 'PUBLISHED');

-- INSERT/UPDATE/DELETE: service_role のみ（AIパイプライン）
CREATE POLICY "videos_modify_service"
  ON videos FOR ALL
  USING (auth.role() = 'service_role');
```

#### comments テーブル

```sql
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可
CREATE POLICY "comments_select_all"
  ON comments FOR SELECT
  USING (true);

-- INSERT: 認証ユーザーが自分のコメントのみ作成可
CREATE POLICY "comments_insert_own"
  ON comments FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- UPDATE: 自分のコメントのみ更新可（編集機能用）
CREATE POLICY "comments_update_own"
  ON comments FOR UPDATE
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- DELETE: 自分のコメントのみ削除可
CREATE POLICY "comments_delete_own"
  ON comments FOR DELETE
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );
```

#### likes テーブル

```sql
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可（いいね数表示のため）
CREATE POLICY "likes_select_all"
  ON likes FOR SELECT
  USING (true);

-- INSERT: 認証ユーザーが自分のいいねのみ作成可
CREATE POLICY "likes_insert_own"
  ON likes FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- DELETE: 自分のいいねのみ取り消し可
CREATE POLICY "likes_delete_own"
  ON likes FOR DELETE
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );
```

#### comment_likes テーブル

```sql
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- SELECT: 全ユーザー閲覧可
CREATE POLICY "comment_likes_select_all"
  ON comment_likes FOR SELECT
  USING (true);

-- INSERT: 認証ユーザーが自分のいいねのみ
CREATE POLICY "comment_likes_insert_own"
  ON comment_likes FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- DELETE: 自分のいいねのみ
CREATE POLICY "comment_likes_delete_own"
  ON comment_likes FOR DELETE
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );
```

#### views テーブル

```sql
ALTER TABLE views ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の視聴履歴のみ閲覧可（未ログイン視聴分は user_id=null）
CREATE POLICY "views_select_own"
  ON views FOR SELECT
  USING (
    user_id IS NULL
    OR user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- INSERT: 全ユーザー（未ログイン含む）作成可
CREATE POLICY "views_insert_all"
  ON views FOR INSERT
  WITH CHECK (true);
```

#### saved_videos テーブル

```sql
ALTER TABLE saved_videos ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の保存のみ
CREATE POLICY "saved_videos_select_own"
  ON saved_videos FOR SELECT
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- INSERT: 自分の保存のみ
CREATE POLICY "saved_videos_insert_own"
  ON saved_videos FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- DELETE: 自分の保存のみ
CREATE POLICY "saved_videos_delete_own"
  ON saved_videos FOR DELETE
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );
```

#### subscriptions テーブル

```sql
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: 自分の登録のみ
CREATE POLICY "subscriptions_select_own"
  ON subscriptions FOR SELECT
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- INSERT: 自分の登録のみ
CREATE POLICY "subscriptions_insert_own"
  ON subscriptions FOR INSERT
  WITH CHECK (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );

-- DELETE: 自分の登録のみ
CREATE POLICY "subscriptions_delete_own"
  ON subscriptions FOR DELETE
  USING (
    user_id = (SELECT id FROM users WHERE clerk_id = auth.uid())
  );
```

#### categories / tags / video_tags テーブル

```sql
-- マスタデータ: 全ユーザー読み取り可、変更は service_role のみ
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_all" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_modify_service" ON categories FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "tags_select_all" ON tags FOR SELECT USING (true);
CREATE POLICY "tags_modify_service" ON tags FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "video_tags_select_all" ON video_tags FOR SELECT USING (true);
CREATE POLICY "video_tags_modify_service" ON video_tags FOR ALL USING (auth.role() = 'service_role');
```

### 6.3 RLS ポリシーサマリ

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|:------:|:------:|:------:|:------:|
| `users` | 全員 | service_role | 自分のみ | service_role |
| `ai_channels` | active のみ | service_role | service_role | service_role |
| `videos` | PUBLISHED のみ | service_role | service_role | service_role |
| `comments` | 全員 | 自分のみ | 自分のみ | 自分のみ |
| `likes` | 全員 | 自分のみ | — | 自分のみ |
| `comment_likes` | 全員 | 自分のみ | — | 自分のみ |
| `views` | 自分 + null | 全員 | — | — |
| `saved_videos` | 自分のみ | 自分のみ | — | 自分のみ |
| `subscriptions` | 自分のみ | 自分のみ | — | 自分のみ |
| `categories` | 全員 | service_role | service_role | service_role |
| `tags` | 全員 | service_role | service_role | service_role |
| `video_tags` | 全員 | service_role | service_role | service_role |

---

## 7. セッション管理・トークンリフレッシュ戦略

### 7.1 Clerk セッション管理

```
[ブラウザ] Clerk.js がセッション管理を担当
    ├── サインイン → Clerk が JWT + セッション Cookie を発行
    ├── JWT 有効期限: 60秒（Clerk デフォルト）
    ├── セッション有効期限: 7日間（Clerk デフォルト）
    └── リフレッシュ: Clerk.js が自動的に JWT を更新（バックグラウンド）

[サーバー] auth() で JWT を検証
    ├── Clerk Middleware が JWT を自動検証
    ├── 期限切れ JWT は自動リフレッシュ（Clerk SDK が処理）
    └── 無効な JWT はサインインページへリダイレクト
```

### 7.2 トークンフロー

```
1. ユーザーがサインイン
    → Clerk が JWT を発行（有効期限: 60秒）
    → セッション Cookie を設定（有効期限: 7日間）

2. API リクエスト時
    → Clerk Middleware が JWT を検証
    → 有効 → auth() で userId 取得可能
    → 期限切れ → Clerk.js が自動リフレッシュ

3. セッション期限切れ（7日間操作なし）
    → 自動サインアウト
    → サインインページへリダイレクト
```

### 7.3 Clerk セッション設定

```
Clerk Dashboard → Sessions → Settings:

- Session lifetime: 7 days（デフォルト）
- Inactivity timeout: 24 hours（推奨）
- Multi-session: Disabled（シンプル化のため）
- Token lifetime: 60 seconds（デフォルト — 変更不要）
```

### 7.4 サインイン/サインアウト UI

```typescript
// Clerk の UI コンポーネントを使用（カスタムフォーム不要）

// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-surface-primary border border-border-default",
          },
        }}
      />
    </div>
  );
}

// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-surface-primary border border-border-default",
          },
        }}
      />
    </div>
  );
}
```

---

## 8. Rate Limiting 設計

### 8.1 認証関連 Rate Limiter

home-rate-limiting.md の既存パターンを拡張する。

```typescript
// lib/rate-limit.ts に追加

/**
 * プロフィール更新用 Rate Limiter
 */
export const profileRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  analytics: true,
  prefix: "ratelimit:profile",
});

/**
 * アカウント削除用 Rate Limiter（極めて厳格）
 */
export const deleteAccountRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "60 s"),
  analytics: true,
  prefix: "ratelimit:delete-account",
});

/**
 * ユーザーデータ読み取り用 Rate Limiter
 */
export const userDataRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "60 s"),
  analytics: true,
  prefix: "ratelimit:user-data",
});

/**
 * 視聴履歴全削除用 Rate Limiter（US-ISSUE-1 対応）
 */
export const historyDeleteRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "3600 s"),
  analytics: true,
  prefix: "ratelimit:history-delete",
});
```

### 8.2 エンドポイント別レート制限

| エンドポイント | Rate Limiter | レート制限 | 識別子 |
|-------------|-------------|----------|--------|
| `GET /api/users/me` | `readRateLimit` | 60 req/60s | userId |
| `PATCH /api/users/me` | `profileRateLimit` | 10 req/60s | userId |
| `DELETE /api/users/me` | `deleteAccountRateLimit` | 1 req/60s | userId |
| `GET /api/users/me/subscriptions` | `userDataRateLimit` | 30 req/60s | userId |
| `GET /api/users/me/saved` | `userDataRateLimit` | 30 req/60s | userId |
| `GET /api/users/me/history` | `userDataRateLimit` | 30 req/60s | userId |
| `DELETE /api/users/me/history` | `historyDeleteRateLimit` | 1 req/3600s | userId |
| `POST /api/webhooks/clerk` | 制限なし | — | Svix 署名で保護 |

### 8.3 Redis コマンド追加消費量

| エンドポイント | 日間リクエスト見積もり | Redis コマンド |
|-------------|:---------------:|:----------:|
| `GET /api/users/me` | 200-500 | 400-1,000 |
| `PATCH /api/users/me` | 10-50 | 20-100 |
| `DELETE /api/users/me` | 0-5 | 0-10 |
| `GET .../subscriptions` | 50-200 | 100-400 |
| `GET .../saved` | 50-200 | 100-400 |
| `GET .../history` | 50-200 | 100-400 |
| **合計追加分** | | **720-2,310** |

既存消費量と合算しても Upstash 無料枠（10,000 コマンド/日）で対応可能。

---

## 9. GDPR / アカウント削除フロー

### 9.1 削除フロー

```
[ユーザー] 設定画面 → アカウント削除ボタン
    ↓ 確認ダイアログ（「本当に削除しますか？この操作は取り消せません」）
    ↓
[DELETE /api/users/me]
    ↓
[即時] 論理削除
    ├── User.isActive = false
    ├── User.deletedAt = now()
    ├── User.name = "削除済みユーザー"
    ├── User.email = null
    ├── User.imageUrl = null
    └── Clerk ユーザー削除
    ↓
[30日後] 物理削除バッチ（BullMQ ジョブ）
    ├── User レコード CASCADE 削除
    │     ├── Comment（body は残すが user は "削除済みユーザー" として表示）
    │     ├── Like → CASCADE 削除 + Video.likeCount 再計算
    │     ├── View → CASCADE 削除
    │     ├── SavedVideo → CASCADE 削除
    │     ├── Subscription → CASCADE 削除 + AIChannel.subscriberCount 再計算
    │     └── CommentLike → CASCADE 削除
    └── ログ出力（削除完了の監査ログ）
```

### 9.2 物理削除バッチ

```typescript
// workers/delete-expired-users.ts（BullMQ ジョブ）

export async function deleteExpiredUsers() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const expiredUsers = await prisma.user.findMany({
    where: {
      deletedAt: { lte: thirtyDaysAgo },
      isActive: false,
    },
    select: { id: true },
  });

  for (const user of expiredUsers) {
    await prisma.$transaction(async (tx) => {
      // 集計キャッシュの再計算
      // 1. subscriberCount 再計算
      const subscriptions = await tx.subscription.findMany({
        where: { userId: user.id },
        select: { channelId: true },
      });
      for (const sub of subscriptions) {
        await tx.aIChannel.update({
          where: { id: sub.channelId },
          data: { subscriberCount: { decrement: 1 } },
        });
      }

      // 2. likeCount 再計算
      const likes = await tx.like.findMany({
        where: { userId: user.id },
        select: { videoId: true, type: true },
      });
      for (const like of likes) {
        await tx.video.update({
          where: { id: like.videoId },
          data: {
            ...(like.type === "LIKE"
              ? { likeCount: { decrement: 1 } }
              : { dislikeCount: { decrement: 1 } }),
          },
        });
      }

      // 3. commentCount 再計算
      const comments = await tx.comment.findMany({
        where: { userId: user.id },
        select: { videoId: true },
      });
      const videoCommentCounts = new Map<string, number>();
      for (const comment of comments) {
        videoCommentCounts.set(
          comment.videoId,
          (videoCommentCounts.get(comment.videoId) ?? 0) + 1
        );
      }
      for (const [videoId, count] of videoCommentCounts) {
        await tx.video.update({
          where: { id: videoId },
          data: { commentCount: { decrement: count } },
        });
      }

      // 4. User の CASCADE 削除
      await tx.user.delete({ where: { id: user.id } });
    });

    console.log(`[GDPR] User ${user.id} permanently deleted`);
  }

  return { deletedCount: expiredUsers.length };
}
```

### 9.3 データ保持ポリシー

| データ種別 | 論理削除時 | 物理削除時（30日後） |
|-----------|----------|-------------------|
| ユーザー名 | "削除済みユーザー" にマスク | レコード削除 |
| メールアドレス | null にクリア | レコード削除 |
| プロフィール画像 | null にクリア | レコード削除 |
| コメント | 残す（ユーザー名は "削除済みユーザー"） | コメントも CASCADE 削除 |
| いいね | 残す（カウントは正確） | CASCADE 削除 + カウント再計算 |
| 視聴履歴 | 残す | CASCADE 削除 |
| 保存済み動画 | 残す | CASCADE 削除 |
| チャンネル登録 | 残す（カウントは正確） | CASCADE 削除 + カウント再計算 |

---

## 10. インデックス設計

### 10.1 認証関連追加インデックス

| テーブル | インデックス | 用途 |
|---------|------------|------|
| `users` | `(clerkId)` UNIQUE | Clerk Webhook 処理、auth() 解決 |
| `users` | `(email)` | メール検索（将来の通知機能用） |
| `users` | `(isActive, deletedAt)` | 物理削除バッチ、アクティブユーザー絞り込み |
| `subscriptions` | `(userId, createdAt)` | フォロー一覧の新着順 |
| `saved_videos` | `(userId, createdAt)` | 保存動画の新着順（既存） |
| `views` | `(userId, createdAt)` | 視聴履歴の新着順（既存） |

### 10.2 Prisma スキーマ追記

```prisma
model User {
  // ... 既存フィールド + 拡張フィールド ...

  @@index([clerkId])            // 既存
  @@index([email])              // 新規: メール検索
  @@index([isActive, deletedAt]) // 新規: 物理削除バッチ・アクティブ絞り込み
  @@map("users")
}
```

---

## 11. TypeScript 型定義まとめ

```typescript
// types/auth.ts

/** ユーザープロフィール（API レスポンス） */
export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  imageUrl: string | null;
  createdAt: string;
  subscriptionCount: number;
  savedVideoCount: number;
  commentCount: number;
}

export interface UserProfileResponse {
  user: UserProfile;
}

/** プロフィール更新リクエスト */
export interface UpdateProfileRequest {
  name: string;
}

/** フォロー中チャンネル一覧 */
export interface UserSubscriptionsResponse {
  subscriptions: SubscribedChannel[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SubscribedChannel {
  subscriptionId: string;
  subscribedAt: string;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
    videoCount: number;
    subscriberCount: number;
  };
}

/** 保存済み動画一覧 */
export interface UserSavedVideosResponse {
  videos: SavedVideoItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SavedVideoItem {
  savedAt: string;
  video: VideoCard;
}

/** 視聴履歴 */
export interface UserHistoryResponse {
  views: HistoryItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HistoryItem {
  viewedAt: string;
  watchedSeconds: number;
  video: VideoCard;
}
```

---

## 12. セキュリティ考慮事項

### 12.1 入力バリデーション

| フィールド | バリデーション |
|-----------|-------------|
| `name`（プロフィール更新） | 1-50文字、HTMLタグ除去、trim |
| `cursor` | CUID フォーマット |
| `limit` | 1-50 の整数 |

### 12.2 CSRF 対策・OAuth リダイレクト防御（SEC-ISSUE-3 対応）

Clerk SDK が SameSite Cookie 属性で CSRF を防止。追加の CSRF トークン実装は不要。

```
Clerk Session Cookie:
  SameSite=Lax（デフォルト）
  Secure=true（本番環境）
  HttpOnly=true
```

**OAuth state 検証**: Clerk 標準の OAuth フローに依拠。Clerk SDK が state パラメータの生成・検証を自動的に処理するため、独自実装は不要。

**redirect_url 検証方針**:
- `redirect_url` は相対パス（`/` で始まるパス）のみ許可する
- 絶対 URL（`http://`, `https://` 等）は拒否し、外部ドメインへの open redirect を防止する
- 許可パス例: `/`, `/watch/[id]`, `/channel/[slug]`, `/saved`, `/history`

```typescript
// lib/auth/validate-redirect-url.ts
const ALLOWED_PATHS = /^\/(?!\/)/; // 相対パスのみ許可（// から始まるプロトコル相対 URL は拒否）

export function validateRedirectUrl(url: string | null): string {
  if (!url || !ALLOWED_PATHS.test(url)) {
    return "/"; // デフォルトはホーム
  }
  return url;
}
```

**独自 POST API の Origin/Referer 検証**:
- Clerk Middleware が JWT を検証するため、カスタム CSRF トークンは不要
- 書き込み系 API（コメント・いいね・保存・チャンネル登録）では `auth()` による認証チェックを必ず実施し、未認証リクエストを 401 で拒否する
- 追加防御として `Origin` / `Referer` が自ドメインであることを確認することを Phase 2 以降で強化する

### 12.3 Webhook セキュリティ

| 対策 | 実装 |
|------|------|
| 署名検証 | Svix ライブラリで HMAC 署名を検証 |
| タイムスタンプ検証 | Svix が自動的にリプレイ攻撃を防止 |
| IP ホワイトリスト | Clerk の Webhook 送信元 IP を Vercel で制限（将来オプション） |
| Rate Limit | Webhook は Rate Limit 対象外（署名で保護） |

### 12.4 個人情報保護

| 対策 | 実装 |
|------|------|
| パスワード | Clerk が管理（アプリ側で保持しない） |
| メールアドレス | DB に保存するが API レスポンスでは `GET /api/users/me` のみで返却 |
| アカウント削除 | 即時論理削除 + 30日後物理削除 |
| ログ | 個人情報（email, name）をログに出力しない |
| 暗号化 | Supabase の保存時暗号化（at-rest encryption）に依拠 |

---

## 13. 環境変数一覧

```env
# .env.local

# ──── Clerk ────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Clerk サインイン/サインアップ URL
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# ──── Supabase ────
DATABASE_URL=postgresql://xxx:xxx@xxx.supabase.co:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://xxx:xxx@xxx.supabase.co:5432/postgres

# ──── Upstash Redis ────
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXxx...
```

---

## 14. 整合性チェック結果

| # | チェック項目 | 結果 | 対応箇所 |
|---|-------------|:----:|---------|
| 1 | Clerk `userId` と Prisma User.id の対応関係 | ✅ | §2.3 マッピング定義。アプリ内部は User.id、Clerk 連携時は clerkId |
| 2 | ISR ページでの `auth()` 呼び出し禁止 | ✅ | §5.3 ルート別の auth() 可否テーブル（SEC-ISSUE-2 教訓） |
| 3 | RLS ポリシーが全テーブルで定義 | ✅ | §6.2 全12テーブルの RLS ポリシー定義、§6.3 サマリテーブル |
| 4 | GDPR アカウント削除対応 | ✅ | §9 論理削除 → 30日後物理削除。個人情報即時マスク |
| 5 | Webhook 署名検証 | ✅ | §3.3 Svix 署名検証。§12.3 Webhook セキュリティ |
| 6 | Rate Limiting 全エンドポイント定義 | ✅ | §8.2 エンドポイント別テーブル。Upstash 無料枠内 |
| 7 | コスト制約 | ✅ | §1.2 Clerk Free / Supabase Free で $0。§8.3 Redis 消費量 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-28 | 1.0 | 初版作成 | tech-leader |
| 2026-02-28 | REV-2 | レビュー指摘修正（SEC-ISSUE-1, CONS-ISSUE-1, US-ISSUE-1, CONS-ISSUE-2, SEC-ISSUE-3） | tech-leader |
