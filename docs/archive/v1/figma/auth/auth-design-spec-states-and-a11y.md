# 認証・ユーザー管理 Figma: 状態・アニメーション・アクセシビリティ

> 元ファイル: [auth-design-spec.md](auth-design-spec.md) から分割（§4-9）

---

## 4. 状態バリエーション

### 4.1 AuthModal 状態

```
States:
├── Default (未認証ユーザーが操作トリガー時)
│   ├── Backdrop visible, Modal centered
│   └── Context Message: アクションに応じた文章
│
├── Loading (OAuth リダイレクト中)
│   ├── ボタン: disabled + Spinner (16px, #F0F6FC, animate-spin)
│   └── Backdrop: pointer-events: none
│
└── Success (サインイン完了、Modal 閉じる前の瞬間)
    └── Modal: opacity 0 → fadeOut 200ms
```

### 4.2 OAuth Button 状態

```
OAuthButton States (AuthModal / /sign-in 共通):
├── Default
│   ├── Background: #1C2333
│   ├── Border: 1px solid #30363D
│   └── Color: #F0F6FC
│
├── Hover
│   ├── Background: #21262D
│   └── Border-color: #484F58
│
├── Active (press)
│   ├── Background: #161B22
│   └── Transform: scale(0.98)
│
├── Focus-visible
│   ├── Outline: 2px solid #8B7CF8
│   └── Outline-offset: 2px
│
└── Loading (OAuth リダイレクト中)
    ├── Background: #1C2333 (変更なし)
    ├── Icon: Spinner (animate-spin), #F0F6FC
    └── Pointer-events: none
```

### 4.3 Settings Input 状態

```
SettingsInput States:
├── Default
│   ├── Background: #1C2333
│   ├── Border: 1px solid #30363D
│   └── Color: #F0F6FC
│
├── Hover
│   └── Border-color: #484F58
│
├── Focus
│   ├── Border-color: #6C5CE7
│   └── Box-shadow: 0 0 0 2px rgba(108, 92, 231, 0.2)
│
├── Error
│   ├── Border-color: #F85149
│   ├── Box-shadow: 0 0 0 2px rgba(248, 81, 73, 0.2)
│   └── Error message below: 12px, #F85149, role="alert"
│
├── Success (保存完了)
│   ├── Border-color: #3FB950
│   └── Box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.2)
│
└── Disabled
    ├── Background: #161B22
    ├── Border-color: #30363D
    ├── Color: #7A8390
    └── Cursor: not-allowed
```

### 4.4 Settings Switch 状態

```
Switch States (通知タブ / プライバシータブ):
├── Unchecked
│   ├── Track: background #30363D
│   └── Thumb: background #FFFFFF, position: left
│
├── Checked
│   ├── Track: background #6C5CE7
│   └── Thumb: background #FFFFFF, position: right
│
├── Transition: 200ms ease (thumb position + track color)
│
├── Focus-visible
│   ├── Ring: 2px solid #8B7CF8
│   └── Offset: 2px
│
└── Disabled
    ├── Track: background #30363D, opacity: 0.5
    └── Cursor: not-allowed
```

---

## 5. アニメーション / トランジション仕様

### 5.1 AuthModal アニメーション

| アニメーション | プロパティ | Duration | Easing | 用途 |
|-------------|----------|----------|--------|------|
| `modalEnter` | opacity 0→1, transform translateY(8px)→0 | 200ms | ease-out | Modal 表示時 |
| `modalExit` | opacity 1→0, transform translateY(0)→4px | 150ms | ease-in | Modal 非表示時 |
| `backdropEnter` | opacity 0→1 | 200ms | ease | Backdrop 表示時 |
| `backdropExit` | opacity 1→0 | 150ms | ease | Backdrop 非表示時 |

```css
@keyframes modalEnter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes modalExit {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(4px) scale(0.99);
  }
}
```

### 5.2 /sign-in ページ アニメーション

| アニメーション | プロパティ | Duration | Easing | 用途 |
|-------------|----------|----------|--------|------|
| `signInEnter` | opacity 0→1, translateX(16px)→0 | 300ms | ease-out | Clerk カード表示 |
| `brandEnter` | opacity 0→1, translateY(-12px)→0 | 400ms | ease-out | ブランドパネル登場 |

### 5.3 /settings タブ切り替えアニメーション

| アニメーション | プロパティ | Duration | Easing | 用途 |
|-------------|----------|----------|--------|------|
| `tabContentFadeIn` | opacity 0→1 | 150ms | ease | タブ切り替え時コンテンツ |
| `tabUnderlineMove` | transform (translateX) | 200ms | ease | アクティブ下線移動 |

### 5.4 Settings 変更保存アニメーション

| アニメーション | プロパティ | Duration | Easing | 用途 |
|-------------|----------|----------|--------|------|
| `saveSuccess` | Button: background #3FB950 → #6C5CE7 | 600ms | ease | 保存完了フィードバック |
| `inputSuccess` | border-color: #3FB950, 2秒後に解除 | 2000ms auto | — | 入力保存完了 |

