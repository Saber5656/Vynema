# ホーム画面 UI/UX: コンポーネント設計

> 元ファイル: [home-uiux-improvements.md](home-uiux-improvements.md) から分割（§0-4）

作成日: 2026-02-22
担当: ux-designer
Task: #5

---

## 0. 本ドキュメントの目的

YouTubeのホーム画面を「参考」にしつつ、それを「ゴール」にしない。
AI専用プラットフォームだからこそ実現可能な、**YouTubeでは不可能な体験**を設計する。

---

## 1. YouTubeホーム画面のUX課題分析

### 1.1 情報過多と注意力の奪い合い

| 課題 | 詳細 | 影響度 |
|------|------|--------|
| **サムネイル釣り** | クリックベイトなサムネイルが横行し、実際の内容とかけ離れている | 高 |
| **均一な動画カード** | すべての動画が同じ形式のカードで、コンテンツの質の差が分からない | 高 |
| **メタ情報の欠如** | サムネイル + タイトル + チャンネル名 + 再生回数のみで、内容の判断材料が少ない | 中 |
| **アルゴリズムのブラックボックス** | なぜその動画がおすすめされたか不透明 | 中 |

### 1.2 コンテンツ発見の限界

| 課題 | 詳細 | 影響度 |
|------|------|--------|
| **フィルタの弱さ** | 「すべて」「音楽」「ゲーム」程度のフィルタチップしかない | 高 |
| **再生回数至上主義** | 再生回数とCTRでほぼすべてが決まり、多様なコンテンツが埋もれる | 高 |
| **新規クリエイター不利** | 実績のないクリエイターの動画はほぼ表示されない | 中 |
| **偶発的発見の欠如** | アルゴリズムがフィルターバブルを形成し、同じような動画ばかり表示される | 高 |

### 1.3 視聴体験の問題

| 課題 | 詳細 | 影響度 |
|------|------|--------|
| **広告の割り込み** | 動画再生前後、途中の広告がUXを著しく毀損 | 高 |
| **自動再生の中毒設計** | 無限ループ的な自動再生が依存を生む | 中 |
| **エンゲージメント偏重** | 滞在時間を最大化する設計で、ユーザーの意思より視聴時間が優先される | 中 |

### 1.4 AI Theaterでの構造的優位性

YouTubeのこれらの問題が AI Theater では**構造的に解消**できる理由:

| YouTube課題 | AI Theater での解消理由 |
|-------------|----------------------|
| サムネイル釣り | AIが生成するためクリックベイトが発生しない。サムネイルと内容が必ず一致 |
| アルゴリズム不透明 | AI生成メタデータ（モデル、プロンプト、パラメータ）が完全に開示可能 |
| 広告の割り込み | 広告なし（または非侵入型のみ）で設計可能 |
| 再生回数至上主義 | 技術的品質、プロンプトの創造性など、多軸評価が可能 |
| 新規クリエイター不利 | AI Creatorはアルゴリズムで公平に露出を調整可能 |

---

## 2. 他プラットフォームからの良いUXパターン

### 2.1 TikTok から学ぶもの

| パターン | 取り入れ方 | 優先度 |
|---------|-----------|--------|
| **即座のコンテンツ表示** | トップページに動画プレビュー（ホバーで無音自動再生）を導入 | P0 |
| **スワイプ操作** | モバイルでのショート動画風縦スワイプブラウジング | P1 |
| **For You の精度** | 視聴行動ベースではなく「AI技術×テーマ」ベースのパーソナライズ | P1 |

### 2.2 Netflix から学ぶもの

| パターン | 取り入れ方 | 優先度 |
|---------|-----------|--------|
| **横スクロールカルーセル** | カテゴリ別の横スクロール行で多様なコンテンツを一覧性高く表示 | P0 |
| **パーセントマッチ** | 「あなたに xx% マッチ」→ AI Theater版: 「AIクオリティスコア」 | P0 |
| **プレビュー on ホバー** | サムネイルホバーで5秒プレビュー（Mux thumbnail gifを活用） | P0 |
| **トップ10リスト** | 数字付きランキングでコンテンツの価値を可視化 | P1 |

### 2.3 Spotify から学ぶもの

| パターン | 取り入れ方 | 優先度 |
|---------|-----------|--------|
| **Discover Weekly** | 「今週のAI新作」: 毎週更新されるパーソナライズドプレイリスト | P1 |
| **ムード/雰囲気ベース** | テーマだけでなく「雰囲気」（calm, energetic, dreamy 等）で探索 | P1 |

### 2.4 Pinterest から学ぶもの

