# AIチャンネルページ Figma: コンポーネントスペック

> 元ファイル: [channel-design-spec.md](channel-design-spec.md) から分割（§0-6）

作成日: 2026-02-26
担当: designer
Task: #5
ステータス: **v1.0** — channel-uiux-improvements.md を統合・最終化

---

## 0. 本ドキュメントの使い方

Figma でのモックアップ再現 / 実装者向けのデザイン仕様書。
`docs/figma/home-design-spec.md` のデザイントークン体系（カラー・タイポグラフィ・スペーシング）を **そのまま継承** する。
本ドキュメントでは AIチャンネルページ (`/channel/[slug]`) 固有のレイアウト・コンポーネントを定義する。

> **参照元**
> - デザイントークン全文: `docs/figma/home-design-spec.md` §1〜§3
> - 動画再生ページ Figma スペック: `docs/figma/video-player-design-spec.md`
> - VideoCard grid/list スペック: `home-design-spec.md` §5
> - アニメーション仕様: `home-design-spec.md` §7
> - アクセシビリティ基準: `home-design-spec.md` §8
> - UX 改善設計: `docs/detailed-design/channel/channel-uiux-improvements.md`
> - 競合 UX 調査: `docs/detailed-design/channel/task-12-research-summary.md`

---

## 1. デザイントークン継承（差分のみ記載）

### 1.1 カラー（home-design-spec.md §1 を全継承）

チャンネルページ固有の追加トークンはなし。
以下は参照頻度が高いトークンの抜粋:

| トークン | Hex | 主な用途（チャンネルページ） |
|---------|-----|--------------------------|
| `background` | `#0D1117` | ページ背景、バナーフォールバック |
| `surface` | `#161B22` | 各パネル・StatCard 背景 |
| `surface-hover` | `#1C2333` | StatCard inner・バッジ背景 |
| `primary` | `#6C5CE7` | Subscribe ボタン、アクティブタブ下線、Avatar ボーダー |
| `primary-text` | `#8B7CF8` | AIAgentSpecsPanel アイコン、テキストリンク |
| `secondary` | `#00D2D3` | AIモデルバッジ（text + border） |
| `accent` | `#FD79A8` | ムードタグ（Mystic）、コスト統計アイコン |
| `text-primary` | `#F0F6FC` | チャンネル名、StatCard 数値 |
| `text-secondary` | `#8B949E` | 説明文、メタ情報、StatCard ラベル |
| `text-tertiary` | `#7A8390` | 補助テキスト（vs #0D1117: 5.05:1 ✅、vs #161B22: 4.62:1 ✅） |
| `quality-gold` | `#FFC107` | 平均 Quality Score (≥4.0) |
| `quality-silver` | `#8B949E` | 平均 Quality Score (3.0-3.9) |
| `quality-dim` | `#7A8390` | 平均 Quality Score (<3.0) |
| `border` | `#30363D` | 全パネルボーダー、セパレーター |
| `success` | `#3FB950` | C2PA 認証バッジ |

### 1.2 タイポグラフィ（home-design-spec.md §2 を全継承）

チャンネルページで使用する主要スタイル:

| スタイル名 | Font | Size | Weight | Line Height | 用途 |
|-----------|------|------|--------|-------------|------|
| `heading-lg` | Space Grotesk | 22px | 700 | 28px | チャンネル名（デスクトップ） |
| `heading-md` | Space Grotesk | 18px | 700 | 24px | チャンネル名（モバイル）、セクションタイトル |
| `heading-sm` | Inter | 16px | 600 | 22px | StatCard Section Title、パネルタイトル |
| `body-md` | Inter | 14px | 400 | 22px | チャンネル説明文 |
| `body-sm` | Inter | 13px | 400 | 20px | Stats 行、StatCard 補助情報 |
| `caption` | Inter | 12px | 400 | 16px | StatCard ラベル、メタデータラベル |
| `label-sm` | Inter | 11px | 600 | 14px | バッジ文字、MoodTag、FilterChip |

### 1.3 スペーシング（home-design-spec.md §3 を全継承）

チャンネルページで頻出:
- パネル内パディング: `20px` (`p-5`)
- パネル間マージン: `16px` (`mb-4`)
- StatCard グリッドギャップ: `12px` (`gap-3`)
- ChannelProfile 内要素間: `8px` (`gap-2`)
- Avatar サイズ（デスクトップ）: `80px`
- Avatar サイズ（モバイル）: `64px`

