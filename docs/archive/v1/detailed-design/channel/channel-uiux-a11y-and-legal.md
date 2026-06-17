# AIチャンネルページ UI/UX: アクセシビリティ・法的対応

> 元ファイル: [channel-uiux-improvements.md](channel-uiux-improvements.md) から分割（§10-17）

---

## 10. データ取得設計

### 10.1 ページデータ構成

```typescript
// /channel/[slug] のデータ取得（RSC + TanStack Query）

// Server Component (初期表示、SEO最適化)
const channel: AIChannel = await getChannel(channelId)
const channelStats: ChannelStatistics = await getChannelStats(channelId)
const agentSpecs: AIAgentSpecs = await getAgentSpecs(channelId)

// Client Component (動的フィルタリング)
// MoodFilterBar の選択変更時に TanStack Query で再取得
const { data: videos } = useQuery({
  queryKey: ['channel-videos', channelId, selectedMood, sortOrder],
  queryFn: () => getChannelVideos(channelId, { mood: selectedMood, sort: sortOrder }),
})
```

### 10.2 Quality Score 変換（統一ルール）

```typescript
// DB: 0-100 integer → UI: 0.0-5.0 float (小数第1位)
const toUIScore = (dbScore: number): string =>
  (dbScore / 20).toFixed(1)

// 例:
// DB: 92 → UI: "4.6"
// DB: 74 → UI: "3.7"
// DB: 100 → UI: "5.0"
```

---

## 11. アクセシビリティ（WCAG AA チェックリスト）

> NFR-ISSUE-1 対応: キーボード操作・スクリーンリーダー・コントラストを統合したチェックリストとして整備。

### 11.1 ARIA ロール・属性

| 要素 | 実装 |
|------|------|
| ChannelHeader Subscribe Button | `aria-pressed={isSubscribed}` でトグル状態を通知 |
| MoodFilterBar | `role="group"` + `aria-label="ムードフィルタ"` |
| FilterChip Active | `aria-pressed={true/false}` |
| ChannelStatsDashboard StatCard | `aria-label="{label}: {value}"` |
| Quality Score Gauge | `role="meter"` + `aria-valuenow` + `aria-valuemin=0` + `aria-valuemax=100` |
| AIAgentSpecsPanel Collapsible | shadcn/ui Collapsible 標準 `aria-expanded` + `aria-controls` |
| ChannelVideoGrid Empty State | `aria-live="polite"` でフィルタ結果なしを読み上げ |
| Tab Bar | shadcn/ui Tabs 標準 `role="tablist"` + `role="tab"` + `aria-selected` |
| RankedVideoCard Rank | `aria-label="ランキング {rank}位: {title}"` |
| C2PA Verification Badge | `aria-label="C2PA 認証済み: クリックで詳細を見る"` （§16 参照） |
| EU AI Act ラベル | `aria-label="AI生成コンテンツ"` + スクリーンリーダー用テキスト（§15 参照） |
| エラー発生時 | `aria-live="assertive"` + `role="alert"` でエラーを即時読み上げ |
| Subscribe 成功 | `aria-live="polite"` で "購読しました" を読み上げ |

### 11.2 キーボード操作

| 操作 | 要件 | 実装 |
|------|------|------|
| **Tab 順序** | 視覚的レイアウト順（左→右、上→下）と一致すること | DOM 順序を視覚と合わせる、`tabindex` は原則使用しない |
| **Skip link** | ページ先頭に「メインコンテンツへスキップ」リンクを設置 | `<a href="#main-content" className="sr-only focus:not-sr-only">` |
| **Tab Bar** | ← → キーでタブ切り替え（shadcn/ui Tabs 標準動作） | shadcn/ui `Tabs` に委譲 |
| **FilterChip** | Space キーでアクティブ切り替え | `role="button"` + `onKeyDown` |
| **Subscribe Button** | Enter / Space で購読アクション | shadcn/ui `Button` に委譲 |
| **MoodFilterBar overflow** | Tab で "もっと見る" に到達し Enter で Popover を開く | Popover は `trapFocus` 有効 |
| **ChannelDescription toggle** | Enter / Space で展開・折りたたみ | shadcn/ui `Collapsible` に委譲 |
| **フォーカス可視化** | 全インタラクティブ要素に `:focus-visible` リングを表示 | `outline: 2px solid #8B7CF8; outline-offset: 2px;` |

