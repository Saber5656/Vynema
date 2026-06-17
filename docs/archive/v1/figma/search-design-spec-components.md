# 検索機能 Figma: コンポーネントスペック

> 元ファイル: [search-design-spec.md](search-design-spec.md) から分割（§0-6）

作成日: 2026-03-06
担当: designer
Task: #10
ステータス: **v1.0** -- search-uiux-improvements.md を統合・最終化

---

## 0. 本ドキュメントの使い方

Figma でのモックアップ再現 / 実装者向けのデザイン仕様書。
`docs/figma/home-design-spec.md` のデザイントークン体系（カラー・タイポグラフィ・スペーシング）を **そのまま継承** する。
本ドキュメントでは検索機能（SearchBar / SearchSuggestionPanel / `/search?q=keyword`）固有のレイアウト・コンポーネントを定義する。

> **参照元**
> - デザイントークン全文: `docs/figma/home-design-spec.md` §1--§3
> - VideoCard grid/list/compact スペック: `home-design-spec.md` §5.3
> - FilterChip スペック: `home-design-spec.md` §5.7
> - Button / Input 状態スペック: `home-design-spec.md` §6.2--§6.3
> - アニメーション仕様: `home-design-spec.md` §7
> - アクセシビリティ基準: `home-design-spec.md` §8
> - UX 改善設計: `docs/detailed-design/search/search-uiux-improvements.md`
> - チャンネルページ MoodTag: `docs/figma/channel-design-spec.md` §6.3

---

## 1. デザイントークン継承（差分のみ記載）

### 1.1 カラー（home-design-spec.md §1 を全継承）

検索機能固有の追加トークンはなし。
以下は参照頻度が高いトークンの抜粋:

| トークン | Hex | 主な用途（検索機能） |
|---------|-----|---------------------|
| `background` | `#0D1117` | 検索結果ページ背景、MobileSearchOverlay |
| `surface` | `#161B22` | SearchBar 背景、FilterDropdown 背景、カード背景 |
| `surface-hover` | `#1C2333` | サジェスト項目ホバー、検索結果カードホバー、MetaTag バッジ背景 |
| `surface-elevated` | `#21262D` | SearchSuggestionPanel 背景（desktop） |
| `primary` | `#6C5CE7` | SearchBar フォーカスリング、ActiveFilterChip、アクティブタブ下線 |
| `primary-text` | `#8B7CF8` | 検索クエリハイライト、MatchReason テキスト、フィルタリンク |
| `secondary` | `#00D2D3` | AIモデルサジェスト Badge、ModelBadge |
| `accent` | `#FD79A8` | ThemeTag |
| `text-primary` | `#F0F6FC` | 検索結果タイトル、SearchBar 入力テキスト |
| `text-secondary` | `#8B949E` | メタ情報、フィルタラベル、セクションヘッダー |
| `text-tertiary` | `#7A8390` | SearchBar placeholder（vs #161B22: 4.62:1 OK） |
| `border` | `#30363D` | SearchBar ボーダー、結果カード区切り線、FilterDropdown ボーダー |
| `border-emphasis` | `#484F58` | SearchBar hover ボーダー |
| `quality-gold` | `#FFC107` | Quality Score >=4.0 |
| `error` | `#F85149` | 検索エラー状態 |

### 1.2 タイポグラフィ（home-design-spec.md §2 を全継承）

検索機能で使用する主要スタイル:

| スタイル名 | Font | Size | Weight | Line Height | 用途 |
|-----------|------|------|--------|-------------|------|
| `heading-lg` | Space Grotesk | 22px | 700 | 28px | SearchResultHeader クエリ表示（desktop） |
| `heading-md` | Space Grotesk | 18px | 700 | 24px | SearchResultHeader クエリ表示（mobile）、EmptyState タイトル |
| `heading-sm` | Inter | 16px | 600 | 22px | 検索結果カード タイトル（desktop） |
| `body-md` | Inter | 14px | 400 | 22px | SearchBar 入力テキスト、TabsTrigger、フィルタラベル |
| `body-sm` | Inter | 13px | 400 | 20px | 検索結果メタ、Stats 行、Description |
| `caption` | Inter | 12px | 400 | 16px | サジェストセクションラベル、ActiveFilterChip |
| `label-lg` | Inter | 13px | 600 | 16px | FilterDropdown ラベル |
| `label-sm` | Inter | 11px | 600 | 14px | MetaTag Badge、MatchReason、キーボードヒント |

### 1.3 スペーシング（home-design-spec.md §3 を全継承）

