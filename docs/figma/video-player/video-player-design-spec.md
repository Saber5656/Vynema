# 動画再生ページ Figma デザインスペック

作成日: 2026-02-23
担当: designer
Task: #2
ステータス: **v1.0** — Task #4 (researcher) 調査結果を統合・最終化

---

## 0. 本ドキュメントの使い方

Figma でのモックアップ再現 / 実装者向けのデザイン仕様書。
`docs/figma/home-design-spec.md` のデザイントークン体系（カラー・タイポグラフィ・スペーシング）を **そのまま継承** する。
本ドキュメントでは動画再生ページ (`/watch/[videoId]`) 固有のレイアウト・コンポーネントを定義する。

> **参照元**
> - デザイントークン全文: `docs/figma/home-design-spec.md` §1〜§3
> - VideoCard compact スペック: `home-design-spec.md` §5.3
> - アニメーション仕様: `home-design-spec.md` §7
> - アクセシビリティ基準: `home-design-spec.md` §8
> - 競合 UX 調査: `docs/detailed-design/video-player/task-4-research-summary.md`

> **v1.0 主要変更点（v0.9 → v1.0）**
> - デスクトップ: 2カラム → **3段タブUI構成**（プレーヤー最優先、サイドバー廃止）
> - モバイル: 縦スクロール → **下部タブ切り替えパネル**
> - AI 生成メタデータに **生成時間・推定コスト・C2PA プロヴェナンス** を追加
> - Mux Player: **CSS Parts セレクタ**による詳細カスタマイズを明記

---

## 1. デザイントークン継承（差分のみ記載）

### 1.1 カラー（home-design-spec.md §1 を全継承）

動画再生ページ固有の追加トークンはなし。
以下は参照頻度が高いトークンの抜粋:

| トークン             | Hex       | 主な用途（動画再生ページ）                     |
| ---------------- | --------- | --------------------------------- |
| `background`     | `#0D1117` | ページ背景、Mux Player 背景               |
| `surface`        | `#161B22` | 各パネル背景・タブコンテンツ背景                  |
| `surface-hover`  | `#1C2333` | バッジ背景、パネル内ホバー                     |
| `primary`        | `#6C5CE7` | アクティブタブ下線、Mux accentColor         |
| `primary-text`   | `#8B7CF8` | テキストリンク、アイコン、プロンプト引用線             |
| `secondary`      | `#00D2D3` | AIモデルバッジ、C2PA バッジ                 |
| `accent`         | `#FD79A8` | テーマバッジ文字色                         |
| `text-primary`   | `#F0F6FC` | タイトル、本文                           |
| `text-secondary` | `#8B949E` | メタ情報、ラベル、タブ非アクティブ                 |
| `text-tertiary`  | `#7A8390` | 最小テキスト（compact card の views/time） |
| `quality-gold`   | `#FFC107` | Quality Score ≥ 4.0               |
| `quality-silver` | `#8B949E` | Quality Score 3.0〜3.9             |
| `quality-dim`    | `#7A8390` | Quality Score < 3.0               |
| `border`         | `#30363D` | 全パネルのボーダー、タブ下線                    |
| `error`          | `#F85149` | プレーヤーエラーアイコン                      |
| `success`        | `#3FB950` | C2PA 認証済みバッジ                      |

### 1.2 タイポグラフィ（home-design-spec.md §2 を全継承）

動画再生ページで使用する主要スタイル:

| スタイル名 | Font | Size | Weight | 用途 |
|-----------|------|------|--------|------|
| `heading-md` | Space Grotesk | 18px | 700 | 動画タイトル |
| `heading-sm` | Inter | 16px | 600 | エラーメッセージ、パネルタイトル |
| `body-md` | Inter | 14px | 400 | 説明文、コメント本文 |
| `body-sm` | Inter | 13px | 400 | プロンプトテキスト、タブコンテンツ |
| `caption` | Inter | 12px | 400 | 視聴数・日付・Quality指標ラベル |
| `label-sm` | Inter | 11px | 600 | バッジ文字 |

### 1.3 スペーシング（home-design-spec.md §3 を全継承）

