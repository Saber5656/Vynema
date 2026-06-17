# AI動画生成パイプライン: パフォーマンス設計（アーキテクチャ・Rate Limiting）

> 元ファイル: [ai-pipeline-performance-design.md](ai-pipeline-performance-design.md) から分割（§1-4）

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: analyzer
Task: #14

**前提: 個人開発レベルの予算制約（月額$50以下目標）。AI動画生成コストが最大の支出項目。**

---

## 1. パイプライン全体アーキテクチャ

### 1.1 E2E フロー概要

2段パイプライン構成: Text to Image（Flux Schnell）→ Image to Video（Gen-4 Turbo）。
Veo 3.1 Fast フォールバック時は Text to Video 直接（画像生成ステップをスキップ）。
ジョブは DB設計（#13）に準拠し4分割: generate-prompt / generate-image / generate-video / upload-to-mux。

```
[トリガー] スケジュール (Cron 1日1回) or 手動起動
  |
[Next.js API Route] MonthlyQuota チェック + ジョブ投入 -> BullMQ Queue
  |                                    ~5ms
[Railway Worker] Job: generate-prompt
  |-- ジョブ取得                        ~100ms
  |-- プロンプト生成 (LLM)              ~3-10秒
  |-- generate-image ジョブ投入
  |
[Railway Worker] Job: generate-image
  |-- 入力画像生成 (Flux Schnell)       ~3-10秒
  |-- generate-video ジョブ投入
  |
[Railway Worker] Job: generate-video
  |-- 動画生成 (Runway Gen-4 Turbo      ~60-300秒
  |     Image to Video)
  |-- フォールバック: Veo 3.1 Fast
  |     (Text to Video、画像スキップ)
  |-- upload-to-mux ジョブ投入
  |
[Railway Worker] Job: upload-to-mux
  |-- Mux アップロード + トランスコード   ~10-30秒
  |-- メタデータ生成 + DB 登録           ~3-10秒
  |
[完了] Webhook 通知 -> 管理ダッシュボード更新
------------------------------------------------------
E2E 合計:                              ~80-365秒 (1.5-6分)
                                       ※画像生成 ~3-10秒追加、安全性チェックは
                                         upload-to-mux 内に統合
```

### 1.2 E2E レイテンシ目標

| フェーズ | ジョブ | 目標値 | ワーストケース | ボトルネック |
|---------|-------|-------|-------------|-----------|
| ジョブ投入 + MonthlyQuota チェック | — | ≤ 1秒 | 5秒 | Upstash Redis + Supabase |
| プロンプト生成（LLM） | generate-prompt | ≤ 10秒 | 30秒 | OpenAI/Anthropic API |
| **入力画像生成（Flux Schnell）** | **generate-image** | **≤ 5秒** | **10秒** | **Replicate API** |
| **動画生成（AI API）** | **generate-video** | **≤ 120秒** | **300秒** | **Runway/Veo API（最大ボトルネック）** |
| Mux アップロード + メタデータ登録 | upload-to-mux | ≤ 30秒 | 60秒 | Mux Upload API + Supabase |
| **E2E 合計** | — | **≤ 3分** | **8分** | 動画生成がクリティカルパス |

> **画像生成の影響**: Flux Schnell は通常 2-5秒で完了するため、E2E 合計への影響は微小（+3-10秒）。
> Veo フォールバック時は画像生成をスキップするため、E2E は変わらない。

### 1.3 スループット目標

| 指標 | 目標値 | 根拠 |
|------|-------|------|
| 日間生成本数 | 1-2本/日 | 月30本 / 30日 |
| 並行生成数 | 1（シングルワーカー） | Railway $5 予算制約 |
| 月間上限 | 30本（ハードリミット） | コスト管理（MonthlyQuota テーブルで管理。~$8.40/月） |

---

## 2. BullMQ + Upstash Redis ジョブキュー設計

### 2.1 BullMQ 選定理由

| 要件 | BullMQ の対応 |
|------|-------------|
| ジョブの永続化 | Redis ベースで永続化。Railway ワーカー再起動時もジョブが失われない |
| リトライ | 指数バックオフ付き自動リトライ |
| 優先度キュー | ジョブ優先度の設定可能 |
| 進捗追跡 | `job.updateProgress()` でリアルタイム進捗更新 |
| Upstash 互換 | `@upstash/redis` 経由で HTTP ベース Redis に対応 |
| コスト | Upstash Free（10,000コマンド/日）で十分 |

### 2.2 キュー構成

DB設計（#13 v2.0）に準拠し、4種別のジョブを単一キュー `video-generation` で管理する。
ジョブ種別ごとにタイムアウト・リトライ設定が異なるため、ジョブ投入時に個別指定する。

