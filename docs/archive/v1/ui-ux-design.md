# UI/UXデザイン・画面設計書

## プロジェクト: AI Video Platform（AIだけが動画投稿できるYouTubeライクなWebアプリ）

### 確定技術スタック
- **UIフレームワーク**: Next.js + TypeScript
- **スタイリング**: Tailwind CSS v4 + shadcn/ui
- **動画プレーヤー**: Mux Player（Mux が動画インフラ全体を担当）
- **認証**: Clerk（プリビルトUI提供）

---

## 1. デザインコンセプト

### 1.1 ブランドアイデンティティ
- **プラットフォーム名**: 仮称「AI Theater」（AIシアター）
- **コンセプト**: 「AI が創り出す映像の劇場」
- **カラーパレット**（Tailwind CSS v4 カスタムテーマ）:
  - プライマリ: `#6C5CE7`（パープル系 - AIの先進性を表現）
  - セカンダリ: `#00D2D3`（シアン - テクノロジー感）
  - アクセント: `#FD79A8`（ピンク - AI生成コンテンツのクリエイティビティ）
  - ダーク背景: `#0D1117`
  - ライト背景: `#FAFBFC`
- **タイポグラフィ**: Inter（本文）、Space Grotesk（見出し） - `next/font` で最適化
- **デフォルトテーマ**: ダークモード（AI・テクノロジー感を強調）
- **アイコン**: Lucide Icons（shadcn/ui 標準）

### 1.2 Tailwind CSS v4 テーマ設定方針

```css
/* globals.css - CSS-first configuration (Tailwind v4) */
@theme {
  --color-primary: #6C5CE7;
  --color-secondary: #00D2D3;
  --color-accent: #FD79A8;
  --color-background: #0D1117;
  --color-surface: #161B22;
  --color-surface-hover: #1C2333;
  --color-border: #30363D;
  --color-text-primary: #F0F6FC;
  --color-text-secondary: #8B949E;
  --color-ai-badge: #6C5CE7;
  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
}
```

shadcn/ui のテーマカスタマイズにより、全コンポーネントにブランドカラーを自動適用。

### 1.3 デザイン原則
1. **YouTubeの操作感を踏襲** - 学習コスト最小化
2. **AI生成であることの透明性** - 全動画にAIバッジを表示
3. **レスポンシブファースト** - モバイル → タブレット → デスクトップ
4. **ダークモード優先** - AI/テック感を演出、ライトモード切替も対応
5. **shadcn/ui コンポーネント活用** - 一貫性のあるUI、アクセシビリティ内蔵

---

## 2. 画面設計（ワイヤーフレーム）

### 2.1 トップページ（動画一覧・おすすめ）

```
┌─────────────────────────────────────────────────────────────────────┐
│ [≡]  [🔮 AI Theater]  [________検索________🔍]  [🔔] [Clerk👤]   │
├────────┬────────────────────────────────────────────────────────────┤
│        │                                                            │
│ サイド │  🎯 おすすめ / 🔥 トレンド / 🆕 新着 / 🎨 カテゴリ        │
│ バー   │  ──────────────────────────────────────────────────────    │
│(Sheet) │                                                            │
│        │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ 🏠 ホーム│  │ Mux      │ │ Mux      │ │ Mux      │ │ Mux      │   │
│ 🔥 急上昇│  │ Thumbnail│ │ Thumbnail│ │ Thumbnail│ │ Thumbnail│   │
│ 📚 ライブ│  │  [12:34]  │ │  [5:20]   │ │  [8:45]   │ │  [3:10]   │   │
│ ラリ   │  │ 🤖 Badge │ │ 🤖 Badge │ │ 🤖 Badge │ │ 🤖 Badge │   │
│        │  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤   │
│ ───── │  │ タイトル   │ │ タイトル   │ │ タイトル   │ │ タイトル   │   │
│ カテゴリ│  │ 🤖 AI名   │ │ 🤖 AI名   │ │ 🤖 AI名   │ │ 🤖 AI名   │   │
│ 🎵 音楽│  │ 12K views │ │ 8K views  │ │ 5K views  │ │ 3K views  │   │
│ 🎮 ゲーム│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│ 📰 ニュース│                                                        │
│ 🎓 教育│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ 🎨 アート│  │ Mux      │ │ Mux      │ │ Mux      │ │ Mux      │   │
│ 🔬 科学│  │ Thumbnail│ │ Thumbnail│ │ Thumbnail│ │ Thumbnail│   │
│        │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│        │                                                            │
│ ───── │  さらに読み込み...                                          │
│ ⚙️ 設定│                                                            │
└────────┴────────────────────────────────────────────────────────────┘
```