検索機能で頻出:
- SearchBar 高さ: `40px`
- SearchBar 内パディング: `0 16px`
- SearchSuggestionPanel 項目パディング: `10px 16px`
- 検索結果ページ横パディング: `24px` (desktop) / `16px` (mobile)
- 検索結果カード間: border-bottom 区切り（gap なし）
- FilterBar ギャップ: `8px`
- タブ高さ: `48px` (desktop) / `44px` (mobile)

---

## 2. Figma フレーム設定

### 2.1 検索結果ページ デスクトップフレーム (1440px)

```
Desktop Frame: 1440 x 1200
├── Header: Fixed, w=1440, h=64 (SearchBar 展開状態)
└── Main Content Area (Single Column, max-w=1200px, margin: 0 auto)
    ├── Top: 64px (header offset)
    ├── Padding: 0 24px
    └── Display: flex, flex-direction: column
        ├── SearchResultHeader (h=auto, py=24)
        ├── SearchResultTabs (h=48)
        ├── FilterBar (h=auto, py=12)
        ├── ActiveFilterChips (h=auto, py=8) [conditional]
        ├── SearchResults (list, gap=0)
        └── Pagination (h=auto, py=24)
```

**コンテンツ幅計算:**
```
フレーム幅:       1440px
横パディング:     24px x 2 = 48px
コンテンツ幅:     1440 - 48 = 1392px (max-width: 1200px に制限)
実効コンテンツ:   1200px
サムネイル幅:     360px
Info エリア:     1200 - 360 - 16(gap) = 824px
```

### 2.2 検索結果ページ タブレットフレーム (768px)

```
Tablet Frame: 768 x 1200
├── Header: Fixed, w=768, h=56
└── Main Content (Single Column)
    ├── Top: 56px
    ├── Padding: 0 16px
    └── Display: flex, flex-direction: column
        ├── SearchResultHeader
        ├── SearchResultTabs (横スクロール)
        ├── FilterBar (横スクロール)
        ├── ActiveFilterChips
        ├── SearchResults (サムネイル 240px)
        └── Pagination
```

### 2.3 検索結果ページ モバイルフレーム (375px)

```
Mobile Frame: 375 x 812
├── Header: Fixed, w=375, h=56 (検索バー展開時: MobileSearchOverlay)
└── Main Content (Single Column)
    ├── Top: 56px
    ├── Padding: 0 16px
    └── Display: flex, flex-direction: column
        ├── SearchResultHeader (compact)
        ├── SearchResultTabs (横スクロール)
        ├── FilterTrigger + SortSelect (1行)
        ├── ActiveFilterChips (横スクロール)
        ├── SearchResults (サムネイル 160px)
        └── Pagination (compact)
├── BottomNav: Fixed, w=375, h=56
```

### 2.4 SearchSuggestionPanel フレーム（オーバーレイ）

```
Desktop SuggestionPanel: 480 x auto (max-h=480)
├── Position: absolute, below SearchBar
├── Background: #161B22
├── Border: 1px solid #30363D
├── Border-radius: 12px
└── Box-shadow: 0 8px 32px rgba(0,0,0,0.4)

Mobile SuggestionPanel: MobileSearchOverlay 内 (375 x full)
├── Position: static (full screen の一部)
├── Background: #0D1117
├── Border: none
└── Padding: 0 16px
```

### 2.5 FilterBottomSheet フレーム（モバイル）

```
FilterBottomSheet Frame: 375 x 648 (80vh of 812)
├── Position: fixed, bottom: 0
├── Width: 100%
├── Background: #161B22
├── Border-radius: 16px 16px 0 0
├── Padding: 16px
└── Display: flex, flex-direction: column
    ├── Handle Bar (4px x 40px, centered, bg #30363D)
    ├── Title Row ("検索フィルタ", Space Grotesk 18px, 700)
    ├── Filter Sections (scroll)
    └── Footer Buttons (sticky bottom)
```

---

## 3. 検索バー コンポーネント詳細スペック

### 3.1 SearchBar（ヘッダー内）