動画再生ページで頻出:
- タブパネル内パディング: `16px` (`p-4`)
- パネル間マージン: `16px` (`mb-4`)
- タブリスト下ボーダーからコンテンツまで: `16px`
- セクション内要素間ギャップ: `8px` (`gap-2`)

---

## 2. Figmaフレーム設定

### 2.1 デスクトップフレーム (1440px)

```
Desktop Frame: 1440 × 900
├── Header: Fixed, w=1440, h=64
└── Main Content Area (Single Column, max-w=1200px, margin: 0 auto)
    ├── Top: 64px (header offset)
    ├── Padding: left=24, right=24, top=24, bottom=40
    └── Display: flex, flex-direction: column, gap=0
        ├── Tier 1: VideoPlayer Area
        ├── Tier 2: TabPanel (TitleMetaBar + ActionBar + タブUI)
        └── Tier 3: RelatedVideos (Grid)
```

### 2.2 タブレットフレーム (768px)

```
Tablet Frame: 768 × 1024
├── Header: Fixed, w=768, h=56
└── Main Content (Single Column)
    ├── Top: 56px
    └── Padding: left=16, right=16, top=16, bottom=40
```

### 2.3 モバイルフレーム (375px)

```
Mobile Frame: 375 × 812
├── Header: Fixed, w=375, h=56
├── VideoPlayer Area: top=56px, full-width
├── TitleMetaBar: padding 0 16px
├── ActionBar: padding 0 16px
└── BottomTabSheet (固定下部パネル高さ可変)
    └── Tabs: 推薦 / クリエイター / プロンプト / コメント
```

---

## 3. ページ全体レイアウト

### 3.1 デスクトップレイアウト（3段構成）

> 根拠: プレーヤー最優先・サイドバー拡張によるプレーヤー圧縮を避ける（Task #4 調査より）

```
┌─────────────────────────────────────────────────────────┐
│  Header (Fixed, h=64)                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ──────── Tier 1: VideoPlayer ─────────────────────     │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │               <MuxPlayer>                       │    │
│  │            aspect-ratio: 16/9                   │    │
│  │            max-width: 1152px                    │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ──────── Tier 2: タイトル + タブパネル ────────────    │
│  動画タイトル (heading-md)                              │
│  123K views ・ 2026-02-20 ・ ★ 4.8                     │
│  [👍 1.2K] [👎] [↗ 共有] [📥 保存] [⋯]               │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [推薦] [クリエイター] [プロンプト] [コメント]      │   │
│  │ ─────────────────────────────────────────────    │   │
│  │ <アクティブタブのコンテンツ>                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ──────── Tier 3: 関連動画グリッド ────────────────    │
│  次に見る                                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
│  │ Card │ │ Card │ │ Card │ │ Card │                   │
│  └──────┘ └──────┘ └──────┘ └──────┘                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 モバイルレイアウト（下部タブ切り替え）

> 根拠: スマートフォンでのスクロール効率化、モバイル UX 最適化（Task #4 調査より）

```
┌──────────────────────────────┐
│ Header (h=56)                │
├──────────────────────────────┤
│ VideoPlayer (full-width,     │
│  aspect-ratio: 16/9)         │
├──────────────────────────────┤
│ タイトル                      │
│ 12K views ・ ★ 4.8           │
├──────────────────────────────┤
│ [👍] [👎] [↗] [📥] [⋯]     │
├──────────────────────────────┤
│ BottomTabSheet               │
│ ┌──────────────────────────┐ │
│ │[推薦][クリエイター]       │ │
│ │[プロンプト][コメント]     │ │
│ │──────────────────────    │ │
│ │ <タブコンテンツ>          │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

---

## 4. コンポーネント詳細スペック

### 4.1 VideoPlayer Area