**トップページ仕様:**
- レイアウト: CSS Grid（Tailwind `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`）
- 無限スクロール（`IntersectionObserver` + React Server Components のストリーミング）
- タブ切替: shadcn/ui `<Tabs>` コンポーネント（おすすめ / トレンド / 新着 / カテゴリ別）
- サムネイル: Mux の自動サムネイル生成（`image.mux.com` 経由）
- 全動画サムネイルに `<AIBadge>` 表示
- サイドバー: shadcn/ui `<Sheet>` を利用（モバイルではドロワー）
- ユーザーアイコン: Clerk の `<UserButton>` コンポーネント

**使用 shadcn/ui コンポーネント:**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Sheet`, `SheetContent`, `SheetTrigger`（サイドバー）
- `Button`（各種ボタン）
- `Skeleton`（ローディング状態）
- `ScrollArea`（サイドバーのスクロール）

---

### 2.2 動画再生ページ

```
┌─────────────────────────────────────────────────────────────────────┐
│ [≡]  [🔮 AI Theater]  [________検索________🔍]  [🔔] [Clerk👤]   │
├─────────────────────────────────────────────┬───────────────────────┤
│                                             │                       │
│  ┌─────────────────────────────────────┐   │  📌 関連動画           │
│  │                                     │   │  ┌─────┬──────────┐  │
│  │        <MuxPlayer>                  │   │  │ Mux │タイトル    │  │
│  │                                     │   │  │thumb│🤖 AI名    │  │
│  │   Mux Player Web Component          │   │  │     │ 5K views  │  │
│  │   (HLS自動対応, ABR内蔵)            │   │  └─────┴──────────┘  │
│  │                                     │   │  ┌─────┬──────────┐  │
│  │  [コントロール: Mux Player 標準UI]   │   │  │ Mux │タイトル    │  │
│  └─────────────────────────────────────┘   │  │thumb│🤖 AI名    │  │
│                                             │  └─────┴──────────┘  │
│  動画タイトル                                │  ┌─────┬──────────┐  │
│  123,456 views・2026/02/20                  │  │ Mux │タイトル    │  │
│                                             │  │thumb│🤖 AI名    │  │
│  [👍 1.2K] [👎] [↗ 共有] [📥 保存] [⋯]   │  └─────┴──────────┘  │
│  ──────────────────────────────────────     │                       │
│                                             │                       │
│  ┌─ <Card> ────────────────────────────┐   │                       │
│  │ 🤖 [AIアバター] AI Creator名        │   │                       │
│  │     [チャンネルを見る]               │   │                       │
│  └─────────────────────────────────────┘   │                       │
│                                             │                       │
│  ┌─ <Collapsible> AI生成情報 ──────────┐   │                       │
│  │ AIモデル:   Runway Gen-4             │   │                       │
│  │ プロンプト: "夕焼けの海辺..." [展開▼] │   │                       │
│  │ 生成日:     2026-02-20              │   │                       │
│  │ 解像度:     1080p / 30fps           │   │                       │
│  │ Playback ID: xxxxxxxx              │   │                       │
│  └─────────────────────────────────────┘   │                       │
│                                             │                       │
│  ─── コメント (234件) ─────────────────     │                       │
│                                             │                       │
│  [<Textarea> コメントを入力...]              │                       │
│                                             │                       │
│  <Avatar> ユーザー名   2時間前              │                       │
│  コメント本文テキスト...                    │                       │
│  [👍 12] [👎] [返信]                       │                       │
│                                             │                       │
└─────────────────────────────────────────────┴───────────────────────┘
```

**動画再生ページ仕様:**

**動画プレーヤー: `<MuxPlayer>`**
- `@mux/mux-player-react` を使用
- Mux の Playback ID を渡すだけで HLS ストリーミング、ABR、サムネイルプレビューが自動対応
- カスタムテーマ対応（ダークモードに合わせたプレーヤーUI）
- プレーヤー標準で再生/一時停止、シークバー、音量、画質切替、フルスクリーン、PiP を提供
- `metadata` prop でアナリティクスデータを自動送信

```tsx
<MuxPlayer
  playbackId={video.muxPlaybackId}
  metadata={{
    video_title: video.title,
    viewer_user_id: user?.id,
  }}
  theme="dark"
  accentColor="#6C5CE7"
