# AI動画生成パイプライン: キュー・外部API連携

> 元ファイル: [ai-pipeline-data-design.md](ai-pipeline-data-design.md) から分割（§3-5）

---

## 3. BullMQ ジョブキュー設計

### 3.1 キュー構成

```
┌─────────────────────────────────────────────┐
│ Upstash Redis (BullMQ バックエンド)           │
│                                             │
│ Queue: "video-generation"                   │
│ ├── Job: generate-prompt                    │
│ │     ├── priority: 1                       │
│ │     ├── attempts: 3                       │
│ │     ├── backoff: exponential (10s, 20s)   │
│ │     └── timeout: 60000ms (1分)             │
│ │                                           │
│ ├── Job: generate-image                     │
│ │     ├── priority: 1                       │
│ │     ├── attempts: 3                       │
│ │     ├── backoff: exponential (5s, 10s)    │
│ │     └── timeout: 60000ms (1分)             │
│ │                                           │
│ ├── Job: generate-video                     │
│ │     ├── priority: 1 (通常) / 0 (緊急)      │
│ │     ├── attempts: 3                       │
│ │     ├── backoff: exponential (30s, 60s)   │
│ │     └── timeout: 600000ms (10分)           │
│ │                                           │
│ └── Job: upload-to-mux                      │
│       ├── priority: 1                       │
│       ├── attempts: 5                       │
│       ├── backoff: exponential (15s, 30s)   │
│       └── timeout: 300000ms (5分)            │
│                                             │
│ Queue: "video-generation-scheduled"         │
│ └── Repeatable Job: scheduled-generation    │
│       └── pattern: "0 1 * * *" (毎日1時)     │
└─────────────────────────────────────────────┘
```

### 3.2 BullMQ 接続設定

```typescript
// lib/queue/connection.ts

import { Queue, Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";

// Upstash Redis 接続（BullMQ 互換モード）
const connection = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null,  // BullMQ 要件
  enableReadyCheck: false,     // Upstash 互換
  tls: { rejectUnauthorized: false },
});

// メインキュー
export const videoGenerationQueue = new Queue("video-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },   // 完了ジョブは100件まで保持
    removeOnFail: { count: 500 },       // 失敗ジョブは500件まで保持
  },
});

// スケジュールキュー
export const scheduledQueue = new Queue("video-generation-scheduled", {
  connection,
});
```

### 3.3 ジョブ型定義

```typescript
// lib/queue/types.ts

// ── プロンプト生成ジョブ ──
interface GeneratePromptJobData {
  type: "generate-prompt";
  channelId: string;
  scheduleId?: string;         // スケジュール起動の場合
}

// ── 画像生成ジョブ（2段パイプライン: Step 1） ──
interface GenerateImageJobData {
  type: "generate-image";
  generationJobId: string;     // GenerationJob.id
  promptId: string;            // GenerationPrompt.id
  channelId: string;
  videoPrompt: string;         // 画像生成にも同じプロンプトを使用
  imageModel: string;          // "flux-schnell" | "sdxl-turbo"
}

// ── 動画生成ジョブ（2段パイプライン: Step 2） ──
interface GenerateVideoJobData {
  type: "generate-video";
  generationJobId: string;     // GenerationJob.id
  promptId: string;            // GenerationPrompt.id
  channelId: string;
  aiModel: string;             // "runway-gen4-turbo" | "veo-3.1-fast"
  videoPrompt: string;
  promptImage: string;         // 入力画像URL（Gen-4 Turbo Image to Video 用）
  duration: number;            // 生成秒数
  isRetry: boolean;            // リトライかどうか
  retryCount: number;
}

// ── Mux アップロードジョブ ──
interface UploadToMuxJobData {
  type: "upload-to-mux";
  generationJobId: string;
  outputUrl: string;           // 生成された動画の一時URL
  title: string;
  channelId: string;
}

type VideoGenerationJobData =
  | GeneratePromptJobData
  | GenerateImageJobData
  | GenerateVideoJobData
  | UploadToMuxJobData;
```

### 3.4 リトライポリシー

| ジョブ種別 | 最大リトライ | バックオフ | タイムアウト | フォールバック |
|-----------|:--------:|---------|:--------:|------------|
| generate-prompt | 3回 | 指数 (10s, 20s, 40s) | 60秒 | なし（LLM 切替不要） |
| generate-image | 3回 | 指数 (5s, 10s, 20s) | 60秒 | なし（画像生成失敗時は Veo Text to Video にフォールバック） |
| generate-video | 3回 | 指数 (30s, 60s, 120s) | 10分 | Veo 3.1 Fast にフォールバック（Text to Video 直接） |
| upload-to-mux | 5回 | 指数 (15s, 30s, 60s, 120s, 240s) | 5分 | なし |