```typescript
// lib/queue/video-generation.ts

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

// Upstash Redis 接続（BullMQ は ioredis を使用）
// 注意: BullMQ は HTTP ベースの @upstash/redis に非対応。
// Upstash の Redis 互換エンドポイント（rediss://）を使用する。
const connection = new IORedis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null, // BullMQ 要件
  tls: { rejectUnauthorized: false },
});

// 動画生成キュー（4種別のジョブを管理）
export const videoGenerationQueue = new Queue("video-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: {
      age: 7 * 24 * 3600,          // 完了ジョブは7日後に削除
      count: 100,                   // 直近100件は保持
    },
    removeOnFail: {
      age: 30 * 24 * 3600,         // 失敗ジョブは30日後に削除
    },
  },
});

// ジョブ種別ごとのオプション（DB設計 §3.1 に準拠）
export const JOB_OPTIONS = {
  "generate-prompt": {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 10_000 },
    timeout: 60_000,               // 1分
  },
  "generate-image": {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 5_000 },
    timeout: 60_000,               // 1分
  },
  "generate-video": {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 30_000 },
    timeout: 10 * 60 * 1000,      // 10分
  },
  "upload-to-mux": {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 15_000 },
    timeout: 5 * 60 * 1000,       // 5分
  },
} as const;
```

### 2.3 ジョブデータ型定義

DB設計（#13 v2.0 §3.3）に準拠。各ジョブが完了時に次のジョブを投入するチェーン方式。

```typescript
// lib/queue/types.ts（DB設計 §3.3 準拠）

// ── プロンプト生成ジョブ ──
interface GeneratePromptJobData {
  type: "generate-prompt";
  channelId: string;
  scheduleId?: string;           // スケジュール起動の場合
}

// ── 画像生成ジョブ（2段パイプライン Step 1） ──
interface GenerateImageJobData {
  type: "generate-image";
  generationJobId: string;       // GenerationJob.id
  promptId: string;              // GenerationPrompt.id
  channelId: string;
  videoPrompt: string;           // 画像生成にも同じプロンプトを使用
  imageModel: string;            // "flux-schnell"
}

// ── 動画生成ジョブ（2段パイプライン Step 2） ──
interface GenerateVideoJobData {
  type: "generate-video";
  generationJobId: string;
  promptId: string;
  channelId: string;
  aiModel: string;               // "runway-gen4-turbo" | "veo-3.1-fast"
  videoPrompt: string;
  promptImage: string;           // 入力画像URL（Gen-4 Turbo Image to Video 用）
  duration: number;
  isRetry: boolean;
  retryCount: number;
}

// ── Mux アップロードジョブ ──
interface UploadToMuxJobData {
  type: "upload-to-mux";
  generationJobId: string;
  outputUrl: string;             // 生成された動画の一時URL
  title: string;
  channelId: string;
}

type VideoGenerationJobData =
  | GeneratePromptJobData
  | GenerateImageJobData
  | GenerateVideoJobData
  | UploadToMuxJobData;

export interface VideoGenerationResult {
  videoId: string;                 // 生成された Video の DB ID
  muxPlaybackId: string;           // Mux Playback ID
  modelUsed: string;               // 実際に使用したモデル
  generationTimeMs: number;        // 動画生成にかかった時間
  totalTimeMs: number;             // E2E 合計時間
  estimatedCostUsd: number;        // 推定コスト
}
```

### 2.4 ジョブ投入 API

MonthlyQuota テーブル（DB設計 §2.5）で月間上限を管理する。
`consumeMonthlyQuota()` でトランザクション内の枠チェック + 消費を行い、
失敗時は `releaseMonthlyQuota()` で枠を返却する。

```typescript
// app/api/admin/generate/route.ts

import { type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { videoGenerationQueue, JOB_OPTIONS } from "@/lib/queue/video-generation";
import { consumeMonthlyQuota } from "@/lib/quota/monthly-quota";

export async function POST(request: NextRequest) {
  // 管理者認証チェック（admin ロールのみ）
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // MonthlyQuota で月間上限チェック + 枠消費（トランザクション）
  try {
    await consumeMonthlyQuota(0); // 仮コスト（実コストは生成後に更新）
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return Response.json(
        { error: error.message },
        { status: 429 }
      );
    }
    throw error;
  }

  const body = await request.json();

  // BullMQ に generate-prompt ジョブを投入（チェーンの起点）
  const job = await videoGenerationQueue.add(
    "generate-prompt",
    {
      type: "generate-prompt",
      channelId: body.channelId,
      scheduleId: undefined,
    } satisfies GeneratePromptJobData,
    {
      ...JOB_OPTIONS["generate-prompt"],
      priority: body.priority === "high" ? 0 : 1,
    }
  );

  return Response.json({ jobId: job.id, status: "queued" });
}
```