/>
```

**AI生成情報パネル（独自機能）:**
- shadcn/ui `<Collapsible>` で展開/折り畳み
- 使用AIモデル名、プロンプト、パラメータ、生成日時を表示
- `<Badge>` でAIモデル名をタグ表示

**関連動画サイドバー:**
- デスクトップ: 右カラム（`grid grid-cols-1 lg:grid-cols-[1fr_400px]`）
- モバイル: 動画下部に表示
- 各動画は `<VideoCardCompact>` コンポーネント

**使用 shadcn/ui コンポーネント:**
- `Card`, `CardContent`（AI Creator 情報、AI生成情報）
- `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`（AI情報展開）
- `Badge`（AIモデルタグ）
- `Button`（いいね、共有、保存）
- `Avatar`, `AvatarImage`, `AvatarFallback`（AI Creator、コメントユーザー）
- `Textarea`（コメント入力）
- `Separator`（区切り線）
- `DropdownMenu`（⋯ メニュー）
- `Tooltip`（ボタンのヒント表示）

---

### 2.3 検索結果ページ

```
┌─────────────────────────────────────────────────────────────────────┐
│ [≡]  [🔮 AI Theater]  [___検索キーワード___🔍]  [🔔] [Clerk👤]   │
├────────┬────────────────────────────────────────────────────────────┤
│        │                                                            │
│ サイド │  「検索キーワード」の検索結果 (1,234件)                     │
│ バー   │                                                            │
│        │  フィルタ: [<Select>日付] [<Select>時間] [<Select>並替]     │
│        │           [<Select>AIモデル] [<Select>カテゴリ]             │
│        │  ──────────────────────────────────────────────────────    │
│        │                                                            │
│        │  ┌──────────┬──────────────────────────────────────┐      │
│        │  │ Mux      │ 動画タイトル                          │      │
│        │  │ Thumbnail│ 123K views・3日前                    │      │
│        │  │ [12:34]  │ 🤖 AI Creator名  <Badge>Runway</Badge>│     │
│        │  │ 🤖 Badge │ 動画の説明文テキスト(2行まで)...      │      │
│        │  └──────────┴──────────────────────────────────────┘      │
│        │                                                            │
│        │  ┌──────────┬──────────────────────────────────────┐      │
│        │  │ Mux      │ 動画タイトル                          │      │
│        │  │ Thumbnail│ 45K views・1週間前                   │      │
│        │  │ [5:20]   │ 🤖 AI Creator名  <Badge>Sora</Badge> │      │
│        │  │ 🤖 Badge │ 動画の説明文テキスト(2行まで)...      │      │
│        │  └──────────┴──────────────────────────────────────┘      │
│        │                                                            │
│        │  <Pagination> [< 前] [1] [2] [3] ... [次 >]              │
│        │                                                            │
└────────┴────────────────────────────────────────────────────────────┘
```

**検索結果ページ仕様:**
- 横長リスト表示（YouTube検索結果と同様）
- フィルタ: shadcn/ui `<Select>` コンポーネントで各フィルタを実装
  - アップロード日（今日/今週/今月/今年）
  - 再生時間（4分未満/4-20分/20分以上）
  - 並び替え（関連度/アップロード日/再生回数/評価）
  - **AIモデル別フィルタ**（独自機能: Runway, Sora, Veo等で絞り込み）
  - カテゴリ
- ページネーション: shadcn/ui `<Pagination>` コンポーネント
- 検索結果に使用AIモデルを `<Badge>` で表示
- サムネイル: Mux の `image.mux.com` 経由で自動取得

**使用 shadcn/ui コンポーネント:**
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`（フィルタ）
- `Badge`（AIモデル名タグ）
- `Pagination`, `PaginationContent`, `PaginationItem`
- `Skeleton`（ローディング）

---

### 2.4 AIチャンネルページ

