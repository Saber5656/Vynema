# AI動画生成パイプライン: パフォーマンス設計（最適化・モニタリング）

> 元ファイル: [ai-pipeline-performance-design.md](ai-pipeline-performance-design.md) から分割（§5-11）

---

## 5. エラーリトライ戦略

### 5.1 リトライ可能なエラー分類

| エラー種別 | リトライ | 最大回数 | バックオフ | 理由 |
|-----------|---------|---------|----------|------|
| Runway API 429 (Rate Limit) | YES | 3 | 指数（30s, 60s, 120s） | 一時的な制限 |
| Runway API 500/502/503 | YES | 3 | 指数（30s, 60s, 120s） | サーバー一時障害 |
| Runway タスクタイムアウト | YES | 2 | 固定（60s） | 再試行で成功する可能性 |
| Runway API 400 (Bad Request) | NO | - | - | プロンプト修正が必要 |
| Runway API 401/403 | NO | - | - | 認証エラー。手動対応必要 |
| Flux Schnell API エラー | YES | 3 | 指数（5s, 10s, 20s） | Replicate 一時障害 |
| Flux Schnell 画像生成失敗 | NO（フォールバック） | - | - | Veo Text to Video にフォールバック |
| Mux Upload 失敗 | YES | 5 | 指数（15s, 30s, 60s, 120s, 240s） | ネットワーク一時障害 |
| Supabase DB エラー | YES | 3 | 指数（5s, 10s, 20s） | 接続一時障害 |
| LLM API エラー | YES | 3 | 指数（10s, 20s, 40s） | 一時障害 |
| コンテンツ安全性チェック不合格 | NO | - | - | 再生成が必要（プロンプト変更） |
| 月間上限到達（MonthlyQuota） | NO | - | - | 制限の意図的な超過防止 |

### 5.2 BullMQ ジョブディスパッチャ

DB設計（#13 v2.0 §3.5）に準拠した4ジョブチェーン方式。各ジョブは完了時に次のジョブを BullMQ に投入する。

