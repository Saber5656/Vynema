# 認証・ユーザー管理 UI/UX 改善提案

作成日: 2026-02-28
担当: designer
Task: #11

---

## 0. 概要

AI Theater の認証・ユーザー管理ページ（`/sign-in` / `/sign-up` / `/settings`）について、
Clerk の UI カスタマイズとブランドデザイントークン統合を中心に設計する。
AI Theater は **AIのみが動画を投稿する** プラットフォームのため、人間ユーザーは **視聴者のみ** として認証設計を行う。

---

## 1. 競合プラットフォームの認証 UX 分析

### 1.1 競合比較

| プラットフォーム | 認証手段 | 未認証体験 | 問題点 |
|----------------|---------|-----------|-------|
| **YouTube** | Google アカウント必須 | 視聴は可能、操作全般は Google ログインを要求 | 「ログインを強要するモーダル」が過剰に出現し UX を損なう |
| **Twitch** | メール/パスワード + ソーシャル (Twitch/Amazon) | 視聴は完全に自由 | 登録フォームが長く離脱率が高い |
| **Runway** | Google OAuth + メール/パスワード | ランディングページのみ閲覧可、使用は要認証 | SaaS のため全機能に認証が必要な設計 |
| **Pika** | Google OAuth + メール | すべての機能に認証必須 | AI生成ツールのため認証必須は許容 |

### 1.2 AI Theater の差別化方針

```
YouTube 的アプローチ（過剰なログイン要求）
├── すべての操作でログインを要求
└── 視聴中にも繰り返しモーダルが表示

AI Theater のアプローチ（視聴者ファースト）
├── 動画閲覧・検索・チャンネル閲覧: 認証不要
├── インタラクション（いいね・コメント・保存・登録）: 初回のみ軽量AuthModalで要求
└── 設定ページ: リダイレクト認証（自然な遷移）
```

---

## 2. 認証手段の取捨選択

### 2.1 MVP で対応する認証手段

| 手段 | 採用 | 理由 |
|------|------|------|
| **Google OAuth** | ✅ **採用** | 最も広く使われる。US-001「Google OAuthサインアップが可能」に明示 |
| **GitHub OAuth** | ✅ **採用** | テック系ユーザー層（AI・テクノロジーに関心のある視聴者）にフィット |
| メール/パスワード | ❌ MVP外 | Clerk のパスワード管理・リセットフローの複雑性がMVP予算に不釣り合い |
| マジックリンク | ❌ MVP外 | メール送信インフラのコスト・デバッグコストが高い |
| Apple OAuth | ❌ MVP外 | iOS ネイティブアプリ非対応のため不要 |

**⚠️ MVP 確定方針**: 認証手段は **Google OAuth + GitHub OAuth のみ**。Email/Password・MagicLink・Apple は **Phase 2 以降** とし、MVP では Clerk Dashboard で無効化する。auth-data-design.md との source of truth はこの §2 とし、Data 設計でメール/パスワードが有効化されている場合は本方針に合わせて修正すること（CONS-ISSUE-1）。

**Phase 2 追加候補**: メール/パスワード（Clerk 標準機能で後から容易に追加可能）

### 2.2 Clerk 設定方針

```typescript
// clerk.config または Clerk Dashboard 設定
// 有効化する認証プロバイダー:
// - OAuth: Google, GitHub
// - Email/Password: 無効
// - Phone Number: 無効
// - Magic Link: 無効
//
// セッション設定:
// - Session duration: 7日間
// - Multi-session: 有効（複数タブ対応）
```

---

## 3. 認証ガード設計（未認証ユーザーの体験）

### 3.1 操作別の認証要求パターン

| 操作 | 認証要求 | 方式 | 参照 |
|------|---------|------|------|
| 動画閲覧・再生 | **不要** | — | US-002 |
| 検索 | **不要** | — | — |
| チャンネルページ閲覧 | **不要** | — | US-040 |
| 動画へのいいね/低評価 | **必要** | AuthModal | US-032 |
| コメント投稿 | **必要** | AuthModal | US-030 |
| 動画の保存（お気に入り） | **必要** | AuthModal | US-033 |
| チャンネル登録（Subscribe） | **必要** | AuthModal | US-041 |
| /settings へのアクセス | **必要** | Redirect → /sign-in | US-003 |
| 通知設定 | **必要** | Redirect → /sign-in | — |