```css
@keyframes saveSuccess {
  0%   { background-color: #6C5CE7; }
  30%  { background-color: #3FB950; }
  70%  { background-color: #3FB950; }
  100% { background-color: #6C5CE7; }
}
```

### 5.5 prefers-reduced-motion 対応

```css
@media (prefers-reduced-motion: reduce) {
  .modal-enter,
  .brand-enter,
  .tab-content,
  .save-success {
    animation: none;
    transition: none;
    opacity: 1;
    transform: none;
  }
}
```

---

## 6. アクセシビリティ

### 6.1 コントラスト比サマリ（認証ページ固有）

| 要素 | 前景色 | 背景色 | 比率 | AA判定 |
|------|--------|--------|------|--------|
| AuthModal 見出し | #F0F6FC | #161B22 | 15.89:1 | **PASS** |
| AuthModal コンテキスト | #8B949E | #161B22 | 5.62:1 | **PASS** |
| AuthModal footer | #8B949E | #161B22 | 5.62:1 | **PASS** |
| AuthModal リンク | #8B7CF8 | #161B22 | 5.22:1 | **PASS** |
| OAuth ボタン文字 | #F0F6FC | #1C2333 | 12.67:1 | **PASS** |
| Clerk カード見出し | #F0F6FC | #161B22 | 15.89:1 | **PASS** |
| Clerk フッターリンク | #8B7CF8 | #161B22 | 5.22:1 | **PASS** |
| /sign-in ブランド タグライン | #8B949E | gradient (~#1A0E3A) | ≥ 4.5:1 ✅ | **PASS** |
| Settings 入力テキスト | #F0F6FC | #1C2333 | 12.67:1 | **PASS** |
| Settings helper テキスト | #7A8390 | #161B22 | 4.62:1 | **PASS** |
| 危険ゾーン テキスト | #F85149 | #0D1117 | 6.13:1 | **PASS** |
| 削除ボタン文字 on bg | #F85149 | transparent/#0D1117 | 6.13:1 | **PASS** |
| 接続済みステータス | #3FB950 | #0D1117 | 7.80:1 | **PASS** |
| Switch オン テキスト | — | #6C5CE7 (thumb=white) | — | — |

### 6.2 ARIA / フォーカス チェックリスト

```
AuthModal:
├── [x] role="dialog", aria-labelledby="auth-modal-title"
├── [x] フォーカストラップ: Modal が開いた際、最初の OAuthButton にフォーカス移動
├── [x] Close Button: aria-label="閉じる"
├── [x] Esc キーで閉じる (shadcn/ui Dialog 標準)
├── [x] OAuth Button: aria-label="Google でログイン" / "GitHub でログイン"
└── [x] Modal 閉じ後: トリガーボタンにフォーカス復帰

/sign-in・/sign-up:
├── [x] Clerk が自動付与する aria 属性を尊重 (role="form", aria-labelledby 等)
├── [x] OAuth ボタン: aria-label（Clerk appearance 経由で制御）
├── [x] エラー: aria-live="assertive" + role="alert" (Clerk 標準)
└── [x] カード表示時: 最初の OAuthButton に自動フォーカス

/settings:
├── [x] Tab Bar: role="tablist", Tab Item: role="tab", aria-selected, aria-controls
├── [x] Tab Content: role="tabpanel", aria-labelledby
├── [x] Switch: role="switch", aria-checked, aria-label
├── [x] 保存ボタン: aria-busy="true" (保存中)
├── [x] Delete Input: aria-describedby="delete-confirm-description"
├── [x] DeleteDialog: role="alertdialog", aria-labelledby, aria-describedby
└── [x] 危険ゾーン: aria-label="危険な操作エリア" (optional landmark)

Keyboard Navigation:
├── Tab キー: AuthModal内 → OAuthButtons → Close → Footer Link
├── Tab キー: /settings → TabBar → Tab Content → Form Elements
├── Enter/Space: Switch・Button のアクティベート
├── Arrow Keys: TabBar の左右移動 (WAI-ARIA Tabs pattern)
└── Esc: AuthModal・DeleteDialog を閉じる
```

---

## 7. レスポンシブ対応まとめ

### 7.1 ブレークポイント

home-design-spec.md §4.1 を全継承。認証ページでの主要変更:

| ブレークポイント | /sign-in・/sign-up | /settings |
|---------------|-------------------|-----------|
| Mobile (< 768px) | 単一カラム、ブランドパネル非表示 | Tab横スクロール、Back Button表示 |
| Tablet (768px-1023px) | 単一カラム（Sign-in のみ中央配置） | Tab横スクロール（全表示可能幅次第） |
| Desktop (≥ 1024px) | 2カラム（50% / 50%） | 全タブ横並び、max-w=800px |

### 7.2 AuthModal レスポンシブ

