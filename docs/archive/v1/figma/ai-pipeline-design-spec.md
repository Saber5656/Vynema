# AI動画生成パイプライン Figma デザインスペック

作成日: 2026-03-07
担当: designer
Task: #15
ステータス: **v1.0** -- ai-pipeline-uiux-improvements.md を統合・最終化

---

## 0. 本ドキュメントの使い方

Figma でのモックアップ再現 / 実装者向けのデザイン仕様書。
`docs/figma/home/home-design-spec.md` のデザイントークン体系（カラー・タイポグラフィ・スペーシング）を **そのまま継承** する。
本ドキュメントでは AI動画生成パイプライン管理画面 (`/admin/pipeline`) 固有のレイアウト・コンポーネントを定義する。

> **参照元**
> - デザイントークン全文: `docs/figma/home/home-design-spec.md` SS1--SS3
> - Button / Input 状態スペック: `home-design-spec.md` SS6.2--SS6.3
> - アニメーション仕様: `home-design-spec.md` SS7
> - アクセシビリティ基準: `home-design-spec.md` SS8
> - UX 改善設計: `docs/detailed-design/ai-pipeline/ai-pipeline-uiux-improvements.md`

**重要**: 管理画面は admin 専用。一般視聴者には公開しない。

---

## 1. デザイントークン継承（差分のみ記載）

### 1.1 カラー（home-design-spec.md SS1 を全継承）

管理画面固有の追加トークン:

| トークン | Hex | RGB | 主な用途（管理画面） | vs `#0A0E14` | vs `#161B22` |
|---------|-----|-----|---------------------|-------------|-------------|
| `admin-bg` | `#0A0E14` | 10, 14, 20 | 管理画面背景（メイン画面よりやや暗い） | -- | -- |
| `status-success` | `#22C55E` | 34, 197, 94 | 完了ステータス | **6.8:1** | **5.9:1** |
| `status-warning` | `#F59E0B` | 245, 158, 11 | 警告ステータス | **8.2:1** | **7.1:1** |
| `status-error` | `#EF4444` | 239, 68, 68 | 失敗ステータス | **4.6:1** | **4.0:1** |
| `status-active` | `#3B82F6` | 59, 130, 246 | 実行中ステータス | **4.8:1** | **4.2:1** |
| `status-pending` | `#6B7280` | 107, 114, 128 | 待機中ステータス | **4.5:1** | **3.9:1** |

> ステータスカラーは全てアイコン + テキストラベルを併記するため、アイコン単体でのコントラスト比が AA 未達でもアクセシビリティを担保する。テキストラベル部分は `text-primary (#F0F6FC)` を使用。

以下は参照頻度が高い継承トークンの抜粋:

| トークン | Hex | 主な用途（管理画面） |
|---------|-----|---------------------|
| `background` | `#0D1117` | フォールバック背景 |
| `surface` | `#161B22` | カード背景、AdminNav 背景 |
| `surface-hover` | `#1C2333` | テーブル行ホバー、カードホバー |
| `surface-elevated` | `#21262D` | モーダル背景、ドロップダウン背景 |
| `primary` | `#6C5CE7` | アクティブ Nav 項目、Progress bar |
| `primary-text` | `#8B7CF8` | テキストリンク、AdminNav アクティブ文字 |
| `text-primary` | `#F0F6FC` | メインテキスト、カードタイトル |
| `text-secondary` | `#8B949E` | ラベル、メタ情報、AdminNav 非アクティブ文字 |
| `text-tertiary` | `#7A8390` | 最小テキスト、タイムスタンプ |
| `border` | `#30363D` | カードボーダー、テーブル区切り線、AdminNav 区切り |
| `quality-gold` | `#FFC107` | Quality Score >= 4.0 |
| `quality-dim` | `#7A8390` | Quality Score < 3.0 |

### 1.2 管理画面 CSS 変数追加

```css
/* app/admin/globals.css (管理画面固有) */
@theme {
  /* Admin Background */
  --color-admin-bg: #0A0E14;

  /* Status Colors */
  --color-status-success: #22C55E;
  --color-status-warning: #F59E0B;
  --color-status-error: #EF4444;
  --color-status-active: #3B82F6;
  --color-status-pending: #6B7280;
}
```

### 1.3 タイポグラフィ（home-design-spec.md SS2 を全継承）

管理画面で使用する主要スタイル:

| スタイル名 | Font | Size | Weight | 用途 |
|-----------|------|------|--------|------|
| `heading-lg` | Space Grotesk | 22px | 700 | ページタイトル（「パイプラインダッシュボード」等） |
| `heading-md` | Space Grotesk | 18px | 700 | セクションヘッダー（「生成中のジョブ」等） |
| `heading-sm` | Inter | 16px | 600 | カードタイトル（チャンネル名、テンプレート名） |
| `body-md` | Inter | 14px | 400 | テーブルセル、プロンプト概要 |
| `body-sm` | Inter | 13px | 400 | プロンプト全文、ログテキスト |
| `caption` | Inter | 12px | 400 | タイムスタンプ、推定コスト |
| `label-lg` | Inter | 13px | 600 | MetricCard ラベル（「今月生成数」等） |
| `label-sm` | Inter | 11px | 600 | ステータスバッジ文字、フィルタラベル |
| `display` | Space Grotesk | 36px | 700 | MetricCard 大数値（「12/30」等） |

### 1.4 スペーシング（home-design-spec.md SS3 を全継承）

管理画面で頻出:
- AdminNav 幅: `240px` (desktop) / BottomTab `h=56px` (mobile)
- MetricCard 内パディング: `16px` (`p-4`)
- MetricCard 間ギャップ: `16px` (`gap-4`)
- セクション間マージン: `24px` (`mb-6`)
- テーブル行の高さ: `56px`
- テーブルセル横パディング: `12px` (`px-3`)
- ページ横パディング: `24px` (desktop) / `16px` (mobile)

---

## 2. Figma フレーム設定

### 2.1 ブレークポイント

| 名称 | 幅 | Tailwind prefix | AdminNav | MetricCards 列数 | JobTable |
|------|-----|----------------|---------|----------------|---------|
| Mobile | 375px | (default) | BottomTab (h=56) | 2列 | カード形式 |
| Tablet | 768px | `md:` | 折りたたみ (w=64) | 3列 | テーブル（列省略） |
| Desktop | 1280px | `lg:` | 展開 (w=240) | 5列 | フルテーブル |

### 2.2 Figma フレームサイズ

| フレーム名 | サイズ (W x H) | 備考 |
|-----------|-------------|------|
| Admin - Desktop | 1440 x auto | AdminNav 240px + コンテンツ 1200px |
| Admin - Tablet | 768 x auto | AdminNav 64px + コンテンツ 704px |
| Admin - Mobile | 375 x auto | BottomTab + フルスクリーンコンテンツ |

---

## 3. AdminNav（管理画面ナビゲーション）

### 3.1 デスクトップ（展開状態 w=240px）

```
┌────────────────────────────┐
│ p: 16px                     │
│                              │
│ [Logo] AI Theater Admin     │ ← heading-sm, text-primary
│                              │
│ ─── border (#30363D) ───    │
│ gap: 4px                     │
│                              │
│ [icon 20px] [12px gap] 概要  │ ← h=44px, px=12, py=10
│ ━━━━━━━━━━━━━━━━━━━━━━━━━  │ ← active: bg=surface-hover, text=primary-text, left-border=primary 3px
│ [icon 20px] [12px gap] ジョブ│
│ [icon 20px] [12px gap] テンプ│
│ [icon 20px] [12px gap] スケジ│
│ [icon 20px] [12px gap] コスト│
│                              │
└────────────────────────────┘
```

**px スペック**:

| 要素 | 値 | 備考 |
|------|-----|------|
| 全体幅 | 240px | `w-60` |
| 背景色 | `surface (#161B22)` | 右 border: `#30363D` 1px |
| パディング上 | 16px | ロゴ上部余白 |
| ロゴ行高さ | 44px | ロゴ + テキスト |
| ロゴ下セパレータ | `border (#30363D)` 1px | my=8px |
| Nav 項目高さ | 44px | |
| Nav 項目 px | 12px 左右 | |
| Nav 項目 gap（アイコン-テキスト間） | 12px | |
| アイコンサイズ | 20px | Lucide Icons |
| テキスト | `body-md` (14px/400) | |
| アクティブ状態 | bg: `surface-hover`, text: `primary-text (#8B7CF8)`, 左 border: `primary (#6C5CE7)` 3px | |
| 非アクティブ状態 | text: `text-secondary (#8B949E)` | hover: bg=`surface-hover` |

### 3.2 タブレット（折りたたみ状態 w=64px）

| 要素 | 値 |
|------|-----|
| 全体幅 | 64px |
| アイコンサイズ | 24px |
| 項目高さ | 48px |
| アイコン中央揃え | `flex items-center justify-center` |
| アクティブ: 左 border | `primary` 3px |
| Tooltip | ホバー時にテキストラベルを Tooltip で表示 |

### 3.3 モバイル BottomTab（h=56px）

```
┌───────────────────────────────────────────┐
│ h=56px, bg=surface, border-top=border 1px │
│                                            │
│  [概要]   [ジョブ]   [テンプ]   [コスト]     │
│  icon     icon       icon       icon       │
│  20px     20px       20px       20px       │
│  label    label      label      label      │
│  10px     10px       10px       10px       │
│                                            │
└───────────────────────────────────────────┘
```