```typescript
// worker/processor.ts（DB設計 §3.5 準拠）

import { Job, UnrecoverableError } from "bullmq";
import { videoGenerationQueue, JOB_OPTIONS } from "@/lib/queue/video-generation";
import { releaseMonthlyQuota } from "@/lib/quota/monthly-quota";
import type { VideoGenerationJobData } from "@/lib/queue/types";

/**
 * ジョブディスパッチャ: ジョブ種別に応じて処理を振り分ける
 */
export async function processVideoGeneration(
  job: Job<VideoGenerationJobData>
) {
  switch (job.data.type) {
    case "generate-prompt":
      return processGeneratePrompt(job);
    case "generate-image":
      return processGenerateImage(job);
    case "generate-video":
      return processGenerateVideo(job);
    case "upload-to-mux":
      return processUploadToMux(job);
  }
}

/**
 * generate-prompt: LLM でプロンプト生成 → generate-image ジョブ投入
 */
async function processGeneratePrompt(job: Job<GeneratePromptJobData>) {
  const prompt = await generatePrompt(job.data.channelId);

  // 次ステップ: generate-image ジョブ投入
  await videoGenerationQueue.add(
    "generate-image",
    {
      type: "generate-image",
      generationJobId: prompt.generationJobId,
      promptId: prompt.id,
      channelId: job.data.channelId,
      videoPrompt: prompt.videoPrompt,
      imageModel: "flux-schnell",
    } satisfies GenerateImageJobData,
    JOB_OPTIONS["generate-image"]
  );
}

/**
 * generate-image: Flux Schnell で入力画像生成 → generate-video ジョブ投入
 * 画像生成失敗時は Veo Text to Video にフォールバック（promptImage なし）
 */
async function processGenerateImage(job: Job<GenerateImageJobData>) {
  try {
    const imageResult = await callImageApi(job.data.videoPrompt);

    // Runway Gen-4 Turbo (Image to Video) で次ステップ
    await videoGenerationQueue.add(
      "generate-video",
      {
        type: "generate-video",
        generationJobId: job.data.generationJobId,
        promptId: job.data.promptId,
        channelId: job.data.channelId,
        aiModel: "runway-gen4-turbo",
        videoPrompt: job.data.videoPrompt,
        promptImage: imageResult.imageUrl,
        duration: 5,
        isRetry: false,
        retryCount: 0,
      } satisfies GenerateVideoJobData,
      JOB_OPTIONS["generate-video"]
    );
  } catch {
    // 画像生成失敗 → Veo Text to Video にフォールバック
    console.warn("[Worker] Image generation failed, falling back to Veo");
    await videoGenerationQueue.add(
      "generate-video",
      {
        type: "generate-video",
        generationJobId: job.data.generationJobId,
        promptId: job.data.promptId,
        channelId: job.data.channelId,
        aiModel: "veo-3.1-fast",
        videoPrompt: job.data.videoPrompt,
        promptImage: "",                    // Veo は Text to Video（画像不要）
        duration: 5,
        isRetry: false,
        retryCount: 0,
      } satisfies GenerateVideoJobData,
      JOB_OPTIONS["generate-video"]
    );
  }
}

/**
 * generate-video: Runway/Veo で動画生成 → upload-to-mux ジョブ投入
 * Runway 失敗時のフォールバックは §5.3 参照
 */
async function processGenerateVideo(job: Job<GenerateVideoJobData>) {
  try {
    const result = await generateVideo(job.data);

    // 次ステップ: upload-to-mux ジョブ投入
    await videoGenerationQueue.add(
      "upload-to-mux",
      {
        type: "upload-to-mux",
        generationJobId: job.data.generationJobId,
        outputUrl: result.videoUrl,
        title: "", // upload-to-mux 内で GenerationPrompt から取得
        channelId: job.data.channelId,
      } satisfies UploadToMuxJobData,
      JOB_OPTIONS["upload-to-mux"]
    );
  } catch (error) {
    // リトライ不可のエラー
    if (error instanceof RunwayApiError && [400, 401, 403].includes(error.status)) {
      await releaseMonthlyQuota(0);
      throw new UnrecoverableError(`Runway API error ${error.status}: ${error.message}`);
    }
    throw error;
  }
}
```

### 5.3 フォールバック戦略（2段パイプライン対応）

DB設計（#13 v2.0 §3.4）に準拠。フォールバックは2段階で発生する。

```
フォールバック1: generate-image 失敗
  → Veo 3.1 Fast に切替（Text to Video 直接、画像生成スキップ）
  → generate-video ジョブを aiModel="veo-3.1-fast", promptImage="" で投入

フォールバック2: generate-video (Runway) 失敗
  → BullMQ リトライ 3回目で Veo 3.1 Fast にフォールバック
  → retryCount >= 2 の場合、Veo Text to Video で再試行
```

```typescript
// worker/steps/generate-video.ts

export async function generateVideo(
  jobData: GenerateVideoJobData
): Promise<GenerationResult> {
  // Veo の場合は Text to Video 直接（画像不要）
  if (jobData.aiModel === "veo-3.1-fast") {
    return await generateWithVeo({
      prompt: jobData.videoPrompt,
      duration: jobData.duration,
    });
  }

  // Runway Gen-4 Turbo: Image to Video（入力画像必須）
  if (!jobData.promptImage) {
    throw new UnrecoverableError("Runway Gen-4 Turbo requires promptImage");
  }

  try {
    return await generateWithRunway({
      prompt: jobData.videoPrompt,
      promptImage: jobData.promptImage,
      duration: jobData.duration as 5 | 10,
      model: "gen4_turbo",
    });
  } catch (error) {
    // 3回目のリトライ → Veo にフォールバック
    if (jobData.retryCount >= 2 && error instanceof RunwayApiError) {
      console.warn("[Generator] Runway failed 3 times, falling back to Veo");
      return await generateWithVeo({
        prompt: jobData.videoPrompt,
        duration: jobData.duration,
      });
    }
    throw error;
  }
}
```