```
VideoPlayerArea
├── Container (relative)
│   ├── Width: 100%
│   ├── Aspect-ratio: 16 / 9
│   ├── Max-width: 100% (プレーヤー最優先・圧縮しない)
│   ├── Background: #000000
│   ├── Border-radius: 12px (desktop) / 0 (mobile, full-bleed)
│   ├── Overflow: hidden
│   └── Margin-bottom: 16px
│
├── MuxPlayer
│   ├── streamType: "on-demand"
│   ├── Width: 100%, Height: 100%
│   │
│   ├── ─── ブランディング (CSS Variables) ─────────────
│   │   mux-player {
│   │     --media-accent-color: #6C5CE7;
│   │     --media-background-color: #0D1117;
│   │     --media-control-background: rgba(13, 17, 23, 0.8);
│   │     border-radius: 12px;
│   │     overflow: hidden;
│   │     aspect-ratio: 16 / 9;
│   │     width: 100%;
│   │   }
│   │
│   ├── ─── CSS Parts セレクタ (CSS Parts) ────────────
│   │   mux-player::part(seek-live-button) { display: none; }
│   │   mux-player::part(time-range) {
│   │     --media-range-track-color: rgba(108, 92, 231, 0.4);
│   │     --media-range-thumb-color: #8B7CF8;
│   │   }
│   │   mux-player::part(play-button):hover { color: #8B7CF8; }
│   │   mux-player:focus-visible {
│   │     outline: 2px solid #8B7CF8;
│   │     outline-offset: 2px;
│   │   }
│   │
│   └── ─── イベント ──────────────────────────────────
│       onPlay, onPause, onTimeUpdate, onEnded, onError, onLoadStart
│
├── AIGeneratedOverlay (再生開始後 3秒で自動フェードアウト)
│   ├── Position: absolute, inset: 0
│   ├── Background: rgba(0, 0, 0, 0.55)
│   ├── Display: flex, flex-direction: column
│   ├── Align-items: center, justify-content: center
│   ├── z-index: 10, pointer-events: none
│   ├── Bot Icon: Lucide Bot, 40px, #8B7CF8
│   ├── Text: "この動画はAIが生成しました"
│   │   ├── Font: Space Grotesk, 16px, weight 600, #FFFFFF
│   │   └── Margin-top: 8px
│   └── ModelBadge: background #1C2333, color #00D2D3, 12px, margin-top: 8px
│   Animation: .ai-overlay { animation: fadeInOut 3s ease forwards; }
│   ※ home-design-spec §7.3 の @keyframes fadeInOut を共有
│
└── ErrorState
    ├── Container: aspect-video, bg #161B22, border #30363D, rounded-xl
    ├── Display: flex, flex-col, items-center, justify-center, gap: 12px
    ├── Icon: Lucide AlertTriangle, 48px, #F85149
    ├── Title: Inter, 16px, weight 600, #F0F6FC
    │   → "動画を読み込めませんでした"
    ├── Sub: Inter, 14px, #8B949E
    │   → "しばらくしてからもう一度お試しください"
    └── Button: "再読み込み" (variant="outline", margin-top: 16px)
```

### 4.2 TitleMetaBar

```
TitleMetaBar
├── Container
│   ├── Padding: 12px 0
│   └── Display: flex, flex-direction: column, gap: 6px
│
├── Title
│   ├── Font: Space Grotesk, 18px, weight 700
│   ├── Color: #F0F6FC
│   ├── Line-height: 24px
│   └── Max lines: 2 (line-clamp-2)
│
└── Meta Row
    ├── Display: flex, align-items: center, gap: 8px, flex-wrap: wrap
    ├── Font: Inter, 13px, weight 400, #8B949E
    └── Items:
        ├── "{viewCount} views"
        ├── Separator "・": color #7A8390
        ├── "{relativeDate}"
        ├── Separator "・"
        └── "★ {displayScore}"
            ├── displayScore = toDisplayScore(video.qualityScore)
            │   → DB値(0-100) / 20、小数点1桁表示
            │   → 例: DB=96 → "★ 4.8"、DB=70 → "★ 3.5"
            ├── score ≥ 4.0 (DB ≥ 80): color #FFC107 (quality-gold)
            ├── score 3.0〜3.9 (DB 60〜79): color #8B949E (quality-silver)
            └── score < 3.0 (DB < 60): color #7A8390 (quality-dim)
```

### 4.3 ActionBar