| パターン | 取り入れ方 | 優先度 |
|---------|-----------|--------|
| **ビジュアル重視グリッド** | サムネイルを大きく表示し、テキスト情報は最小限に | P0 |
| **関連コンテンツの連鎖** | 1つの動画から関連する「AI技法」「プロンプトパターン」を連鎖的に探索 | P1 |

---

## 3. AI Theater 独自の改善提案

### 3.1 動画カードの再設計 — 「情報リッチカード」

YouTubeの動画カードは「サムネイル + タイトル + チャンネル名 + 再生回数」の4要素しかない。
AI Theaterでは、AI生成ならではのメタデータを活用した**情報リッチカード**を提案する。

#### 改善前（YouTube型）

```
┌──────────────────┐
│ サムネイル         │
│  [12:34]          │
├──────────────────┤
│ タイトル           │
│ チャンネル名       │
│ 12K views・3日前  │
└──────────────────┘
```

#### 改善後（AI Theater 情報リッチカード）

```
┌──────────────────────────────────────────────┐
│                                              │
│  サムネイル (aspect-video)                    │
│  ▶ ホバーで5秒プレビュー (Mux animated gif)   │
│                                              │
│  ┌─────────┐                    [12:34]      │
│  │🤖 AI    │                                │
│  │Generated│                                │
│  └─────────┘                                │
├──────────────────────────────────────────────┤
│                                              │
│  動画タイトル（最大2行）                       │
│                                              │
│  ┌────┐ AI Creator名                        │
│  │ AV │ @aurora                              │
│  └────┘                                      │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ ⭐ 4.2  │ 🧠 Runway  │ 🎨 風景     │   │
│  │ Quality │  Gen-4     │  Nature     │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  👁 12K  ・  👍 89%  ・  3日前              │
│                                              │
└──────────────────────────────────────────────┘
```

**新規要素:**

| 要素 | 説明 | YouTubeにない理由 |
|------|------|------------------|
| **Quality Score** | AI生成品質のスコア (1.0-5.0) | 人間の動画に品質スコアはつけられない。AI生成物は客観的技術評価が可能 |
| **AIモデルバッジ** | 使用AIモデル名をBadgeで表示 | AI固有のメタデータ |
| **テーマタグ** | AI分類によるテーマタグ | 自動分類が正確 |
| **いいね率** | 再生数ではなく「いいね率」を表示 | 質の指標として再生数より有効 |
| **ホバープレビュー** | 5秒のアニメーションプレビュー | Mux の animated gif API で低コスト実現 |

#### デザインスペック（Figma再現用）

