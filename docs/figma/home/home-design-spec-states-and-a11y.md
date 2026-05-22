# ホーム画面 Figma: 状態・アニメーション・アクセシビリティ

> 元ファイル: [home-design-spec.md](home-design-spec.md) から分割（§6-8）

---

## 6. 状態バリエーション

### 6.1 VideoCard 全状態

```
States:
├── Default
│   ├── Border: 1px solid #30363D
│   ├── Transform: scale(1)
│   └── Box-shadow: none
│
├── Hover (desktop only)
│   ├── Border: 1px solid #484F58
│   ├── Transform: scale(1.02)
│   ├── Box-shadow: 0 8px 32px rgba(0,0,0,0.3)
│   ├── Animated thumbnail visible (delay 300ms)
│   └── Transition: 150ms ease
│
├── Focus-visible
│   ├── Outline: 2px solid #8B7CF8
│   ├── Outline-offset: 2px
│   └── Transform: none (no scale)
│
├── Active (press)
│   ├── Transform: scale(0.98)
│   └── Transition: 100ms ease
│
├── Loading (Skeleton)
│   ├── Thumbnail: aspect-video bg rounded-lg, shimmer animation
│   ├── Title: h-4 w-[75%] rounded bg, shimmer
│   ├── Creator: h-3 w-[50%] rounded bg, shimmer
│   ├── Tags: h-3 w-[30%] rounded bg, shimmer
│   ├── Shimmer color: var(--color-surface-hover) = #1C2333
│   └── Animation: pulse 2s ease-in-out infinite
│
└── Error (failed to load)
    ├── Thumbnail: placeholder icon (Lucide ImageOff, 32px, text-tertiary)
    ├── Background: var(--color-surface)
    └── Text: "読み込みに失敗しました" (caption, text-tertiary)
```

### 6.2 Button 全状態

```
Button [variant="primary"]
├── Default
│   ├── Background: #6C5CE7
│   ├── Color: #FFFFFF
│   └── Border: none
│
├── Hover
│   ├── Background: #7B6BF0
│   └── Transition: 150ms ease
│
├── Active (press)
│   ├── Background: #5A4AD6
│   └── Transform: scale(0.98)
│
├── Focus-visible
│   ├── Outline: 2px solid #8B7CF8
│   └── Outline-offset: 2px
│
├── Disabled
│   ├── Background: #30363D
│   ├── Color: #7A8390
│   ├── Cursor: not-allowed
│   └── Opacity: 0.6
│
└── Loading
    ├── Background: #6C5CE7 (same)
    ├── Content: Spinner icon (16px, #FFFFFF, animate-spin)
    └── Pointer-events: none


Button [variant="outline"]
├── Default
│   ├── Background: transparent
│   ├── Border: 1px solid #484F58
│   └── Color: #F0F6FC
│
├── Hover
│   ├── Background: #1C2333
│   └── Border-color: #8B949E
│
├── Active
│   ├── Background: #161B22
│   └── Transform: scale(0.98)
│
├── Focus-visible
│   └── Same as primary
│
└── Disabled
    ├── Border-color: #30363D
    ├── Color: #7A8390
    └── Opacity: 0.6


Button [variant="ghost"]
├── Default
│   ├── Background: transparent
│   ├── Border: none
│   └── Color: #8B949E
│
├── Hover
│   ├── Background: #1C2333
│   └── Color: #F0F6FC
│
└── Active
    └── Background: #161B22
```

### 6.3 Search Bar 全状態

```
SearchBar
├── Default
│   ├── Background: #161B22
│   ├── Border: 1px solid #30363D
│   └── Placeholder: #7A8390
│
├── Hover
│   └── Border-color: #484F58
│
├── Focus
│   ├── Border-color: #8B7CF8
│   ├── Box-shadow: 0 0 0 2px rgba(139, 124, 248, 0.25)
│   └── Placeholder: hidden (label visible)
│
├── Filled
│   ├── Color: #F0F6FC
│   └── Clear button visible (X icon, right side)
│
└── With Suggestions (dropdown)
    ├── Dropdown background: #21262D
    ├── Border: 1px solid #30363D
    ├── Border-radius: 12px
    ├── Box-shadow: 0 16px 48px rgba(0,0,0,0.4)
    ├── Max-height: 400px
    ├── Suggestion item
    │   ├── Padding: 8px 16px
    │   ├── Font: Inter, 14px
    │   ├── Hover: background #1C2333
    │   └── Icon: Lucide Search, 16px, text-secondary
    └── Shadow: 0 16px 48px rgba(0,0,0,0.4)
```

### 6.4 空状態（Empty State）