```
ActionBar
├── Container
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Padding: 12px 0
│   ├── Border-top: 1px solid #30363D
│   └── Border-bottom: 1px solid #30363D
│
├── LikeButton (variant="ghost")
│   ├── Icon: Lucide ThumbsUp, 18px
│   ├── Count: "{likeCount}", Inter 13px
│   ├── Default: color #8B949E; Active: color #8B7CF8; Hover: bg #1C2333
│   └── aria-pressed={liked}, aria-label="いいね {likeCount}件"
│
├── DislikeButton
│   ├── Icon: Lucide ThumbsDown, 18px
│   └── Text: "低評価" (mobile hidden)
│
├── ShareButton
│   ├── Icon: Lucide Share2, 18px, Text: "共有"
│   └── onClick: Web Share API → fallback: URL コピー
│
├── SaveButton
│   ├── Default: Icon Lucide BookmarkPlus, 18px, Text: "保存"
│   └── Saved: Lucide Bookmark (filled), color #8B7CF8
│
└── MoreButton (DropdownMenu)
    ├── Icon: Lucide MoreHorizontal, 18px
    └── Items: "報告する" / "プロンプトをコピー" / "このAIについて"

[Mobile 差分]
└── テキストラベル非表示、justify-content: space-around
```

### 4.4 WatchPageTabPanel（新規コンポーネント）

> Task #4 調査による新規追加：Vimeo Progressive Disclosure + AI Theater 下部タブ設計

```
WatchPageTabPanel
├── Container
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 12px
│   └── Overflow: hidden
│
├── TabList (flex, border-bottom: 1px solid #30363D)
│   ├── Display: flex, gap: 0
│   ├── Overflow-x: auto, scrollbar-width: none
│   ├── Padding: 0 16px
│   │
│   └── TabTrigger (各タブ)
│       ├── Height: 44px
│       ├── Padding: 0 16px
│       ├── Font: Inter, 13px, weight 500
│       ├── White-space: nowrap
│       ├── Cursor: pointer
│       ├── Position: relative
│       │
│       ├── Inactive State
│       │   ├── Color: #8B949E
│       │   └── Background: transparent
│       │
│       ├── Active State
│       │   ├── Color: #F0F6FC
│       │   ├── Font-weight: 600
│       │   └── ::after (active indicator)
│       │       ├── Content: ""
│       │       ├── Position: absolute, bottom: 0, left: 0, right: 0
│       │       ├── Height: 2px
│       │       └── Background: #6C5CE7
│       │
│       ├── Hover State (inactive)
│       │   ├── Color: #F0F6FC
│       │   └── Background: rgba(255,255,255,0.04)
│       │
│       └── Focus-visible
│           └── Outline: 2px solid #8B7CF8, offset: -2px (内側)
│
├── タブ一覧
│   ├── Tab[0]: "推薦"     → RecommendTab（関連動画）
│   ├── Tab[1]: "クリエイター" → CreatorTab（AICreatorCard + QualityScore）
│   ├── Tab[2]: "プロンプト"  → PromptTab（AIInfoPanel + AI メタデータ）
│   └── Tab[3]: "コメント"   → CommentsTab（CommentsSection）
│
└── TabContent
    ├── Padding: 16px
    ├── Transition: opacity 150ms ease
    └── Animate: fadeIn on tab switch (opacity 0 → 1)

---
[Mobile 差分: BottomTabSheet]
│
├── Container (fixed bottom, z-index: 60)
│   ├── Position: fixed, bottom: 56px (above bottom nav), left: 0, right: 0
│   ├── Background: #0D1117
│   ├── Border-top: 1px solid #30363D
│   └── Max-height: 70vh, overflow-y: auto
│
├── TabList: 同上（horizontal scroll）
└── TabContent: 同上（スクロール可能）
```

### 4.5 RecommendTab コンテンツ

```
RecommendTab
├── SectionLabel: "次に見る"
│   ├── Font: Inter, 12px, weight 600, uppercase, letter-spacing: 0.5px
│   └── Color: #8B949E
│
├── VideoGrid (desktop: 4カラム / tablet: 2カラム / mobile: 縦スクロール)
│   ├── gap: 16px
│   └── VideoCard [variant="compact"] × 5
│
├── SectionDivider (border-top: 1px solid #30363D, margin: 16px 0)
│
├── SectionLabel: "同じAIモデル ({modelName})"
│   └── + ModelBadge inline (color #00D2D3)
│
├── VideoGrid: VideoCard [variant="compact"] × 3
│
├── SectionDivider
│
└── SectionLabel: "{channelName} の他の動画"
    └── VideoGrid: VideoCard [variant="compact"] × 3

---
VideoCard [variant="compact"] (詳細: home-design-spec §5.3)
差分:
├── Views + Time: Inter, 11px, color: #7A8390 (text-tertiary)
└── Width: auto (grid による自動サイズ)
```

