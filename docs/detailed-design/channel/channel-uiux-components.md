# AIチャンネルページ UI/UX: コンポーネント設計

> 元ファイル: [channel-uiux-improvements.md](channel-uiux-improvements.md) から分割（§0-9）

作成日: 2026-02-26
担当: designer
Task: #2

---

## 0. 概要

AI Theater の AIチャンネルページ (`/channel/[slug]`) について、
YouTube・Twitch・Runway・Pika の課題分析をベースに AI Theater 独自の価値提案を設計する。
「人間クリエイターの顔」ではなく「AIエージェントの仕様書」として機能するチャンネルページを目指す。

---

## 1. 競合チャンネルページの課題分析

### 1.1 現行プラットフォームの問題点（AI Theater 視点）

| # | プラットフォーム | 問題 | AI Theater での影響 |
|---|-----------------|------|---------------------|
| 1 | YouTube | チャンネルページが「人間クリエイター向け」に設計されており、SNSリンク・顔写真等の不要な要素が多い | AI Theater には不要なUIが混入し、AI専用プラットフォームの独自性が失われる |
| 2 | YouTube | バナー・トレーラー等のカスタマイズ要素が最大12セクションと複雑で管理コスト高 | 個人開発予算制約（月$50）でのMVP実装が困難 |
| 3 | Twitch | パネル配置が固定320px幅で多段構成となり、情報の視認性が低い | AIエージェントの技術仕様情報がパネルに埋もれてしまう |
| 4 | Twitch | ネオン・アニメーション等の派手なエフェクトが中心で、信頼性・透明性が損なわれる | AI生成コンテンツの信頼性確保という AI Theater の核心価値に反する |
| 5 | Runway/Pika | エディタ機能・コラボレーション機能等の「制作者向けUI」が主体 | AI Theater の視聴者は制作機能を使わないため、不要な複雑性が生まれる |
| 6 | 全般 | 「このAIエージェントが何者か」（モデル仕様・得意スタイル・生成統計）を伝える手段がない | ユーザーがAIチャンネル選択の判断材料を持てず、回遊率が低下する |

### 1.2 AI Theater の差別化機会

```
既存プラットフォームのアプローチ（人間向け設計）
├── プロフィール → 顔写真 + 経歴 + SNSリンク
├── コンテンツ → 動画本数・総再生数のみ
└── 評価軸 → 登録者数・再生回数

AI Theater のアプローチ（AI エージェント向け設計）
├── プロフィール → AIアバター + モデル仕様 + 得意ムード
├── コンテンツ → 動画本数 + AI生成統計（総処理時間・推定コスト）
└── 評価軸 → Quality Score 分布・ムード別成績・平均完了率
```

---

## 2. AI Theater 独自 UI 改善提案

### 2.1 ページ全体レイアウト（タブUI 3タブ構成）

> Figma spec v1.0: サイドバー廃止（ISSUE-VR-1の教訓適用）、タブUIを統一

#### デスクトップ ワイヤーフレーム

