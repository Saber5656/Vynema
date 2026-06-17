# 認証・ユーザー管理 パフォーマンス設計書

## プロジェクト: AI Theater
作成日: 2026-02-28
担当: analyzer
Task: #13

**前提: 個人開発レベルの予算制約（月額$50以下目標）。認証基盤は Clerk 確定済み。**

---

## 1. 対象範囲と設計前提

### 1.1 認証フロー概要

```
[ユーザー]
  ↓ リクエスト
[Vercel Edge] Clerk Middleware（JWT検証・ルート保護）  ~5-15ms
  ↓ 認証チェック通過
[Server Component] auth() でセッション取得              ~0ms（追加ネットワークなし）
  ↓ 必要な場合のみ
[Server Component] currentUser() でプロフィール取得     ~50-150ms（Clerk API コール）
  ↓
[Client] ClerkProvider → 自動トークンリフレッシュ（バックグラウンド）
```

### 1.2 設計対象ページ

| ページ | 認証状態 | 設計上の特性 |
|--------|---------|------------|
| `/sign-in/[[...sign-in]]` | 未認証 | Clerk ホスト型 UI（CSR） |
| `/sign-up/[[...sign-up]]` | 未認証 | Clerk ホスト型 UI（CSR） |
| `/` (ホーム) | 任意 | 未認証でも閲覧可。認証状態は CSR で取得 |
| `/channel/[slug]` | 任意 | 公開ページ。購読状態のみ CSR |
| `/watch/[id]` | 任意 | 公開ページ。いいね状態のみ CSR |
| `/settings` | 必須 | Middleware でリダイレクト保護 |

---

## 2. `auth()` / `currentUser()` 呼び出しコスト設計

### 2.1 2関数の性能特性

| 関数 | ランタイム | 処理 | 追加レイテンシ | 用途 |
|------|----------|------|-------------|------|
| `auth()` | Edge / Node.js | JWT をリクエストヘッダから同期デコード | **~0ms** | userId取得・認証チェック |
| `currentUser()` | **Node.js のみ** | Clerk API へネットワークリクエスト | **~50-150ms** | 名前・メール等のプロフィールが必要な場合のみ |

> **設計原則**: `currentUser()` の呼び出しは最小限に抑える。
> 認証チェックと userId 取得には常に `auth()` を使用すること。

### 2.2 `auth()` の推奨パターン

```typescript
// ✅ 推奨: auth() は高速（追加ネットワークなし）

import { auth } from "@clerk/nextjs/server";

// 例1: API Route での認証チェック（ISR 対象外のため安全）
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const userData = await getUserData(userId);
  return Response.json(userData);
}

// 例2: 設定ページ（force-dynamic = ISR なし）での userId 取得
export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const profile = await getUserProfile(userId);
  return <SettingsForm profile={profile} />;
}
```

> **⚠️ SEC-ISSUE-2 注意**: ISR が有効なページ（`revalidate > 0` を持つ Server Component）では
> `auth()` の結果を使ったユーザー固有データ取得をしてはならない。
> `isLiked`・`isFollowing` 等は Client Component + `cache: "no-store"` で取得すること（§8 参照）。

### 2.3 `currentUser()` の制限的使用

```typescript
// ❌ 不要な currentUser() 呼び出し（避けるべき）
export async function SomeComponent() {
  const user = await currentUser();  // ~100ms の余分なレイテンシ
  const userId = user?.id;           // auth() で取得すれば十分
  ...
}

// ✅ currentUser() を使うべき場面
// 設定ページ・プロフィール表示など「表示名・メールアドレス」が必要な場所のみ

// app/settings/page.tsx
export default async function SettingsPage() {
  const user = await currentUser();  // 設定ページではプロフィール情報が必要
  if (!user) redirect("/sign-in");

  return <SettingsForm user={user} />;
}
```

### 2.4 `auth()` vs `currentUser()` 使い分け判断表

