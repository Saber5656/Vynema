# 検索機能 UI/UX: コンポーネント設計

> 元ファイル: [search-uiux-improvements.md](search-uiux-improvements.md) から分割（§0-7）

作成日: 2026-03-06
担当: designer
Task: #7

---

## 0. 概要

AI Theater の検索機能（`/search?q=keyword`）について、
YouTube・Vimeo・Twitch 等の競合分析をベースに AI Theater 独自の検索体験を設計する。
「動画タイトル・チャンネル名」だけでなく「AIモデル名・生成プロンプト・ムード」で検索できる、
AI 専用プラットフォームならではの検索 UX を提案する。

---

## 1. 競合プラットフォームの検索 UX 分析

### 1.1 現行プラットフォームの問題点（AI Theater 視点）

| # | プラットフォーム | 問題 | AI Theater での影響 |
|---|-----------------|------|---------------------|
| 1 | YouTube | 検索結果がSEO最適化されたタイトルに左右され、実際のコンテンツ品質と乖離する | AI生成動画は正確なメタデータを持つため、より精度の高い検索が可能なのに活かせない |
| 2 | YouTube | フィルタが「アップロード日・再生時間・タイプ・並び替え」の4種のみで、コンテンツの質で絞れない | Quality Score 等の品質指標でフィルタリングできる機会を損失 |
| 3 | YouTube | オートコンプリートが「過去の検索」と「人気検索」に偏り、新しいコンテンツの発見を阻害 | AIモデル名・プロンプトパターン等の固有語彙がサジェストされない |
| 4 | Vimeo | 検索結果が「Staff Pick」に偏重し、一般動画が見つかりにくい | 公平なランキングが必要 |
| 5 | Twitch | ライブ検索に特化しており、アーカイブ動画の検索体験が貧弱 | VOD検索の参考にならない |
| 6 | 全般 | 検索結果に「なぜこの動画がヒットしたか」が不透明 | AI Theater ではプロンプト・モデル名マッチ等の理由を明示できる |

### 1.2 競合の良いパターン（取り入れるべき）

| プラットフォーム | パターン | AI Theater への適用 | 優先度 |
|----------------|---------|-------------------|--------|
| **YouTube** | 検索バー内の音声検索アイコン | Phase 2 以降（MVP外） | P2 |
| **YouTube** | フィルタチップ横スクロール（検索結果上部） | FilterChipBar として採用 | P0 |
| **Vimeo** | 検索結果のカテゴリタブ（動画/チャンネル/コレクション） | SearchResultTabs として採用 | P0 |
| **Spotify** | リアルタイムオートコンプリート + カテゴリ別サジェスト | SearchSuggestionPanel として採用 | P0 |
| **Netflix** | 検索中のリアルタイムプレビュー（サムネイル表示） | オートコンプリート内にサムネイル表示 | P1 |
| **Pinterest** | ビジュアル重視の検索結果（テキスト最小限） | AI Theater ではサムネイル + Quality Score 重視 | P0 |

### 1.3 AI Theater の差別化機会

```
YouTube的アプローチ（テキストマッチ中心）
├── 検索対象 → タイトル・説明文・タグ
├── フィルタ → 日付・再生時間・タイプ・並び替え
└── サジェスト → 過去検索 + 人気検索

AI Theater のアプローチ（AI メタデータ全文検索）
├── 検索対象 → タイトル + プロンプト + AIモデル名 + ムード + カテゴリ
├── フィルタ → 日付 + 再生時間 + AIモデル + ムード + Quality Score + カテゴリ
├── サジェスト → AIモデル名 + プロンプトパターン + ムード + チャンネル名
└── 検索結果 → マッチ理由の表示（「プロンプトに一致」「モデル名に一致」）
```

---

## 2. 検索バー設計（ヘッダー統合）

### 2.1 デスクトップ検索バー

> 既存 Header コンポーネント内の SearchBar を拡張する。
> shadcn/ui `Command` コンポーネントを活用したオートコンプリート付き検索バー。