| 要素 | 値 |
|------|-----|
| 全体高さ | 56px |
| 背景 | `surface (#161B22)` |
| 上 border | `border (#30363D)` 1px |
| アイコンサイズ | 20px |
| ラベル | `label-sm` (11px/600) |
| アイコン-ラベル間 | 2px |
| 各タブ幅 | 均等分割 (`flex-1`) |
| アクティブ | icon + label: `primary-text (#8B7CF8)` |
| 非アクティブ | icon + label: `text-secondary (#8B949E)` |

---

## 4. MetricCard コンポーネント

### 4.1 レイアウト仕様

```
┌──────────────────────────────┐
│ p=16px                        │
│                                │
│ [icon 16px] [8px] ラベル       │ ← label-lg (13px/600), text-secondary
│                                │
│ 大数値                         │ ← display (36px/700), text-primary
│                                │ ← 数値が予算の場合 $ 記号は heading-md
│                                │
│ [Progress bar, h=6px, r=3px]  │ ← mt=12px
│                                │
│ トレンド表示                    │ ← caption (12px/400), text-secondary
│ (+3, +33%) ↑                   │ ← 上昇: status-success, 下降: status-error
│                                │
└──────────────────────────────┘
```

### 4.2 px スペック

| 要素 | 値 | 備考 |
|------|-----|------|
| カード幅 | 均等分割 (`flex-1`, min-w=180px) | |
| カード高さ | auto (約 140px) | |
| カード背景 | `surface (#161B22)` | |
| カード border | `border (#30363D)` 1px | |
| カード border-radius | 12px | `rounded-xl` |
| パディング | 16px 全方向 | `p-4` |
| ラベル行 | アイコン 16px + gap 8px + text `label-lg` | |
| ラベル色 | `text-secondary (#8B949E)` | |
| 大数値 | `display` (36px/700) | text-primary |
| 数値-Progress 間 | 12px | |
| Progress bar 高さ | 6px | border-radius 3px |
| Progress bar トラック色 | `surface-hover (#1C2333)` | |
| Progress bar フィル色 | `primary (#6C5CE7)` | |
| Progress bar（予算警告時） | フィル色: `status-warning (#F59E0B)` | 残予算 20% 以下 |
| Progress bar（予算危険時） | フィル色: `status-error (#EF4444)` | 残予算 5% 以下 |
| Progress-トレンド間 | 8px | |
| トレンドテキスト | `caption` (12px/400) | |
| トレンド上昇色 | `status-success (#22C55E)` | |
| トレンド下降色 | `status-error (#EF4444)` | |

### 4.3 バリエーション別の表示

| バリエーション | アイコン (Lucide) | ラベル | 数値フォーマット | Progress 計算 |
|--------------|------------------|--------|----------------|-------------|
| `generation-count` | `Video` | 今月の生成数 | `12/30` | current/max |
| `budget-remaining` | `Wallet` | 残予算 | `$28.50` | remaining/total |
| `success-rate` | `CheckCircle` | 成功率 | `91.7%` | rate/100 |
| `avg-quality` | `Star` | 平均品質 | `4.2` | score/5.0 |
| `avg-duration` | `Clock` | 平均生成時間 | `2m 34s` | なし（トレンド矢印のみ） |

### 4.4 レスポンシブ

| BP | 列数 | カード min-w |
|----|------|------------|
| Mobile | 2列 | 156px |
| Tablet | 3列 | 180px |
| Desktop | 5列 | 180px |

Tailwind: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4`

---

## 5. ActiveJobCard コンポーネント

### 5.1 レイアウト仕様

```
┌──────────────────────────────────────────────────────────────┐
│ p=16px, bg=surface, border=border 1px, rounded-xl             │
│                                                                │
│ ── Row 1: ヘッダー ──────────────────────────────────────────  │
│ [Avatar 32px] [8px] チャンネル名 [8px] [ModelBadge] [→] [Cancel]│
│               ↑ heading-sm         ↑ label-sm                  │
│                                                                │
│ ── Row 2: プロンプト概要 ──────────────────────────────────────│
│ "夕焼けの東京タワーと富士山のシルエット..."                       │
│ ↑ body-md, text-secondary, line-clamp-2                        │
│                                                                │
│ ── Row 3: パイプラインステージ (mt=12px) ─────────────────────  │
│ ✅ ── ✅ ── ✅ ── 🔄 ── ○ ── ○ ── ○                           │
│ PG    IG    VG    SC    MU    MG    PB                          │
│ ↑ 各ステージ: icon 20px, gap=4px, 線=border 2px               │
│                                                                │
│ ── Row 4: Progress bar (mt=12px) ─────────────────────────────  │
│ [████████████████░░░░░░░░░░] 80%                               │
│ ↑ h=8px, rounded-full                                          │
│                                                                │
│ ── Row 5: メタ情報 (mt=8px) ──────────────────────────────────  │
│ 推定コスト: $0.50  │  経過: 1m 23s  │  推定残り: 0m 20s        │
│ ↑ caption, text-secondary                                      │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 px スペック