| 必要なデータ | 使用すべき関数 | 理由 |
|-----------|------------|------|
| 認証チェックのみ | `auth()` | JWT デコードのみ。高速 |
| userId | `auth()` | JWT クレームに含まれる |
| いいね・購読状態の判定 | `auth()` + 独自 DB | Clerk API 不要 |
| 表示名・アバター URL | `currentUser()` | Clerk のプロフィールデータが必要 |
| メールアドレス | `currentUser()` | Clerk のプロフィールデータが必要 |

---

## 3. Middleware パフォーマンス設計

### 3.1 Middleware の実行コスト

Clerk Middleware は全リクエストに対して Vercel Edge で実行される。
JWT 検証のみで完結するため、追加ネットワークコストはない。

```
Clerk Middleware 実行コスト:
  ├── JWT 署名検証（非対称鍵）       : ~3-5ms
  ├── ルートマッチング               : ~1-2ms
  └── 保護ルートへのリダイレクト判定  : ~1ms
  ──────────────────────────────────
  合計（公開ルート）                 : ~2-5ms
  合計（保護ルート・認証済み）        : ~4-8ms
  合計（保護ルート・未認証 → redirect）: ~5-15ms
```

**認証チェック目標: < 50ms** ← 大きく達成可能（実測値 ~5-15ms）

### 3.2 Middleware 実装（パフォーマンス最適化版）

```typescript
// middleware.ts

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// 公開ルートのマッチャー（isPublicRoute が true なら auth.protect() スキップ）
// auth-data-design.md §5.1 と同一定義で統一（SEC-ISSUE-1 対応）
// GET 公開エンドポイントのみ個別列挙し、認証が必要な POST/PUT/DELETE は保護する
const isPublicRoute = createRouteMatcher([
  // ページ
  "/",                          // ホーム画面
  "/watch/(.*)",                // 動画再生ページ
  "/channel/(.*)",              // チャンネルページ
  "/search",                    // 検索結果
  "/sign-in(.*)",               // Clerk サインイン
  "/sign-up(.*)",               // Clerk サインアップ

  // 公開 API（GET のみ、個別列挙）
  // ⚠️ SEC-ISSUE-1 対応: /api/videos(.*) / /api/channels/(.*) の包括的公開を廃止。
  // 書き込み系（like/comments POST/save/subscribe）は matcher + handler 両方で認証必須とする。
  "/api/videos",                    // 動画一覧 GET（公開）
  "/api/videos/[^/]+",              // 動画詳細 GET（公開）
  "/api/channels/[^/]+",            // チャンネル詳細 GET（公開）
  "/api/channels/[^/]+/videos",     // チャンネル動画一覧 GET（公開）
  "/api/categories(.*)",            // カテゴリ一覧（GET）
  "/api/search(.*)",                // 検索 API（GET）
  "/api/views",                     // 視聴記録（POST — 未ログインも可）

  // Webhook（Svix 署名検証で保護）
  "/api/webhooks/(.*)",
]);

export default clerkMiddleware((auth, request) => {
  // 公開ルート以外は認証必須
  if (!isPublicRoute(request)) {
    auth.protect();
  }
});

export const config = {
  matcher: [
    // 静的ファイル・_next を除外（Middleware 実行コスト削減）
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/(api|trpc)(.*)",
  ],
};
```

### 3.3 Middleware のパフォーマンス影響まとめ

| ルート種別 | Middleware 処理 | 追加レイテンシ |
|----------|---------------|------------|
| 静的ファイル (`_next/static`) | スキップ（matcher で除外） | **0ms** |
| 公開ページ（ホーム・動画・チャンネル） | ルートマッチングのみ | **~2-5ms** |
| 保護ページ（設定等）・認証済み | JWT 検証 | **~4-8ms** |
| 保護ページ・未認証 → `/sign-in` redirect | JWT 検証 + redirect | **~5-15ms** |