### 3.2 AuthModal 設計

> 未認証ユーザーが保護操作を実行しようとした際に表示するインラインモーダル。
> ページ遷移を発生させず、操作のコンテキストを維持する。

```
AuthModal (shadcn/ui Dialog)
┌──────────────────────────────────────────────┐
│  [×]                                         │
│                                              │
│  🔮 AI Theater                               │
│  ────────────────────────────────────        │
│  ログインして続けましょう                      │
│  ─ {context} するにはログインが必要です ─      │
│  例: "コメントを投稿するには..."               │
│      "動画を保存するには..."                  │
│      "チャンネルを登録するには..."            │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  G  Google でログイン                  │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  ⬡  GitHub でログイン                  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  アカウントをお持ちでない方                   │
│  → アカウントを作成（/sign-up へ）           │
│                                              │
└──────────────────────────────────────────────┘
```

**AuthModal コンポーネント設計:**

```
AuthModal
├── Container (shadcn/ui Dialog)
│   ├── max-width: 400px
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 16px
│   └── Padding: 32px 24px
│
├── Logo Row
│   ├── Icon: 🔮 (AI Theater ロゴ)
│   └── Title: "AI Theater", Space Grotesk 20px, 700, #F0F6FC
│
├── Heading
│   ├── Font: Inter, 16px, weight 600, color: #F0F6FC
│   └── Content: "ログインして続けましょう"
│
├── Context Message
│   ├── Font: Inter, 14px, weight 400, color: #8B949E
│   └── Content: "{action}するにはログインが必要です"
│       └── action は呼び出し元から props で受け取る
│           例: "コメントを投稿" / "動画を保存" / "チャンネルを登録"
│
├── OAuth Buttons (flex, flex-direction: column, gap: 12px)
│   ├── Google Button
│   │   ├── Background: #1C2333, border: 1px solid #30363D
│   │   ├── Border-radius: 8px, Height: 44px, Width: 100%
│   │   ├── Display: flex, align-items: center, justify-content: center, gap: 10px
│   │   ├── Icon: Google SVG, 20px
│   │   ├── Text: "Google でログイン", 14px, weight 500, #F0F6FC
│   │   └── Hover: bg #21262D
│   └── GitHub Button
│       ├── (same style as Google)
│       ├── Icon: Lucide Github, 20px, #F0F6FC
│       └── Text: "GitHub でログイン"
│
├── Footer (サインアップ導線)
│   ├── Font: Inter, 13px, color: #8B949E
│   └── Content: "アカウントをお持ちでない方 "
│       └── + Link: "アカウントを作成", color: #8B7CF8, href: /sign-up
│
└── Legal Footer (LEG-ISSUE-1 対応)
    ├── Font: Inter, 11px, color: #7A8390
    ├── Margin-top: 12px
    ├── Content: "続行することで、"
    ├── Link: "利用規約", color: #8B7CF8, href: /terms
    ├── " および "
    ├── Link: "プライバシーポリシー", color: #8B7CF8, href: /privacy
    └── " に同意したことになります。認証は Clerk が管理し、視聴履歴・保存・コメント等はアプリ DB で管理します。"
```

**AuthModal トリガー実装:**

```typescript
// hooks/useAuthGuard.ts
export function useAuthGuard() {
  const { isSignedIn } = useAuth()   // Clerk
  const [isOpen, setIsOpen] = useState(false)
  const [actionContext, setActionContext] = useState('')

  const requireAuth = (action: string, callback: () => void) => {
    if (isSignedIn) {
      callback()
    } else {
      setActionContext(action)
      setIsOpen(true)
    }
  }

  return { isOpen, setIsOpen, actionContext, requireAuth }
}

// 使用例
const { requireAuth } = useAuthGuard()
<Button onClick={() => requireAuth('コメントを投稿', handleComment)}>
  コメントする
</Button>
```

### 3.3 Redirect 認証（保護ページ）

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher([
  '/settings(.*)',
  '/library(.*)',
  '/notifications(.*)',
])