```
SearchBar (Desktop, Header 内)
├── Container
│   ├── Flex: 1
│   ├── Max-width: 560px (xl: 640px)
│   ├── Min-width: 320px
│   ├── Height: 40px
│   ├── Position: relative
│   │
│   ├── Input Wrapper
│   │   ├── Display: flex, align-items: center
│   │   ├── Background: #161B22
│   │   ├── Border: 1px solid #30363D
│   │   ├── Border-radius: 9999px (pill)
│   │   ├── Height: 40px
│   │   ├── Padding: 0 12px 0 16px
│   │   ├── Transition: border-color 150ms ease, box-shadow 150ms ease
│   │   │
│   │   ├── Search Icon (left)
│   │   │   ├── Lucide Search, 18px
│   │   │   ├── Color: #8B949E
│   │   │   ├── Flex-shrink: 0
│   │   │   └── Margin-right: 10px
│   │   │
│   │   ├── Input
│   │   │   ├── Flex: 1
│   │   │   ├── Background: transparent
│   │   │   ├── Border: none
│   │   │   ├── Outline: none
│   │   │   ├── Font: Inter, 14px, weight 400
│   │   │   ├── Color: #F0F6FC
│   │   │   ├── Placeholder: "動画・AIモデル・プロンプトを検索..."
│   │   │   └── Placeholder color: #7A8390
│   │   │
│   │   ├── Clear Button (入力中のみ visible)
│   │   │   ├── Width: 28px, Height: 28px
│   │   │   ├── Border-radius: 50%
│   │   │   ├── Background: transparent
│   │   │   ├── Hover: background #1C2333
│   │   │   ├── Icon: Lucide X, 14px, #8B949E
│   │   │   └── Cursor: pointer
│   │   │
│   │   └── Submit Button (right)
│   │       ├── Width: 32px, Height: 32px
│   │       ├── Border-radius: 50%
│   │       ├── Background: #6C5CE7
│   │       ├── Hover: background #7B6BF0
│   │       ├── Icon: Lucide Search, 16px, #FFFFFF
│   │       ├── Cursor: pointer
│   │       └── Margin-left: 4px
│   │
│   └── Keyboard Shortcut Hint (未フォーカス時のみ表示)
│       ├── Position: absolute, right: 52px (Submit ボタンの左)
│       ├── Background: #1C2333
│       ├── Border: 1px solid #30363D
│       ├── Border-radius: 4px
│       ├── Padding: 2px 6px
│       ├── Font: Inter, 11px, weight 500, monospace fallback
│       ├── Color: #7A8390
│       └── Content: "/" (mac) or "Ctrl+K" (win)
│
└── States
    ├── Default
    │   ├── Border: 1px solid #30363D
    │   └── Keyboard hint visible
    │
    ├── Hover
    │   └── Border-color: #484F58
    │
    ├── Focus
    │   ├── Border-color: #8B7CF8
    │   ├── Box-shadow: 0 0 0 2px rgba(139, 124, 248, 0.25)
    │   ├── Keyboard hint hidden
    │   └── SearchSuggestionPanel visible
    │
    ├── Filled (入力あり)
    │   ├── Clear button visible
    │   └── SearchSuggestionPanel 動的更新
    │
    └── Focus-visible
        ├── Outline: 2px solid #8B7CF8
        └── Outline-offset: 2px
```

### 3.2 SearchBar（モバイル - アイコンのみ）

```
SearchBar Mobile (Header 内アイコン)
├── Width: 40px, Height: 40px
├── Border-radius: 8px
├── Background: transparent
├── Hover: background #1C2333
├── Icon: Lucide Search, 20px, #F0F6FC
└── onClick → MobileSearchOverlay 展開
```

### 3.3 MobileSearchOverlay

```
MobileSearchOverlay
├── Container
│   ├── Position: fixed, inset: 0
│   ├── Background: #0D1117
│   ├── z-index: 50
│   ├── Display: flex, flex-direction: column
│   │
│   ├── Header Row
│   │   ├── Height: 56px
│   │   ├── Padding: 0 12px
│   │   ├── Display: flex, align-items: center, gap: 8px
│   │   ├── Border-bottom: 1px solid #30363D
│   │   │
│   │   ├── Back Button
│   │   │   ├── Width: 40px, Height: 40px
│   │   │   ├── Border-radius: 8px
│   │   │   ├── Icon: Lucide ArrowLeft, 20px, #F0F6FC
│   │   │   └── Hover: background #1C2333
│   │   │
│   │   ├── Input (flex: 1)
│   │   │   ├── Height: 40px
│   │   │   ├── Background: #161B22
│   │   │   ├── Border: 1px solid #30363D
│   │   │   ├── Border-radius: 9999px
│   │   │   ├── Padding: 0 16px
│   │   │   ├── Font: Inter, 14px, #F0F6FC
│   │   │   ├── Placeholder: "検索..."
│   │   │   └── autofocus: true
│   │   │
│   │   └── Submit Button (same as §3.1)
│   │
│   └── Suggestion Area (flex: 1, overflow-y: auto)
│       └── SearchSuggestionPanel (§4 参照)
```

---

## 4. SearchSuggestionPanel コンポーネント詳細スペック

### 4.1 パネル本体