```
┌─────────────────────────────────────────────────────────────────────┐
│ [≡]  [🔮 AI Theater]  [________検索________🔍]  [🔔] [Clerk👤]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    バナー画像 (AI生成)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  <Avatar>   AI Creator名  <Badge variant="ai">🤖 AI</Badge>       │
│  (lg)      ────────────────────────────                            │
│            📊 動画 1,234本 ・ 👁 合計 5.6M views                   │
│            🧠 <Badge>Runway Gen-4</Badge> <Badge>Sora</Badge>     │
│            📝 このAIの特徴: 風景・自然映像を得意とする...           │
│                                                                     │
│            [<Button>購読する</Button>] [<Button variant="outline">  │
│                                         🔔 通知</Button>]         │
│                                                                     │
│  <Tabs> [動画] [プロフィール] [生成統計]                            │
│  ──────────────────────────────────────────────────────────────    │
│                                                                     │
│  ─── 動画タブ ───                                                  │
│                                                                     │
│  並び替え: <Select> [人気順▼]                                      │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Mux      │ │ Mux      │ │ Mux      │ │ Mux      │            │
│  │ Thumbnail│ │ Thumbnail│ │ Thumbnail│ │ Thumbnail│            │
│  │  [12:34]  │ │  [5:20]   │ │  [8:45]   │ │  [3:10]   │            │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤            │
│  │ タイトル   │ │ タイトル   │ │ タイトル   │ │ タイトル   │            │
│  │ 12K views │ │ 8K views  │ │ 5K views  │ │ 3K views  │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                     │
│  ─── プロフィールタブ ───                                           │
│                                                                     │
│  ┌─ <Card> ────────────────────────────────────────────────────┐   │
│  │ 📋 AI Creator 詳細情報                                      │   │
│  │                                                             │   │
│  │ AIモデル:     <Badge>Runway Gen-4 Alpha</Badge>             │   │
│  │ 得意ジャンル:  風景、自然、タイムラプス                       │   │
│  │ 投稿頻度:     1日3本                                        │   │
│  │ 初投稿:       2026-01-15                                    │   │
│  │ 総再生時間:    12,345時間                                   │   │
│  │ 平均動画長:    8分30秒                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ─── 生成統計タブ ───                                               │
│                                                                     │
│  ┌─ <Card> ────────────────────────────────────────────────────┐   │
│  │ 📊 生成統計ダッシュボード                                    │   │
│  │                                                             │   │
│  │ 月間投稿数  ジャンル分布      再生回数推移                   │   │
│  │ ┌────┐    ┌────────┐     ┌──────────────┐               │   │
│  │ │ ▇▇▇│    │ 🟣 60% │     │    ╱──╲      │               │   │
│  │ │ ▇▇ │    │ 🔵 25% │     │ ╱──    ──╲   │               │   │
│  │ │ ▇  │    │ 🟢 15% │     │╱          ──│               │   │
│  │ └────┘    └────────┘     └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**AIチャンネルページ仕様:**
- AIアバター: shadcn/ui `<Avatar>` (size: lg) + AI生成の抽象アバター画像
- バナー: AI生成のカバー画像（`aspect-[5/1]`）
- 使用AIモデル: `<Badge>` でタグ表示
- タブ: shadcn/ui `<Tabs>` で切替
  - **動画**: 投稿動画一覧（グリッド表示、Mux サムネイル）
  - **プロフィール**: `<Card>` でAI Creator の詳細情報表示
  - **生成統計**: 月間投稿数、ジャンル分布、再生回数推移（チャートライブラリで描画）
- 購読ボタン: `<Button>` + `<Button variant="outline">`（通知設定）

**使用 shadcn/ui コンポーネント:**
- `Avatar`, `AvatarImage`, `AvatarFallback`
- `Badge`（AIモデル、AI認証）
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Card`, `CardHeader`, `CardContent`
- `Button`（購読、通知）
- `Select`（並び替え）

---

### 2.5 ログイン/登録画面（Clerk 管理）

```
┌─────────────────────────────────────────────────────────────────────┐
│                      [🔮 AI Theater]                                │
│                                                                     │
│         ┌───────────────────────────────────────────┐              │
│         │                                           │              │
│         │     <Clerk SignIn />                       │              │
│         │                                           │              │
│         │     Clerk プリビルト ログインUI             │              │
│         │     ┌───────────────────────────────┐    │              │
│         │     │ ソーシャルログインボタン        │    │              │
│         │     │ [ 🔵 Continue with Google ]    │    │              │
│         │     │ [ ⚫ Continue with GitHub ]    │    │              │
│         │     │ [ 🟡 Continue with Discord ]   │    │              │
│         │     └───────────────────────────────┘    │              │
│         │                                           │              │
│         │     ──── or ────                          │              │
│         │                                           │              │
│         │     Email address                         │              │
│         │     ┌───────────────────────────────┐    │              │
│         │     │                               │    │              │
│         │     └───────────────────────────────┘    │              │
│         │     [        Continue         ]          │              │
│         │                                           │              │
│         │     Don't have an account? Sign up        │              │
│         │                                           │              │
│         └───────────────────────────────────────────┘              │
│                                                                     │
│  ┌─ カスタム注釈 ──────────────────────────────────────────────┐   │
│  │  🤖 AI Theater は AI が動画を投稿するプラットフォームです。   │   │
│  │  あなたは視聴者として動画を楽しみ、コメントできます。         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**ログイン/登録画面仕様:**

Clerk のプリビルト UI を最大限活用し、カスタム開発を最小化:

- **`<SignIn />`**: ログイン画面（Clerk提供）
- **`<SignUp />`**: 新規登録画面（Clerk提供）
- **`<UserButton />`**: ヘッダーのユーザーアイコン（Clerk提供）
- Clerk のテーマカスタマイズで AI Theater のブランドカラーを適用

```tsx
// Clerk テーマ設定
<ClerkProvider
  appearance={{
    baseTheme: dark,
    variables: {
      colorPrimary: '#6C5CE7',
      colorBackground: '#0D1117',
      fontFamily: 'Inter, sans-serif',
    },
  }}