---

## 6. コスト最適化設計

### 6.1 2段パイプライン コスト比較

| 項目 | Runway ルート | Veo ルート |
|------|-------------|----------|
| 画像生成（Flux Schnell） | **$0.003** | — (スキップ) |
| 動画生成（5秒） | **$0.25**（Gen-4 Turbo $0.05/秒 x 5秒） | **$0.75**（Veo $0.15/秒 x 5秒） |
| **1本あたり合計** | **$0.253** | **$0.75** |
| 生成方式 | Image to Video（入力画像必須） | Text to Video（直接） |
| 生成時間 | ~60-300秒 | ~30-90秒 |
| 画質 | 高（1080p） | 中-高（720p-1080p） |

> **注**: DB設計（#13 v2.0）では Runway $0.05/秒、Veo $0.15/秒で計算。
> Runway ルートは画像生成コスト（$0.003）を含めても $0.253/本と Veo より大幅に安価。

### 6.2 使い分け基準

Runway ルートが Veo より安価（$0.253 vs $0.75/本）なため、Runway をデフォルトとして使用する。

| 基準 | Runway ルート（推奨） | Veo ルート |
|------|-------------------|----------|
| **通常生成（デフォルト）** | **採用**（コスト最適） | -- |
| **Runway 障害時フォールバック** | -- | **採用** |
| **画像生成失敗時フォールバック** | -- | **採用**（Text to Video 直接） |
| **高品質が不要な場合** | -- | Veo の方が生成時間短い |

### 6.3 月間コストシミュレーション

#### シナリオ A: Runway ルートのみ（月30本、推奨）
```
画像生成: 30本 x $0.003 = $0.09
動画生成: 30本 x $0.25 = $7.50
Railway: $0 (Cron起動、$5クレジット内)
LLM (プロンプト + メタデータ): ~$1.00
合計: ~$8.59
```

#### シナリオ B: Runway 25本 + Veo フォールバック 5本
```
Runway:  25本 x $0.253 = $6.33
Veo:     5本 x $0.75 = $3.75
Railway: $0 ($5クレジット内)
LLM: ~$1.00
合計: ~$11.08
```

#### シナリオ C: Veo のみ（Runway 完全障害時）
```
30本 x $0.75 = $22.50
Railway: $0 ($5クレジット内)
LLM: ~$1.00
合計: ~$23.50
```

> **コスト構造の変化**: 2段パイプライン + 修正後の単価により、Runway ルートが最安（$0.253/本）。
> 旧設計（$0.50/本）から約50%のコスト削減。

### 6.4 動的コスト管理ロジック

MonthlyQuota テーブル（DB設計 §2.5）を使用してコスト状況を管理する。
COUNT クエリではなく MonthlyQuota の `usedCount` / `totalCostUsd` を直接参照することで高速に状況取得。

