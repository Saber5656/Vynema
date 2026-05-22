# 動画再生ページ UI/UX改善提案

作成日: 2026-02-23
担当: designer
Task: #4

---

## 0. 概要

AI Theater の動画再生ページ (`/watch/[videoId]`) について、
YouTube の課題分析をベースに AI Theater 独自の価値提案を設計する。
Mux Player 統合の UX 設計・Quality Score 表示・AI 生成メタデータ表示・
プロンプト表示を含む詳細 UI 提案を示す。

---

## 1. YouTube の課題分析

### 1.1 現行 YouTube の問題点（AI Theater 視点）

| # | 問題 | AI Theater での影響 |
|---|------|---------------------|
| 1 | AI 生成かどうか不明瞭 | 視聴者が人間制作と誤解するリスク。透明性の欠如 |
| 2 | コンテンツ品質が視聴前に分からない | クリックベイトが多く、視聴体験に損失 |
| 3 | 制作プロセス（プロンプト）が非公開 | AI コンテンツの再現性・学習機会を損失 |
| 4 | 推薦理由が不透明 | 「なぜこれが勧められているか」が不明 |
| 5 | 視聴完了率などの品質指標が非表示 | 動画品質をエンゲージメントで判断できない |
| 6 | クリエイターの生成能力/特性が見えない | AI モデル固有の強み・得意分野が伝わらない |
| 7 | 視聴体験と情報が分離 | メタ情報が動画の下に埋もれ、見られない |
| 8 | AIコンテンツ規制対応が後手 | YouTube は AI ラベル付けを後付けで対応中 |

### 1.2 AI Theater の差別化機会

```
YouTube的アプローチ (受動的・後付け)
├── AI生成かどうか → ラベルを義務付け（事後対応）
├── 品質評価 → 再生数・いいね数のみ
└── 制作情報 → 非公開 or 任意のDescription

AI Theater のアプローチ (積極的・設計から)
├── AI生成であることが前提 → 全情報をオープンに
├── 品質評価 → Quality Score（複合指標）で定量化
└── 制作情報 → プロンプト・モデル・パラメーターを標準表示
```

---

## 2. AI Theater 独自 UI 改善提案

### 2.1 ページ全体レイアウト（3段タブUI構成）

> Figma spec v1.0 準拠: サイドバー廃止、プレーヤー最優先の3段構成

```
┌─────────────────────────────────────────────────────────┐
│ Header (fixed, h=64)                                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ──────── Tier 1: VideoPlayer ────────────────────────  │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │               <MuxPlayer>                        │   │
│  │            aspect-ratio: 16/9                    │   │
│  │            accentColor: #6C5CE7                  │   │
│  │            max-width: 1152px                     │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ──────── Tier 2: タイトル + タブパネル ─────────────   │
│  動画タイトル (heading-md)                               │
│  123K views ・ 2026-02-20 ・ ★ 4.8                      │
│  [👍 1.2K] [👎] [↗ 共有] [📥 保存] [⋯]                │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [推薦] [クリエイター] [プロンプト] [コメント]      │   │
│  │ ─────────────────────────────────────────────    │   │
│  │ <アクティブタブのコンテンツ>                      │   │
│  │   推薦: 関連動画（compact card × セクション別）   │   │
│  │   クリエイター: AICreatorCard + QualityScore      │   │
│  │   プロンプト: AIInfoPanel + 生成メタデータ         │   │
│  │   コメント: CommentSection                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ──────── Tier 3: 関連動画グリッド ─────────────────   │
│  次に見る                                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │
│  │ Card │ │ Card │ │ Card │ │ Card │                    │
│  └──────┘ └──────┘ └──────┘ └──────┘                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 モバイルレイアウト（下部タブ切り替え）

> Figma spec v1.0 準拠: BottomTabSheet による下部タブ切り替え

```
スマートフォン縦画面:
┌──────────────────────────────┐
│ [≡] AI Theater  [🔍] [👤]   │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │      <MuxPlayer>         │ │
│ │      (16:9 full-width)   │ │
│ └──────────────────────────┘ │
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

## 3. Quality Score 表示設計

### 3.1 Quality Score の概要

AI Theater 独自の動画品質評価システム。

