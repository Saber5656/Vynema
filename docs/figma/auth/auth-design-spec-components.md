# 認証・ユーザー管理 Figma: コンポーネントスペック

> 元ファイル: [auth-design-spec.md](auth-design-spec.md) から分割（§0-3）

作成日: 2026-02-27
担当: designer
Task: #14
ステータス: **v1.0** — auth-uiux-improvements.md を統合・最終化

---

## 0. 本ドキュメントの使い方

Figma でのモックアップ再現 / 実装者向けのデザイン仕様書。
`docs/figma/home-design-spec.md` のデザイントークン体系（カラー・タイポグラフィ・スペーシング）を **そのまま継承** する。
本ドキュメントでは認証・ユーザー管理（`AuthModal` / `/sign-in` / `/sign-up` / `/settings`）固有のレイアウト・コンポーネントを定義する。

> **参照元**
> - デザイントークン全文: `docs/figma/home-design-spec.md` §1〜§3
> - チャンネルページ Figma スペック: `docs/figma/channel-design-spec.md`
> - 動画再生ページ Figma スペック: `docs/figma/video-player-design-spec.md`
> - Button / Input / Dialog スペック: `home-design-spec.md` §5、§6.2
> - アニメーション仕様: `home-design-spec.md` §7
> - アクセシビリティ基準: `home-design-spec.md` §8
> - UX 改善設計: `docs/detailed-design/auth/auth-uiux-improvements.md`

---

## 1. デザイントークン継承（差分のみ記載）

### 1.1 カラー（home-design-spec.md §1 を全継承）

認証ページ固有の追加トークンはなし。
以下は参照頻度が高いトークンの抜粋:

| トークン | Hex | 主な用途（認証ページ） |
|---------|-----|----------------------|
| `background` | `#0D1117` | ページ背景、/sign-in 右カラム |
| `surface` | `#161B22` | Clerk カード背景、AuthModal 背景 |
| `surface-hover` | `#1C2333` | OAuth ボタン背景、入力フィールド背景 |
| `surface-elevated` | `#21262D` | DeleteConfirmDialog |
| `primary` | `#6C5CE7` | formButtonPrimary 背景、プライマリアクション |
| `primary-text` | `#8B7CF8` | フッターリンク、focusリング |
| `text-primary` | `#F0F6FC` | 見出し、ボタンテキスト、入力テキスト |
| `text-secondary` | `#8B949E` | Clerk headerSubtitle、ラベル、説明文 |
| `text-tertiary` | `#7A8390` | helper テキスト（vs #161B22: 4.62:1 ✅） |
| `border` | `#30363D` | カードボーダー、入力ボーダー、セパレーター |
| `border-emphasis` | `#484F58` | hover 時ボーダー |
| `success` | `#3FB950` | OAuth 接続済みステータス |
| `error` | `#F85149` | 危険ゾーンテキスト、フォームエラー、バリデーション |
| `warning` | `#D29922` | 警告表示 |

### 1.2 タイポグラフィ（home-design-spec.md §2 を全継承）

認証ページで使用する主要スタイル:

| スタイル名 | Font | Size | Weight | Line Height | 用途 |
|-----------|------|------|--------|-------------|------|
| `heading-xl` | Space Grotesk | 28px | 700 | 36px | /sign-in ブランドパネル タイトル |
| `heading-lg` | Space Grotesk | 22px | 700 | 28px | Clerk headerTitle、設定ページタイトル |
| `heading-md` | Space Grotesk | 18px | 700 | 24px | AuthModal ロゴ行（home-design-spec.md §2.2 準拠） |
| `heading-sm` | Inter | 16px | 600 | 22px | 通知/プライバシータブ セクションタイトル |
| `body-lg` | Inter | 16px | 400 | 26px | AuthModal 見出し "ログインして続けましょう"（home-design-spec.md §2.2 準拠）。AuthModal 見出し weight は `heading-sm` (600) で上書き |
| `body-md` | Inter | 14px | 400/500 | 22px | AuthModal コンテキストメッセージ、OAuth ボタンテキスト |
| `body-sm` | Inter | 13px | 400 | 20px | /settings フッターリンク、helper テキスト |
| `caption` | Inter | 12px | 400 | 16px | helper テキスト、エラーメッセージ |
| `label-lg` | Inter | 13px | 600 | 16px | フォームラベル、設定ラベル |
| `label-sm` | Inter | 11px | 600 | 14px | Clerk headerSubtitle |