### 2.5 Upstash Redis コマンド消費見積もり

4分割ジョブ構造では、1動画生成あたり4ジョブが実行される。

| 操作 | コマンド数/ジョブ | ジョブ数 | 合計 |
|------|----------------|---------|------|
| ジョブ投入 (add) | ~5 | 4 | ~20 |
| ジョブ取得 (process) | ~3 | 4 | ~12 |
| 進捗更新 (updateProgress) | ~2 | 4 | ~8 |
| ジョブ完了 + 次ジョブ投入 | ~4 | 4 | ~16 |
| Rate Limiting (管理 API) | ~2 | 1 | ~2 |
| **1動画生成合計** | | | **~58** |

**日間消費（1動画/日 + 既存）**:
- 動画生成: 58 x 1 = 58 コマンド
- 検索 Rate Limiting + キャッシュ: ~1,760 コマンド（search-performance-design.md §4.4）
- その他 Rate Limiting: ~1,000 コマンド
- **合計: ~2,818 コマンド/日** -> Upstash Free（10,000/日）の **28%**

---

## 3. Railway ワーカーのリソース最適化

### 3.1 Railway プラン選定

| プラン | 月額 | vCPU | メモリ | 判定 |
|--------|------|------|-------|------|
| **Usage-based** | **$5クレジット付き** | 共有 | 512MB~8GB | **採用** |
| Hobby | $5 | 共有 | 512MB | メモリ不足リスク |
| Pro | $20 | 専有 | 8GB | 予算超過 |

### 3.2 ワーカーリソース設定

```dockerfile
# Railway Dockerfile (worker)
FROM node:20-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY dist/ ./dist/

# Railway ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/worker.js"]
```

### 3.3 メモリ・CPU 使用パターン

```
ワーカー待機中:       ~80MB   (BullMQ ポーリング)
プロンプト生成中:     ~120MB  (LLM API 呼び出し、レスポンス処理)
動画生成待機中:       ~100MB  (Runway/Veo API ポーリング)
Mux アップロード中:   ~200MB  (動画ファイルのストリーミング)
ピーク時:            ~250MB  (アップロード中の最大)
```

**推奨メモリ設定: 512MB**（ピーク 250MB に対して 2倍のヘッドルーム）

### 3.4 ワーカーの起動・停止戦略

Railway の Usage-based プランでは、ワーカーが常時起動していると不要なコストが発生する。

| 戦略 | メリット | デメリット | 判定 |
|------|---------|----------|------|
| **常時起動** | ジョブ即座に処理開始 | 月$3-5の常時稼働コスト | MVP 段階で採用 |
| Cron 起動 | 生成時間帯のみ稼働でコスト削減 | ジョブ遅延が発生 | 将来最適化 |
| Scale to Zero | アイドル時$0 | コールドスタート ~30秒 | Railway 未対応 |

**MVP 推奨: 常時起動。** 月$3-5 のコストは Railway の $5 クレジットで概ねカバー可能。

### 3.5 Railway コスト見積もり

| リソース | 単価 | 使用量 | 月額 |
|---------|------|-------|------|
| vCPU | $0.000463/min | 常時 x 30日 = 43,200分 | $20.00 |
| メモリ (512MB) | $0.000231/GB/min | 0.5GB x 43,200分 | $4.99 |
| **小計（常時起動）** | | | **$24.99** |
| **$5 クレジット適用後** | | | **$19.99** |

**問題: 常時起動だと Railway だけで $20/月。予算$50 に対して大きい。**

### 3.6 コスト最適化: Cron ベース起動

常時起動のコストを削減するため、1日の生成時間帯のみワーカーを起動する。

```
スケジュール: 毎日 09:00-11:00 JST (2時間)
  |-- 1-2本の動画を生成（各 ~3-8分）
  |-- 生成完了後、ワーカーは自動シャットダウン（graceful）

Railway コスト:
  vCPU:    $0.000463/min x 120分/日 x 30日 = $1.67
  メモリ:  $0.000231/GB/min x 0.5GB x 120分/日 x 30日 = $0.83
  合計:    $2.50/月（$5クレジット内）
```

**Cron ベース起動で Railway コスト実質 $0（$5 クレジット内）。**