**MVP 計算式（ホーム画面設計と統一）:**
```
Quality Score (0.0 - 5.0) =
  likeRatio × 0.5 +        // 評価率の重み 50%
  completionRate × 0.5     // 完了率の重み 50%
```

> **MVP スコープ**: `qualityDetails` には5軸フィールドが定義されているが、MVP では `likeRatio` と `completionRate` の2軸のみ算出する。残り3軸（`technicalQuality`・`promptCreativity`・`commentQuality`）は `null` で返却され、UI側はnullの場合は非表示または「計測中」と表示する。
>
> **将来拡張（v2以降）候補**: `technicalQuality`（映像品質自動評価）、`promptCreativity`（プロンプト多様性）、`commentQuality`（コメントエンゲージメント）の3軸を順次実装予定。
> MVP では tech-leader と合意した2軸（50/50）を採用。

### 3.2 Quality Score パネル UI

```
Quality Score パネル
├── Container
│   ├── Background: var(--color-surface) = #161B22
│   ├── Border: 1px solid var(--color-border) = #30363D
│   ├── Border-radius: 12px
│   ├── Padding: 16px
│   └── Margin-bottom: 16px
│
├── Header Row (flex, justify-between)
│   ├── Left: "Quality Score"
│   │   ├── Font: Inter, 13px, weight 600
│   │   └── Color: text-secondary = #8B949E
│   └── Right: Score Value
│       ├── Score ≥ 4.0: "★ {score}" color: quality-gold = #FFC107
│       ├── Score 3.0-3.9: "★ {score}" color: quality-silver = #8B949E
│       └── Score < 3.0: "★ {score}" color: quality-dim = #7A8390
│
├── Metrics (flex, flex-col, gap: 8px)
│   │
│   ├── Metric Row: completionRate
│   │   ├── Label: "完了率"
│   │   │   ├── Font: Inter, 12px, color: text-secondary
│   │   │   └── Width: 48px (固定)
│   │   ├── Progress Bar
│   │   │   ├── Height: 6px, Border-radius: 3px
│   │   │   ├── Background: surface-hover = #1C2333
│   │   │   ├── Fill: linear-gradient(to right, primary = #6C5CE7, primary-text = #8B7CF8)
│   │   │   └── Fill width: {completionRate}%
│   │   └── Value: "{completionRate}%"
│   │       ├── Font: Inter, 12px, weight 600, tabular-nums
│   │       └── Color: text-primary = #F0F6FC
│   │
│   └── Metric Row: likeRatio
│       ├── Label: "評価率"
│       ├── Progress Bar (same, accent = #FD79A8 gradient)
│       └── Value: "{likeRatio}%"
│
└── Tooltip (on hover)
    └── "完了率: 動画全体を視聴した割合 | 評価率: いいね / 総評価数"
```

### 3.3 Quality Score バッジ（サムネイル上）

動画カード上の既存 Quality Badge と一致。詳細は home-design-spec.md §5.3 参照。

---

## 4. AI 生成メタデータ表示設計

### 4.1 AI 生成情報パネル（詳細版）