```
デスクトップ Header:
┌─────────────────────────────────────────────────────────────────┐
│ [=] [AI Theater]  [_____________________🔍]  [🔔] [Clerk 👤]  │
│                   ↑ SearchBar (w=480px)                         │
└─────────────────────────────────────────────────────────────────┘

SearchBar 展開時 (フォーカス):
┌─────────────────────────────────────────────────────────────────┐
│ [=] [AI Theater]  [夕焼け______________________🔍]  [🔔] [👤]  │
│                   ┌────────────────────────────────┐            │
│                   │ SearchSuggestionPanel          │            │
│                   │                                │            │
│                   │ 🔍 最近の検索                   │            │
│                   │   夕焼け 海辺                   │            │
│                   │   Runway Gen-4                  │            │
│                   │                                │            │
│                   │ 🤖 AIモデル                     │            │
│                   │   [Runway Gen-4] [Sora]        │            │
│                   │                                │            │
│                   │ 🎭 ムード                       │            │
│                   │   [🌅 Calm] [🌙 Dreamy]        │            │
│                   │                                │            │
│                   │ 📹 動画候補                     │            │
│                   │   [サムネ] 夕焼けの東京タワー    │            │
│                   │           ⭐ 4.8 🤖 Runway      │            │
│                   │   [サムネ] 夕焼けの渋谷          │            │
│                   │           ⭐ 4.2 🤖 Sora        │            │
│                   │                                │            │
│                   └────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 モバイル検索バー

```
モバイル Header (検索アイコン):
┌──────────────────────────────┐
│ [=] [AI Theater] [🔍] [👤]  │
└──────────────────────────────┘

モバイル 検索展開 (フルスクリーン):
┌──────────────────────────────┐
│ [←] [夕焼け____________] [🔍]│
├──────────────────────────────┤
│ 🔍 最近の検索                 │
│   夕焼け 海辺          [×]   │
│   Runway Gen-4         [×]   │
├──────────────────────────────┤
│ 🤖 AIモデル                   │
│   [Runway] [Sora] [Veo]      │
├──────────────────────────────┤
│ 🎭 ムード                     │
│   [Calm] [Dreamy] [Energy]    │
├──────────────────────────────┤
│ 📹 動画候補                   │
│ ┌──────┬─────────────────┐   │
│ │サムネ │夕焼けの東京タワー │   │
│ │      │⭐ 4.8 Runway     │   │
│ └──────┴─────────────────┘   │
│ ┌──────┬─────────────────┐   │
│ │サムネ │夕焼けの渋谷      │   │
│ │      │⭐ 4.2 Sora       │   │
│ └──────┴─────────────────┘   │
└──────────────────────────────┘
```

### 2.3 SearchBar コンポーネント設計

```
SearchBar
├── Container (Header 内)
│   ├── Desktop: width 480px, max-width: 640px (lg 以上)
│   ├── Tablet: width 320px (md)
│   └── Mobile: アイコンのみ → タップでフルスクリーン展開
│
├── Input Area
│   ├── Display: flex, align-items: center
│   ├── Background: var(--color-surface) = #161B22
│   ├── Border: 1px solid var(--color-border) = #30363D
│   ├── Border-radius: 9999px (pill shape)
│   ├── Height: 40px
│   ├── Padding: 0 16px
│   ├── Focus: border-color var(--color-primary) = #6C5CE7
│   │         box-shadow: 0 0 0 2px rgba(108, 92, 231, 0.2)
│   │
│   ├── Search Icon (left)
│   │   ├── Lucide Search, 18px
│   │   └── Color: var(--color-text-secondary) = #8B949E
│   │
│   ├── Input (shadcn/ui Command + Input)
│   │   ├── Font: Inter, 14px, weight 400
│   │   ├── Color: var(--color-text-primary) = #F0F6FC
│   │   ├── Placeholder: "動画・AIモデル・プロンプトを検索..."
│   │   └── Placeholder color: #7A8390
│   │
│   ├── Clear Button (入力中のみ表示)
│   │   ├── Lucide X, 16px, text-secondary
│   │   └── onClick: 入力クリア
│   │
│   └── Submit Button (right)
│       ├── Lucide Search, 18px
│       ├── Background: var(--color-primary) = #6C5CE7
│       ├── Border-radius: 50%
│       ├── Width: 32px, Height: 32px
│       └── Color: #FFFFFF
│
├── Keyboard Shortcut Hint (desktop のみ)
│   ├── position: absolute, right: 12px (未フォーカス時)
│   ├── Badge: "/" or "Ctrl+K"
│   ├── Background: var(--color-surface-hover) = #1C2333
│   ├── Border: 1px solid var(--color-border)
│   ├── Border-radius: 4px
│   ├── Padding: 2px 6px
│   ├── Font: 11px, monospace, #8B949E
│   └── フォーカス時に非表示
│
└── MobileSearchOverlay (mobile のみ)
    ├── Position: fixed, inset: 0
    ├── Background: var(--color-background) = #0D1117
    ├── z-index: 50
    ├── Padding: 12px 16px
    ├── Back Button: Lucide ArrowLeft → 検索を閉じる
    └── SearchSuggestionPanel (下部に表示)