### 11.3 コントラスト比（WCAG AA 4.5:1 以上）

| 要素 | 前景色 | 背景色 | 比率 | 判定 |
|------|--------|--------|------|------|
| チャンネル名 | #F0F6FC | #0D1117 | 17.39:1 | ✅ |
| AI Model Badge | #00D2D3 | #0D1117 | 10.06:1 | ✅ |
| Description | #8B949E | #0D1117 | 6.15:1 | ✅ |
| TabsTrigger active | #F0F6FC | #0D1117 | 17.39:1 | ✅ |
| StatCard 数値 | #F0F6FC | #1C2333 | ~13.5:1 | ✅ |
| StatCard ラベル | #8B949E | #1C2333 | ~4.63:1 | ✅ |
| FilterChip active text | #FFFFFF | #6C5CE7 | 4.86:1 | ✅ |
| text-tertiary (on #0D1117) | #7A8390 | #0D1117 | 5.05:1 | ✅ |
| text-tertiary (on #161B22) | #7A8390 | #161B22 | 4.62:1 | ✅ |
| EU AI Act ラベル (§15) | #FFFFFF | #6C5CE7 w/ opacity 0.85 | ~4.2:1 → text は白のみ使用 | ⚠️ 背景+0px blur で確保 |
| C2PA Verified badge | #3FB950 | #161B22 | 7.13:1 | ✅ |

### 11.4 スクリーンリーダー対応

| シナリオ | 実装 |
|----------|------|
| ページ読み込み完了 | `<h1>` にチャンネル名を設定（VoiceOver / NVDA でページ特定） |
| 動画フィルタ変更 | MoodFilterBar の結果件数を `aria-live="polite"` で通知（例: "Calm の動画 5件"） |
| 購読ボタン押下 | `aria-live="polite"` で "Aurora を購読しました" を読み上げ |
| フォームエラー / ネットワークエラー | `aria-live="assertive"` + `role="alert"` で即時読み上げ |
| Subscribe ローディング中 | `aria-busy="true"` + `aria-label="購読処理中"` に変更 |
| C2PA 詳細 Panel 開閉 | `aria-expanded` + `aria-live="polite"` で開閉状態を読み上げ |

### 11.5 WCAG AA 受入基準チェックリスト

```
チャンネルページ WCAG 2.1 Level AA 受入基準

キーボード操作:
  □ すべてのインタラクティブ要素がキーボードで操作可能
  □ Skip link が Tabキー最初のフォーカスで現れる
  □ Tab 順序が視覚的レイアウト順と一致する
  □ フォーカスリングが全要素で視覚的に確認できる（:focus-visible）
  □ モーダル・Popover 内でフォーカスがトラップされる
  □ モーダル・Popover は Esc キーで閉じられる

スクリーンリーダー:
  □ <h1> がチャンネル名を持つ
  □ Tab Bar が role="tablist" で構成されている
  □ MoodFilterBar が role="group" + aria-label を持つ
  □ エラー発生時に aria-live="assertive" でアナウンス
  □ 動的コンテンツ変更時に aria-live="polite" でアナウンス
  □ アイコンのみのボタンに aria-label がある

コントラスト（WCAG AA 4.5:1 以上）:
  □ 全テキスト要素が 4.5:1 以上（§11.3 参照）
  □ UI コンポーネントのフォーカスインジケーターが 3:1 以上
  □ EU AI Act ラベル（§15）のコントラスト確認済み

その他:
  □ 画像に alt 属性（チャンネルアバター: "Aurora のアバター" 等）
  □ テキスト拡大 200% でレイアウト破綻しない
  □ 色のみに依存した情報伝達がない（アイコン + テキストで補完）
```

---

## 12. デザイントークン準拠事項

### 12.1 共有デザイントークン（home-uiux-improvements.md §6 との統一）

本ドキュメントはすべて `home-uiux-improvements.md §6` に定義された
デザイントークンを使用する。新規の色値は導入しない。

| 使用箇所 | トークン | 値 |
|---------|----------|-----|
| モデルバッジ border/color | `--color-secondary` | `#00D2D3` |
| AI生成コスト統計 アイコン | `--color-accent` | `#FD79A8` |
| Quality Score avg ゲージ fill | `--color-quality-gold` | `#FFC107` |
| AIAgentSpecsPanel ムードタグ（Mystic） | `--color-primary` | `#6C5CE7` |

### 12.2 text-tertiary の使用制限

```
⚠️ text-tertiary = #7A8390 は --color-surface (#161B22) 背景上での
コントラスト比が 4.5:1 ギリギリであるため、以下のルールを適用する:

✅ 使用可: --color-background (#0D1117) 背景上（コントラスト比 ≥ 4.5:1）
❌ 使用不可: --color-surface (#161B22) 背景上でのボディテキスト
→ 代替: text-secondary (#8B949E) を使用（コントラスト比 5.71:1 ✅）

本ドキュメントでは StatCard の Label 等に text-secondary を使用している。
```

---

## 13. 実装優先度

| コンポーネント | 優先度 | 理由 |
|--------------|--------|------|
| ChannelHeader (Avatar, Name, Subscribe) | **P0** | ページの核心・SEO |
| ChannelTabPanel (3タブ基本構造) | **P0** | ナビゲーション基盤 |
| ChannelVideoGrid + VideoCard 再利用 | **P0** | コンテンツ表示の核心 |
| ChannelBanner | **P0** | 視覚的ブランディング |
| MoodFilterBar | **P1** | コンテンツ発見の改善 |
| SortControls | **P1** | ユーザーコントロール |
| ChannelStatsDashboard | **P1** | AI Theater 独自価値 |
| AIAgentSpecsPanel (モデル + ムード表示) | **P1** | AI Theater 差別化 |
| RankedVideoCard + TopVideosTab | **P1** | Quality Score 可視化 |
| AIAgentSpecsPanel (Quality Score 分布ゲージ) | **P2** | データ蓄積が必要 |
| AIAgentSpecsPanel (生成パターン統計) | **P2** | データ蓄積が必要 |
| AboutTab 2カラムレイアウト | **P2** | Wide画面での改善 |

---

## 14. ホーム画面・動画再生ページとの設計整合性

| 観点 | 統一方針 | 参照 |
|------|----------|------|
| タブUI採用（サイドバー廃止） | ✅ 全画面統一 | ISSUE-VR-1 教訓 |
| デザイントークン | ✅ home-uiux-improvements.md §6 準拠 | §12.1 |
| Quality Score スケール変換 | ✅ DB: 0-100 → UI: 0.0-5.0 (÷20) | §10.2 |
| VideoCard コンポーネント再利用 | ✅ variant指定で再利用 | §9.1 |
| AIBadge スタイル | ✅ home仕様と同一 | §9.1 |
| MoodFilterBar | ✅ ホーム画面ムードカードと同一概念 | home §3.4 |
| text-tertiary コントラスト制限 | ✅ §12.2 で制約明示 | team-config.md §9.2 |

---

## 15. EU AI Act 表示義務対応 UI 設計（LEGAL-ISSUE-1）

> **対応方針**: MVP 最低限の対応として「AI生成コンテンツ」ラベルを常時表示する。
> 完全な適合評価（リスク分類・技術文書整備）は Phase 2 で実施。

### 15.1 規制要件の概要

EU AI Act（2024年施行、2026年段階的義務化）により、
AI生成コンテンツ（動画・画像）には **明示的な生成元表示** が義務付けられる。
AI Theater は全コンテンツが AI 生成であるため、チャンネル・動画の両レイヤーで対応する。

### 15.2 チャンネルページでのラベル表示

#### 表示位置

| 位置 | 表示内容 | 表示条件 |
|------|---------|---------|
| **ChannelProfile の AI Model Badge 隣** | "AI生成チャンネル" バッジ | 常時表示 |
| **ChannelBanner 左下（オーバーレイ）** | "🤖 AI生成コンテンツ" | 常時表示 |
| **各 VideoCard サムネイル上** | 既存 AIBadge（"AI Generated"） | 常時表示（home設計と統一） |

#### AILegalLabel コンポーネント設計

```
AILegalLabel (ChannelProfile 内 Name Row に追加)
├── Display: inline-flex, align-items: center, gap: 4px
├── Background: rgba(108, 92, 231, 0.15)
├── Border: 1px solid rgba(108, 92, 231, 0.40)
├── Border-radius: 4px (pill ではなく rect — 法的ラベルとして視認性重視)
├── Padding: 3px 8px
├── Font: Inter, 11px, weight 600
├── Color: #8B7CF8 (primary-text)
└── Content: 多言語対応（i18n）
    ├── ja: "AI生成コンテンツ"
    └── en: "AI-Generated Content"
```

#### BannerAILabel（バナー左下）

```
BannerAILabel (ChannelBanner 内 absolute 配置)
├── Position: absolute, bottom: 12px, left: 16px
├── Display: inline-flex, align-items: center, gap: 6px
├── Background: rgba(0, 0, 0, 0.65)
├── Backdrop-filter: blur(4px)
├── Border-radius: 6px
├── Padding: 4px 10px
├── Font: Inter, 12px, weight 600, color: #FFFFFF
├── Icon: Lucide Bot, 13px, #8B7CF8
└── Content (i18n):
    ├── ja: "🤖 AI生成コンテンツ"
    └── en: "🤖 AI-Generated Content"
```

### 15.3 多言語対応方針（i18n）

```typescript
// locales/ja.json
{
  "ai_label.channel": "AI生成コンテンツ",
  "ai_label.banner": "AI生成コンテンツ",
  "ai_label.video_card": "AI"
}

// locales/en.json
{
  "ai_label.channel": "AI-Generated Content",
  "ai_label.banner": "AI-Generated Content",
  "ai_label.video_card": "AI"
}

// 使用例 (next-intl 想定)
const t = useTranslations()
<AILegalLabel label={t('ai_label.channel')} />
```

### 15.4 実装優先度

| コンポーネント | 優先度 | 対応フェーズ |
|--------------|--------|------------|
| AILegalLabel (ChannelProfile) | **P0** | MVP（法的義務） |
| BannerAILabel | **P0** | MVP（法的義務） |
| VideoCard AIBadge (既存) | **P0** | 既実装済み（home設計） |
| 完全な EU AI Act 適合評価 | — | Phase 2 |

---

## 16. C2PA 対応 UI 設計（LEGAL-ISSUE-2）

> **対応方針**: MVP では C2PA 認証情報の **表示** のみ実装。
> 検証処理（バックエンド C2PA ライブラリ呼び出し）は Phase 2 で実装。

### 16.1 C2PA Verification Badge

#### 表示位置

| 位置 | 表示条件 | 内容 |
|------|---------|------|
| **ChannelProfile の Stats Row 末尾** | `c2paVerified=true` の動画が存在する場合 | "✓ C2PA 認証" バッジ |
| **各 VideoCard のサムネイル右下** | 動画個別の `c2paManifestUrl` が存在する場合 | 盾アイコン |
| **動画再生ページ AIInfoPanel** | 既存 video-player 設計の C2PA 行（流用） | — |

#### C2PABadge コンポーネント設計

```
C2PABadge (ChannelProfile Stats Row 末尾に追加)
├── Display: inline-flex, align-items: center, gap: 4px
├── Background: rgba(63, 185, 80, 0.12)
├── Border: 1px solid rgba(63, 185, 80, 0.30)
├── Border-radius: 9999px
├── Padding: 3px 10px
├── Font: Inter, 12px, weight 600, color: #3FB950 (success)
├── Icon: Lucide ShieldCheck, 13px, #3FB950
├── Content: "C2PA 認証"
├── cursor: pointer
└── onClick: → ProvenanceInfoPanel を開く（下記参照）

Aria: aria-label="C2PA 認証済み: クリックで詳細を見る"
```

#### C2PA 欠損時の表示

```
C2PA 欠損パターンと表示:

1. c2paManifestUrl が null（生成時に付与されなかった）
   → バッジ非表示（サイレント）

2. c2paManifestUrl が存在するが検証未実施（MVP）
   → バッジ非表示（Phase 2 で検証後に表示）

3. 検証失敗（Phase 2 以降）
   → "未検証" バッジ（Lucide ShieldAlert, #D29922, warning色）
   → Tooltip: "C2PA 検証に失敗しました"
```

### 16.2 ProvenanceInfoPanel

```
ProvenanceInfoPanel (shadcn/ui Sheet または Dialog)
├── Trigger: C2PABadge のクリック
├── Title: "コンテンツ出所情報（C2PA）"
│   ├── Font: Space Grotesk, 18px, 700, text-primary
│   └── Sub: "このコンテンツの生成・編集履歴", 14px, text-secondary
│
├── Content Sections:
│   ├── 生成者情報
│   │   ├── Label: "生成AIエージェント"
│   │   └── Value: "{channelName}（{primaryModel}）"
│   │
│   ├── 生成日時
│   │   ├── Label: "生成日時"
│   │   └── Value: "{createdAt 完全形式}"
│   │
│   ├── 使用モデル
│   │   ├── Label: "生成モデル"
│   │   └── Value: <Badge>{aiModel}</Badge>
│   │
│   ├── Manifest URL（Phase 2）
│   │   ├── Label: "C2PA Manifest"
│   │   └── Value: <a href={c2paManifestUrl}>検証ページで確認 ↗</a>
│   │               color: #8B7CF8 (primary-text)
│   │
│   └── 免責事項（MVP向け）
│       ├── Background: rgba(210, 153, 34, 0.08) (warning tint)
│       ├── Border-left: 3px solid #D29922
│       ├── Padding: 12px
│       └── Text: "現在 C2PA 検証は未実施です。Phase 2 で自動検証を実装予定。"
│           Font: Inter, 12px, #D29922
│
└── Close Button: shadcn/ui Dialog の標準 X ボタン
```

### 16.3 実装優先度

| 機能 | 優先度 | 対応フェーズ |
|------|--------|------------|
| C2PABadge 表示（c2paManifestUrl 存在時のみ） | **P1** | MVP |
| ProvenanceInfoPanel（基本情報表示） | **P1** | MVP |
| C2PA バックエンド検証処理 | — | Phase 2 |
| 検証失敗時の "未検証" バッジ | — | Phase 2 |

---

## 17. 非公開チャンネル UI 仕様（USR-ISSUE-2）

> **方針**: `isActive=false` のチャンネルへのアクセスは **404 を返す**。
> チャンネルの存在自体を開示しない（情報漏えい防止）。

### 17.1 仕様定義

```
非公開チャンネルアクセス時の挙動:

URL: /channel/{slug}

条件                         | レスポンス
-----------------------------|---------------------------------------------------
channel が存在しない          | 404 Not Found → /not-found ページ
channel.isActive = false      | 404 Not Found → /not-found ページ（存在を開示しない）
channel.isActive = true       | 200 OK → 通常チャンネルページ表示
```

**重要**: `isActive=false` の場合に 403 や「非公開です」メッセージを返すと
チャンネルの存在が判明するため、必ず 404 に統一する。

### 17.2 Next.js 実装方針

```typescript
// app/channel/[slug]/page.tsx (Server Component)

export default async function ChannelPage({ params }: { params: { slug: string } }) {
  const channel = await getChannel(params.slug)

  // isActive=false も含めて 404 に統一（存在を開示しない）
  if (!channel || !channel.isActive) {
    notFound() // → Next.js 404 ページ
  }

  return <ChannelPageContent channel={channel} />
}
```

### 17.3 404 ページ UI（チャンネル用）

```
ChannelNotFoundPage (/not-found または dedicated 404)
├── Container: flex column, align-items: center, justify-content: center, min-h: 60vh
├── Icon: Lucide MonitorOff, 64px, color: #30363D
├── Title: "チャンネルが見つかりません"
│   └── Font: Space Grotesk, 24px, 700, text-primary
├── Sub: "URLをご確認いただくか、ホームに戻ってください。"
│   └── Font: Inter, 16px, text-secondary
└── CTA Button: "ホームに戻る"
    └── href: "/" (shadcn/ui Button variant="outline")
```

### 17.4 受入基準

```
受入基準:
  □ /channel/{存在しないslug} にアクセスすると 404 を返す
  □ /channel/{isActive=false チャンネルのslug} にアクセスすると 404 を返す
  □ 404 レスポンスボディに "非公開" "存在" などの文言を含まない
  □ HTTP ステータスコードが 404 である（3xx リダイレクトではない）
  □ Next.js の notFound() を使用し、SEO 的にも正しく 404 を返す
```

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-26 | 1.0 | 初版作成（競合課題分析・AIチャンネル独自UI・タブ設計・コンポーネント定義） | designer |
| 2026-02-27 | 2.0 | LEGAL-ISSUE-1: EU AI Act 表示義務UI追加（§15）、LEGAL-ISSUE-2: C2PA対応UI追加（§16）、USR-ISSUE-2: 非公開チャンネル仕様追加（§17）、NFR-ISSUE-1: アクセシビリティチェックリスト拡充（§11） | designer |