```
SearchSuggestionPanel
├── Container
│   ├── Desktop
│   │   ├── Position: absolute, top: calc(100% + 4px)
│   │   ├── Width: 100% (SearchBar と同幅, min: 320px)
│   │   ├── Max-height: 480px
│   │   ├── Background: #161B22
│   │   ├── Border: 1px solid #30363D
│   │   ├── Border-radius: 12px
│   │   ├── Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4)
│   │   ├── Overflow-y: auto
│   │   ├── Scrollbar-width: thin
│   │   └── z-index: 50
│   │
│   └── Mobile (MobileSearchOverlay 内)
│       ├── Position: static
│       ├── Width: 100%
│       ├── Background: #0D1117
│       ├── Border: none
│       ├── Box-shadow: none
│       └── Overflow-y: auto
│
├── Section: 最近の検索
│   ├── Section Header
│   │   ├── Display: flex, justify-content: space-between, align-items: center
│   │   ├── Padding: 12px 16px 8px
│   │   ├── Label: "最近の検索"
│   │   │   ├── Font: Inter, 12px, weight 600
│   │   │   └── Color: #8B949E
│   │   └── Clear Link: "クリア"
│   │       ├── Font: Inter, 12px, weight 500
│   │       ├── Color: #8B7CF8
│   │       └── Hover: text-decoration underline
│   │
│   └── SuggestionItem x 3
│       ├── Display: flex, align-items: center, gap: 12px
│       ├── Padding: 10px 16px
│       ├── Cursor: pointer
│       ├── Transition: background 150ms ease
│       ├── Default: background transparent
│       ├── Hover: background #1C2333
│       ├── Active (keyboard): background #1C2333
│       │
│       ├── Icon: Lucide Clock, 16px, #8B949E
│       ├── Text: Inter, 14px, weight 400, #F0F6FC
│       │   └── Flex: 1
│       └── Remove Button
│           ├── Width: 24px, Height: 24px
│           ├── Border-radius: 4px
│           ├── Icon: Lucide X, 14px, #8B949E
│           ├── Opacity: 0 → visible on row hover
│           └── Hover: background #30363D
│
├── Section: AIモデル
│   ├── Section Header (same style as above)
│   │   └── Label: "AIモデル"
│   │
│   └── ModelChips Container
│       ├── Padding: 8px 16px 12px
│       ├── Display: flex, flex-wrap: wrap, gap: 8px
│       │
│       └── ModelChip x N
│           ├── Display: inline-flex, align-items: center, gap: 4px
│           ├── Background: rgba(0, 210, 211, 0.12)
│           ├── Border: 1px solid rgba(0, 210, 211, 0.30)
│           ├── Border-radius: 9999px
│           ├── Padding: 6px 12px
│           ├── Font: Inter, 13px, weight 500
│           ├── Color: #00D2D3
│           ├── Cursor: pointer
│           ├── Hover: background rgba(0, 210, 211, 0.20)
│           └── Content: "🤖 {modelName}"
│
├── Section: ムード
│   ├── Section Header
│   │   └── Label: "ムード"
│   │
│   └── MoodChips Container
│       ├── Padding: 8px 16px 12px
│       ├── Display: flex, flex-wrap: wrap, gap: 8px
│       │
│       └── MoodTag x N
│           └── → channel-design-spec.md §6.3 MoodTag スタイルを再利用
│               ├── Calm:      bg rgba(102,126,234,0.15), color #667EEA
│               ├── Energetic: bg rgba(240,147,251,0.15), color #F093FB
│               ├── Dreamy:    bg rgba(79,172,254,0.15),  color #4FACFE
│               ├── Fun:       bg rgba(67,233,123,0.15),  color #43E97B
│               ├── Zen:       bg rgba(161,140,209,0.15), color #A18CD1
│               └── Mystic:    bg rgba(108,92,231,0.15),  color #8B7CF8
│
└── Section: 動画候補
    ├── Section Header
    │   └── Label: "動画"
    │
    └── VideoSuggestionItem x 5
        ├── Display: flex, align-items: center, gap: 12px
        ├── Padding: 10px 16px
        ├── Cursor: pointer
        ├── Hover: background #1C2333
        │
        ├── Thumbnail
        │   ├── Width: 80px, Height: 45px (16:9)
        │   ├── Border-radius: 6px
        │   ├── Object-fit: cover
        │   ├── Flex-shrink: 0
        │   └── src: image.mux.com/{playbackId}/thumbnail.webp?width=160&time=5
        │
        └── Info (flex: 1, min-width: 0)
            ├── Title: Inter, 13px, weight 500, #F0F6FC, line-clamp-1
            ├── Meta: Inter, 11px, weight 400, #8B949E
            │   └── Content: "★ {score} ・ 🤖 {modelName} ・ {channelName}"
            └── Match Hint (optional)
                ├── Font: Inter, 11px, weight 400
                ├── Color: #8B7CF8
                └── Content: "プロンプトに一致" or "タイトルに一致"
```

---

## 5. 検索結果ページ コンポーネント詳細スペック