### 1.3 スペーシング（home-design-spec.md §3 を全継承）

認証ページで頻出:
- Clerk カード パディング: `32px 28px`
- AuthModal パディング: `32px 24px`
- /settings コンテンツ最大幅: `800px`
- /sign-in 左カラム パディング: `48px`
- /sign-in 右カラム パディング (desktop): `48px 40px`
- /sign-in 右カラム パディング (mobile): `24px 16px`
- OAuth ボタン高さ: `44px`
- OAuth ボタン間ギャップ: `12px`
- セクション間セパレーター マージン: `24px 0`

---

## 2. Figma フレーム設定

### 2.1 AuthModal フレーム

```
AuthModal Frame: 400 × auto (高さ可変)
├── Background: #161B22
├── Border: 1px solid #30363D
├── Border-radius: 16px
├── Padding: 32px 24px
└── Display: flex, flex-direction: column, gap: 16px
```

### 2.2 /sign-in デスクトップフレーム (1440px)

```
Desktop Frame: 1440 × 900
├── Background: #0D1117
└── 2カラム レイアウト (height: 100vh)
    ├── Left Column (720px): gradient bg, 認証不要 (desktop only)
    └── Right Column (720px): #0D1117, Clerk <SignIn />
```

### 2.3 /sign-in モバイルフレーム (375px)

```
Mobile Frame: 375 × 812
├── Background: #0D1117
├── Padding: 24px 16px
└── 単一カラム レイアウト
    ├── ロゴ行 (簡略版)
    └── Clerk <SignIn />
```

### 2.4 /settings デスクトップフレーム (1440px)

```
Desktop Frame: 1440 × 900
├── Header: Fixed, w=1440, h=64
└── Main Content (max-w=800, mx-auto)
    ├── Page Title Area (py=32, px=24)
    ├── Tab Bar (h=48, px=24)
    └── Tab Content (px=24, pb=48)
        └── <各タブ内容>
```

### 2.5 /settings モバイルフレーム (375px)

```
Mobile Frame: 375 × 812
├── Back Header (h=56): [←] 設定
├── Tab Bar (横スクロール, h=48)
└── Tab Content (px=16, pb=32)
```

---

## 3. コンポーネント詳細スペック

### 3.1 AuthModal

```
AuthModal (shadcn/ui Dialog)
├── Container
│   ├── Width: 400px (center of viewport)
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 16px
│   ├── Padding: 32px 24px
│   ├── Display: flex, flex-direction: column, gap: 16px
│   └── Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4)
│
├── Close Button [X]
│   ├── Position: absolute, top: 12px, right: 12px
│   ├── Width: 32px, Height: 32px
│   ├── Border-radius: 8px
│   ├── Background: transparent
│   ├── Hover: background #1C2333
│   ├── Icon: Lucide X, 16px, #8B949E
│   └── aria-label: "閉じる"
│
├── Logo Row
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Margin-bottom: 0
│   ├── Icon: 🔮 24px
│   └── Text: "AI Theater"
│       ├── Font: Space Grotesk, 20px, 700
│       └── Color: #F0F6FC
│
├── Heading
│   ├── Font: Inter, 16px, weight 600, line-height 22px
│   ├── Color: #F0F6FC
│   └── Content: "ログインして続けましょう"
│
├── Context Message
│   ├── Font: Inter, 14px, weight 400, line-height 22px
│   ├── Color: #8B949E
│   └── Content: "{action}するにはログインが必要です"
│       └── action prop 例: "コメントを投稿" / "動画を保存" / "チャンネルを登録"
│
├── OAuth Buttons Container
│   ├── Display: flex, flex-direction: column, gap: 12px
│   │
│   ├── Google Button
│   │   ├── Background: #1C2333
│   │   ├── Border: 1px solid #30363D
│   │   ├── Border-radius: 8px
│   │   ├── Height: 44px
│   │   ├── Width: 100%
│   │   ├── Display: flex, align-items: center, justify-content: center, gap: 10px
│   │   ├── Icon: Google SVG ロゴ, 20px × 20px
│   │   ├── Text: "Google でログイン"
│   │   │   ├── Font: Inter, 14px, weight 500
│   │   │   └── Color: #F0F6FC
│   │   ├── Hover: background #21262D, border-color #484F58
│   │   └── Focus-visible: outline 2px solid #8B7CF8, offset 2px
│   │
│   └── GitHub Button
│       ├── (同じスタイル as Google)
│       ├── Icon: Lucide Github, 20px, #F0F6FC
│       └── Text: "GitHub でログイン"
│
├── Footer (サインアップ導線)
│   ├── Display: flex, align-items: center, gap: 4px
│   ├── Font: Inter, 13px, color: #8B949E
│   ├── Content: "アカウントをお持ちでない方"
│   └── Link: "アカウントを作成"
│       ├── Color: #8B7CF8
│       ├── Font-weight: 500
│       ├── Hover: color #6C5CE7, text-decoration: underline
│       └── href: /sign-up
│
└── Legal Footer (LEG-ISSUE-1 対応)
    ├── Font: Inter, 11px
    ├── Color: #7A8390 (text-tertiary、vs #161B22: 4.62:1 ✅)
    ├── Text-align: center
    ├── Margin-top: 12px
    ├── Line-height: 16px
    ├── Content: "続行することで、{利用規約} および {プライバシーポリシー} に同意したことになります。"
    ├── Sub-content: "認証は Clerk が管理し、視聴履歴・保存・コメント等はアプリ DB で管理します。"
    ├── Link "利用規約": color #8B7CF8, href: /terms
    └── Link "プライバシーポリシー": color #8B7CF8, href: /privacy
```

