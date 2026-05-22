# 検索機能 UI/UX: 状態設計・アクセシビリティ

> 元ファイル: [search-uiux-improvements.md](search-uiux-improvements.md) から分割（§8-16）

---

## 8. 空状態・エラー状態設計

### 8.1 検索結果なし

```
SearchEmptyState
├── Container: flex column, align-items: center, padding: 80px 24px (desktop) / 48px 16px (mobile)
├── Icon: Lucide SearchX, 64px (desktop) / 48px (mobile), color: #30363D
├── Title: "「{query}」に一致する結果がありません"
│   └── Font: Space Grotesk, 20px (desktop) / 16px (mobile), 700, text-primary
├── Suggestions (flex column, gap: 6px, margin-top: 16px)
│   ├── "・キーワードの綴りを確認してください"
│   ├── "・より一般的なキーワードで検索してください"
│   ├── "・AIモデル名（Runway, Sora 等）で検索してみてください"
│   └── "・ムード（Calm, Dreamy 等）で探してみてください"
│       └── Font: Inter, 14px, text-secondary
├── Separator: 1px solid border, width: 200px, margin: 24px 0
└── CTA Buttons (flex, gap: 12px)
    ├── "トレンド動画を見る" Button (variant="outline")
    │   └── href: /trending
    └── "ホームに戻る" Button (variant="outline")
        └── href: /
```

### 8.2 フィルタ結果なし

```
FilterEmptyState
├── Container: flex column, align-items: center, padding: 48px 24px
├── Icon: Lucide Filter, 48px, text-secondary
├── Title: "この条件に一致する動画がありません"
│   └── Font: Inter, 16px, 600, text-primary
├── Sub: "フィルタ条件を変更してお試しください"
│   └── Font: Inter, 14px, text-secondary
└── "フィルタをリセット" Button (variant="outline", size="sm")
    └── onClick: 全フィルタをクリア
```

### 8.3 検索エラー

```
SearchErrorState
├── Container: flex column, align-items: center, padding: 80px 24px
├── Icon: Lucide AlertTriangle, 48px, color: #F85149
├── Title: "検索中にエラーが発生しました"
│   └── Font: Inter, 16px, 600, text-primary
├── Sub: "しばらくしてからもう一度お試しください"
│   └── Font: Inter, 14px, text-secondary
└── "再試行" Button (variant="outline")
    └── onClick: 検索を再実行
```

### 8.4 ローディング状態

```
SearchLoadingState
├── Skeleton × 6 (VideoSearchResultCard の形状)
│   ├── Thumbnail: aspect-video, 360px (desktop) / 160px (mobile), animate-pulse
│   │   └── Background: var(--color-surface-hover) with shimmer
│   ├── Title: h-4 w-3/4, rounded, animate-pulse
│   ├── Stats: h-3 w-1/2, rounded, animate-pulse
│   ├── Tags: h-3 w-1/3, rounded, animate-pulse
│   └── Description: h-3 w-full + h-3 w-2/3, animate-pulse
│
└── Pagination Skeleton: h-8 w-64, centered
```

---

## 9. レスポンシブ設計

### 9.1 ブレークポイント別レイアウト

| ブレークポイント | 検索バー | フィルタ | 結果カード | ページネーション |
|----------------|---------|---------|-----------|---------------|
| Mobile (< 640px) | アイコン → フルスクリーン展開 | "フィルタ" ボタン → BottomSheet | list variant (サムネ 160px) | compact (3ページ表示) |
| Tablet (640-1023px) | 320px 幅 | 横スクロール FilterDropdown | list variant (サムネ 240px) | standard (5ページ表示) |
| Desktop (1024-1279px) | 480px 幅 | 個別 FilterDropdown (折り返し) | list variant (サムネ 360px) | full (7ページ表示) |
| Wide (1280px+) | 480-640px 幅 | 個別 FilterDropdown (1行) | list variant (サムネ 360px) | full (7ページ表示) |

### 9.2 モバイル固有の対応