```

---

## 3. オートコンプリート設計（SearchSuggestionPanel）

### 3.1 サジェスト構成

オートコンプリートは **4カテゴリ** に分類してサジェストする。
これにより「AIモデルで検索」「ムードで検索」という AI Theater 固有の検索パスを自然に提供する。

| カテゴリ | アイコン | 表示条件 | 最大件数 |
|---------|---------|---------|---------|
| 最近の検索 | Lucide Clock | 入力が空 or 先頭一致 | 3件 |
| AIモデル | Lucide Bot | モデル名先頭一致 | 3件 |
| ムード | Lucide Sparkles | ムード名先頭一致 | 4件 |
| 動画候補 | Mux サムネイル | タイトル・プロンプト部分一致 | 5件 |

### 3.2 SearchSuggestionPanel コンポーネント設計

```
SearchSuggestionPanel
├── Container
│   ├── Position: absolute (desktop) / static (mobile)
│   ├── Top: calc(100% + 4px) (desktop)
│   ├── Width: 100% (desktop: SearchBar と同幅) / 100vw (mobile)
│   ├── Max-height: 480px (desktop) / auto (mobile)
│   ├── Background: var(--color-surface) = #161B22
│   ├── Border: 1px solid var(--color-border) = #30363D
│   ├── Border-radius: 12px (desktop) / 0 (mobile)
│   ├── Box-shadow: 0 8px 32px rgba(0,0,0,0.4) (desktop)
│   ├── Overflow-y: auto
│   └── z-index: 50
│
├── Section: 最近の検索 (入力が空 or 先頭一致時)
│   ├── Section Header
│   │   ├── Display: flex, justify-content: space-between, align-items: center
│   │   ├── Padding: 12px 16px 8px
│   │   ├── Label: "最近の検索", Inter 12px, 600, text-secondary
│   │   └── "クリア" Link: Inter 12px, primary-text = #8B7CF8
│   │
│   └── SuggestionItem × 3
│       ├── Display: flex, align-items: center, gap: 12px
│       ├── Padding: 10px 16px
│       ├── Hover: bg var(--color-surface-hover) = #1C2333
│       ├── Cursor: pointer
│       ├── Icon: Lucide Clock, 16px, text-secondary
│       ├── Text: Inter, 14px, text-primary
│       └── Remove: Lucide X, 14px, text-secondary (右端)
│
├── Section: AIモデル (モデル名マッチ時)
│   ├── Section Header
│   │   └── Label: "AIモデル", Inter 12px, 600, text-secondary
│   │
│   └── ModelSuggestionChips (flex, flex-wrap, gap: 8px, padding: 8px 16px)
│       └── Badge × N
│           ├── Background: rgba(0, 210, 211, 0.12)
│           ├── Border: 1px solid rgba(0, 210, 211, 0.3)
│           ├── Border-radius: 9999px
│           ├── Padding: 6px 12px
│           ├── Font: 13px, 500, secondary = #00D2D3
│           ├── Cursor: pointer
│           ├── Content: "🤖 {modelName}"
│           └── onClick: 検索実行 → /search?model={modelName}
│
├── Section: ムード (ムード名マッチ時)
│   ├── Section Header
│   │   └── Label: "ムード", Inter 12px, 600, text-secondary
│   │
│   └── MoodSuggestionChips (flex, flex-wrap, gap: 8px, padding: 8px 16px)
│       └── MoodTag × N
│           ├── ← channel-uiux-improvements.md §5 MoodTag スタイルを再利用
│           ├── Content: "{emoji} {moodLabel}"
│           └── onClick: 検索実行 → /search?mood={moodSlug}
│
└── Section: 動画候補 (タイトル・プロンプトマッチ時)
    ├── Section Header
    │   └── Label: "動画", Inter 12px, 600, text-secondary
    │
    └── VideoSuggestionItem × 5
        ├── Display: flex, align-items: center, gap: 12px
        ├── Padding: 10px 16px
        ├── Hover: bg var(--color-surface-hover)
        ├── Cursor: pointer
        │
        ├── Thumbnail
        │   ├── Width: 80px, Height: 45px (aspect-video)
        │   ├── Border-radius: 6px
        │   ├── Object-fit: cover
        │   └── src: image.mux.com/{playbackId}/thumbnail.webp?width=160&time=5
        │
        └── Info Area (flex: 1)
            ├── Title: Inter, 13px, 500, text-primary, line-clamp-1
            ├── Meta: Inter, 11px, text-secondary
            │   └── "⭐ {score} ・ 🤖 {modelName} ・ {channelName}"
            └── Match Highlight (optional)
                ├── Font: Inter, 11px, primary-text = #8B7CF8
                └── Content: "プロンプトに一致" or "タイトルに一致"