```typescript
// lib/cost-manager.ts

import { prisma } from "@/lib/db";

const MONTHLY_BUDGET_USD = 15;   // AI 生成予算（月額）※Runway ルート $0.253 x 30 ≈ $8.59
const RUNWAY_COST_PER_VIDEO = 0.253;  // 画像 $0.003 + 動画 $0.25
const VEO_COST_PER_VIDEO = 0.75;      // Veo Text to Video $0.15/秒 x 5秒
const MONTHLY_VIDEO_LIMIT = 30;

interface CostStatus {
  monthlySpent: number;          // 今月の合計支出（MonthlyQuota.totalCostUsd）
  monthlyRemaining: number;      // 残り予算
  videosGenerated: number;       // 今月の生成本数（MonthlyQuota.usedCount）
  videosRemaining: number;       // 残り生成可能本数
  recommendedModel: "runway" | "veo";
  canGenerate: boolean;
}

export async function getCostStatus(): Promise<CostStatus> {
  const yearMonth = getCurrentYearMonth();

  // MonthlyQuota テーブルから直接取得（COUNT クエリ不要）
  const quota = await prisma.monthlyQuota.findUnique({
    where: { yearMonth },
  });

  const videosGenerated = quota?.usedCount ?? 0;
  const monthlySpent = quota?.totalCostUsd ?? 0;
  const monthlyRemaining = MONTHLY_BUDGET_USD - monthlySpent;
  const videosRemaining = MONTHLY_VIDEO_LIMIT - videosGenerated;

  // Runway がデフォルト（Veo より安価）。予算不足時のみ Veo
  const recommendedModel: "runway" | "veo" =
    monthlyRemaining >= RUNWAY_COST_PER_VIDEO ? "runway" : "veo";

  return {
    monthlySpent: Math.round(monthlySpent * 100) / 100,
    monthlyRemaining: Math.round(monthlyRemaining * 100) / 100,
    videosGenerated,
    videosRemaining: Math.max(0, videosRemaining),
    recommendedModel,
    canGenerate: videosRemaining > 0 && monthlyRemaining >= RUNWAY_COST_PER_VIDEO,
  };
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
```

### 6.5 月額コスト全体への影響

| シナリオ | インフラ（既存） | AI生成 | Railway | LLM | 合計 |
|---------|---------------|--------|---------|-----|------|
| **推奨構成** (Runway ルート 30本) | $5~$15 | $7.59 | $0 | $1 | **$14~$24** |
| **混在構成** (Runway 25本 + Veo 5本) | $5~$15 | $10.08 | $0 | $1 | **$16~$26** |
| **障害時** (Veo のみ 30本) | $5~$15 | $22.50 | $0 | $1 | **$29~$39** |

**全シナリオで月額$50 制約内に収まる。** Runway ルートのコスト大幅削減（旧 $15 → $7.59）により、予算に余裕が拡大。

---

## 7. Mux アップロード最適化

### 7.1 Mux アップロード → Webhook 非同期方式

> **PIPE-ISSUE-5R 対応（2026-03-21）**: 旧 Perf 設計では `pollMuxAsset()` によるポーリング同期方式を記載していたが、DB設計（ai-pipeline-data-design.md §6）の Webhook 非同期方式に統一する。ポーリング方式は以下の理由で削除:
> - ポーリング中 Worker スレッドが占有され、concurrency が実質半減する
> - Mux の `video.asset.ready` Webhook が本番環境で推奨されるイベント駆動パターン
> - DB設計の passthrough 埋め込み → Webhook 紐付けフローが既に完成しており、二重実装は不要

Railway ワーカーから Mux へのアップロードは URL-based input を使用する。
Mux Asset 作成後はジョブを完了し、トランスコード完了は Webhook で非同期に受信する。

```typescript
// worker/steps/upload-to-mux.ts

import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

interface MuxUploadInput {
  videoUrl: string;
  generationJobId: string;
  channelId: string;
  title: string;
}

interface MuxUploadResult {
  assetId: string;
}

/**
 * 生成された動画を Mux にアップロードする。
 *
 * passthrough に generationJobId を埋め込み、Webhook（video.asset.ready）で
 * GenerationJob → Video レコード作成の紐付けに使用する。
 *
 * ⚠️ この関数は Asset 作成のみ行い、トランスコード完了を待機しない。
 *    トランスコード完了は Mux Webhook で非同期に処理される。
 *    （参照: ai-pipeline-data-design.md §6.3 handlePipelineAssetReady）
 */
export async function uploadToMux(input: MuxUploadInput): Promise<MuxUploadResult> {
  const { videoUrl, generationJobId, channelId, title } = input;

  // Mux に URL を渡して直接インジェスト（Railway からのダウンロード不要）
  const asset = await mux.video.assets.create({
    input: [{ url: videoUrl }],
    playback_policy: ["public"],
    encoding_tier: "baseline",      // コスト最適化（smart より安価）
    mp4_support: "none",            // HLS のみ（MP4 ダウンロード不要）
    // passthrough にジョブIDを埋め込み（Webhook で紐付けに使用）
    passthrough: JSON.stringify({ generationJobId, channelId, title }),
  });

  return { assetId: asset.id };
  // → 以後は Mux Webhook（video.asset.ready / video.asset.errored）で処理継続
  //   参照: app/api/webhooks/mux/route.ts（ai-pipeline-data-design.md §6.3）
}
```