```
VideoCard (grid variant)
├── Container
│   ├── width: 100% (grid column fill)
│   ├── min-width: 280px
│   ├── max-width: 420px
│   ├── background: var(--color-surface) = #161B22
│   ├── border: 1px solid var(--color-border) = #30363D
│   ├── border-radius: 12px
│   ├── overflow: hidden
│   └── transition: transform 150ms ease, box-shadow 150ms ease
│       └── hover: transform scale(1.02), box-shadow 0 8px 32px rgba(0,0,0,0.3)
│
├── Thumbnail Area
│   ├── aspect-ratio: 16/9
│   ├── position: relative
│   ├── overflow: hidden
│   ├── border-radius: 12px 12px 0 0
│   │
│   ├── <img> (Mux thumbnail)
│   │   └── src: image.mux.com/{id}/thumbnail.webp?width=640&time=5
│   │
│   ├── HoverPreview (absolute, inset: 0)
│   │   ├── <img> (Mux animated thumbnail)
│   │   │   └── src: image.mux.com/{id}/animated.gif?width=640&start=2&end=7
│   │   ├── opacity: 0 → hover: 1
│   │   └── transition: opacity 300ms ease
│   │
│   ├── AIBadge (absolute, top: 8px, left: 8px)
│   │   ├── background: rgba(108, 92, 231, 0.85) = primary/85%
│   │   ├── backdrop-filter: blur(4px)
│   │   ├── padding: 4px 8px
│   │   ├── border-radius: 6px
│   │   ├── font-size: 11px
│   │   ├── font-weight: 600
│   │   ├── color: #FFFFFF
│   │   └── display: flex, align-items: center, gap: 4px
│   │       └── <Bot size={12}> + "AI"
│   │
│   └── Duration Badge (absolute, bottom: 8px, right: 8px)
│       ├── background: rgba(0, 0, 0, 0.75)
│       ├── padding: 2px 6px
│       ├── border-radius: 4px
│       ├── font-size: 12px
│       ├── font-weight: 500
│       ├── font-family: 'Inter', monospace fallback
│       └── color: #FFFFFF
│
├── Info Area
│   ├── padding: 12px
│   ├── display: flex, flex-direction: column, gap: 8px
│   │
│   ├── Title
│   │   ├── font-family: 'Inter'
│   │   ├── font-size: 14px (0.875rem)
│   │   ├── font-weight: 600
│   │   ├── line-height: 1.4
│   │   ├── color: var(--color-text-primary) = #F0F6FC
│   │   ├── display: -webkit-box
│   │   ├── -webkit-line-clamp: 2
│   │   └── overflow: hidden
│   │
│   ├── Creator Row
│   │   ├── display: flex, align-items: center, gap: 8px
│   │   │
│   │   ├── Avatar
│   │   │   ├── width: 28px, height: 28px
│   │   │   ├── border-radius: 50%
│   │   │   └── border: 2px solid var(--color-primary) = #6C5CE7
│   │   │
│   │   └── Creator Name
│   │       ├── font-size: 13px
│   │       ├── font-weight: 400
│   │       └── color: var(--color-text-secondary) = #8B949E
│   │
│   ├── MetaTag Row
│   │   ├── display: flex, gap: 6px, flex-wrap: wrap
│   │   │
│   │   ├── QualityBadge
│   │   │   ├── display: flex, align-items: center, gap: 3px
│   │   │   ├── background: var(--color-surface-hover) = #1C2333
│   │   │   ├── padding: 3px 8px
│   │   │   ├── border-radius: 9999px (pill)
│   │   │   ├── font-size: 11px
│   │   │   ├── font-weight: 500
│   │   │   └── color: #FFC107 (star color)
│   │   │       └── content: "⭐ {score}"
│   │   │
│   │   ├── ModelBadge
│   │   │   ├── background: var(--color-surface-hover) = #1C2333
│   │   │   ├── padding: 3px 8px
│   │   │   ├── border-radius: 9999px
│   │   │   ├── font-size: 11px
│   │   │   ├── font-weight: 500
│   │   │   └── color: var(--color-secondary) = #00D2D3
│   │   │       └── content: "🧠 {modelName}"
│   │   │
│   │   └── ThemeTag
│   │       ├── background: var(--color-surface-hover) = #1C2333
│   │       ├── padding: 3px 8px
│   │       ├── border-radius: 9999px
│   │       ├── font-size: 11px
│   │       ├── font-weight: 500
│   │       └── color: var(--color-accent) = #FD79A8
│   │           └── content: "🎨 {theme}"
│   │
│   └── Stats Row
│       ├── display: flex, align-items: center, gap: 8px
│       ├── font-size: 12px
│       ├── color: var(--color-text-secondary) = #8B949E
│       └── content: "👁 {views} ・ 👍 {likeRatio}% ・ {relativeTime}"
```

### 3.2 ホーム画面レイアウト — カルーセル + グリッドのハイブリッド

YouTubeの均一なグリッドではなく、**Netflix風カルーセル + Pinterest風グリッド**のハイブリッド。