**オーバーレイ（Dialog backdrop）:**

```
Backdrop
├── Position: fixed, inset: 0
├── Background: rgba(0, 0, 0, 0.5)
├── Backdrop-filter: blur(2px)
└── z-index: 50
```

### 3.2 /sign-in ページ

#### 3.2.1 左カラム (BrandPanel) — デスクトップのみ

```
BrandPanel
├── Width: 50% (720px on 1440px frame)
├── Height: 100vh
├── Background: linear-gradient(135deg, rgba(108,92,231,0.15) 0%, rgba(0,210,211,0.08) 100%)
├── Display: flex, flex-direction: column, justify-content: center
├── Padding: 48px
├── Position: relative
│
├── Logo Row
│   ├── Display: flex, align-items: center, gap: 10px
│   ├── Margin-bottom: 24px
│   ├── Icon: 🔮 40px
│   └── Text: "AI Theater"
│       ├── Font: Space Grotesk, 28px, 700
│       └── Color: #F0F6FC
│
├── Tagline (/sign-in 版)
│   ├── Content: "AIが創る映像の劇場へようこそ"
│   ├── Font: Space Grotesk, 20px, 600
│   ├── Color: #8B949E
│   └── Margin-bottom: 32px
│
├── Feature Bullets
│   ├── Display: flex, flex-direction: column, gap: 16px
│   └── BulletItem × 3
│       ├── Display: flex, align-items: flex-start, gap: 12px
│       ├── Icon (emoji or Lucide): 18px, color #8B7CF8
│       └── Text: Inter, 15px, weight 400, color #8B949E
│           Items:
│           ├── "🎬 最新AI生成動画を無料で視聴"
│           ├── "⭐ Quality Score で高品質作品を発見"
│           └── "🔮 Runway・Sora・Veo 等の最新モデル"
│
└── Background Decoration (subtle, optional)
    ├── Position: absolute, bottom: 40px, right: 40px
    ├── Opacity: 0.05
    └── Large 🔮 emoji or abstract gradient shape: 200px
```

#### 3.2.2 右カラム (Clerk SignIn area)

```
SignInRightColumn
├── Width: 50% (720px on 1440px frame)
├── Height: 100vh
├── Background: #0D1117
├── Display: flex, flex-direction: column, align-items: center, justify-content: center
├── Padding: 48px 40px (desktop) / 24px 16px (mobile)
│
├── Clerk <SignIn /> container
│   ├── Width: 400px (desktop) / 100% (mobile, max 400px)
│   └── Clerk カード (§3.3 参照)
│
└── Legal Note (LEG-ISSUE-1 対応、Clerk コンポーネント下)
    ├── Width: 400px (desktop) / 100% (mobile)
    ├── Font: Inter, 11px, #7A8390 (text-tertiary、vs #0D1117: 5.05:1 ✅)
    ├── Text-align: center, margin-top: 12px, line-height: 16px
    ├── Content: "続行することで、{利用規約} および {プライバシーポリシー} に同意したことになります。"
    ├── Sub-content: "認証は Clerk が管理し、視聴履歴・保存・コメント等はアプリ DB で管理します。"
    ├── Link "利用規約": color #8B7CF8, href: /terms
    └── Link "プライバシーポリシー": color #8B7CF8, href: /privacy
```