```

### 3.3 オートコンプリート動作仕様

```
入力イベントフロー:

1. ユーザーがSearchBarにフォーカス
   → SearchSuggestionPanel 表示
   → 最近の検索を表示（ローカルストレージから取得）

2. ユーザーが文字入力（debounce: 300ms）
   → API: GET /api/search/suggest?q={input}
   → レスポンスを4カテゴリに分類して表示

3. ユーザーがサジェストをクリック or Enter
   → 検索実行 → /search?q={keyword} に遷移
   → ローカルストレージに検索履歴を保存（最大10件）

4. ユーザーが Escape キー
   → SearchSuggestionPanel を閉じる

5. ユーザーが上下矢印キー
   → サジェスト項目間をキーボードナビゲーション
   → アクティブ項目にハイライト (surface-hover)
```

### 3.4 検索履歴管理

```typescript
// hooks/useSearchHistory.ts
const STORAGE_KEY = 'ai-theater-search-history'
const MAX_HISTORY = 10

function useSearchHistory() {
  const getHistory = (): string[] =>
    JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

  const addHistory = (query: string) => {
    const history = getHistory().filter(h => h !== query)
    history.unshift(query)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  }

  const removeHistory = (query: string) => {
    const history = getHistory().filter(h => h !== query)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  }

  const clearHistory = () => localStorage.removeItem(STORAGE_KEY)

  return { getHistory, addHistory, removeHistory, clearHistory }
}
```

---

## 4. 検索結果ページ設計

### 4.1 ページ全体レイアウト

> 既存画面設計との統一: サイドバー廃止、タブ UI 採用。

#### デスクトップ ワイヤーフレーム

```
┌─────────────────────────────────────────────────────────────────┐
│ Header (fixed, h=64)                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ── SearchResultHeader ────────────────────────────────────────  │
│  「夕焼け」の検索結果 (1,234件) ・ 0.3秒                          │
│                                                                  │
│  ── SearchResultTabs ──────────────────────────────────────────  │
│  [ 動画 (1,200) ]  [ AIチャンネル (12) ]  [ プロンプト (22) ]     │
│  ━━━━━━━━━━━━━━━━                                               │
│                                                                  │
│  ── FilterBar ─────────────────────────────────────────────────  │
│  [AIモデル ▼] [ムード ▼] [Quality Score ▼] [再生時間 ▼]          │
│  [アップロード日 ▼] [カテゴリ ▼]  ── 並び替え: [関連度 ▼]        │
│                                                                  │
│  ── ActiveFilterChips ─────────────────────────────────────────  │
│  [🤖 Runway Gen-4 ×] [🌅 Calm ×] [⭐ 4.0以上 ×]  [すべてクリア] │
│                                                                  │
│  ── SearchResults ─────────────────────────────────────────────  │
│                                                                  │
│  ┌──────────┬──────────────────────────────────────────┐        │
│  │ Mux      │ 夕焼けの東京タワー                         │        │
│  │ Thumbnail│ 123K views ・ 3日前                        │        │
│  │ [12:34]  │ 🤖 Aurora  ⭐ 4.8  <Badge>Runway</Badge>  │        │
│  │ 🤖 Badge │ 動画の説明文テキスト (2行まで)...           │        │
│  │          │ 💡 マッチ: プロンプトに「夕焼け」を含む     │        │
│  └──────────┴──────────────────────────────────────────┘        │
│                                                                  │
│  ┌──────────┬──────────────────────────────────────────┐        │
│  │ Mux      │ 夕焼けの渋谷スクランブル                    │        │
│  │ Thumbnail│ 45K views ・ 1週間前                       │        │
│  │ [5:20]   │ 🤖 Nexus   ⭐ 4.2  <Badge>Sora</Badge>   │        │
│  │ 🤖 Badge │ 動画の説明文テキスト (2行まで)...           │        │
│  │          │ 💡 マッチ: タイトルに「夕焼け」を含む       │        │
│  └──────────┴──────────────────────────────────────────┘        │
│                                                                  │
│  ... (more results)                                              │
│                                                                  │
│  ── Pagination ────────────────────────────────────────────────  │
│  [< 前へ] [1] [2] [3] ... [42] [次へ >]                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### モバイル ワイヤーフレーム