```
AIInfoPanel (Collapsible)
│
├── Trigger Row (always visible)
│   ├── Background: surface = #161B22
│   ├── Border: 1px solid border = #30363D
│   ├── Border-radius: 12px (closed) / 12px 12px 0 0 (open)
│   ├── Padding: 14px 16px
│   ├── Display: flex, align-items: center, gap: 10px
│   │
│   ├── Bot Icon: Lucide Bot, 18px, primary-text = #8B7CF8
│   ├── Label: "AI生成情報"
│   │   ├── Font: Inter, 14px, weight 600
│   │   └── Color: text-primary = #F0F6FC
│   ├── AI Model Badge (inline)
│   │   ├── Background: surface-hover = #1C2333
│   │   ├── Padding: 2px 8px
│   │   ├── Border-radius: 9999px
│   │   ├── Font: 11px, weight 500
│   │   └── Color: secondary = #00D2D3
│   └── Chevron Icon (right)
│       ├── Lucide ChevronDown (closed) / ChevronUp (open)
│       ├── 16px, text-secondary
│       └── Transition: transform 200ms ease
│
└── Content (collapsed by default, expandable)
    ├── Background: surface = #161B22
    ├── Border: 1px solid border (sides + bottom)
    ├── Border-radius: 0 0 12px 12px
    ├── Padding: 16px
    │
    ├── ─── モデル情報 ──────────────────────
    │   ├── Row: "使用モデル"
    │   │   ├── Label: Inter, 12px, text-secondary
    │   │   └── Value: <Badge color=secondary>{modelName}</Badge>
    │   ├── Row: "テーマ"
    │   │   └── Value: <Badge color=accent>{theme}</Badge>
    │   └── Row: "生成日"
    │       └── Value: Inter, 13px, text-primary
    │
    ├── ─── プロンプト ──────────────────────
    │   ├── Label Row: "プロンプト"
    │   │   ├── Font: Inter, 12px, weight 600
    │   │   └── Color: text-secondary
    │   ├── Prompt Text Box
    │   │   ├── Background: rgba(139, 124, 248, 0.06)
    │   │   ├── Border-left: 2px solid primary = #6C5CE7
    │   │   ├── Border-radius: 0 8px 8px 0
    │   │   ├── Padding: 10px 14px
    │   │   ├── Font: Inter, 13px, line-height: 1.6
    │   │   ├── Color: text-primary = #F0F6FC
    │   │   ├── Max lines: 3 (line-clamp-3 by default)
    │   │   └── Overflow: hidden
    │   └── "全文を見る" リンク (if truncated)
    │       ├── Font: Inter, 12px, weight 500
    │       ├── Color: primary-text = #8B7CF8
    │       └── Toggle: 全文展開 / 折り畳む
    │
    ├── ─── テクニカル情報 ──────────────────
    │   ├── Grid: 2列, gap: 8px
    │   ├── 解像度: "1080p / 30fps"
    │   ├── 時間: "{duration}"
    │   ├── アスペクト比: "16:9"
    │   └── Playback ID: "{muxId}" (コピーボタン付き)
    │
    └── ─── アクション ─────────────────────
        ├── "プロンプトをコピー" Button [variant="outline", size="sm"]
        │   ├── Icon: Lucide Copy, 14px
        │   └── On click: クリップボードにコピー + トーストで確認
        └── "このモデルの動画を見る" Link
            ├── Color: primary-text = #8B7CF8
            └── href: /search?model={modelName}
```

### 4.2 AI Creator カード（改善版）

```
AICreatorCard
├── Container
│   ├── Display: flex, align-items: center, gap: 16px
│   ├── Padding: 16px
│   ├── Background: surface = #161B22
│   ├── Border: 1px solid border = #30363D
│   ├── Border-radius: 12px
│   └── Margin-bottom: 16px
│
├── Avatar Area
│   ├── Avatar: 48px × 48px, border-radius: 50%
│   ├── Border: 2px solid primary = #6C5CE7
│   └── AI 生成抽象アート画像
│
├── Info Area (flex: 1)
│   ├── Name Row
│   │   ├── Name: Inter, 15px, weight 600, text-primary
│   │   └── AI Badge: "🤖 AI" (variant="outline", 11px)
│   ├── Stats Row
│   │   ├── Font: Inter, 12px, text-secondary
│   │   └── "{videoCount} 動画 ・ 視聴者 {subscribers}K"
│   └── Model Row
│       └── <Badge color=secondary size="sm">{primaryModel}</Badge>
│
└── Action Area (flex, gap: 8px)
    ├── "チャンネルを見る" Button [variant="outline", size="sm"]
    │   └── href: /channel/{creatorId}
    └── Subscribe Button [variant="primary" or "outline", size="sm"]
        ├── Subscribed: "購読中 ✓" (outline, accent)
        └── Not subscribed: "購読する" (primary)
```

---

## 5. プロンプト表示設計

### 5.1 プロンプト表示の原則

AI Theater の核心的価値：**AI 生成の透明性**。
プロンプトは作品の「設計図」であり、誰でも学習できる情報として積極公開する。

### 5.2 プロンプト表示レベル

| レベル | 表示場所 | 内容 | 展開方法 |
|-------|---------|------|---------|
| L0 | VideoCard (hover) | モデル名のみ | Tooltip |
| L1 | 動画再生ページ（デフォルト） | プロンプト冒頭 50文字 | — |
| L2 | AIInfoPanel 展開時 | プロンプト全文（3行まで） | Collapsible trigger |
| L3 | "全文を見る" 展開時 | プロンプト全文 + パラメーター | テキストトグル |

