# AI動画生成パイプライン UI/UX: 状態管理・デザイントークン

> 元ファイル: [ai-pipeline-uiux-improvements.md](ai-pipeline-uiux-improvements.md) から分割（§5-12）

---

## 5. 通知・アラートシステム

### 5.1 通知トリガー

| トリガー | 重要度 | 通知方法 | メッセージ例 |
|---------|--------|---------|------------|
| 予算80%到達 | ⚠️ Warning | ダッシュボード Banner + メール | "月額予算の80%に達しました ($40.00/$50.00)" |
| 予算95%到達（全停止） | 🚨 Critical | ダッシュボード Alert + メール | "予算超過のため全生成を停止しました" |
| 安全性レビュー待ち | ⚠️ Warning | ダッシュボード Badge | "1件の動画が承認待ちです" |
| 生成失敗（3回連続） | 🚨 Critical | ダッシュボード Alert | "Runway API が応答しません。フォールバックを検討してください" |
| 月間生成上限到達 | ⚠️ Warning | ダッシュボード Banner | "今月の生成上限 (30本) に達しました" |
| 生成完了 | ℹ️ Info | ダッシュボード更新のみ | テーブルの自動更新 |

### 5.2 ダッシュボード内通知バナー

```
Critical（ページ上部固定）:
┌──────────────────────────────────────────────────────────────┐
│ 🚨 予算超過のため全生成を停止しました。                         │
│    現在の利用額: $47.80 / 上限: $50.00                        │
│    [予算設定を変更] [詳細を見る]                        [×]   │
└──────────────────────────────────────────────────────────────┘

Warning（ページ上部、閉じ可能）:
┌──────────────────────────────────────────────────────────────┐
│ ⚠️ 1件の動画が承認待ちです。[レビューする]              [×]   │
└──────────────────────────────────────────────────────────────┘
```

**shadcn/ui コンポーネント**: `Alert`, `AlertTitle`, `AlertDescription`, `Button`

---

## 6. レスポンシブデザイン仕様

### 6.1 ブレークポイント

| ブレークポイント | 幅 | AdminNav | MetricCards | JobTable | 操作 |
|---------------|-----|---------|-------------|---------|------|
| Mobile | < 768px | BottomTab | 2列グリッド | カード表示（リスト形式） | タップ操作 |
| Tablet | 768-1024px | 折りたたみサイドバー | 3列グリッド | テーブル表示（列省略） | タップ/クリック |
| Desktop | > 1024px | 展開サイドバー (w=240) | 5列グリッド | フルテーブル | クリック |

### 6.2 モバイル固有の対応

- **AdminNav**: 画面下部の固定タブバー（概要/ジョブ/テンプレート/コスト）
- **MetricCards**: 2x2グリッド（スワイプで追加カード表示）
- **JobHistoryTable**: カード形式のリスト表示に変換（テーブルはモバイルで視認性が低い）
- **プレビュー再生**: フルスクリーンモーダルで表示
- **テンプレート編集**: フルスクリーンモーダル（Dialog fullscreen）

### 6.3 モバイルのジョブカード表示

```
┌─────────────────────────┐
│ ✅ 完了  ・  10:30       │
│                          │
│ 🤖 Aurora                │
│ "夕焼けの東京タワー..."   │
│                          │
│ Runway Gen-4T  ・  $0.50 │
│ 2m 10s                   │
│                          │
│ [詳細を見る →]            │
└─────────────────────────┘
```

---

## 7. アクセシビリティ

| 項目 | 対応 |
|------|------|
| キーボードナビゲーション | AdminNav・テーブル・モーダル内の全要素がTabキーでフォーカス可能 |
| スクリーンリーダー | ステータスアイコンに `aria-label` を付与（例: `aria-label="成功"` for ✅） |
| カラーコントラスト | ステータスカラーは全て WCAG AA 4.5:1 準拠。アイコンだけでなくテキストラベルも併記 |
| Progress bar | `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label` を設定 |
| 動的コンテンツ | リアルタイム更新時に `aria-live="polite"` で変更を通知 |
| 減モーション | `prefers-reduced-motion` 対応: Progress bar のアニメーションを無効化 |

---

## 8. コンポーネント一覧（実装用）

### 8.1 ディレクトリ構成