```
┌──────────────────────────────┐
│ [←] [夕焼け________] [🔍]    │
├──────────────────────────────┤
│ 「夕焼け」1,234件 ・ 0.3秒   │
├──────────────────────────────┤
│ [動画(1200)] [チャンネル(12)] │ ← 横スクロール
│ [プロンプト(22)]              │
├──────────────────────────────┤
│ [フィルタ 🔽]  並び替え [▼]  │ ← タップで BottomSheet
├──────────────────────────────┤
│ [Runway ×] [Calm ×]          │ ← ActiveFilterChips
├──────────────────────────────┤
│ ┌──────┬─────────────────┐   │
│ │サムネ │夕焼けの東京タワー │   │
│ │      │⭐ 4.8 🤖 Runway  │   │
│ │      │123K views ・ 3日前│   │
│ │      │💡プロンプト一致   │   │
│ ├──────┼─────────────────┤   │
│ │サムネ │夕焼けの渋谷      │   │
│ │      │⭐ 4.2 🤖 Sora    │   │
│ │      │45K views ・ 1週間 │   │
│ └──────┴─────────────────┘   │
│                              │
│ [< 前へ] [1] [2] [次へ >]    │
├──────┬──────┬──────┬──────┤
│  🏠  │  🔥  │  🔍  │  👤  │
└──────┴──────┴──────┴──────┘
```

### 4.2 SearchResultHeader

```
SearchResultHeader
├── Container
│   ├── Padding: 24px 24px 0 (desktop) / 16px 16px 0 (mobile)
│   ├── max-width: 1200px, margin: 0 auto
│   └── margin-top: 64px (header offset)
│
├── Result Summary
│   ├── Query Highlight
│   │   ├── Content: "「{query}」の検索結果"
│   │   ├── Font: Space Grotesk, 22px (desktop) / 18px (mobile), weight 700
│   │   └── Color: var(--color-text-primary) = #F0F6FC
│   │       └── query 部分: color var(--color-primary-text) = #8B7CF8
│   │
│   └── Meta Row
│       ├── Font: Inter, 13px, text-secondary = #8B949E
│       └── Content: "({totalCount}件) ・ {responseTime}秒"
│
└── No Results State (結果0件時)
    ├── Icon: Lucide SearchX, 48px, text-secondary
    ├── Title: "「{query}」に一致する動画が見つかりませんでした"
    │   └── Font: Space Grotesk, 18px, 600, text-primary
    ├── Suggestions:
    │   ├── "キーワードの綴りを確認してください"
    │   ├── "より一般的なキーワードで検索してください"
    │   └── "AIモデル名やムードでの検索もお試しください"
    │       └── Font: Inter, 14px, text-secondary
    └── Explore CTA:
        ├── "トレンド動画を見る" Button (variant="outline")
        └── "ムードで探す" Button (variant="outline")
```

---

## 5. 検索結果タブ設計（SearchResultTabs）

### 5.1 タブ構成

AI Theater では検索結果を **3つのタブ** に分類する。

| タブ | 検索対象 | デフォルト | 表示形式 |
|------|---------|-----------|---------|
| 動画 (N) | Video テーブル（タイトル・プロンプト・カテゴリ） | ✅ | VideoCard [variant="list"] |
| AIチャンネル (N) | AIChannel テーブル（名前・説明・モデル名） | - | ChannelSearchCard |
| プロンプト (N) | Video.prompt フィールド（プロンプト全文検索） | - | PromptSearchCard |

### 5.2 SearchResultTabs コンポーネント

```
SearchResultTabs (shadcn/ui Tabs)
├── TabsList
│   ├── Display: flex, gap: 0
│   ├── Background: transparent
│   ├── Border-bottom: 1px solid var(--color-border) = #30363D
│   ├── Padding: 0 24px (desktop) / 0 16px (mobile)
│   ├── Overflow-x: auto (mobile)
│   ├── Scrollbar-width: none
│   │
│   └── TabsTrigger × 3
│       ├── Padding: 12px 20px (desktop) / 10px 16px (mobile)
│       ├── Font: Inter, 14px, 500
│       ├── White-space: nowrap
│       ├── Default: color text-secondary, border-bottom: 2px solid transparent
│       ├── Hover: color text-primary
│       ├── Active: color text-primary, border-bottom: 2px solid primary = #6C5CE7
│       └── Content: "{tabLabel} ({count})"
│
├── TabsContent: 動画タブ
│   ├── FilterBar (§6 参照)
│   ├── ActiveFilterChips (§6.3 参照)
│   └── VideoSearchResults (§7.1 参照)
│
├── TabsContent: AIチャンネルタブ
│   └── ChannelSearchResults (§7.2 参照)
│
└── TabsContent: プロンプトタブ
    └── PromptSearchResults (§7.3 参照)
```

---

## 6. フィルタリング・ソート設計

### 6.1 フィルタ項目