**フォールバック戦略（動画生成）:**

```
Runway Gen-4 Turbo で生成開始
    ↓ 失敗
リトライ 1回目（30秒後）→ Runway で再試行
    ↓ 失敗
リトライ 2回目（60秒後）→ Runway で再試行
    ↓ 失敗
リトライ 3回目（120秒後）→ Veo 3.1 Fast にフォールバック
    ↓ 失敗
ジョブ FAILED → failReason に記録
```

```typescript
// lib/queue/workers/generate-image.ts

async function processGenerateImage(job: Job<GenerateImageJobData>) {
  const { generationJobId, generationPromptId, videoPrompt, aiModel, duration } = job.data;

  // GenerationJob ステータス更新
  await prisma.generationJob.update({
    where: { id: generationJobId },
    data: { status: "IMAGE_GENERATING" },
  });

  try {
    // Flux Schnell で入力画像を生成（§5.0 参照）
    const imageResult = await callImageApi(videoPrompt);

    // GenerationPrompt に画像情報を記録
    await prisma.generationPrompt.update({
      where: { id: generationPromptId },
      data: {
        inputImageUrl: imageResult.imageUrl,
        inputImageModel: "flux-schnell",
      },
    });

    // generate-video ジョブ投入（画像URL付き）
    await videoQueue.add("generate-video", {
      generationJobId,
      aiModel,
      videoPrompt,
      promptImage: imageResult.imageUrl,
      duration,
      retryCount: 0,
    });
  } catch (error) {
    // 画像生成失敗時: Veo 3.1 Fast Text to Video にフォールバック（画像不要）
    logger.warn(`Image generation failed, falling back to Veo Text to Video`, { error });

    await videoQueue.add("generate-video", {
      generationJobId,
      aiModel: "veo-3.1-fast",
      videoPrompt,
      promptImage: "",  // Veo は Text to Video なので画像不要
      duration,
      retryCount: 0,
    });
  }
}
```

```typescript
// lib/queue/workers/generate-video.ts（リトライ + フォールバック）

async function processGenerateVideo(job: Job<GenerateVideoJobData>) {
  const { generationJobId, aiModel, videoPrompt, promptImage, duration, retryCount } = job.data;

  // フォールバック判定: 3回目のリトライで Veo に切替（Text to Video 直接 — 画像不要）
  const effectiveModel = retryCount >= 2 ? "veo-3.1-fast" : aiModel;

  // GenerationJob ステータス更新
  await prisma.generationJob.update({
    where: { id: generationJobId },
    data: {
      status: "GENERATING",
      aiModel: effectiveModel,
      startedAt: new Date(),
      retryCount,
    },
  });

  const startTime = Date.now();

  try {
    // AI動画生成API呼び出し（§5 参照）
    // Gen-4 Turbo: Image to Video（promptImage 必須）
    // Veo 3.1 Fast: Text to Video（promptImage 不要）
    const result = effectiveModel === "runway-gen4-turbo"
      ? await callRunwayApi(videoPrompt, promptImage, duration)
      : await callVeoApi(videoPrompt, duration);

    const generationTimeSec = Math.round((Date.now() - startTime) / 1000);

    // 生成結果を保存
    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: "MODERATING",
        outputUrl: result.outputUrl,
        outputDuration: result.duration,
        outputResolution: result.resolution,
        aiRequestId: result.requestId,
        aiResponseRaw: result.rawResponse,
        generationTimeSec,
        estimatedCostUsd: result.estimatedCost,
      },
    });

    // コンテンツ安全性チェック → Mux アップロードへ
    await moderateAndUpload(generationJobId, result.outputUrl);

  } catch (error) {
    const generationTimeSec = Math.round((Date.now() - startTime) / 1000);

    await prisma.generationJob.update({
      where: { id: generationJobId },
      data: {
        generationTimeSec,
        retryCount: retryCount + 1,
        ...(retryCount >= 3 && {
          status: "FAILED",
          failReason: error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        }),
      },
    });

    throw error; // BullMQ にリトライさせる
  }
}
```

### 3.5 Worker 構成（Railway）

```typescript
// workers/video-generation-worker.ts
// Railway 上で実行されるワーカープロセス

import { Worker } from "bullmq";

const worker = new Worker(
  "video-generation",
  async (job) => {
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
  },
  {
    connection,
    concurrency: 2,             // 同時実行数（Railway リソース制約）
    limiter: {
      max: 5,                   // 15秒間に最大5ジョブ
      duration: 15000,
    },
  }
);

worker.on("completed", async (job) => {
  console.log(`[Worker] Job ${job.id} completed: ${job.data.type}`);
});

worker.on("failed", async (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});
```