### 5.3 プロンプト全文表示 UI

```
PromptDisplay
├── コンパクト表示（default）
│   ├── テキスト: 先頭 120文字 + "..."
│   ├── Font: Inter, 13px, line-height: 1.6
│   ├── Color: text-primary = #F0F6FC
│   └── "全文を見る ▼" リンク: primary-text
│
├── 全文表示（expanded）
│   ├── テキスト: プロンプト全文
│   ├── Padding: 12px 16px
│   ├── Background: rgba(139, 124, 248, 0.04)
│   ├── Border-left: 2px solid primary = #6C5CE7
│   ├── Border-radius: 0 8px 8px 0
│   └── "折り畳む ▲" リンク
│
└── コピーバリアント
    ├── コピーボタン: right-align, outline, sm
    ├── コピー成功: icon → check, toast "コピーしました"
    └── コピー対象: プロンプト全文テキスト
```

### 5.4 プロンプトフィーチャーカード（ホーム画面連携）

ホーム画面の「プロンプトフィーチャー」セクションから動画再生ページへ遷移した場合、
プロンプトパネルをデフォルトで展開表示する。

```
URL: /watch/{videoId}?highlight=prompt
  → AIInfoPanel を自動展開
  → プロンプト部分をハイライト（背景: rgba(139,124,248,0.12)）
  → 3秒後にハイライトをフェードアウト
```

---

## 6. Mux Player 統合 UX 設計

### 6.1 Mux Player 設定

```tsx
// components/watch/VideoPlayer.tsx  ← Task #6 tech-leader 設計と統一

<MuxPlayer
  playbackId={video.muxPlaybackId}

  // ─── ブランディング ───
  accentColor="#6C5CE7"        // プライマリカラーでシークバー等を統一

  // ─── アナリティクス ───
  metadata={{
    video_id: video.id,
    video_title: video.title,
    video_duration: video.duration,
    video_series: video.channel.name,     // AIChannel 名（consistency-review ISSUE-2 対応: aiCreator → channel）
    viewer_user_id: userId ?? 'anonymous',
    // AI Theater カスタムディメンション
    // ※ 定義の正式仕様は video-player-performance-design.md §10.3 を参照
    custom_1: video.aiModel,                        // 生成AIモデル名
    custom_2: String(video.qualityScore ?? ""),     // Quality Score raw値 (0-100)
    custom_3: video.channel.id,                     // AI チャンネルID
  }}

  // ─── 再生設定 ───
  preload="metadata"           // ページ読み込み時にメタデータのみ先読み
  startTime={searchParams.t}   // URL パラメーター ?t=秒数 でシーク

  // ─── UI 設定 ───
  thumbnailTime={5}            // サムネイル取得時間
  // storyboard は Mux が自動生成 (シークバーホバー時プレビュー)

  // ─── コールバック ───
  onPlay={() => setIsPlaying(true)}
  onEnded={() => handleVideoEnded()}
  // completionRate トラッキング
  onTimeUpdate={(e) => trackCompletion(e.target.currentTime, video.duration)}
/>
```

### 6.2 視聴完了率トラッキング

```typescript
// hooks/useVideoCompletion.ts

function useVideoCompletion(videoId: string, duration: number) {
  const maxWatched = useRef(0)

  function trackCompletion(currentTime: number) {
    if (currentTime > maxWatched.current) {
      maxWatched.current = currentTime
    }
  }

  function onVideoEnded() {
    const completionRate = Math.min(
      Math.round((maxWatched.current / duration) * 100),
      100
    )
    // Supabase に送信 (debounced, on pause/ended/beforeunload)
    recordCompletion(videoId, completionRate)
  }

  return { trackCompletion, onVideoEnded }
}
```

### 6.3 AI 生成オーバーレイ（再生開始時）