### 4.6 CreatorTab コンテンツ

```
CreatorTab
├── AICreatorCard
│   ├── Container: flex, align-items: center, gap: 16px, padding: 16px 0
│   ├── Avatar: 48px × 48px, border-radius: 50%, border: 2px solid #6C5CE7
│   ├── Info Area (flex: 1)
│   │   ├── Name Row: Name (15px, weight 600, #F0F6FC) + "🤖 AI" badge
│   │   ├── Stats: Inter, 12px, #8B949E
│   │   │   → "{videoCount} 動画 ・ 視聴者 {subscribers}K"
│   │   └── Model Badge: bg #1C2333, color #00D2D3, font 11px
│   └── Action Area: flex, gap: 8px
│       ├── "チャンネルを見る" Button (variant="outline", size="sm")
│       └── SubscribeButton
│           ├── Not subscribed: "購読する" (primary)
│           └── Subscribed: "購読中 ✓" (outline, color #00D2D3)
│               Hover: "購読解除"
│
├── Divider (border-top: 1px solid rgba(48,54,61,0.5), margin: 16px 0)
│
└── QualityScorePanel
    │   ⚠️ スケール変換ルール（ISSUE-1 修正済み）:
    │   - DB値 (qualityScore): 0〜100 の整数
    │   - UI表示値: toDisplayScore(raw) = Math.round((raw/20)*10)/10 → 0.0〜5.0
    │   - 色判定: getScoreColor(raw) 関数を使用（lib/utils/quality-score.ts）
    │   - 進捗バー (completionRate/likeRatio) は 0-100 のまま使用（変換不要）
    ├── Header Row: "Quality Score" (13px, weight 600, #8B949E)
    │              + "★ {toDisplayScore(qualityScore)}" (16px, weight 700)
    │   ├── display ≥ 4.0 (DB ≥ 80): #FFC107 (quality-gold)
    │   ├── display 3.0〜3.9 (DB 60〜79): #8B949E (quality-silver)
    │   └── display < 3.0 (DB < 60): #7A8390 (quality-dim)
    ├── Metrics (flex-col, gap: 8px, margin-top: 12px)
    │   ├── MetricRow: completionRate (qualityDetails.completionRate, 0-100 直接使用)
    │   │   ├── Label "完了率": 12px, #8B949E, width 48px
    │   │   ├── ProgressBar: height 6px, bg #1C2333
    │   │   │   Fill: linear-gradient(→, #6C5CE7, #8B7CF8), width: {completionRate}%
    │   │   └── Value: "{completionRate}%" Inter, 12px, weight 600, tabular-nums, #F0F6FC
    │   └── MetricRow: likeRatio (qualityDetails.likeRatio, 0-100 直接使用)
    │       └── Fill: linear-gradient(→, #FD79A8, #FF98B8)
    └── role="meter" + aria-valuenow + aria-valuemin=0 + aria-valuemax=100
```

### 4.7 PromptTab コンテンツ

> v1.0 追加: 生成時間・推定コスト・C2PA プロヴェナンス（Task #4 / Runway パターン）