---

## 4. 月間30本上限の管理ロジック

### 4.1 枠チェック + 消費のトランザクション

```typescript
// lib/quota/monthly-quota.ts

/**
 * 月間生成枠を確認し、1枠消費する。
 * 枠不足の場合は QuotaExceededError をスロー。
 */
export async function consumeMonthlyQuota(
  estimatedCostUsd: number
): Promise<void> {
  const yearMonth = getCurrentYearMonth(); // "2026-03"

  await prisma.$transaction(async (tx) => {
    // upsert で当月レコードを確保 + ロック
    const quota = await tx.monthlyQuota.upsert({
      where: { yearMonth },
      update: {},
      create: {
        yearMonth,
        maxCount: 30,
        usedCount: 0,
        totalCostUsd: 0,
      },
    });

    if (quota.usedCount >= quota.maxCount) {
      throw new QuotaExceededError(
        `月間生成上限（${quota.maxCount}本）に達しています。` +
        `使用済み: ${quota.usedCount}本`
      );
    }

    // 枠を消費
    await tx.monthlyQuota.update({
      where: { yearMonth },
      data: {
        usedCount: { increment: 1 },
        totalCostUsd: { increment: estimatedCostUsd },
      },
    });
  });
}

/**
 * 生成失敗時に枠を返却する。
 */
export async function releaseMonthlyQuota(
  estimatedCostUsd: number
): Promise<void> {
  const yearMonth = getCurrentYearMonth();

  await prisma.monthlyQuota.update({
    where: { yearMonth },
    data: {
      usedCount: { decrement: 1 },
      totalCostUsd: { decrement: estimatedCostUsd },
    },
  });
}

function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}
```

### 4.2 枠チェックのタイミング

```
Cron トリガー or 手動起動
    ↓
consumeMonthlyQuota() で枠チェック + 消費（トランザクション）
    ↓ QuotaExceededError → ジョブ投入をスキップ
    ↓ OK
BullMQ にジョブ投入
    ↓
動画生成実行
    ↓ 失敗
releaseMonthlyQuota() で枠返却
```

---

## 5. 外部AI生成API連携設計

### 5.0 画像生成 API（Flux Schnell）

Gen-4 Turbo は Image to Video のみ対応のため、Text to Image で入力画像を事前生成する。

**リクエスト型:**

```typescript
// lib/ai/image-gen.ts

interface ImageGenerateRequest {
  model: "flux-schnell";
  prompt: string;            // 画像生成プロンプト（LLM が動画プロンプトから変換）
  width: 1280;
  height: 720;
  steps?: number;            // デフォルト: 4（Schnell 推奨）
}

interface ImageGenerateResponse {
  imageUrl: string;          // 生成された画像の URL
  seed: number;
  estimatedCost: number;     // $0.003/image
}
```

**API 呼び出し実装:**

```typescript
// lib/ai/image-gen.ts

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

export async function callImageApi(
  prompt: string,
): Promise<ImageGenerateResponse> {
  const res = await fetch(`${REPLICATE_API_BASE}/models/black-forest-labs/flux-schnell/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        prompt,
        width: 1280,
        height: 720,
        num_inference_steps: 4,
        go_fast: true,
      },
    }),
  });

  if (!res.ok) {
    throw new ImageGenApiError(`Image API error: ${res.statusText}`);
  }

  const prediction = await res.json();

  // ポーリング（Flux Schnell は通常 2-5 秒で完了）
  let result = prediction;
  while (result.status !== "succeeded" && result.status !== "failed") {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${REPLICATE_API_BASE}/predictions/${result.id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    result = await pollRes.json();
  }

  if (result.status === "failed") {
    throw new ImageGenApiError(`Image generation failed: ${result.error}`);
  }

  return {
    imageUrl: result.output[0],
    seed: result.input?.seed ?? 0,
    estimatedCost: 0.003,  // Flux Schnell: ~$0.003/image
  };
}
```

### 5.1 Runway Gen-4 Turbo API

**リクエスト型:**

```typescript
// lib/ai/runway.ts