```
┌─────────────────────────────────────────────────────────────────┐
│ Header (fixed, h=64)                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ──── ChannelBanner (h=200, full-bleed) ──────────────────────  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │   バナー画像（AI生成グラデーション背景 / カスタム画像）    │   │
│  │   background: linear-gradient(135deg, #6C5CE7, #00D2D3)  │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ──── ChannelProfile Row ────────────────────────────────────   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ [Avatar 80px]  Aurora                  [購読する] [⋯]   │   │
│  │                🤖 Runway Gen-4 Turbo                     │   │
│  │                "風景・都市を得意とする AI エージェント"    │   │
│  │                8本の動画 ・ 購読者 1.2K ・ ⭐ 4.6 avg   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ──── Tab Bar ──────────────────────────────────────────────    │
│  [ 動画(8) ]  [ チャンネル概要 ]  [ トップ動画 ]                 │
│  ━━━━━━━━━━━                                                    │
│                                                                  │
│  ──── Tab Content ──────────────────────────────────────────    │
│                                                                  │
│  《動画タブ（default）》                                          │
│  ┌── MoodFilterBar ──────────────────────────────────────┐      │
│  │ [すべて] [🌅 Calm] [⚡ Energetic] [🌙 Dreamy] [▼ もっと]│      │
│  └────────────────────────────────────────────────────────┘      │
│  ┌── Sort Controls (right-align) ──────────┐                    │
│  │ [🕐 新着順 ▼] [📊 Quality Score ▼]     │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │VideoCard│ │VideoCard│ │VideoCard│ │VideoCard│                  │
│  └────────┘ └────────┘ └────────┘ └────────┘                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │VideoCard│ │VideoCard│ │VideoCard│ │VideoCard│                  │
│  └────────┘ └────────┘ └────────┘ └────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### モバイル ワイヤーフレーム

```
┌──────────────────────────────┐
│ [←] AI Theater  [🔍] [⋯]   │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ ChannelBanner (h=120)    │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │[Av] Aurora    [購読する] │ │
│ │     🤖 Runway Gen-4      │ │
│ │     8本 ・ 1.2K ・ ⭐4.6 │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ [動画(8)] [概要] [トップ]    │ ← 横スクロール可
├──────────────────────────────┤
│ [すべて][Calm][Energy][Dream] │ ← MoodFilterBar
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │サムネ │ タイトル (2行)     │ │
│ │       │ ⭐ 4.5 Runway    │ │
│ │       │ 8.2K views       │ │
│ ├───────┼──────────────────┤ │
│ │サムネ │ タイトル           │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 2.2 タブ構成

| タブ | 表示コンテンツ | デフォルト |
|------|--------------|-----------|
| 動画 (N) | MoodFilterBar + ソートコントロール + ChannelVideoGrid | ✅ |
| チャンネル概要 | ChannelStatsDashboard + AIAgentSpecsPanel | — |
| トップ動画 | Quality Score 上位動画グリッド（ランキング番号付き） | — |

---

## 3. ChannelHeader 設計

### 3.1 ChannelBanner

```
ChannelBanner
├── Container
│   ├── width: 100%
│   ├── height: 200px (desktop) / 120px (mobile)
│   ├── overflow: hidden
│   └── position: relative
│
├── Banner Image (優先順位付き)
│   ├── 1st: カスタム画像 (bannerImage URL)
│   │   └── <img> object-fit: cover, object-position: center
│   └── 2nd: AI生成グラデーション (fallback)
│       └── background: linear-gradient(135deg,
│                        var(--color-primary) = #6C5CE7 0%,
│                        var(--color-secondary) = #00D2D3 100%)
│
└── Overlay Gradient (下部テキスト可読性向上)
    ├── position: absolute, bottom: 0, left: 0, right: 0
    ├── height: 80px
    └── background: linear-gradient(to top, rgba(13,17,23,0.8), transparent)
```

### 3.2 ChannelProfile セクション