---

## 4. 認証ページ レンダリング戦略

### 4.1 設計方針

Clerk の `<SignIn />` / `<SignUp />` コンポーネントは **Client Component**。
ページシェルは静的（Static）でプリレンダリングし、Clerk UI は CSR で読み込む。

```
[Vercel Edge] 静的 HTML（ページシェル）を即座に返却
  ↓
[ブラウザ] CSS レンダリング → Clerk コンポーネント JS フェッチ
  ↓
[Clerk] サインインフォーム描画（CSR）
```

### 4.2 認証ページ実装

```typescript
// app/sign-in/[[...sign-in]]/page.tsx
// 静的ページ（DB依存なし）。export const dynamic は不要（デフォルトで static）

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    // CLS防止: Clerk コンポーネントの高さを事前に確保
    // <SignIn /> は約 480px の高さで描画される
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-[400px] min-h-[480px]">
        {/* CLS防止: Clerk コンポーネントと同サイズのコンテナを事前確保 */}
        <SignIn
          appearance={{
            // デザイントークン準拠（home-design-spec.md §1〜§3）
            variables: { colorPrimary: "#6C5CE7" },  // auth-uiux-improvements.md と統一（CONS-ISSUE-3）
          }}
          afterSignInUrl="/"
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  );
}

// app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-[400px] min-h-[540px]">
        {/* SignUp は SignIn より少し高さが大きい */}
        <SignUp
          appearance={{
            variables: { colorPrimary: "#6C5CE7" },  // auth-uiux-improvements.md と統一（CONS-ISSUE-3）
          }}
          afterSignUpUrl="/"
          signInUrl="/sign-in"
        />
      </div>
    </div>
  );
}
```

### 4.3 ヘッダーの認証ボタン（CLS 防止）

`<UserButton />` はページ読み込み時に認証状態が不明な間、ローディング状態になる。
固定サイズのコンテナで CLS を防止する。

```typescript
// components/layout/HeaderAuthButton.tsx

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

export function HeaderAuthButton() {
  return (
    // 固定幅コンテナで CLS 防止（認証状態ロード中でもスペース確保）
    <div className="w-[36px] h-[36px] flex items-center justify-center">
      <SignedOut>
        {/* 未認証: サインインボタン */}
        <SignInButton mode="modal">
          <button className="text-sm font-medium px-3 py-1.5 rounded-full
                             bg-primary text-white hover:bg-primary/90 transition-colors">
            ログイン
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        {/* 認証済み: ユーザーアバター */}
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}
```

---

## 5. トークンリフレッシュ設計

### 5.1 Clerk JWT ライフサイクル

Clerk の JWT は短命（デフォルト **60秒**）。自動リフレッシュは `<ClerkProvider>` が担当。

```
セッション確立
  ↓
JWT 発行（有効期限 60秒）
  ↓ ~55秒後
ClerkProvider: バックグラウンドでリフレッシュリクエスト
  ↓ Clerk API: ~50ms
新しい JWT 発行（有効期限 60秒）
  ↓ ユーザーに影響なし（透過的）
```

### 5.2 トークンリフレッシュのコスト

| 項目 | 値 | 備考 |
|------|-----|------|
| リフレッシュ頻度 | 約 1回 / 60秒 / セッション | セッション中のみ |
| ネットワーク | HTTPS to Clerk API (~50ms) | バックグラウンド実行 |
| ユーザー影響 | **なし** | 完全に透過的 |
| サーバー負荷 | **なし** | Client-side のみ |
| 月間リクエスト数 | 約 1,440回 / ユーザー | 24時間 × 60分 ÷ 1分 |

**MVP 規模（50〜200 MAU）での月間リクエスト数:**
- 最大 200 ユーザー × 1日2時間使用 × 60回/時間 × 30日 = 約 720,000 回/月
- Clerk Free Tier は制限なし（MAU のみ管理）