### 5.1 SearchResultHeader

```
SearchResultHeader
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 24px 0 16px (desktop) / 16px 0 12px (mobile)
│   │
│   ├── Query Line
│   │   ├── Display: inline
│   │   ├── Font: Space Grotesk, 22px (desktop) / 18px (mobile), weight 700
│   │   ├── Color: #F0F6FC
│   │   ├── Content: "「{query}」の検索結果"
│   │   └── Query highlight: color #8B7CF8
│   │       └── "「" と "」" は #F0F6FC、query テキストが #8B7CF8
│   │
│   └── Meta
│       ├── Font: Inter, 13px, weight 400
│       ├── Color: #8B949E
│       ├── Margin-top: 4px
│       └── Content: "({totalCount}件) ・ {responseTime}秒"
```

### 5.2 SearchResultTabs

```
SearchResultTabs (shadcn/ui Tabs)
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   └── Background: #0D1117
│
├── TabsList
│   ├── Display: flex
│   ├── Border-bottom: 1px solid #30363D
│   ├── Background: transparent
│   ├── Height: 48px (desktop) / 44px (mobile)
│   ├── Overflow-x: auto (mobile)
│   ├── Scrollbar-width: none
│   └── Gap: 0
│
└── TabsTrigger x 3
    ├── Padding: 0 20px (desktop) / 0 16px (mobile)
    ├── Height: 48px (desktop) / 44px (mobile)
    ├── Font: Inter, 14px, weight 500
    ├── White-space: nowrap
    ├── Cursor: pointer
    ├── Transition: color 150ms ease, border-color 150ms ease
    │
    ├── Default
    │   ├── Color: #8B949E
    │   └── Border-bottom: 2px solid transparent
    │
    ├── Hover
    │   └── Color: #F0F6FC
    │
    ├── Active
    │   ├── Color: #F0F6FC
    │   ├── Font-weight: 600
    │   └── Border-bottom: 2px solid #6C5CE7
    │
    └── Focus-visible
        └── Outline: 2px solid #8B7CF8, outline-offset: -2px

Tab Labels:
├── Tab 1: "動画" + count badge " ({videoCount})"
│   └── Badge: bg #1C2333, border-radius 9999px, padding 1px 6px,
│              font 11px, weight 600, color #8B949E, margin-left 4px
├── Tab 2: "AIチャンネル" + count badge " ({channelCount})"
└── Tab 3: "プロンプト" + count badge " ({promptCount})"
```

### 5.3 FilterBar（デスクトップ）

```
FilterBar (Desktop)
├── Container
│   ├── Max-width: 1200px, Margin: 0 auto
│   ├── Padding: 12px 0
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Flex-wrap: wrap
│   │
│   ├── FilterDropdown x 6 (left-aligned)
│   │   └── (§5.4 参照)
│   │
│   ├── Spacer (flex: 1)
│   │
│   └── Sort Select (right-aligned)
│       ├── shadcn/ui Select
│       ├── Trigger
│       │   ├── Width: auto
│       │   ├── Height: 32px
│       │   ├── Padding: 0 10px
│       │   ├── Background: #161B22
│       │   ├── Border: 1px solid #30363D
│       │   ├── Border-radius: 6px
│       │   ├── Font: Inter, 13px, weight 400, #8B949E
│       │   ├── Icon (left): Lucide ArrowUpDown, 13px, #8B949E
│       │   └── Content: "並び替え: {label}"
│       │
│       └── Options:
│           ├── "関連度" [default]
│           ├── "Quality Score 高い順"
│           ├── "再生数 多い順"
│           ├── "アップロード日 新しい順"
│           └── "いいね率 高い順"
```

### 5.4 FilterDropdown