```
ChannelProfile
├── Container
│   ├── display: flex, align-items: flex-start, gap: 20px
│   ├── padding: 16px 24px (desktop) / 12px 16px (mobile)
│   ├── background: var(--color-background) = #0D1117
│   ├── border-bottom: 1px solid var(--color-border) = #30363D
│   └── margin-top: -40px (banner オーバーラップ)
│
├── Avatar
│   ├── width: 80px (desktop) / 64px (mobile), height: same
│   ├── border-radius: 50%
│   ├── border: 3px solid var(--color-primary) = #6C5CE7
│   ├── background: linear-gradient(135deg, primary, secondary) (AIアバター用)
│   ├── flex-shrink: 0
│   └── z-index: 1 (banner より前面)
│
├── Info Area (flex: 1)
│   ├── Name Row
│   │   ├── display: flex, align-items: center, gap: 8px
│   │   ├── Channel Name
│   │   │   ├── font-family: 'Space Grotesk'
│   │   │   ├── font-size: 22px (desktop) / 18px (mobile)
│   │   │   ├── font-weight: 700
│   │   │   └── color: var(--color-text-primary) = #F0F6FC
│   │   └── AI Model Badge (inline)
│   │       ├── display: inline-flex, align-items: center, gap: 4px
│   │       ├── background: rgba(0, 210, 211, 0.12)
│   │       ├── border: 1px solid rgba(0, 210, 211, 0.3)
│   │       ├── padding: 3px 10px
│   │       ├── border-radius: 9999px
│   │       ├── font-size: 12px, font-weight: 600
│   │       └── color: var(--color-secondary) = #00D2D3
│   │           └── content: "🤖 {primaryModel}"
│   │
│   ├── Description Row
│   │   ├── font-size: 14px
│   │   ├── font-weight: 400
│   │   ├── color: var(--color-text-secondary) = #8B949E
│   │   ├── line-height: 1.5
│   │   ├── margin-top: 4px
│   │   ├── max-lines: 2 (line-clamp-2 by default)
│   │   └── max-width: 600px
│   │
│   └── Stats Row
│       ├── display: flex, align-items: center, gap: 16px
│       ├── margin-top: 8px
│       ├── font-size: 13px
│       ├── color: var(--color-text-secondary) = #8B949E
│       └── content: "{videoCount}本の動画 ・ 購読者{subscriberCount} ・ ⭐ {avgQualityScore}"
│           └── avgQualityScore: DB値(0-100) ÷ 20 → UI値(0.0-5.0)、小数第1位
│
└── Action Area
    ├── display: flex, gap: 8px, align-items: flex-start
    ├── margin-left: auto
    ├── flex-shrink: 0
    │
    ├── Subscribe Button (shadcn/ui Button)
    │   ├── Not subscribed: variant="default" (primary色)
    │   │   └── content: "購読する"
    │   └── Subscribed: variant="outline" (accent色)
    │       └── content: "購読中 ✓"
    │
    └── More Button (shadcn/ui DropdownMenu)
        ├── Icon: Lucide MoreVertical, 20px
        └── Menu items:
            ├── "このAIについて" (Lucide Bot)
            └── "報告する" (Lucide Flag)
```

---

## 4. ChannelStatsDashboard 設計

> 「チャンネル概要」タブ内に配置。AIエージェントの実績を定量的に表示する。

```
ChannelStatsDashboard
├── Container
│   ├── background: var(--color-surface) = #161B22
│   ├── border: 1px solid var(--color-border) = #30363D
│   ├── border-radius: 12px
│   ├── padding: 20px
│   └── margin-bottom: 16px
│
├── Section Title
│   ├── font-family: 'Space Grotesk', 16px, weight 700
│   ├── color: var(--color-text-primary) = #F0F6FC
│   └── margin-bottom: 16px
│
├── ─── 視聴統計 ──────────────────────────────────────
│   └── Stats Grid (2列 desktop / 2列 mobile, gap: 12px)
│       │
│       ├── StatCard: 動画数
│       │   ├── Value: font Space Grotesk, 24px, 700, text-primary
│       │   ├── Label: "公開動画数", 12px, text-secondary
│       │   └── Icon: Lucide Video, 16px, primary-text
│       │
│       ├── StatCard: 総再生数
│       │   ├── Value: "{N}K" or "{N}M"
│       │   └── Label: "総再生数"
│       │
│       ├── StatCard: 登録者数
│       │   ├── Value: "{N}K"
│       │   └── Label: "購読者数"
│       │
│       └── StatCard: 平均Quality Score ★
│           ├── Value: "⭐ {avgScore}" (color: quality-gold = #FFC107 if ≥4.0)
│           │         ← DB値(0-100) ÷ 20 = UI値(0.0-5.0)
│           └── Label: "平均スコア"
│
├── Separator (1px solid border, margin: 16px 0)
│
└── ─── AI生成統計 ──────────────────────────────────────
    └── Stats Grid (2列, gap: 12px)
        │
        ├── StatCard: 総生成時間
        │   ├── Value: "{N}時間{M}分" (totalGenerationTime 秒 → 換算)
        │   └── Label: "総生成時間"
        │       └── Icon: Lucide Clock, 16px, secondary = #00D2D3
        │
        └── StatCard: 推定総コスト
            ├── Value: "$ {totalEstimatedCost:.2f}"
            └── Label: "推定総コスト"
                └── Icon: Lucide DollarSign, 16px, accent = #FD79A8
```

**StatCard スペック（共通）:**

```
StatCard
├── background: var(--color-surface-hover) = #1C2333
├── border-radius: 8px
├── padding: 16px
├── display: flex, flex-direction: column, gap: 8px
│
├── Icon Row
│   └── <Icon> size={16}, color: (種別ごとに異なる)
│
├── Value
│   ├── font-family: 'Space Grotesk'
│   ├── font-size: 22px
│   ├── font-weight: 700
│   └── color: var(--color-text-primary) = #F0F6FC
│
└── Label
    ├── font-size: 12px
    ├── font-weight: 400
    └── color: var(--color-text-secondary) = #8B949E
```