| フィルタ | 種類 | 選択肢 | AI Theater 独自 |
|---------|------|--------|----------------|
| **AIモデル** | Multi-select | Runway Gen-4 / Sora / Veo 3.1 / Kling / その他 | ✅ |
| **ムード** | Multi-select | Calm / Energetic / Dreamy / Fun / Zen / Mystic | ✅ |
| **Quality Score** | Range | 4.0以上 / 3.0以上 / すべて | ✅ |
| **再生時間** | Single-select | 4分未満 / 4-20分 / 20分以上 | - |
| **アップロード日** | Single-select | 今日 / 今週 / 今月 / 今年 / すべて | - |
| **カテゴリ** | Single-select | 風景 / 音楽 / アート / 科学 / ゲーム / 教育 / その他 | - |

### 6.2 FilterBar コンポーネント設計

```
FilterBar
├── Container
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Padding: 12px 24px (desktop) / 8px 16px (mobile)
│   ├── Overflow-x: auto (mobile)
│   ├── Scrollbar-width: none
│   └── Flex-wrap: wrap (desktop) / nowrap (mobile)
│
├── Desktop: 個別 FilterDropdown × 6
│   └── FilterDropdown (shadcn/ui Popover + Command)
│       ├── Trigger Button
│       │   ├── variant: outline, size: sm
│       │   ├── Display: flex, align-items: center, gap: 6px
│       │   ├── Background: var(--color-surface) = #161B22
│       │   ├── Border: 1px solid var(--color-border) = #30363D
│       │   ├── Border-radius: 8px
│       │   ├── Padding: 6px 12px
│       │   ├── Font: 13px, 500, text-secondary
│       │   ├── Active (フィルタ選択中): border-color primary, color primary-text
│       │   └── Content: "{label} ▼" or "{label}: {value} ▼"
│       │
│       └── Popover Content
│           ├── Width: 240px
│           ├── Background: var(--color-surface) = #161B22
│           ├── Border: 1px solid var(--color-border)
│           ├── Border-radius: 8px
│           ├── Box-shadow: 0 8px 32px rgba(0,0,0,0.4)
│           ├── Padding: 8px
│           │
│           ├── Search Input (AIモデル・カテゴリの場合)
│           │   ├── shadcn/ui Command の CommandInput
│           │   ├── Placeholder: "モデルを検索..."
│           │   └── Margin-bottom: 8px
│           │
│           └── Option List
│               └── OptionItem × N
│                   ├── Display: flex, align-items: center, gap: 8px
│                   ├── Padding: 8px 12px
│                   ├── Border-radius: 4px
│                   ├── Hover: bg surface-hover
│                   ├── Checkbox (multi-select) or Radio (single-select)
│                   │   ├── shadcn/ui Checkbox or 独自 Radio
│                   │   └── Checked: primary color
│                   ├── Label: 13px, text-primary
│                   └── Count: 12px, text-secondary (件数)
│
├── Mobile: "フィルタ" ボタン → BottomSheet
│   ├── Trigger: Button variant="outline" size="sm"
│   │   ├── Icon: Lucide SlidersHorizontal, 16px
│   │   ├── Content: "フィルタ"
│   │   └── Badge (フィルタ適用数): primary bg, #FFFFFF text
│   │
│   └── FilterBottomSheet (shadcn/ui Sheet [side="bottom"])
│       ├── Handle: 4px × 40px centered bar (border bg)
│       ├── Height: 80vh
│       ├── Padding: 16px
│       ├── Title: "検索フィルタ", Space Grotesk 18px, 700
│       │
│       ├── FilterSection × 6
│       │   ├── Label: Inter, 14px, 600, text-primary
│       │   ├── Margin-bottom: 16px
│       │   └── Options (flex, flex-wrap, gap: 8px)
│       │       └── FilterChip (toggle)
│       │           ← home-uiux-improvements.md §4.1 FilterChip スタイル再利用
│       │
│       └── Footer
│           ├── Display: flex, gap: 12px
│           ├── "リセット" Button (variant="outline", flex: 1)
│           └── "適用する ({count}件)" Button (variant="default", flex: 1)
│               └── 件数はフィルタ適用後の推定結果数
│
└── Sort Dropdown (右寄せ)
    ├── shadcn/ui Select
    ├── Trigger: "並び替え: {label} ▼", variant="ghost", size="sm"
    └── Options:
        ├── 関連度 [default]
        ├── Quality Score 高い順
        ├── 再生数 多い順
        ├── アップロード日 新しい順
        └── いいね率 高い順
```

### 6.3 ActiveFilterChips（適用中フィルタ表示）