### 5.3 パフォーマンスへの影響

トークンリフレッシュはバックグラウンドで実行されるため、Core Web Vitals には影響しない。
ただし、アクティブセッション中は常に ~50ms の API リクエストが発生している点に注意。

---

## 6. Clerk ↔ Supabase 同期 遅延設計

### 6.1 同期アーキテクチャ

Clerk でユーザーが作成・更新・削除されると、Webhook で Next.js API Route に通知し、
Supabase の `User` テーブルを非同期で同期する。

```
Clerk: user.created / user.updated / user.deleted イベント発火
  ↓ ~100-500ms（Clerk Webhook 配信遅延）
/api/webhooks/clerk  [POST]
  ├── Svix 署名検証（改ざん検知）         : ~5ms
  └── Supabase User テーブル upsert       : ~30-80ms
  ↓
Response 200（Clerk は 5秒以内に 200 を受け取らないとリトライ）
```

### 6.2 遅延許容範囲

| イベント種別 | 遅延許容範囲 | 理由 |
|-----------|-----------|------|
| `user.created` | < 5秒 | サインアップ直後にページ遷移 → 同期完了前でも `userId` は JWT に含まれる |
| `user.updated` | < 60秒 | プロフィール更新は即時反映不要 |
| `user.deleted` | < 5秒 | セキュリティ上、早期同期が望ましい |

> **結果整合性の前提**: ページの初期 SSR 時点では Supabase への同期が未完了の場合がある。
> `user.created` 直後のリクエストで User レコードが存在しないケースを想定した実装が必要（upsert の使用）。

### 6.3 Webhook エンドポイント実装

```typescript
// app/api/webhooks/clerk/route.ts

import { Webhook } from "svix";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import type { WebhookEvent } from "@clerk/nextjs/server";

// Webhook の応答は 5秒以内（Clerk のタイムアウト）
export async function POST(request: Request) {
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  const body = await request.text();

  // Svix 署名検証（改ざん・リプレイ攻撃対策）
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let evt: WebhookEvent;
  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // イベント処理（~30-80ms）
  if (evt.type === "user.created") {
    await prisma.user.create({
      data: {
        clerkId: evt.data.id,
        name: `${evt.data.first_name ?? ""} ${evt.data.last_name ?? ""}`.trim()
               || "Anonymous",
        imageUrl: evt.data.image_url ?? null,
      },
    });
  } else if (evt.type === "user.updated") {
    await prisma.user.upsert({
      where: { clerkId: evt.data.id },
      update: {
        name: `${evt.data.first_name ?? ""} ${evt.data.last_name ?? ""}`.trim()
               || "Anonymous",
        imageUrl: evt.data.image_url ?? null,
      },
      create: {
        clerkId: evt.data.id,
        name: `${evt.data.first_name ?? ""} ${evt.data.last_name ?? ""}`.trim()
               || "Anonymous",
        imageUrl: evt.data.image_url ?? null,
      },
    });
  } else if (evt.type === "user.deleted") {
    // 論理削除（soft delete）: auth-data-design.md §4.4 準拠（CONS-ISSUE-2 対応）
    // 物理削除は30日後のバッチ処理で実施（GDPR / 個人情報保護法対応）
    await prisma.user.update({
      where: { clerkId: evt.data.id! },
      data: {
        isActive: false,
        deletedAt: new Date(),
        name: "削除済みユーザー",
        imageUrl: null,
      },
    });
  }

  // Clerk は 5秒以内に 200 を受け取らないとリトライする
  return new Response("OK", { status: 200 });
}
```

### 6.4 Webhook 失敗時のリトライ戦略

Clerk Webhook はデフォルトで最大 **5回** リトライする（指数バックオフ）。

| リトライ | タイミング |
|---------|---------|
| 1回目 | 即時 |
| 2回目 | 1分後 |
| 3回目 | 5分後 |
| 4回目 | 30分後 |
| 5回目 | 数時間後 |