#### デスクトップ ワイヤーフレーム

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [≡]  [🔮 AI Theater]  [_________検索_________🔍]   [🔔] [Clerk 👤]    │
├─────────┬────────────────────────────────────────────────────────────────┤
│         │                                                                │
│ サイド   │ ┌─ Hero Section ───────────────────────────────────────────┐ │
│ バー     │ │                                                         │ │
│ (w-60)  │ │  ┌────────────────────────────────┐   今日のAI傑作       │ │
│         │ │  │                                │                     │ │
│ 🏠 ホーム│ │  │   特大サムネイル                │   「夕暮れの東京タワー」│ │
│ 🔥 急上昇│ │  │   (aspect-[21/9])              │   ⭐ 4.8 Quality     │ │
│ 📚 ライブ│ │  │   背景ぼかし+グラデーション       │   🧠 Runway Gen-4    │ │
│   ラリ  │ │  │   ホバーで自動再生              │   👁 45K views       │ │
│ 🎭 ムード│ │  │                                │                     │ │
│         │ │  └────────────────────────────────┘   [▶ 今すぐ再生]     │ │
│ ─────  │ │                                       [📋 詳細を見る]     │ │
│ カテゴリ │ └────────────────────────────────────────────────────────────┘ │
│ 🎵 音楽 │                                                                │
│ 🎮 ゲーム│ ─── 🔥 いま話題の AI 動画 ──────────────── [すべて見る →]     │
│ 📰 ニュース│                                                              │
│ 🎓 教育 │ ◀ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ▶ │
│ 🎨 アート│   │ Rich   │ │ Rich   │ │ Rich   │ │ Rich   │ │ Rich │   │
│ 🔬 科学 │   │ Card   │ │ Card   │ │ Card   │ │ Card   │ │ Card │   │
│         │   │ #1     │ │ #2     │ │ #3     │ │ #4     │ │ #5   │   │
│ ─────  │   └────────┘ └────────┘ └────────┘ └────────┘ └──────┘   │
│         │                                                                │
│ 購読中   │ ─── ✨ AIクオリティ TOP 10 ────────────── [すべて見る →]     │
│ 🤖Aurora│                                                                │
│ 🤖Nexus │ ◀ ┌──┬──────┐ ┌──┬──────┐ ┌──┬──────┐ ┌──┬──────┐    ▶ │
│ 🤖Prism │   │①│Card  │ │②│Card  │ │③│Card  │ │④│Card  │      │
│         │   │  │      │ │  │      │ │  │      │ │  │      │      │
│ ─────  │   └──┴──────┘ └──┴──────┘ └──┴──────┘ └──┴──────┘      │
│ ⚙️ 設定 │                                                                │
│         │ ─── 🧠 AIモデル別ピックアップ ──────────────────────────────── │
│         │                                                                │
│         │ [Runway Gen-4] [Sora] [Veo 3.1] [Kling] ← 切替タブ           │
│         │                                                                │
│         │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│         │ │ Rich   │ │ Rich   │ │ Rich   │ │ Rich   │                │
│         │ │ Card   │ │ Card   │ │ Card   │ │ Card   │                │
│         │ └────────┘ └────────┘ └────────┘ └────────┘                │
│         │                                                                │
│         │ ─── 🎭 ムードで探す ─────────────────────────────────────── │
│         │                                                                │
│         │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│         │ │🌅    │ │⚡    │ │🌙    │ │🎉    │ │🧘    │ │🔮    │  │
│         │ │Calm  │ │Energy│ │Dream │ │Fun   │ │Zen   │ │Mystic│  │
│         │ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│         │                                                                │
│         │ ─── 🆕 新着 AI 動画 ────────────── [すべて見る →]             │
│         │                                                                │
│         │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│         │ │ Rich   │ │ Rich   │ │ Rich   │ │ Rich   │                │
│         │ │ Card   │ │ Card   │ │ Card   │ │ Card   │                │
│         │ └────────┘ └────────┘ └────────┘ └────────┘                │
│         │                                                                │
│         │ ─── 🎬 プロンプトで話題 ───────────── [すべて見る →]          │
│         │                                                                │
│         │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│         │ │ Prompt │ │ Prompt │ │ Prompt │ │ Prompt │                │
│         │ │Feature │ │Feature │ │Feature │ │Feature │                │
│         │ │ Card   │ │ Card   │ │ Card   │ │ Card   │                │
│         │ └────────┘ └────────┘ └────────┘ └────────┘                │
│         │                                                                │
└─────────┴────────────────────────────────────────────────────────────────┘
```

#### モバイル ワイヤーフレーム

```
┌──────────────────────────────┐
│ [≡] [🔮] [🔍] [🔔] [👤]     │
├──────────────────────────────┤
│                              │
│ ┌──────────────────────────┐│
│ │  Hero: 今日のAI傑作       ││
│ │  ┌────────────────────┐  ││
│ │  │ 特大サムネイル       │  ││
│ │  │ (aspect-[16/9])    │  ││
│ │  └────────────────────┘  ││
│ │  タイトル                 ││
│ │  ⭐ 4.8 ・🧠 Runway     ││
│ │  [▶ 再生]  [📋 詳細]    ││
│ └──────────────────────────┘│
│                              │
│ 🔥 いま話題                  │
│ ┌────────┐ ┌────────┐ ─── │
│ │ Rich   │ │ Rich   │ ←横ス│
│ │ Card   │ │ Card   │ クロー│
│ └────────┘ └────────┘ ル── │
│                              │
│ 🎭 ムードで探す              │
│ ┌────┐┌────┐┌────┐┌────┐ │
│ │Calm││Enrg││Drem││Fun │ │
│ └────┘└────┘└────┘└────┘ │
│                              │
│ ✨ AIクオリティ TOP 10       │
│ ┌────────┐ ┌────────┐ ─── │
│ │①Card  │ │②Card  │ ←横ス│
│ └────────┘ └────────┘ ル── │
│                              │
│ 🧠 AIモデル別               │
│ [Runway] [Sora] [Veo]       │
│ ┌────────┐ ┌────────┐ ─── │
│ │ Card   │ │ Card   │      │
│ └────────┘ └────────┘      │
│                              │
│ 🆕 新着                     │
│ ┌──────────────────────────┐│
│ │ サムネ │ タイトル          ││
│ │       │ ⭐ 4.1 🧠 Sora   ││
│ ├───────┼────────────────┤│
│ │ サムネ │ タイトル          ││
│ │       │ ⭐ 3.8 🧠 Veo    ││
│ └──────────────────────────┘│
│                              │
├──────┬──────┬──────┬──────┤
│  🏠  │  🔥  │  🎭  │  👤  │
│ホーム│トレンド│ムード│マイページ│
└──────┴──────┴──────┴──────┘
```

#### レイアウトスペック

```
HomePage Layout
├── Header (fixed, top: 0, z-index: 50)
│   └── height: 56px (mobile) / 64px (desktop)
│
├── Main Content Area
│   ├── padding-top: 56px (mobile) / 64px (desktop) ← header分
│   ├── padding-left: 0 (mobile) / 72px (collapsed sidebar) / 240px (expanded sidebar)
│   ├── padding-bottom: 64px (mobile, bottom nav) / 0 (desktop)
│   └── max-width: 1800px, margin: 0 auto
│
├── Hero Section
│   ├── width: 100%
│   ├── max-height: 400px (desktop) / 280px (mobile)
│   ├── aspect-ratio: 21/9 (desktop) / 16/9 (mobile)
│   ├── margin-bottom: 32px
│   ├── background: linear-gradient(to right, var(--color-background) 0%, transparent 40%)
│   │   └── overlay on top of blurred thumbnail
│   ├── border-radius: 0 (mobile, full-bleed) / 16px (desktop)
│   └── padding: 24px (mobile) / 40px (desktop)
│
├── Section (repeating)
│   ├── margin-bottom: 32px (mobile) / 48px (desktop)
│   │
│   ├── Section Header
│   │   ├── display: flex, justify-content: space-between, align-items: center
│   │   ├── margin-bottom: 16px
│   │   ├── padding: 0 16px (mobile) / 0 24px (desktop)
│   │   │
│   │   ├── Title
│   │   │   ├── font-family: 'Space Grotesk'
│   │   │   ├── font-size: 18px (mobile) / 22px (desktop)
│   │   │   ├── font-weight: 700
│   │   │   └── color: var(--color-text-primary) = #F0F6FC
│   │   │
│   │   └── "すべて見る →" Link
│   │       ├── font-size: 14px
│   │       ├── font-weight: 500
│   │       └── color: var(--color-primary) = #6C5CE7
│   │
│   └── Content
│       ├── Carousel variant
│       │   ├── display: flex, overflow-x: auto, scroll-snap-type: x mandatory
│       │   ├── gap: 16px
│       │   ├── padding: 0 16px (mobile) / 0 24px (desktop)
│       │   ├── scroll-padding: 16px / 24px
│       │   ├── scrollbar-width: none
│       │   └── each child: scroll-snap-align: start, flex-shrink: 0
│       │       └── width: 280px (mobile) / 300px (desktop)
│       │
│       └── Grid variant
│           ├── display: grid
│           ├── grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
│           ├── gap: 16px (mobile) / 24px (desktop)
│           └── padding: 0 16px (mobile) / 0 24px (desktop)
│
├── Sidebar (desktop only)
│   ├── position: fixed, top: 64px, left: 0, bottom: 0
│   ├── width: 240px (expanded) / 72px (collapsed)
│   ├── background: var(--color-background) = #0D1117
│   ├── border-right: 1px solid var(--color-border) = #30363D
│   ├── z-index: 40
│   ├── transition: width 200ms ease
│   └── padding: 8px 0
│
└── Bottom Navigation (mobile only)
    ├── position: fixed, bottom: 0, left: 0, right: 0
    ├── height: 56px
    ├── background: var(--color-background) = #0D1117
    ├── border-top: 1px solid var(--color-border) = #30363D
    ├── display: flex, justify-content: space-around, align-items: center
    └── z-index: 50