- **フィルタ BottomSheet**: モバイルでは FilterBar 全体を BottomSheet に格納し、画面スペースを確保
- **検索バー展開**: モバイルヘッダーの検索アイコンタップで固定フルスクリーン検索 UI を表示
- **結果カードのタッチ対応**: タッチフィードバック（active 状態で surface-hover 背景適用）
- **ページネーション**: モバイルでは「前へ/次へ」ボタン + 現在ページ表示のみ

---

## 10. キーボードショートカット

| ショートカット | アクション | 実装 |
|--------------|----------|------|
| `/` or `Ctrl+K` | 検索バーにフォーカス | グローバルキーリスナー |
| `Enter` | 検索実行 or サジェスト選択 | SearchBar onKeyDown |
| `Escape` | 検索パネルを閉じる / フォーカス解除 | SearchBar / SuggestionPanel |
| `↑` `↓` | サジェスト項目間ナビゲーション | SuggestionPanel |
| `Tab` | 次のサジェストカテゴリへ移動 | SuggestionPanel |

---

## 11. アクセシビリティ（WCAG AA チェックリスト）

### 11.1 ARIA ロール・属性

| 要素 | 実装 |
|------|------|
| SearchBar | `role="search"` + `aria-label="動画・AIモデル・プロンプトを検索"` |
| SearchBar Input | `role="combobox"` + `aria-expanded={isSuggestionOpen}` + `aria-controls="suggestion-panel"` + `aria-autocomplete="list"` |
| SearchSuggestionPanel | `id="suggestion-panel"` + `role="listbox"` |
| SuggestionItem | `role="option"` + `aria-selected={isActive}` |
| SuggestionSection | `role="group"` + `aria-label="{sectionLabel}"` |
| SearchResultTabs | shadcn/ui Tabs 標準 `role="tablist"` + `role="tab"` + `aria-selected` |
| FilterDropdown | `aria-haspopup="listbox"` + `aria-expanded` |
| FilterBottomSheet | `role="dialog"` + `aria-label="検索フィルタ"` + フォーカストラップ |
| ActiveFilterChip 削除 | `aria-label="{label} フィルタを解除"` |
| SearchEmptyState | `aria-live="polite"` で結果なしを通知 |
| SearchLoadingState | `aria-busy="true"` + `aria-label="検索結果を読み込み中"` |
| Pagination | `nav` + `aria-label="検索結果のページネーション"` |
| MatchReason | `aria-label="マッチ理由: {reason}"` |

### 11.2 キーボード操作

| 操作 | 要件 | 実装 |
|------|------|------|
| **Tab 順序** | SearchBar → Tabs → Filters → Results → Pagination の順 | DOM 順序を視覚と一致 |
| **Skip link** | 「検索結果へスキップ」リンクを設置 | `<a href="#search-results" className="sr-only focus:not-sr-only">` |
| **SearchBar** | `/` or `Ctrl+K` でフォーカス | グローバル keydown リスナー |
| **SuggestionPanel** | 上下矢印でナビゲーション、Enter で選択、Escape で閉じる | onKeyDown ハンドラ |
| **FilterDropdown** | Enter で開閉、Space でオプション選択 | Popover + Command 標準動作 |
| **FilterBottomSheet** | Escape で閉じる、フォーカストラップ | shadcn/ui Sheet 標準 |
| **Pagination** | Tab でページ番号間移動、Enter で遷移 | shadcn/ui Pagination 標準 |
| **フォーカス可視化** | 全要素に `:focus-visible` リング表示 | `outline: 2px solid #8B7CF8; outline-offset: 2px;` |

### 11.3 コントラスト比（WCAG AA 4.5:1 以上）

| 要素 | 前景色 | 背景色 | 比率 | 判定 |
|------|--------|--------|------|------|
| SearchBar placeholder | #7A8390 | #161B22 | 4.62:1 | ✅ |
| SearchBar text | #F0F6FC | #161B22 | ~13.5:1 | ✅ |
| ResultHeader query | #8B7CF8 | #0D1117 | 6.32:1 | ✅ |
| ResultHeader meta | #8B949E | #0D1117 | 6.15:1 | ✅ |
| Tab active text | #F0F6FC | #0D1117 | 17.39:1 | ✅ |
| Tab inactive text | #8B949E | #0D1117 | 6.15:1 | ✅ |
| Card title | #F0F6FC | #0D1117 | 17.39:1 | ✅ |
| Card meta | #8B949E | #0D1117 | 6.15:1 | ✅ |
| MatchReason text | #8B7CF8 | #0D1117 | 6.32:1 | ✅ |
| ActiveFilterChip text | #8B7CF8 | rgba(108,92,231,0.12) on #0D1117 | ~5.8:1 | ✅ |
| FilterDropdown option | #F0F6FC | #161B22 | ~13.5:1 | ✅ |
| Prompt highlight | #F0F6FC | rgba(108,92,231,0.25) on #161B22 | ~10:1 | ✅ |

