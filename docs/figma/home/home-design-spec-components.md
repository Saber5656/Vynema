# ホーム画面 Figma: コンポーネントスペック

> 元ファイル: [home-design-spec.md](home-design-spec.md) から分割（§0-5）

作成日: 2026-02-22
担当: ux-designer
Task: #8

---

## 0. 本ドキュメントの使い方

Figma でホーム画面のモックアップを再現するための完全なデザインスペック。
すべての値は px 単位（Figma のデフォルト単位）で記載。
Tailwind CSS v4 のクラス名を併記し、実装との一貫性を保証する。

---

## 1. カラーシステム（コントラスト検証済み）

### 1.1 コントラスト問題の解決

**問題**: 元のプライマリ `#6C5CE7` は `#0D1117` 背景上でコントラスト比 **3.90:1** → WCAG AA 不合格。

**解決策**: 2段階プライマリカラーシステムの採用。

| 用途 | カラー | 変数名 | 説明 |
|------|--------|--------|------|
| **プライマリ（背景/塗り用）** | `#6C5CE7` | `--color-primary` | ボタン背景、バッジ背景など。テキストは白 (#FFFFFF) を乗せる（白との比 4.86:1 → AA合格） |
| **プライマリ（テキスト用）** | `#8B7CF8` | `--color-primary-text` | ダーク背景上のプライマリテキスト・リンク色（背景との比 5.71:1 → AA合格） |

### 1.2 ダークモード カラーパレット（デフォルト）

| トークン | Hex | RGB | Tailwind v4 変数 | 用途 | vs #0D1117 | vs #161B22 |
|---------|-----|-----|-----------------|------|-----------|-----------|
| `primary` | `#6C5CE7` | 108, 92, 231 | `--color-primary` | ボタン背景、バッジ塗り | 3.90:1 (bg用) | 3.56:1 (bg用) |
| `primary-text` | `#8B7CF8` | 139, 124, 248 | `--color-primary-text` | テキスト、リンク | **5.71:1** | **5.22:1** |
| `primary-hover` | `#7B6BF0` | 123, 107, 240 | `--color-primary-hover` | ボタンホバー | 4.69:1 | 4.29:1 |
| `secondary` | `#00D2D3` | 0, 210, 211 | `--color-secondary` | AIモデルタグ | **10.06:1** | **9.19:1** |
| `accent` | `#FD79A8` | 253, 121, 168 | `--color-accent` | テーマタグ、ハイライト | **7.64:1** | **6.98:1** |
| `background` | `#0D1117` | 13, 17, 23 | `--color-background` | ページ背景 | — | — |
| `surface` | `#161B22` | 22, 27, 34 | `--color-surface` | カード背景 | — | — |
| `surface-hover` | `#1C2333` | 28, 35, 51 | `--color-surface-hover` | ホバー背景 | — | — |
| `surface-elevated` | `#21262D` | 33, 38, 45 | `--color-surface-elevated` | モーダル、ドロップダウン | — | — |
| `border` | `#30363D` | 48, 54, 61 | `--color-border` | ボーダー（装飾用、非テキスト） | 1.55:1 | 1.42:1 |
| `border-emphasis` | `#484F58` | 72, 79, 88 | `--color-border-emphasis` | 強調ボーダー | 2.39:1 | 2.18:1 |
| `text-primary` | `#F0F6FC` | 240, 246, 252 | `--color-text-primary` | メインテキスト | **17.39:1** | **15.89:1** |
| `text-secondary` | `#8B949E` | 139, 148, 158 | `--color-text-secondary` | サブテキスト | **6.15:1** | **5.62:1** |
| `text-tertiary` | `#7A8390` | 122, 131, 144 | `--color-text-tertiary` | 最小テキスト | **5.05:1** | **4.62:1** |
| `quality-gold` | `#FFC107` | 255, 193, 7 | `--color-quality-gold` | 品質スコア (>=4.0) | **11.61:1** | **10.61:1** |
| `quality-silver` | `#8B949E` | 139, 148, 158 | `--color-quality-silver` | 品質スコア (3.0-3.9) | **6.15:1** | **5.62:1** |
| `quality-dim` | `#7A8390` | 122, 131, 144 | `--color-quality-dim` | 品質スコア (<3.0) | **5.05:1** | **4.62:1** |
| `success` | `#3FB950` | 63, 185, 80 | `--color-success` | 成功 | **7.80:1** | **7.13:1** |
| `error` | `#F85149` | 248, 81, 73 | `--color-error` | エラー | **6.13:1** | **5.61:1** |
| `warning` | `#D29922` | 210, 153, 34 | `--color-warning` | 警告 | **8.36:1** | **7.64:1** |

### 1.3 ライトモード カラーパレット

| トークン | Hex | vs #FAFBFC | vs #FFFFFF |
|---------|-----|-----------|-----------|
| `primary` | `#6C5CE7` | **5.01:1** | **4.86:1** |
| `primary-text` | `#5B4BD6` | **6.31:1** | **6.13:1** |
| `secondary` | `#00A8A8` | **4.58:1** | **4.50:1** |
| `accent` | `#D63384` | **5.11:1** | **4.97:1** |
| `background` | `#FAFBFC` | — | — |
| `surface` | `#FFFFFF` | — | — |
| `surface-hover` | `#F3F4F6` | — | — |
| `border` | `#D0D7DE` | — (decorative) | — |
| `text-primary` | `#1F2328` | **16.50:1** | **16.01:1** |
| `text-secondary` | `#656D76` | **5.53:1** | **5.37:1** |
| `text-tertiary` | `#818B98` | **4.56:1** | **4.50:1** |

### 1.4 プライマリカラー使い分けルール

| 場面 | 使用カラー | 理由 |
|------|-----------|------|
| ボタン背景 | `primary` (#6C5CE7) | テキスト白 → 4.86:1 で AA合格 |
| テキストリンク | `primary-text` (#8B7CF8) | ダーク背景上 → 5.71:1 で AA合格 |
| AI Badge (背景) | `primary` (#6C5CE7) with 85% opacity | テキスト白 |
| フォーカスリング | `primary-text` (#8B7CF8) | 背景上で視認性確保 |
| アイコン (装飾的) | `primary` (#6C5CE7) | テキスト用途でないため比率不要 |
| アクティブタブの下線 | `primary` (#6C5CE7) | 装飾的要素 |
| おすすめ理由テキスト | `text-secondary` (#8B949E) | 読みやすさ優先 |
| セクションの「すべて見る→」 | `primary-text` (#8B7CF8) | テキストリンク |

### 1.5 Tailwind CSS v4 テーマ設定

```css
/* app/globals.css */
@theme {
  /* Primary - 2-tier system */
  --color-primary: #6C5CE7;
  --color-primary-text: #8B7CF8;
  --color-primary-hover: #7B6BF0;
  --color-primary-active: #5A4AD6;

  /* Secondary & Accent */
  --color-secondary: #00D2D3;
  --color-secondary-text: #00D2D3;
  --color-accent: #FD79A8;
  --color-accent-text: #FD79A8;

  /* Backgrounds */
  --color-background: #0D1117;
  --color-surface: #161B22;
  --color-surface-hover: #1C2333;
  --color-surface-elevated: #21262D;

  /* Borders */
  --color-border: #30363D;
  --color-border-emphasis: #484F58;

  /* Text */
  --color-text-primary: #F0F6FC;
  --color-text-secondary: #8B949E;
  --color-text-tertiary: #7A8390;

  /* Semantic */
  --color-success: #3FB950;
  --color-error: #F85149;
  --color-warning: #D29922;

  /* Quality Score */
  --color-quality-gold: #FFC107;
  --color-quality-silver: #8B949E;
  --color-quality-dim: #7A8390;

  /* Fonts */
  --font-heading: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
}
```

---

## 2. タイポグラフィスケール

### 2.1 フォントファミリー

| 用途 | フォント | ウェイト | Figma フォント名 |
|------|---------|---------|----------------|
| 見出し | Space Grotesk | 600, 700 | Space Grotesk SemiBold / Bold |
| 本文 | Inter | 400, 500, 600 | Inter Regular / Medium / SemiBold |
| 数値（等幅） | Inter | 500 | Inter Medium (tabular-nums) |

### 2.2 タイプスケール

| トークン | Figma テキストスタイル名 | Font | Size | Weight | Line Height | Letter Spacing | Tailwind |
|---------|----------------------|------|------|--------|-------------|---------------|----------|
| `display` | Display | Space Grotesk | 36px | 700 | 44px (1.22) | -0.5px | `text-4xl font-bold font-heading` |
| `heading-xl` | Heading XL | Space Grotesk | 28px | 700 | 36px (1.29) | -0.3px | `text-3xl font-bold font-heading` |
| `heading-lg` | Heading Large | Space Grotesk | 22px | 700 | 28px (1.27) | -0.2px | `text-xl font-bold font-heading` |
| `heading-md` | Heading Medium | Space Grotesk | 18px | 700 | 24px (1.33) | -0.1px | `text-lg font-bold font-heading` |
| `heading-sm` | Heading Small | Inter | 16px | 600 | 22px (1.38) | 0 | `text-base font-semibold` |
| `body-lg` | Body Large | Inter | 16px | 400 | 26px (1.63) | 0 | `text-base` |
| `body-md` | Body Medium | Inter | 14px | 400 | 22px (1.57) | 0 | `text-sm` |
| `body-sm` | Body Small | Inter | 13px | 400 | 20px (1.54) | 0 | `text-[13px]` |
| `caption` | Caption | Inter | 12px | 400 | 16px (1.33) | 0.1px | `text-xs` |
| `label-lg` | Label Large | Inter | 13px | 600 | 16px (1.23) | 0.2px | `text-[13px] font-semibold` |
| `label-sm` | Label Small | Inter | 11px | 600 | 14px (1.27) | 0.3px | `text-[11px] font-semibold` |
| `overline` | Overline | Inter | 11px | 500 | 14px (1.27) | 0.8px | `text-[11px] font-medium uppercase tracking-wider` |

---

## 3. スペーシングシステム（4px ベースグリッド）

### 3.1 スペーシングスケール

| トークン | 値 | Tailwind | 用途例 |
|---------|-----|---------|--------|
| `space-0` | 0px | `p-0` | — |
| `space-0.5` | 2px | `p-0.5` | バッジ内の極小余白 |
| `space-1` | 4px | `p-1` | アイコンとテキスト間、バッジ内パディング上下 |
| `space-1.5` | 6px | `p-1.5` | メタタグ間のギャップ |
| `space-2` | 8px | `p-2` | バッジ内パディング左右、カード要素間（小） |
| `space-3` | 12px | `p-3` | カード内パディング、要素間ギャップ（標準） |
| `space-4` | 16px | `p-4` | カード間ギャップ（モバイル）、セクション内余白 |
| `space-5` | 20px | `p-5` | パネル内パディング |
| `space-6` | 24px | `p-6` | カード間ギャップ（デスクトップ）、ページ横パディング |
| `space-8` | 32px | `p-8` | セクション間余白（モバイル） |
| `space-10` | 40px | `p-10` | Hero内パディング（デスクトップ） |
| `space-12` | 48px | `p-12` | セクション間余白（デスクトップ） |
| `space-16` | 64px | `p-16` | ヘッダー高さ（デスクトップ） |

### 3.2 コンポーネント間スペーシングルール

| 場所 | 間隔 | 備考 |
|------|------|------|
| カード内 要素間 | 8px | タイトル、Creator行、メタタグ行の間 |
| カード内 パディング | 12px | Info Area の内側余白 |
| カード間（グリッド） | 16px (mobile) / 24px (desktop) | `gap-4 lg:gap-6` |
| セクション間 | 32px (mobile) / 48px (desktop) | `mb-8 lg:mb-12` |
| セクションタイトルとコンテンツ間 | 16px | `mb-4` |
| ページ横パディング | 16px (mobile) / 24px (desktop) | `px-4 lg:px-6` |

---

## 4. グリッドシステム

### 4.1 ブレークポイント

| 名称 | 幅 | Tailwind prefix | カラム数 | ガター | マージン（横） |
|------|-----|----------------|---------|--------|-------------|
| Mobile S | 320px - 479px | (default) | 1 | 16px | 16px |
| Mobile L | 480px - 639px | (default) | 1 | 16px | 16px |
| Tablet | 640px - 1023px | `sm:` | 2 | 16px | 24px |
| Desktop | 1024px - 1439px | `lg:` | 3 | 24px | 24px (+ sidebar 240px) |
| Wide | 1440px - 1919px | `xl:` | 4 | 24px | 24px (+ sidebar 240px) |
| Ultra Wide | 1920px+ | `2xl:` | 5 | 24px | auto (max-width: 1800px) |

### 4.2 Figma フレーム設定

```
Desktop Frame (1440px)
├── Header: Fixed, w=1440, h=64
├── Sidebar (expanded): Fixed, w=240, h=fill
├── Content Area: w=1200 (1440-240), max-w=1800
│   ├── Padding: left=24, right=24
│   ├── Content width: 1152 (1200-48)
│   └── Grid: 4 columns, gutter=24
│       └── Column width: (1152 - 24*3) / 4 = 270px

Tablet Frame (768px)
├── Header: Fixed, w=768, h=56
├── Sidebar: Hidden (Sheet)
├── Content Area: w=768
│   ├── Padding: left=24, right=24
│   ├── Content width: 720 (768-48)
│   └── Grid: 2 columns, gutter=16
│       └── Column width: (720 - 16) / 2 = 352px

Mobile Frame (375px)
├── Header: Fixed, w=375, h=56
├── Sidebar: Hidden (Sheet)
├── Content Area: w=375
│   ├── Padding: left=16, right=16
│   ├── Content width: 343 (375-32)
│   └── Grid: 1 column
│       └── Column width: 343px
├── Bottom Nav: Fixed, w=375, h=56
```

### 4.3 コンテンツ幅の計算

```
Desktop (Sidebar展開時):
  Viewport: 1440px
  - Sidebar: 240px
  = Available: 1200px
  - Page padding: 24px * 2 = 48px
  = Content: 1152px
  Grid: 4 columns
  - Gutter: 24px * 3 = 72px
  = Total card width: 1080px
  = Per card: 270px

Desktop (Sidebar折り畳み時):
  Viewport: 1440px
  - Sidebar: 72px
  = Available: 1368px
  - Page padding: 24px * 2 = 48px
  = Content: 1320px
  Grid: 4 columns
  - Gutter: 24px * 3 = 72px
  = Per card: 312px
```

---

## 5. コンポーネント詳細スペック

### 5.1 Header

```
Header
├── Position: fixed, top: 0, left: 0, right: 0
├── z-index: 50
├── Height: 56px (mobile) / 64px (desktop)
├── Background: var(--color-background) = #0D1117
├── Border-bottom: 1px solid var(--color-border) = #30363D
├── Padding: 0 16px (mobile) / 0 24px (desktop)
├── Display: flex, align-items: center, gap: 16px
│
├── Hamburger Button
│   ├── Width: 40px, Height: 40px
│   ├── Border-radius: 8px
│   ├── Background: transparent
│   ├── Hover: var(--color-surface-hover) = #1C2333
│   ├── Icon: Lucide Menu, 20px, var(--color-text-primary)
│   └── Cursor: pointer
│
├── Logo Area
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Logo Icon: 28px * 28px (custom SVG)
│   ├── Logo Text: "AI Theater"
│   │   ├── Font: Space Grotesk, 18px, weight 700
│   │   ├── Color: var(--color-text-primary) = #F0F6FC
│   │   └── Display: hidden (mobile < 480px) / visible
│   └── Cursor: pointer (link to /)
│
├── Search Bar (desktop)
│   ├── Flex: 1, max-width: 560px
│   ├── Height: 40px
│   ├── Background: var(--color-surface) = #161B22
│   ├── Border: 1px solid var(--color-border) = #30363D
│   ├── Border-radius: 20px (pill)
│   ├── Padding: 0 16px
│   ├── Font: Inter, 14px, weight 400
│   ├── Color: var(--color-text-primary)
│   ├── Placeholder color: var(--color-text-tertiary) = #7A8390
│   ├── Focus: border-color → var(--color-primary-text) = #8B7CF8
│   │   └── box-shadow: 0 0 0 2px rgba(139, 124, 248, 0.25)
│   └── Search Icon (right): Lucide Search, 16px, var(--color-text-secondary)
│
├── Search Icon Button (mobile)
│   ├── Same as Hamburger Button
│   └── Icon: Lucide Search, 20px
│
├── Notification Bell
│   ├── Same as Hamburger Button
│   ├── Icon: Lucide Bell, 20px
│   ├── Badge (unread count)
│   │   ├── Position: absolute, top: 6px, right: 6px
│   │   ├── Min-width: 16px, Height: 16px
│   │   ├── Border-radius: 9999px
│   │   ├── Background: var(--color-error) = #F85149
│   │   ├── Font: Inter, 10px, weight 600
│   │   ├── Color: #FFFFFF
│   │   └── Padding: 0 4px
│   └── Visible: only when logged in
│
└── User Area
    ├── Logged out: shadcn/ui Button
    │   ├── Text: "ログイン"
    │   ├── Height: 36px
    │   ├── Padding: 0 16px
    │   ├── Background: var(--color-primary) = #6C5CE7
    │   ├── Color: #FFFFFF
    │   ├── Border-radius: 8px
    │   └── Font: Inter, 14px, weight 500
    │
    └── Logged in: Clerk <UserButton>
        ├── Avatar: 32px * 32px, border-radius: 50%
        └── (Clerk handles the dropdown)
```

### 5.2 Sidebar

```
Sidebar (Desktop)
├── Position: fixed, top: 64px, left: 0, bottom: 0
├── z-index: 40
├── Background: var(--color-background) = #0D1117
├── Border-right: 1px solid var(--color-border) = #30363D
├── Transition: width 200ms ease
│
├── Expanded State
│   ├── Width: 240px
│   ├── Padding: 8px 12px
│   │
│   └── Nav Item
│       ├── Display: flex, align-items: center, gap: 16px
│       ├── Height: 40px
│       ├── Padding: 0 12px
│       ├── Border-radius: 8px
│       ├── Cursor: pointer
│       ├── Icon: Lucide, 20px, var(--color-text-secondary)
│       ├── Label: Inter, 14px, weight 400, var(--color-text-primary)
│       │
│       ├── Default: background transparent
│       ├── Hover: background var(--color-surface-hover) = #1C2333
│       └── Active: background var(--color-surface-hover),
│           icon color var(--color-primary-text) = #8B7CF8,
│           label weight 500
│
├── Collapsed State
│   ├── Width: 72px
│   ├── Padding: 8px 0
│   │
│   └── Nav Item
│       ├── Display: flex, flex-direction: column, align-items: center
│       ├── Height: 64px, justify-content: center
│       ├── Icon: same as expanded
│       └── Label: Inter, 10px, weight 400, margin-top: 4px
│
├── Separator
│   ├── Height: 1px
│   ├── Background: var(--color-border) = #30363D
│   └── Margin: 8px 12px (expanded) / 8px 16px (collapsed)
│
├── Subscriptions Section
│   ├── Header: "購読中" label-sm, color text-secondary
│   └── Channel Item
│       ├── Avatar: 24px, border-radius: 50%
│       ├── Name: body-sm, color text-primary
│       └── (same layout as Nav Item)
│
└── Mobile: shadcn/ui <Sheet> (overlay drawer)
    ├── Width: 280px
    ├── Background: var(--color-background)
    ├── Overlay: rgba(0, 0, 0, 0.5)
    └── Content: same as Expanded state
```

### 5.3 VideoCard（情報リッチ版）

```
VideoCard [variant="grid"]
├── Container
│   ├── Width: fill parent (grid column)
│   ├── Min-width: 260px
│   ├── Background: var(--color-surface) = #161B22
│   ├── Border: 1px solid var(--color-border) = #30363D
│   ├── Border-radius: 12px
│   ├── Overflow: hidden
│   ├── Cursor: pointer
│   │
│   ├── Default State
│   │   ├── Transform: scale(1)
│   │   └── Box-shadow: none
│   │
│   ├── Hover State
│   │   ├── Transform: scale(1.02)
│   │   ├── Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3)
│   │   ├── Border-color: var(--color-border-emphasis) = #484F58
│   │   └── Transition: all 150ms ease
│   │
│   └── Focus-visible State
│       ├── Outline: 2px solid var(--color-primary-text) = #8B7CF8
│       └── Outline-offset: 2px
│
├── Thumbnail Area
│   ├── Aspect-ratio: 16 / 9
│   ├── Position: relative
│   ├── Overflow: hidden
│   │
│   ├── Static Thumbnail
│   │   ├── Width: 100%, Height: 100%
│   │   ├── Object-fit: cover
│   │   └── Source: image.mux.com/{id}/thumbnail.webp?width=640&time=5
│   │
│   ├── Animated Preview (hover only, desktop)
│   │   ├── Position: absolute, inset: 0
│   │   ├── Opacity: 0 → 1 on hover (delay 300ms)
│   │   ├── Transition: opacity 300ms ease 300ms
│   │   └── Source: image.mux.com/{id}/animated.gif?width=640&start=2&end=7&fps=15
│   │
│   ├── AI Badge
│   │   ├── Position: absolute, top: 8px, left: 8px
│   │   ├── Background: rgba(108, 92, 231, 0.85)
│   │   ├── Backdrop-filter: blur(4px)
│   │   ├── Padding: 4px 8px
│   │   ├── Border-radius: 6px
│   │   ├── Display: flex, align-items: center, gap: 4px
│   │   ├── Icon: Bot (Lucide), 12px, #FFFFFF
│   │   ├── Text: "AI"
│   │   │   ├── Font: Inter, 11px, weight 600
│   │   │   └── Color: #FFFFFF
│   │   └── Contrast: white on #6C5CE7@85% → ~4.1:1 (AA-large PASS)
│   │
│   └── Duration Badge
│       ├── Position: absolute, bottom: 8px, right: 8px
│       ├── Background: rgba(0, 0, 0, 0.75)
│       ├── Padding: 2px 6px
│       ├── Border-radius: 4px
│       ├── Font: Inter, 12px, weight 500, tabular-nums
│       ├── Color: #FFFFFF
│       └── Format: "mm:ss" or "h:mm:ss"
│
├── Info Area
│   ├── Padding: 12px
│   ├── Display: flex, flex-direction: column, gap: 8px
│   │
│   ├── Title
│   │   ├── Font: Inter, 14px, weight 600, line-height 20px
│   │   ├── Color: var(--color-text-primary) = #F0F6FC
│   │   ├── Max lines: 2 (line-clamp-2)
│   │   └── Overflow: hidden, text-overflow: ellipsis
│   │
│   ├── Creator Row
│   │   ├── Display: flex, align-items: center, gap: 8px
│   │   │
│   │   ├── Creator Avatar
│   │   │   ├── Width: 28px, Height: 28px
│   │   │   ├── Border-radius: 50%
│   │   │   ├── Border: 2px solid var(--color-primary) = #6C5CE7
│   │   │   └── Object-fit: cover
│   │   │
│   │   └── Creator Name
│   │       ├── Font: Inter, 13px, weight 400
│   │       └── Color: var(--color-text-secondary) = #8B949E
│   │
│   ├── MetaTag Row
│   │   ├── Display: flex, gap: 6px, flex-wrap: wrap
│   │   │
│   │   ├── Quality Badge
│   │   │   ├── Display: inline-flex, align-items: center, gap: 3px
│   │   │   ├── Background: var(--color-surface-hover) = #1C2333
│   │   │   ├── Padding: 3px 8px
│   │   │   ├── Border-radius: 9999px
│   │   │   ├── Font: Inter, 11px, weight 500
│   │   │   ├── Color (score >= 4.0): var(--color-quality-gold) = #FFC107
│   │   │   ├── Color (score 3.0-3.9): var(--color-quality-silver) = #8B949E
│   │   │   ├── Color (score < 3.0): var(--color-quality-dim) = #7A8390
│   │   │   └── Content: "★ {score}"
│   │   │
│   │   ├── Model Badge
│   │   │   ├── Background: var(--color-surface-hover) = #1C2333
│   │   │   ├── Padding: 3px 8px
│   │   │   ├── Border-radius: 9999px
│   │   │   ├── Font: Inter, 11px, weight 500
│   │   │   ├── Color: var(--color-secondary) = #00D2D3
│   │   │   └── Content: "{modelName}"
│   │   │
│   │   └── Theme Tag
│   │       ├── Background: var(--color-surface-hover) = #1C2333
│   │       ├── Padding: 3px 8px
│   │       ├── Border-radius: 9999px
│   │       ├── Font: Inter, 11px, weight 500
│   │       ├── Color: var(--color-accent) = #FD79A8
│   │       └── Content: "{theme}"
│   │
│   └── Stats Row
│       ├── Display: flex, align-items: center, gap: 4px
│       ├── Font: Inter, 12px, weight 400
│       ├── Color: var(--color-text-secondary) = #8B949E
│       └── Content: "{views} views ・ {likeRatio}% ・ {relativeTime}"
│
└── Recommendation Reason (optional, only in "おすすめ" section)
    ├── Padding: 0 12px 12px 12px
    ├── Display: flex, align-items: flex-start, gap: 4px
    ├── Background: rgba(139, 124, 248, 0.06)
    ├── Margin: 0 12px 12px 12px (inside card, below stats)
    ├── Padding (inner): 6px 10px
    ├── Border-radius: 8px
    ├── Border-left: 2px solid var(--color-primary) = #6C5CE7
    ├── Font: Inter, 11px, weight 400, line-height 16px
    └── Color: var(--color-text-secondary) = #8B949E


VideoCard [variant="list"] (検索結果)
├── Container
│   ├── Display: flex, gap: 16px
│   ├── Height: auto (content driven)
│   ├── Background: transparent
│   ├── Border: none
│   ├── Border-radius: 8px
│   ├── Padding: 8px
│   ├── Hover: background var(--color-surface-hover)
│   │
│   ├── Thumbnail
│   │   ├── Width: 360px (desktop) / 168px (mobile)
│   │   ├── Aspect-ratio: 16/9
│   │   ├── Border-radius: 8px
│   │   ├── Flex-shrink: 0
│   │   └── (same badges as grid variant)
│   │
│   └── Info (flex: 1)
│       ├── Title: Inter, 16px (desktop) / 14px (mobile), weight 600
│       ├── Stats: Inter, 13px, text-secondary
│       ├── Creator + MetaTags: same as grid
│       └── Description: Inter, 13px, text-secondary, line-clamp-2


VideoCard [variant="compact"] (関連動画)
├── Container
│   ├── Display: flex, gap: 8px
│   ├── Height: auto
│   │
│   ├── Thumbnail
│   │   ├── Width: 168px
│   │   ├── Aspect-ratio: 16/9
│   │   ├── Border-radius: 8px
│   │   ├── Flex-shrink: 0
│   │   └── AI Badge: smaller (padding: 2px 6px, font: 10px)
│   │
│   └── Info
│       ├── Title: Inter, 13px, weight 500, line-clamp-2
│       ├── Creator: Inter, 12px, text-secondary
│       └── Views + Time: Inter, 11px, text-tertiary
```

### 5.4 Hero Section

```
HeroSection
├── Container
│   ├── Width: 100%
│   ├── Height: auto
│   ├── Max-height: 400px (desktop) / 280px (mobile)
│   ├── Border-radius: 0 (mobile, full-bleed) / 16px (desktop)
│   ├── Overflow: hidden
│   ├── Position: relative
│   ├── Margin-bottom: 32px
│   │
│   ├── Background Image (blurred thumbnail)
│   │   ├── Position: absolute, inset: 0
│   │   ├── Object-fit: cover
│   │   ├── Filter: blur(40px) brightness(0.4)
│   │   └── Transform: scale(1.2) (prevent blur edges)
│   │
│   ├── Gradient Overlay
│   │   ├── Position: absolute, inset: 0
│   │   ├── Desktop: linear-gradient(to right, rgba(13,17,23,0.95) 0%, rgba(13,17,23,0.7) 40%, transparent 70%)
│   │   └── Mobile: linear-gradient(to top, rgba(13,17,23,0.95) 0%, rgba(13,17,23,0.3) 60%, transparent 100%)
│   │
│   └── Content (relative, z-index: 1)
│       ├── Display: flex (desktop) / flex-column (mobile)
│       ├── Padding: 40px (desktop) / 24px 16px (mobile)
│       ├── Gap: 32px (desktop)
│       ├── Align-items: center
│       │
│       ├── Featured Thumbnail
│       │   ├── Width: 480px (desktop) / 100% (mobile)
│       │   ├── Aspect-ratio: 16/9
│       │   ├── Border-radius: 12px
│       │   ├── Box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4)
│       │   └── Object-fit: cover
│       │
│       └── Info
│           ├── Flex: 1
│           │
│           ├── Overline: "今日のAI傑作"
│           │   ├── Font: Inter, 11px, weight 500, uppercase
│           │   ├── Letter-spacing: 0.8px
│           │   ├── Color: var(--color-primary-text) = #8B7CF8
│           │   └── Margin-bottom: 8px
│           │
│           ├── Title
│           │   ├── Font: Space Grotesk, 28px (desktop) / 22px (mobile), weight 700
│           │   ├── Color: var(--color-text-primary) = #F0F6FC
│           │   ├── Line-clamp: 2
│           │   └── Margin-bottom: 12px
│           │
│           ├── Meta (flex, gap: 12px)
│           │   ├── Quality: "★ 4.8", quality-gold
│           │   ├── Model Badge: secondary color
│           │   ├── Views: text-secondary
│           │   └── Font: Inter, 14px (desktop) / 13px (mobile)
│           │
│           ├── CTA Buttons (flex, gap: 12px, margin-top: 20px)
│           │   ├── Primary: "▶ 今すぐ再生"
│           │   │   ├── Background: var(--color-primary) = #6C5CE7
│           │   │   ├── Color: #FFFFFF
│           │   │   ├── Height: 44px
│           │   │   ├── Padding: 0 24px
│           │   │   ├── Border-radius: 10px
│           │   │   ├── Font: Inter, 15px, weight 600
│           │   │   └── Hover: background var(--color-primary-hover) = #7B6BF0
│           │   │
│           │   └── Secondary: "📋 詳細を見る"
│           │       ├── Background: transparent
│           │       ├── Border: 1px solid var(--color-border-emphasis) = #484F58
│           │       ├── Color: var(--color-text-primary) = #F0F6FC
│           │       ├── Same dimensions
│           │       └── Hover: background var(--color-surface-hover)
```

### 5.5 カルーセル

```
Carousel
├── Container
│   ├── Position: relative
│   ├── Width: 100%
│   │
│   ├── Scroll Container
│   │   ├── Display: flex
│   │   ├── Overflow-x: auto
│   │   ├── Scroll-snap-type: x mandatory
│   │   ├── Scroll-behavior: smooth
│   │   ├── Gap: 16px
│   │   ├── Padding: 0 16px (mobile) / 0 24px (desktop)
│   │   ├── Scrollbar-width: none
│   │   ├── -webkit-overflow-scrolling: touch
│   │   └── Overscroll-behavior-x: contain
│   │
│   ├── Carousel Item
│   │   ├── Flex-shrink: 0
│   │   ├── Scroll-snap-align: start
│   │   └── Width: 280px (mobile) / 300px (desktop)
│   │
│   ├── Navigation Arrow (desktop only, visible on container hover)
│   │   ├── Position: absolute, top: 50%, transform: translateY(-50%)
│   │   ├── Left arrow: left: -20px
│   │   ├── Right arrow: right: -20px
│   │   ├── Width: 40px, Height: 40px
│   │   ├── Border-radius: 50%
│   │   ├── Background: var(--color-surface-elevated) = #21262D
│   │   ├── Border: 1px solid var(--color-border) = #30363D
│   │   ├── Box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)
│   │   ├── Icon: Lucide ChevronLeft/ChevronRight, 20px, text-primary
│   │   ├── Opacity: 0 → 1 on container hover
│   │   ├── Transition: opacity 200ms ease
│   │   ├── Cursor: pointer
│   │   ├── Hover: background var(--color-surface-hover), border-color var(--color-border-emphasis)
│   │   └── Disabled: opacity 0.3, pointer-events: none
│   │
│   └── Edge Gradient (scroll hint)
│       ├── Position: absolute, top: 0, bottom: 0
│       ├── Right: 0
│       ├── Width: 60px
│       ├── Background: linear-gradient(to left, var(--color-background) 0%, transparent 100%)
│       ├── Pointer-events: none
│       └── Hidden when scrolled to end
```

### 5.6 Section Header

```
SectionHeader
├── Display: flex, justify-content: space-between, align-items: center
├── Padding: 0 16px (mobile) / 0 24px (desktop)
├── Margin-bottom: 16px
│
├── Left Side (flex, align-items: center, gap: 8px)
│   ├── Emoji: 20px (optional)
│   └── Title
│       ├── Font: Space Grotesk, 18px (mobile) / 22px (desktop), weight 700
│       └── Color: var(--color-text-primary) = #F0F6FC
│
└── Right Side
    └── "すべて見る →" Link
        ├── Font: Inter, 14px, weight 500
        ├── Color: var(--color-primary-text) = #8B7CF8
        ├── Text-decoration: none
        ├── Hover: text-decoration underline
        └── Display: flex, align-items: center, gap: 4px
            └── Arrow: Lucide ArrowRight, 14px
```

### 5.7 Filter Chips

```
FilterChipGroup
├── Display: flex, overflow-x: auto, gap: 8px
├── Padding: 0 16px (mobile) / 0 24px (desktop)
├── Scrollbar-width: none
├── Margin-bottom: 24px
│
└── FilterChip
    ├── Flex-shrink: 0
    ├── Display: inline-flex, align-items: center, gap: 4px
    ├── Padding: 8px 16px
    ├── Border-radius: 9999px
    ├── Font: Inter, 13px, weight 500
    ├── White-space: nowrap
    ├── Cursor: pointer
    ├── Transition: all 150ms ease
    │
    ├── Default State
    │   ├── Background: var(--color-surface) = #161B22
    │   ├── Border: 1px solid var(--color-border) = #30363D
    │   └── Color: var(--color-text-secondary) = #8B949E
    │
    ├── Hover State
    │   ├── Background: var(--color-surface-hover) = #1C2333
    │   ├── Border-color: var(--color-border-emphasis) = #484F58
    │   └── Color: var(--color-text-primary) = #F0F6FC
    │
    ├── Active/Selected State
    │   ├── Background: var(--color-primary) = #6C5CE7
    │   ├── Border-color: var(--color-primary) = #6C5CE7
    │   └── Color: #FFFFFF
    │
    └── Focus-visible State
        ├── Outline: 2px solid var(--color-primary-text) = #8B7CF8
        └── Outline-offset: 2px
```

### 5.8 Mood Card

```
MoodCard
├── Width: 140px (mobile) / 160px (desktop)
├── Height: 120px (mobile) / 140px (desktop)
├── Border-radius: 16px
├── Overflow: hidden
├── Cursor: pointer
├── Position: relative
├── Flex-shrink: 0
│
├── Background Gradients (per mood)
│   ├── Calm:       linear-gradient(135deg, #667EEA 0%, #764BA2 100%)
│   ├── Energetic:  linear-gradient(135deg, #F093FB 0%, #F5576C 100%)
│   ├── Dreamy:     linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)
│   ├── Fun:        linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)
│   ├── Zen:        linear-gradient(135deg, #A18CD1 0%, #FBC2EB 100%)
│   └── Mystic:     linear-gradient(135deg, #6C5CE7 0%, #FD79A8 100%)
│
├── Emoji
│   ├── Position: absolute
│   ├── Top: calc(50% - 12px), Left: 50%, transform: translateX(-50%)
│   ├── Font-size: 36px (mobile) / 40px (desktop)
│   └── Filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))
│
├── English Label
│   ├── Position: absolute
│   ├── Bottom: 28px, left: 0, right: 0
│   ├── Text-align: center
│   ├── Font: Inter, 11px, weight 500
│   └── Color: rgba(255, 255, 255, 0.8)
│
├── Japanese Label
│   ├── Position: absolute
│   ├── Bottom: 12px, left: 0, right: 0
│   ├── Text-align: center
│   ├── Font: Inter, 13px, weight 600
│   ├── Color: #FFFFFF
│   └── Text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3)
│
├── Hover State
│   ├── Transform: scale(1.05)
│   └── Transition: transform 200ms ease
│
└── Focus-visible State
    ├── Outline: 2px solid #FFFFFF
    └── Outline-offset: 2px
```

### 5.9 Bottom Navigation (Mobile)

```
BottomNav
├── Position: fixed, bottom: 0, left: 0, right: 0
├── Height: 56px
├── Background: var(--color-background) = #0D1117
├── Border-top: 1px solid var(--color-border) = #30363D
├── Display: flex, justify-content: space-around, align-items: center
├── z-index: 50
├── Padding-bottom: env(safe-area-inset-bottom) (iOS notch)
│
└── BottomNavItem
    ├── Display: flex, flex-direction: column, align-items: center, gap: 2px
    ├── Padding: 6px 12px
    ├── Min-width: 48px
    ├── Cursor: pointer
    │
    ├── Icon: Lucide, 22px
    │   ├── Default: var(--color-text-tertiary) = #7A8390
    │   └── Active: var(--color-primary-text) = #8B7CF8
    │
    ├── Label
    │   ├── Font: Inter, 10px, weight 400
    │   ├── Default color: var(--color-text-tertiary) = #7A8390
    │   └── Active color: var(--color-primary-text) = #8B7CF8
    │
    └── Active Indicator (dot)
        ├── Width: 4px, Height: 4px
        ├── Border-radius: 50%
        ├── Background: var(--color-primary) = #6C5CE7
        └── Visible: only on active tab
```

---