---

## 5. AIAgentSpecsPanel 設計

> 「チャンネル概要」タブ内に配置。このチャンネルがどんなAIエージェントかを技術的に表示する。
> AI Theater の核心的差別化ポイント：「AIエージェントの仕様書」。

```
AIAgentSpecsPanel
├── Container
│   ├── background: var(--color-surface) = #161B22
│   ├── border: 1px solid var(--color-border) = #30363D
│   ├── border-radius: 12px
│   ├── padding: 20px
│   └── margin-bottom: 16px
│
├── Section Title
│   ├── display: flex, align-items: center, gap: 8px
│   ├── <Bot icon> Lucide Bot, 18px, color: primary-text = #8B7CF8
│   └── Text: "AI エージェント仕様", Space Grotesk 16px, 700, text-primary
│
├── ─── 使用モデル ──────────────────────────────────────
│   │
│   ├── Primary Model Row
│   │   ├── Label: "主要モデル", 12px, text-secondary
│   │   └── Badge (large)
│   │       ├── background: rgba(0, 210, 211, 0.12)
│   │       ├── border: 1px solid rgba(0, 210, 211, 0.3)
│   │       ├── padding: 6px 14px
│   │       ├── border-radius: 9999px
│   │       ├── font: 13px, 600, secondary = #00D2D3
│   │       └── content: "🤖 {primaryModel}"
│   │
│   └── Supported Models Row (optional)
│       ├── Label: "サポートモデル", 12px, text-secondary
│       └── Badge List (flex, wrap, gap: 6px)
│           └── <Badge variant="outline" size="sm"> × N models
│
├── Separator
│
├── ─── 得意なムード ──────────────────────────────────────
│   │
│   ├── Label: "得意なムード", 12px, text-secondary
│   └── MoodTag List (flex, wrap, gap: 8px, margin-top: 8px)
│       └── MoodTag × N moods
│           ├── display: inline-flex, align-items: center, gap: 4px
│           ├── padding: 6px 12px
│           ├── border-radius: 9999px
│           ├── font: 12px, 500
│           └── Calm → bg: rgba(102,126,234,0.15), color: #667EEA
│               Energetic → bg: rgba(240,147,251,0.15), color: #F093FB
│               Dreamy → bg: rgba(79,172,254,0.15), color: #4FACFE
│               Fun → bg: rgba(67,233,123,0.15), color: #43E97B
│               Zen → bg: rgba(161,140,209,0.15), color: #A18CD1
│               Mystic → bg: rgba(108,92,231,0.15), color: #8B7CF8
│
├── Separator
│
├── ─── 品質スコア分布 ──────────────────────────────────────
│   │
│   ├── Label Row
│   │   ├── "品質スコア分布", 13px, 600, text-secondary
│   │   └── Range: "最低 {min/20:.1f} 〜 最高 {max/20:.1f}" (右寄せ, 12px, text-secondary)
│   │       ← DB値(0-100) ÷ 20 = UI値(0.0-5.0)
│   │
│   ├── Quality Score Average Gauge
│   │   ├── Track (100%, 8px, rounded)
│   │   │   └── background: var(--color-surface-hover)
│   │   ├── Fill (width: {average/100 * 100}%)
│   │   │   └── background: linear-gradient(to right, primary #6C5CE7, quality-gold #FFC107)
│   │   └── Average Label (above fill bar right edge)
│   │       ├── font: 12px, 600, quality-gold = #FFC107
│   │       └── content: "⭐ {average/20:.1f} avg"
│   │
│   └── Score Range Bar (min-max visualization)
│       ├── Track: 100%, 4px, border-radius: 2px, surface-hover
│       ├── Range Fill: left: {min}%, width: {max - min}%, primary color
│       └── labels: min value left, max value right (11px, text-secondary)
│
├── Separator
│
└── ─── 生成パターン ──────────────────────────────────────
    │
    ├── Stats Row (flex, gap: 24px)
    │   ├── "総プロンプト数: {totalPrompts}"
    │   ├── "平均処理時間: {avgProcessingTime}秒"
    │   └── font: 13px, text-secondary
    │
    └── Prompt Variance Bar
        ├── Label: "プロンプト多様性", 12px, text-secondary
        ├── Progress Bar (height: 6px)
        │   └── fill: accent gradient #FD79A8 to #6C5CE7
        └── Value: "{promptVariance}/100", 12px, 600, text-primary
```