```
PromptTab
│
├── AIMetadataSection (常時表示 / Progressive Disclosure: L1)
│   ├── Container: padding-bottom: 16px, border-bottom: 1px solid rgba(48,54,61,0.5)
│   └── Grid: 2列, gap: 8px
│       ├── "使用モデル" → ModelBadge (secondary color)
│       ├── "テーマ" → ThemeBadge (accent color) ← DB: Video.moods
│       ├── "生成日" → Inter, 13px, text-primary
│       └── "アスペクト比" → "16:9"
│
├── AIGenerationStats (新規 - v1.0追加 / Runway/Pikaパターン)
│   ├── Container: padding: 12px 0, border-bottom: 1px solid rgba(48,54,61,0.5)
│   └── Grid: 2列, gap: 8px
│       ├── "生成時間"
│       │   ├── Label: 12px, #8B949E
│       │   └── Value: Inter, 13px, #F0F6FC
│       │       → "{processingTime}秒" (例: "150秒")
│       ├── "推定コスト"
│       │   ├── Label: 12px, #8B949E
│       │   └── Value: Inter, 13px, #F0F6FC
│       │       → "$0.18" (例)
│       ├── "解像度"
│       │   └── "1080p / 30fps"
│       └── "時間"
│           └── "{duration}"
│
├── C2PAProvenanceRow (新規 - v1.0追加)
│   ├── Container: flex, align-items: center, gap: 8px
│   │   padding: 10px 0, border-bottom: 1px solid rgba(48,54,61,0.5)
│   ├── Icon: Lucide ShieldCheck, 16px, #3FB950 (success)
│   ├── Text: "生成認証 (C2PA)" Inter, 13px, #3FB950
│   └── Link: "検証する →"
│       ├── Font: Inter, 12px, #8B7CF8
│       └── href: "https://c2pa.org/verify/{certificateId}"
│
├── PromptSection (Vimeo Progressive Disclosure: L2〜L3)
│   ├── Label: "プロンプト", 12px, weight 600, #8B949E
│   ├── PromptTextBox
│   │   ├── Background: rgba(139, 124, 248, 0.06)
│   │   ├── Border-left: 2px solid #6C5CE7
│   │   ├── Border-radius: 0 8px 8px 0
│   │   ├── Padding: 10px 14px
│   │   ├── Font: Inter, 13px, line-height: 1.6, #F0F6FC
│   │   └── Default: line-clamp-3
│   └── "全文を見る ▼" toggle
│       ├── Font: Inter, 12px, weight 500, #8B7CF8
│       └── Expanded: "折り畳む ▲"
│   PromptHighlight State (?highlight=prompt):
│   └── Background: rgba(139,124,248,0.12) → 3s fade to 0.06
│
└── ActionRow (flex, gap: 8px, margin-top: 12px)
    ├── "プロンプトをコピー" Button (variant="outline", size="sm", Lucide Copy)
    │   → onClick: クリップボード + Toast "コピーしました" (success)
    └── "このモデルの動画を見る" Link (Inter, 13px, #8B7CF8)
        → href: /search?model={modelName}
```

### 4.8 CommentsTab コンテンツ

```
CommentsSection
├── Header Row
│   ├── "コメント ({count}件)" Space Grotesk, 16px, weight 700, #F0F6FC
│   └── SortDropdown: "最新順" / "人気順", Inter, 13px, #8B949E
│
├── CommentInput (認証済みのみ active)
│   ├── Avatar: 32px, border-radius: 50%
│   ├── Input
│   │   ├── Placeholder: "コメントを追加..."
│   │   ├── Background: transparent
│   │   ├── Border-bottom: 1px solid #30363D
│   │   ├── Focus: border-bottom-color #8B7CF8
│   │   └── Font: Inter, 14px, #F0F6FC
│   └── Actions (visible on focus)
│       ├── "キャンセル" (ghost)
│       └── "コメント" (primary, disabled until text entered)
│
├── CommentItem
│   ├── Display: flex, gap: 12px, padding: 12px 0
│   ├── Border-bottom: 1px solid rgba(48, 54, 61, 0.5)
│   ├── Avatar: 32px, border-radius: 50%
│   └── Content (flex: 1)
│       ├── Name (13px, weight 600, #F0F6FC) + Time (12px, #8B949E)
│       ├── Body: Inter, 14px, #F0F6FC, line-height: 1.6
│       ├── Actions: LikeButton (ThumbsUp + count) + "返信" (ghost, 13px)
│       └── Replies ("N件の返信 ▼" toggle, indent 44px)
│
└── LoadMore: "さらに読み込む" (variant="outline")
    └── Loading: Spinner inline
```

### 4.9 Tier 3: RelatedVideosGrid（デスクトップ下部）

```
RelatedVideosGrid
├── SectionHeader: "次に見る" + "すべて見る →"
│   ※ home-design-spec §5.6 SectionHeader に準拠
│
└── VideoGrid
    ├── desktop: grid-cols-4, gap-6
    ├── tablet: grid-cols-2, gap-4
    ├── mobile: (タブ内で表示 → ここには非表示)
    └── VideoCard [variant="grid"] × 4〜8
        ※ home-design-spec §5.3 grid variant に準拠
```