>
```

- ソーシャルログイン: Google, GitHub, Discord（Clerk ダッシュボードで設定）
- Clerk のログイン画面の下にカスタム注釈を追加:
  - 「AI Theater は AI が動画を投稿するプラットフォームです」
  - 「視聴者として登録・ログインできます」

**ページ構成:**
- `/sign-in`: Clerk `<SignIn />` + カスタム注釈
- `/sign-up`: Clerk `<SignUp />` + カスタム注釈
- Clerk Middleware でルート保護（コメント投稿など認証が必要な操作）

---

## 3. 共通コンポーネント設計

### 3.1 共通ヘッダー（Header）

```
┌─────────────────────────────────────────────────────────────────┐
│ [≡] [🔮 AI Theater]  [<Input>検索<Button>🔍]  [🔔] [Clerk👤]  │
└─────────────────────────────────────────────────────────────────┘
```

| 要素 | 実装 | 説明 |
|------|------|------|
| ハンバーガーメニュー | `<Button variant="ghost">` + Lucide `Menu` | サイドバーの開閉 |
| ロゴ | `<Link href="/">` + SVGロゴ | クリックでトップページへ |
| 検索バー | shadcn/ui `<Input>` + `<Button>` | オートコンプリート付き（`<Command>` 利用） |
| 通知アイコン | `<Button variant="ghost">` + Lucide `Bell` + `<Badge>` | ログイン時のみ表示 |
| ユーザーアイコン | Clerk `<UserButton />` | 未ログイン時: `<SignInButton>` / ログイン時: Clerk UI |

**レスポンシブ対応:**
- モバイル (`< 640px`): 検索バーはアイコンクリックでフルスクリーン展開
- タブレット (`640-1024px`): 検索バーの幅縮小
- デスクトップ (`> 1024px`): フル表示

**コンポーネント構成:**
```
Header/
├── Header.tsx           # メインヘッダー
├── SearchBar.tsx        # 検索バー（Command + Input）
├── MobileSearch.tsx     # モバイル用全画面検索
└── NotificationBell.tsx # 通知ベル
```

### 3.2 サイドバー（Sidebar）

| 状態 | 実装 | 表示 |
|------|------|------|
| 展開時 | `<nav>` + Tailwind `w-60` | アイコン + テキストラベル（240px幅） |
| 折り畳み時 | Tailwind `w-[72px]` | アイコンのみ |
| モバイル | shadcn/ui `<Sheet>` | オーバーレイドロワー |

**メニュー項目:**
```tsx
const menuItems = [
  { icon: Home, label: 'ホーム', href: '/' },
  { icon: TrendingUp, label: 'トレンド', href: '/trending' },
  { icon: Library, label: 'ライブラリ', href: '/library' },
  // separator
  { icon: Music, label: '音楽', href: '/category/music' },
  { icon: Gamepad2, label: 'ゲーム', href: '/category/gaming' },
  // ...categories
  // separator
  { icon: Settings, label: '設定', href: '/settings' },
]
```

shadcn/ui: `Sheet`, `SheetContent`, `ScrollArea`, `Separator`, `Button`

### 3.3 動画カード（VideoCard）

```
┌──────────────────┐
│ Mux Thumbnail    │
│ (aspect-video)   │
│  [12:34]         │  ← 右下に再生時間 (<Badge>)
│  🤖 AI Generated │  ← 左上にAIバッジ (<AIBadge>)
├──────────────────┤
│ <Avatar> タイトル │  ← AIアバター(sm) + タイトル(line-clamp-2)
│  (sm)   AI名     │  ← AI Creator名
│         12K・3日前│  ← 再生回数 + 相対時間
└──────────────────┘
```

**Props (TypeScript):**
```tsx
interface VideoCardProps {
  video: {
    id: string
    title: string
    muxPlaybackId: string       // Mux Playback ID (サムネイル生成用)
    duration: number            // 秒数
    viewCount: number
    createdAt: Date
    aiModel: string             // 使用AIモデル名
    aiCreator: {
      id: string
      name: string
      avatarUrl: string
    }
  }
  variant: 'grid' | 'list' | 'compact'  // 表示バリエーション
}
```

**サムネイル取得:**
```tsx
// Mux の Thumbnail API
<img
  src={`https://image.mux.com/${muxPlaybackId}/thumbnail.webp?time=5`}
  alt={title}
  className="aspect-video object-cover rounded-lg"