```

### 3.3 AIモデル別ブラウジング

YouTubeにはない、AI専用プラットフォームならではのブラウジング体験。

```
─── 🧠 AIモデル別ピックアップ ────────────────────────────────────

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Runway     │ │ Sora       │ │ Veo 3.1    │ │ Kling      │
│ Gen-4      │ │            │ │ Fast       │ │            │
│            │ │            │ │            │ │            │
│ ┌────────┐│ │ ┌────────┐│ │ ┌────────┐│ │ ┌────────┐│
│ │ model  ││ │ │ model  ││ │ │ model  ││ │ │ model  ││
│ │ icon   ││ │ │ icon   ││ │ │ icon   ││ │ │ icon   ││
│ └────────┘│ │ └────────┘│ │ └────────┘│ │ └────────┘│
│            │ │            │ │            │ │            │
│ 📊 動画数  │ │ 📊 動画数  │ │ 📊 動画数  │ │ 📊 動画数  │
│ ⭐ 平均品質│ │ ⭐ 平均品質│ │ ⭐ 平均品質│ │ ⭐ 平均品質│
│ 🎨 得意分野│ │ 🎨 得意分野│ │ 🎨 得意分野│ │ 🎨 得意分野│
│            │ │            │ │            │ │            │
│ [探索 →]  │ │ [探索 →]  │ │ [探索 →]  │ │ [探索 →]  │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

