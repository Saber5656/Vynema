# 検索機能 Figma: 状態・アニメーション・アクセシビリティ

> 元ファイル: [search-design-spec.md](search-design-spec.md) から分割（§7-13）

---

## 7. 空状態・ローディング・エラー状態スペック

### 7.1 検索結果なし（SearchEmptyState）

```
SearchEmptyState
├── Container
│   ├── Display: flex, flex-direction: column, align-items: center
│   ├── Padding: 80px 24px (desktop) / 48px 16px (mobile)
│   ├── Text-align: center
│   │
│   ├── Icon: Lucide SearchX, 64px (desktop) / 48px (mobile)
│   │   └── Color: #30363D
│   │
│   ├── Title: "「{query}」に一致する結果がありません"
│   │   ├── Font: Space Grotesk, 20px (desktop) / 16px (mobile), weight 700
│   │   ├── Color: #F0F6FC
│   │   └── Margin-top: 16px
│   │
│   ├── Suggestions (flex column, gap: 6px, margin-top: 16px)
│   │   ├── "・キーワードの綴りを確認してください"
│   │   ├── "・より一般的なキーワードで検索してください"
│   │   ├── "・AIモデル名（Runway, Sora 等）で検索してみてください"
│   │   └── "・ムード（Calm, Dreamy 等）で探してみてください"
│   │       └── Font: Inter, 14px, weight 400, #8B949E
│   │
│   ├── Separator: 1px solid #30363D, width: 200px, margin: 24px 0
│   │
│   └── CTA Buttons (flex, gap: 12px)
│       ├── "トレンド動画を見る" Button (variant="outline", h=36)
│       └── "ホームに戻る" Button (variant="outline", h=36)
```

### 7.2 フィルタ結果なし

```
FilterEmptyState
├── Container: flex column, align-items: center, padding: 48px 24px
├── Icon: Lucide Filter, 48px, #8B949E
├── Title: "この条件に一致する動画がありません"
│   └── Inter, 16px, 600, #F0F6FC, margin-top: 16px
├── Sub: "フィルタ条件を変更してお試しください"
│   └── Inter, 14px, #8B949E, margin-top: 8px
└── "フィルタをリセット" Button (variant="outline", size="sm", mt: 16px)
```

### 7.3 検索エラー

```
SearchErrorState
├── Container: flex column, align-items: center, padding: 80px 24px
├── Icon: Lucide AlertTriangle, 48px, #F85149
├── Title: "検索中にエラーが発生しました"
│   └── Inter, 16px, 600, #F0F6FC, margin-top: 16px
├── Sub: "しばらくしてからもう一度お試しください"
│   └── Inter, 14px, #8B949E, margin-top: 8px
└── "再試行" Button (variant="outline", mt: 16px)
```

### 7.4 ローディング（Skeleton）

```
SearchLoadingSkeleton
├── Container: max-width: 1200px, margin: 0 auto
│
└── SkeletonCard x 6
    ├── Display: flex, gap: 16px (desktop) / 12px (mobile)
    ├── Padding: 16px 0
    ├── Border-bottom: 1px solid #30363D
    │
    ├── Thumbnail Skeleton
    │   ├── Width: 360px (desktop) / 160px (mobile)
    │   ├── Aspect-ratio: 16/9
    │   ├── Border-radius: 8px
    │   └── Background: shimmer (§8.2 参照)
    │
    └── Info Skeleton
        ├── Title: h=16px, w=75%, border-radius: 4px, shimmer
        ├── Stats: h=12px, w=50%, border-radius: 4px, shimmer, mt=8px
        ├── Tags: h=12px, w=40%, border-radius: 4px, shimmer, mt=8px
        └── Desc: h=12px, w=90%, border-radius: 4px, shimmer, mt=8px
            + h=12px, w=60%, shimmer, mt=4px
```

---

## 8. アニメーション / トランジション仕様

### 8.1 共有アニメーション（home-design-spec.md §7 を継承）

| アニメーション | Duration | Easing | 用途 |
|-------------|---------|--------|------|
| ホバーバックグラウンド | 150ms | ease | 検索結果カード、サジェスト項目 |
| ホバーサムネイルプレビュー | 300ms | ease (delay 300ms) | VideoSearchResultCard |
| フィルタチップ切り替え | 150ms | ease | FilterChip active/inactive |
| ボタン press | 100ms | ease | scale(0.98) |
| フォーカスリング | 0ms (instant) | -- | focus-visible outline |