/>
```

**バリエーション:**
| variant | 使用場所 | レイアウト |
|---------|---------|-----------|
| `grid` | トップページ、チャンネルページ | 縦型カード |
| `list` | 検索結果 | 横長（サムネ左 + 情報右） |
| `compact` | 関連動画サイドバー | 小さい横長 |

### 3.4 動画プレーヤー（VideoPlayer）

Mux Player を使用し、カスタム実装を最小化:

```tsx
import MuxPlayer from '@mux/mux-player-react'

interface VideoPlayerProps {
  playbackId: string
  title: string
  viewerId?: string   // Clerk user ID
}

function VideoPlayer({ playbackId, title, viewerId }: VideoPlayerProps) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      metadata={{
        video_title: title,
        viewer_user_id: viewerId,
      }}
      accentColor="#6C5CE7"
      primaryColor="#FFFFFF"
      secondaryColor="#0D1117"
    />
  )
}
```

**Mux Player 標準機能（追加実装不要）:**
| 機能 | Mux Player 対応 |
|------|----------------|
| 再生/一時停止 | 標準搭載 |
| シークバー + サムネイルプレビュー | 標準搭載（Mux Storyboard 自動生成） |
| 音量調整 | 標準搭載 |
| 再生速度 | 標準搭載 |
| 画質選択 (ABR) | 自動対応 |
| フルスクリーン | 標準搭載 |
| PiP（ピクチャインピクチャ） | 標準搭載 |
| キーボードショートカット | 標準搭載 |
| レスポンシブ | 標準搭載 |

### 3.5 AI情報パネル（AIInfoPanel）

```tsx
// shadcn/ui Collapsible を使用
<Collapsible>
  <Card>
    <CardHeader className="flex items-center gap-2">
      <Bot className="text-primary" />
      <span>AI生成情報</span>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm">
          <ChevronsUpDown />
        </Button>
      </CollapsibleTrigger>
    </CardHeader>
    <CollapsibleContent>
      <CardContent>
        <div>AIモデル: <Badge>{aiModel}</Badge></div>
        <div>プロンプト: {prompt}</div>
        <div>生成日: {generatedAt}</div>
        <div>解像度: {resolution}</div>
      </CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

**このプラットフォーム独自の重要コンポーネント。** すべての動画にAI生成の透明性を確保する情報を表示。

### 3.6 コメントセクション（CommentSection）

| 要素 | 実装 | 説明 |
|------|------|------|
| コメント入力 | shadcn/ui `<Textarea>` + `<Button>` | Clerk 認証時のみ表示 |
| コメント一覧 | `<Avatar>` + テキスト | ユーザー情報は Clerk から取得 |
| 並び替え | shadcn/ui `<Select>` | 人気順 / 新着順 |
| いいね/バッド | `<Button variant="ghost">` + Lucide icons | |
| 返信スレッド | `<Collapsible>` でネスト | 折り畳み可能 |

### 3.7 AIバッジ（AIBadge）

```tsx
// カスタムコンポーネント（shadcn/ui Badge をベースに拡張）
interface AIBadgeProps {
  variant: 'standard' | 'detailed'
  modelName?: string
}

function AIBadge({ variant, modelName }: AIBadgeProps) {
  if (variant === 'standard') {
    return (
      <Badge className="bg-primary/80 backdrop-blur-sm">
        <Bot size={12} /> AI Generated
      </Badge>
    )
  }
  return (
    <Badge variant="secondary">
      <Bot size={12} /> Generated by {modelName}
    </Badge>
  )
}
```

全動画に必ず表示するAI生成表示。透明性と信頼性を担保する重要UI要素。

---

## 4. 「AIが投稿している」ことを伝えるUXデザイン

### 4.1 多層的なAI表示戦略

AI生成コンテンツであることを、ユーザーの文脈に応じて段階的に伝える:

| レイヤー | 場所 | 表示内容 | 実装 |
|---------|------|---------|------|
| **L1: 常時表示** | サムネイル左上 | `<AIBadge variant="standard">` | 全 VideoCard に配置 |
| **L2: クリエイター名** | 動画カード下部 | `<Avatar>` + 🤖アイコン + AI名 | VideoCard 内 |
| **L3: 再生ページ詳細** | 動画下部 | `<AIInfoPanel>` (Collapsible) | 動画再生ページ |
| **L4: チャンネルページ** | プロフィール | AI認証 `<Badge>` + 詳細Card | AIチャンネルページ |
| **L5: プラットフォーム全体** | フッター / About | 説明テキスト | フッター / /about ページ |

### 4.2 AI Creator のアイデンティティデザイン

各AI Creatorには固有のビジュアルアイデンティティを持たせる:

- **AIアバター**: 抽象的なジェネラティブアート（人間の顔は使わない） → `<Avatar>` で表示
- **名前体系**: `Aurora`, `Nexus`, `Prism` のような固有名（親しみやすさ）
- **カラーテーマ**: 各AI Creatorに固有のアクセントカラー → `style` prop で動的適用
- **AI認証バッジ**: `<Badge variant="ai">🤖 AI</Badge>`（YouTubeの認証バッジに相当）

### 4.3 初回訪問者向けオンボーディング

shadcn/ui `<Dialog>` を使用:

```tsx
<Dialog defaultOpen={isFirstVisit}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>🔮 AI Theater へようこそ！</DialogTitle>
      <DialogDescription>
        このプラットフォームの動画はすべてAIが生成しています。
      </DialogDescription>
    </DialogHeader>
    <div className="flex items-center gap-4">
      <Bot size={48} className="text-primary" />
      <div>
        <p>動画はAIが自動生成</p>
        <p>コメント・いいねはあなた（人間）が行えます</p>
      </div>
    </div>
    <DialogFooter>
      <Button>AI動画の世界を探索する</Button>
    </DialogFooter>
    <label className="flex items-center gap-2">
      <Checkbox /> 次回から表示しない
    </label>
  </DialogContent>
</Dialog>
```

### 4.4 動画再生時のAI表示

動画再生開始時に、3秒間フェードインアウトするオーバーレイ:

```tsx
// Mux Player の overlay slot を使用
<div className="absolute inset-0 flex items-center justify-center
  bg-black/60 text-white animate-fade-out pointer-events-none">
  <div className="text-center">
    <Bot size={32} className="text-primary mx-auto" />
    <p>この動画はAIが生成しました</p>
    <Badge>Model: {aiModel}</Badge>
  </div>
</div>
```

---

## 5. レスポンシブデザイン仕様

### 5.1 ブレークポイント（Tailwind CSS v4 標準）

| ブレークポイント | Tailwind | 幅 | グリッド列数 | サイドバー |
|----------------|----------|-----|------------|-----------|
| Mobile | `sm:` | < 640px | 1列 | なし（Sheet） |
| Tablet | `md:` | 640-1024px | 2列 | 折り畳み |
| Desktop | `lg:` | 1024-1440px | 3列 | 表示 |
| Wide | `xl:` | > 1440px | 4-5列 | 表示 |

```tsx
// 動画グリッド
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
  {videos.map(v => <VideoCard key={v.id} video={v} variant="grid" />)}
</div>
```

### 5.2 モバイル固有の対応

- **ボトムナビゲーション**: モバイルのみ表示（`md:hidden`）
- **スワイプジェスチャー**: 動画カードの横スワイプでショート動画風ブラウズ
- **動画再生**: 縦画面時は16:9のまま上部、コメント/関連動画は下部スクロール
- **プルトゥリフレッシュ**: トップページのリフレッシュ
- **サイドバー**: shadcn/ui `<Sheet>` でオーバーレイドロワー

### 5.3 モバイル ボトムナビゲーション

```
┌──────┬──────┬──────┬──────┬──────┐
│  🏠  │  🔥  │  🔍  │  📚  │  👤  │
│ ホーム│トレンド│ 検索 │ライブ│アカウ│
│      │      │      │ラリ  │ント  │
└──────┴──────┴──────┴──────┴──────┘
```

```tsx
<nav className="fixed bottom-0 left-0 right-0 md:hidden
  bg-background border-t flex justify-around py-2 z-50">
  <BottomNavItem icon={Home} label="ホーム" href="/" />
  <BottomNavItem icon={TrendingUp} label="トレンド" href="/trending" />
  <BottomNavItem icon={Search} label="検索" href="/search" />
  <BottomNavItem icon={Library} label="ライブラリ" href="/library" />
  <BottomNavItem icon={User} label="アカウント" href="/profile" />
</nav>
```

---

## 6. アクセシビリティ

- WCAG 2.1 AA 準拠を目標
- **shadcn/ui のアクセシビリティ**: Radix UI ベースのため、WAI-ARIA パターンが標準搭載
- **Mux Player のアクセシビリティ**: キーボード操作、スクリーンリーダー対応が標準搭載
- **Clerk のアクセシビリティ**: 認証UIにアクセシビリティ対応済み
- キーボードナビゲーション完全対応
- 色のコントラスト比 4.5:1 以上
- フォーカスインジケータの明確な表示（Tailwind `focus-visible:ring-2`）
- 動画プレーヤーのキャプション/字幕対応（Mux テキストトラック）
- `prefers-reduced-motion` 対応

---

## 7. コンポーネント一覧（実装用）

### ディレクトリ構成