**Webhook フロー概要:**

```
Worker: uploadToMux() → Asset 作成 + passthrough 埋め込み → ジョブ完了
  ↓（非同期）
Mux: トランスコード処理
  ↓
Mux Webhook: POST /api/webhooks/mux
  ├── video.asset.ready → handlePipelineAssetReady()
  │     → Video レコード作成 + GenerationJob.status = COMPLETED
  │     → AIChannel 統計更新（videoCount, totalGenerationTimeSec 等）
  └── video.asset.errored → handlePipelineAssetErrored()
        → GenerationJob.status = FAILED + 月間枠返却
```

> 詳細な Webhook ハンドラ実装は ai-pipeline-data-design.md §6.3 を参照。

### 7.2 Mux コスト最適化設定

| 設定 | 値 | コスト影響 | 理由 |
|------|-----|---------|------|
| `encoding_tier` | `"baseline"` | Encoding コスト削減 | AI 生成動画は元々高品質。Smart Encoding 不要 |
| `mp4_support` | `"none"` | Storage コスト削減 | HLS ストリーミングのみ。ダウンロード機能不要 |
| `playback_policy` | `["public"]` | -- | 署名付き URL 不要（公開コンテンツ） |
| `max_resolution_tier` | `"1080p"` | Storage コスト削減 | 4K は不要（AI 生成動画は 1080p が上限） |

### 7.3 Mux コスト見積もり（月30本生成、5秒動画）

| 項目 | 単価 | 想定（月間） | 月額 |
|------|------|-----------|------|
| Video Encoding | $0.015/分 | 30本 x 5秒 = 2.5分 | $0.04 |
| Storage | $0.007/GB/月 | 30本 x 25MB = 0.75GB | $0.005 |
| Streaming Delivery | $0.006/分視聴 | 2,000回 x 5秒 = 167分 | $1.00 |
| **合計** | | | **$1.05** |

> **注**: Gen-4 Turbo は 5秒動画で $0.25。10秒動画（$0.50）も可能だが、MVP ではコスト最適化のため 5秒を基本とする。

---

## 8. スケジュール生成の Cron 設計

### 8.1 Cron ジョブの構成

DB設計（#13 v2.0）に準拠。1日1回の Cron でチェーンの起点（generate-prompt）を投入。

```
Vercel Cron (vercel.json) -> Next.js API Route -> MonthlyQuota チェック
                                                -> BullMQ: generate-prompt 投入
                                                -> Railway Worker: チェーン実行
```

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/generate-videos",
      "schedule": "0 1 * * *"
    }
  ]
}
```

### 8.2 Cron API Route

```typescript
// app/api/cron/generate-videos/route.ts（DB設計 §7 準拠）