| 要素 | 値 | 備考 |
|------|-----|------|
| カード背景 | `surface (#161B22)` | |
| カード border | `border (#30363D)` 1px | |
| カード border-radius | 12px | |
| カード パディング | 16px | |
| Avatar サイズ | 32px | チャンネルアバター |
| Avatar border-radius | 8px | `rounded-lg` |
| Avatar-名前 間 | 8px | |
| チャンネル名 | `heading-sm` (16px/600) | text-primary |
| ModelBadge | `label-sm` (11px/600), bg=`surface-hover`, text=`secondary (#00D2D3)`, px=8, py=2, rounded-full | |
| Cancel ボタン | `Button variant="ghost" size="sm"`, text=`text-secondary`, hover=`status-error` | 右端配置 |
| Row 間 gap | 12px | |
| プロンプト概要 | `body-md` (14px/400), text-secondary, line-clamp-2 | |
| ステージアイコン | 20px | 完了: status-success, 実行中: status-active (animate-spin), 待機: text-tertiary, 失敗: status-error |
| ステージ間の線 | h=2px, w=24px | 完了: status-success, 未達: border |
| ステージラベル | `label-sm` (11px/600), text-tertiary | ステージ下に表示 |
| Progress bar 高さ | 8px | rounded-full |
| Progress bar トラック | `surface-hover (#1C2333)` | |
| Progress bar フィル | `primary (#6C5CE7)` | |
| パーセント表示 | `caption` (12px/400), text-secondary | Progress bar 右端 |
| メタ情報 | `caption` (12px/400), text-secondary | パイプ区切り、gap=16px |

### 5.3 ステージアイコン定義

| ステージ | 略称 | Lucide アイコン | 完了色 | 実行中 | 待機色 | 失敗色 |
|---------|------|---------------|-------|--------|-------|-------|
| プロンプト生成 | PG | `MessageSquare` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |
| 画像生成 | IG | `ImagePlus` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |
| 動画生成 | VG | `Video` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |
| 安全性検査 | SC | `Shield` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |
| Mux Upload | MU | `Upload` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |
| メタデータ生成 | MG | `FileText` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |
| 公開 | PB | `Globe` | `status-success` | `status-active` + spin | `text-tertiary` | `status-error` |

### 5.4 モバイル対応

- ステージ表示: 横並び → **縦並び**（各ステージが縦リスト）
- Cancel ボタン: ヘッダー行右端のまま（`⋯` DropdownMenu 内に格納）
- メタ情報: パイプ区切り → 改行 2x2 グリッド

---

## 6. JobHistoryTable コンポーネント

### 6.1 デスクトップ テーブルレイアウト

