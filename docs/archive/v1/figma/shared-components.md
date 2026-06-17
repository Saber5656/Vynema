# 共有コンポーネントライブラリ定義書

作成日: 2026-03-21
担当: designer
Task: A3
バージョン: v1.0

---

## 0. 本ドキュメントの目的

各画面のデザインスペックに分散していた共通コンポーネントの定義を一元管理する。
実装時の参照先はこのファイルを正とし、各画面スペックはここへのリンクで代替できる。

**対象スペックファイル（参照元）:**
- `docs/figma/home/home-design-spec.md` — デザイントークン・VideoCard・Header・Sidebar・Button 等
- `docs/figma/video-player/video-player-design-spec.md` — VideoPlayer・TabPanel
- `docs/figma/channel/channel-design-spec.md` — ChannelProfile・StatCard・MoodTag
- `docs/figma/auth/auth-design-spec.md` — AuthModal・OAuthButton
- `docs/figma/search-design-spec.md` — SearchBar・FilterChip・SearchSuggestionPanel
- `docs/figma/ai-pipeline-design-spec.md` — AdminNav・StatusBadge・MetricCard

---

## 1. デザイントークン（正規定義）

> すべての画面スペックは `home-design-spec.md §1〜§3` を継承している。
> このセクションがシステム全体の Single Source of Truth。

### 1.1 カラーシステム（ダークモード・デフォルト）

#### プライマリカラー（2段階システム）

| トークン | Hex | Tailwind CSS v4 変数 | 用途 |
|---------|-----|---------------------|------|
| `primary` | `#6C5CE7` | `--color-primary` | ボタン背景・バッジ背景・アクティブ装飾（白テキストを乗せる） |
| `primary-text` | `#8B7CF8` | `--color-primary-text` | ダーク背景上のテキスト・リンク・フォーカスリング |
| `primary-hover` | `#7B6BF0` | `--color-primary-hover` | ボタンホバー |
| `primary-active` | `#5A4AD6` | `--color-primary-active` | ボタン押下 |

**使い分けルール:**