```
Desktop (≥ 640px):
├── Position: fixed, center of viewport
├── Width: 400px
└── Max-height: calc(100vh - 48px)

Mobile (< 640px):
├── Position: fixed, bottom: 0 (Sheet スタイル)
├── Width: 100%
├── Border-radius: 16px 16px 0 0
└── Max-height: 90vh (スクロール対応)
```

---

## 8. コンポーネント一覧（Figma Component Set）

### 8.1 新規コンポーネント

| コンポーネント名 | Figma フレーム名 | 状態バリアント |
|--------------|---------------|-------------|
| `AuthModal` | Auth/AuthModal | Default, Loading |
| `OAuthButton` | Auth/OAuthButton | Default, Hover, Active, Focus, Loading |
| `BrandPanel` | Auth/BrandPanel | SignIn, SignUp |
| `Clerk <SignIn />` | Auth/ClerkCard (SignIn) | (Clerk 標準) |
| `Clerk <SignUp />` | Auth/ClerkCard (SignUp) | (Clerk 標準) |
| `SettingsTabBar` | Settings/TabBar | Profile, Notification, Privacy, Account |
| `NotificationToggleRow` | Settings/NotificationToggleRow | Checked, Unchecked |
| `ConnectedAccountRow` | Settings/ConnectedAccountRow | Connected, Disconnected |
| `DeleteConfirmDialog` | Settings/DeleteConfirmDialog | Empty, Typing, Valid |

> **命名規約 (CONS-ISSUE-4)**:
> - Figma フレーム名 `ClerkCard` は Figma 内での表現として使用。実装では `Clerk <SignIn />` / `Clerk <SignUp />` をそのまま使用（Clerk 標準コンポーネント）
> - `BrandPanel` が正式名称（旧: `SignInBrandPanel` は廃止。/sign-in・/sign-up の両方で `BrandPanel` を props 切り替えで使用）
> - 詳細は `auth-uiux-improvements.md §8.3` の対照表を参照

### 8.2 再利用コンポーネント（既存ドキュメント参照）

| コンポーネント名 | 参照元スペック | 再利用箇所 |
|--------------|-------------|-----------|
| `Header` | home-design-spec.md §5.1 | /sign-in・/sign-up・/settings |
| `Button [primary]` | home-design-spec.md §6.2 | 保存ボタン、削除ボタン |
| `Button [outline]` | home-design-spec.md §6.2 | キャンセル・各種アクション |
| `Button [ghost]` | home-design-spec.md §6.2 | 切断ボタン、Back ボタン |
| `Input` | Settings/ProfileTab §3.4.3 で定義 | 全フォーム入力 |
| `Switch` | Settings/NotificationTab §3.4.4 で定義 | 通知・プライバシー設定 |
| `EmptyState` | home-design-spec.md §6.4 | 設定読み込みエラー時 |

---

## 9. 実装ノート

### 9.1 Clerk Appearance オブジェクト参照

Clerk の視覚カスタマイズは `lib/clerk-appearance.ts` に一元管理。
詳細は `docs/detailed-design/auth/auth-uiux-improvements.md §7.1` を参照。

### 9.2 AuthModal モバイル Sheet 化

モバイル (< 640px) では `shadcn/ui Sheet` (bottom drawer) に切り替え推奨:

```
Mobile AuthModal → Sheet (bottom drawer)
├── Trigger: 同じ useAuthGuard hook
├── Side: "bottom"
├── Width: 100%
├── Border-radius: 16px 16px 0 0
├── Max-height: 90vh
└── Padding: safe-area-inset-bottom 対応
```

### 9.3 /sign-in Left Column グラジエント詳細

```css
/* BrandPanel 背景 */
background: linear-gradient(
  135deg,
  rgba(108, 92, 231, 0.15) 0%,    /* primary (#6C5CE7) 15% */
  rgba(0, 210, 211, 0.08) 60%,    /* secondary (#00D2D3) 8% */
  rgba(13, 17, 23, 0) 100%        /* background への fade */
);
/* ベース: #0D1117 */
background-color: #0D1117;
```

### 9.4 Settings タブコンテンツの遅延読み込み

/settings はクライアントコンポーネントで Tab 切り替え時に Lazy render:

```
プロフィールタブ: 初期表示（preload）
通知・プライバシー・アカウントタブ: タブ選択時に初回 render（React Suspense）
```

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-27 | 1.0 | 初版作成（AuthModal・/sign-in・/sign-up・/settings 全スペック） | designer |
| 2026-02-28 | 1.1 | レビュー指摘修正: CONS-ISSUE-3（heading-md 20px→18px・body-lg weight 600→400、home-design-spec.md §2.2 準拠）、LEG-ISSUE-1（AuthModal・/sign-in 右カラムに利用規約・プライバシーポリシーリンク + データ管理説明追加）、CONS-ISSUE-4（コンポーネント名対照表・BrandPanel / ClerkCard 命名規約固定） | designer |