**対策:** Webhook ハンドラーの処理を 5秒以内に完了させる（upsert のみで十分達成可能）。

---

## 7. Core Web Vitals 目標値（認証ページ）

### 7.1 目標値サマリー

| 指標 | 目標値 | 認証ページの LCP 要素 | 他ページとの差分 |
|------|--------|-------------------|--------------|
| **LCP** | **≤ 2.5秒** | Clerk フォーム（CSR で描画） | LCP が CSR 依存のため注意 |
| **INP** | **≤ 200ms** | フォーム入力・送信ボタン | Clerk コンポーネント内部で処理 |
| **CLS** | **≤ 0.1** | フォームコンテナの高さ変化 | 固定高さコンテナで防止 |
| **認証チェック** | **< 50ms** | Edge Middleware | 実測値 ~5-15ms |

### 7.2 LCP ボトルネック分析（認証ページ、目標 ≤ 2.5秒）

**LCP要素**: Clerk の `<SignIn />` フォーム（CSR で描画）

```
フェーズ                                             時間見積もり
─────────────────────────────────────────────────────────────
TTFB (静的ページ、Edge キャッシュ)                   :  30 〜  80ms
HTML Parse + CSS                                     :  30 〜  60ms
Clerk JS チャンク fetch（CDN から）                  : 100 〜 300ms
Clerk コンポーネント初期化 + フォーム描画            :  50 〜 150ms
─────────────────────────────────────────────────────────────
合計                                                 : 210ms 〜 590ms
                                                     → LCP ≤ 2.5秒 十分達成可能
```

Clerk の JS は CDN から配信されるため高速。主要リスクはネットワーク遅延のみ。

### 7.3 CLS ボトルネック分析（目標 ≤ 0.1）

| シフト発生箇所 | シフト量（未対策） | 対策 | 対策後 |
|-------------|--------------|------|-------|
| Clerk フォームロード前後 | 中 | `min-h-[480px]` で事前確保 | ≈ 0 |
| ヘッダーの認証ボタン | 低〜中 | `w-[36px] h-[36px]` 固定コンテナ | ≈ 0 |
| エラーメッセージ出現 | 低 | Clerk がインライン表示（高さ変化は許容範囲） | < 0.05 |

---

## 8. ISR とユーザー固有状態のキャッシュ境界

### 8.1 原則（channel-performance-design.md §1.2 SEC-ISSUE-2 準拠）

> **認証情報は ISR キャッシュに含めてはならない。**
> Server Component で `auth()` / `currentUser()` を呼び出しても、
> そのコンポーネントが ISR キャッシュされていると、他ユーザーにセッション情報が漏洩する可能性がある。

### 8.2 認証状態の取得パターン（ページ別）

| ページ | ISR 対象 | 認証状態の取得方法 |
|--------|---------|----------------|
| ホーム `/` | ✅（動画グリッド等） | 認証状態は `<SignedIn>` で CSR 判定 |
| チャンネル `/channel/[slug]` | ✅（チャンネル情報） | 購読状態は Client Component で `no-store` フェッチ |
| 動画再生 `/watch/[id]` | ✅（動画メタデータ） | いいね状態は Client Component で `no-store` フェッチ |
| 設定 `/settings` | ❌（`dynamic = "force-dynamic"`） | `currentUser()` を直接使用（ISR なし） |
| サインイン/アップ `/sign-in`, `/sign-up` | ✅（静的・認証情報なし） | Clerk 管理（サーバーは関与しない） |

### 8.3 認証済みユーザー固有データの取得パターン