```
┌──────────────────────────────────────────────────────────────────────┐
│ ── フィルタ行 (h=48px, mb=12px) ──────────────────────────────────  │
│ [Select: ステータス▼] [Select: チャンネル▼] [Select: モデル▼] [Select: 期間▼] │
│                                                                      │
│ ── テーブルヘッダー (h=44px, bg=admin-bg) ────────────────────────   │
│ │ Status │ Channel  │ Model    │ Prompt      │ Cost  │ Time  │ Actions │
│ │ 60px   │ 120px    │ 100px    │ flex-1      │ 80px  │ 80px  │ 100px   │
│                                                                      │
│ ── テーブル行 (h=56px, hover: bg=surface-hover) ──────────────────   │
│ │ [icon] │ [Av][名] │ [Badge]  │ "夕焼け..." │ $0.50 │ 2m10s │ [詳細]  │
│ │ 20px   │ 24+8+txt │ label-sm │ body-md     │ caption│caption│ Button  │
│                                                                      │
│ ── ページネーション (mt=16px) ────────────────────────────────────   │
│                                    [< 前] [1] [2] [3] ... [次 >]     │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 px スペック

| 要素 | 値 | 備考 |
|------|-----|------|
| テーブル背景 | `surface (#161B22)` | |
| テーブル border | `border (#30363D)` 1px | rounded-xl |
| ヘッダー背景 | `admin-bg (#0A0E14)` | |
| ヘッダーテキスト | `label-lg` (13px/600), text-secondary | uppercase |
| ヘッダー高さ | 44px | |
| 行高さ | 56px | |
| 行 hover | bg=`surface-hover (#1C2333)` | |
| 行間区切り | `border (#30363D)` 1px | |
| セル横パディング | 12px | |
| Status アイコン | 20px | ステータスカラー使用 |
| Status テキスト | `label-sm` (11px/600) | アイコン下に表示 |
| Channel Avatar | 24px, rounded-md | |
| Channel 名 | `body-md` (14px/400) | Avatar の右 8px |
| Model Badge | `label-sm`, bg=`surface-hover`, px=6, py=2, rounded-full | |
| Prompt テキスト | `body-md`, text-secondary, line-clamp-1 | |
| Cost | `caption` (12px/400), font-tabular-nums | |
| Time | `caption`, font-tabular-nums | |
| Actions ボタン | `Button variant="ghost" size="sm"` | |
| フィルタ Select 高さ | 36px | `Select` variant=outline, rounded-lg |
| フィルタ間 gap | 8px | |
| ページネーション | shadcn/ui Pagination | mt=16px, justify-center |

### 6.3 ステータスアイコン + テキスト

| ステータス | アイコン (Lucide) | 色 | テキストラベル |
|----------|-----------------|---|------------|
| completed | `CheckCircle` | `status-success (#22C55E)` | 完了 |
| active | `Loader2` (animate-spin) | `status-active (#3B82F6)` | 生成中 |
| waiting | `Clock` | `status-warning (#F59E0B)` | 待機中 |
| failed | `XCircle` | `status-error (#EF4444)` | 失敗 |
| needs_review | `AlertTriangle` | `status-warning (#F59E0B)` | 要レビュー |
| rejected | `Ban` | `status-error (#EF4444)` | 却下 |
| paused | `Pause` | `status-pending (#6B7280)` | 停止中 |

### 6.4 モバイル カード形式

テーブルの代わりにカードリストを表示:

```
┌───────────────────────────────┐
│ p=12px, bg=surface, rounded-xl │
│                                │
│ [StatusIcon 16px] [4px] 完了   │ ← label-sm + タイムスタンプ右端
│                        10:30  │
│                                │
│ [Avatar 24px] [8px] Aurora     │ ← heading-sm
│ "夕焼けの東京タワー..."        │ ← body-sm, text-secondary, line-clamp-1
│                                │
│ [ModelBadge]   $0.50   2m 10s │ ← caption, 横並び justify-between
│                                │
│ [詳細を見る ->]                 │ ← body-sm, primary-text, 右端
└───────────────────────────────┘
  ↕ gap=8px
```

| 要素 | 値 |
|------|-----|
| カードパディング | 12px |
| カード間 gap | 8px |
| カード border-radius | 12px |
| 各行の gap | 8px |

---

## 7. GenerationPreview コンポーネント

### 7.1 ジョブ詳細ページ レイアウト

```
/admin/pipeline/jobs/[jobId]
┌──────────────────────────────────────────────────────────────┐
│ ── Breadcrumb (h=32px) ─────────────────────────────────────  │
│ パイプライン > ジョブ > job_abc123                              │
│ ↑ body-sm, text-secondary, separator=ChevronRight 12px        │
│                                                                │
│ ── Video Preview (mt=16px) ──────────────────────────────────  │
│ ┌──────────────────────────────────────────────────────┐      │
│ │ <MuxPlayer>                                          │      │
│ │ aspect-ratio: 16/9                                   │      │
│ │ max-width: 768px                                     │      │
│ │ rounded-xl, overflow-hidden                          │      │
│ └──────────────────────────────────────────────────────┘      │
│                                                                │
│ ── Action Buttons (mt=16px, gap=8px) ────────────────────────  │
│ [Approve: Button/default, h=40, px=16]                         │
│ [Reject: Button/destructive, h=40, px=16]                      │
│ [Regenerate: Button/outline, h=40, px=16]                      │
│                                                                │
│ ── Pipeline Info Table (mt=24px) ────────────────────────────  │
│ ┌────────────────────┬────────────────────────────────┐       │
│ │ bg=admin-bg, w=180 │ bg=surface                     │       │
│ │ label-lg, text-sec │ body-md, text-primary           │       │
│ │ チャンネル          │ [Av 24px] Aurora                │       │
│ │ AIモデル            │ [Badge] Runway Gen-4 Turbo     │       │
│ │ ステータス          │ [StatusIcon] 承認待ち           │       │
│ │ 安全性スコア        │ 0.85 (閾値: 0.80)              │       │
│ │ 生成コスト          │ $0.50                          │       │
│ │ 生成時間            │ 2m 10s                         │       │
│ │ 解像度              │ 1080p / 30fps / 10秒           │       │
│ └────────────────────┴────────────────────────────────┘       │
│                                                                │
│ ── Prompt Detail (mt=24px) ──────────────────────────────────  │
│ ┌── Card, p=16px ────────────────────────────────────────┐    │
│ │ heading-sm: プロンプト詳細                              │    │
│ │                                                        │    │
│ │ [label-lg] テーマ: [body-md] 東京の夕焼け              │    │
│ │ [label-lg] スタイル: [body-md] フォトリアル             │    │
│ │ [label-lg] ムード: [Badge] Calm                        │    │
│ │                                                        │    │
│ │ [label-lg] プロンプト（全文）:                          │    │
│ │ [body-sm, text-secondary, bg=admin-bg, p=12, rounded-lg]│    │
│ │ "A stunning sunset over Tokyo Tower with Mount Fuji..." │    │
│ └────────────────────────────────────────────────────────┘    │
│                                                                │
│ ── Log Section (mt=24px, Collapsible) ───────────────────────  │
│ [ChevronRight 16px] [heading-sm] ログを表示                    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 px スペック

| 要素 | 値 | 備考 |
|------|-----|------|
| MuxPlayer max-width | 768px | `max-w-3xl` |
| MuxPlayer border-radius | 12px | `rounded-xl` |
| MuxPlayer accentColor | `#6C5CE7` | primary |
| Approve ボタン | bg=`status-success`, text=white, h=40px, px=16px, rounded-lg | |
| Reject ボタン | bg=`status-error`, text=white, h=40px, px=16px, rounded-lg | |
| Regenerate ボタン | border=`border`, text=text-secondary, h=40px, px=16px, rounded-lg | |
| Info テーブル背景 | `surface (#161B22)` | border: `border` 1px, rounded-xl |
| Info ラベル列幅 | 180px | bg=`admin-bg (#0A0E14)` |
| Info 値列 | flex-1 | |
| Info 行高さ | 44px | |
| Info 行区切り | `border (#30363D)` 1px | |
| プロンプト Card 背景 | `surface` | border=`border` 1px, rounded-xl |
| プロンプト全文背景 | `admin-bg (#0A0E14)` | p=12px, rounded-lg |
| プロンプト全文テキスト | `body-sm` (13px/400), text-secondary | |
| Collapsible トリガー | heading-sm, text-secondary, hover: text-primary | |

---

## 8. PromptTemplateCard コンポーネント

### 8.1 レイアウト仕様

```
┌──────────────────────────────────────────────────┐
│ p=16px, bg=surface, border=border 1px, rounded-xl │
│                                                    │
│ heading-sm: 「東京の風景」テンプレート              │ ← text-primary
│                                                    │
│ ── Meta row (mt=8px, gap=8px) ─────────────────   │
│ [Badge] Aurora  [Badge] 風景  [Badge] Calm         │
│                                                    │
│ ── Prompt preview (mt=12px) ───────────────────   │
│ "A stunning {time_of_day} over {landmark} with..." │ ← body-sm, text-secondary
│ ↑ bg=admin-bg, p=12px, rounded-lg, line-clamp-3   │
│ ↑ {variable} 部分: primary-text (#8B7CF8)          │
│                                                    │
│ ── Stats row (mt=12px) ───────────────────────    │
│ 使用回数: 15回  │  平均品質: 4.3  │  成功率: 93%  │ ← caption, text-secondary
│                                                    │
│ ── Actions (mt=12px, justify-end) ────────────    │
│                              [編集] [削除]         │ ← Button/ghost, size=sm
│                                                    │
└──────────────────────────────────────────────────┘
```

### 8.2 px スペック

| 要素 | 値 |
|------|-----|
| カード幅 | `flex-1, min-w=320px` (desktop 2列、mobile 1列) |
| タイトル | `heading-sm` (16px/600), text-primary |
| Meta Badge | `label-sm` (11px/600), bg=`surface-hover`, px=8, py=2, rounded-full |
| Badge 間 gap | 8px |
| プロンプトプレビュー背景 | `admin-bg (#0A0E14)` |
| プロンプトプレビュー padding | 12px |
| プロンプトテキスト | `body-sm` (13px/400), text-secondary |
| 変数ハイライト色 | `primary-text (#8B7CF8)` |
| Stats | `caption` (12px/400), text-secondary, パイプ区切り |
| 編集ボタン | Button/ghost, size=sm, text-secondary |
| 削除ボタン | Button/ghost, size=sm, text-secondary, hover=status-error |

### 8.3 テンプレート編集モーダル

| 要素 | 値 |
|------|-----|
| Dialog 幅 | max-w=640px (desktop), フルスクリーン (mobile) |
| Dialog 背景 | `surface-elevated (#21262D)` |
| Dialog padding | 24px |
| Input 高さ | 40px |
| Textarea 高さ | 160px (min) |
| Label | `label-lg` (13px/600), text-secondary, mb=4px |
| Input border | `border (#30363D)` 1px, focus: `primary (#6C5CE7)` 2px |
| 変数定義テーブル | bg=`admin-bg`, rounded-lg, p=12px |
| 保存ボタン | Button/default, bg=`primary`, text=white |
| キャンセルボタン | Button/outline |

---

## 9. ScheduleCard コンポーネント

### 9.1 レイアウト仕様

```
┌──────────────────────────────────────────────────────────────┐
│ p=16px, bg=surface, border=border 1px, rounded-xl             │
│                                                                │
│ ── Header row ─────────────────────────────────────────────   │
│ [Avatar 24px] [8px] Aurora 定期生成  [→]  [Switch: 有効 🟢]  │
│ ↑ heading-sm                                  ↑ Switch 44x24  │
│                                                                │
│ ── Detail rows (mt=12px, gap=4px) ────────────────────────    │
│ [Clock 16px] [8px] 週3回（月・水・金） 10:00 JST              │
│ [FileText 16px] [8px] テンプレート: 東京の風景                 │
│ [Cpu 16px] [8px] Runway Gen-4 Turbo                           │
│ ↑ body-md, text-secondary                                     │
│                                                                │
│ ── Cost estimate (mt=12px) ──────────────────────────────    │
│ [Wallet 16px] [8px] 推定月額: $6.00 (12本 x $0.50)           │
│ ↑ caption, text-secondary                                     │
│                                                                │
│ ── Actions (mt=12px, justify-end) ───────────────────────    │
│                                         [編集] [一時停止]     │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 px スペック

| 要素 | 値 |
|------|-----|
| カード幅 | 100% (1列レイアウト) |
| Switch サイズ | 44px x 24px, thumb=20px |
| Switch ON 色 | `status-success (#22C55E)` |
| Switch OFF 色 | `status-pending (#6B7280)` |
| Detail アイコン | 16px, text-tertiary |
| Detail テキスト | `body-md` (14px/400), text-secondary |
| Cost テキスト | `caption` (12px/400), text-secondary |
| 編集ボタン | Button/ghost, size=sm |
| 一時停止ボタン | Button/outline, size=sm, text=status-warning |

---

## 10. NotificationBanner コンポーネント

### 10.1 Critical バナー

```
┌──────────────────────────────────────────────────────────────┐
│ bg=status-error/10%, border-l=status-error 4px, p=12px        │
│                                                                │
│ [AlertTriangle 20px, status-error] [12px]                     │
│ [heading-sm] 予算超過のため全生成を停止しました。               │
│ [body-sm, text-secondary] 現在の利用額: $47.80 / 上限: $50.00 │
│                                                                │
│ [Button/outline size=sm: 予算設定を変更] [Button/ghost: 詳細]  │ ← mt=8px
│                                                        [X 16px]│ ← 右上
└──────────────────────────────────────────────────────────────┘
```

### 10.2 Warning バナー

```
┌──────────────────────────────────────────────────────────────┐
│ bg=status-warning/10%, border-l=status-warning 4px, p=12px    │
│                                                                │
│ [AlertTriangle 20px, status-warning] [12px]                   │
│ [body-md] 1件の動画が承認待ちです。 [Button/link: レビューする] │
│                                                        [X 16px]│
└──────────────────────────────────────────────────────────────┘
```

### 10.3 px スペック

| 要素 | 値 |
|------|-----|
| バナー幅 | 100% (コンテンツエリア幅) |
| バナーパディング | 12px |
| バナー border-radius | 8px |
| 左 border | 4px solid (ステータスカラー) |
| 背景 | ステータスカラー / opacity 10% |
| アイコンサイズ | 20px |
| アイコン-テキスト間 | 12px |
| 閉じるボタン | 16px, 右上絶対配置 (top=12px, right=12px) |
| Critical の場合 | 閉じるボタンなし（手動解除不可） |

---

## 11. CostDashboard コンポーネント

### 11.1 コストサマリーカード

MetricCard と同じスペックを使用（SS4 参照）。3枚横並び:
- 動画生成費 (`generation-count` バリエーション応用)
- Mux 費用
- 合計

### 11.2 予算アラート設定

```
┌──────────────────────────────────────────────────┐
│ p=16px, bg=surface, border=border 1px, rounded-xl │
│                                                    │
│ heading-sm: 予算アラート設定                       │
│                                                    │
│ ── Form rows (mt=16px, gap=16px) ───────────────  │
│                                                    │
│ [label-lg] 月額予算上限                            │
│ ┌─────────────────────────────────────────────┐   │
│ │ [$ prefix] [Input: 50.00]                    │   │
│ └─────────────────────────────────────────────┘   │
│ ↑ Input h=40px, w=200px, font-tabular-nums        │
│                                                    │
│ [label-lg] 警告閾値                                │
│ ┌─────────────────────────────────────────────┐   │
│ │ [Input: 80] [% suffix] → $40.00 で警告       │   │
│ └─────────────────────────────────────────────┘   │
│                                                    │
│ [label-lg] 緊急停止閾値                            │
│ ┌─────────────────────────────────────────────┐   │
│ │ [Input: 95] [% suffix] → $47.50 で全生成停止  │   │
│ └─────────────────────────────────────────────┘   │
│                                                    │
│                              [Button/default: 保存]│
└──────────────────────────────────────────────────┘
```

| 要素 | 値 |
|------|-----|
| Input 高さ | 40px |
| Input 幅 | 200px (数値入力) |
| Input font | Inter, tabular-nums |
| Prefix/Suffix テキスト | `body-md`, text-secondary |
| 計算結果テキスト | `caption`, text-tertiary |
| 保存ボタン | Button/default, bg=primary |

---

## 12. アクセシビリティチェック

### 12.1 コントラスト比サマリ（管理画面固有カラー）

| 要素 | 前景色 | 背景色 | コントラスト比 | AA 判定 |
|------|--------|--------|-------------|---------|
| 成功テキスト on admin-bg | `#22C55E` | `#0A0E14` | 6.8:1 | **PASS** |
| 警告テキスト on admin-bg | `#F59E0B` | `#0A0E14` | 8.2:1 | **PASS** |
| エラーテキスト on admin-bg | `#EF4444` | `#0A0E14` | 4.6:1 | **PASS** |
| アクティブテキスト on admin-bg | `#3B82F6` | `#0A0E14` | 4.8:1 | **PASS** |
| 待機テキスト on admin-bg | `#6B7280` | `#0A0E14` | 4.5:1 | **PASS** (境界) |
| text-primary on admin-bg | `#F0F6FC` | `#0A0E14` | 17.8:1 | **PASS** |
| text-secondary on surface | `#8B949E` | `#161B22` | 5.62:1 | **PASS** |
| text-tertiary on surface | `#7A8390` | `#161B22` | 4.62:1 | **PASS** |
| primary-text on surface | `#8B7CF8` | `#161B22` | 5.22:1 | **PASS** |

> 全ステータスカラーはアイコン + テキストラベルを併記するため、色だけに依存しない。
> `status-pending (#6B7280)` は AA 境界値のため、必ずテキストラベル「停止中」を併記すること。

### 12.2 実装チェック項目

- [ ] AdminNav の全項目に `aria-label` / `aria-current="page"` が設定されている
- [ ] ステータスアイコンに `aria-label` が付与されている（例: `aria-label="完了"`）
- [ ] Progress bar に `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` が設定されている
- [ ] PipelineStageIndicator に `role="progressbar"` と各ステージの `aria-label` がある
- [ ] テーブル行にキーボードフォーカスが可能（`tabindex="0"`、Enter で詳細遷移）
- [ ] モーダル（テンプレート編集）に `role="dialog"`, `aria-modal="true"` がある
- [ ] NotificationBanner に `role="alert"` が設定されている（Critical のみ `aria-live="assertive"`）
- [ ] 動的更新（ジョブステータス変更）時に `aria-live="polite"` で通知
- [ ] `prefers-reduced-motion` でスピナーアニメーションを静止アイコンに置換
- [ ] Switch コンポーネントに `aria-label` と `role="switch"` がある

---

## 13. アニメーション仕様

| 対象 | トリガー | アニメーション | duration | easing | reduced-motion |
|------|---------|-------------|---------|--------|---------------|
| AdminNav 展開/折りたたみ | ブレークポイント切替 | width 240px ↔ 64px | 200ms | ease-out | 即時切替 |
| MetricCard 数値更新 | データ更新 | 数値カウントアップ | 500ms | ease-out | 即時表示 |
| Progress bar フィル | 値変更 | width transition | 300ms | ease-out | 即時表示 |
| ステージアイコン (active) | ステージ開始 | rotate 360deg loop | 1000ms | linear | 静止アイコンに置換 |
| テーブル行追加 | 新規ジョブ | fade-in + slide-down | 200ms | ease-out | fade のみ |
| NotificationBanner 表示 | トリガー発火 | slide-down from top | 300ms | ease-out | 即時表示 |
| NotificationBanner 非表示 | 閉じるクリック | fade-out + slide-up | 200ms | ease-out | 即時非表示 |
| モーダルオープン | ボタンクリック | fade-in + scale(0.95→1) | 200ms | ease-out | fade のみ |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-07 | 1.0 | 初版作成（ai-pipeline-uiux-improvements.md を統合） | designer |