---

## 5. 状態バリエーション

### 5.1 ActionBar ボタン状態

| 状態 | いいね | 低評価 | 保存 | 購読 |
|------|-------|--------|------|------|
| Default | ThumbsUp #8B949E | ThumbsDown #8B949E | BookmarkPlus #8B949E | "購読する" primary |
| Active | ThumbsUp #8B7CF8 | ThumbsDown #8B7CF8 | Bookmark #8B7CF8 | "購読中 ✓" outline #00D2D3 |
| Hover | bg #1C2333 | bg #1C2333 | bg #1C2333 | "購読解除" |
| Loading | Spinner 16px | — | — | Spinner 16px |

### 5.2 WatchPageTabPanel 状態

| 状態 | 外観 |
|------|------|
| Tab inactive | color #8B949E, no underline |
| Tab active | color #F0F6FC, weight 600, 2px underline #6C5CE7 |
| Tab hover | color #F0F6FC, bg rgba(255,255,255,0.04) |
| Content switch | opacity 0→1, duration: 150ms ease |

### 5.3 VideoPlayer 状態

| 状態 | 外観 |
|------|------|
| 読み込み中 | Skeleton shimmer (aspect-video) |
| 再生待機 | MuxPlayer サムネイル表示 |
| 再生中 | MuxPlayer UI + AIOverlay (0〜3s) |
| エラー | ErrorState (AlertTriangle + テキスト + 再読み込み) |

### 5.4 C2PA ProvenanceRow 状態

| 状態 | 外観 |
|------|------|
| 認証済み | ShieldCheck #3FB950 + "生成認証 (C2PA)" |
| 未認証 | ShieldOff #7A8390 + "認証情報なし" |
| 確認中 | Spinner 14px #8B949E |

---

## 6. Skeleton ローディング

home-design-spec §7.2 の shimmer animation を使用。

```
WatchPage Skeleton
├── VideoPlayerSkeleton
│   └── aspect-video, border-radius: 12px, shimmer
│
├── TitleMetaBarSkeleton
│   ├── h-6 w-[70%] rounded (タイトル)
│   └── h-4 w-[40%] rounded mt-2 (メタ)
│
├── ActionBarSkeleton
│   └── flex gap-2: 4 × (h-8 w-20 rounded)
│
├── WatchPageTabPanelSkeleton
│   ├── TabList: flex gap-2 px-4 h-11: 4 × (h-5 w-20 rounded-full)
│   └── Content: h-48 (コンテンツ領域)
│
└── RelatedVideosGridSkeleton
    └── grid-cols-4 gap-6: 4 × VideoCardSkeleton
```

---

## 7. レスポンシブ差分サマリ

| コンポーネント | Desktop (lg+) | Tablet (sm〜lg) | Mobile (<sm) |
|-------------|--------------|----------------|-------------|
| VideoPlayer | max-w 100% (1152px), rounded-xl | 同左 | full-width, rounded-none |
| タイトル・ActionBar | Playerの直下 | 同左 | 同左 |
| TabPanel | Player直下 (4タブ) | 同左 | BottomTabSheet (fixed) |
| 関連動画 | Tier 3 Grid (4カラム) | Tier 3 Grid (2カラム) | TabPanel「推薦」タブ内 |
| ActionBar | アイコン + テキスト | アイコン + テキスト | アイコンのみ |
| QualityScorePanel | CreatorTab 内（フルパネル） | 同左 | 同左（スクロール可） |

---

## 8. アニメーション仕様

home-design-spec §7.1〜7.4 に準拠。動画再生ページ固有の追加:

| 要素 | アニメーション | Duration | Easing |
|------|-------------|----------|--------|
| AIGeneratedOverlay | fadeInOut (.ai-overlay クラス) | 3s | ease forwards |
| TabContent 切り替え | opacity 0→1 | 150ms | ease |
| PromptHighlight フェードアウト | bg rgba(0.12→0.06) | 3s | ease |
| SubscribeButton 状態変化 | color transition | 150ms | ease |
| C2PARow Spinner | animate-spin | ∞ | linear |