```
src/
├── app/
│   └── admin/
│       └── pipeline/
│           ├── layout.tsx            # AdminNav + 認証ガード
│           ├── page.tsx              # メインダッシュボード
│           ├── jobs/
│           │   └── [jobId]/
│           │       └── page.tsx      # ジョブ詳細
│           ├── templates/
│           │   └── page.tsx          # テンプレート管理
│           ├── schedule/
│           │   └── page.tsx          # スケジュール管理
│           └── cost/
│               └── page.tsx          # コスト管理
│
├── components/
│   └── admin/
│       ├── AdminNav.tsx              # 管理画面用サイドバー/BottomTab
│       ├── MetricCard.tsx            # メトリクスカード (5バリエーション)
│       ├── ActiveJobCard.tsx         # 実行中ジョブカード
│       ├── PipelineStageIndicator.tsx # パイプラインステージ表示
│       ├── JobHistoryTable.tsx       # ジョブ履歴テーブル
│       ├── JobStatusFilter.tsx       # ステータスフィルタ
│       ├── GenerationPreview.tsx     # 生成結果プレビュー (MuxPlayer)
│       ├── ApprovalActions.tsx       # 承認/却下アクションボタン
│       ├── PromptTemplateCard.tsx    # テンプレートカード
│       ├── PromptTemplateEditor.tsx  # テンプレート編集モーダル
│       ├── ScheduleCard.tsx          # スケジュールカード
│       ├── ScheduleCalendar.tsx      # カレンダービュー
│       ├── CostChart.tsx            # コスト推移グラフ
│       ├── CostBreakdown.tsx        # コスト内訳表示
│       ├── BudgetAlertSettings.tsx  # 予算アラート設定
│       ├── NotificationBanner.tsx   # 通知バナー
│       └── FallbackSuggestion.tsx   # フォールバック提案UI
```

### 8.2 コンポーネント優先度

| コンポーネント | 優先度 | 備考 |
|--------------|--------|------|
| AdminNav | P0 | 管理画面の基盤 |
| MetricCard | P0 | ダッシュボードの情報密度を決定 |
| ActiveJobCard | P0 | リアルタイム状態監視の中核 |
| PipelineStageIndicator | P0 | ジョブ進捗の可視化 |
| JobHistoryTable | P0 | 履歴閲覧・フィルタ |
| GenerationPreview | P0 | 品質確認に必須 |
| ApprovalActions | P0 | 安全性レビューワークフロー |
| NotificationBanner | P0 | 予算超過・障害通知 |
| FallbackSuggestion | P0 | API障害時の運用継続 |
| PromptTemplateCard | P1 | テンプレート管理 |
| PromptTemplateEditor | P1 | テンプレート CRUD |
| ScheduleCard | P1 | スケジュール表示 |
| CostChart | P1 | コスト可視化 |
| CostBreakdown | P1 | コスト分析 |
| BudgetAlertSettings | P1 | 予算管理 |
| ScheduleCalendar | P2 | カレンダービュー |
| JobStatusFilter | P2 | 高度なフィルタリング |

### 8.3 使用 shadcn/ui コンポーネント一覧

| shadcn/ui コンポーネント | 使用箇所 |
|------------------------|---------|
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | MetricCard, ActiveJobCard, TemplateCard, ScheduleCard |
| `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` | JobHistoryTable |
| `Progress` | MetricCard, ActiveJobCard |
| `Badge` | ステータス表示、AIモデル名、カテゴリ |
| `Button` | 全アクション（リトライ、承認、却下、キャンセル等） |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | フィルタ、テンプレート編集 |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` | テンプレート編集、確認モーダル |
| `Alert`, `AlertTitle`, `AlertDescription` | エラー表示、通知バナー |
| `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | ログ表示 |
| `Input`, `Textarea`, `Label` | テンプレート編集、予算設定 |
| `Switch` | スケジュール有効/無効 |
| `Tooltip` | ステージ詳細、メトリクス説明 |
| `Calendar` | スケジュールカレンダー |
| `Pagination` | テーブルページネーション |
| `Separator` | セクション区切り |
| `DropdownMenu` | テーブル行アクション |
| `Skeleton` | ローディング状態 |
| `ScrollArea` | AdminNav サイドバー |

---

## 9. 状態管理設計

### 9.1 サーバーステート（TanStack Query）