**モデルカード スペック:**

```
AIModelCard
├── width: 280px (carousel) / 100% (grid)
├── background: var(--color-surface) = #161B22
├── border: 1px solid var(--color-border) = #30363D
├── border-radius: 16px
├── padding: 20px
├── hover: border-color → var(--color-primary) = #6C5CE7
│
├── Model Icon
│   ├── width: 56px, height: 56px
│   ├── border-radius: 12px
│   ├── background: linear-gradient(135deg, primary, secondary)
│   └── margin-bottom: 16px
│
├── Model Name
│   ├── font-family: 'Space Grotesk'
│   ├── font-size: 18px
│   ├── font-weight: 700
│   └── color: var(--color-text-primary)
│
├── Stats (flex, column, gap: 8px)
│   ├── font-size: 13px
│   └── color: var(--color-text-secondary)
│
└── CTA Button
    ├── width: 100%
    ├── margin-top: 16px
    ├── background: transparent
    ├── border: 1px solid var(--color-primary)
    ├── color: var(--color-primary)
    ├── border-radius: 8px
    ├── padding: 8px 16px
    ├── font-size: 14px
    └── hover: background → var(--color-primary), color → #FFFFFF
```

### 3.4 ムード・雰囲気ベースのブラウジング

カテゴリ（音楽、ゲーム等）ではなく「ムード」でコンテンツを探索する、AI Theaterならではの体験。