```
ActiveFilterChips
├── Container
│   ├── Display: flex, align-items: center, gap: 8px, flex-wrap: wrap
│   ├── Padding: 0 24px 12px (desktop) / 0 16px 8px (mobile)
│   └── 表示条件: フィルタが1つ以上適用されている場合のみ
│
├── ActiveChip × N
│   ├── Display: inline-flex, align-items: center, gap: 4px
│   ├── Background: rgba(108, 92, 231, 0.12)
│   ├── Border: 1px solid rgba(108, 92, 231, 0.30)
│   ├── Border-radius: 9999px
│   ├── Padding: 4px 10px
│   ├── Font: 12px, 500
│   ├── Color: var(--color-primary-text) = #8B7CF8
│   ├── Content: "{icon} {label}" + Lucide X (14px)
│   └── onClick (X): フィルタ解除
│
└── ClearAll Link
    ├── Font: Inter, 12px, 500, primary-text = #8B7CF8
    ├── Content: "すべてクリア"
    └── onClick: 全フィルタ解除
```

### 6.4 URL パラメータ設計

```
検索 URL パラメータ:

/search?q={query}                         # テキスト検索
       &tab={videos|channels|prompts}     # アクティブタブ
       &model={modelSlug}                 # AIモデルフィルタ (複数: model=runway&model=sora)
       &mood={moodSlug}                   # ムードフィルタ (複数可)
       &quality={minScore}                # 最低Quality Score (e.g., quality=4.0)
       &duration={short|medium|long}      # 再生時間
       &date={today|week|month|year}      # アップロード日
       &category={categorySlug}           # カテゴリ
       &sort={relevance|quality|views|date|likes}  # 並び替え
       &page={pageNumber}                 # ページ番号

例:
/search?q=夕焼け&model=runway&mood=calm&quality=4.0&sort=quality&page=1
```

---

## 7. 検索結果カード設計

### 7.1 動画検索結果カード（VideoSearchResultCard）

> 既存 VideoCard [variant="list"] をベースに、検索マッチ理由を追加。

```
VideoSearchResultCard
├── Container
│   ├── Display: flex, gap: 16px (desktop) / 12px (mobile)
│   ├── Padding: 16px 24px (desktop) / 12px 16px (mobile)
│   ├── Border-bottom: 1px solid var(--color-border) = #30363D
│   ├── Hover: bg var(--color-surface-hover) = #1C2333
│   ├── Cursor: pointer
│   └── Transition: background 150ms ease
│
├── Thumbnail Area
│   ├── Width: 360px (desktop) / 160px (mobile)
│   ├── Aspect-ratio: 16/9
│   ├── Border-radius: 8px
│   ├── Overflow: hidden
│   ├── Position: relative
│   ├── Flex-shrink: 0
│   │
│   ├── <img> (Mux thumbnail)
│   │   └── src: image.mux.com/{id}/thumbnail.webp?width=720&time=5
│   │
│   ├── AIBadge (absolute, top: 6px, left: 6px)
│   │   └── ← home-uiux-improvements.md §3.1 AIBadge スタイル
│   │
│   ├── Duration Badge (absolute, bottom: 6px, right: 6px)
│   │   └── ← home-uiux-improvements.md §3.1 Duration Badge スタイル
│   │
│   └── Hover Preview (desktop, absolute, inset: 0)
│       ├── Mux animated thumbnail
│       ├── Opacity: 0 → hover 1
│       └── Transition: opacity 300ms ease 300ms
│
├── Info Area (flex: 1, min-width: 0)
│   ├── Title
│   │   ├── Font: Inter, 16px (desktop) / 14px (mobile), weight 600
│   │   ├── Color: var(--color-text-primary) = #F0F6FC
│   │   ├── Line-clamp: 2
│   │   └── Margin-bottom: 4px
│   │
│   ├── Stats Row
│   │   ├── Font: Inter, 13px, text-secondary
│   │   └── Content: "{viewCount} views ・ {relativeTime}"
│   │
│   ├── Creator + Tags Row
│   │   ├── Display: flex, align-items: center, gap: 8px, flex-wrap: wrap
│   │   ├── Margin-top: 6px
│   │   │
│   │   ├── Creator
│   │   │   ├── Display: flex, align-items: center, gap: 4px
│   │   │   ├── Avatar: 20px, border-radius: 50%
│   │   │   └── Name: 13px, text-secondary
│   │   │
│   │   ├── QualityBadge: "⭐ {score}"
│   │   │   └── ← home-uiux-improvements.md §3.5 QualityBadge compact
│   │   │
│   │   └── ModelBadge: <Badge>{modelName}</Badge>
│   │       └── ← 既存 Badge スタイル (secondary color)
│   │
│   ├── Description (desktop のみ)
│   │   ├── Font: Inter, 13px, text-secondary
│   │   ├── Line-clamp: 2
│   │   ├── Margin-top: 8px
│   │   └── Max-width: 600px
│   │
│   └── MatchReason (検索マッチ理由)
│       ├── Display: flex, align-items: center, gap: 4px
│       ├── Margin-top: 6px
│       ├── Font: Inter, 11px, primary-text = #8B7CF8
│       ├── Icon: Lucide Lightbulb, 12px
│       └── Content: "マッチ: {reason}"
│           ├── "タイトルに「{query}」を含む"
│           ├── "プロンプトに「{query}」を含む"
│           ├── "AIモデル「{modelName}」に一致"
│           └── "カテゴリ「{category}」に一致"
│
└── Mobile Layout (< 640px)
    ├── Thumbnail: 160px × 90px (固定)
    ├── Info Area: Description 非表示
    └── MatchReason: 1行に短縮
```