### 8.2 検索機能固有アニメーション

```css
/* SearchSuggestionPanel 表示 */
@keyframes suggestionSlideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.suggestion-panel-enter {
  animation: suggestionSlideDown 150ms ease-out;
}

/* SearchSuggestionPanel 非表示 */
@keyframes suggestionSlideUp {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
.suggestion-panel-exit {
  animation: suggestionSlideUp 100ms ease-in;
}

/* MobileSearchOverlay 表示 */
@keyframes mobileSearchEnter {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.mobile-search-enter {
  animation: mobileSearchEnter 200ms ease;
}

/* FilterBottomSheet 表示 (shadcn/ui Sheet 標準) */
/* → shadcn/ui Sheet デフォルトアニメーションを使用 */

/* タブコンテンツ切り替え */
.tab-content[data-state="active"] {
  animation: tabFadeIn 150ms ease;
}
@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Skeleton shimmer (home-design-spec.md §7.2 を再利用) */
.skeleton {
  background: linear-gradient(
    90deg,
    #161B22 25%,
    #1C2333 50%,
    #161B22 75%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
}

/* ActiveFilterChip 削除 */
@keyframes chipRemove {
  to {
    opacity: 0;
    transform: scale(0.8);
    max-width: 0;
    padding: 0;
    margin: 0;
  }
}
.chip-remove {
  animation: chipRemove 200ms ease forwards;
}
```

### 8.3 prefers-reduced-motion 対応

```css
@media (prefers-reduced-motion: reduce) {
  .suggestion-panel-enter,
  .suggestion-panel-exit,
  .mobile-search-enter,
  .tab-content,
  .chip-remove,
  .skeleton {
    animation: none;
    transition: none;
    opacity: 1;
    transform: none;
  }
}
```

---

## 9. ページネーション スペック

```
Pagination (shadcn/ui Pagination)
├── Container
│   ├── Display: flex, justify-content: center, align-items: center
│   ├── Padding: 24px 0 40px
│   ├── Gap: 4px
│
├── PaginationItem (ページ番号)
│   ├── Width: 36px, Height: 36px
│   ├── Border-radius: 8px
│   ├── Display: flex, align-items: center, justify-content: center
│   ├── Font: Inter, 14px, weight 500
│   ├── Cursor: pointer
│   │
│   ├── Default: bg transparent, color #8B949E
│   ├── Hover: bg #1C2333, color #F0F6FC
│   ├── Active (current): bg #6C5CE7, color #FFFFFF
│   └── Focus-visible: outline 2px solid #8B7CF8, offset 2px
│
├── PaginationNav (前へ / 次へ)
│   ├── Display: flex, align-items: center, gap: 4px
│   ├── Height: 36px
│   ├── Padding: 0 12px
│   ├── Border-radius: 8px
│   ├── Font: Inter, 14px, weight 500
│   ├── Default: bg transparent, color #8B949E
│   ├── Hover: bg #1C2333, color #F0F6FC
│   ├── Disabled: color #30363D, cursor: not-allowed
│   ├── Icon: Lucide ChevronLeft / ChevronRight, 16px
│   └── Content: "< 前へ" / "次へ >"
│
├── Ellipsis: "...", 14px, #7A8390
│
└── Responsive:
    ├── Desktop: [< 前へ] [1] [2] [3] ... [40] [41] [42] [次へ >]
    ├── Tablet: [< 前へ] [1] [2] [3] [4] [5] [次へ >]
    └── Mobile: [< 前へ] [{current}] [次へ >]
```

---

## 10. アクセシビリティ

### 10.1 コントラスト比サマリ（検索機能固有）