```
FilterDropdown (shadcn/ui Popover + Command)
├── Trigger Button
│   ├── Display: inline-flex, align-items: center, gap: 6px
│   ├── Height: 32px
│   ├── Padding: 0 12px
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   ├── Border-radius: 8px
│   ├── Font: Inter, 13px, weight 500
│   ├── Cursor: pointer
│   ├── Transition: all 150ms ease
│   │
│   ├── Default: color #8B949E
│   ├── Hover: border-color #484F58, color #F0F6FC
│   ├── Active (フィルタ選択中):
│   │   ├── Border-color: #6C5CE7
│   │   ├── Color: #8B7CF8
│   │   └── Content: "{label}: {value} ▼"
│   │
│   ├── Icon (right): Lucide ChevronDown, 14px
│   └── Content: "{label} ▼"
│
└── Popover Content
    ├── Width: 240px
    ├── Background: #161B22
    ├── Border: 1px solid #30363D
    ├── Border-radius: 8px
    ├── Box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4)
    ├── Padding: 8px
    ├── Max-height: 320px
    ├── Overflow-y: auto
    │
    ├── Search Input (AIモデル / カテゴリのみ)
    │   ├── Height: 32px
    │   ├── Background: #1C2333
    │   ├── Border: 1px solid #30363D
    │   ├── Border-radius: 6px
    │   ├── Padding: 0 8px
    │   ├── Font: 13px, #F0F6FC
    │   ├── Placeholder: "検索...", #7A8390
    │   └── Margin-bottom: 8px
    │
    └── OptionItem x N
        ├── Display: flex, align-items: center, gap: 8px
        ├── Padding: 8px 12px
        ├── Border-radius: 4px
        ├── Cursor: pointer
        ├── Hover: background #1C2333
        │
        ├── Checkbox / Radio
        │   ├── Width: 16px, Height: 16px
        │   ├── Border: 1px solid #484F58
        │   ├── Border-radius: 3px (checkbox) / 50% (radio)
        │   ├── Checked: background #6C5CE7, border-color #6C5CE7
        │   │   └── Checkmark: Lucide Check, 10px, #FFFFFF
        │   └── Transition: background 150ms ease
        │
        ├── Label: Inter, 13px, weight 400, #F0F6FC
        └── Count (right): Inter, 12px, #8B949E

Filter 定義:
├── "AIモデル" (multi-select): Runway Gen-4, Sora, Veo 3.1, Kling, その他
├── "ムード" (multi-select): Calm, Energetic, Dreamy, Fun, Zen, Mystic
├── "Quality Score" (single-select): 4.0以上, 3.0以上, すべて
├── "再生時間" (single-select): 4分未満, 4-20分, 20分以上
├── "アップロード日" (single-select): 今日, 今週, 今月, 今年, すべて
└── "カテゴリ" (single-select): 風景, 音楽, アート, 科学, ゲーム, 教育, その他
```

### 5.5 FilterBar（モバイル - トリガーボタン）

```
FilterBar Mobile
├── Container
│   ├── Padding: 8px 0
│   ├── Display: flex, align-items: center, justify-content: space-between
│   │
│   ├── Filter Trigger Button
│   │   ├── Height: 32px
│   │   ├── Padding: 0 12px
│   │   ├── Background: #161B22
│   │   ├── Border: 1px solid #30363D
│   │   ├── Border-radius: 8px
│   │   ├── Display: flex, align-items: center, gap: 6px
│   │   ├── Icon: Lucide SlidersHorizontal, 16px, #8B949E
│   │   ├── Text: "フィルタ", Inter 13px, 500, #8B949E
│   │   └── Count Badge (フィルタ適用数 > 0)
│   │       ├── Width: 18px, Height: 18px
│   │       ├── Border-radius: 50%
│   │       ├── Background: #6C5CE7
│   │       ├── Font: 10px, 600, #FFFFFF
│   │       └── Display: flex, align-items: center, justify-content: center
│   │
│   └── Sort Select (same as desktop, §5.3)
│
└── → FilterBottomSheet (shadcn/ui Sheet [side="bottom"])
    ├── Handle
    │   ├── Width: 40px, Height: 4px
    │   ├── Border-radius: 2px
    │   ├── Background: #30363D
    │   ├── Margin: 8px auto 16px
    │
    ├── Title: "検索フィルタ"
    │   ├── Font: Space Grotesk, 18px, weight 700
    │   ├── Color: #F0F6FC
    │   └── Margin-bottom: 20px
    │
    ├── FilterSection x 6
    │   ├── Margin-bottom: 20px
    │   ├── Label: Inter, 14px, weight 600, #F0F6FC
    │   ├── Margin-bottom: 10px
    │   └── Options (flex, flex-wrap, gap: 8px)
    │       └── FilterChip (toggle)
    │           └── → home-design-spec.md §5.7 FilterChip スタイル再利用
    │
    └── Footer
        ├── Position: sticky, bottom: 0
        ├── Padding: 16px 0 env(safe-area-inset-bottom)
        ├── Background: #161B22
        ├── Border-top: 1px solid #30363D
        ├── Display: flex, gap: 12px
        │
        ├── Reset Button
        │   ├── Flex: 1
        │   ├── variant="outline", Height: 40px
        │   └── Text: "リセット"
        │
        └── Apply Button
            ├── Flex: 1
            ├── variant="default", Height: 40px
            ├── Background: #6C5CE7, Color: #FFFFFF
            └── Text: "適用する ({count}件)"
```

### 5.6 ActiveFilterChips

