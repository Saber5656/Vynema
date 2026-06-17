# AIチャンネルページ Figma: インタラクション・アクセシビリティ

> 元ファイル: [channel-design-spec.md](channel-design-spec.md) から分割（§7-12）

---

## 7. トップ動画タブ コンポーネント詳細

### 7.1 TopVideosTab

```
TopVideosTab
├── Max-width: 1200px, Margin: 0 auto
├── Padding: 24px
│
├── Section Header
│   ├── Display: flex, align-items: center, gap: 12px
│   ├── Margin-bottom: 24px
│   ├── Title: "⭐ Quality Score ランキング"
│   │   ├── Font: Space Grotesk, 20px, weight 700, color: #F0F6FC
│   └── Sub: "{channelName} の高評価作品"
│       ├── Font: Inter, 14px, weight 400, color: #8B949E
│
├── Top 3 Grid (desktop: 3col / mobile: 1col)
│   ├── Display: grid, grid-template-columns: repeat(3, 1fr) (≥768px) / 1fr (<768px)
│   ├── Gap: 16px (desktop) / 12px (mobile)
│   └── RankedVideoCard [variant="featured"] × 3
│
└── Rank 4+ List (compact)
    ├── Display: flex, flex-direction: column, gap: 0
    ├── Margin-top: 24px
    └── RankedVideoCard [variant="compact"] × N
        ├── Padding: 12px 0
        └── Border-bottom: 1px solid #30363D
```

### 7.2 RankedVideoCard

```
RankedVideoCard [variant="featured"] (Rank 1-3)
├── Position: relative
├── ← VideoCard [variant="grid"] をベースに拡張
│
└── Rank Badge (absolute)
    ├── Position: absolute, top: 12px, left: 12px, z-index: 2
    ├── Width: 32px, Height: 32px
    ├── Border-radius: 50%
    ├── Display: flex, align-items: center, justify-content: center
    ├── Font: Space Grotesk, 16px, weight 800
    ├── Rank 1: Background #FFC107 (gold), color #0D1117
    ├── Rank 2: Background #8B949E (silver), color #0D1117
    └── Rank 3: Background #B08B5A (bronze), color #0D1117


RankedVideoCard [variant="compact"] (Rank 4+)
├── Display: flex, align-items: center, gap: 16px
├── Padding: 12px 0
├── Border-bottom: 1px solid #30363D
│
├── Rank Number
│   ├── Min-width: 28px
│   ├── Text-align: right
│   ├── Font: Space Grotesk, 20px, weight 700, color: #8B949E
│   └── Flex-shrink: 0
│
├── Thumbnail (120 × 68px)
│   ├── Width: 120px, Height: 68px (16:9)
│   ├── Border-radius: 6px
│   ├── Object-fit: cover
│   └── Flex-shrink: 0
│
└── Info Area (flex: 1)
    ├── Title: line-clamp-2, 14px, weight 600, #F0F6FC
    ├── Quality Score: "⭐ {score}" (12px, #FFC107)
    ├── Views: "{views}K views", 12px, #8B949E
    └── Model Badge: <Badge> 11px, #00D2D3
```

---

## 8. インタラクション・アニメーション仕様

### 8.1 共有アニメーション（home-design-spec.md §7 を継承）

| アニメーション | Duration | Easing | 用途 |
|-------------|---------|--------|------|
| ホバートランスフォーム | 150ms | ease | VideoCard scale(1.02) |
| フェードイン/アウト | 200ms | ease | タブコンテンツ切り替え |
| サイドバー開閉 | 200ms | ease | (ホームから流用) |
| カルーセルスクロール | 300ms | ease | スムーズスクロール |

### 8.2 チャンネルページ固有アニメーション