| 要素 | 前景色 | 背景色 | 比率 | AA判定 |
|------|--------|--------|------|--------|
| SearchBar placeholder | #7A8390 | #161B22 | 4.62:1 | **PASS** |
| SearchBar text | #F0F6FC | #161B22 | 15.89:1 | **PASS** |
| Query highlight | #8B7CF8 | #0D1117 | 5.71:1 | **PASS** |
| Result header meta | #8B949E | #0D1117 | 6.15:1 | **PASS** |
| Tab active | #F0F6FC | #0D1117 | 17.39:1 | **PASS** |
| Tab inactive | #8B949E | #0D1117 | 6.15:1 | **PASS** |
| Card title | #F0F6FC | #0D1117 | 17.39:1 | **PASS** |
| Card meta | #8B949E | #0D1117 | 6.15:1 | **PASS** |
| MatchReason | #8B7CF8 | #0D1117 | 5.71:1 | **PASS** |
| ActiveFilterChip | #8B7CF8 | rgba(108,92,231,0.12)+#0D1117 | ~5.5:1 | **PASS** |
| ModelBadge text | #00D2D3 | #1C2333 | ~7.5:1 | **PASS** |
| Prompt highlight text | #F0F6FC | rgba(108,92,231,0.25)+#161B22 | ~10:1 | **PASS** |
| FilterDropdown option | #F0F6FC | #161B22 | 15.89:1 | **PASS** |
| Suggestion item text | #F0F6FC | #161B22 | 15.89:1 | **PASS** |
| Keyboard hint | #7A8390 | #161B22 | 4.62:1 | **PASS** |
| Pagination active | #FFFFFF | #6C5CE7 | 4.86:1 | **PASS** |

### 10.2 ARIA / フォーカス チェックリスト

```
SearchBar:
├── [x] Container: role="search", aria-label="動画・AIモデル・プロンプトを検索"
├── [x] Input: role="combobox", aria-expanded={isSuggestionOpen}
│       aria-controls="suggestion-panel", aria-autocomplete="list"
├── [x] Clear Button: aria-label="検索をクリア"
├── [x] Submit Button: aria-label="検索を実行"
├── [x] Focus: "/" or "Ctrl+K" でフォーカス移動
└── [x] Escape: サジェスト閉じ + フォーカス維持

SearchSuggestionPanel:
├── [x] id="suggestion-panel", role="listbox"
├── [x] Section: role="group", aria-label="{sectionLabel}"
├── [x] SuggestionItem: role="option", aria-selected={isActive}
├── [x] Arrow keys: 上下でナビゲーション
├── [x] Enter: 選択実行
└── [x] Remove Button: aria-label="「{query}」を削除"

SearchResultTabs:
├── [x] role="tablist" + role="tab" + aria-selected (shadcn/ui Tabs 標準)
└── [x] Arrow keys: 左右でタブ切り替え

FilterBar:
├── [x] FilterDropdown: aria-haspopup="listbox", aria-expanded
├── [x] FilterBottomSheet: role="dialog", aria-label="検索フィルタ"
│       + フォーカストラップ + Escape で閉じる
├── [x] Checkbox: aria-checked (shadcn/ui 標準)
└── [x] ActiveFilterChip Remove: aria-label="{label} フィルタを解除"

SearchResults:
├── [x] <h1> に "「{query}」の検索結果" を設定
├── [x] 検索完了時: aria-live="polite" で件数通知
├── [x] フィルタ変更時: aria-live="polite" で件数通知
├── [x] エラー: aria-live="assertive" + role="alert"
├── [x] ローディング: aria-busy="true", aria-label="検索結果を読み込み中"
└── [x] Pagination: <nav aria-label="検索結果のページネーション">

Focus Ring (全要素共通):
├── outline: 2px solid #8B7CF8
├── outline-offset: 2px
└── border-radius: 4px (context に応じて調整)
```

---

## 11. shadcn/ui コンポーネントマッピング