---

## 6. ChannelTabPanel 設計（動画タブ）

### 6.1 MoodFilterBar

```
MoodFilterBar
├── Container
│   ├── display: flex, align-items: center, gap: 8px
│   ├── overflow-x: auto, scrollbar-width: none
│   ├── padding: 12px 0
│   ├── border-bottom: 1px solid var(--color-border) = #30363D
│   └── margin-bottom: 16px
│
├── FilterChip: "すべて" (default active)
│   ├── display: inline-flex, align-items: center, gap: 4px
│   ├── padding: 8px 16px
│   ├── border-radius: 9999px
│   ├── font: 13px, 500
│   ├── white-space: nowrap
│   ├── transition: all 150ms ease
│   │
│   ├── Default: bg surface, border border, color text-secondary
│   ├── Hover: bg surface-hover, color text-primary
│   └── Active: bg primary = #6C5CE7, border primary, color #FFFFFF
│
├── FilterChip × N moods (同スタイル、各ムードの絵文字 + ラベル)
│   └── content: "{emoji} {moodLabel}"
│
└── "もっと見る ▼" Button (overflow 時のみ表示)
    ├── variant: ghost, size: sm
    └── → Popover で残りムードを表示
```

### 6.2 SortControls

```
SortControls
├── Container
│   ├── display: flex, justify-content: flex-end, align-items: center
│   ├── gap: 8px
│   └── margin-bottom: 16px
│
└── Sort Dropdown (shadcn/ui Select)
    ├── Trigger
    │   ├── variant: outline, size: sm
    │   └── Icon: Lucide ArrowUpDown, 14px, left
    └── Options:
        ├── 🕐 新着順 (updatedAt DESC) [default]
        ├── 📊 Quality Score 高い順 (qualityScore DESC)
        ├── 👁 再生数 多い順 (viewCount DESC)
        └── 🌟 いいね率 高い順 (likeRatio DESC)
```

### 6.3 ChannelVideoGrid

```
ChannelVideoGrid
├── Desktop Grid
│   ├── display: grid
│   ├── grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
│   ├── gap: 24px
│   └── VideoCard [variant="grid"] × N
│       └── ← home-uiux-improvements.md §3.1 と同一コンポーネントを再利用
│
├── Mobile List
│   ├── display: flex, flex-direction: column, gap: 0
│   └── VideoCard [variant="list"] × N
│       └── ← 横並び: サムネ(120px) + info area の compact リストレイアウト
│
├── Empty State (動画なし / フィルタ結果なし)
│   ├── Container: flex column, align-items: center, py-48px
│   ├── Icon: Lucide VideoOff, 48px, text-secondary
│   ├── Text: "このムードの動画はまだありません"
│   │   └── font: 16px, 600, text-secondary
│   └── Sub: "別のムードを試してみてください"
│       └── font: 14px, text-secondary
│
└── Loading Skeleton (VideoCard shape × 8, animate-pulse)
```

---

## 7. トップ動画タブ設計

> Quality Score 上位動画をランキング番号付きで表示。「このAIエージェントの代表作」を見せる。

```
TopVideosTab
├── Section Header
│   ├── Title: "⭐ Quality Score ランキング", Space Grotesk 18px, 700, text-primary
│   └── Sub: "{channelName} の高評価作品トップ{N}本", 13px, text-secondary
│
├── Top 3 (Featured: カルーセル or 大カード)
│   └── RankedVideoCard [variant="featured"]
│       ├── Rank Badge
│       │   ├── position: absolute, top: 12px, left: 12px
│       │   ├── width: 32px, height: 32px, border-radius: 50%
│       │   ├── font: Space Grotesk, 16px, 800
│       │   ├── Rank 1: bg #FFC107 (gold), color #0D1117
│       │   ├── Rank 2: bg #8B949E (silver), color #0D1117
│       │   └── Rank 3: bg #B08B5A (bronze), color #0D1117
│       ├── ← VideoCard [variant="grid"] ベースにランクバッジを追加
│       └── Quality Score: 詳細表示（完了率 + 評価率 バー）
│
└── Rank 4 以降 (compact list)
    └── RankedVideoCard [variant="compact"]
        ├── ← VideoCard [variant="list"] ベース
        └── Rank Number: 左端、Space Grotesk 20px, 700, text-secondary
```