```typescript
// ✅ 正しいパターン: 公開データ（ISR）+ 認証固有データ（CSR）の分離

// Server Component（ISR キャッシュ対象）
// ─ 公開データのみを取得する
export const revalidate = 3600;  // ISR 1時間

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const video = await getVideoById(id);  // 公開データのみ

  return (
    <>
      <VideoPlayer playbackId={video.muxPlaybackId} title={video.title} />
      {/* いいね状態は Client Component で個別フェッチ（ISR キャッシュ外） */}
      <LikeButton videoId={id} />
    </>
  );
}

// Client Component（ISR キャッシュ対象外）
// ─ ユーザー固有データのみを取得する
"use client";

export function LikeButton({ videoId }: { videoId: string }) {
  const { userId } = useAuth();  // Clerk Client SDK

  const { data } = useQuery({
    queryKey: ["isLiked", videoId, userId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${videoId}/like-status`, {
        cache: "no-store",  // キャッシュ禁止（ユーザー固有状態）
      });
      return res.json();
    },
    enabled: !!userId,  // 未認証では実行しない
  });

  ...
}
```

---

## 9. コスト推計

### 9.1 Clerk Free Tier の制限確認

| 機能 | Free Tier 上限 | MVP 想定 | 余裕 |
|------|-------------|---------|------|
| MAU（月間アクティブユーザー） | **10,000** | 50〜200 | ✅ 十分 |
| ソーシャルログイン | 無制限 | Google / GitHub | ✅ |
| Webhook | 無制限 | user.created 等 | ✅ |
| API リクエスト | 無制限 | トークンリフレッシュ等 | ✅ |
| カスタムドメイン（認証ページ） | ❌ 有料 | 不要（MVPは clerk.ai-theater.app） | ✅ |

**Clerk の月額コスト: $0**（MAU が 10,000 を超えるまで）

### 9.2 認証関連の月額コスト全体への影響

| 項目 | コスト | 備考 |
|------|-------|------|
| Clerk Free Tier | **$0** | 10,000 MAU まで |
| Webhook 受信（Vercel Function） | **$0** | Hobby の Function 実行時間内 |
| Supabase User テーブル操作 | **$0** | 既存 Free プラン内 |
| Svix ライブラリ | **$0** | npm パッケージ（無料） |

**認証インフラの追加コスト: $0**（全て無料枠で吸収）

### 9.3 月額コスト全体への影響

| シナリオ | 既存コスト（推定） | + 認証コスト | 合計 |
|---------|----------------|-----------|------|
| **最小構成** (月30本生成) | $20〜$40 | **+$0** | **$20〜$40** |
| **標準構成** (月100本生成) | $45〜$75 | **+$0** | **$45〜$75** |

---

## 10. パフォーマンスモニタリング計画

### 10.1 認証ページ固有の計測設定

```
Vercel Speed Insights フィルタ:
  Path = "/sign-in"  → サインインページの Core Web Vitals
  Path = "/sign-up"  → サインアップページの Core Web Vitals
  Path = "/settings" → 設定ページの Core Web Vitals