| UI 要素 | shadcn/ui コンポーネント | カスタム拡張 |
|--------|------------------------|-------------|
| SearchBar | `Command` + `Input` | pill shape, Submit ボタン, キーボードヒント |
| SearchSuggestionPanel | `Command` + `CommandGroup` + `CommandItem` | 4カテゴリ, サムネイル表示 |
| MobileSearchOverlay | なし（独自） | フルスクリーン fixed overlay |
| SearchResultTabs | `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | カウントバッジ |
| FilterDropdown | `Popover` + `Command` + `Checkbox` | multi/single select |
| FilterBottomSheet | `Sheet` (side="bottom") | フィルタ全種表示, Apply/Reset |
| ActiveFilterChips | `Badge` 拡張 | 削除ボタン付き, primary-text カラー |
| Sort Select | `Select` + `SelectTrigger` | sm サイズ |
| Pagination | `Pagination` | レスポンシブ対応 |
| Skeleton | `Skeleton` | 検索結果カード形状 |
| EmptyState | `Button` | 再試行・CTA ボタン |

---

## 12. コンポーネント一覧（Figma Component Set）

### 12.1 新規コンポーネント

| コンポーネント名 | Figma フレーム名 | 状態バリアント |
|--------------|---------------|-------------|
| `SearchBar` | Search/SearchBar | Default, Hover, Focus, Filled |
| `MobileSearchOverlay` | Search/MobileSearchOverlay | Default |
| `SearchSuggestionPanel` | Search/SuggestionPanel | Empty, WithResults |
| `SuggestionItem` | Search/SuggestionItem | Default, Hover, Active |
| `VideoSuggestionItem` | Search/VideoSuggestionItem | Default, Hover |
| `ModelChip` | Search/ModelChip | Default, Hover |
| `SearchResultHeader` | Search/ResultHeader | WithResults, NoResults |
| `SearchResultTabs` | Search/ResultTabs | Videos, Channels, Prompts |
| `FilterBar` | Search/FilterBar | Desktop, Mobile |
| `FilterDropdown` | Search/FilterDropdown | Closed, Open, Active |
| `FilterBottomSheet` | Search/FilterBottomSheet | Default |
| `ActiveFilterChips` | Search/ActiveFilterChips | Default |
| `VideoSearchResultCard` | Search/VideoResultCard | Default, Hover, Focus |
| `ChannelSearchCard` | Search/ChannelResultCard | Default, Hover |
| `PromptSearchCard` | Search/PromptResultCard | Default, Hover |
| `SearchEmptyState` | Search/EmptyState | NoResults, FilterEmpty, Error |
| `SearchLoadingSkeleton` | Search/LoadingSkeleton | Default |

### 12.2 再利用コンポーネント（既存スペック参照）

| コンポーネント名 | 参照元スペック | 再利用箇所 |
|--------------|-------------|-----------|
| `Header` | home-design-spec.md §5.1 | 検索バーを含むヘッダー |
| `VideoCard [list]` | home-design-spec.md §5.3 | VideoSearchResultCard ベース |
| `AIBadge` | home-design-spec.md §5.3 | 検索結果サムネイル上 |
| `QualityBadge [compact]` | home-design-spec.md §5.3 | 検索結果カード内 |
| `FilterChip` | home-design-spec.md §5.7 | FilterBottomSheet 内 |
| `MoodTag` | channel-design-spec.md §6.3 | SuggestionPanel ムードセクション |
| `Button [primary/outline/ghost]` | home-design-spec.md §6.2 | 各種ボタン |
| `Skeleton` | home-design-spec.md §6.1 | SearchLoadingSkeleton |
| `BottomNav` | home-design-spec.md §5.9 | モバイル検索結果ページ |

---

## 13. 実装優先度まとめ（Figma スペック対応）

| コンポーネント | 優先度 | Figma フレーム |
|--------------|--------|--------------|
| SearchBar (desktop + mobile icon) | **P0** | Desktop + Mobile |
| SearchResultHeader | **P0** | Desktop + Mobile |
| SearchResultTabs | **P0** | Desktop + Mobile |
| VideoSearchResultCard | **P0** | Desktop + Mobile |
| FilterBar (AIモデル + 並び替え) | **P0** | Desktop |
| Pagination | **P0** | Desktop + Mobile |
| SearchEmptyState + SearchErrorState | **P0** | Desktop + Mobile |
| SearchLoadingSkeleton | **P0** | Desktop + Mobile |
| SearchSuggestionPanel | **P1** | Desktop + Mobile |
| MobileSearchOverlay | **P1** | Mobile |
| FilterDropdown (全6種) | **P1** | Desktop |
| FilterBottomSheet | **P1** | Mobile |
| ActiveFilterChips | **P1** | Desktop + Mobile |
| ChannelSearchCard | **P1** | Desktop + Mobile |
| PromptSearchCard + Keyword Highlight | **P1** | Desktop + Mobile |
| FilterBar mobile trigger + count badge | **P1** | Mobile |
| Keyboard Shortcut Hint (`/`, `Ctrl+K`) | **P2** | Desktop |
| MatchReason 表示 | **P2** | Desktop + Mobile |
| Hover Preview (animated thumbnail) | **P2** | Desktop |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成（SearchBar・SuggestionPanel・検索結果ページ・フィルタ・結果カード・空状態・ページネーション・アクセシビリティ・アニメーション） | designer |