### 11.4 スクリーンリーダー対応

| シナリオ | 実装 |
|----------|------|
| ページ読み込み完了 | `<h1>` に "「{query}」の検索結果" を設定 |
| 検索実行完了 | `aria-live="polite"` で "{count}件の結果が見つかりました" を通知 |
| フィルタ変更 | `aria-live="polite"` で "フィルタ適用: {count}件" を通知 |
| タブ切り替え | shadcn/ui Tabs 標準で `aria-selected` が自動更新 |
| 結果なし | `aria-live="polite"` で "一致する結果がありません" を通知 |
| エラー発生 | `aria-live="assertive"` + `role="alert"` で即時読み上げ |

### 11.5 WCAG AA 受入基準チェックリスト

```
検索機能 WCAG 2.1 Level AA 受入基準

キーボード操作:
  □ すべてのインタラクティブ要素がキーボードで操作可能
  □ Skip link 「検索結果へスキップ」が Tab 最初のフォーカスで現れる
  □ / or Ctrl+K で検索バーにフォーカスが移動する
  □ サジェストパネル内で上下矢印ナビゲーションが動作する
  □ Escape でサジェストパネル・FilterBottomSheet が閉じる
  □ FilterBottomSheet 内でフォーカスがトラップされる
  □ フォーカスリングが全要素で視覚的に確認できる

スクリーンリーダー:
  □ <h1> が検索クエリを含む
  □ SearchBar が role="search" を持つ
  □ SearchBar Input が role="combobox" + aria-expanded を持つ
  □ 検索完了時に件数が aria-live="polite" で通知される
  □ フィルタ変更時に件数が通知される
  □ エラー発生時に aria-live="assertive" でアナウンス
  □ アイコンのみのボタンに aria-label がある

コントラスト（WCAG AA 4.5:1 以上）:
  □ 全テキスト要素が 4.5:1 以上（§11.3 参照）
  □ UI コンポーネントのフォーカスインジケーターが 3:1 以上
  □ プロンプトハイライト部分が周囲テキストと区別可能

その他:
  □ テキスト拡大 200% でレイアウト破綻しない
  □ 色のみに依存した情報伝達がない（アイコン + テキストで補完）
  □ 画像に alt 属性（サムネイル: "{title} のサムネイル" 等）
```

---

## 12. コンポーネント再利用・新規定義

### 12.1 再利用コンポーネント（変更なし）

| コンポーネント | 元ドキュメント | 再利用箇所 |
|--------------|-------------|-----------|
| `VideoCard [variant="list"]` | home-uiux-improvements.md §3.1 | VideoSearchResultCard ベース |
| `AIBadge` | home-uiux-improvements.md §3.1 | サムネイル上のAIバッジ |
| `QualityBadge [compact]` | home-uiux-improvements.md §3.5 | 検索結果カード内 |
| `FilterChip` | home-uiux-improvements.md §4.1 | FilterBar・FilterBottomSheet |
| `MoodTag` | channel-uiux-improvements.md §5 | SearchSuggestionPanel ムードセクション |
| `Skeleton` | home-uiux-improvements.md §5.3 | SearchLoadingState |
| `shadcn/ui Tabs` | 全画面共通 | SearchResultTabs |
| `shadcn/ui Pagination` | ui-ux-design.md §2.3 | 検索結果ページネーション |
| `shadcn/ui Sheet` | 全画面共通 | FilterBottomSheet (mobile) |
| `shadcn/ui Command` | ui-ux-design.md §3.1 | SearchBar オートコンプリート基盤 |