| 場面 | 使用カラー | 理由 |
|------|-----------|------|
| ボタン背景 | `primary` (#6C5CE7) | 白テキストとのコントラスト 4.86:1 (AA合格) |
| テキストリンク | `primary-text` (#8B7CF8) | ダーク背景上 5.71:1 (AA合格) |
| AI Badge 背景 | `primary` 85% opacity | 白テキストを乗せる |
| フォーカスリング | `primary-text` (#8B7CF8) | 背景上で視認性確保 |
| アクティブタブ下線 | `primary` (#6C5CE7) | 装飾的要素（テキストなし） |

#### ベースカラー

| トークン | Hex | Tailwind CSS v4 変数 | 用途 |
|---------|-----|---------------------|------|
| `background` | `#0D1117` | `--color-background` | ページ背景 |
| `surface` | `#161B22` | `--color-surface` | カード・パネル背景 |
| `surface-hover` | `#1C2333` | `--color-surface-hover` | ホバー背景・バッジ背景 |
| `surface-elevated` | `#21262D` | `--color-surface-elevated` | モーダル・ドロップダウン |

#### ボーダー

| トークン | Hex | Tailwind CSS v4 変数 | 用途 |
|---------|-----|---------------------|------|
| `border` | `#30363D` | `--color-border` | 標準ボーダー（装飾用） |
| `border-emphasis` | `#484F58` | `--color-border-emphasis` | ホバー時・強調ボーダー |

#### テキスト

| トークン | Hex | Tailwind CSS v4 変数 | vs `#0D1117` | 用途 |
|---------|-----|---------------------|-------------|------|
| `text-primary` | `#F0F6FC` | `--color-text-primary` | 17.39:1 | メインテキスト |
| `text-secondary` | `#8B949E` | `--color-text-secondary` | 6.15:1 | サブテキスト・メタ情報 |
| `text-tertiary` | `#7A8390` | `--color-text-tertiary` | 5.05:1 | 最小テキスト・プレースホルダー |

#### アクセント・セマンティック

| トークン | Hex | Tailwind CSS v4 変数 | vs `#0D1117` | 用途 |
|---------|-----|---------------------|-------------|------|
| `secondary` | `#00D2D3` | `--color-secondary` | 10.06:1 | AIモデルバッジ・C2PAバッジ |
| `accent` | `#FD79A8` | `--color-accent` | 7.64:1 | テーマタグ・ムードタグ |
| `success` | `#3FB950` | `--color-success` | 7.80:1 | 成功・C2PA認証済み |
| `error` | `#F85149` | `--color-error` | 6.13:1 | エラー・危険ゾーン |
| `warning` | `#D29922` | `--color-warning` | 8.36:1 | 警告 |

#### Quality Score カラー

| トークン | Hex | Tailwind CSS v4 変数 | 条件 |
|---------|-----|---------------------|------|
| `quality-gold` | `#FFC107` | `--color-quality-gold` | スコア >= 4.0 |
| `quality-silver` | `#8B949E` | `--color-quality-silver` | スコア 3.0〜3.9 |
| `quality-dim` | `#7A8390` | `--color-quality-dim` | スコア < 3.0 |

#### 管理画面専用トークン（`/admin` 限定）

| トークン | Hex | Tailwind CSS v4 変数 | 用途 |
|---------|-----|---------------------|------|
| `admin-bg` | `#0A0E14` | `--color-admin-bg` | 管理画面ページ背景 |
| `status-success` | `#22C55E` | `--color-status-success` | 完了ステータス |
| `status-warning` | `#F59E0B` | `--color-status-warning` | 警告ステータス |
| `status-error` | `#EF4444` | `--color-status-error` | 失敗ステータス |
| `status-active` | `#3B82F6` | `--color-status-active` | 実行中ステータス |
| `status-pending` | `#6B7280` | `--color-status-pending` | 待機中ステータス |

### 1.2 ライトモード カラーパレット（将来対応用）

| トークン | Hex | vs `#FAFBFC` |
|---------|-----|-------------|
| `primary` | `#6C5CE7` | 5.01:1 |
| `primary-text` | `#5B4BD6` | 6.31:1 |
| `secondary` | `#00A8A8` | 4.58:1 |
| `accent` | `#D63384` | 5.11:1 |
| `background` | `#FAFBFC` | — |
| `surface` | `#FFFFFF` | — |
| `text-primary` | `#1F2328` | 16.50:1 |
| `text-secondary` | `#656D76` | 5.53:1 |

### 1.3 Tailwind CSS v4 テーマ設定（`app/globals.css`）

```css
@theme {
  /* Primary */
  --color-primary: #6C5CE7;
  --color-primary-text: #8B7CF8;
  --color-primary-hover: #7B6BF0;
  --color-primary-active: #5A4AD6;

  /* Secondary & Accent */
  --color-secondary: #00D2D3;
  --color-accent: #FD79A8;

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

### 1.4 タイポグラフィスケール

| トークン | Font | Size | Weight | Line Height | Letter Spacing | Tailwind |
|---------|------|------|--------|-------------|---------------|----------|
| `display` | Space Grotesk | 36px | 700 | 44px | -0.5px | `text-4xl font-bold font-heading` |
| `heading-xl` | Space Grotesk | 28px | 700 | 36px | -0.3px | `text-3xl font-bold font-heading` |
| `heading-lg` | Space Grotesk | 22px | 700 | 28px | -0.2px | `text-xl font-bold font-heading` |
| `heading-md` | Space Grotesk | 18px | 700 | 24px | -0.1px | `text-lg font-bold font-heading` |
| `heading-sm` | Inter | 16px | 600 | 22px | 0 | `text-base font-semibold` |
| `body-lg` | Inter | 16px | 400 | 26px | 0 | `text-base` |
| `body-md` | Inter | 14px | 400 | 22px | 0 | `text-sm` |
| `body-sm` | Inter | 13px | 400 | 20px | 0 | `text-[13px]` |
| `caption` | Inter | 12px | 400 | 16px | 0.1px | `text-xs` |
| `label-lg` | Inter | 13px | 600 | 16px | 0.2px | `text-[13px] font-semibold` |
| `label-sm` | Inter | 11px | 600 | 14px | 0.3px | `text-[11px] font-semibold` |
| `overline` | Inter | 11px | 500 | 14px | 0.8px | `text-[11px] font-medium uppercase tracking-wider` |

**フォントファミリー:**
- 見出し: Space Grotesk (weight 600, 700)
- 本文: Inter (weight 400, 500, 600)
- 数値（等幅）: Inter + `tabular-nums`

---

### 1.5 スペーシングシステム（4px ベースグリッド）

| トークン | 値 | Tailwind | 主な用途 |
|---------|-----|---------|---------|
| `space-0.5` | 2px | `p-0.5` | バッジ内の極小余白 |
| `space-1` | 4px | `p-1` | アイコンとテキスト間 |
| `space-1.5` | 6px | `p-1.5` | メタタグ間ギャップ |
| `space-2` | 8px | `p-2` | カード要素間（小） |
| `space-3` | 12px | `p-3` | カード内パディング |
| `space-4` | 16px | `p-4` | カード間ギャップ（モバイル）|
| `space-5` | 20px | `p-5` | パネル内パディング |
| `space-6` | 24px | `p-6` | カード間ギャップ（デスクトップ）|
| `space-8` | 32px | `p-8` | セクション間余白（モバイル）|
| `space-10` | 40px | `p-10` | Hero内パディング（デスクトップ）|
| `space-12` | 48px | `p-12` | セクション間余白（デスクトップ）|
| `space-16` | 64px | `p-16` | ヘッダー高さ（デスクトップ）|

**コンポーネント間スペーシングルール:**

| 場所 | 間隔 | Tailwind |
|------|------|---------|
| カード内要素間 | 8px | `gap-2` |
| カード内パディング | 12px | `p-3` |
| カード間（グリッド・モバイル） | 16px | `gap-4` |
| カード間（グリッド・デスクトップ） | 24px | `gap-6` |
| セクション間（モバイル） | 32px | `mb-8` |
| セクション間（デスクトップ） | 48px | `mb-12` |
| セクションタイトルとコンテンツ間 | 16px | `mb-4` |
| ページ横パディング（モバイル） | 16px | `px-4` |
| ページ横パディング（デスクトップ） | 24px | `px-6` |

---

## 2. コンポーネント定義

### 2.1 AIBadge

**概要:** サムネイル左上に配置。AI生成コンテンツであることを示すバッジ。

**バリエーション:**

| バリアント | 用途 | パディング | フォントサイズ |
|-----------|------|-----------|-------------|
| `standard` | VideoCard grid/list | `4px 8px` | 11px |
| `compact` | VideoCard compact（関連動画） | `2px 6px` | 10px |

**スペック（standard）:**
```
AIBadge [variant="standard"]
├── Position: absolute, top: 8px, left: 8px (Thumbnail内)
├── Background: rgba(108, 92, 231, 0.85)  /* primary 85% opacity */
├── Backdrop-filter: blur(4px)
├── Padding: 4px 8px
├── Border-radius: 6px
├── Display: flex, align-items: center, gap: 4px
├── Icon: Lucide Bot, 12px, #FFFFFF
└── Text: "AI"
    ├── Font: Inter, 11px, weight 600
    └── Color: #FFFFFF
    (Contrast: white on #6C5CE7@85% ≈ 4.1:1 — AA-large PASS)
```

**スペック（compact）:**
```
AIBadge [variant="compact"]
├── Position: absolute, top: 4px, left: 4px
├── Background: rgba(108, 92, 231, 0.85)
├── Padding: 2px 6px
├── Border-radius: 4px
├── Icon: Lucide Bot, 10px, #FFFFFF
└── Text: "AI" — Inter, 10px, weight 600, #FFFFFF
```

**使用画面:** ホーム・動画再生（関連動画）・チャンネル・検索結果

---

### 2.2 QualityBadge

**概要:** 動画品質スコア（0.0〜5.0）を星アイコン付きで表示。スコアに応じてカラーが変化。

**スペック:**
```
QualityBadge
├── Display: inline-flex, align-items: center, gap: 3px
├── Background: var(--color-surface-hover) = #1C2333
├── Padding: 3px 8px
├── Border-radius: 9999px (pill)
├── Font: Inter, 11px, weight 500
├── Content: "★ {score}"  (例: "★ 4.8")
│
└── カラー条件:
    ├── score >= 4.0: var(--color-quality-gold) = #FFC107
    ├── score 3.0〜3.9: var(--color-quality-silver) = #8B949E
    └── score < 3.0: var(--color-quality-dim) = #7A8390
```

**使用画面:** ホーム・動画再生・チャンネル・検索結果・管理画面

---

### 2.3 ModelBadge

**概要:** 動画生成に使用したAIモデル名を表示するバッジ。

**スペック:**
```
ModelBadge
├── Background: var(--color-surface-hover) = #1C2333
├── Padding: 3px 8px
├── Border-radius: 9999px (pill)
├── Font: Inter, 11px, weight 500
├── Color: var(--color-secondary) = #00D2D3
└── Content: "{modelName}"  (例: "Runway Gen-4 Turbo")
```

**使用画面:** ホーム・動画再生・チャンネル・検索結果

---

### 2.4 ThemeTag（テーマタグ）

**概要:** 動画テーマ（ジャンル）を表示するバッジ。

**スペック:**
```
ThemeTag
├── Background: var(--color-surface-hover) = #1C2333
├── Padding: 3px 8px
├── Border-radius: 9999px (pill)
├── Font: Inter, 11px, weight 500
├── Color: var(--color-accent) = #FD79A8
└── Content: "{theme}"  (例: "風景", "都市")
```

**使用画面:** ホーム・動画再生・チャンネル・検索結果

---

### 2.5 DurationBadge

**概要:** 動画再生時間をサムネイル右下に表示。

**スペック:**
```
DurationBadge
├── Position: absolute, bottom: 8px, right: 8px (Thumbnail内)
├── Background: rgba(0, 0, 0, 0.75)
├── Padding: 2px 6px
├── Border-radius: 4px
├── Font: Inter, 12px, weight 500, tabular-nums
├── Color: #FFFFFF
└── Format: "mm:ss" または "h:mm:ss"
```

**使用画面:** ホーム・動画再生（関連動画）・チャンネル・検索結果

---

### 2.6 VideoCard

**概要:** 動画一覧表示の基本カード。3つのバリアントを持つ。

#### VideoCard [variant="grid"]（ホーム・チャンネル）

```
VideoCard [variant="grid"]
├── Container
│   ├── Width: fill parent (grid column)
│   ├── Min-width: 260px
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 12px
│   ├── Overflow: hidden
│   ├── Cursor: pointer
│   ├── Hover: scale(1.02), box-shadow: 0 8px 32px rgba(0,0,0,0.3), border-color #484F58
│   │   Transition: all 150ms ease
│   └── Focus-visible: outline 2px solid #8B7CF8, offset 2px
│
├── Thumbnail Area (aspect-ratio: 16/9, position: relative, overflow: hidden)
│   ├── Static Thumbnail: object-fit cover
│   │   Source: image.mux.com/{id}/thumbnail.webp?width=640&time=5
│   ├── Animated Preview (hover, desktop, delay 300ms)
│   │   Source: image.mux.com/{id}/animated.gif?width=640&start=2&end=7&fps=15
│   ├── AIBadge [variant="standard"]  ← §2.1 参照
│   └── DurationBadge               ← §2.5 参照
│
└── Info Area (padding: 12px, flex-col, gap: 8px)
    ├── Title: Inter, 14px, weight 600, line-height 20px, text-primary, line-clamp-2
    ├── Creator Row (flex, align-items: center, gap: 8px)
    │   ├── Creator Avatar: 28px, border-radius 50%, border 2px solid #6C5CE7
    │   └── Creator Name: Inter, 13px, weight 400, text-secondary
    ├── MetaTag Row (flex, gap: 6px, flex-wrap: wrap)
    │   ├── QualityBadge  ← §2.2 参照
    │   ├── ModelBadge    ← §2.3 参照
    │   └── ThemeTag      ← §2.4 参照
    ├── Stats Row: Inter, 12px, text-secondary
    │   Content: "{views} views ・ {likeRatio}% ・ {relativeTime}"
    └── RecommendReason (optional, "おすすめ" セクションのみ)
        ├── Background: rgba(139,124,248,0.06)
        ├── Border-left: 2px solid #6C5CE7
        ├── Padding: 6px 10px
        ├── Border-radius: 8px
        └── Font: Inter, 11px, text-secondary
```

#### VideoCard [variant="list"]（検索結果）

```
VideoCard [variant="list"]
├── Container: flex, gap: 16px, padding: 8px, border-radius: 8px
│   Hover: background #1C2333
│
├── Thumbnail
│   ├── Width: 360px (desktop) / 168px (mobile)
│   ├── Aspect-ratio: 16/9
│   ├── Border-radius: 8px
│   ├── Flex-shrink: 0
│   └── AIBadge + DurationBadge を含む
│
└── Info (flex: 1)
    ├── Title: Inter, 16px (desktop) / 14px (mobile), weight 600, text-primary
    ├── Stats: Inter, 13px, text-secondary
    ├── Creator Row + MetaTags (grid variant と同様)
    └── Description: Inter, 13px, text-secondary, line-clamp-2
```

#### VideoCard [variant="compact"]（関連動画）

```
VideoCard [variant="compact"]
├── Container: flex, gap: 8px
│
├── Thumbnail
│   ├── Width: 168px
│   ├── Aspect-ratio: 16/9
│   ├── Border-radius: 8px
│   └── AIBadge [variant="compact"] + DurationBadge
│
└── Info
    ├── Title: Inter, 13px, weight 500, line-clamp-2, text-primary
    ├── Creator: Inter, 12px, text-secondary
    └── Views + Time: Inter, 11px, text-tertiary
```

**全バリアント共通のローディング状態（Skeleton）:**
```
Loading Skeleton
├── Thumbnail: aspect-video bg shimmer rounded-lg
├── Title: h-4 w-[75%] bg shimmer rounded
├── Creator: h-3 w-[50%] bg shimmer rounded
└── Tags: h-3 w-[30%] bg shimmer rounded
Shimmer color: #1C2333
Animation: pulse 2s ease-in-out infinite
```

**使用画面:**
- grid: ホーム・チャンネル
- list: 検索結果
- compact: 動画再生（関連動画）

---

### 2.7 FilterChip

**概要:** カテゴリ・モデル・テーマ等でコンテンツをフィルタリングするチップ。

**スペック:**
```
FilterChip
├── Display: inline-flex, align-items: center, gap: 4px
├── Padding: 8px 16px
├── Border-radius: 9999px (pill)
├── Font: Inter, 13px, weight 500
├── White-space: nowrap
├── Flex-shrink: 0
├── Cursor: pointer
├── Transition: all 150ms ease
│
├── Default
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   └── Color: #8B949E
│
├── Hover
│   ├── Background: #1C2333
│   ├── Border-color: #484F58
│   └── Color: #F0F6FC
│
├── Active/Selected
│   ├── Background: #6C5CE7
│   ├── Border-color: #6C5CE7
│   └── Color: #FFFFFF
│
└── Focus-visible
    ├── Outline: 2px solid #8B7CF8
    └── Outline-offset: 2px
```

**使用画面:** ホーム・チャンネル（MoodFilterBar）・検索結果（FilterBar）

---

### 2.8 Button

**概要:** アクションを実行するボタンコンポーネント。shadcn/ui Button ベース。

**バリアント:**

#### Button [variant="primary"]
```
├── Default: bg #6C5CE7, color #FFFFFF, border: none
├── Hover: bg #7B6BF0, transition 150ms ease
├── Active: bg #5A4AD6, scale(0.98)
├── Focus-visible: outline 2px solid #8B7CF8, offset 2px
├── Disabled: bg #30363D, color #7A8390, opacity 0.6, cursor not-allowed
└── Loading: spinner 16px #FFFFFF animate-spin, pointer-events none
```

#### Button [variant="outline"]
```
├── Default: bg transparent, border 1px solid #484F58, color #F0F6FC
├── Hover: bg #1C2333, border-color #8B949E
├── Active: bg #161B22, scale(0.98)
├── Focus-visible: same as primary
└── Disabled: border-color #30363D, color #7A8390, opacity 0.6
```

#### Button [variant="ghost"]
```
├── Default: bg transparent, border: none, color #8B949E
├── Hover: bg #1C2333, color #F0F6FC
└── Active: bg #161B22
```

**サイズ（全バリアント共通オプション）:**

| サイズ | 高さ | Padding | Font |
|-------|------|---------|------|
| `sm` | 32px | 0 12px | Inter, 13px, weight 500 |
| `md` (default) | 40px | 0 16px | Inter, 14px, weight 500 |
| `lg` | 44px | 0 24px | Inter, 15px, weight 600 |
| `xl` | 48px | 0 28px | Inter, 16px, weight 600 |

Border-radius（全サイズ）: `8px`

**使用画面:** 全画面

---

### 2.9 SearchBar

**概要:** コンテンツ検索の入力フィールド。ヘッダー内とモバイルオーバーレイで使用。

**スペック（デスクトップ・ヘッダー内）:**
```
SearchBar
├── Container
│   ├── Flex: 1, max-width: 560px (xl: 640px), min-width: 320px
│   ├── Height: 40px
│   └── Position: relative
│
├── Input Wrapper
│   ├── Display: flex, align-items: center
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 9999px (pill)
│   ├── Padding: 0 12px 0 16px
│   └── Transition: border-color 150ms ease, box-shadow 150ms ease
│
└── States
    ├── Default: border #30363D, placeholder color #7A8390
    ├── Hover: border-color #484F58
    ├── Focus: border-color #8B7CF8, box-shadow 0 0 0 2px rgba(139,124,248,0.25)
    ├── Filled: color #F0F6FC, Clear (X) button visible
    └── With Suggestions: SearchSuggestionPanel 表示 (§2.10 参照)
```

**SearchSuggestionPanel:**
```
SearchSuggestionPanel (desktop)
├── Position: absolute, below SearchBar
├── Width: 480px, max-height: 480px
├── Background: #21262D
├── Border: 1px solid #30363D
├── Border-radius: 12px
├── Box-shadow: 0 8px 32px rgba(0,0,0,0.4)
│
└── Suggestion Item
    ├── Padding: 10px 16px
    ├── Font: Inter, 14px
    ├── Hover: background #1C2333
    └── Icon: Lucide Search, 16px, text-secondary
```

**使用画面:** 全画面（ヘッダー）・検索結果ページ

---

### 2.10 Header

**概要:** 全画面共通の固定ヘッダー。

**スペック:**
```
Header
├── Position: fixed, top: 0, left: 0, right: 0
├── z-index: 50
├── Height: 56px (mobile) / 64px (desktop)
├── Background: #0D1117
├── Border-bottom: 1px solid #30363D
├── Padding: 0 16px (mobile) / 0 24px (desktop)
├── Display: flex, align-items: center, gap: 16px
│
├── Hamburger Button (40x40px, border-radius 8px, hover bg #1C2333)
│   Icon: Lucide Menu, 20px, text-primary
│
├── Logo Area (flex, align-items: center, gap: 8px)
│   ├── Logo Icon: 28x28px (custom SVG)
│   └── Logo Text: "AI Theater" — Space Grotesk 18px 700, text-primary
│       Hidden: mobile < 480px
│
├── SearchBar (desktop, §2.9 参照)
│   または Search Icon Button (mobile)
│
├── Notification Bell (40x40px)
│   ├── Icon: Lucide Bell, 20px
│   └── Badge: bg #F85149, h=16px, Inter 10px 600, #FFFFFF (未読数)
│       表示: ログイン時のみ
│
└── User Area
    ├── Logged out: Button [variant="primary"] size="sm" "ログイン"
    └── Logged in: Clerk <UserButton> (Avatar 32px, border-radius 50%)
```

**使用画面:** 全画面

---

### 2.11 Sidebar

**概要:** デスクトップ用の固定サイドバーナビゲーション。モバイルはSheet（ドロワー）。

**スペック:**
```
Sidebar (Desktop)
├── Position: fixed, top: 64px, left: 0, bottom: 0
├── z-index: 40
├── Background: #0D1117
├── Border-right: 1px solid #30363D
├── Transition: width 200ms ease
│
├── Expanded State (width: 240px, padding: 8px 12px)
│   └── Nav Item (h=40px, padding: 0 12px, border-radius 8px)
│       ├── Icon: Lucide 20px, text-secondary
│       ├── Label: Inter 14px, text-primary
│       ├── Hover: bg #1C2333
│       └── Active: bg #1C2333, icon color #8B7CF8, label weight 500
│
├── Collapsed State (width: 72px, padding: 8px 0)
│   └── Nav Item (h=64px, flex-col, align-items center)
│       ├── Icon: same
│       └── Label: Inter 10px, margin-top 4px
│
├── Separator: h=1px, bg #30363D, margin 8px 12px
│
└── Mobile: shadcn/ui <Sheet>
    ├── Width: 280px
    ├── Background: #0D1117
    └── Overlay: rgba(0,0,0,0.5)
```

**使用画面:** ホーム・動画再生・チャンネル・検索結果

---

### 2.12 BottomNavigation（モバイル）

**概要:** モバイル専用の固定下部ナビゲーション。

**スペック:**
```
BottomNav
├── Position: fixed, bottom: 0, left: 0, right: 0
├── Height: 56px
├── Background: #0D1117
├── Border-top: 1px solid #30363D
├── Display: flex, justify-content: space-around, align-items: center
├── z-index: 50
├── Padding-bottom: env(safe-area-inset-bottom)
│
└── BottomNavItem (flex-col, align-items center, gap: 2px, padding: 6px 12px, min-width: 48px)
    ├── Icon: Lucide 22px
    │   ├── Default: #7A8390
    │   └── Active: #8B7CF8
    ├── Label: Inter 10px
    │   ├── Default: #7A8390
    │   └── Active: #8B7CF8
    └── Active Dot: 4x4px, border-radius 50%, bg #6C5CE7 (アクティブ時のみ表示)
```

**使用画面:** ホーム・チャンネル・検索結果（モバイル）

---

### 2.13 SectionHeader

**概要:** コンテンツセクションのタイトルとリンクを表示する見出し行。

**スペック:**
```
SectionHeader
├── Display: flex, justify-content: space-between, align-items: center
├── Padding: 0 16px (mobile) / 0 24px (desktop)
├── Margin-bottom: 16px
│
├── Left (flex, align-items: center, gap: 8px)
│   ├── Emoji: 20px (optional)
│   └── Title: Space Grotesk 18px (mobile) / 22px (desktop), weight 700, text-primary
│
└── Right
    └── "すべて見る →" Link
        ├── Font: Inter 14px, weight 500, color #8B7CF8
        ├── Hover: text-decoration underline
        └── ArrowRight: Lucide 14px
```

**使用画面:** ホーム

---

### 2.14 EmptyState

**概要:** コンテンツが存在しない状態を示すプレースホルダー。

**スペック:**
```
EmptyState
├── Display: flex, flex-direction: column, align-items: center
├── Padding: 64px 24px
├── Text-align: center
│
├── Icon: Lucide (コンテキスト依存) 48px, color #7A8390, margin-bottom: 16px
├── Title: Space Grotesk 18px 700, text-primary, margin-bottom: 8px
├── Description: Inter 14px, text-secondary, max-width 400px, margin-bottom: 24px
└── Action Button (optional): Button [variant="primary"]
```

**コンテキスト別設定:**

| コンテキスト | Icon | Title | Description |
|------------|------|-------|-------------|
| 検索結果なし | `SearchX` | "検索結果が見つかりませんでした" | "別のキーワードで検索してみてください" |
| カテゴリ動画なし | `Film` | "まだ動画がありません" | "このカテゴリの動画はまもなく追加されます" |
| 購読なし | `Rss` | "購読中のチャンネルがありません" | "AIチャンネルを探して購読しましょう" |
| ロードエラー | `AlertTriangle` | "読み込みに失敗しました" | "しばらくしてからもう一度お試しください" |

**使用画面:** ホーム・チャンネル・検索結果

---

### 2.15 MoodCard

**概要:** ムードカテゴリをビジュアルカードで表示。ホームのムードセクション用。

**スペック:**
```
MoodCard
├── Width: 140px (mobile) / 160px (desktop)
├── Height: 120px (mobile) / 140px (desktop)
├── Border-radius: 16px
├── Overflow: hidden
├── Cursor: pointer
├── Position: relative
├── Flex-shrink: 0
├── Hover: scale(1.05), transition 200ms ease
├── Focus-visible: outline 2px solid #FFFFFF, offset 2px
│
├── Background Gradients:
│   ├── Calm:       linear-gradient(135deg, #667EEA 0%, #764BA2 100%)
│   ├── Energetic:  linear-gradient(135deg, #F093FB 0%, #F5576C 100%)
│   ├── Dreamy:     linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)
│   ├── Fun:        linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)
│   ├── Zen:        linear-gradient(135deg, #A18CD1 0%, #FBC2EB 100%)
│   └── Mystic:     linear-gradient(135deg, #6C5CE7 0%, #FD79A8 100%)
│
├── Emoji (position: absolute, top: calc(50%-12px), left: 50%, translateX(-50%))
│   Font-size: 36px (mobile) / 40px (desktop)
│
├── English Label (position: absolute, bottom: 28px, text-align: center)
│   Inter 11px, weight 500, rgba(255,255,255,0.8)
│
└── Japanese Label (position: absolute, bottom: 12px, text-align: center)
    Inter 13px, weight 600, #FFFFFF, text-shadow: 0 1px 3px rgba(0,0,0,0.3)
```

**使用画面:** ホーム・チャンネル（MoodFilter）

---

### 2.16 StatusBadge（管理画面用）

**概要:** ジョブの実行ステータスを示すバッジ。管理画面専用。

**スペック:**
```
StatusBadge
├── Display: inline-flex, align-items: center, gap: 6px
├── Padding: 4px 10px
├── Border-radius: 9999px
├── Font: Inter 11px, weight 600
│
└── ステータス別設定:
    ├── completed:  bg rgba(34,197,94,0.15),  icon + text: #22C55E,  Icon: CheckCircle
    ├── warning:    bg rgba(245,158,11,0.15), icon + text: #F59E0B,  Icon: AlertTriangle
    ├── failed:     bg rgba(239,68,68,0.15),  icon + text: #EF4444,  Icon: XCircle
    ├── running:    bg rgba(59,130,246,0.15), icon + text: #3B82F6,  Icon: Loader (animate-spin)
    └── pending:    bg rgba(107,114,128,0.15),icon + text: #6B7280,  Icon: Clock
```

> アクセシビリティ: アイコン + テキストラベルを必ず併記すること（アイコン単体不可）

**使用画面:** 管理画面（パイプラインダッシュボード）

---

## 3. アニメーション / トランジション仕様

### 3.1 標準トランジション一覧

| 要素 | プロパティ | Duration | Easing | Delay | Tailwind |
|------|-----------|----------|--------|-------|----------|
| VideoCard ホバー | transform, box-shadow, border-color | 150ms | ease | 0 | `transition-all duration-150` |
| サムネイルプレビュー | opacity | 300ms | ease | 300ms (hover時) | `transition-opacity duration-300 delay-300` |
| Sidebar 開閉 | width | 200ms | ease | 0 | `transition-[width] duration-200` |
| FilterChip 状態変化 | background, border-color, color | 150ms | ease | 0 | `transition-colors duration-150` |
| Button 押下 | transform | 100ms | ease | 0 | `active:scale-[0.98] transition-transform duration-100` |
| MoodCard ホバー | transform | 200ms | ease | 0 | `transition-transform duration-200` |
| Carousel 矢印表示 | opacity | 200ms | ease | 0 | `transition-opacity duration-200` |
| ドロップダウン開閉 | opacity, transform | 150ms | ease-out | 0 | shadcn/ui 標準 |
| ページ遷移 | opacity | 200ms | ease | 0 | Next.js App Router |
| フォーカスリング | outline | 0ms | — | 0 | `focus-visible:outline` |

### 3.2 Skeleton アニメーション

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface) 25%,
    var(--color-surface-hover) 50%,
    var(--color-surface) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
}
```

### 3.3 AI Badge フェードイン（動画再生開始時）

```css
@keyframes fadeInOut {
  0%   { opacity: 0; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}

.ai-overlay {
  animation: fadeInOut 3s ease forwards;
  pointer-events: none;
}
```

### 3.4 セクション登場アニメーション

```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

.section-enter {
  animation: slideUp 400ms ease-out forwards;
}

/* prefers-reduced-motion 対応（必須） */
@media (prefers-reduced-motion: reduce) {
  .section-enter { animation: none; opacity: 1; transform: none; }
  .skeleton      { animation: none; }
}
```

---

## 4. アクセシビリティ基準

### 4.1 WCAG AA コントラスト基準

| 要素 | 前景色 | 背景色 | 比率 | 判定 |
|------|-------|-------|------|------|
| メインテキスト | #F0F6FC | #0D1117 | 17.39:1 | AA |
| サブテキスト | #8B949E | #0D1117 | 6.15:1 | AA |
| 最小テキスト | #7A8390 | #0D1117 | 5.05:1 | AA |
| primaryテキスト | #8B7CF8 | #0D1117 | 5.71:1 | AA |
| secondaryタグ | #00D2D3 | #0D1117 | 10.06:1 | AA |
| accentタグ | #FD79A8 | #0D1117 | 7.64:1 | AA |
| quality-gold | #FFC107 | #0D1117 | 11.61:1 | AA |
| AI Badge 白 | #FFFFFF | #6C5CE7@85% | ~4.1:1 | AA-large |

### 4.2 インタラクション要件

- **フォーカスリング**: 全インタラクティブ要素に `focus-visible:outline 2px solid #8B7CF8 outline-offset-2` を適用
- **タッチターゲット**: モバイル最小 44x44px
- **アイコン単体**: 必ず `aria-label` または隣接テキストで意味を補足
- **アニメーション**: `prefers-reduced-motion: reduce` でアニメーション無効化

---

## 5. コンポーネント使用マトリクス

| コンポーネント | ホーム | 動画再生 | チャンネル | 認証 | 検索 | 管理画面 |
|--------------|:------:|:--------:|:----------:|:----:|:----:|:-------:|
| AIBadge | grid | compact | grid | — | list | — |
| QualityBadge | grid | page | channel | — | list | dashboard |
| ModelBadge | grid | page | channel | — | list | — |
| ThemeTag | grid | page | channel | — | list | — |
| DurationBadge | grid | compact | grid | — | list | — |
| VideoCard | grid | compact | grid/list | — | list | — |
| FilterChip | home | — | mood | — | filter | — |
| Button | all | all | all | all | all | all |
| SearchBar | header | header | header | — | page | — |
| Header | yes | yes | yes | yes | yes | yes |
| Sidebar | yes | yes | yes | — | yes | — |
| BottomNav | mobile | — | mobile | — | mobile | mobile |
| SectionHeader | yes | — | — | — | — | — |
| EmptyState | yes | — | yes | — | yes | yes |
| MoodCard | yes | — | yes | — | — | — |
| StatusBadge | — | — | — | — | — | yes |

---

## 6. 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| v1.0 | 2026-03-21 | 初版作成 — 全6画面スペックから共通コンポーネントを抽出・集約 |
