# ホーム画面 UI/UX: インタラクション・デザイントークン

> 元ファイル: [home-uiux-improvements.md](home-uiux-improvements.md) から分割（§5-8）

---

## 5. インタラクションデザイン詳細

### 5.1 ホバープレビュー

デスクトップで動画カードにホバーしたときの体験:

```
タイミング:
  0ms     → ホバー開始
  300ms   → サムネイルを animated gif に切替（フェード 300ms）
  300ms   → カードが微拡大 (scale: 1.02)
  0ms     → ホバー終了
  200ms   → 元のサムネイルに戻る
  200ms   → カードが元のサイズに戻る

Mux Animated Thumbnail API:
  image.mux.com/{playbackId}/animated.gif?width=640&start=2&end=7&fps=15

CSS:
  .video-card {
    transition: transform 150ms ease, box-shadow 150ms ease;
  }
  .video-card:hover {
    transform: scale(1.02);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }
  .video-card:hover .thumbnail-preview {
    opacity: 1;
    transition: opacity 300ms ease 300ms; /* 300ms delay */
  }
```

### 5.2 横スクロールカルーセル

```
Carousel Component
├── Navigation
│   ├── Left Arrow
│   │   ├── position: absolute, left: -20px, top: 50%
│   │   ├── width: 40px, height: 40px
│   │   ├── background: var(--color-surface)
│   │   ├── border: 1px solid var(--color-border)
│   │   ├── border-radius: 50%
│   │   ├── box-shadow: 0 4px 12px rgba(0,0,0,0.3)
│   │   ├── opacity: 0 → visible on hover container
│   │   └── z-index: 10
│   │
│   └── Right Arrow (same, right: -20px)
│
├── Scroll Behavior
│   ├── scroll-snap-type: x mandatory
│   ├── scroll-behavior: smooth
│   ├── -webkit-overflow-scrolling: touch
│   └── overscroll-behavior-x: contain
│
├── Scroll Indicator (desktop)
│   ├── position: absolute, bottom: -8px
│   ├── display: flex, gap: 4px, justify-content: center
│   ├── Dot
│   │   ├── width: 6px, height: 6px
│   │   ├── border-radius: 50%
│   │   ├── background: var(--color-border) (inactive)
│   │   └── background: var(--color-primary) (active)
│
└── Edge Gradient (scroll hint)
    ├── Right edge: linear-gradient(to left, var(--color-background), transparent)
    ├── width: 60px
    └── pointer-events: none
```

### 5.3 無限スクロール

```
InfiniteScroll
├── Trigger
│   ├── IntersectionObserver
│   ├── rootMargin: "0px 0px 400px 0px" (400px before visible)
│   └── threshold: 0
│
├── Loading State
│   ├── 4x Skeleton cards (same size as VideoCard)
│   ├── Skeleton
│   │   ├── Thumbnail: aspect-video, rounded-lg, animate-pulse
│   │   │   └── background: var(--color-surface-hover) with shimmer
│   │   ├── Title: h-4 w-3/4, rounded, animate-pulse
│   │   ├── Creator: h-3 w-1/2, rounded, animate-pulse
│   │   └── Tags: h-3 w-1/3, rounded, animate-pulse
│   │
│   └── Pulse Animation
│       ├── @keyframes pulse
│       ├── 0%: opacity 1
│       ├── 50%: opacity 0.5
│       └── 100%: opacity 1
│
└── End State
    ├── text: "すべての動画を表示しました"
    ├── font-size: 14px
    ├── color: var(--color-text-secondary)
    ├── text-align: center
    └── padding: 32px 0
```

---

## 6. デザイントークンまとめ（Figma Variables 対応）

### 6.1 カラー

| トークン名 | Light | Dark (default) | 用途 |
|-----------|-------|----------------|------|
| `color-primary` | `#6C5CE7` | `#6C5CE7` | ブランドカラー、CTA、AIバッジ |
| `color-secondary` | `#00B8B8` | `#00D2D3` | AIモデルタグ、セカンダリアクション |
| `color-accent` | `#E84393` | `#FD79A8` | テーマタグ、ハイライト |
| `color-background` | `#FAFBFC` | `#0D1117` | ページ背景 |
| `color-surface` | `#FFFFFF` | `#161B22` | カード、パネル背景 |
| `color-surface-hover` | `#F0F0F0` | `#1C2333` | ホバー時の背景 |
| `color-border` | `#D0D7DE` | `#30363D` | ボーダー |
| `color-text-primary` | `#1F2328` | `#F0F6FC` | メインテキスト |
| `color-text-secondary` | `#656D76` | `#8B949E` | サブテキスト |
| `color-quality-gold` | `#B8860B` | `#FFC107` | 品質スコア高 |
| `color-quality-silver` | `#6E7681` | `#8B949E` | 品質スコア中 |
| `color-quality-dim` | `#9CA3AF` | `#7A8390` | 品質スコア低 |
| `color-success` | `#1A7F37` | `#3FB950` | 成功表示 |
| `color-error` | `#CF222E` | `#F85149` | エラー表示 |

### 6.2 タイポグラフィ