#### 3.2.3 /sign-up 差分（左カラム）

```
BrandPanel (/sign-up 版) — 左カラムの変更点のみ
├── Tagline: "AIの創造性を、あなたの画面で"
└── Feature Bullets:
    ├── "💬 コメント・いいねで感想を共有"
    ├── "📺 お気に入りチャンネルをフォロー"
    └── "🔔 新着動画の通知を受け取る"
```

### 3.3 Clerk カード（clerkAppearance 視覚化）

```
Clerk Card (カスタム Appearance 適用後)
├── Width: 400px (fixed)
├── Background: #161B22
├── Border: 1px solid #30363D
├── Border-radius: 16px
├── Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4)
├── Padding: 32px 28px
├── Display: flex, flex-direction: column, gap: 20px
│
├── Header Area (logoPlacement: "none" のため Clerk ロゴ非表示)
│   ├── headerTitle: Space Grotesk, 22px, 700, #F0F6FC
│   │   → /sign-in: "AI Theater にログイン"
│   │   → /sign-up: "AI Theater に登録"
│   └── headerSubtitle: Inter, 14px, #8B949E
│       → /sign-in: "アカウントにアクセス"
│       → /sign-up: "視聴を始めましょう"
│
├── Social Buttons (socialButtonsPlacement: "top")
│   └── → §3.1 AuthModal の OAuth ボタン と同スタイル
│       ├── Google Button (44px, #1C2333)
│       └── GitHub Button (44px, #1C2333)
│
├── Divider (showOptionalFields: false → Phase 2 用)
│   ├── Line: 1px solid #30363D
│   └── Text: "または" Inter, 12px, #7A8390
│       (Phase 2 でメール/パスワード追加時に使用)
│
└── Footer Action Link
    ├── Color: #8B7CF8
    ├── Font-weight: 500
    └── /sign-in → "アカウントをお持ちでない方 → 登録する"
        /sign-up → "すでにアカウントをお持ちの方 → ログイン"
```

### 3.4 /settings ページ

#### 3.4.1 SettingsHeader

```
SettingsHeader
├── Width: 100%, max-width: 800px, margin: 0 auto
├── Padding: 32px 24px 24px
├── Display: flex, align-items: center, gap: 12px (mobile: + Back Button)
│
├── Back Button (mobile only)
│   ├── Width: 40px, Height: 40px, Border-radius: 8px
│   ├── Icon: Lucide ArrowLeft, 20px, #F0F6FC
│   └── Hover: background #1C2333
│
└── Page Title: "設定"
    ├── Font: Space Grotesk, 24px, 700
    └── Color: #F0F6FC
```

#### 3.4.2 SettingsTabBar

```
SettingsTabBar (shadcn/ui Tabs)
├── Width: 100%, max-width: 800px, margin: 0 auto
├── Padding: 0 24px
├── Height: 48px
├── Display: flex, align-items: flex-end
├── Border-bottom: 1px solid #30363D
│
└── Tab Item × 4
    ├── Height: 48px
    ├── Padding: 0 16px
    ├── Font: Inter, 14px, weight 500
    ├── Cursor: pointer
    ├── Position: relative
    │
    ├── Default State
    │   └── Color: #8B949E
    │
    ├── Hover State
    │   └── Color: #F0F6FC
    │
    └── Active/Selected State
        ├── Color: #F0F6FC
        └── Active Underline
            ├── Position: absolute, bottom: 0, left: 0, right: 0
            ├── Height: 2px
            ├── Background: #6C5CE7
            └── Border-radius: 1px 1px 0 0

Tab Labels:
├── "プロフィール" (default selected)
├── "通知"
├── "プライバシー"
└── "アカウント"

Mobile: 横スクロール対応
├── Tab Bar: overflow-x: auto, scrollbar-width: none
└── Tab Item: flex-shrink: 0 (折り返さない)
```

#### 3.4.3 ProfileTab