import { type NextRequest } from "next/server";
import { videoGenerationQueue, JOB_OPTIONS } from "@/lib/queue/video-generation";
import { consumeMonthlyQuota, QuotaExceededError } from "@/lib/quota/monthly-quota";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  // Vercel Cron 認証
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // MonthlyQuota で月間上限チェック + 枠消費
  try {
    await consumeMonthlyQuota(0); // 仮コスト（実コストは生成後に更新）
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      console.log("[Cron] Monthly limit reached, skipping generation");
      return Response.json({ skipped: true, reason: "monthly_limit" });
    }
    throw error;
  }

  // ラウンドロビンでチャンネルを選択
  const channels = await prisma.aIChannel.findMany({
    where: { isActive: true },
    orderBy: { lastGeneratedAt: "asc" },
    take: 1,
  });

  if (channels.length === 0) {
    return Response.json({ skipped: true, reason: "no_active_channels" });
  }

  const channel = channels[0];

  // generate-prompt ジョブを投入（チェーンの起点）
  const job = await videoGenerationQueue.add(
    "generate-prompt",
    {
      type: "generate-prompt",
      channelId: channel.id,
    } satisfies GeneratePromptJobData,
    JOB_OPTIONS["generate-prompt"]
  );

  return Response.json({
    jobId: job.id,
    channel: channel.slug,
  });
}
```

### 8.3 Vercel Cron の制約

| 制約 | Hobby プラン | 影響 |
|------|-----------|------|
| Cron ジョブ数 | 2個 | 1日1回生成で十分 |
| 最小間隔 | 1日1回 | MVP 十分 |
| 実行時間 | 10秒以内 | ジョブ投入のみ（実処理は Railway） |

---

## 9. パフォーマンスモニタリング

### 9.1 パイプライン固有の計測指標

| 指標 | 計測方法 | 目標値 | 確認頻度 |
|------|---------|-------|---------|
| E2E 生成時間 | BullMQ 全4ジョブの合計時間 | ≤3分 (p50) | 毎回 |
| 画像生成ステップ時間 | generate-image ジョブ時間 | ≤5秒 (p50) | 毎回 |
| 動画生成ステップ時間 | generate-video ジョブ時間 | ≤120秒 (p50) | 毎回 |
| ジョブ成功率 | completed / (completed + failed) | ≥90% | 週次 |
| リトライ率 | `job.attemptsMade > 1` の割合 | ≤20% | 週次 |
| 月間生成コスト | `MonthlyQuota.totalCostUsd` | ≤$15 | 月次 |
| Veo フォールバック率 | Veo 使用数 / 全生成数 | ≤15% | 月次 |
| Runway API エラー率 | Runway 固有エラー / 全リクエスト | ≤5% | 週次 |
| Mux アップロード成功率 | Mux ready / 全アップロード | ≥99% | 月次 |

### 9.2 アラート・対応フロー

```
指標劣化検知
  |
  |-- ジョブ成功率 < 80%
  |    |-- Runway API ステータス確認
  |    |-- Veo フォールバック比率確認
  |    |-- プロンプト品質チェック（安全性不合格率）
  |
  |-- E2E 生成時間 > 8分（ワーストケース超過）
  |    |-- Runway API レスポンスタイム確認
  |    |-- Mux トランスコード時間確認
  |    |-- Railway ワーカーのメモリ使用量確認
  |
  |-- MonthlyQuota.totalCostUsd > $13（予算 87%）
  |    |-- Veo フォールバック頻度の確認
  |    |-- MonthlyQuota.videosRemaining を確認
  |    |-- 必要に応じて月間上限を引き下げ
  |
  |-- Redis コマンド > 8,000/日
  |    |-- ポーリング間隔の延長（5秒 -> 10秒）
  |    |-- BullMQ 進捗更新頻度の削減
```

### 9.3 ログ設計

```typescript
// worker/logger.ts

interface GenerationLog {
  jobId: string;
  channelSlug: string;
  step: string;
  duration_ms: number;
  model: string;
  cost_usd: number;
  status: "success" | "failure" | "retry";
  error?: string;
}