interface RunwayGenerateRequest {
  model: "gen4_turbo";          // Gen-4 Turbo（Image to Video のみ）
  promptText: string;           // 動画生成プロンプト
  promptImage: string;          // 入力画像URL（HTTPS URL / Runway URI / data URI）
  duration: 5 | 10;             // 生成秒数（5秒 or 10秒）
  ratio: "1280:720" | "720:1280" | "1104:832" | "960:960";  // アスペクト比
  seed?: number;                // 再現用シード（0-4294967295）
}

interface RunwayGenerateResponse {
  id: string;                   // タスクID
  status: "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  output: string[];             // 生成された動画URL（一時URL）
  failure?: string;             // 失敗理由
  createdAt: string;
}
```

**API 呼び出し実装:**

```typescript
// lib/ai/runway.ts

const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";

export async function callRunwayApi(
  prompt: string,
  promptImage: string,
  duration: number
): Promise<GenerationResult> {
  // 1. Image to Video 生成タスクを開始（Gen-4 Turbo は Image to Video のみ対応）
  const createRes = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      model: "gen4_turbo",
      promptText: prompt,
      promptImage: promptImage,   // 必須: Flux Schnell で生成した入力画像URL
      duration: duration <= 5 ? 5 : 10,
      ratio: "1280:720",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new RunwayApiError(`Runway API error: ${err.error ?? createRes.statusText}`);
  }

  const task: RunwayGenerateResponse = await createRes.json();

  // 2. ポーリングで完了を待つ（最大10分）
  const result = await pollRunwayTask(task.id, 600_000);

  if (result.status === "FAILED") {
    throw new RunwayApiError(`Runway generation failed: ${result.failure}`);
  }

  return {
    requestId: result.id,
    outputUrl: result.output[0],
    duration: duration,
    resolution: "1280x720",
    estimatedCost: duration * 0.05,  // Gen-4 Turbo: 5 credits/秒 × $0.01 = $0.05/秒
    rawResponse: result,
  };
}

async function pollRunwayTask(
  taskId: string,
  timeoutMs: number
): Promise<RunwayGenerateResponse> {
  const startTime = Date.now();
  const pollInterval = 10_000; // 10秒間隔

  while (Date.now() - startTime < timeoutMs) {
    const res = await fetch(`${RUNWAY_API_BASE}/tasks/${taskId}`, {
      headers: {
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    const task: RunwayGenerateResponse = await res.json();

    if (task.status === "SUCCEEDED" || task.status === "FAILED") {
      return task;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new RunwayApiError(`Runway task ${taskId} timed out after ${timeoutMs}ms`);
}
```

### 5.2 Veo 3.1 Fast（フォールバック）

**リクエスト型:**

```typescript
// lib/ai/veo.ts

interface VeoGenerateRequest {
  model: "veo-3.1-fast";
  prompt: string;
  config: {
    generateVideo: {
      duration: string;          // "5s" | "10s"
      aspectRatio: "16:9" | "9:16" | "1:1";
    };
  };
}

interface VeoGenerateResponse {
  name: string;                  // オペレーション名
  done: boolean;
  result?: {
    generatedSamples: Array<{
      video: {
        uri: string;             // GCS URI
        httpUri: string;         // 一時ダウンロードURL
      };
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}
```

**API 呼び出し実装:**

```typescript
// lib/ai/veo.ts

const VEO_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function callVeoApi(
  prompt: string,
  duration: number
): Promise<GenerationResult> {
  // 1. 生成リクエスト
  const createRes = await fetch(
    `${VEO_API_BASE}/models/veo-3.1-fast:generateVideo`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GOOGLE_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        config: {
          generateVideo: {
            duration: `${Math.min(duration, 10)}s`,
            aspectRatio: "16:9",
          },
        },
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new VeoApiError(`Veo API error: ${err.error?.message ?? createRes.statusText}`);
  }

  const operation: VeoGenerateResponse = await createRes.json();

  // 2. ポーリングで完了を待つ
  const result = await pollVeoOperation(operation.name, 600_000);

  if (result.error) {
    throw new VeoApiError(`Veo generation failed: ${result.error.message}`);
  }

  const videoUri = result.result!.generatedSamples[0].video.httpUri;

  return {
    requestId: operation.name,
    outputUrl: videoUri,
    duration,
    resolution: "1280x720",
    estimatedCost: duration * 0.15,  // Veo 3.1 Fast: $0.15/秒
    rawResponse: result,
  };
}
```

### 5.3 共通レスポンス型

```typescript
// lib/ai/types.ts

interface GenerationResult {
  requestId: string;
  outputUrl: string;
  duration: number;
  resolution: string;
  estimatedCost: number;
  rawResponse: unknown;
}

class RunwayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunwayApiError";
  }
}

class VeoApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VeoApiError";
  }
}
```

---