// SEC-ISSUE-3 対応: redirect_url は相対パスのみ許可。
// 絶対 URL・外部ドメインを渡すと Open Redirect 脆弱性になるため、
// Clerk の afterSignInUrl は allowlist（相対パス限定）で検証する。
const ALLOWED_REDIRECT_PATHS = /^\/[a-zA-Z0-9\-_/?#=%&]*/

function sanitizeRedirectUrl(rawUrl: string): string {
  try {
    const path = new URL(rawUrl).pathname + new URL(rawUrl).search
    return ALLOWED_REDIRECT_PATHS.test(path) ? path : '/'
  } catch {
    // req.url が相対パスの場合はそのまま検証
    return ALLOWED_REDIRECT_PATHS.test(rawUrl) ? rawUrl : '/'
  }
}

export default clerkMiddleware((auth, req) => {
  if (isProtectedRoute(req)) {
    // 相対パスのみを redirect 先として渡す（Open Redirect 防止）
    const redirectPath = sanitizeRedirectUrl(req.nextUrl.pathname + req.nextUrl.search)
    auth().protect({
      unauthenticatedUrl: `/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`,
    })
  }
})
```

---

## 4. /sign-in ページ設計

### 4.1 ページレイアウト

```
デスクトップ (1440px):
┌─────────────────────────────────────────────────┐
│                 Header (h=64, fixed)             │
├──────────────────────┬──────────────────────────┤
│                      │                           │
│  左半分: ブランド区   │  右半分: Sign-in フォーム │
│  (gradient bg)       │  (surface bg)             │
│                      │                           │
│  🔮                  │  ┌────────────────────┐  │
│  AI Theater          │  │ Clerk <SignIn />    │  │
│                      │  │                    │  │
│  "AIが創る映像の      │  │ Google ボタン      │  │
│   劇場へようこそ"     │  │ GitHub ボタン      │  │
│                      │  │                    │  │
│  最新AI動画を         │  │ ───── or ────────  │  │
│  今すぐ視聴           │  │ （Phase 2: email） │  │
│                      │  └────────────────────┘  │
│                      │  アカウントを作成 →        │
└──────────────────────┴──────────────────────────┘

モバイル (375px):
┌─────────────────────────────┐
│ [←] AI Theater              │ (Header なし or minimized)
├─────────────────────────────┤
│  🔮 AI Theater              │
│  "ログイン"                 │
│  ┌─────────────────────┐    │
│  │ Clerk <SignIn />    │    │
│  └─────────────────────┘    │
│  アカウントを作成 →           │
└─────────────────────────────┘
```

**ページスペック:**

```
SignInPage
├── Layout
│   ├── Desktop: 2カラム (50% / 50%), min-height: 100vh
│   ├── Mobile: 単一カラム, padding: 24px 16px
│   └── Background: #0D1117
│
├── Left Column (desktop のみ)
│   ├── Background: linear-gradient(135deg, rgba(108,92,231,0.15), rgba(0,210,211,0.08))
│   ├── Display: flex, flex-direction: column, justify-content: center, padding: 48px
│   ├── Logo Row
│   │   ├── Icon: 🔮 40px
│   │   └── Text: "AI Theater", Space Grotesk 28px, 700, #F0F6FC
│   ├── Tagline: "AIが創る映像の劇場へようこそ"
│   │   ├── Space Grotesk, 20px, 600, #8B949E
│   │   └── Margin-top: 24px
│   └── Feature Bullets (flex, column, gap: 16px, margin-top: 32px)
│       ├── "🎬 最新AI生成動画を無料で視聴"
│       ├── "⭐ Quality Score で高品質作品を発見"
│       └── "🔮 Runway・Sora・Veo 等の最新モデル"
│           Font: Inter, 15px, #8B949E, with icon (16px, #8B7CF8)
│
└── Right Column (form area)
    ├── Display: flex, flex-direction: column, align-items: center, justify-content: center
    ├── Padding: 48px 40px (desktop) / 24px 16px (mobile)
    ├── Background: #0D1117
    ├── Clerk <SignIn /> with custom appearance (§7 参照)
    │   ├── Width: 400px (desktop) / 100% (mobile)
    │   └── Redirect: afterSignInUrl="/" (または sanitizeRedirectUrl(returnUrl)、§3.3 参照)
    │
    └── Legal Note (LEG-ISSUE-1 対応、Clerk コンポーネント下に配置)
        ├── Width: 400px (desktop) / 100% (mobile)
        ├── Font: Inter, 11px, color: #7A8390
        ├── Text-align: center, margin-top: 12px
        ├── Content: "続行することで、"
        ├── Link: "利用規約" (#8B7CF8, href: /terms)
        ├── " および "
        ├── Link: "プライバシーポリシー" (#8B7CF8, href: /privacy)
        └── " に同意したことになります。認証は Clerk が管理し、視聴履歴・保存・コメント等はアプリ DB で管理します。"
```

### 4.2 ページメタデータ

```typescript
// app/sign-in/[[...sign-in]]/page.tsx
export const metadata = {
  title: 'ログイン | AI Theater',
  description: 'AI Theater にログインして、最新のAI生成動画を楽しみましょう。',
  robots: 'noindex', // 認証ページは検索インデックスしない
}
```

---

## 5. /sign-up ページ設計

### 5.1 ページレイアウト

> /sign-in と同一の2カラムレイアウトを使用。右カラムのみ異なる。

```
SignUpPage (右カラムのみ sign-in との差分)
└── Right Column
    └── Clerk <SignUp />
        ├── 登録完了後: afterSignUpUrl="/"
        └── ウェルカムメッセージ（Clerk EmailTemplate でカスタマイズ可）

左カラム変更点:
├── Tagline: "AIの創造性を、あなたの画面で"
└── Feature Bullets:
    ├── "💬 コメント・いいねで感想を共有"
    ├── "📺 お気に入りチャンネルをフォロー"
    └── "🔔 新着動画の通知を受け取る"
```

### 5.2 サインアップフロー（Clerk デフォルト活用）

```
ユーザーフロー:
1. /sign-up にアクセス
2. "Google でサインアップ" をクリック
3. Google OAuth → Clerk が /api/webhooks/clerk で user.created イベントを受信
4. users テーブルに { clerkId, name, imageUrl } を自動作成
5. "/" にリダイレクト（ウェルカムトースト表示）

Clerk Webhook 処理 (server-side):
app/api/webhooks/clerk/route.ts
├── user.created → CREATE users (clerkId, name, imageUrl, email)
├── user.updated → UPDATE users (name, imageUrl)
└── user.deleted → soft delete (論理削除、auth-data-design.md §5 に準拠)
```

---

## 6. /settings ページ設計

### 6.1 ページ全体レイアウト（タブUI統一）

> 動画再生ページ・チャンネルページと同様のタブUI を採用。サイドバー廃止。

```
デスクトップ (1440px):
┌──────────────────────────────────────────────────────────────┐
│  Header (fixed, h=64)                                         │
├──────────────────────────────────────────────────────────────┤
│  Page Title Area (max-w=800, mx-auto, px=24, py=32)          │
│  "設定"  Space Grotesk 24px 700                               │
├──────────────────────────────────────────────────────────────┤
│  Tab Bar (max-w=800, mx-auto, px=24)                         │
│  [ プロフィール ] [ 通知 ] [ プライバシー ] [ アカウント ]       │
│  ━━━━━━━━━━━━━━                                              │
├──────────────────────────────────────────────────────────────┤
│  Tab Content (max-w=800, mx-auto, px=24, pb=48)              │
│  <各タブのコンテンツ>                                          │
└──────────────────────────────────────────────────────────────┘

モバイル (375px):
┌──────────────────────────────┐
│ [←] 設定                     │
├──────────────────────────────┤
│ [プロフィール][通知][プライバシー][アカウント] ← 横スクロール
│ ━━━━━━━━━━━━━                │
├──────────────────────────────┤
│ <タブコンテンツ>               │
└──────────────────────────────┘
```

### 6.2 タブ構成

| タブ | コンテンツ | 主要機能 |
|------|----------|---------|
| プロフィール | 表示名・アバター | Clerk `<UserProfile>` または独自フォーム |
| 通知 | メール通知設定 | トグルスイッチ群 |
| プライバシー | 視聴履歴・データ | チェックボックス群 |
| アカウント | メール変更・削除 | Clerk 統合 + 危険ゾーン |

### 6.3 プロフィールタブ

```
ProfileTab
├── Container: max-width 800px, margin: 0 auto
│
├── Section: アバター
│   ├── Display: flex, align-items: center, gap: 24px
│   ├── Avatar Preview: 80px × 80px, border-radius: 50%
│   │   ├── Current avatar (Clerk UserButton の画像)
│   │   └── Border: 2px solid #30363D
│   └── Actions: "変更する" Button (variant="outline", size="sm")
│       └── → Clerk の UserProfile で画像変更 or 独自アップロード
│
├── Separator: 1px solid #30363D, margin: 24px 0
│
├── Section: 表示名
│   ├── Label: "表示名", Inter 14px, 600, #8B949E
│   ├── Input (shadcn/ui Input)
│   │   ├── Height: 40px, Background: #1C2333, Border: 1px solid #30363D
│   │   ├── Border-radius: 8px, Padding: 0 12px
│   │   ├── Font: Inter, 14px, #F0F6FC
│   │   └── Focus: border-color #6C5CE7, outline: 2px solid rgba(108,92,231,0.3)
│   ├── Helper: "コメントや視聴者として表示される名前です", 12px, #7A8390
│   └── Save Button: variant="default", size="sm", margin-top: 12px
│
├── Separator
│
└── Section: メールアドレス（表示のみ）
    ├── Label: "メールアドレス", 14px, 600, #8B949E
    ├── Value: "{email}" (Inter, 14px, #8B949E, read-only)
    └── Note: "変更はアカウントタブから行えます", 12px, #7A8390
```

### 6.4 通知タブ

```
NotificationTab
├── Section: メール通知
│   ├── Title: "メール通知", 16px, 700, #F0F6FC
│   └── ToggleList (flex, column, gap: 0)
│       └── NotificationToggleRow × N
│           ├── Display: flex, justify-content: space-between, align-items: center
│           ├── Padding: 16px 0, Border-bottom: 1px solid #30363D
│           ├── Left:
│           │   ├── Label: "新着動画通知", 14px, 600, #F0F6FC
│           │   └── Description: "フォロー中チャンネルの新着動画", 12px, #8B949E
│           └── Right: shadcn/ui Switch
│               ├── Checked: background #6C5CE7
│               └── Unchecked: background #30363D
│
└── NotificationToggleRow の項目:
    ├── 新着動画通知（フォロー中チャンネルの新着）
    ├── コメント返信通知
    ├── いいね通知（自分のコメントへのいいね）
    └── お知らせ・システム通知
```

### 6.5 プライバシータブ

```
PrivacyTab
├── Section: 視聴データ
│   ├── Title: "視聴データ", 16px, 700, #F0F6FC
│   └── Options:
│       ├── "視聴履歴を保存する" (Switch, default: ON)
│       │   └── Description: "レコメンドのパーソナライズに使用", 12px, #8B949E
│       └── "視聴履歴を削除" Button (variant="outline", size="sm", color: error)
│           └── → 確認ダイアログ後に DELETE /api/user/watch-history
│
├── Separator
│
└── Section: データのダウンロード
    ├── Title: "データのダウンロード（GDPR）"
    ├── Description: "アカウントに関連するデータをエクスポートできます"
    └── Button: "データをリクエスト" (variant="outline")
        └── → メールで送付（Phase 2 実装）
```

### 6.6 アカウントタブ

```
AccountTab
├── Section: メールアドレス変更（Clerk 統合）
│   ├── Title: "メールアドレス"
│   └── → Clerk <UserProfile> の EmailAddress セクションを埋め込み or
│           独自フォーム（Clerk の updateUser API 経由）
│
├── Separator
│
├── Section: 接続済みアカウント
│   ├── Title: "接続済みアカウント", 16px, 700, #F0F6FC
│   └── ConnectedAccountRow × N (Google / GitHub)
│       ├── Icon: プロバイダーアイコン 20px
│       ├── Name: "Google" / "GitHub"
│       ├── Status: "接続中" (success #3FB950) / "未接続"
│       └── Action: "切断" Button (variant="ghost", size="sm", color: error)
│
├── Separator
│
└── Section: 危険ゾーン (Danger Zone)
    ├── Title: "アカウントの削除", 14px, 600, color: #F85149
    ├── Description: "アカウントを削除すると、すべてのデータが永久に削除されます。"
    │   Font: Inter, 14px, #8B949E
    └── Delete Button: "アカウントを削除"
        ├── shadcn/ui Button variant="outline"
        ├── Border-color: #F85149, Color: #F85149
        ├── Hover: bg rgba(248,81,73,0.08)
        └── onClick: 確認ダイアログ → Clerk deleteUser() → DB 削除（US-004 GDPR対応）
```

**アカウント削除確認ダイアログ:**

```
DeleteConfirmDialog
├── Title: "本当に削除しますか？"
├── Description: "この操作は取り消せません。すべての視聴履歴・コメント・お気に入りが削除されます。"
├── Input: "削除する" と入力して確認 (shadcn/ui Input)
│   └── Delete button は入力が "削除する" と一致するまで disabled
└── Buttons:
    ├── "キャンセル" (variant="outline")
    └── "削除する" (variant="destructive", disabled until confirmed)
```

---

## 7. Clerk Appearance 設定（AI Theater ブランド統合）

### 7.1 共通 Appearance オブジェクト

```typescript
// lib/clerk-appearance.ts
import type { Appearance } from '@clerk/nextjs'

export const clerkAppearance: Appearance = {
  variables: {
    // カラー
    colorPrimary: '#6C5CE7',
    colorDanger: '#F85149',
    colorSuccess: '#3FB950',
    colorWarning: '#D29922',
    colorNeutral: '#30363D',

    // 背景
    colorBackground: '#161B22',
    colorInputBackground: '#1C2333',
    colorAlphaShade: 'rgba(240, 246, 252, 0.08)',

    // テキスト
    colorText: '#F0F6FC',
    colorTextSecondary: '#8B949E',
    colorTextOnPrimaryBackground: '#FFFFFF',
    colorInputText: '#F0F6FC',

    // その他
    colorShimmer: '#1C2333',
    fontFamily: "'Inter', system-ui, sans-serif",
    fontFamilyButtons: "'Inter', system-ui, sans-serif",
    fontSize: '14px',
    fontWeight: { normal: 400, medium: 500, bold: 600 },
    borderRadius: '8px',
    spacingUnit: '1rem',
  },
  elements: {
    // カード全体
    card: {
      backgroundColor: '#161B22',
      border: '1px solid #30363D',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      borderRadius: '16px',
      padding: '32px 28px',
    },

    // ヘッダー
    headerTitle: {
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      fontSize: '22px',
      fontWeight: '700',
      color: '#F0F6FC',
    },
    headerSubtitle: {
      fontSize: '14px',
      color: '#8B949E',
    },
    logoImage: {
      // Clerk ロゴを AI Theater ロゴに置き換える
      display: 'none', // カスタムロゴを上に配置する場合
    },

    // ソーシャルボタン
    socialButtonsBlockButton: {
      backgroundColor: '#1C2333',
      border: '1px solid #30363D',
      color: '#F0F6FC',
      fontWeight: '500',
      '&:hover': {
        backgroundColor: '#21262D',
        borderColor: '#484F58',
      },
      '&:focus-visible': {
        outline: '2px solid #8B7CF8',
        outlineOffset: '2px',
      },
    },
    socialButtonsBlockButtonText: {
      fontSize: '14px',
      fontWeight: '500',
    },

    // フォーム入力
    formFieldInput: {
      backgroundColor: '#1C2333',
      border: '1px solid #30363D',
      color: '#F0F6FC',
      '&:focus': {
        borderColor: '#6C5CE7',
        boxShadow: '0 0 0 2px rgba(108, 92, 231, 0.2)',
      },
      '&::placeholder': {
        color: '#7A8390',
      },
    },
    formFieldLabel: {
      color: '#8B949E',
      fontSize: '13px',
      fontWeight: '600',
    },

    // プライマリボタン
    formButtonPrimary: {
      backgroundColor: '#6C5CE7',
      color: '#FFFFFF',
      fontWeight: '500',
      '&:hover': { backgroundColor: '#7B6BF0' },
      '&:focus-visible': {
        outline: '2px solid #8B7CF8',
        outlineOffset: '2px',
      },
    },

    // フッターリンク
    footerActionLink: {
      color: '#8B7CF8',
      fontWeight: '500',
      '&:hover': { color: '#6C5CE7' },
    },

    // 区切り線
    dividerLine: {
      backgroundColor: '#30363D',
    },
    dividerText: {
      color: '#7A8390',
      fontSize: '12px',
    },

    // エラー
    formFieldErrorText: {
      color: '#F85149',
      fontSize: '12px',
    },
    alertText: {
      color: '#F85149',
    },
    alert: {
      backgroundColor: 'rgba(248, 81, 73, 0.08)',
      border: '1px solid rgba(248, 81, 73, 0.30)',
      borderRadius: '8px',
    },
  },
  layout: {
    // ロゴを非表示（カスタムロゴを外側に配置する場合）
    logoPlacement: 'none',
    socialButtonsPlacement: 'top',
    showOptionalFields: false,
  },
}
```

### 7.2 Clerk コンポーネント使用例

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'
import { clerkAppearance } from '@/lib/clerk-appearance'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Column (desktop) */}
      <div className="hidden lg:flex flex-1 ...">
        <BrandPanel />
      </div>

      {/* Right Column */}
      <div className="flex-1 flex items-center justify-center p-8">
        <SignIn
          appearance={clerkAppearance}
          afterSignInUrl="/"
          signUpUrl="/sign-up"
        />
      </div>
    </div>
  )
}
```

---

## 8. コンポーネント再利用・新規定義

### 8.1 再利用コンポーネント

| コンポーネント | 元ドキュメント | 再利用箇所 |
|--------------|-------------|-----------|
| `FilterChip` | home-uiux-improvements.md §4.1 | — |
| `shadcn/ui Tabs` | channel-uiux-improvements.md §4.3 | /settings タブバー |
| `shadcn/ui Switch` | 標準 | 通知設定トグル |
| `shadcn/ui Input` | 標準 | 表示名入力・確認ダイアログ |
| `shadcn/ui Dialog` | 標準 | AuthModal・削除確認 |
| `shadcn/ui Button` | 標準 | 全ボタン |

### 8.2 新規コンポーネント定義

| コンポーネント | ファイルパス（想定） | 概要 |
|--------------|---------------------|------|
| `AuthModal` | `components/auth/AuthModal.tsx` | 未認証操作トリガー時のインラインモーダル |
| `useAuthGuard` | `hooks/useAuthGuard.ts` | 認証ガードカスタムフック |
| `BrandPanel` | `components/auth/BrandPanel.tsx` | /sign-in・/sign-up 左カラムのブランド紹介パネル |
| `NotificationToggleRow` | `components/settings/NotificationToggleRow.tsx` | 通知設定の1行トグル |
| `ConnectedAccountRow` | `components/settings/ConnectedAccountRow.tsx` | OAuth連携アカウント行 |
| `DeleteConfirmDialog` | `components/settings/DeleteConfirmDialog.tsx` | アカウント削除確認ダイアログ |
| `clerkAppearance` | `lib/clerk-appearance.ts` | Clerk テーマ設定オブジェクト |

### 8.3 コンポーネント名対照表（実装名 ↔ Figma 名）（CONS-ISSUE-4 対応）

コンポーネント名が実装と Figma スペック間で揺れないよう、以下を正式名称として固定する。

| 正式名称（実装） | Figma フレーム名 | 旧名称 / エイリアス | 廃止 |
|--------------|----------------|-----------------|------|
| `BrandPanel` | `Auth/BrandPanel` | ~~SignInBrandPanel~~ | ✅ |
| `Clerk <SignIn />` | `Auth/ClerkCard (SignIn)` | ~~ClerkCard~~ (Figma 固有) | — |
| `Clerk <SignUp />` | `Auth/ClerkCard (SignUp)` | — | — |
| `AuthModal` | `Auth/AuthModal` | — | — |
| `DeleteConfirmDialog` | `Settings/DeleteConfirmDialog` | — | — |

> **注意**: `ClerkCard` は Figma のフレーム名として使用するが、実装コードでは `Clerk <SignIn />` / `Clerk <SignUp />` コンポーネントをそのまま使用する（Clerk 標準）。`BrandPanel` は /sign-in と /sign-up の両方で使用し、表示コンテンツ（tagline・bullets）は props で切り替える。

---

## 9. userState 分離パターンとの整合性

> channel-data-design.md §4.1.1 の userState 分離パターンを認証 UI に適用する。

```
認証状態変化時の UI 更新フロー:

ユーザーが AuthModal からサインイン
    ↓
Clerk の auth state が変更
    ↓
useAuth().isSignedIn が true に変更
    ↓
TanStack Query の queryKey に userId を含む query が自動再取得
    ↓
Subscribe ボタン・Like ボタン等のユーザー固有状態が更新
    ↓
AuthModal が閉じ、元の操作（コメント・保存等）が実行される
```

**Optimistic UI との組み合わせ:**

```typescript
// コメント投稿の例（AuthModal からサインイン後に実行）
const submitComment = async (body: string) => {
  // Optimistic update
  queryClient.setQueryData(['comments', videoId], (old) => [
    ...old,
    { id: 'temp', body, userId, createdAt: new Date() }
  ])
  try {
    await postComment({ videoId, body })
  } catch {
    // Rollback on error
    queryClient.invalidateQueries(['comments', videoId])
  }
}
```

---

## 10. アクセシビリティ

| 要素 | 実装 |
|------|------|
| AuthModal | `role="dialog"` + `aria-labelledby` + フォーカストラップ |
| AuthModal Close | `aria-label="閉じる"` |
| OAuth Buttons | `aria-label="Google でログイン"` 等 |
| /settings Tab Bar | shadcn/ui Tabs 標準 `role="tablist"` |
| Switch (通知設定) | shadcn/ui Switch 標準 `role="switch"` + `aria-checked` |
| Delete Confirm Input | `aria-describedby` で削除内容を説明 |
| フォームエラー | `aria-live="assertive"` + `role="alert"` (Clerk 標準) |
| Sign-in フォーカス | Clerk カード表示時に最初の OAuth ボタンにフォーカス |

---

## 11. デザイントークン準拠事項

本ドキュメントはすべて `home-uiux-improvements.md §6` に定義されたデザイントークンを使用する。
新規の色値は導入しない。

| 使用箇所 | トークン | 値 |
|---------|----------|-----|
| AuthModal OAuth ボタン背景 | `--color-surface-hover` | `#1C2333` |
| Clerk カード背景 | `--color-surface` | `#161B22` |
| Clerk 入力背景 | `--color-surface-hover` | `#1C2333` |
| フッターリンク | `--color-primary-text` | `#8B7CF8` |
| 危険ゾーン文字 | `--color-error` | `#F85149` |
| 接続済み状態 | `--color-success` | `#3FB950` |

---

## 12. 実装優先度

| コンポーネント / 機能 | 優先度 | 理由 |
|--------------------|--------|------|
| Clerk Appearance 設定 (`clerkAppearance`) | **P0** | 全認証ページに影響 |
| /sign-in・/sign-up ページ（基本構造） | **P0** | 認証フローの入口 |
| AuthModal + `useAuthGuard` | **P0** | US-030/032/033/041 の前提 |
| Clerk Middleware (route protection) | **P0** | /settings 保護 |
| /settings プロフィールタブ | **P1** | US-003 |
| /settings アカウントタブ（削除） | **P1** | US-004 GDPR |
| /settings 通知タブ | **P2** | フォロー機能と連動 |
| /settings プライバシータブ | **P2** | データ管理機能と連動 |
| /sign-in 左カラム ブランドパネル | **P2** | UX 向上（機能には非必須） |

---

## 13. ホーム画面・チャンネルページとの設計整合性

| 観点 | 統一方針 | 参照 |
|------|----------|------|
| タブUI採用（/settings） | ✅ 全画面統一 | ISSUE-VR-1 教訓 |
| デザイントークン | ✅ home-uiux-improvements.md §6 準拠 | §11 |
| text-tertiary 使用制限 | ✅ Helper テキスト等 #161B22 背景上で #8B949E を使用 | §12 |
| shadcn/ui Button・Input | ✅ 全画面共通コンポーネント | §8.1 |
| userState 分離パターン | ✅ AuthModal サインイン後に TanStack Query で再取得 | §9 |
| EU AI Act ラベル | ✅ 認証ページには不要（AIコンテンツ表示なし） | channel §15 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-28 | 1.0 | 初版作成（Clerk UIカスタマイズ・認証フロー設計・AuthModal・/settings タブUI・Appearance 設定） | designer |
| 2026-02-28 | 1.1 | レビュー指摘修正: CONS-ISSUE-1（OAuth only MVP確定・明記）、CONS-ISSUE-2（displayName→name・avatarUrl→imageUrl）、SEC-ISSUE-3（redirect_url Open Redirect 防止・相対パス限定）、LEG-ISSUE-1（利用規約・プライバシーポリシーリンク追加）、CONS-ISSUE-4（コンポーネント名対照表・BrandPanel 統一） | designer |