```css
/* Subscribe ボタン: 購読完了時 */
.subscribe-btn--success {
  animation: subscribeSuccess 600ms ease;
}
@keyframes subscribeSuccess {
  0%   { transform: scale(1); }
  30%  { transform: scale(1.1); }
  60%  { transform: scale(0.95); }
  100% { transform: scale(1); }
}

/* Quality Score Gauge: ページ表示時にアニメーション */
.quality-gauge-fill {
  animation: gaugeGrow 800ms ease 200ms both;
}
@keyframes gaugeGrow {
  from { width: 0; }
  to   { width: var(--target-width); }
}

/* FilterChip アクティブ切り替え */
.filter-chip {
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}

/* Tab コンテンツ切り替え */
.tab-content[data-state="active"] {
  animation: tabFadeIn 150ms ease;
}
@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* StatCard 数値カウントアップ */
/* ← 実装任意: JS Intersection Observer + Counter Animation */
/* Duration: 1000ms, easing: ease-out */
```

### 8.3 ホバー状態まとめ

| 要素 | Hover 変化 | Duration |
|------|-----------|---------|
| VideoCard | scale(1.02) + box-shadow 0 8px 32px rgba(0,0,0,0.3) | 150ms |
| FilterChip | bg #1C2333, color #F0F6FC | 150ms |
| Subscribe Button | bg #7B6BF0 (primary-hover) | 150ms |
| TabsTrigger | color #F0F6FC | 150ms |
| MoodTag | opacity: 0.85 | 150ms |
| RankedVideoCard compact | bg rgba(255,255,255,0.03) | 150ms |

---

## 9. アクセシビリティ要件

> 準拠基準: WCAG 2.1 Level AA

### 9.1 カラーコントラスト（全箇所 4.5:1 以上を遵守）

| 要素 | テキスト色 | 背景色 | 比率 | 判定 |
|------|----------|--------|------|------|
| チャンネル名 | #F0F6FC | #0D1117 | 17.39:1 | ✅ |
| AI Model Badge テキスト | #00D2D3 | rgba(0,210,211,0.12) + #0D1117 | ~9.0:1 | ✅ |
| Description | #8B949E | #0D1117 | 6.15:1 | ✅ |
| StatCard 数値 | #F0F6FC | #1C2333 | ~13.5:1 | ✅ |
| StatCard ラベル | #8B949E | #1C2333 | ~4.63:1 | ✅ |
| MoodTag Calm | #667EEA | #161B22 | ~4.55:1 | ✅ |
| MoodTag Energetic | #F093FB | #161B22 | ~7.50:1 | ✅ |
| MoodTag Dreamy | #4FACFE | #161B22 | ~7.68:1 | ✅ |
| MoodTag Fun | #43E97B | #161B22 | ~8.31:1 | ✅ |
| MoodTag Zen | #A18CD1 | #161B22 | ~5.02:1 | ✅ |
| MoodTag Mystic | #8B7CF8 | #161B22 | ~5.22:1 | ✅ |
| TabsTrigger active | #F0F6FC | transparent+#0D1117 | 17.39:1 | ✅ |
| Quality Gold text | #FFC107 | #1C2333 | ~8.97:1 | ✅ |
| text-tertiary | #7A8390 | #0D1117 | 5.05:1 | ✅ |
| text-tertiary | #7A8390 | #161B22 | 4.62:1 | ✅ |

### 9.2 キーボード・スクリーンリーダー対応

| 要素 | ARIA 実装 |
|------|----------|
| ChannelTabBar | `role="tablist"` + `role="tab"` + `aria-selected` (shadcn/ui Tabs 標準) |
| Subscribe Button | `aria-pressed={isSubscribed}` |
| MoodFilterBar | `role="group"` + `aria-label="ムードフィルタ"` |
| FilterChip | `aria-pressed={isActive}` |
| StatCard QualityScore | `role="meter"` + `aria-valuenow` + `aria-valuemin="0"` + `aria-valuemax="100"` |
| Quality Gauge | `role="progressbar"` + `aria-valuenow` |
| AIAgentSpecsPanel (collapsible 部分) | shadcn/ui Collapsible 標準 `aria-expanded` + `aria-controls` |
| RankedVideoCard | `aria-label="ランキング {rank}位: {title}"` |
| Empty State | `aria-live="polite"` でフィルタ結果なしを読み上げ |
| ChannelDescription Toggle | `aria-expanded={isExpanded}` |