```
ActiveFilterChips
├── Container
│   ├── Display: flex, align-items: center, gap: 8px, flex-wrap: wrap
│   ├── Padding: 0 0 12px (desktop) / 0 0 8px (mobile)
│   └── 表示条件: フィルタ 1つ以上適用中
│
├── ActiveChip x N
│   ├── Display: inline-flex, align-items: center, gap: 4px
│   ├── Background: rgba(108, 92, 231, 0.12)
│   ├── Border: 1px solid rgba(108, 92, 231, 0.30)
│   ├── Border-radius: 9999px
│   ├── Padding: 4px 8px 4px 10px
│   ├── Font: Inter, 12px, weight 500
│   ├── Color: #8B7CF8
│   ├── Cursor: pointer
│   ├── Hover: background rgba(108, 92, 231, 0.20)
│   │
│   ├── Label: "{icon} {filterLabel}"
│   └── Remove Icon: Lucide X, 12px, #8B7CF8
│       └── Hover: color #F0F6FC
│
└── ClearAll Link
    ├── Font: Inter, 12px, weight 500
    ├── Color: #8B7CF8
    ├── Cursor: pointer
    ├── Content: "すべてクリア"
    └── Hover: text-decoration underline
```

---

## 6. 検索結果カード詳細スペック

### 6.1 VideoSearchResultCard

```
VideoSearchResultCard
├── Container
│   ├── Display: flex, gap: 16px (desktop) / 12px (mobile)
│   ├── Padding: 16px 0 (desktop) / 12px 0 (mobile)
│   ├── Border-bottom: 1px solid #30363D
│   ├── Cursor: pointer
│   ├── Transition: background 150ms ease
│   ├── Hover: background rgba(28, 35, 51, 0.5) (surface-hover at 50%)
│   │
│   ├── Focus-visible (全カード)
│   │   ├── Outline: 2px solid #8B7CF8
│   │   ├── Outline-offset: 2px
│   │   └── Border-radius: 8px
│
├── Thumbnail Area
│   ├── Width: 360px (desktop) / 240px (tablet) / 160px (mobile)
│   ├── Aspect-ratio: 16/9
│   ├── Border-radius: 8px
│   ├── Overflow: hidden
│   ├── Position: relative
│   ├── Flex-shrink: 0
│   │
│   ├── <img> (Mux thumbnail)
│   │   ├── Width: 100%, Height: 100%
│   │   ├── Object-fit: cover
│   │   └── src: image.mux.com/{id}/thumbnail.webp?width=720&time=5
│   │
│   ├── AI Badge (absolute, top: 6px, left: 6px)
│   │   └── → home-design-spec.md §5.3 AI Badge スタイル
│   │
│   ├── Duration Badge (absolute, bottom: 6px, right: 6px)
│   │   └── → home-design-spec.md §5.3 Duration Badge スタイル
│   │
│   └── Hover Preview (desktop, absolute, inset: 0)
│       ├── Mux animated thumbnail
│       ├── Opacity: 0 → 1 on hover
│       └── Transition: opacity 300ms ease 300ms
│
├── Info Area (flex: 1, min-width: 0)
│   ├── Title
│   │   ├── Font: Inter, 16px (desktop) / 14px (mobile), weight 600
│   │   ├── Color: #F0F6FC
│   │   ├── Line-height: 22px (desktop) / 20px (mobile)
│   │   ├── Line-clamp: 2
│   │   └── Margin-bottom: 4px
│   │
│   ├── Stats Row
│   │   ├── Font: Inter, 13px, weight 400
│   │   ├── Color: #8B949E
│   │   └── Content: "{viewCount} views ・ {relativeTime}"
│   │
│   ├── Creator + Tags Row
│   │   ├── Display: flex, align-items: center, gap: 8px, flex-wrap: wrap
│   │   ├── Margin-top: 6px
│   │   │
│   │   ├── Creator
│   │   │   ├── Display: flex, align-items: center, gap: 4px
│   │   │   ├── Avatar: 20px, border-radius: 50%, border: 1px solid #6C5CE7
│   │   │   └── Name: Inter, 13px, weight 400, #8B949E
│   │   │
│   │   ├── QualityBadge
│   │   │   └── → home-design-spec.md §5.3 Quality Badge スタイル (compact)
│   │   │
│   │   └── ModelBadge
│   │       ├── Background: #1C2333
│   │       ├── Padding: 3px 8px
│   │       ├── Border-radius: 9999px
│   │       ├── Font: Inter, 11px, weight 500
│   │       └── Color: #00D2D3
│   │
│   ├── Description (desktop のみ, >= 1024px)
│   │   ├── Font: Inter, 13px, weight 400
│   │   ├── Color: #8B949E
│   │   ├── Line-height: 20px
│   │   ├── Line-clamp: 2
│   │   ├── Margin-top: 8px
│   │   └── Max-width: 600px
│   │
│   └── MatchReason
│       ├── Display: flex, align-items: center, gap: 4px
│       ├── Margin-top: 6px
│       ├── Icon: Lucide Lightbulb, 12px, #8B7CF8
│       ├── Font: Inter, 11px, weight 400
│       ├── Color: #8B7CF8
│       └── Content: "マッチ: {reason}"
│           ├── "タイトルに「{query}」を含む"
│           ├── "プロンプトに「{query}」を含む"
│           ├── "AIモデル「{modelName}」に一致"
│           └── "カテゴリ「{category}」に一致"
```