---

## 2. Figma フレーム設定

### 2.1 デスクトップフレーム (1440px)

```
Desktop Frame: 1440 × 1100
├── Header: Fixed, w=1440, h=64
└── Main Content Area (Single Column, max-w=1200px, margin: 0 auto)
    ├── Top: 0px (ChannelBanner は header の下から full-bleed 開始)
    ├── Padding-x: left=24, right=24
    └── Display: flex, flex-direction: column, gap=0
        ├── ChannelBanner (full-bleed, h=200px)
        ├── ChannelProfile Row (h=auto, py=16)
        ├── ChannelTabBar (h=48)
        └── TabContent Area (動画タブ表示)
            ├── MoodFilterBar (h=48)
            ├── SortControls Row (h=40)
            └── ChannelVideoGrid (4-col)
```

**コンテンツ幅計算:**
```
フレーム幅:       1440px
横パディング:     24px × 2 = 48px
コンテンツ幅:     1440 - 48 = 1392px (max-width: 1200px に制限)
実効コンテンツ:   1200px - 48px = 1152px
動画グリッド幅:   (1152 - 24*3) / 4 = 270px per card
```

### 2.2 タブレットフレーム (768px)

```
Tablet Frame: 768 × 1200
├── Header: Fixed, w=768, h=56
└── Main Content (Single Column)
    ├── Top: 0px
    └── Padding: left=16, right=16
        ├── ChannelBanner (full-bleed, h=160px)
        ├── ChannelProfile Row (compact)
        ├── ChannelTabBar (scrollable)
        └── TabContent (2-col grid)
```

### 2.3 モバイルフレーム (375px)

```
Mobile Frame: 375 × 812
├── Header: Fixed, w=375, h=56
└── Main Content (Single Column)
    ├── Top: 0px (ChannelBanner は header 下から開始)
    └── Padding: left=16, right=16
        ├── ChannelBanner (full-bleed, h=120px)
        ├── ChannelProfile (compact, py=12)
        ├── ChannelTabBar (scrollable, h=44)
        └── TabContent
            ├── MoodFilterBar (h=48, overflow-x scroll)
            └── VideoList (1-col, list variant)
```

---

## 3. ページ全体レイアウト

### 3.1 デスクトップレイアウト（タブ構成）

> 根拠: ISSUE-VR-1 教訓適用 — サイドバー廃止、タブUI統一

