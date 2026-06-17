# AI動画生成パイプライン 詳細設計レビュー

## プロジェクト: AI Theater
レビュー日: 2026-03-07（v2.0 再レビュー）
レビュアー: reviewer
Task: #16

---

## 0. レビュー対象

| # | ドキュメント | 担当 | Task | 版 |
|---|------------|------|------|---|
| 1 | `ai-pipeline-uiux-improvements.md` | designer | #12→#25 | v2.0 |
| 2 | `ai-pipeline-data-design.md` | tech-leader | #13→#23 | v2.0 |
| 3 | `ai-pipeline-performance-design.md` | analyzer | #14→#24 | v2.0 |
| 4 | `ai-pipeline-design-spec.md` (Figma) | designer | #15→#25 | v2.0 |

### 0.1 レビュー方法

- 6カテゴリで評価: ユーザーストーリー網羅性 / 非機能要件 / ドキュメント間整合性 / セキュリティ / 既存画面互換性 / 法的・倫理
- 指摘ID: `PIPE-ISSUE-<番号>`
- 重要度: 高 / 中 / 低
- Go / No-Go 判定

### 0.2 v1.0 レビューからの経緯

v1.0 レビュー（2026-03-07）で **B / Conditional Go** と評価。高優先度3件（PIPE-ISSUE-1〜3）を含む12件の指摘を報告。
project-owner の判断で Gen-4 Turbo（Image to Video）を採用する2段パイプライン構成に確定し、Task #23（DB設計）, #24（Perf設計）, #25（UI/UX・Figma）で4ドキュメント全てを v2.0 に改訂。
本レビューは v2.0 改訂内容の再評価であり、**A- 以上でMVP着手可** を目標とする。

---

## 1. v1.0 高優先度指摘（PIPE-ISSUE-1〜3）の解消確認