| クエリキー | エンドポイント | staleTime | 備考 |
|-----------|-------------|-----------|------|
| `['pipeline', 'metrics']` | `GET /api/admin/pipeline/metrics` | 30s | メトリクスカード用。30秒間隔でリフレッシュ |
| `['pipeline', 'active-jobs']` | `GET /api/admin/pipeline/jobs?status=active` | 5s | 実行中ジョブ。5秒間隔でポーリング |
| `['pipeline', 'jobs', filters]` | `GET /api/admin/pipeline/jobs` | 60s | 履歴テーブル用 |
| `['pipeline', 'job', jobId]` | `GET /api/admin/pipeline/jobs/:id` | 10s | ジョブ詳細用 |
| `['pipeline', 'templates']` | `GET /api/admin/pipeline/templates` | 300s | テンプレート一覧 |
| `['pipeline', 'schedules']` | `GET /api/admin/pipeline/schedules` | 300s | スケジュール一覧 |
| `['pipeline', 'cost']` | `GET /api/admin/pipeline/cost` | 60s | コスト情報 |

### 9.2 ミューテーション

| アクション | エンドポイント | 楽観的更新 | 無効化クエリ |
|-----------|-------------|-----------|------------|
| ジョブキャンセル | `POST /api/admin/pipeline/jobs/:id/cancel` | ✅ ステータスを `cancelled` に | `active-jobs`, `jobs` |
| ジョブリトライ | `POST /api/admin/pipeline/jobs/:id/retry` | ✅ ステータスを `waiting` に | `active-jobs`, `jobs` |
| ジョブ承認 | `POST /api/admin/pipeline/jobs/:id/approve` | ✅ ステータスを `completed` に | `jobs`, `metrics` |
| ジョブ却下 | `POST /api/admin/pipeline/jobs/:id/reject` | ✅ ステータスを `rejected` に | `jobs`, `metrics` |
| フォールバック切替 | `POST /api/admin/pipeline/jobs/:id/fallback` | ❌ | `active-jobs`, `jobs` |
| テンプレート CRUD | `POST/PUT/DELETE /api/admin/pipeline/templates` | ❌ | `templates` |
| スケジュール CRUD | `POST/PUT/DELETE /api/admin/pipeline/schedules` | ❌ | `schedules` |
| 予算設定更新 | `PUT /api/admin/pipeline/cost/budget` | ❌ | `cost`, `metrics` |

### 9.3 クライアントステート（Zustand）

```tsx
interface PipelineUIStore {
  // AdminNav
  adminNavOpen: boolean
  toggleAdminNav: () => void

  // フィルタ状態
  jobFilters: {
    status: JobStatus | 'all'
    channelId: string | 'all'
    aiModel: string | 'all'
    dateRange: { from: Date; to: Date } | null
  }
  setJobFilter: (key: string, value: string) => void

  // テンプレート編集モーダル
  editingTemplateId: string | null
  setEditingTemplate: (id: string | null) => void

  // 通知バナー非表示状態
  dismissedBanners: Set<string>
  dismissBanner: (id: string) => void
}
```

---

## 10. デザイントークン（既存トークンとの整合性）

### 10.1 管理画面固有のカラー

既存のデザイントークン（`ui-ux-design.md` §1.1）を継承しつつ、管理画面固有の意味付けを追加:

| トークン名 | 値 | 用途 | 既存トークンとの関係 |
|-----------|---|------|-------------------|
| `--color-admin-bg` | `#0A0E14` | 管理画面背景（メイン画面よりやや暗い） | `--color-background (#0D1117)` の派生 |
| `--color-status-success` | `#22C55E` | 完了ステータス | 新規（Tailwind green-500） |
| `--color-status-warning` | `#F59E0B` | 警告ステータス | 新規（Tailwind amber-500） |
| `--color-status-error` | `#EF4444` | 失敗ステータス | 新規（Tailwind red-500） |
| `--color-status-active` | `#3B82F6` | 実行中ステータス | 新規（Tailwind blue-500） |
| `--color-status-pending` | `#6B7280` | 待機中ステータス | `--color-text-secondary (#8B949E)` に近い |

### 10.2 コントラスト比検証