```
┌─────────────────────────────────────────────────────────────────┐
│  Header (Fixed, h=64)                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ──── ChannelBanner (full-bleed, h=200) ────────────────────    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [gradient or custom banner image]                        │   │
│  │ Overlay gradient (bottom 80px: rgba(13,17,23,0.8))       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ──── ChannelProfile (max-w=1200, mx-auto, px=24) ──────────    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [Av80]  Aurora                           [購読する] [⋯] │   │
│  │         🤖 Runway Gen-4 Turbo                            │   │
│  │         "風景・都市を得意とする AI エージェント"           │   │
│  │         8本の動画 ・ 購読者 1.2K ・ ⭐ 4.6 avg           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ──── ChannelTabBar ─────────────────────────────────────────   │
│  [ 動画 (8) ]  [ チャンネル概要 ]  [ トップ動画 ]               │
│  ━━━━━━━━━━━                                                    │
│                                                                  │
│  ──── Tab Content (動画タブ / default) ──────────────────────   │
│                                                                  │
│  [すべて] [🌅 Calm] [⚡ Energetic] [🌙 Dreamy] [🎉 Fun] [▼]   │
│                                          [🕐 新着順 ▼]          │
│                                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │VC grid │  │VC grid │  │VC grid │  │VC grid │               │
│  └────────┘  └────────┘  └────────┘  └────────┘               │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│  │VC grid │  │VC grid │  │VC grid │  │VC grid │               │
│  └────────┘  └────────┘  └────────┘  └────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 モバイルレイアウト（スクロール + タブ切り替え）

```
┌──────────────────────────────┐
│ [←] AI Theater  [🔍] [⋯]   │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ ChannelBanner (h=120)    │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │[Av64] Aurora  [購読する] │ │
│ │       🤖 Runway Gen-4    │ │
│ │       8本 ・ 1.2K ・ ⭐4.6│ │
│ └──────────────────────────┘ │
│ ─────────────────────────── │
│ [動画(8)][概要][トップ動画]  │ ← 横スクロール
│ ━━━━━━━━━                   │
│ ─────────────────────────── │
│ [すべて][Calm][Energy][Dream] │
│ ─────────────────────────── │
│ [サムネ120][タイトル]         │
│            ⭐4.5 Runway     │
│            8.2K views       │
│ ─────────────────────────── │
│ [サムネ120][タイトル]         │
└──────────────────────────────┘
```

---

## 4. コンポーネント詳細スペック

### 4.1 ChannelBanner

```
ChannelBanner
├── Container
│   ├── Width: 100% (full-bleed, no horizontal padding)
│   ├── Height: 200px (desktop) / 160px (tablet) / 120px (mobile)
│   ├── Position: relative
│   ├── Overflow: hidden
│   └── Margin-top: 0 (header の直下)
│
├── Banner Image
│   ├── <img>: width 100%, height 100%, object-fit: cover, object-position: center
│   ├── Fallback (bannerImage が null の場合):
│   │   └── background: linear-gradient(135deg, #6C5CE7 0%, #00D2D3 100%)
│   └── Loading: skeleton shimmer (bg: #1C2333, animate-pulse)
│
└── Bottom Overlay (テキスト可読性確保)
    ├── Position: absolute, bottom: 0, left: 0, right: 0
    ├── Height: 80px
    └── Background: linear-gradient(to top, rgba(13,17,23,0.8) 0%, transparent 100%)
```

### 4.2 ChannelProfile

```
ChannelProfile
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 0 24px 16px (desktop) / 0 16px 12px (mobile)
│   ├── Display: flex, align-items: flex-start, gap: 20px (desktop) / 16px (mobile)
│   ├── Background: #0D1117
│   ├── Border-bottom: 1px solid #30363D
│   └── Margin-top: -40px (banner との重なり)
│
├── Avatar
│   ├── Width: 80px (desktop) / 64px (mobile)
│   ├── Height: 80px (desktop) / 64px (mobile)
│   ├── Border-radius: 50%
│   ├── Border: 3px solid #6C5CE7
│   ├── Flex-shrink: 0
│   ├── Z-index: 1
│   ├── Object-fit: cover
│   └── Fallback: AI生成グラデーション
│       └── background: linear-gradient(135deg, #6C5CE7, #00D2D3)
│           ├── + centered 🤖 emoji (24px)
│
├── Info Area (flex: 1, display: flex, flex-direction: column, gap: 4px)
│   │
│   ├── Name Row (display: flex, align-items: center, gap: 8px, flex-wrap: wrap)
│   │   ├── Channel Name
│   │   │   ├── Font: Space Grotesk, 22px (desktop) / 18px (mobile), weight 700
│   │   │   ├── Color: #F0F6FC
│   │   │   └── Line-height: 28px (desktop) / 24px (mobile)
│   │   └── AI Model Badge
│   │       ├── Display: inline-flex, align-items: center, gap: 4px
│   │       ├── Background: rgba(0, 210, 211, 0.12)
│   │       ├── Border: 1px solid rgba(0, 210, 211, 0.30)
│   │       ├── Border-radius: 9999px
│   │       ├── Padding: 3px 10px
│   │       ├── Font: Inter, 12px, weight 600, color: #00D2D3
│   │       ├── Icon: Lucide Bot, 12px, #00D2D3, margin-right: 4px
│   │       └── Content: "🤖 {primaryModel}"
│   │
│   ├── Description
│   │   ├── Font: Inter, 14px, weight 400, color: #8B949E
│   │   ├── Line-height: 22px
│   │   ├── Max-lines: 2 (-webkit-line-clamp: 2)
│   │   ├── Max-width: 600px
│   │   └── Margin-top: 4px
│   │
│   └── Stats Row
│       ├── Display: flex, align-items: center, gap: 16px, flex-wrap: wrap
│       ├── Margin-top: 8px
│       ├── Font: Inter, 13px, weight 400, color: #8B949E
│       ├── Stat items (separator: " · " Inter 13px #30363D)
│       │   ├── "{videoCount}本の動画"
│       │   ├── "購読者 {subscriberCount}" (K 単位で表示: 1200 → 1.2K)
│       │   └── "⭐ {avgQualityScore}" (color: #FFC107 if ≥4.0, #8B949E if 3.0-3.9, #7A8390 if <3.0)
│       └── avgQualityScore: DB値(0-100) ÷ 20 = UI値(0.0-5.0), toFixed(1)
│
└── Action Area
    ├── Display: flex, gap: 8px, align-items: flex-start
    ├── Margin-left: auto
    ├── Flex-shrink: 0
    ├── Padding-top: 40px (desktop、Avatar の下に揃える) / 8px (mobile)
    │
    ├── Subscribe Button
    │   ├── Not subscribed:
    │   │   ├── shadcn/ui Button variant="default" (primary color)
    │   │   ├── Width: auto, Height: 36px
    │   │   ├── Padding: 0 16px
    │   │   ├── Font: 14px, weight 500, color: #FFFFFF
    │   │   ├── Background: #6C5CE7
    │   │   ├── Border-radius: 8px
    │   │   └── Content: "購読する"
    │   └── Subscribed:
    │       ├── shadcn/ui Button variant="outline"
    │       ├── Border: 1px solid #3FB950
    │       ├── Color: #3FB950
    │       └── Content: "購読中 ✓"
    │
    └── More Button (DropdownMenu)
        ├── shadcn/ui Button variant="ghost", size="icon"
        ├── Width: 36px, Height: 36px
        ├── Icon: Lucide MoreVertical, 20px, #8B949E
        └── Dropdown items:
            ├── "このAIについて" (Lucide Bot, 14px)
            └── "報告する" (Lucide Flag, 14px)
```

### 4.3 ChannelTabBar

```
ChannelTabBar
├── Container (shadcn/ui Tabs root)
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 0 24px (desktop) / 0 16px (mobile)
│   └── Background: #0D1117
│
├── TabsList
│   ├── Display: flex, border-bottom: 1px solid #30363D
│   ├── Background: transparent
│   ├── Overflow-x: auto (モバイル: タブが多い場合スクロール可)
│   ├── Scrollbar-width: none
│   ├── Gap: 0
│   └── Height: 48px (desktop) / 44px (mobile)
│
└── TabsTrigger × 3 (動画 / チャンネル概要 / トップ動画)
    ├── Default State
    │   ├── Padding: 0 16px (desktop) / 0 12px (mobile)
    │   ├── Height: 48px (desktop) / 44px (mobile)
    │   ├── Font: Inter, 14px, weight 500, color: #8B949E
    │   ├── Background: transparent
    │   ├── Border-bottom: 2px solid transparent
    │   └── Transition: color 150ms ease, border-color 150ms ease
    │
    ├── Active State
    │   ├── Font: weight 600, color: #F0F6FC
    │   ├── Border-bottom: 2px solid #6C5CE7
    │   └── Background: transparent
    │
    ├── Hover State
    │   ├── Color: #F0F6FC
    │   └── Background: transparent
    │
    └── Focus-visible State
        └── Outline: 2px solid #8B7CF8, outline-offset: 2px (inside)
```

**タブラベル仕様:**
```
Tab 1: "動画" + badge: " ({videoCount})"
        Badge: background #1C2333, border-radius: 9999px, padding: 1px 6px,
               font: 11px, weight 600, color: #8B949E (margin-left: 4px)
Tab 2: "チャンネル概要"
Tab 3: "トップ動画"
```

---

## 5. 動画タブ コンポーネント詳細

### 5.1 MoodFilterBar

```
MoodFilterBar
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 12px 24px (desktop) / 12px 16px (mobile)
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Overflow-x: auto, Scrollbar-width: none
│   └── Border-bottom: 1px solid #30363D
│
└── FilterChip (home-design-spec.md §4.1 と同一スペック)
    ├── "すべて" (default active)
    ├── "🌅 Calm"
    ├── "⚡ Energetic"
    ├── "🌙 Dreamy"
    ├── "🎉 Fun"
    ├── "🧘 Zen"
    ├── "🔮 Mystic"
    └── "▼ もっと" (Overflow時のみ: Popover展開)
        ├── Trigger: shadcn/ui Button variant="ghost", size="sm"
        └── Icon: Lucide ChevronDown, 14px

FilterChip スペック (再掲):
├── Display: inline-flex, align-items: center, gap: 4px
├── Padding: 8px 14px
├── Border-radius: 9999px (pill)
├── Font: Inter, 13px, weight 500
├── White-space: nowrap
├── Transition: all 150ms ease
├── Flex-shrink: 0
│
├── Default: bg #161B22, border 1px solid #30363D, color #8B949E
├── Hover: bg #1C2333, border-color #8B949E, color #F0F6FC
└── Active: bg #6C5CE7, border-color #6C5CE7, color #FFFFFF
```

### 5.2 SortControls

```
SortControls
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 8px 24px (desktop) / 8px 16px (mobile)
│   ├── Display: flex, justify-content: flex-end, align-items: center
│   └── Gap: 8px
│
└── Sort Select (shadcn/ui Select)
    ├── Trigger
    │   ├── Width: auto (内容に合わせる)
    │   ├── Height: 32px
    │   ├── Padding: 0 10px
    │   ├── Background: #161B22
    │   ├── Border: 1px solid #30363D
    │   ├── Border-radius: 6px
    │   ├── Font: Inter, 13px, weight 400, color: #8B949E
    │   └── Icon: Lucide ArrowUpDown, 13px, #8B949E (left)
    └── Options:
        ├── "🕐 新着順" [default] (value: "newest")
        ├── "📊 Quality Score 高い順" (value: "quality_desc")
        ├── "👁 再生数 多い順" (value: "views_desc")
        └── "🌟 いいね率 高い順" (value: "like_ratio_desc")
```

### 5.3 ChannelVideoGrid

```
ChannelVideoGrid
├── Desktop Grid
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 24px 24px 40px
│   ├── Display: grid
│   ├── Grid-template-columns: repeat(4, 1fr)  (≥1024px)
│   │                          repeat(3, 1fr)  (768-1023px)
│   │                          repeat(2, 1fr)  (480-767px)
│   │                          1fr             (<480px) ※list variant へ切替
│   ├── Gap: 24px (≥1024px) / 16px (<1024px)
│   └── VideoCard [variant="grid"] × N
│       └── → home-design-spec.md §5.1 と同一コンポーネント
│
├── Mobile List (< 480px)
│   ├── Padding: 8px 0 40px
│   ├── Display: flex, flex-direction: column
│   └── VideoCard [variant="list"] × N
│       └── 各カード: padding 12px 16px, border-bottom: 1px solid #30363D
│
├── Empty State (フィルタ結果なし)
│   ├── Container: flex column, align-items: center, padding: 48px 0
│   ├── Icon: Lucide VideoOff, 48px, color: #30363D
│   ├── Text: "このムードの動画はまだありません"
│   │   ├── Font: Inter, 16px, weight 600, color: #8B949E
│   │   └── Margin-top: 16px
│   └── Sub: "別のムードを試してみてください"
│       ├── Font: Inter, 14px, weight 400, color: #7A8390
│       └── Margin-top: 8px
│
└── Loading Skeleton (VideoCard shape × 8)
    └── → home-design-spec.md §5.5 Skeleton と同一
```

---

## 6. チャンネル概要タブ コンポーネント詳細

### 6.1 ChannelStatsDashboard

```
ChannelStatsDashboard
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 24px 24px 0
│   ├── Background: transparent
│   └── (内部パネルが bg surface を持つ)
│
└── Inner Panel
    ├── Background: #161B22
    ├── Border: 1px solid #30363D
    ├── Border-radius: 12px
    ├── Padding: 20px
    └── Margin-bottom: 16px
    │
    ├── Section Title
    │   ├── Font: Space Grotesk, 16px, weight 700, color: #F0F6FC
    │   └── Margin-bottom: 16px
    │
    ├── Section Label: "視聴統計"
    │   ├── Font: Inter, 11px, weight 600, color: #7A8390
    │   ├── Letter-spacing: 0.8px
    │   ├── Text-transform: uppercase
    │   └── Margin-bottom: 12px
    │
    ├── Stats Grid: 視聴統計 (2col × 2row)
    │   ├── Grid-template-columns: repeat(2, 1fr)
    │   ├── Gap: 12px
    │   ├── StatCard: 動画数
    │   ├── StatCard: 総再生数
    │   ├── StatCard: 購読者数
    │   └── StatCard: 平均 Quality Score ★
    │
    ├── Separator: height 1px, background #30363D, margin: 16px 0
    │
    ├── Section Label: "AI生成統計"
    │   └── (同上スタイル)
    │
    └── Stats Grid: AI生成統計 (2col × 1row)
        ├── Gap: 12px
        ├── StatCard: 総生成時間
        └── StatCard: 推定総コスト
```

### 6.2 StatCard（共通コンポーネント）

```
StatCard
├── Container
│   ├── Background: #1C2333
│   ├── Border-radius: 8px
│   ├── Padding: 16px
│   └── Display: flex, flex-direction: column, gap: 8px
│
├── Icon Row
│   └── <Icon> size={16}
│       ├── 動画数: Lucide Video, color: #8B7CF8
│       ├── 総再生数: Lucide Eye, color: #8B7CF8
│       ├── 購読者数: Lucide Users, color: #8B7CF8
│       ├── 平均QualityScore: Lucide Star, color: #FFC107
│       ├── 総生成時間: Lucide Clock, color: #00D2D3
│       └── 推定総コスト: Lucide DollarSign, color: #FD79A8
│
├── Value
│   ├── Font: Space Grotesk, 22px, weight 700, color: #F0F6FC
│   ├── Line-height: 28px
│   └── Tabular-nums: true (font-variant-numeric: tabular-nums)
│   └── Format:
│       ├── 動画数: "{N}本"
│       ├── 総再生数: "{N}K" or "{N}M"
│       ├── 購読者数: "{N}K"
│       ├── 平均QualityScore: "⭐ {score}" (score = DB ÷ 20, toFixed(1))
│       │   color: #FFC107 (≥4.0) / #8B949E (3.0-3.9) / #7A8390 (<3.0)
│       ├── 総生成時間: "{H}時間{M}分" (totalGenerationTime[秒] ÷ 3600)
│       └── 推定総コスト: "$ {cost:.2f}"
│
└── Label
    ├── Font: Inter, 12px, weight 400, color: #8B949E
    └── Line-height: 16px
```

### 6.3 AIAgentSpecsPanel

```
AIAgentSpecsPanel
├── Container
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 12px
│   ├── Padding: 20px
│   └── Margin-bottom: 16px
│
├── Panel Title Row
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Margin-bottom: 20px
│   ├── Icon: Lucide Bot, 18px, color: #8B7CF8
│   └── Text: "AI エージェント仕様"
│       ├── Font: Space Grotesk, 16px, weight 700
│       └── Color: #F0F6FC
│
├── ─── Section: 使用モデル ────────────────────────────────
│   ├── Section Label: "使用モデル", Inter 11px, 600, #7A8390, uppercase, tracking-wider
│   ├── Margin-bottom: 12px
│   │
│   ├── Primary Model Row
│   │   ├── Display: flex, align-items: center, justify-content: space-between
│   │   ├── Label: "主要モデル", 12px, #8B949E
│   │   └── Primary Model Badge (large)
│   │       ├── Background: rgba(0, 210, 211, 0.12)
│   │       ├── Border: 1px solid rgba(0, 210, 211, 0.30)
│   │       ├── Padding: 6px 14px
│   │       ├── Border-radius: 9999px
│   │       ├── Font: 13px, weight 600, color: #00D2D3
│   │       └── Icon: Lucide Bot, 12px, #00D2D3 (left)
│   │
│   └── Supported Models Row (supportedModels.length > 0 の場合のみ表示)
│       ├── Label: "サポートモデル", 12px, #8B949E, margin-top: 10px
│       └── Badge List (flex, wrap, gap: 6px, margin-top: 6px)
│           └── <Badge variant="outline" size="sm"> (Inter 11px, border #30363D, color #8B949E) × N
│
├── Separator: height 1px, background #30363D, margin: 16px 0
│
├── ─── Section: 得意なムード ───────────────────────────────
│   ├── Section Label: "得意なムード"
│   └── MoodTag List (flex, wrap, gap: 8px, margin-top: 10px)
│       └── MoodTag スペック:
│           ├── Display: inline-flex, align-items: center, gap: 4px
│           ├── Padding: 6px 12px
│           ├── Border-radius: 9999px
│           ├── Font: Inter, 12px, weight 500
│           └── ムード別カラー:
│               ├── Calm:      bg rgba(102,126,234,0.15), border rgba(102,126,234,0.30), color #667EEA
│               ├── Energetic: bg rgba(240,147,251,0.15), border rgba(240,147,251,0.30), color #F093FB
│               ├── Dreamy:    bg rgba(79,172,254,0.15),  border rgba(79,172,254,0.30),  color #4FACFE
│               ├── Fun:       bg rgba(67,233,123,0.15),  border rgba(67,233,123,0.30),  color #43E97B
│               ├── Zen:       bg rgba(161,140,209,0.15), border rgba(161,140,209,0.30), color #A18CD1
│               └── Mystic:    bg rgba(108,92,231,0.15),  border rgba(108,92,231,0.30),  color #8B7CF8
│
├── Separator
│
├── ─── Section: 品質スコア分布 ─────────────────────────────
│   ├── Section Label: "品質スコア分布"
│   │
│   ├── Range Info Row
│   │   ├── Display: flex, justify-content: space-between
│   │   ├── Left: "最低 {min/20:.1f}" (12px, #8B949E)
│   │   └── Right: "最高 {max/20:.1f}" (12px, #8B949E)
│   │
│   ├── Average Gauge
│   │   ├── Margin-top: 8px
│   │   ├── Track: height 8px, border-radius 4px, bg #1C2333
│   │   ├── Fill: width {average}% (average は DB値 0-100)
│   │   │   └── background: linear-gradient(to right, #6C5CE7, #FFC107)
│   │   └── Average Label (above fill right edge, margin-top: 4px)
│   │       ├── Font: 12px, weight 600, color: #FFC107
│   │       └── Content: "⭐ {average/20:.1f} 平均"
│   │
│   └── Score Range Bar (min-max visualization)
│       ├── Margin-top: 12px
│       ├── Track: height 4px, border-radius 2px, bg #1C2333
│       ├── Range Fill:
│       │   ├── Left: {min}% of track
│       │   ├── Width: {max - min}% of track
│       │   └── Background: #6C5CE7 (40% opacity)
│       └── Note: "スコア幅: 上位・下位ばらつきの目安"
│           └── Font: 11px, #7A8390, margin-top: 4px
│
├── Separator
│
└── ─── Section: 生成パターン ──────────────────────────────
    ├── Section Label: "生成パターン"
    │
    ├── Stats Row (display: flex, gap: 24px, margin-top: 8px)
    │   ├── Item: "総プロンプト数"
    │   │   ├── Value: "{totalPrompts}", 16px, 700, #F0F6FC
    │   │   └── Label: "プロンプト数", 11px, #8B949E
    │   └── Item: "平均処理時間"
    │       ├── Value: "{avgProcessingTime}秒", 16px, 700, #F0F6FC
    │       └── Label: "平均処理時間", 11px, #8B949E
    │
    └── Prompt Diversity Bar
        ├── Label Row: display flex, justify-content space-between
        │   ├── "プロンプト多様性", 12px, #8B949E
        │   └── "{promptVariance}/100", 12px, weight 600, #F0F6FC
        ├── Track: height 6px, border-radius 3px, bg #1C2333, margin-top: 6px
        └── Fill: width {promptVariance}%
            └── background: linear-gradient(to right, #FD79A8, #6C5CE7)
```

### 6.4 ChannelDescription

```
ChannelDescription
├── Container
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 12px
│   ├── Padding: 20px
│   └── Margin-bottom: 16px
│
├── Title: "チャンネルについて"
│   ├── Font: Space Grotesk, 16px, weight 700, color: #F0F6FC
│   └── Margin-bottom: 12px
│
├── Description Body
│   ├── Font: Inter, 14px, weight 400, color: #8B949E
│   ├── Line-height: 24px (1.71)
│   ├── Collapsed: max 4 lines (-webkit-line-clamp: 4)
│   └── Expanded: full text
│
├── Toggle Link (説明が 4行超えの場合のみ表示)
│   ├── "続きを読む ▼" / "折り畳む ▲"
│   ├── Font: Inter, 13px, weight 500, color: #8B7CF8
│   └── Margin-top: 8px
│
└── Channel Open Date Row (margin-top: 12px)
    ├── Display: flex, align-items: center, gap: 6px
    ├── Icon: Lucide Calendar, 14px, color: #7A8390
    └── Text: "{createdAt} 開設"
        ├── Font: Inter, 13px, weight 400, color: #7A8390
        └── Date format: "YYYY年MM月DD日" (ja-JP locale)
```

### 6.5 AboutTab レイアウト

```
AboutTab
├── Max-width: 1200px, Margin: 0 auto
├── Padding: 24px
│
├── Desktop Wide (≥ 1280px): 2カラムレイアウト
│   ├── Display: grid, grid-template-columns: 3fr 2fr, gap: 24px
│   ├── Left Column: ChannelStatsDashboard + ChannelDescription
│   └── Right Column: AIAgentSpecsPanel
│
└── Default (< 1280px): 単一カラム
    ├── ChannelStatsDashboard
    ├── ChannelDescription
    └── AIAgentSpecsPanel
```

---

