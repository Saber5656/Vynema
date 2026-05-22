# 認証・ユーザー管理: スキーマ・Clerk連携

> 元ファイル: [auth-data-design.md](auth-data-design.md) から分割（§1-3）

## プロジェクト: AI Theater
作成日: 2026-02-28
担当: tech-leader
Task: #12

---

## 1. 認証・ユーザー管理の概要

### 1.1 認証方式

```
Clerk（外部認証 SaaS）をフロントエンド認証に使用。
ユーザーデータは Clerk → Webhook → Supabase (Prisma) に同期。
```

| 項目 | 選定 |
|------|------|
| 認証プロバイダ | Clerk |
| ソーシャルログイン | Google OAuth, GitHub OAuth |
| メール/パスワード | ❌ **MVP外**（Phase 2 以降）。Clerk Dashboard で無効化 |
| セッション管理 | Clerk Session（JWT ベース） |
| DB | Supabase PostgreSQL + Prisma ORM |
| RLS | Supabase Row Level Security |

> **認証手段の Source of Truth**: `auth-uiux-improvements.md` §2。MVP は **Google OAuth + GitHub OAuth のみ**。Email/Password・MagicLink・Apple は Phase 2 以降とし、Clerk Dashboard で無効化する。

### 1.2 コスト制約

| サービス | プラン | 制限 | 月額 |
|---------|--------|------|:----:|
| Clerk | Free Tier | 10,000 MAU、無制限ユーザー、ソーシャルログイン | $0 |
| Supabase | Free Tier | 500MB DB、50,000 月間 API リクエスト | $0 |
| **合計** | | | **$0** |

MVP 想定ユーザー数（100-1,000人）では Free Tier で十分。

### 1.3 ユーザーストーリー対応表

| ユーザーストーリー | 設計箇所 |
|------------------|---------|
| US-001: アカウント作成（メール/ソーシャル） | §2 Clerk 連携、§3 Webhook |
| US-002: 未ログイン視聴 | §5 Middleware（公開ルート定義） |
| US-003: プロフィール設定 | §4.2 プロフィール更新 API |
| US-004: アカウント削除（GDPR） | §4.4 アカウント削除 API |

---

## 2. Prisma スキーマ: User モデル拡張

### 2.1 拡張版 User モデル

home-data-design.md で定義済みの User モデルを拡張する。

```prisma
// =============================================
// User（Clerkから同期）【拡張版】
// =============================================
model User {
  id        String     @id @default(cuid())
  clerkId   String     @unique                // Clerk User ID（"user_xxx" 形式）
  name      String
  email     String?                           // メールアドレス（Clerk から同期、通知用）
  imageUrl  String?                           // プロフィール画像URL
  role      UserRole   @default(USER)         // ロール（将来の管理者機能用）

  // アカウント状態
  isActive  Boolean    @default(true)         // アカウント有効フラグ
  deletedAt DateTime?                         // 論理削除日時（GDPR 対応）

  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  // リレーション
  comments      Comment[]
  likes         Like[]
  views         View[]
  savedVideos   SavedVideo[]
  subscriptions Subscription[]
  commentLikes  CommentLike[]

  @@index([clerkId])
  @@index([email])
  @@index([isActive])
  @@map("users")
}

enum UserRole {
  USER          // 一般視聴者
  ADMIN         // 管理者（将来の管理画面用）
}
```

### 2.2 既存フィールドとの差分

| フィールド | 状態 | 説明 |
|-----------|------|------|
| `email` | **新規** | Clerk から同期。通知送信・アカウント復旧に使用。`@unique` は付与しない（Clerk 側で一意性を保証） |
| `role` | **新規** | MVP では全員 `USER`。将来のモデレーション・管理画面で `ADMIN` を使用 |
| `isActive` | **新規** | `false` = 一時停止。RLS ポリシーで非アクティブユーザーの操作を制限 |
| `deletedAt` | **新規** | 論理削除タイムスタンプ。GDPR 削除要求から30日後に物理削除バッチで完全消去 |

### 2.3 Clerk User ID → Prisma User ID マッピング

```
Clerk userId: "user_2xAbC..."（Clerk 内部ID）
     ↓ Webhook で同期
Prisma User.clerkId: "user_2xAbC..."（同一値を格納）
Prisma User.id: "clxxxxxxxxxx"（CUID — アプリ内部ID）
```

**設計方針**: アプリケーション内部では Prisma の `User.id`（CUID）を使用する。`clerkId` は Clerk Webhook 受信時と `auth()` からの userId 解決時のみ使用する。

```typescript
// lib/auth/resolve-user.ts

/**
 * Clerk userId から Prisma User を取得するヘルパー。
 * 認証済みエンドポイントで使用する。
 */
export async function resolveUser(clerkUserId: string) {
  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
    select: { id: true, isActive: true, deletedAt: true },
  });

  if (!user || !user.isActive || user.deletedAt) {
    return null;
  }

  return user;
}
```

---

## 3. Clerk ↔ Supabase 連携設計

### 3.1 同期アーキテクチャ