```
EmptyState
├── Container
│   ├── Display: flex, flex-direction: column, align-items: center
│   ├── Padding: 64px 24px
│   ├── Text-align: center
│   │
│   ├── Icon
│   │   ├── Lucide icon (context dependent), 48px
│   │   ├── Color: var(--color-text-tertiary) = #7A8390
│   │   └── Margin-bottom: 16px
│   │
│   ├── Title
│   │   ├── Font: Space Grotesk, 18px, weight 700
│   │   ├── Color: var(--color-text-primary) = #F0F6FC
│   │   └── Margin-bottom: 8px
│   │
│   ├── Description
│   │   ├── Font: Inter, 14px, weight 400
│   │   ├── Color: var(--color-text-secondary) = #8B949E
│   │   ├── Max-width: 400px
│   │   └── Margin-bottom: 24px
│   │
│   └── Action Button (optional)
│       └── Button variant="primary"

Contexts:
├── No search results
│   ├── Icon: Lucide SearchX
│   ├── Title: "検索結果が見つかりませんでした"
│   └── Description: "別のキーワードで検索してみてください"
│
├── No videos in category
│   ├── Icon: Lucide Film
│   ├── Title: "まだ動画がありません"
│   └── Description: "このカテゴリの動画はまもなく追加されます"
│
├── No subscription videos
│   ├── Icon: Lucide Rss
│   ├── Title: "購読中のチャンネルがありません"
│   ├── Description: "AIチャンネルを探して購読しましょう"
│   └── Action: "チャンネルを探す"
│
└── Error state
    ├── Icon: Lucide AlertTriangle
    ├── Title: "読み込みに失敗しました"
    ├── Description: "しばらくしてからもう一度お試しください"
    └── Action: "再読み込み"
```

---

## 7. アニメーション / トランジション仕様

### 7.1 トランジション一覧

| 要素 | プロパティ | Duration | Easing | Delay | Tailwind |
|------|-----------|----------|--------|-------|----------|
| カードホバー | transform, box-shadow, border-color | 150ms | ease | 0 | `transition-all duration-150` |
| サムネイルプレビュー | opacity | 300ms | ease | 300ms (hover) | `transition-opacity duration-300 delay-300` |
| サイドバー開閉 | width | 200ms | ease | 0 | `transition-[width] duration-200` |
| フィルタチップ | background, border-color, color | 150ms | ease | 0 | `transition-colors duration-150` |
| ボタンpress | transform | 100ms | ease | 0 | `active:scale-[0.98] transition-transform duration-100` |
| ムードカードホバー | transform | 200ms | ease | 0 | `transition-transform duration-200` |
| カルーセル矢印表示 | opacity | 200ms | ease | 0 | `transition-opacity duration-200` |
| ドロップダウン開閉 | opacity, transform | 150ms | ease-out | 0 | shadcn/ui 標準 |
| ページ遷移 | opacity | 200ms | ease | 0 | Next.js App Router |
| フォーカスリング | outline | 0ms (instant) | — | 0 | `focus-visible:outline` |

### 7.2 Skeleton ローディングアニメーション

```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
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

### 7.3 AI Badge フェードイン（動画再生開始時オーバーレイ）

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

### 7.4 スクロールトリガーアニメーション（セクション登場）

```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.section-enter {
  animation: slideUp 400ms ease-out forwards;
}

/* prefers-reduced-motion 対応 */
@media (prefers-reduced-motion: reduce) {
  .section-enter {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .skeleton {
    animation: none;
  }
}
```

---

## 8. アクセシビリティチェックリスト

### 8.1 コントラスト比サマリ

| 要素 | 前景色 | 背景色 | 比率 | AA判定 |
|------|--------|--------|------|--------|
| メインテキスト | #F0F6FC | #0D1117 | 17.39:1 | **PASS** |
| メインテキスト (on surface) | #F0F6FC | #161B22 | 15.89:1 | **PASS** |
| サブテキスト | #8B949E | #0D1117 | 6.15:1 | **PASS** |
| サブテキスト (on surface) | #8B949E | #161B22 | 5.62:1 | **PASS** |
| プライマリテキスト | #8B7CF8 | #0D1117 | 5.71:1 | **PASS** |
| プライマリテキスト (on surface) | #8B7CF8 | #161B22 | 5.22:1 | **PASS** |
| 白テキスト on ボタン | #FFFFFF | #6C5CE7 | 4.86:1 | **PASS** |
| セカンダリテキスト | #00D2D3 | #0D1117 | 10.06:1 | **PASS** |
| アクセントテキスト | #FD79A8 | #0D1117 | 7.64:1 | **PASS** |
| Quality Gold | #FFC107 | #0D1117 | 11.61:1 | **PASS** |
| 最小テキスト (on background) | #7A8390 | #0D1117 | **5.05:1** | **PASS** |
| 最小テキスト (on surface) | #7A8390 | #161B22 | **4.62:1** | **PASS** |
| AI Badge 白文字 | #FFFFFF | #6C5CE7@85% | ~4.1:1 | PASS (large) |

### 8.2 実装チェック項目

- [ ] すべてのインタラクティブ要素に `focus-visible` スタイルがある
- [ ] `focus-visible` のリング色 `#8B7CF8` が背景上で十分視認可能
- [ ] 画像にすべて `alt` テキストが設定されている
- [ ] カルーセルの矢印ボタンに `aria-label` がある
- [ ] フィルタチップに `aria-pressed` 状態がある
- [ ] 動画カードに `role="article"` と適切な構造がある
- [ ] Skeleton ローディング中に `aria-busy="true"` が設定されている
- [ ] 空状態のテキストがスクリーンリーダーで読み上げ可能
- [ ] `prefers-reduced-motion` でアニメーション無効化されている
- [ ] 動画カード内のテキストが最小フォントサイズ 11px を下回っていない
- [ ] すべてのテキストカラーがコントラスト比 4.5:1 以上（上記表で検証済み）

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-22 | 1.0 | 初版作成（カラーコントラスト修正 + 全コンポーネントスペック） | ux-designer |