```
─── 🎭 ムードで探す ────────────────────────────────────────────

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│          │ │          │ │          │ │          │ │          │
│  🌅      │ │  ⚡      │ │  🌙      │ │  🎉      │ │  🧘      │
│          │ │          │ │          │ │          │ │          │
│  Calm    │ │ Energetic│ │  Dreamy  │ │   Fun    │ │   Zen    │
│  穏やか  │ │エネルギッシュ│ │  幻想的  │ │ 楽しい   │ │  禅      │
│          │ │          │ │          │ │          │ │          │
│ gradient │ │ gradient │ │ gradient │ │ gradient │ │ gradient │
│ bg       │ │ bg       │ │ bg       │ │ bg       │ │ bg       │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**ムードカード スペック:**

```
MoodCard
├── width: 140px (mobile) / 160px (desktop)
├── height: 120px (mobile) / 140px (desktop)
├── border-radius: 16px
├── overflow: hidden
├── cursor: pointer
├── position: relative
├── transition: transform 200ms ease
├── hover: transform scale(1.05)
│
├── Background Gradient (各ムード固有)
│   ├── Calm:      linear-gradient(135deg, #667eea, #764ba2)
│   ├── Energetic: linear-gradient(135deg, #f093fb, #f5576c)
│   ├── Dreamy:    linear-gradient(135deg, #4facfe, #00f2fe)
│   ├── Fun:       linear-gradient(135deg, #43e97b, #38f9d7)
│   ├── Zen:       linear-gradient(135deg, #a18cd1, #fbc2eb)
│   └── Mystic:    linear-gradient(135deg, #6C5CE7, #FD79A8)
│
├── Emoji
│   ├── font-size: 36px (mobile) / 40px (desktop)
│   ├── position: absolute
│   ├── top: 50%, left: 50%
│   ├── transform: translate(-50%, -60%)
│   └── filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2))
│
├── Label (日本語)
│   ├── position: absolute
│   ├── bottom: 12px, left: 0, right: 0
│   ├── text-align: center
│   ├── font-family: 'Inter'
│   ├── font-size: 13px
│   ├── font-weight: 600
│   └── color: #FFFFFF
│       └── text-shadow: 0 1px 3px rgba(0,0,0,0.3)
│
└── Sub-label (英語)
    ├── position: absolute
    ├── bottom: 28px (above japanese label)
    ├── text-align: center
    ├── font-size: 11px
    ├── font-weight: 500
    └── color: rgba(255,255,255,0.8)
```

### 3.5 Quality Score（品質スコア）システム

再生数に代わる、AI生成動画の新しい評価軸。

#### スコアの算出基準

| 指標 | 重み | 説明 |
|------|------|------|
| **技術品質** | 30% | 解像度、フレームレート、ブレの少なさ、色彩の豊かさ（Mux Quality Metrics + 独自アルゴリズム） |
| **いいね率** | 25% | いいね数 / (いいね数 + 低評価数) |
| **視聴完了率** | 25% | 動画を最後まで見た人の割合（Mux Data から取得） |
| **プロンプト創造性** | 10% | プロンプトのユニーク度（LLMで分析） |
| **コメント質** | 10% | コメント数、コメントの感情分析スコア |

#### 表示デザイン

```
Quality Score 表示バリエーション:

━━ コンパクト (VideoCard内) ━━
⭐ 4.2

━━ 標準 (検索結果) ━━
⭐ 4.2 / 5.0  Quality Score

━━ 詳細 (動画再生ページ) ━━
┌─────────────────────────────────────────────┐
│  ⭐ 4.2 / 5.0  AI Quality Score             │
│                                             │
│  技術品質:       ████████░░  4.3            │
│  いいね率:       ███████░░░  87%            │
│  視聴完了率:     █████████░  4.5            │
│  プロンプト創造性: ██████░░░░  3.2           │
│  コメント質:     ███████░░░  3.8            │
│                                             │
│  📈 この動画は上位15%の品質スコアです          │
└─────────────────────────────────────────────┘
```

**Quality Score Badge スペック:**

```
QualityScoreBadge
├── Compact Variant (VideoCard)
│   ├── display: inline-flex, align-items: center, gap: 3px
│   ├── font-size: 11px
│   ├── font-weight: 600
│   ├── color: score >= 4.0 → #FFC107 (gold)
│   │         score >= 3.0 → #8B949E (silver-ish)
│   │         score <  3.0 → #7A8390 (dim)
│   └── content: "⭐ {score}"
│
├── Standard Variant (検索結果)
│   ├── display: flex, align-items: center, gap: 6px
│   ├── background: var(--color-surface-hover)
│   ├── padding: 4px 10px
│   ├── border-radius: 8px
│   ├── font-size: 13px
│   └── content: "⭐ {score} / 5.0  Quality Score"
│
└── Detailed Variant (動画再生ページ)
    ├── shadcn/ui <Card>
    ├── padding: 20px
    ├── Progress bars
    │   ├── height: 6px
    │   ├── border-radius: 3px
    │   ├── background: var(--color-border)
    │   └── fill: var(--color-primary) with width percentage
    └── Percentile text
        ├── font-size: 13px
        ├── color: var(--color-secondary) = #00D2D3
        └── margin-top: 12px
```

### 3.6 プロンプトフィーチャーカード

AI Theaterならではの独自機能: 「面白いプロンプト」に焦点を当てたコンテンツ発見。

```
┌──────────────────────────────────────────────┐
│                                              │
│  サムネイル (aspect-video)                    │
│                                              │
├──────────────────────────────────────────────┤
│                                              │
│  💬 プロンプト:                               │
│  "東京の渋谷スクランブル交差点を、                │
│   水彩画のタッチで、雨の日の                    │
│   夕方5時に描いて..."                          │
│                                              │
│  ──────────────────────────────             │
│  🧠 Runway Gen-4  ⭐ 4.5  👁 8.2K           │
│  🤖 Aurora                                   │
│                                              │
└──────────────────────────────────────────────┘
```

**PromptFeatureCard スペック:**

```
PromptFeatureCard
├── width: 320px (carousel) / 100% (grid)
├── background: var(--color-surface) = #161B22
├── border: 1px solid var(--color-border) = #30363D
├── border-radius: 12px
├── overflow: hidden
│
├── Thumbnail (same as VideoCard)
│
├── Prompt Area
│   ├── padding: 16px
│   ├── background: linear-gradient(180deg, transparent, rgba(108,92,231,0.08))
│   │
│   ├── Prompt Label
│   │   ├── font-size: 12px
│   │   ├── font-weight: 600
│   │   ├── color: var(--color-primary) = #6C5CE7
│   │   ├── margin-bottom: 8px
│   │   └── content: "💬 プロンプト:"
│   │
│   ├── Prompt Text
│   │   ├── font-family: 'Inter'
│   │   ├── font-size: 13px
│   │   ├── font-weight: 400
│   │   ├── line-height: 1.6
│   │   ├── color: var(--color-text-primary) = #F0F6FC
│   │   ├── font-style: italic
│   │   ├── display: -webkit-box
│   │   ├── -webkit-line-clamp: 3
│   │   └── overflow: hidden
│   │
│   ├── Separator
│   │   ├── height: 1px
│   │   ├── background: var(--color-border)
│   │   └── margin: 12px 0
│   │
│   └── Meta Row
│       ├── display: flex, justify-content: space-between, align-items: center
│       ├── font-size: 12px
│       └── color: var(--color-text-secondary)
```

---

## 4. コンテンツ発見の新しいUX

### 4.1 多軸評価レーダーチャート

従来の「再生回数ランキング」に代わる、多軸のコンテンツ評価:

```
評価軸:
                    技術品質
                      ▲
                     / \
                    /   \
     プロンプト創造性/─────\視聴完了率
                  / \   / \
                 /   \ /   \
          人気度 ◄─────────► コメント熱量
```

ホーム画面のフィルタとしてこれらの軸を活用:

```
┌─ フィルタチップ（横スクロール） ─────────────────────────────────┐
│ [🔥 トレンド] [⭐ 高品質] [💬 話題のプロンプト]                  │
│ [📈 急上昇] [🆕 新着] [🧪 実験的] [🎭 Calm] [⚡ Energetic]     │
└──────────────────────────────────────────────────────────────┘
```

**フィルタチップ スペック:**

```
FilterChip
├── display: inline-flex, align-items: center, gap: 4px
├── padding: 8px 16px
├── border-radius: 9999px (pill)
├── font-size: 13px
├── font-weight: 500
├── cursor: pointer
├── white-space: nowrap
├── transition: all 150ms ease
│
├── Default State
│   ├── background: var(--color-surface) = #161B22
│   ├── border: 1px solid var(--color-border) = #30363D
│   └── color: var(--color-text-secondary) = #8B949E
│
├── Hover State
│   ├── background: var(--color-surface-hover) = #1C2333
│   ├── border-color: var(--color-text-secondary)
│   └── color: var(--color-text-primary) = #F0F6FC
│
└── Active State
    ├── background: var(--color-primary) = #6C5CE7
    ├── border-color: var(--color-primary)
    └── color: #FFFFFF
```

### 4.2 「なぜおすすめ？」の透明性

YouTubeでは「なぜこの動画がおすすめされたか」が不透明。AI Theaterでは明示する:

```
┌──────────────────────────────────────────────┐
│  サムネイル                                    │
│  🤖 AI Badge                                 │
├──────────────────────────────────────────────┤
│  タイトル                                      │
│  🤖 Aurora ・ ⭐ 4.5                          │
│                                              │
│  💡 おすすめ理由:                              │
│  「Runway Gen-4 の風景動画をよく視聴している     │
│   ため」                                      │
└──────────────────────────────────────────────┘
```

**おすすめ理由タイプ:**

> **MVPデータソース定義**: 各タイプの実装フェーズ・データソース・クエリ設計の詳細は `home-recommendation-source.md` を参照。

| タイプ | 表示例 | 条件 | MVPフェーズ |
|--------|--------|------|:----------:|
| 品質重視 | 「品質スコアが高い人気動画」 | Quality Score 上位 | Phase 1 |
| 急上昇 | 「今日急上昇中の動画」 | 直近の再生増加率 | Phase 1 |
| 新着 | 「新着のAI動画」 | セクション固定テキスト | Phase 1 |
| 新着（購読） | 「購読中の Aurora の新着動画」 | 購読チャンネルの新着 | Phase 2a |
| モデル嗜好 | 「Runway の動画をよく視聴しているため」 | 同一モデルの視聴履歴 | Phase 2b |
| テーマ嗜好 | 「風景動画に興味がありそうなため」 | カテゴリの視聴傾向 | Phase 3（将来） |
| 探索 | 「新しいジャンルの発見のため」 | 意図的なバブル破壊 | Phase 3（将来） |

**Phase 1**（セクションベース固定理由）はユーザーデータ不要。未ログインでも表示可能。
**Phase 2**（ログインユーザーの購読・視聴履歴ベース）は Clerk 認証後に有効化。
**Phase 3**（高度なパーソナライズ）はユーザー数増加後に `UserPreference` テーブル導入で対応。

**RecommendationReason スペック:**

```
RecommendationReason
├── display: flex, align-items: flex-start, gap: 4px
├── margin-top: 8px
├── padding: 6px 10px
├── background: rgba(108, 92, 231, 0.06)
├── border-radius: 8px
├── border-left: 2px solid var(--color-primary)
│
├── Icon (💡)
│   └── font-size: 12px
│
└── Text
    ├── font-size: 11px
    ├── font-weight: 400
    ├── line-height: 1.4
    ├── color: var(--color-text-secondary) = #8B949E
    └── max-lines: 2
```

### 4.3 フィルターバブル対策: 「探索モード」

ユーザーが普段見ないジャンルのコンテンツを意図的にサジェストする機能:

```
┌─────────────────────────────────────────────────────┐
│  🧭 探索モード                                       │
│                                                     │
│  いつもと違うAI動画を発見しませんか？                  │
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │新ジャンル │ │新AIモデル│ │新AI Creator│             │
│  │の動画    │ │の動画    │ │の動画     │              │
│  └─────────┘ └─────────┘ └─────────┘              │
│                                                     │
│  [🔀 ランダムに1本見る]                              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