### PIPE-ISSUE-1: BullMQ ジョブ構造の不一致 → **解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| DB設計 (#13) | 3ジョブ分割（prompt / video / mux） | **4ジョブ分割**（prompt / image / video / mux） |
| Perf設計 (#14) | 単一ジョブ内5ステップ | **4ジョブチェーン**（prompt→image→video→mux）|
| UI/UX設計 (#12) | PipelineStage 6段階 | PipelineStage **7段階**（image_generation 追加）|

**検証結果**:
- DB設計 §3.1: 4ジョブ（generate-prompt / generate-image / generate-video / upload-to-mux）を明記。各ジョブのタイムアウト・リトライ設定が個別定義済み。
- Perf設計 §2.2: 同一の4ジョブ構成。`JOB_OPTIONS` で4種別のタイムアウト・リトライを定義。§5.2 `processVideoGeneration()` でジョブディスパッチャを実装。
- UI/UX設計 §3.2: `PipelineStage` 型に `image_generation` を追加し7ステージ化。ActiveJobCard で7段階表示。
- Figma §5.3: ステージアイコン定義に `IG (ImagePlus)` を追加。

**判定**: 3ドキュメント間で4ジョブ構造 + 7UIステージが完全に統一されている。**解消済み**。

### PIPE-ISSUE-2: MonthlyQuota 管理方式の不一致 → **解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| DB設計 (#13) | MonthlyQuota テーブル | MonthlyQuota テーブル（変更なし）|
| Perf設計 (#14) | `GenerationJob.count()` で動的カウント | **MonthlyQuota テーブルを Source of Truth** に修正 |

**検証結果**:
- Perf設計 §6.4 `getCostStatus()`: `prisma.monthlyQuota.findUnique()` で `usedCount` / `totalCostUsd` を直接取得。COUNT クエリは使用していない。
- Perf設計 §2.4: `consumeMonthlyQuota()` を使用。DB設計 §4.1 と同一の関数シグネチャ。
- Perf設計 §8.2: Cron API Route で `consumeMonthlyQuota()` を呼び出し。

**判定**: MonthlyQuota テーブルが唯一の Source of Truth として統一されている。**解消済み**。

### PIPE-ISSUE-3: Cron 頻度の不一致 → **解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| DB設計 (#13) | `"0 */8 * * *"`（8時間毎） | `"0 1 * * *"`（**1日1回、深夜1時**）|
| Perf設計 (#14) | `"0 0 * * *"`（1日1回） | `"0 1 * * *"`（**1日1回、深夜1時**）|

**検証結果**:
- DB設計 §7.2 `vercel.json`: `"schedule": "0 1 * * *"` でパス `/api/cron/generate-videos`。
- Perf設計 §8.1 `vercel.json`: `"schedule": "0 1 * * *"` でパス `/api/cron/generate-videos`。
- 両者のパス名も `/api/cron/generate-videos` に統一されている。

**判定**: Cron 頻度・パス名ともに完全に統一されている。**解消済み**。

---

## 2. v1.0 中優先度指摘（PIPE-ISSUE-4〜7）の解消確認

### PIPE-ISSUE-4: Worker concurrency の不一致 → **解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| DB設計 (#13) | `concurrency: 2` | **`concurrency: 2`（未修正）**|
| Perf設計 (#14) | `concurrency: 1` | `concurrency: 1` |

**検証結果**:
- DB設計 §3.5: Worker の `concurrency: 2` が残っている。
- Perf設計 §3.3: Worker の `concurrency: 1` + `limiter: { max: 2, duration: 3600_000 }`。

**判定**: **部分的解消**。DB設計の concurrency は 2 のまま。ただし実装上は Perf設計が実装仕様書として機能するため、実用上の問題は低い。→ **PIPE-ISSUE-4R として再指摘（低優先度に降格）**。

### PIPE-ISSUE-5: Mux アップロード方式の不一致 → **未解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| DB設計 (#13) | Webhook 非同期方式 | Webhook 非同期方式（変更なし）|
| Perf設計 (#14) | ポーリング同期方式 | **ポーリング同期方式（未修正）**|

**検証結果**:
- DB設計 §6.1〜6.3: upload-to-mux ジョブは Mux Asset 作成 + passthrough 埋め込み → Webhook `video.asset.ready` で Video レコード作成 + GenerationJob 完了。
- Perf設計 §7.1: `pollMuxAsset()` で5秒間隔 x 最大30回ポーリング。ポーリング完了後に Video レコード作成。

**判定**: ~~未解消~~ → **解消（2026-03-21 A4対応）**。Perf設計 §7.1 の `pollMuxAsset()` を削除し、DB設計 §6 の Webhook 非同期方式に統一。passthrough にジョブIDを埋め込み、`video.asset.ready` Webhook で Video レコード作成 + GenerationJob 完了処理を行う統一フローに修正済み。

### PIPE-ISSUE-6: Railway コスト見積もりの不一致 → **部分的解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| DB設計 (#13) | $5-10/月 | **$5-10/月（未修正）**|
| Perf設計 (#14) | 常時起動 $20 vs Cron $2.50 | 常時起動 $25 vs Cron $2.50（**両方式を併記**）|

**検証結果**:
- DB設計 §1.3: Railway コストを `$5-10/月` と記載。Perf設計の Cron 起動案（$0）を反映していない。
- Perf設計 §3.4-3.6: 常時起動（$24.99→$19.99）と Cron 起動（$2.50→$0）の両案を記載。**MVP 推奨: 常時起動**と記載。

**判定**: Perf設計は両案を提示し推奨を明記しているため、設計上は十分。DB設計の $5-10 は「常時起動」前提なら概ね妥当だが、Perf設計の推奨（常時起動で$20）とは乖離がある。→ **PIPE-ISSUE-6R として再指摘（低優先度に降格）**。

### PIPE-ISSUE-7: UI ステージ数と DB JobStatus の不整合 → **解消**

| 項目 | v1.0 時点 | v2.0 修正後 |
|------|----------|-----------|
| UI/UX (#12) | PipelineStage 6段階 | **7段階**（image_generation 追加）|
| DB (#13) | JobStatus 10値 | **11値**（IMAGE_GENERATING 追加）|
| Perf (#14) | 5ステップ | **4ジョブ（7ステージにマッピング可能）** |

**検証結果**:
- DB設計 §2.3 `JobStatus` enum: QUEUED / PROMPT_GENERATING / **IMAGE_GENERATING** / GENERATING / MODERATING / UPLOADING / TRANSCODING / PUBLISHING / COMPLETED / FAILED / CANCELLED（11値）。
- UI/UX設計 §3.2 `PipelineStage`: prompt_generation / **image_generation** / video_generation / safety_check / mux_upload / metadata_generation / publish（7段階）。
- ステージ→JobStatus マッピング:

| UI ステージ | DB JobStatus |
|-----------|-------------|
| プロンプト生成 | PROMPT_GENERATING |
| 画像生成 | IMAGE_GENERATING |
| 動画生成 | GENERATING |
| 安全性検査 | MODERATING |
| Mux Upload | UPLOADING, TRANSCODING |
| メタデータ生成 | PUBLISHING |
| 公開 | COMPLETED |

**判定**: `IMAGE_GENERATING` が追加され、7UIステージと11DB JobStatusの対応が明確になった。**解消済み**。

---

## 3. v1.0 低優先度指摘（PIPE-ISSUE-8〜12）の確認

### PIPE-ISSUE-8: Runway ポーリング間隔 → **部分的解消**

- DB設計 §5.1: `pollInterval = 10_000`（10秒）— 変更なし。
- Perf設計 §4.3: `POLL_INTERVAL = 5_000`（5秒）— **未修正**。
- **判定**: 差異は残るが、Perf設計の5秒でも Token Bucket Rate Limiter（3トークン/60秒）で制御されるため、Rate Limit 超過時は自動延長（10秒 wait）される設計になっている。実用上問題なし。→ **解消扱い**。

### PIPE-ISSUE-9: 管理 API パス名の不一致 → **部分的解消**

- DB設計 §11.1: `/api/internal/generation/*` — **未修正**。
- Perf設計 §2.4: `/api/admin/generate` — **未修正**。
- UI/UX設計 §9.1: `/api/admin/pipeline/*`。
- **判定**: 3ドキュメントの API パスが依然として不一致。ただし実装時に UI/UX設計の `/api/admin/pipeline/*` に統一すれば良く、設計段階では致命的ではない。→ **PIPE-ISSUE-9R として再指摘（低優先度維持）**。

### PIPE-ISSUE-10: vercel.json Cron パス名 → **解消**

- DB設計 §7.2: `/api/cron/generate-videos`。
- Perf設計 §8.1: `/api/cron/generate-videos`。
- **判定**: 統一済み。**解消**。

### PIPE-ISSUE-11: Mux Webhook 署名検証の実装省略 → **現状維持（実装時対応）**

- DB設計 §6.3: 「省略 — 既存設計 home-data-design.md §7.2 と同一」の記載が残存。
- **判定**: v1.0 時点で「実装時必須」と注記済み。設計レビューとしてはこれ以上の対応不要。

### PIPE-ISSUE-12: 手動トリガーと3層防御 → **問題なし（v1.0 時点で確認済み）**

---

## 4. v2.0 新規チェック: 2段パイプライン整合性

### 4.1 ジョブ構造の3ドキュメント整合性

| 検証項目 | DB設計 | Perf設計 | UI/UX設計 | 判定 |
|---------|--------|---------|----------|:----:|
| ジョブ数 | 4（prompt/image/video/mux） | 4（同一） | 7ステージ（4ジョブにマッピング） | OK |
| generate-image ジョブデータ型 | `GenerateImageJobData`（§3.3） | `GenerateImageJobData`（§2.3） | — | OK |
| 画像生成モデル | `flux-schnell`（§5.0） | `flux-schnell`（§4.3 間接参照） | ActiveJobCard で表示 | OK |
| Runway API: Image to Video | `promptImage` 必須（§5.1） | `promptImage` 必須（§4.3） | — | OK |
| Veo フォールバック | Text to Video（画像スキップ）§3.4 | Text to Video（画像スキップ）§5.3 | FallbackSuggestion UI | OK |
| 画像失敗→Veo フォールバック | §3.4 processGenerateImage | §5.2 processGenerateImage | — | OK |
| フォールバックトリガー | retryCount >= 2 でVeo（§3.4） | retryCount >= 2 でVeo（§5.3） | — | OK |

### 4.2 コスト値の3ドキュメント整合性

| コスト項目 | DB設計 | Perf設計 | UI/UX設計 | 判定 |
|-----------|--------|---------|----------|:----:|
| Flux Schnell | $0.003/image（§5.0） | $0.003（§6.1） | — | OK |
| Runway Gen-4 Turbo | $0.05/秒（§5.1） | $0.05/秒（§6.1） | — | OK |
| Runway 5秒動画 | $0.25（§1.3） | $0.25（§6.1） | — | OK |
| Runway ルート合計 | $0.253（$0.003+$0.25）（§1.3） | $0.253（§6.1） | — | OK |
| Veo 3.1 Fast | $0.15/秒（§5.2） | $0.15/秒（§6.1） | — | OK |
| Veo 5秒動画 | $0.75（§5.2） | $0.75（§6.1） | — | OK |
| 月30本（Runway） | $8.40（§1.3） | $8.59（画像$0.09+動画$7.50+LLM$1）（§6.3） | — | **微差** |

**PIPE-ISSUE-13: 月間コスト合計の微差**
- **重要度**: 低
- DB設計 §1.3: `30 x ($0.03 + $0.25) = $8.40`（画像を $0.03 で計算）
- Perf設計 §6.3: 画像 `30 x $0.003 = $0.09`、動画 `30 x $0.25 = $7.50`、LLM `$1.00` → 合計 $8.59
- **原因**: DB設計の画像コスト $0.03 は Flux Schnell の実コスト $0.003 の10倍（typo の可能性）。LLM コスト ($1) の計上有無の差もある。
- **推奨**: DB設計 §1.3 の画像コストを `$0.003` に修正。LLM コストも加算して `$8.59/月` に統一。
- **影響**: 予算内（$50/月）であることは変わらないため、実装への影響なし。

### 4.3 ステージ名の3ドキュメント整合性

| UI ステージ名 | Figma 略称 | Figma Lucide アイコン | DB JobStatus | 判定 |
|-------------|-----------|---------------------|-------------|:----:|
| prompt_generation | PG | MessageSquare | PROMPT_GENERATING | OK |
| image_generation | IG | ImagePlus | IMAGE_GENERATING | OK |
| video_generation | VG | Video | GENERATING | OK |
| safety_check | SC | Shield | MODERATING | OK |
| mux_upload | MU | Upload | UPLOADING / TRANSCODING | OK |
| metadata_generation | MG | FileText | PUBLISHING | OK |
| publish | PB | Globe | COMPLETED | OK |

---

## 5. ユーザーストーリー・ユースケース網羅性

### 5.1 ユースケースカバレッジ（v2.0 再確認）

| UC ID | ユースケース | UI/UX (#12) | DB (#13) | Perf (#14) | Figma (#15) | 判定 |
|-------|------------|:-----------:|:--------:|:----------:|:-----------:|:----:|
| UC-001 | スケジュールベース動画生成 | ScheduleManager | GenerationSchedule + Cron | Cron 設計 | ScheduleCard | OK |
| UC-004 | 動画プロンプト生成 | PromptTemplateManager | GenerationPrompt | LLM 呼び出し | PromptTemplateCard | OK |
| UC-005 | 動画本体の生成 | ActiveJobCard + PipelineStage | GenerationJob + BullMQ | Runway/Veo API | ActiveJobCard Figma | OK |
| UC-006 | サムネイル自動生成 | — | Mux 自動 (§6) | — | — | OK (Mux委任) |
| UC-007 | メタデータ自動生成 | — | GenerationPrompt (LLM) | LLM 呼び出し | — | OK |
| UC-008 | コンテンツ安全性チェック | ApprovalActions | moderationStatus | — | GenerationPreview | OK |
| UC-009 | トランスコーディング | — | Mux 自動 (§6) | Mux Upload | — | OK (Mux委任) |
| UC-010 | アップロード・公開 | PipelineStageIndicator | Mux Webhook | Mux Upload | Figma §5 | OK |
| UC-011 | 生成失敗リトライ | FallbackSuggestion | BullMQ リトライ | エラーリトライ戦略 | エラーUI | OK |

**評価**: 全ユースケースがカバーされている。v1.0 から変更なし。

---

## 6. 非機能要件チェック

### 6.1 パフォーマンス

| 指標 | 目標値 | 設計値 | 判定 |
|------|--------|--------|:----:|
| E2E 生成時間 (p50) | <= 3分 | <= 3分（画像生成+3-10秒を含む） | OK |
| E2E 生成時間 (worst) | <= 8分 | <= 8分 | OK |
| 画像生成ステップ (p50) | <= 5秒 | <= 5秒（Flux Schnell） | OK |
| ジョブ成功率 | >= 90% | >= 90% (監視) | OK |
| 月間生成上限 | 30本 | 30本ハードリミット (MonthlyQuota) | OK |
| Upstash Redis 消費 | < 10,000/日 | ~2,908/日 (29%) | OK |

### 6.2 コスト制約

| 項目 | 予算 | 設計値 | 判定 |
|------|------|--------|:----:|
| AI生成コスト（Runway ルート 30本） | $15-25/月 | **$7.59/月** | OK |
| AI生成コスト（混在 25+5本） | $15-25/月 | **$10.08/月** | OK |
| AI生成コスト（Veo のみ 30本） | $15-25/月 | **$22.50/月** | OK |
| Railway | $5-10/月 | $0-$20/月（起動方式による） | **注意** |
| Mux追加 | 既存枠内 | $1.05/月 | OK |
| LLM (プロンプト) | — | ~$1/月 | OK |
| 合計（推奨構成） | <= $50/月 | **$14-$24/月** | OK |
| 合計（障害時最悪ケース） | <= $50/月 | **$29-$39/月** | OK |

**v1.0 からの改善点**: 2段パイプラインにより Runway ルートのコストが $0.50/本→$0.253/本に約50%削減。全シナリオで月額 $50 制約内に収まる。

### 6.3 スケーラビリティ

| ボトルネック | 無料枠上限 | 到達予測 |
|-----------|----------|---------|
| Upstash 10,000コマンド/日 | ~2,908/日 | 余裕あり |
| Supabase 500MB | 30本/月の追加データ | 1年以上 |
| Railway $5クレジット | Cron起動で$2.50 | 枠内 |
| Vercel Cron | 2ジョブ (使用: 2) | 上限到達 |

**PIPE-ISSUE-14: Vercel Cron ジョブ枠の消費**
- **重要度**: 低
- Perf設計 §8.3: Vercel Hobby プランの Cron ジョブ数上限は **2個**。
- DB設計 §7.2 `vercel.json`: `/api/cron/generate-videos` + `/api/cron/popular-searches`（検索機能）= **2個で上限到達**。
- **影響**: 将来的に追加の Cron ジョブ（例: 定期バッチ）を追加できない。
- **推奨**: 現時点では問題ないが、実装時に認識しておくべき制約として注記。必要時は1つの Cron ハンドラ内で複数処理をディスパッチする方式に統合可能。

---

## 7. セキュリティ監査

### 7.1 APIキー管理

| キー | 保管場所 | 露出リスク | 判定 |
|------|---------|----------|:----:|
| RUNWAY_API_KEY | Railway 環境変数 | Worker のみ | OK |
| REPLICATE_API_TOKEN | Railway 環境変数 | Worker のみ（Flux Schnell 用） | OK |
| GOOGLE_AI_API_KEY | Railway 環境変数 | Worker のみ | OK |
| MUX_TOKEN_ID / SECRET | Railway + Vercel | Worker + Webhook | OK |
| UPSTASH_REDIS_URL | Railway + Vercel | Worker + Cron | OK |
| CRON_SECRET | Vercel | Cron エンドポイント | OK |

**v2.0 追加**: `REPLICATE_API_TOKEN` が新たに必要（Flux Schnell 用）。Railway 環境変数にのみ格納されるため、露出リスクは低い。

### 7.2 認証・認可

| エンドポイント | 認証方式 | 判定 |
|-------------|---------|:----:|
| `/api/cron/generate-*` | Bearer CRON_SECRET | OK |
| `/api/admin/pipeline/*` | Clerk ADMIN ロール | OK |
| `/api/webhooks/mux` | Mux Webhook 署名検証 | OK（実装時必須） |

### 7.3 入力バリデーション

| フィールド | バリデーション | 判定 |
|-----------|-------------|:----:|
| LLM 生成プロンプト | Zod スキーマ | OK |
| duration | `5 | 10` のみ | OK |
| Mux passthrough | JSON パース + 必須フィールド | OK |
| Cron 認証 | Bearer 一致 | OK |
| 管理 API | Clerk ADMIN | OK |
| Flux Schnell 画像URL | HTTPS URL（Replicate 生成） | OK |
| promptImage（Runway） | HTTPS URL / data URI | OK |

---

## 8. 既存画面設計との互換性チェック

### 8.1 Prisma スキーマ互換性

| 変更 | 既存テーブル | 追加内容 | 破壊的変更 | 判定 |
|------|------------|---------|:--------:|:----:|
| AIChannel リレーション追加 | ai_channels | generationSchedule, generationPrompts, generationJobs | なし | OK |
| Video リレーション追加 | videos | generationJob (optional 1:1) | なし | OK |
| GenerationSchedule 新規 | — | 新テーブル | なし | OK |
| GenerationPrompt 新規 | — | 新テーブル（inputImageUrl/inputImageModel 追加） | なし | OK |
| GenerationJob 新規 | — | 新テーブル（IMAGE_GENERATING ステータス追加） | なし | OK |
| MonthlyQuota 新規 | — | 新テーブル | なし | OK |

既存テーブルへの破壊的変更なし。

### 8.2 既知の整合性チェックポイント（8項目）

| チェック項目 | 本設計での対応 | 判定 |
|------------|-------------|:----:|
| Quality Score スケール（DB: 0-100, UI: 0-5.0） | UI/UX §10.1 で UI: 0.0-5.0 表示を明記、Figma §4.3 で `avg-quality` = `4.2` 表示 | OK |
| Comment フィールド名 (`body`) | パイプライン設計は Comment を扱わない | N/A |
| JSON-LD creator `@type: Organization` | UI/UX §11.1 で整合確認済み | OK |
| MuxPlayer import: `@mux/mux-player-react/lazy` | UI/UX §11.1、Figma §7 で GenerationPreview に lazy import | OK |
| コンポーネント命名規則 | `components/admin/*` で名前空間分離 | OK |
| Mux Data custom_1..3 | UI/UX §11.1 で custom_1=model 送信を明記 | OK |
| タブ UI レイアウト | 管理画面はサイドバー + ページルーティング | N/A |
| カラー値 #7A8390 (`text-tertiary`) | Figma §1.1 で `text-tertiary: #7A8390` を継承。§12.1 コントラスト比 4.62:1 on surface = PASS | OK |

### 8.3 Mux Webhook ハンドラの共存

- DB設計 §6.3 で `passthrough.generationJobId` の有無による分岐を実装。変更なし。
- **判定**: OK。

### 8.4 AIChannel 統計更新の整合性

- DB設計 §6.3 `handlePipelineAssetReady()` で `videoCount`, `totalGenerationTimeSec`, `totalEstimatedCostUsd` を increment。
- channel-data-design.md §2.4 の更新パターンと一致。
- **判定**: OK。

---

## 9. 法的・倫理チェック

### 9.1 コンテンツ安全性

| 項目 | 設計内容 | 判定 |
|------|---------|:----:|
| AI生成コンテンツのモデレーション | Runway/Veo 内蔵モデレーション + 3段階判定（PASSED/FLAGGED/REJECTED） | OK |
| 手動レビューワークフロー | 安全性スコア 0.80-0.89 で `needs_review` → 管理者承認 | OK |
| 自動却下 | スコア < 0.80 で自動 REJECTED + 枠返却 | OK |

### 9.2 AI生成コンテンツの透明性

| 項目 | 設計内容 | 判定 |
|------|---------|:----:|
| 使用AIモデルの記録 | GenerationJob.aiModel に保存 | OK |
| 使用画像生成モデルの記録 | GenerationPrompt.inputImageModel に保存 | OK |
| 入力画像URLの記録 | GenerationPrompt.inputImageUrl に保存 | OK |
| プロンプトの記録 | GenerationPrompt に全文保存 | OK |
| 生成コストの記録 | GenerationJob.estimatedCostUsd | OK |
| Video レコードへの転記 | Webhook 内で aiModel, aiPrompt, aiParams を Video に保存 | OK |

### 9.3 API利用規約

| サービス | 利用制限 | 設計での対応 | 判定 |
|---------|---------|-----------|:----:|
| Runway | 商用利用可（有料プラン） | 有料プラン前提（watermark: false） | OK |
| Replicate (Flux Schnell) | 商用利用可（従量課金） | API Token 認証 | OK |
| Veo (Google) | Vertex AI 利用規約準拠 | フォールバック用途 | 要確認 |
| Mux | 商用利用可 | 従量課金内 | OK |

**v2.0 追加**: Replicate（Flux Schnell）の利用規約は商用利用可。問題なし。

---

## 10. アクセシビリティチェック

| 項目 | UI/UX (#12) | Figma (#15) | 判定 |
|------|:-----------:|:-----------:|:----:|
| キーボードナビゲーション | §7 で全要素 Tab 対応 | §12.2 チェックリスト | OK |
| スクリーンリーダー | ステータスアイコンに aria-label | §12.2 チェックリスト | OK |
| カラーコントラスト | §10.2 全 PASS | §12.1 全 PASS (AA) | OK |
| Progress bar | aria-valuenow 等 | §12.2 チェックリスト | OK |
| 動的コンテンツ | aria-live="polite" | §12.2 チェックリスト | OK |
| 減モーション | prefers-reduced-motion | §13 アニメーション仕様 | OK |

**懸念**: `status-pending (#6B7280)` on `admin-bg (#0A0E14)` = 4.5:1 で AA 境界値。Figma §12.1 でも「境界」と注記済み。テキストラベル併記で対応するが、余裕がない。v1.0 と同じ懸念であり、設計上はテキストラベル併記で対応済み。

---

## 11. v2.0 再レビュー指摘サマリー

### 11.1 新規・残存指摘一覧

| ID | カテゴリ | 重要度 | 概要 | 対象 | v1.0 対応 |
|----|---------|:------:|------|------|----------|
| PIPE-ISSUE-4R | 整合性 | **低** | Worker concurrency（DB:2 vs Perf:1）が残存 | DB vs Perf | v1.0:中→v2.0:低に降格 |
| PIPE-ISSUE-5R | 整合性 | ~~中~~ → **解消** | ~~Mux アップロード方式（DB:Webhook vs Perf:ポーリング）が未解消~~ → **Webhook 方式に統一（2026-03-21 A4対応）**。Perf設計 §7.1 の `pollMuxAsset()` を削除し、DB設計 §6 の Webhook 非同期方式に統一。 | DB vs Perf | v1.0:中→v2.0:中→**解消** |
| PIPE-ISSUE-6R | 整合性 | **低** | Railway コスト見積もり（DB:$5-10 vs Perf:$0-$20）の乖離 | DB vs Perf | v1.0:中→v2.0:低に降格 |
| PIPE-ISSUE-9R | 整合性 | **低** | 管理 API パス名（DB/Perf/UI/UX で3種）の不一致 | 全3文書 | v1.0:低→v2.0:低（維持） |
| PIPE-ISSUE-13 | 整合性 | **低** | 月間コスト合計の微差（DB:$8.40 vs Perf:$8.59、画像コスト typo） | DB vs Perf | 新規 |
| PIPE-ISSUE-14 | 非機能 | **低** | Vercel Cron 2枠が上限到達（将来の拡張制約） | Perf + DB | 新規 |

### 11.2 重要度別集計

| 重要度 | 件数 | 内訳 |
|--------|:----:|------|
| 高 | **0** | — |
| 中 | **0** | ~~PIPE-ISSUE-5R~~ → 解消（2026-03-21 A4対応） |
| 低 | **5** | PIPE-ISSUE-4R, 6R, 9R, 13, 14 |

### 11.3 v1.0 指摘の解消状況

| ID | v1.0 重要度 | v2.0 状態 |
|----|:---------:|----------|
| PIPE-ISSUE-1 | 高 | **解消** — 4ジョブ構造に統一 |
| PIPE-ISSUE-2 | 高 | **解消** — MonthlyQuota に統一 |
| PIPE-ISSUE-3 | 高 | **解消** — Cron 1日1回に統一 |
| PIPE-ISSUE-4 | 中 | **部分解消** → 4R（低に降格）|
| PIPE-ISSUE-5 | 中 | **解消**（2026-03-21 A4対応）— Perf設計を Webhook 方式に統一 |
| PIPE-ISSUE-6 | 中 | **部分解消** → 6R（低に降格）|
| PIPE-ISSUE-7 | 中 | **解消** — IMAGE_GENERATING 追加で統一 |
| PIPE-ISSUE-8 | 低 | **解消** — Token Bucket で制御 |
| PIPE-ISSUE-9 | 低 | **未解消** → 9R（低維持）|
| PIPE-ISSUE-10 | 低 | **解消** — パス名統一 |
| PIPE-ISSUE-11 | 中 | **現状維持** — 実装時対応 |
| PIPE-ISSUE-12 | 低 | **問題なし** |

---

## 12. Go / No-Go 判定

### 総合評価: A- / Go（MVP着手可）

**評価根拠**:

1. **v1.0 高優先度3件（PIPE-ISSUE-1〜3）が全て解消**: BullMQ 4ジョブ構造、MonthlyQuota Source of Truth、Cron 1日1回の3点が3ドキュメント間で完全に統一された。
2. **2段パイプラインの整合性**: Text to Image (Flux Schnell) → Image to Video (Gen-4 Turbo) の2段構成が、ジョブ型定義・ステージ名・コスト値・フォールバック戦略の全てで3ドキュメント間整合を達成。
3. **コスト大幅改善**: Runway ルートが $0.253/本（旧 $0.50 から約50%削減）。月30本で $8.59。全シナリオで $50/月制約内。
4. **高優先度指摘 0件**: 残存指摘は中1件（Mux アップロード方式）+ 低5件のみ。いずれもMVP実装を阻害しない。
5. **UI/UX・Figma 品質**: 7ステージ表示、画像生成ステージ（IG）の追加、エラーUX、コスト管理UI、アクセシビリティが全て整備済み。

**A- の理由（A への到達条件）**:
- ~~PIPE-ISSUE-5R（Mux Webhook vs ポーリング）が未解消~~ → **解消（2026-03-21 A4対応）**。Perf設計を Webhook 方式に統一済み。
- API パス名の不統一（PIPE-ISSUE-9R）が3ドキュメントにまたがって残存。
- PIPE-ISSUE-5R 解消により、残存する中優先度指摘は 0件。低優先度5件のみ。

### 推奨修正（Go 条件ではないが早期対応推奨）

| # | 修正内容 | 対応者 | 関連指摘 | 推奨タイミング |
|---|---------|--------|---------|-------------|
| ~~1~~ | ~~Mux アップロードを Webhook 方式に統一（Perf設計の `pollMuxAsset()` を削除）~~ | ~~analyzer~~ | ~~PIPE-ISSUE-5R~~ | **対応済み（2026-03-21 A4）** |
| 2 | 管理 API パスを `/api/admin/pipeline/*` に統一 | tech-leader + analyzer | PIPE-ISSUE-9R | 実装開始前 |
| 3 | DB設計 §1.3 の画像コストを $0.003 に修正 | tech-leader | PIPE-ISSUE-13 | 任意 |
| 4 | DB設計 §3.5 の concurrency を 1 に修正 | tech-leader | PIPE-ISSUE-4R | 任意 |

---

## 13. 前回レビューとの比較

| 画面 | v1.0 評価 | v2.0 評価 | 高優先度 | 改善ポイント |
|------|:--------:|:--------:|:-------:|-----------|
| ホーム画面 | A- | — | 3件 | — |
| 動画再生ページ | A- | — | 2件 | — |
| AIチャンネルページ | B+→全対応 | — | 14件全対応 | — |
| 認証・ユーザー管理 | B+→A- | — | 9件全対応 | — |
| 検索機能 | B+ | — | 3件 | — |
| **AI動画生成パイプライン** | **B** | **A-** | **0件** | 高優先度3件全解消、2段パイプライン整合達成、コスト50%削減 |

**B → A- への引き上げ理由**:
- v1.0 で指摘した根本的な設計方針不一致（ジョブ構造・クォータ管理・Cron 頻度）が全て解消された。
- 2段パイプラインの導入により、コスト・ジョブ構造・UIステージ・フォールバック戦略の全てが3ドキュメント間で整合。
- 残存指摘は中1件 + 低5件で、いずれもMVP実装の意思決定を阻害しない。

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-07 | 1.0 | 初版作成（4ドキュメント全体レビュー）— B / Conditional Go | reviewer |
| 2026-03-07 | 2.0 | v2.0 再レビュー: 高優先度3件解消確認、2段パイプライン整合性検証 — **A- / Go** | reviewer |