```
AIOverlay (再生開始後3秒で自動フェードアウト)
├── Position: absolute, inset: 0
├── Background: rgba(0, 0, 0, 0.55)
├── Display: flex, flex-direction: column, align-items: center, justify-content: center
├── z-index: 10
├── Pointer-events: none
│
├── Bot Icon: Lucide Bot, 40px, primary-text = #8B7CF8
├── Text: "この動画はAIが生成しました"
│   ├── Font: Space Grotesk, 16px, weight 600
│   └── Color: #FFFFFF
└── Model Badge: "{aiModel}" (secondary color badge)

アニメーション:
├── 0-0.3s (10%): opacity 0 → 1 (fade in)
├── 0.3-2.4s (10%-80%): opacity 1 (表示)
└── 2.4-3s (80%-100%): opacity 1 → 0 (fade out)

CSS（home-design-spec.md §7.3 と統一・同一クラス名を共有）:
@keyframes fadeInOut {
  0%   { opacity: 0; }
  10%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
/* home-design-spec §7.3 で定義済みの .ai-overlay クラスをそのまま利用 */
.ai-overlay { animation: fadeInOut 3s ease forwards; }
```

### 6.4 Mux Player スタイルカスタマイズ

```css
/* MuxPlayer のカスタムCSS (CSS変数経由) */
mux-player {
  --media-accent-color: #6C5CE7;
  --media-background-color: #0D1117;
  --media-control-background: rgba(13, 17, 23, 0.8);

  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  width: 100%;
}

/* フォーカスリング */
mux-player:focus-visible {
  outline: 2px solid #8B7CF8;
  outline-offset: 2px;
}
```

### 6.5 プレーヤーエラーハンドリング

```
エラー状態 UI:
├── Container (aspect-video)
│   ├── Background: surface = #161B22
│   ├── Border: 1px solid border = #30363D
│   ├── Border-radius: 12px
│   └── Display: flex, flex-direction: column, align-items: center, justify-content: center
│
├── Icon: Lucide AlertTriangle, 48px, error = #F85149
├── Text: "動画を読み込めませんでした"
│   ├── Font: Inter, 16px, weight 600, text-primary
│   └── Margin-bottom: 8px
├── Sub: "しばらくしてからもう一度お試しください"
│   └── Font: Inter, 14px, text-secondary
└── Button: "再読み込み" (variant="outline", mt-16px)
    └── onClick: window.location.reload()
```

---

## 7. アクションバー設計

### 7.1 アクションボタン

```
ActionBar
├── Container
│   ├── Display: flex, align-items: center, gap: 8px
│   ├── Padding: 12px 0
│   ├── Border-top: 1px solid border = #30363D
│   └── Border-bottom: 1px solid border = #30363D
│
├── Like Button (shadcn/ui Button variant="ghost")
│   ├── Icon: Lucide ThumbsUp, 18px
│   ├── Count: "{likeCount}" Inter 13px
│   ├── Default: icon + text text-secondary
│   ├── Active (liked): icon + text primary-text = #8B7CF8
│   ├── Hover: surface-hover background
│   └── Aria: aria-pressed={liked}, aria-label="いいね {likeCount}件"
│
├── Dislike Button
│   ├── Icon: Lucide ThumbsDown, 18px
│   ├── Text: "低評価" (mobile: hidden)
│   └── Same states as Like
│
├── Share Button
│   ├── Icon: Lucide Share2, 18px
│   ├── Text: "共有"
│   └── onClick: Web Share API → fallback: URL コピー
│
├── Save Button
│   ├── Icon: Lucide BookmarkPlus, 18px
│   ├── Text: "保存"
│   └── onClick: 認証確認 → ライブラリ追加
│
└── More Button (DropdownMenu)
    ├── Icon: Lucide MoreHorizontal, 18px
    └── Menu items:
        ├── "報告する" (Lucide Flag)
        ├── "プロンプトをコピー" (Lucide Copy)
        └── "このAIについて" (Lucide Bot)
```

---

## 8. 関連動画表示設計（タブUI + Tier 3 グリッド）

> Figma spec v1.0 準拠: サイドバー廃止。関連動画は2箇所に表示。

### 8.1 表示箇所

| 箇所 | 表示方式 | 対象 |
|------|---------|------|
| Tier 2 WatchPageTabPanel「推薦」タブ | compact card（セクション別） | デスクトップ・モバイル共通 |
| Tier 3 RelatedVideosGrid | grid variant card（4カラム） | デスクトップのみ（モバイルではタブ内に統合） |

### 8.2 推薦タブ内のセクション構成