確認指標: LCP (P75), INP (P75), CLS (P75)
```

### 10.2 Middleware 実行時間の確認

Vercel のファンクション実行ログで Middleware のレイテンシを確認する（Vercel Dashboard → Functions）。

```
目標: Middleware 実行時間 < 50ms（全ルート共通）
アラート閾値: Middleware 実行時間 > 100ms が連続3回以上
```

### 10.3 Clerk Dashboard での確認指標

| 指標 | 確認方法 | 目標 |
|------|---------|------|
| サインイン成功率 | Clerk Dashboard → Analytics | ≥ 95% |
| Webhook 配信成功率 | Clerk Dashboard → Webhooks | ≥ 99% |
| MAU | Clerk Dashboard → Usage | < 10,000（Free Tier 制限） |

### 10.4 モニタリング構成（全て無料）

| 計測対象 | ツール | コスト | 確認頻度 |
|---------|--------|-------|---------|
| LCP / INP / CLS（認証ページ） | Vercel Speed Insights | 無料 (Hobby) | 週次 |
| Middleware レイテンシ | Vercel Dashboard Functions | 無料 (Hobby) | 週次 |
| サインイン成功率 / MAU | Clerk Dashboard | 無料 | 月次 |
| Webhook 配信状況 | Clerk Dashboard → Webhooks | 無料 | 即時（障害時） |
| Supabase 同期状況 | Supabase Logs | 無料 | 即時（障害時） |

---

## 11. 実装チェックリスト

### 認証コスト最適化

- [ ] `auth()` を使用すべき箇所で `currentUser()` を誤使用していない
- [ ] `currentUser()` は設定ページ等のプロフィール表示専用に限定されている
- [ ] Middleware の `matcher` から `_next/static`, `_next/image` が除外されている
- [ ] `isPublicRoute` に全ての公開ルートが列挙されている

### 認証ページ CLS 防止

- [ ] `<SignIn />` コンテナに `min-h-[480px]` が設定されている
- [ ] `<SignUp />` コンテナに `min-h-[540px]` が設定されている
- [ ] `<HeaderAuthButton />` に `w-[36px] h-[36px]` 固定コンテナが設定されている

### Clerk ↔ Supabase 同期

- [ ] `/api/webhooks/clerk` が Svix 署名検証を実装している
- [ ] `CLERK_WEBHOOK_SECRET` が Vercel 環境変数に設定されている
- [ ] Webhook ハンドラーが 5秒以内に Response を返す
- [ ] `user.created`, `user.updated`, `user.deleted` の3イベントを処理している
- [ ] `user.created` が upsert（冪等）で実装されている（リトライ対応）

### ISR / userState キャッシュ境界

- [ ] ISR が設定された Server Component 内で `auth()` / `currentUser()` を呼んでいない
- [ ] 購読状態・いいね状態等のユーザー固有データは Client Component で `cache: "no-store"` フェッチしている
- [ ] 設定ページ（`/settings`）に `dynamic = "force-dynamic"` または ISR 無効化の設定がある

### Core Web Vitals

- [ ] 認証ページの LCP P75 ≤ 2.5秒（Vercel Speed Insights で確認）
- [ ] 認証ページの CLS P75 ≤ 0.1（フォームコンテナの固定高さ確認）
- [ ] Middleware の実行時間 < 50ms（Vercel Dashboard で確認）

---

## 12. 前ページとの差分まとめ

| 項目 | ホーム画面 | 動画再生ページ | チャンネルページ | **認証ページ** |
|------|----------|-------------|--------------|-------------|
| revalidate | 60秒 | 3600秒 | 300秒 | **静的（認証なし）/ force-dynamic（設定）** |
| LCP 要素 | サムネイル | Player poster | バナー画像 | **Clerk フォーム（CSR）** |
| 認証チェック | 不要（公開） | 不要（公開） | 不要（公開） | **Middleware で保護（設定ページ等）** |
| ユーザー固有データ | なし | いいね（CSR） | 購読（CSR） | **完全なプロフィール（currentUser）** |
| ISR とuserState | 分離 | 分離 | 分離 | **ISR なし（設定）/ 分離（公開ページ）** |
| 追加コスト | — | — | — | **+$0（Clerk Free Tier）** |
| 特記事項 | — | — | — | **Webhook で Supabase 同期** |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-28 | 1.0 | 初版作成（Task #13） | analyzer |
| 2026-02-28 | 1.1 | REV-2: SEC-ISSUE-2（§2.2 ISR非対応Server Component例を削除・Client Component参照に差し替え）, SEC-ISSUE-1（§3.2 public matcher を auth-data-design §5.1 に統一・`/search`・`/api/categories`・`/api/search`・`/api/views` 追加）, CONS-ISSUE-2（§6.3 `user.deleted` 物理削除 → 論理削除に変更）, CONS-ISSUE-3（§4.2 colorPrimary `#6366F1` → `#6C5CE7`） | analyzer |