### 12.2 新規コンポーネント定義

| コンポーネント | ファイルパス（想定） | 概要 |
|--------------|---------------------|------|
| `SearchBar` | `components/search/SearchBar.tsx` | ヘッダー統合検索バー（Command + Input + SuggestionPanel） |
| `MobileSearchOverlay` | `components/search/MobileSearchOverlay.tsx` | モバイルフルスクリーン検索 UI |
| `SearchSuggestionPanel` | `components/search/SearchSuggestionPanel.tsx` | 4カテゴリのオートコンプリートパネル |
| `SearchResultHeader` | `components/search/SearchResultHeader.tsx` | 検索結果ヘッダー（件数・レスポンスタイム） |
| `SearchResultTabs` | `components/search/SearchResultTabs.tsx` | 3タブ（動画・チャンネル・プロンプト） |
| `FilterBar` | `components/search/FilterBar.tsx` | デスクトップ用 FilterDropdown 横並び |
| `FilterDropdown` | `components/search/FilterDropdown.tsx` | Popover + Command のフィルタ選択 |
| `FilterBottomSheet` | `components/search/FilterBottomSheet.tsx` | モバイル用 Sheet フィルタ UI |
| `ActiveFilterChips` | `components/search/ActiveFilterChips.tsx` | 適用中フィルタのチップ表示 |
| `VideoSearchResultCard` | `components/search/VideoSearchResultCard.tsx` | VideoCard [list] + マッチ理由 |
| `ChannelSearchCard` | `components/search/ChannelSearchCard.tsx` | チャンネル検索結果カード |
| `PromptSearchCard` | `components/search/PromptSearchCard.tsx` | プロンプト検索結果カード（ハイライト付き） |
| `SearchEmptyState` | `components/search/SearchEmptyState.tsx` | 結果なし状態 |
| `SearchErrorState` | `components/search/SearchErrorState.tsx` | エラー状態 |
| `useSearchHistory` | `hooks/useSearchHistory.ts` | ローカルストレージ検索履歴管理 |

---

## 13. データ取得設計

### 13.1 検索 API エンドポイント

```typescript
// API Route: /api/search/suggest (オートコンプリート)
// Method: GET
// Query: ?q={input}
// Response:
{
  recentSearches: string[],                    // ローカルストレージから（クライアント側）
  models: { name: string, slug: string }[],    // AIモデル名候補
  moods: { name: string, slug: string, emoji: string }[],  // ムード候補
  videos: {
    id: string,
    title: string,
    muxPlaybackId: string,
    qualityScore: number,    // DB: 0-100
    aiModel: string,
    channelName: string,
    matchType: 'title' | 'prompt'
  }[]
}

// API Route: /api/search (検索結果)
// Method: GET
// Query: ?q={query}&tab={tab}&model={model}&mood={mood}&quality={min}
//        &duration={duration}&date={date}&category={category}
//        &sort={sort}&page={page}&limit=20
// Response:
{
  videos: { items: Video[], totalCount: number },
  channels: { items: AIChannel[], totalCount: number },
  prompts: { items: VideoWithPrompt[], totalCount: number },
  responseTime: number  // ms
}
```

### 13.2 クライアント側データフェッチ

```typescript
// hooks/useSearch.ts (TanStack Query)

const { data, isLoading, error } = useQuery({
  queryKey: ['search', query, activeTab, filters, sort, page],
  queryFn: () => fetchSearchResults({
    q: query,
    tab: activeTab,
    ...filters,
    sort,
    page,
    limit: 20,
  }),
  enabled: !!query,         // query が空の場合はフェッチしない
  staleTime: 60_000,        // 1分間キャッシュ
  keepPreviousData: true,   // ページ遷移時に前データを表示
})

// hooks/useSearchSuggest.ts (オートコンプリート)
const { data: suggestions } = useQuery({
  queryKey: ['search-suggest', debouncedInput],
  queryFn: () => fetchSuggestions(debouncedInput),
  enabled: debouncedInput.length >= 1,
  staleTime: 30_000,
})
```

### 13.3 Quality Score 変換（統一ルール）