| トークン名 | フォント | サイズ | Weight | Line Height | 用途 |
|-----------|---------|--------|--------|-------------|------|
| `heading-xl` | Space Grotesk | 28px | 700 | 1.2 | ページタイトル |
| `heading-lg` | Space Grotesk | 22px | 700 | 1.3 | セクションヘッダー |
| `heading-md` | Space Grotesk | 18px | 700 | 1.3 | サブセクション |
| `heading-sm` | Space Grotesk | 16px | 600 | 1.4 | カードタイトル |
| `body-lg` | Inter | 16px | 400 | 1.6 | 本文（大） |
| `body-md` | Inter | 14px | 400 | 1.5 | 本文（標準） |
| `body-sm` | Inter | 13px | 400 | 1.5 | 補助テキスト |
| `caption` | Inter | 12px | 400 | 1.4 | キャプション、メタ情報 |
| `label` | Inter | 11px | 500-600 | 1.3 | バッジ、タグ |

### 6.3 スペーシング

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `space-xs` | 4px | アイコンとテキストの間 |
| `space-sm` | 8px | バッジ内パディング、小要素間 |
| `space-md` | 12px | カード内パディング |
| `space-lg` | 16px | カード間ギャップ（モバイル）、セクション内余白 |
| `space-xl` | 24px | カード間ギャップ（デスクトップ）、ページ横パディング |
| `space-2xl` | 32px | セクション間余白（モバイル） |
| `space-3xl` | 48px | セクション間余白（デスクトップ） |

### 6.4 Border Radius

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `radius-sm` | 4px | Duration badge |
| `radius-md` | 6px | AI Badge |
| `radius-lg` | 8px | ボタン、入力フィールド |
| `radius-xl` | 12px | カード、モデルアイコン |
| `radius-2xl` | 16px | Hero Section、ムードカード |
| `radius-full` | 9999px | フィルタチップ（pill）、アバター |

### 6.5 シャドウ

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.1)` | 微細な浮遊感 |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.15)` | カルーセル矢印 |
| `shadow-lg` | `0 8px 32px rgba(0,0,0,0.3)` | ホバー時のカード |
| `shadow-xl` | `0 16px 48px rgba(0,0,0,0.4)` | モーダル、Hero |

### 6.6 アニメーション

| トークン名 | 値 | 用途 |
|-----------|-----|------|
| `duration-fast` | 150ms | ホバー、トランスフォーム |
| `duration-normal` | 200ms | サイドバー開閉 |
| `duration-slow` | 300ms | フェードイン/アウト、プレビュー切替 |
| `easing-default` | `ease` | 標準イージング |
| `easing-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | バウンス感のある動き |

---

## 7. 実装における shadcn/ui マッピング

| UI要素 | shadcn/ui コンポーネント | カスタム拡張 |
|--------|------------------------|-------------|
| フィルタチップ | `Toggle` or `ToggleGroup` | pill shape, color variants |
| カルーセル | `ScrollArea` + custom | scroll-snap, navigation arrows |
| 動画カード | `Card` | VideoCard として独自実装（Badge, Avatar統合） |
| ムードカード | なし（独自） | gradient背景の独自コンポーネント |
| AIモデルカード | `Card` | AIModelCard として拡張 |
| プロンプトカード | `Card` | PromptFeatureCard として拡張 |
| 品質スコア | `Badge` + `Progress` | QualityScoreBadge として拡張 |
| おすすめ理由 | なし（独自） | RecommendationReason として実装 |
| セクションヘッダー | なし（独自） | SectionHeader として実装 |
| Hero Section | なし（独自） | HeroSection として実装 |
| Skeleton | `Skeleton` | 各カードのバリエーション |

---

## 8. YouTube vs AI Theater 比較サマリ

| 観点 | YouTube | AI Theater |
|------|---------|------------|
| **コンテンツ発見** | アルゴリズム依存、ブラックボックス | 多軸フィルタ（品質、モデル、ムード）+ おすすめ理由の透明表示 |
| **品質指標** | 再生数・CTRのみ | Quality Score（5軸複合評価）+ いいね率 |
| **サムネイル** | クリエイター任意（釣りサムネ横行） | AI生成の正確なサムネイル + ホバープレビュー |
| **動画カード情報量** | タイトル + チャンネル + 再生数 | タイトル + Creator + スコア + モデル + テーマ + いいね率 |
| **ブラウジング** | カテゴリのみ | カテゴリ + AIモデル + ムード + プロンプト |
| **フィルタリング** | 最小限のチップ | 多軸フィルタチップ（トレンド/高品質/話題のプロンプト/新着/実験的/ムード） |
| **レイアウト** | 均一グリッド | Hero + カルーセル + グリッドのハイブリッド |
| **透明性** | なし | おすすめ理由の表示、AI生成情報の全面開示 |
| **広告** | 動画前後・途中に広告 | 広告なし or 非侵入型のみ |
| **エンゲージメント** | 滞在時間最大化 | 品質最大化 + 探索モード（バブル破壊） |
| **バブル対策** | なし | 探索モード（意図的に普段見ないジャンルを提案） |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-22 | 1.0 | 初版作成 | ux-designer |
| 2026-03-07 | 1.1 | [必須修正] おすすめ理由タイプにMVPフェーズ分類追加・home-recommendation-source.md 相互参照追加 | tech-leader |