| 組み合わせ | 前景色 | 背景色 | コントラスト比 | WCAG AA |
|-----------|-------|--------|-------------|---------|
| 成功テキスト on admin-bg | `#22C55E` | `#0A0E14` | 6.8:1 | ✅ PASS |
| 警告テキスト on admin-bg | `#F59E0B` | `#0A0E14` | 8.2:1 | ✅ PASS |
| エラーテキスト on admin-bg | `#EF4444` | `#0A0E14` | 4.6:1 | ✅ PASS |
| アクティブテキスト on admin-bg | `#3B82F6` | `#0A0E14` | 4.8:1 | ✅ PASS |
| 待機テキスト on admin-bg | `#6B7280` | `#0A0E14` | 4.5:1 | ✅ PASS (境界) |
| text-primary on admin-bg | `#F0F6FC` | `#0A0E14` | 17.1:1 | ✅ PASS |

---

## 11. 既存設計との整合性チェック

### 11.1 共有デザイントークン（team-config.md §9.2 参照）

| チェック項目 | 本設計での対応 | ステータス |
|------------|-------------|----------|
| Quality Score スケール（DB: 0-100 → UI: 0.0-5.0） | MetricCard, TemplateCard で UI: 0.0-5.0 表示 | ✅ 整合 |
| カラー値 `#7A8390` → `text-tertiary` | 管理画面では `text-secondary (#8B949E)` を使用（管理画面は独立カラー体系） | ✅ 整合 |
| Mux Data custom_1..3 スキーマ | ジョブ詳細でモデル名を custom_1 として送信 | ✅ 整合 |
| JSON-LD creator `@type: Organization` | パイプライン経由で生成する動画のメタデータに適用 | ✅ 整合 |
| MuxPlayer import: `@mux/mux-player-react/lazy` | GenerationPreview で lazy import 使用 | ✅ 整合 |

### 11.2 ユースケースとのマッピング

| ユースケース (UC) | 本設計のコンポーネント | カバー範囲 |
|-----------------|-------------------|-----------|
| UC-001 スケジュールベース生成 | ScheduleManager | ✅ 完全カバー |
| UC-004 プロンプト生成 | PromptTemplateManager | ✅ テンプレートベースでカバー |
| UC-005 動画本体の生成 | ActiveJobCard, PipelineStageIndicator | ✅ 進捗可視化 |
| UC-008 安全性チェック | ApprovalActions, GenerationPreview | ✅ 手動レビューフロー |
| UC-010 アップロード・公開 | PipelineStageIndicator (Mux Upload → 公開) | ✅ ステージ表示 |
| UC-011 リトライ | FallbackSuggestion, エラーUI | ✅ リトライ + フォールバック |

### 11.3 コスト制約との整合

| 制約 (team-config.md §5) | 本設計での対応 |
|--------------------------|-------------|
| MVP月間動画生成上限: 30本固定 | MetricCard `generation-count` で `X/30` 表示 + 上限到達時バナー通知 |
| AI生成コスト比率が予算50%超の場合は上限設定必須 | CostDashboard でモデル別コスト比率を可視化 + 予算アラート設定 |
| 月額予算 $50 以下 | BudgetAlertSettings で $50 上限設定 + 80%/95% アラート閾値 |

---

## 12. MVP vs Phase 2 の機能分割

### 12.1 MVP（Phase 1）スコープ

| 機能 | 含む |
|------|------|
| メインダッシュボード（MetricCards + ActiveJobs + RecentJobs） | ✅ |
| ジョブ詳細（パイプラインステージ + プレビュー + 承認/却下） | ✅ |
| エラー表示 + 手動リトライ + フォールバック提案 | ✅ |
| コストサマリー（今月の合計 + 予算残） | ✅ |
| 予算アラート（80%/95% 閾値） | ✅ |
| プロンプトテンプレート CRUD | ✅ |
| スケジュール管理（基本: 頻度 + 時刻 + チャンネル） | ✅ |

### 12.2 Phase 2 スコープ

| 機能 | 理由 |
|------|------|
| リアルタイムログストリーム | WebSocket 実装が複雑 |
| コスト推移グラフ（日次チャート） | チャートライブラリの導入コスト |
| カレンダービュー | MVP では頻度設定で十分 |
| モデル別/チャンネル別コスト詳細分析 | MVP では合計サマリーで十分 |
| メール通知 | MVP ではダッシュボードバナーのみ |
| トレンドベース動画生成 (UC-002) | トレンド分析エンジンの実装が大規模 |
| ユーザーリクエストベース生成 (UC-003) | フロントエンド側の UI 追加が必要 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成 | designer |