---

## 9. アクセシビリティ仕様

| 要素 | ARIA ロール / 属性 |
|------|-----------------|
| MuxPlayer | 標準キーボード・スクリーンリーダー対応 |
| WatchPageTabPanel | `role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-selected` / `aria-controls` |
| Quality Score 進捗バー | `role="meter"` + `aria-valuenow` + `aria-valuemin=0` + `aria-valuemax=100` + `aria-label="完了率"` |
| AIOverlay | `aria-live="polite"` → フェード後 `aria-hidden="true"` |
| Like/Dislike ボタン | `aria-pressed={active}` + `aria-label="いいね {count}件"` |
| プロンプトコピー | コピー後 `aria-live="assertive"` + Toast "コピーしました" |
| CommentsSection | `role="list"` / `role="listitem"` |
| CommentInput | `aria-label="コメントを追加"` / 未ログイン: `aria-disabled="true"` |
| Tier 3 関連動画 | `aria-label="関連動画"` を `<section>` に付与 |
| C2PAProvenanceRow リンク | `aria-label="C2PA 生成認証を確認する（外部リンク）"` |

コントラスト比: home-design-spec §8.1 のカラーシステムに準拠（WCAG AA 合格済み）

---

## 10. Figmaコンポーネント作成順序

| # | コンポーネント名 | 優先度 | 備考 |
|---|----------------|--------|------|
| 1 | VideoPlayer / AIOverlay / ErrorState / Skeleton | **P0** | プレーヤー核心 |
| 2 | TitleMetaBar | **P0** | |
| 3 | ActionBar (全状態) | **P0** | |
| 4 | WatchPageTabPanel (タブリスト + 全状態) | **P0** | 新規コンポーネント |
| 5 | CreatorTab / AICreatorCard / QualityScorePanel | **P0** | |
| 6 | PromptTab / AIInfoPanel / C2PARow / AIGenerationStats | **P0** | v1.0 追加フィールド |
| 7 | RecommendTab / VideoCard compact | **P1** | home-spec §5.3 流用 |
| 8 | CommentsTab / CommentItem | **P1** | |
| 9 | RelatedVideosGrid (Tier 3) | **P1** | |
| 10 | WatchPage Skeleton (フルページ) | **P1** | |
| 11 | BottomTabSheet (Mobile fixed) | **P1** | Mobile 固有 |

---

## 11. v1.0 変更点サマリ（v0.9 → v1.0）

| 変更種別 | 内容 | 根拠 |
|---------|------|------|
| **レイアウト変更** | デスクトップ: 2カラム → 3段タブUI | Task #4 / プレーヤー最優先 |
| **レイアウト変更** | モバイル: スクロール → BottomTabSheet | Task #4 / モバイルUX最適化 |
| **コンポーネント追加** | WatchPageTabPanel (§4.4) | タブUI新規設計 |
| **コンポーネント追加** | AIGenerationStats (§4.7) | 生成時間・推定コスト |
| **コンポーネント追加** | C2PAProvenanceRow (§4.7) | Runway式 AI 透明性 |
| **Mux Player 詳細化** | CSS Parts セレクタ明記 (§4.1) | Task #4 調査 |
| **トークン追加** | `success` (#3FB950) を参照リストに追加 | C2PA 認証バッジ用 |
| **廃止** | 右サイドバー方式 | サイドバー拡張によるプレーヤー圧縮を回避 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 0.9 | ドラフト作成（UI/UX改善提案・ホーム画面スペック・DB設計を統合） | designer |
| 2026-02-23 | 1.0 | Task #4 調査結果を統合。3段タブUI・BottomTabSheet・C2PA・AIGenerationStats を追加 | designer |
| 2026-02-23 | 1.1 | [SPEC-1] Quality Score スケール変換ルール追記（DB 0-100 → toDisplayScore() → 0.0-5.0）。Task #6/11 対応 | designer |
| 2026-02-23 | 1.2 | [SPEC-2] text-tertiary / quality-dim カラー値 #6E7681 → #7A8390 に統一（Task #8 対応）。Task #7 (JSON-LD/コメントレンダリング/関連動画構造) は UI 非影響を確認 | designer |