### 6.2 ChannelSearchCard

```
ChannelSearchCard
├── Container
│   ├── Display: flex, align-items: center, gap: 20px (desktop) / 12px (mobile)
│   ├── Padding: 20px 0 (desktop) / 16px 0 (mobile)
│   ├── Border-bottom: 1px solid #30363D
│   ├── Cursor: pointer
│   ├── Hover: background rgba(28, 35, 51, 0.5)
│
├── Avatar
│   ├── Width: 80px (desktop) / 56px (mobile)
│   ├── Height: 80px (desktop) / 56px (mobile)
│   ├── Border-radius: 50%
│   ├── Border: 2px solid #6C5CE7
│   ├── Object-fit: cover
│   └── Flex-shrink: 0
│
├── Info Area (flex: 1)
│   ├── Name Row
│   │   ├── Display: flex, align-items: center, gap: 8px
│   │   ├── Channel Name
│   │   │   ├── Font: Space Grotesk, 16px (desktop) / 14px (mobile), weight 700
│   │   │   └── Color: #F0F6FC
│   │   └── AI Model Badge
│   │       └── → channel-design-spec.md §4.2 AI Model Badge スタイル
│   │
│   ├── Description
│   │   ├── Font: Inter, 13px, weight 400, #8B949E
│   │   ├── Line-clamp: 2
│   │   └── Margin-top: 4px
│   │
│   └── Stats Row
│       ├── Font: Inter, 12px, weight 400, #8B949E
│       ├── Margin-top: 6px
│       └── Content: "{videoCount}本の動画 ・ 購読者 {subscribers} ・ ★ {avgScore}"
│
└── Action Area (desktop のみ)
    └── Subscribe Button
        ├── Not subscribed: variant="outline", size="sm"
        │   ├── Height: 32px, Padding: 0 12px
        │   ├── Border: 1px solid #484F58, Color: #F0F6FC
        │   └── Content: "購読する"
        └── Subscribed: variant="outline"
            ├── Border: 1px solid #3FB950, Color: #3FB950
            └── Content: "購読中 ✓"
```

### 6.3 PromptSearchCard

```
PromptSearchCard
├── Container
│   ├── Display: flex, gap: 16px (desktop) / 12px (mobile)
│   ├── Padding: 16px 0 (desktop) / 12px 0 (mobile)
│   ├── Border-bottom: 1px solid #30363D
│   ├── Cursor: pointer
│   ├── Hover: background rgba(28, 35, 51, 0.5)
│
├── Thumbnail Area
│   ├── Width: 240px (desktop) / 120px (mobile)
│   ├── Aspect-ratio: 16/9
│   ├── Border-radius: 8px
│   ├── Overflow: hidden
│   └── Flex-shrink: 0
│
└── Info Area (flex: 1, min-width: 0)
    ├── Prompt Area
    │   ├── Label: "プロンプト:"
    │   │   ├── Font: Inter, 12px, weight 600
    │   │   ├── Color: #8B7CF8
    │   │   └── Margin-bottom: 6px
    │   │
    │   └── Prompt Text Box
    │       ├── Background: rgba(139, 124, 248, 0.06)
    │       ├── Border-left: 2px solid #6C5CE7
    │       ├── Border-radius: 0 8px 8px 0
    │       ├── Padding: 8px 12px
    │       ├── Font: Inter, 13px, weight 400, line-height: 20px
    │       ├── Color: #F0F6FC
    │       ├── Line-clamp: 3 (desktop) / 2 (mobile)
    │       └── Keyword Highlight (<mark>)
    │           ├── Background: rgba(108, 92, 231, 0.25)
    │           ├── Color: #F0F6FC
    │           ├── Border-radius: 2px
    │           └── Padding: 0 2px
    │
    ├── Title
    │   ├── Font: Inter, 14px, weight 600, #F0F6FC
    │   ├── Line-clamp: 1
    │   └── Margin-top: 8px
    │
    └── Meta Row
        ├── Font: Inter, 12px, weight 400, #8B949E
        ├── Margin-top: 4px
        └── Content: "🤖 {channelName} ・ ★ {score} ・ {modelName} ・ {viewCount} views"
```

---