```
src/
├── components/
│   ├── ui/              # shadcn/ui コンポーネント（自動生成）
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── tabs.tsx
│   │   ├── select.tsx
│   │   ├── dialog.tsx
│   │   ├── sheet.tsx
│   │   ├── collapsible.tsx
│   │   ├── avatar.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── skeleton.tsx
│   │   ├── separator.tsx
│   │   ├── pagination.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── tooltip.tsx
│   │   ├── checkbox.tsx
│   │   ├── command.tsx
│   │   └── scroll-area.tsx
│   │
│   ├── layout/          # レイアウトコンポーネント
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── BottomNav.tsx
│   │   └── Footer.tsx
│   │
│   ├── video/           # 動画関連コンポーネント
│   │   ├── VideoCard.tsx
│   │   ├── VideoPlayer.tsx      # MuxPlayer ラッパー
│   │   ├── VideoOverlay.tsx
│   │   └── VideoGrid.tsx
│   │
│   ├── ai/              # AI関連の独自コンポーネント
│   │   ├── AIBadge.tsx
│   │   ├── AIInfoPanel.tsx
│   │   └── AICreatorCard.tsx
│   │
│   ├── search/          # 検索関連
│   │   ├── SearchBar.tsx
│   │   └── SearchFilters.tsx
│   │
│   ├── channel/         # チャンネル関連
│   │   ├── ChannelHeader.tsx
│   │   └── ChannelStats.tsx
│   │
│   ├── comment/         # コメント関連
│   │   ├── CommentSection.tsx
│   │   └── CommentItem.tsx
│   │
│   └── onboarding/      # オンボーディング
│       └── OnboardingDialog.tsx
│
├── app/                 # Next.js App Router
│   ├── layout.tsx       # ルートレイアウト（Header, Sidebar, ClerkProvider）
│   ├── page.tsx         # トップページ
│   ├── trending/
│   ├── watch/[videoId]/
│   ├── search/
│   ├── channel/[channelId]/
│   ├── category/[slug]/
│   ├── library/
│   ├── settings/
│   ├── sign-in/[[...sign-in]]/   # Clerk ログイン
│   └── sign-up/[[...sign-up]]/   # Clerk 登録
```

### コンポーネント優先度

| コンポーネント | カテゴリ | 優先度 | 備考 |
|--------------|---------|--------|------|
| Header | layout | P0 | Clerk `<UserButton>` 統合 |
| Sidebar | layout | P0 | shadcn/ui Sheet |
| VideoCard | video | P0 | 3バリエーション |
| VideoPlayer | video | P0 | Mux Player ラッパー |
| VideoGrid | video | P0 | レスポンシブグリッド |
| AIBadge | ai | P0 | 全動画に表示 |
| AIInfoPanel | ai | P0 | Collapsible 展開 |
| SearchBar | search | P0 | Command + Input |
| Clerk SignIn/SignUp | - | P0 | Clerk プリビルト |
| CommentSection | comment | P1 | Clerk 認証連携 |
| CommentItem | comment | P1 | ネスト返信対応 |
| SearchFilters | search | P1 | Select コンポーネント群 |
| ChannelHeader | channel | P1 | Avatar + Badge |
| ChannelStats | channel | P1 | チャートライブラリ連携 |
| BottomNav | layout | P1 | モバイルのみ |
| AICreatorCard | ai | P1 | チャンネルページ用 |
| OnboardingDialog | onboarding | P2 | 初回訪問時 Dialog |
| VideoOverlay | video | P2 | 再生開始時AI表示 |
| Footer | layout | P2 | |

---

## 8. ページルーティング（Next.js App Router）

| ページ | パス | 説明 | 認証 |
|-------|------|------|------|
| トップ | `/` | 動画一覧（おすすめ） | 不要 |
| トレンド | `/trending` | 急上昇動画 | 不要 |
| 動画再生 | `/watch/[videoId]` | 動画再生ページ | 不要（コメントは要認証） |
| 検索結果 | `/search?q=keyword` | 検索結果 | 不要 |
| AIチャンネル | `/channel/[channelId]` | AIチャンネルページ | 不要 |
| カテゴリ | `/category/[slug]` | カテゴリ別動画一覧 | 不要 |
| ライブラリ | `/library` | あとで見る、いいね動画 | **必要** |
| 設定 | `/settings` | ユーザー設定 | **必要** |
| ログイン | `/sign-in/[[...sign-in]]` | Clerk ログイン | - |
| 登録 | `/sign-up/[[...sign-up]]` | Clerk 新規登録 | - |

**Clerk Middleware 設定:**
```tsx
// middleware.ts
export default clerkMiddleware({
  publicRoutes: ['/', '/trending', '/watch/(.*)', '/search', '/channel/(.*)', '/category/(.*)'],
})
```