```
RecommendTab（WatchPageTabPanel 内）
├── ─── 次に見る ──────────────────────
│   └── アルゴリズム推薦 (Quality Score上位 × 同テーマ)
│       VideoCard [variant="compact"] × 5
│
├── ─── 同じAIモデル ({modelName}) ────
│   └── 同一モデル使用の動画
│       VideoCard [variant="compact"] × 3
│
└── ─── {channelName} の他の動画 ─────
    └── 同一チャンネルの動画
        VideoCard [variant="compact"] × 3
```

### 8.3 VideoCard compact（関連動画向け）

推薦タブ内での表示:
- タイトル: `line-clamp-2`, 13px, weight 500
- Creator: 12px, text-secondary
- Views + Time: **11px, text-tertiary = #7A8390** ← Task #1 修正値を使用
- Quality Score: バッジのみ（スター+数値）

### 8.4 Tier 3 RelatedVideosGrid（デスクトップ下部）

タブパネルの下に横グリッドで関連動画を表示:
- デスクトップ: `grid-cols-4`, `gap-6`
- タブレット: `grid-cols-2`, `gap-4`
- モバイル: 非表示（推薦タブ内で表示するため重複回避）

---

## 9. モバイル固有の UX 設計

### 9.1 モバイルでのプレーヤー挙動

| 操作 | 挙動 |
|-----|------|
| 縦画面 | 16:9 固定、下にコンテンツスクロール |
| 横画面 | フルスクリーン相当（MuxPlayer 標準） |
| ダブルタップ（左） | -10秒スキップ |
| ダブルタップ（右） | +10秒スキップ |
| スワイプアップ | 全画面 → コンテンツへスクロール |

### 9.2 モバイル Info エリア最適化

- Quality Score: 1行でスコア + 主要指標をコンパクト表示
  - "★ 4.8 ・ 完了率 82% ・ 評価率 94%"
- AIInfoPanel: デフォルト折り畳み（タップで展開）
- アクションバー: アイコンのみ（ラベル非表示）、等間隔配置

---

## 10. アクセシビリティ

| 要素 | 実装 |
|------|------|
| MuxPlayer | 標準でキーボード操作・スクリーンリーダー対応 |
| Quality Score メトリクス | `role="meter"` + `aria-valuenow` + `aria-valuemin/max` |
| AIInfoPanel | `aria-expanded` + `aria-controls` (shadcn/ui Collapsible 標準) |
| アクションバー Like | `aria-pressed={liked}` でトグル状態を通知 |
| AI オーバーレイ | `aria-live="polite"` で読み上げ後 `aria-hidden="true"` |
| プロンプトコピー | コピー後 `aria-live="assertive"` で "コピーしました" を読み上げ |

---

## 11. 実装優先度

| コンポーネント | 優先度 | 理由 |
|--------------|--------|------|
| Mux Player 統合 + スタイル | **P0** | 動画再生の核心機能 |
| AI 生成情報パネル (Collapsible) | **P0** | AI Theater の差別化 |
| AI Creator カード | **P0** | プラットフォーム信頼性 |
| タイトル + メタ情報バー | **P0** | 基本情報 |
| アクションバー (Like/Share) | **P0** | エンゲージメント |
| WatchPageTabPanel + 関連動画 | **P1** | 回遊性（タブUI + Tier 3 グリッド） |
| Quality Score パネル | **P1** | 独自価値だがデータ蓄積が必要 |
| AI オーバーレイ (再生開始時) | **P1** | UX 演出 |
| 視聴完了率トラッキング | **P1** | Quality Score の基礎データ |
| プロンプト全文表示 + コピー | **P2** | 高度なユーザー向け |
| ?highlight=prompt 機能 | **P2** | ホーム画面連携 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成（YouTube課題分析・AI Theater独自UI・Mux Player統合設計） | designer |
| 2026-02-23 | 1.1 | [UIUX-V-1] レイアウトを2カラム+サイドバー → 3段タブUI構成に変更（Figma spec v1.0 準拠）。§2.1 デスクトップ・§2.2 モバイル・§8 関連動画表示を統一 | tech-leader |
| 2026-02-23 | 1.2 | [UIUX-V-2] CommentsSection → CommentSection に統一（VR-4 対応） | tech-leader |