```typescript
// worker/index.ts - Graceful shutdown 付きワーカー

import { Worker } from "bullmq";
import { processVideoGeneration } from "./processor";

const worker = new Worker("video-generation", processVideoGeneration, {
  connection,
  concurrency: 1,           // 同時処理数 1（リソース制約）
  limiter: {
    max: 2,                  // 1時間に最大2ジョブ
    duration: 3600_000,
  },
});

// Graceful shutdown: キューが空になったら終了
worker.on("drained", async () => {
  console.log("[Worker] Queue drained, shutting down gracefully");
  await worker.close();
  process.exit(0);
});

// エラーハンドリング
worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed in ${job.processedOn! - job.timestamp}ms`);
});
```

---

## 4. Runway API Rate Limiting 対応

### 4.1 Runway Gen-4 Turbo API の制約

| 制約 | 値 | 影響 |
|------|-----|------|
| 同時生成数 | 2-5（プラン依存） | シングルワーカーなので問題なし |
| リクエストレート | ~10 req/min | ポーリング頻度に影響 |
| 生成時間 | 60-180秒/本 | E2E のボトルネック |
| タイムアウト | 300秒 | 5分以内に完了しないとリトライ |

### 4.2 Token Bucket アルゴリズムによる制御

Runway API 呼び出しの Rate Limiting には Token Bucket を採用する。
MEMORY.md に記載の通り、「Token Bucket: Runway API連携向け（バースト許容）」が推奨。

```typescript
// lib/rate-limit.ts に追加

/**
 * Runway API 用 Token Bucket Rate Limiter
 * バースト許容: 短時間に連続リクエスト可能だが、長期的にはレートが制限される
 *
 * maxTokens=3: 最大3リクエスト分のトークンを保持
 * refillRate=1/60s: 60秒ごとに1トークン補充
 * -> 平均 1 req/min、バースト時 3 req まで許容
 */
export const runwayRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.tokenBucket(3, "60 s", 3),
  analytics: true,
  prefix: "ratelimit:runway",
});
```

### 4.3 API 呼び出しパターン

Gen-4 Turbo は **Image to Video** のみ対応。Flux Schnell で生成した入力画像（`promptImage`）を必須パラメータとして渡す。

```typescript
// worker/steps/generate-video.ts

import { runwayRateLimit } from "@/lib/rate-limit";

interface RunwayGenerationParams {
  prompt: string;
  promptImage: string;       // Flux Schnell で生成した入力画像URL（必須）
  duration: 5 | 10;          // 5秒 or 10秒
  model: "gen4_turbo";
}

export async function generateWithRunway(
  params: RunwayGenerationParams
): Promise<RunwayResult> {
  // Token Bucket Rate Limit チェック
  const { success, reset } = await runwayRateLimit.limit("runway-api");
  if (!success) {
    const waitMs = reset - Date.now();
    console.log(`[Runway] Rate limited, waiting ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  // 生成リクエスト送信（Image to Video）
  const createResponse = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model: params.model,
      promptImage: params.promptImage,   // 必須: Flux Schnell 入力画像
      promptText: params.prompt,
      duration: params.duration,
      ratio: "16:9",
      watermark: false,
    }),
  });

  if (!createResponse.ok) {
    throw new RunwayApiError(createResponse.status, await createResponse.text());
  }

  const { id: taskId } = await createResponse.json();

  // Step 2: ポーリングで完了を待機
  return pollRunwayTask(taskId);
}

/**
 * Runway タスクのポーリング
 * 5秒間隔で最大60回（5分タイムアウト）
 */
async function pollRunwayTask(taskId: string): Promise<RunwayResult> {
  const MAX_POLLS = 60;
  const POLL_INTERVAL = 5_000; // 5秒

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const { success } = await runwayRateLimit.limit("runway-api");
    if (!success) {
      // Rate Limit 到達時はポーリング間隔を延長
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }

    const res = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    const task = await res.json();

    if (task.status === "SUCCEEDED") {
      return {
        videoUrl: task.output[0],
        duration: task.duration,
        modelUsed: "runway-gen4-turbo",
      };
    }

    if (task.status === "FAILED") {
      throw new RunwayApiError(500, `Runway task failed: ${task.failure ?? "unknown"}`);
    }

    // PENDING, THROTTLED, or RUNNING -> 次のポーリング
  }

  throw new RunwayApiError(408, "Runway task timed out after 5 minutes");
}
```

### 4.4 Runway API ポーリングの Redis コマンド消費

| 操作 | コマンド数 | 頻度 |
|------|----------|------|
| Rate Limit チェック（生成リクエスト） | 2 | 1回/ジョブ |
| Rate Limit チェック（ポーリング） | 2 x ~24回 | 5秒間隔 x 120秒 |
| **1ジョブ合計** | **~50** | |

**日間追加消費**: 50 x 2 = 100コマンド -> 合計 ~2,908/日（Upstash Free の 29%）

---