export function logGeneration(log: GenerationLog) {
  // 構造化ログ（Railway のログで検索可能）
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "video-generation-worker",
    ...log,
  }));
}
```

### 9.4 モニタリング構成（全て無料）

| 計測対象 | ツール | コスト | 確認頻度 |
|---------|--------|-------|---------|
| ジョブ状態（完了/失敗/リトライ） | Railway ログ | 無料 | 毎回（障害時即時） |
| E2E 生成時間 | BullMQ ジョブメタデータ | 無料 | 毎回 |
| 月間コスト集計 | MonthlyQuota テーブル | 無料 | 月次 |
| Redis コマンド消費 | Upstash Dashboard | 無料 | 週次 |
| Mux エンコーディング状態 | Mux Dashboard | 無料 | 月次 |
| Vercel Cron 実行状況 | Vercel Dashboard | 無料 | 週次 |

---

## 10. 実装チェックリスト

### BullMQ ジョブキュー

- [ ] `video-generation` キューが Upstash Redis に接続されている
- [ ] 4種別のジョブ（generate-prompt / generate-image / generate-video / upload-to-mux）が投入可能
- [ ] ジョブ種別ごとのタイムアウト・リトライ設定（JOB_OPTIONS）が適用されている
- [ ] 完了ジョブは7日後に自動削除される
- [ ] 失敗ジョブは30日後に自動削除される

### Railway ワーカー

- [ ] Worker の concurrency=1 が設定されている
- [ ] ジョブディスパッチャが4種別を正しく振り分ける
- [ ] Graceful shutdown（`drained` イベント）が実装されている
- [ ] ヘルスチェックエンドポイント (`/health`) が実装されている
- [ ] メモリ使用量が 512MB 以下に収まっている

### 2段パイプライン（画像生成 + 動画生成）

- [ ] Flux Schnell API（Replicate）で入力画像が生成される
- [ ] 画像生成失敗時に Veo Text to Video へのフォールバックが動作する
- [ ] Runway Gen-4 Turbo に `promptImage`（入力画像URL）が渡される
- [ ] Token Bucket Rate Limiter（3トークン、60秒補充）が設定されている
- [ ] ポーリング間隔が 5秒に設定されている
- [ ] Runway 3回失敗時に Veo へのフォールバックが動作する
- [ ] 400/401/403 エラーは `UnrecoverableError` でリトライ不可にマークされている

### コスト管理

- [ ] MonthlyQuota テーブルで月間30本のハードリミットが実装されている
- [ ] `consumeMonthlyQuota()` がトランザクション内で枠チェック + 消費を行う
- [ ] `releaseMonthlyQuota()` が失敗時に枠を返却する
- [ ] `getCostStatus()` が MonthlyQuota テーブルからコスト状況を取得する
- [ ] Cron ジョブが MonthlyQuota を確認してから生成を開始する

### Mux アップロード

- [ ] `encoding_tier="baseline"` が設定されている
- [ ] `mp4_support="none"` が設定されている
- [ ] アップロード完了のポーリング（5秒間隔、最大30回）が実装されている

### モニタリング

- [ ] 構造化ログ（JSON 形式）が Railway に出力されている
- [ ] ジョブ完了時に E2E 時間・コスト・モデルが記録されている
- [ ] 月間コスト集計が MonthlyQuota テーブルから取得可能

---

## 11. 前ページとの差分まとめ

| 項目 | ホーム画面 | 動画再生ページ | チャンネルページ | 検索ページ | **AI パイプライン** |
|------|----------|-------------|--------------|----------|-----------------|
| 実行環境 | Vercel | Vercel | Vercel | Vercel | **Railway（ワーカー）** |
| レイテンシ目標 | TTFB≤200ms | TTFB≤200ms | TTFB≤200ms | TTFB≤100ms | **E2E≤3分** |
| パイプライン構成 | — | — | — | — | **4ジョブチェーン（prompt→image→video→mux）** |
| キャッシュ | ISR+CDN | ISR+CDN | ISR+CDN | CDN+Redis+TanStack | **BullMQ ジョブキュー** |
| Rate Limiting | 60 req/60s | 60 req/60s | 30 req/60s | 30 req/60s | **Token Bucket (Runway API)** |
| 主要コスト | $0 | Mux $2 | $0 | $0 | **AI生成 $7.59 + LLM $1 + Mux $1.05** |