```typescript
// DB: 0-100 integer → UI: 0.0-5.0 float (小数第1位)
// channel-uiux-improvements.md §10.2 と同一
const toUIScore = (dbScore: number): string =>
  (dbScore / 20).toFixed(1)
```

---

## 14. 実装優先度

| コンポーネント / 機能 | 優先度 | 理由 |
|--------------------|--------|------|
| SearchBar（基本テキスト検索） | **P0** | 検索機能の核心 |
| SearchResultHeader + SearchResultTabs | **P0** | 結果表示の基盤 |
| VideoSearchResultCard | **P0** | メイン検索結果表示 |
| FilterBar（AIモデル・並び替え） | **P0** | AI Theater 差別化の核心フィルタ |
| Pagination | **P0** | 結果ナビゲーション |
| SearchEmptyState + SearchErrorState | **P0** | エッジケース対応 |
| SearchSuggestionPanel（基本サジェスト） | **P1** | UX 向上（検索精度改善） |
| FilterDropdown（ムード・Quality Score） | **P1** | 高度なフィルタリング |
| ChannelSearchCard | **P1** | チャンネル検索タブ |
| PromptSearchCard + プロンプトハイライト | **P1** | AI Theater 独自機能 |
| ActiveFilterChips | **P1** | フィルタ状態の可視化 |
| MobileSearchOverlay | **P1** | モバイル対応 |
| FilterBottomSheet (mobile) | **P1** | モバイルフィルタ |
| キーボードショートカット (`/`, `Ctrl+K`) | **P2** | パワーユーザー向け |
| MatchReason（マッチ理由表示） | **P2** | 検索透明性（データ蓄積後） |
| Hover Preview (animated thumbnail) | **P2** | UX 演出 |
| useSearchHistory（検索履歴） | **P2** | 利便性向上 |

---

## 15. 他画面との設計整合性

| 観点 | 統一方針 | 参照 |
|------|----------|------|
| タブUI採用（サイドバー廃止） | ✅ 全画面統一 | ISSUE-VR-1 教訓 |
| デザイントークン | ✅ home-uiux-improvements.md §6 準拠 | §11.3 |
| Quality Score スケール変換 | ✅ DB: 0-100 → UI: 0.0-5.0 (÷20) | §13.3 |
| VideoCard コンポーネント再利用 | ✅ variant="list" ベースに拡張 | §12.1 |
| AIBadge スタイル | ✅ home仕様と同一 | §12.1 |
| MoodTag スタイル | ✅ channel仕様と同一 | §12.1 |
| FilterChip スタイル | ✅ home仕様と同一 | §12.1 |
| text-tertiary コントラスト制限 | ✅ #161B22 背景上では text-secondary (#8B949E) を使用 | channel §12.2 |
| EU AI Act ラベル | ✅ 検索結果の各 VideoCard に AIBadge が常時表示 | channel §15 |
| C2PA バッジ | ✅ 検索結果カードでは非表示（動画再生ページでのみ表示） | channel §16 |
| AuthModal 統合 | ✅ 検索結果からの「保存」操作時に AuthModal を表示 | auth §3.2 |

---

## 16. shadcn/ui コンポーネント利用一覧

| 検索 UI 要素 | shadcn/ui コンポーネント | カスタム拡張 |
|-------------|------------------------|-------------|
| 検索バー | `Command` + `Input` | pill shape, サジェストパネル統合 |
| オートコンプリート | `Command` + `CommandGroup` + `CommandItem` | 4カテゴリ構成、サムネイル表示 |
| 検索結果タブ | `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` | カウント表示 |
| フィルタドロップダウン | `Popover` + `Command` + `Checkbox` | multi-select / single-select |
| モバイルフィルタ | `Sheet` (side="bottom") | FilterBottomSheet として拡張 |
| 適用中フィルタ | `Badge` | ActiveFilterChip として拡張（削除ボタン付き） |
| ページネーション | `Pagination` | レスポンシブ対応 |
| ローディング | `Skeleton` | 検索結果カード形状 |
| エラー表示 | `Button` | 再試行ボタン |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成（競合分析・検索バー設計・オートコンプリート・フィルタリング・検索結果カード・アクセシビリティ・レスポンシブ設計） | designer |