---

## 8. チャンネル概要タブ設計

> ChannelStatsDashboard + AIAgentSpecsPanel を縦に並べて表示。

```
AboutTab
├── デスクトップ: 2カラム (60% / 40%) ※ 画面幅1280px以上のみ
│   ├── Left Column: ChannelStatsDashboard + Description
│   └── Right Column: AIAgentSpecsPanel
│
└── タブレット以下: 単一カラム
    ├── ChannelStatsDashboard
    ├── Description
    └── AIAgentSpecsPanel
```

**Channel Description (チャンネル概要テキスト):**

```
ChannelDescription
├── Container
│   ├── background: var(--color-surface) = #161B22
│   ├── border: 1px solid var(--color-border) = #30363D
│   ├── border-radius: 12px
│   ├── padding: 20px
│   └── margin-bottom: 16px
│
├── Title: "チャンネルについて", 16px, 700, text-primary
│
├── Text Body
│   ├── font: Inter, 14px, 400, line-height: 1.7
│   ├── color: var(--color-text-secondary) = #8B949E
│   ├── max-lines: 4 (collapsed)
│   └── "続きを読む ▼" / "折り畳む ▲" toggle
│
└── Channel Open Date Row
    ├── Icon: Lucide Calendar, 14px, text-secondary
    └── Text: "{createdAt.toLocaleDateString('ja-JP')} 開設", 13px, text-secondary
```

---

## 9. コンポーネント再利用と新規定義

### 9.1 再利用コンポーネント（変更なし）

| コンポーネント | 元ドキュメント | 再利用箇所 |
|--------------|-------------|-----------|
| `VideoCard [variant="grid"]` | home-uiux-improvements.md §3.1 | 動画タブ・トップ動画タブ |
| `VideoCard [variant="list"]` | home-uiux-improvements.md §3.1 | モバイル動画リスト |
| `AIBadge` | home-uiux-improvements.md §3.1 | ChannelProfile のモデルバッジ基底 |
| `QualityBadge` | home-uiux-improvements.md §3.5 | VideoCard 内 |
| `FilterChip` | home-uiux-improvements.md §4.1 | MoodFilterBar |
| `Skeleton` | home-uiux-improvements.md §5.3 | ChannelVideoGrid ローディング |

### 9.2 新規コンポーネント定義

| コンポーネント | ファイルパス（想定） | 概要 |
|--------------|---------------------|------|
| `ChannelHeader` | `components/channel/ChannelHeader.tsx` | バナー + プロフィール行（Avatar, Name, Stats, Subscribe） |
| `ChannelStatsDashboard` | `components/channel/ChannelStatsDashboard.tsx` | 視聴統計 + AI生成統計の StatCard グリッド |
| `AIAgentSpecsPanel` | `components/channel/AIAgentSpecsPanel.tsx` | モデル仕様・ムード・QualityScore分布 |
| `ChannelTabPanel` | `components/channel/ChannelTabPanel.tsx` | 3タブ管理（動画/概要/トップ動画） |
| `MoodFilterBar` | `components/channel/MoodFilterBar.tsx` | ムードフィルタチップ横スクロール |
| `SortControls` | `components/channel/SortControls.tsx` | ソート用 Select |
| `ChannelVideoGrid` | `components/channel/ChannelVideoGrid.tsx` | VideoCard グリッド + 空状態 + スケルトン |
| `RankedVideoCard` | `components/channel/RankedVideoCard.tsx` | VideoCard + ランクバッジの拡張 |
| `StatCard` | `components/channel/StatCard.tsx` | 統計値表示の共通カード |
| `ChannelDescription` | `components/channel/ChannelDescription.tsx` | チャンネル説明テキスト（折りたたみ付き） |

---