```
ProfileTab
├── Width: 100%, max-width: 800px, margin: 0 auto
├── Padding: 24px
├── Display: flex, flex-direction: column, gap: 0
│
├── Section: アバター
│   ├── Padding: 0 0 24px 0
│   ├── Display: flex, align-items: center, gap: 24px
│   │
│   ├── Avatar Preview
│   │   ├── Width: 80px, Height: 80px (mobile: 64px)
│   │   ├── Border-radius: 50%
│   │   ├── Object-fit: cover
│   │   └── Border: 2px solid #30363D
│   │
│   └── Action Column
│       ├── Label: "プロフィール画像", Inter, 14px, 600, #8B949E
│       ├── Change Button: variant="outline", size="sm"
│       │   ├── Height: 32px, Padding: 0 12px
│       │   ├── Font: 13px, #F0F6FC
│       │   └── Border: 1px solid #484F58
│       └── Helper: "JPG, PNG または GIF、最大 5MB"
│           Font: 12px, color: #7A8390
│
├── Separator: 1px solid #30363D, margin: 0 0 24px 0
│
├── Section: 表示名
│   ├── Padding: 0 0 24px 0
│   ├── Display: flex, flex-direction: column, gap: 8px
│   │
│   ├── Label: "表示名"
│   │   ├── Font: Inter, 14px, weight 600
│   │   └── Color: #8B949E
│   │
│   ├── Input (shadcn/ui Input)
│   │   ├── Height: 40px
│   │   ├── Background: #1C2333
│   │   ├── Border: 1px solid #30363D
│   │   ├── Border-radius: 8px
│   │   ├── Padding: 0 12px
│   │   ├── Font: Inter, 14px, #F0F6FC
│   │   ├── Placeholder: color #7A8390
│   │   └── Focus: border-color #6C5CE7, box-shadow 0 0 0 2px rgba(108,92,231,0.2)
│   │
│   ├── Helper: "コメントや視聴者として表示される名前です"
│   │   Font: 12px, color: #7A8390
│   │
│   └── Save Button
│       ├── variant="default", size="sm"
│       ├── Height: 36px, Padding: 0 16px
│       ├── Background: #6C5CE7, Color: #FFFFFF
│       └── Font: Inter, 13px, 500
│
├── Separator
│
└── Section: メールアドレス（表示のみ）
    ├── Display: flex, flex-direction: column, gap: 4px
    ├── Label: "メールアドレス", 14px, 600, #8B949E
    ├── Value: "{email@example.com}"
    │   ├── Font: Inter, 14px, #8B949E
    │   └── Read-only (no input border)
    └── Note: "変更はアカウントタブから行えます"
        Font: 12px, color: #7A8390
```

#### 3.4.4 NotificationTab

```
NotificationTab
├── Width: 100%, max-width: 800px, margin: 0 auto
├── Padding: 24px
│
└── Section: メール通知
    ├── Title: "メール通知"
    │   ├── Font: Inter, 16px, 700
    │   └── Color: #F0F6FC
    │   └── Margin-bottom: 0
    │
    └── NotificationToggleRow × 4
        ├── Display: flex, justify-content: space-between, align-items: center
        ├── Padding: 16px 0
        ├── Border-bottom: 1px solid #30363D
        │
        ├── Left Column
        │   ├── Label: Inter, 14px, weight 600, #F0F6FC
        │   └── Description: Inter, 12px, #8B949E
        │
        └── Right: shadcn/ui Switch
            ├── Width: 44px, Height: 24px
            ├── Thumb: 20px × 20px, border-radius: 50%, color #FFFFFF
            ├── Track Checked: background #6C5CE7
            ├── Track Unchecked: background #30363D
            └── Transition: 200ms ease

    Rows:
    ├── Row 1: "新着動画通知" / "フォロー中チャンネルの新着動画" / default: ON
    ├── Row 2: "コメント返信通知" / "自分のコメントへの返信" / default: ON
    ├── Row 3: "いいね通知" / "自分のコメントへのいいね" / default: OFF
    └── Row 4: "お知らせ・システム通知" / "AI Theater からの重要なお知らせ" / default: ON
```

#### 3.4.5 PrivacyTab

```
PrivacyTab
├── Width: 100%, max-width: 800px, margin: 0 auto
├── Padding: 24px
├── Display: flex, flex-direction: column, gap: 0
│
├── Section: 視聴データ
│   ├── Title: "視聴データ", 16px, 700, #F0F6FC
│   ├── Margin-bottom: 16px
│   ├── ToggleRow: "視聴履歴を保存する"
│   │   ├── (NotificationToggleRow と同スタイル)
│   │   ├── Description: "レコメンドのパーソナライズに使用", 12px, #8B949E
│   │   └── default: ON
│   │
│   └── Delete History Button
│       ├── variant="outline", size="sm", margin-top: 16px
│       ├── Height: 32px, Padding: 0 12px
│       ├── Border: 1px solid #F85149
│       ├── Color: #F85149
│       └── Text: "視聴履歴を削除"
│
├── Separator: 1px solid #30363D, margin: 24px 0
│
└── Section: データのダウンロード（GDPR）
    ├── Title: "データのダウンロード（GDPR）", 16px, 700, #F0F6FC
    ├── Description: "アカウントに関連するデータをエクスポートできます"
    │   Font: Inter, 14px, #8B949E, margin: 8px 0 16px
    └── Request Button
        ├── variant="outline", size="sm"
        ├── Height: 36px, Padding: 0 16px
        ├── Border: 1px solid #484F58, Color: #F0F6FC
        └── Text: "データをリクエスト"
```