```
[Clerk] ユーザー操作（サインアップ/プロフィール更新/削除）
    ↓ Webhook（Svix 署名検証）
[POST /api/webhooks/clerk]
    ↓
[Prisma] users テーブルに upsert/update/soft-delete
    ↓
[Supabase PostgreSQL] RLS ポリシー適用
```

### 3.2 Clerk Webhook イベント一覧

| イベント | 処理 | 頻度 |
|---------|------|------|
| `user.created` | User レコード作成 | 低（新規登録時） |
| `user.updated` | User レコード更新（name, email, imageUrl） | 低（プロフィール変更時） |
| `user.deleted` | 論理削除（`deletedAt` 設定、`isActive = false`） | 極低 |
| `session.created` | ログ記録のみ（MVP ではスキップ可） | 中 |
| `session.ended` | ログ記録のみ（MVP ではスキップ可） | 中 |

### 3.3 Webhook ハンドラ（拡張版）

```typescript
// app/api/webhooks/clerk/route.ts

import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  // ──── 1. Svix 署名検証 ────
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

  let event: WebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    console.error("[Clerk Webhook] Signature verification failed");
    return new Response("Invalid signature", { status: 401 });
  }

  // ──── 2. イベント処理 ────
  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const { id, first_name, last_name, email_addresses, image_url } =
        event.data;

      const primaryEmail = email_addresses?.find(
        (e) => e.id === event.data.primary_email_address_id
      )?.email_address;

      await prisma.user.upsert({
        where: { clerkId: id },
        update: {
          name: buildName(first_name, last_name),
          email: primaryEmail ?? null,
          imageUrl: image_url ?? null,
        },
        create: {
          clerkId: id,
          name: buildName(first_name, last_name),
          email: primaryEmail ?? null,
          imageUrl: image_url ?? null,
        },
      });
      break;
    }

    case "user.deleted": {
      const { id } = event.data;
      if (!id) break;

      // 論理削除（soft delete）: deletedAt を設定し isActive = false
      // 物理削除は 30日後の BullMQ バッチで実施（GDPR 対応）
      await prisma.user.update({
        where: { clerkId: id },
        data: {
          isActive: false,
          deletedAt: new Date(),
          // 個人情報を即座にマスク
          name: "削除済みユーザー",
          email: null,
          imageUrl: null,
        },
      });
      break;
    }
  }

  return new Response("OK", { status: 200 });
}

function buildName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "匿名ユーザー";
}
```

> **CONS-ISSUE-2 フィールド名マッピング**: UI/UX 設計で使用される `displayName` / `avatarUrl` は、DB/API レベルではそれぞれ `name` / `imageUrl` にマッピングされる。本設計（auth-data-design.md）のフィールド名が **Source of Truth** とする。
>
> | UI/UX 設計側 | DB/API 側（本設計） | Clerk Webhook ペイロード |
> |-------------|-------------------|----------------------|
> | `displayName` | `name` | `first_name` + `last_name` → `buildName()` |
> | `avatarUrl` | `imageUrl` | `image_url` |
> | `email` | `email` | `email_addresses[].email_address` |
>
> **削除戦略**: 本設計の **論理削除（soft delete）→ 30日後物理削除バッチ** が Source of Truth。`prisma.user.delete()` による即時物理削除は使用しない。

### 3.4 Clerk JWT テンプレート設定

Supabase RLS でユーザーを識別するため、Clerk が発行する JWT に Supabase 互換の claim を含める。

**Clerk Dashboard → JWT Templates → "supabase" テンプレート作成:**

```json
{
  "iss": "https://<clerk-instance>.clerk.accounts.dev",
  "sub": "{{user.id}}",
  "aud": "authenticated",
  "role": "authenticated",
  "user_metadata": {
    "prisma_user_id": "{{user.public_metadata.prisma_user_id}}"
  }
}
```

**マッピング関係:**

| Clerk | JWT claim | Supabase | 用途 |
|-------|-----------|----------|------|
| `user.id` | `sub` | `auth.uid()` | RLS ポリシーのユーザー識別 |
| `"authenticated"` | `role` | `auth.role()` | 認証済みユーザー判定 |
| `user.public_metadata.prisma_user_id` | `user_metadata.prisma_user_id` | — | Prisma User.id との対応（将来用） |

### 3.5 Supabase キー使い分け

| キー | 用途 | RLS 適用 | 使用箇所 |
|------|------|:-------:|---------|
| `anon` key | 未認証アクセス（公開データ読み取り） | ✅ 適用 | 将来の Supabase Realtime 等 |
| `service_role` key | サーバーサイド操作（RLS バイパス） | ❌ バイパス | AIパイプライン（Railway Worker） |
| Prisma `DATABASE_URL` | アプリ API Route 全般 | ❌ バイパス | Next.js API Routes（アプリレベル認可で補完） |

> **重要**: Prisma Client は Supabase の Connection Pooler 経由で接続するため、RLS をバイパスする。
> セキュリティはアプリケーションレベルの認可チェック（§4 の各 API エンドポイント）で担保する。

---