### 9.3 フォーカス管理

```css
/* 全インタラクティブ要素に統一フォーカスリング */
:focus-visible {
  outline: 2px solid #8B7CF8;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Subscribe Button のフォーカス */
.subscribe-btn:focus-visible {
  outline: 2px solid #8B7CF8;
  outline-offset: 2px;
  border-radius: 8px;
}
```

---

## 10. shadcn/ui コンポーネントマッピング

| UI 要素 | shadcn/ui コンポーネント | カスタム拡張 |
|--------|------------------------|-------------|
| ChannelTabBar | `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | アクティブ下線スタイル |
| Subscribe Button | `Button` variant="default" / "outline" | 購読状態切り替え |
| More Button | `DropdownMenu` + `Button` variant="ghost" | — |
| SortControls | `Select` + `SelectTrigger` | サイズ sm カスタム |
| FilterChip | `Toggle` または `Button` | pill shape カスタム |
| MoodTag | `Badge` variant="outline" | ムード別カラー |
| StatCard | `Card` | StatCard として独自 |
| AIAgentSpecsPanel collapsible | `Collapsible` | Bot アイコン付きトリガー |
| ChannelDescription toggle | `Collapsible` | テキスト truncate + 展開 |
| Empty State icon | `Lucide VideoOff` | — |
| Loading Skeleton | `Skeleton` | VideoCard shape |
| More Dropdown | `DropdownMenu` | — |

---

## 11. データフロー・Quality Score 変換ルール

### 11.1 Quality Score スケール変換（全箇所統一）

```typescript
// DB 値 (integer 0-100) → UI 表示値 (float 0.0-5.0)
const toUIScore = (dbScore: number): string =>
  (dbScore / 20).toFixed(1)

// 例:
// DB: 92 → UI: "4.6" (⭐ 4.6 → gold #FFC107)
// DB: 74 → UI: "3.7" (⭐ 3.7 → silver #8B949E)
// DB: 48 → UI: "2.4" (⭐ 2.4 → dim #7A8390)

// Quality Score 色分け
const qualityColor = (dbScore: number): string => {
  const ui = dbScore / 20
  if (ui >= 4.0) return '#FFC107' // gold
  if (ui >= 3.0) return '#8B949E' // silver
  return '#7A8390'                // dim
}
```

### 11.2 数値フォーマット

```typescript
// 再生数・購読者数: K / M 単位
const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// 総生成時間: 秒 → 時間・分
const formatGenerationTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}時間${m}分`
  return `${m}分`
}

// 推定コスト: 小数2位
const formatCost = (dollars: number): string =>
  `$ ${dollars.toFixed(2)}`
```

---

## 12. 実装優先度まとめ（Figma スペック対応）

| コンポーネント | 優先度 | Figma フレーム |
|--------------|--------|--------------|
| ChannelBanner | **P0** | Desktop + Mobile |
| ChannelProfile (Avatar, Name, Subscribe) | **P0** | Desktop + Mobile |
| ChannelTabBar (3タブ) | **P0** | Desktop + Mobile |
| ChannelVideoGrid + VideoCard 再利用 | **P0** | Desktop + Mobile |
| MoodFilterBar | **P1** | Desktop + Mobile |
| SortControls | **P1** | Desktop |
| ChannelStatsDashboard + StatCard | **P1** | Desktop + Mobile |
| ChannelDescription | **P1** | Desktop + Mobile |
| AIAgentSpecsPanel (モデル + ムード) | **P1** | Desktop |
| RankedVideoCard featured (Rank 1-3) | **P1** | Desktop |
| RankedVideoCard compact (Rank 4+) | **P1** | Desktop |
| AIAgentSpecsPanel (Quality Score ゲージ) | **P2** | Desktop |
| AIAgentSpecsPanel (生成パターン統計) | **P2** | Desktop |
| AboutTab 2カラムレイアウト | **P2** | Desktop Wide |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-26 | 1.0 | 初版作成（Figma フレーム・全コンポーネントスペック・アクセシビリティ・アニメーション定義） | designer |