#### 3.4.6 AccountTab

```
AccountTab
├── Width: 100%, max-width: 800px, margin: 0 auto
├── Padding: 24px
├── Display: flex, flex-direction: column, gap: 0
│
├── Section: 接続済みアカウント
│   ├── Title: "接続済みアカウント", 16px, 700, #F0F6FC
│   ├── Margin-bottom: 0
│   │
│   └── ConnectedAccountRow × N (Google / GitHub)
│       ├── Display: flex, justify-content: space-between, align-items: center
│       ├── Padding: 16px 0
│       ├── Border-bottom: 1px solid #30363D
│       │
│       ├── Left Side
│       │   ├── Display: flex, align-items: center, gap: 12px
│       │   ├── Provider Icon: 20px × 20px (Google SVG / Lucide Github)
│       │   └── Info Column
│       │       ├── Name: "Google" / "GitHub", Inter, 14px, 600, #F0F6FC
│       │       └── Status:
│       │           ├── Connected: "接続中", Inter, 12px, #3FB950
│       │           └── Disconnected: "未接続", Inter, 12px, #8B949E
│       │
│       └── Right Side
│           └── Disconnect Button (接続中の場合のみ)
│               ├── variant="ghost", size="sm"
│               ├── Height: 28px, Padding: 0 8px
│               ├── Color: #F85149
│               └── Text: "切断", 13px
│
├── Separator: 1px solid #30363D, margin: 24px 0
│
└── Section: 危険ゾーン (Danger Zone)
    ├── Display: flex, flex-direction: column, gap: 8px
    ├── Title: "アカウントの削除"
    │   ├── Font: Inter, 14px, weight 600
    │   └── Color: #F85149
    │
    ├── Description: "アカウントを削除すると、すべてのデータが永久に削除されます。"
    │   Font: Inter, 14px, #8B949E
    │
    └── Delete Button
        ├── variant="outline", margin-top: 8px
        ├── Height: 40px, Padding: 0 20px
        ├── Background: transparent
        ├── Border: 1px solid #F85149
        ├── Color: #F85149
        ├── Font: Inter, 14px, weight 500
        ├── Hover: background rgba(248, 81, 73, 0.08)
        └── Text: "アカウントを削除"
```

### 3.5 DeleteConfirmDialog

```
DeleteConfirmDialog (shadcn/ui Dialog)
├── Container
│   ├── Width: 440px
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 16px
│   ├── Padding: 24px
│   └── Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6)
│
├── Header
│   ├── Display: flex, justify-content: space-between, align-items: flex-start
│   ├── Title: "本当に削除しますか？"
│   │   ├── Font: Space Grotesk, 18px, 700
│   │   └── Color: #F0F6FC
│   └── Close Button [X] (§3.1 と同スタイル)
│
├── Description
│   ├── Font: Inter, 14px, #8B949E
│   ├── Line-height: 22px
│   └── Content: "この操作は取り消せません。すべての視聴履歴・コメント・お気に入りが削除されます。"
│
├── Confirm Input Section
│   ├── Label: "確認のため「削除する」と入力してください"
│   │   ├── Font: Inter, 13px, 600, #8B949E
│   │   └── Margin-bottom: 8px
│   └── Input (同§3.4.3 Input スタイル)
│       ├── Placeholder: "削除する"
│       └── validation: value === "削除する" でのみ削除ボタン活性化
│
└── Button Row
    ├── Display: flex, justify-content: flex-end, gap: 12px
    ├── Cancel Button
    │   ├── variant="outline", Height: 40px, Padding: 0 20px
    │   └── Text: "キャンセル", #F0F6FC
    └── Delete Button
        ├── variant="destructive"
        ├── Background: #F85149 (disabled: #30363D)
        ├── Color: #FFFFFF (disabled: #7A8390)
        ├── Height: 40px, Padding: 0 20px
        ├── Disabled: value !== "削除する"
        └── Text: "削除する"
```

---