### 7.2 チャンネル検索結果カード（ChannelSearchCard）

```
ChannelSearchCard
├── Container
│   ├── Display: flex, align-items: center, gap: 20px (desktop) / 12px (mobile)
│   ├── Padding: 20px 24px (desktop) / 16px (mobile)
│   ├── Border-bottom: 1px solid var(--color-border)
│   ├── Hover: bg var(--color-surface-hover)
│   └── Cursor: pointer
│
├── Avatar
│   ├── Width: 80px (desktop) / 56px (mobile), Height: same
│   ├── Border-radius: 50%
│   ├── Border: 2px solid var(--color-primary) = #6C5CE7
│   └── Flex-shrink: 0
│
├── Info Area (flex: 1)
│   ├── Name Row
│   │   ├── Display: flex, align-items: center, gap: 8px
│   │   ├── Channel Name: Space Grotesk, 16px (desktop) / 14px (mobile), 700, text-primary
│   │   └── AI Model Badge (inline)
│   │       └── ← channel-uiux-improvements.md §3.2 AI Model Badge スタイル
│   │
│   ├── Description
│   │   ├── Font: Inter, 13px, text-secondary
│   │   ├── Line-clamp: 2
│   │   └── Margin-top: 4px
│   │
│   └── Stats Row
│       ├── Font: Inter, 12px, text-secondary
│       ├── Margin-top: 6px
│       └── Content: "{videoCount}本の動画 ・ 購読者 {subscribers} ・ ⭐ {avgScore}"
│
└── Action Area (desktop のみ)
    └── Subscribe Button (shadcn/ui Button)
        ├── Not subscribed: variant="outline", size="sm", content: "購読する"
        └── Subscribed: variant="outline" accent, content: "購読中 ✓"
```

### 7.3 プロンプト検索結果カード（PromptSearchCard）

> AI Theater 独自タブ: プロンプト全文検索に一致した動画を、プロンプトを強調して表示。

```
PromptSearchCard
├── Container
│   ├── Display: flex, gap: 16px
│   ├── Padding: 16px 24px (desktop) / 12px 16px (mobile)
│   ├── Border-bottom: 1px solid var(--color-border)
│   ├── Hover: bg var(--color-surface-hover)
│   └── Cursor: pointer
│
├── Thumbnail Area (same as VideoSearchResultCard)
│   └── Width: 240px (desktop) / 120px (mobile)
│
├── Info Area (flex: 1)
│   ├── Prompt Area
│   │   ├── Label: "プロンプト:", 12px, 600, primary-text = #8B7CF8
│   │   ├── Prompt Text
│   │   │   ├── Background: rgba(139, 124, 248, 0.06)
│   │   │   ├── Border-left: 2px solid var(--color-primary) = #6C5CE7
│   │   │   ├── Border-radius: 0 8px 8px 0
│   │   │   ├── Padding: 8px 12px
│   │   │   ├── Font: Inter, 13px, line-height: 1.6, text-primary
│   │   │   ├── Line-clamp: 3
│   │   │   └── Highlight: 検索キーワードに一致する部分を
│   │   │       <mark> タグで強調
│   │   │       ├── Background: rgba(108, 92, 231, 0.25)
│   │   │       ├── Color: #F0F6FC
│   │   │       └── Border-radius: 2px
│   │   └── Margin-bottom: 8px
│   │
│   ├── Title: Inter, 14px, 600, text-primary, line-clamp-1
│   │
│   └── Meta Row
│       ├── Font: Inter, 12px, text-secondary
│       └── Content: "🤖 {channelName} ・ ⭐ {score} ・ {modelName} ・ {viewCount} views"
│
└── Mobile: Prompt Text → line-clamp: 2, Thumbnail 120px
```

---

