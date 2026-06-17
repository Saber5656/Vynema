# AI動画生成パイプライン: Mux連携・インフラ設計

> 元ファイル: [ai-pipeline-data-design.md](ai-pipeline-data-design.md) から分割（§6-14）

---

## 6. Mux Upload API 連携

### 6.1 生成完了 → Mux アップロードフロー

```
GenerationJob.status = MODERATING (コンテンツチェック通過後)
    ↓
upload-to-mux ジョブを BullMQ に投入
    ↓
[Worker] Mux Direct Upload URL を取得
    ↓
生成動画の一時URLから Mux にアップロード
    ↓
GenerationJob.status = TRANSCODING
GenerationJob.muxUploadId = upload.id
    ↓
[Mux Webhook] video.asset.ready
    ↓
Video レコード作成 + GenerationJob.status = COMPLETED
```

### 6.2 Mux Upload 実装

```typescript
// lib/mux/upload.ts

import Mux from "@mux/mux-node";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

/**
 * 生成された動画を Mux にアップロードする。
 * URL-based input を使用（Direct Upload ではなく、URLを指定して Mux に取得させる）
 */
export async function uploadToMux(
  videoUrl: string,
  metadata: { title: string; channelId: string; generationJobId: string }
): Promise<{ assetId: string; uploadId: string }> {
  // Mux Asset を作成（URL から直接取り込み）
  const asset = await mux.video.assets.create({
    input: [{ url: videoUrl }],
    playback_policy: ["public"],
    // passthrough にジョブIDを埋め込み（Webhook で紐付けに使用）
    passthrough: JSON.stringify({
      generationJobId: metadata.generationJobId,
      channelId: metadata.channelId,
      title: metadata.title,
    }),
  });

  return {
    assetId: asset.id,
    uploadId: asset.id,  // URL-based input では asset.id が識別子
  };
}
```

### 6.3 Mux Webhook ハンドラ（拡張版）

```typescript
// app/api/webhooks/mux/route.ts（AI パイプライン対応拡張）

export async function POST(req: Request) {
  const body = await req.json();

  // Mux Webhook 署名検証（省略 — 既存設計 home-data-design.md §7.2 と同一）

  switch (body.type) {
    case "video.asset.ready": {
      const asset = body.data;
      const passthrough = asset.passthrough
        ? JSON.parse(asset.passthrough)
        : null;

      if (passthrough?.generationJobId) {
        // AI生成パイプライン経由のアップロード
        await handlePipelineAssetReady(asset, passthrough);
      } else {
        // 既存のアップロードフロー（home-data-design.md §7.2）
        await handleLegacyAssetReady(asset);
      }
      break;
    }

    case "video.asset.errored": {
      const asset = body.data;
      const passthrough = asset.passthrough
        ? JSON.parse(asset.passthrough)
        : null;

      if (passthrough?.generationJobId) {
        await handlePipelineAssetErrored(asset, passthrough);
      } else {
        await handleLegacyAssetErrored(asset);
      }
      break;
    }
  }

  return new Response("OK", { status: 200 });
}

async function handlePipelineAssetReady(
  asset: MuxAsset,
  passthrough: { generationJobId: string; channelId: string; title: string }
) {
  const { generationJobId, channelId, title } = passthrough;

  // GenerationJob から関連データを取得
  const job = await prisma.generationJob.findUnique({
    where: { id: generationJobId },
    include: {
      prompt: true,
    },
  });

  if (!job || !job.prompt) return;

  await prisma.$transaction(async (tx) => {
    // 1. Video レコード作成
    const video = await tx.video.create({
      data: {
        title: job.prompt.title,
        description: job.prompt.description,
        muxAssetId: asset.id,
        muxPlaybackId: asset.playback_ids?.[0]?.id ?? "",
        muxStatus: "READY",
        duration: Math.round(asset.duration ?? 0),
        aiModel: job.aiModel,
        aiPrompt: job.prompt.videoPrompt,
        aiParams: job.aiRequestParams ?? undefined,
        generationTimeSec: job.generationTimeSec,
        estimatedCostUsd: job.estimatedCostUsd,
        moods: job.prompt.moods,
        status: "PUBLISHED",
        publishedAt: new Date(),
        channelId,
        ...(job.prompt.categorySlug && {
          category: {
            connect: { slug: job.prompt.categorySlug },
          },
        }),
      },
    });

    // 2. タグの紐付け
    if (job.prompt.tags.length > 0) {
      for (const tagName of job.prompt.tags) {
        const tag = await tx.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
        });
        await tx.videoTag.create({
          data: { videoId: video.id, tagId: tag.id },
        });
      }
    }

    // 3. GenerationJob を完了に更新
    await tx.generationJob.update({
      where: { id: generationJobId },
      data: {
        status: "COMPLETED",
        muxAssetId: asset.id,
        videoId: video.id,
        completedAt: new Date(),
      },
    });

    // 4. GenerationPrompt を USED に更新
    await tx.generationPrompt.update({
      where: { id: job.promptId },
      data: { status: "USED" },
    });

    // 5. チャンネル統計を更新（channel-data-design.md §2.4 準拠）
    await tx.aIChannel.update({
      where: { id: channelId },
      data: {
        videoCount: { increment: 1 },
        ...(job.generationTimeSec != null && {
          totalGenerationTimeSec: { increment: job.generationTimeSec },
        }),
        ...(job.estimatedCostUsd != null && {
          totalEstimatedCostUsd: { increment: job.estimatedCostUsd },
        }),
      },
    });

    // 6. averageQualityScore は定期バッチで再計算（初回は null のまま）
  });
}

async function handlePipelineAssetErrored(
  asset: MuxAsset,
  passthrough: { generationJobId: string }
) {
  await prisma.generationJob.update({
    where: { id: passthrough.generationJobId },
    data: {
      status: "FAILED",
      failReason: `Mux transcoding failed: ${asset.errors?.messages?.join(", ") ?? "Unknown"}`,
      completedAt: new Date(),
    },
  });

  // 枠を返却
  const job = await prisma.generationJob.findUnique({
    where: { id: passthrough.generationJobId },
    select: { estimatedCostUsd: true },
  });
  if (job?.estimatedCostUsd) {
    await releaseMonthlyQuota(job.estimatedCostUsd);
  }
}
```

---

## 7. Cron トリガー設計

### 7.1 Vercel Cron Functions

```typescript
// app/api/cron/generate-videos/route.ts

import { NextResponse } from "next/server";

// Vercel Cron: 1日1回（深夜1時 = 月間約30トリガー → 30本上限で制御）
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Cron 認証
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 月間枠チェック
  const yearMonth = getCurrentYearMonth();
  const quota = await prisma.monthlyQuota.findUnique({
    where: { yearMonth },
  });

  if (quota && quota.usedCount >= quota.maxCount) {
    return NextResponse.json({
      skipped: true,
      reason: `Monthly quota reached: ${quota.usedCount}/${quota.maxCount}`,
    });
  }

  // アクティブなスケジュールを取得
  const schedules = await prisma.generationSchedule.findMany({
    where: { isActive: true },
    include: { channel: { select: { id: true, name: true, aiModel: true } } },
  });

  let queued = 0;

  for (const schedule of schedules) {
    // 枠が残っているか再チェック
    try {
      await consumeMonthlyQuota(0); // 仮コストで枠チェック（実コストは生成後に更新）
    } catch (e) {
      if (e instanceof QuotaExceededError) break;
      throw e;
    }

    // プロンプト生成ジョブを投入
    await videoGenerationQueue.add(
      "generate-prompt",
      {
        type: "generate-prompt",
        channelId: schedule.channelId,
        scheduleId: schedule.id,
      },
      {
        priority: 1,
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
      }
    );

    // スケジュールの lastTriggeredAt を更新
    await prisma.generationSchedule.update({
      where: { id: schedule.id },
      data: { lastTriggeredAt: new Date() },
    });

    queued++;
  }

  return NextResponse.json({ queued, timestamp: new Date().toISOString() });
}
```

### 7.2 vercel.json Cron 設定

```json
{
  "crons": [
    {
      "path": "/api/cron/generate-videos",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/popular-searches",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

---

## 8. コンテンツ安全性チェック

### 8.1 モデレーションフロー

```
動画生成完了（outputUrl 取得）
    ↓
Runway / Veo の内蔵モデレーション結果を確認
    ↓ PASSED → Mux アップロードへ
    ↓ FLAGGED → ログ記録 + 公開は許可（軽度警告）
    ↓ REJECTED → ジョブ FAILED + 枠返却
```

### 8.2 モデレーション実装

```typescript
// lib/moderation/check.ts

/**
 * 生成された動画のコンテンツ安全性をチェックする。
 * MVP では AI生成API の内蔵モデレーション結果を利用する。
 * 将来的に独自のモデレーション API（Google Cloud Vision 等）を追加可能。
 */
export async function checkContentSafety(
  generationJobId: string,
  aiResponse: unknown
): Promise<ModerationStatus> {
  // Runway / Veo のレスポンスからモデレーション情報を抽出
  const moderationResult = extractModerationResult(aiResponse);

  const status: ModerationStatus = moderationResult.isSafe
    ? "PASSED"
    : moderationResult.severity === "high"
      ? "REJECTED"
      : "FLAGGED";

  await prisma.generationJob.update({
    where: { id: generationJobId },
    data: {
      moderationStatus: status,
      moderationResult: moderationResult,
    },
  });

  return status;
}
```

---

## 9. 完全パイプラインフロー

### 9.1 エンドツーエンドフロー

```
[Vercel Cron] 1日1回（深夜1時）に起動
    ↓
GET /api/cron/generate-videos
    ├── MonthlyQuota チェック（30本上限）
    ├── GenerationSchedule 取得（アクティブチャンネル）
    └── BullMQ: generate-prompt ジョブ投入
    ↓
[Railway Worker] generate-prompt ジョブ処理
    ├── LLM 呼び出し（Claude Sonnet）
    │     → videoPrompt, title, description, tags, moods 生成
    ├── GenerationPrompt レコード作成（status: APPROVED）
    ├── GenerationJob レコード作成（status: QUEUED）
    └── BullMQ: generate-image ジョブ投入
    ↓
[Railway Worker] generate-image ジョブ処理
    ├── GenerationJob.status → IMAGE_GENERATING
    ├── Flux Schnell API 呼び出し（プロンプトから入力画像生成）
    │     → 入力画像URL取得
    ├── GenerationPrompt.inputImageUrl / inputImageModel 更新
    └── BullMQ: generate-video ジョブ投入
    ↓
[Railway Worker] generate-video ジョブ処理
    ├── GenerationJob.status → GENERATING
    ├── Runway Gen-4 Turbo API 呼び出し（Image to Video: 入力画像 → 動画）
    │     → ポーリング（10秒間隔、最大10分）
    │     → 失敗時: リトライ or Veo 3.1 Fast フォールバック（Text to Video）
    ├── GenerationJob.status → MODERATING
    ├── コンテンツ安全性チェック
    │     → REJECTED: ジョブ FAILED + 枠返却
    │     → PASSED/FLAGGED: 続行
    └── BullMQ: upload-to-mux ジョブ投入
    ↓
[Railway Worker] upload-to-mux ジョブ処理
    ├── GenerationJob.status → UPLOADING
    ├── Mux Asset 作成（URL-based input）
    │     passthrough: { generationJobId, channelId, title }
    └── GenerationJob.status → TRANSCODING
    ↓
[Mux] トランスコード処理（自動）
    ↓
[Mux Webhook] video.asset.ready
    ↓
[POST /api/webhooks/mux]
    ├── passthrough から generationJobId を取得
    ├── Video レコード作成（status: PUBLISHED）
    ├── Tag 紐付け
    ├── GenerationJob.status → COMPLETED
    ├── GenerationPrompt.status → USED
    └── AIChannel 統計更新（videoCount, totalGenerationTimeSec 等）
    ↓
ホーム画面の次回リクエストで新動画が表示
```

### 9.2 ジョブ状態遷移図

```
QUEUED → PROMPT_GENERATING → GENERATING → MODERATING → UPLOADING → TRANSCODING → PUBLISHING → COMPLETED
  │              │                │             │            │             │
  └──────────────┴────────────────┴─────────────┴────────────┴─────────────┘
                                     ↓ (すべての段階で失敗可能)
                                   FAILED

CANCELLED（手動キャンセル — 任意の状態から遷移可能）
```

---

## 10. インデックス設計

### 10.1 追加インデックス一覧

| テーブル | インデックス | 用途 | クエリパターン |
|---------|------------|------|-------------|
| `generation_schedules` | `(channelId)` UNIQUE | 1チャンネル1スケジュール制約 | - |
| `generation_schedules` | `(isActive, nextTriggerAt)` | アクティブスケジュール取得 | `WHERE isActive = true ORDER BY nextTriggerAt` |
| `generation_prompts` | `(channelId, status)` | チャンネル別プロンプト取得 | `WHERE channelId = ? AND status = ?` |
| `generation_prompts` | `(status, createdAt)` | ステータス別一覧 | `WHERE status = ? ORDER BY createdAt DESC` |
| `generation_jobs` | `(channelId, status)` | チャンネル別ジョブ取得 | `WHERE channelId = ? AND status = ?` |
| `generation_jobs` | `(status, createdAt)` | ステータス別一覧 | `WHERE status = ? ORDER BY createdAt DESC` |
| `generation_jobs` | `(aiModel, status)` | モデル別ジョブ集計 | `WHERE aiModel = ? AND status = ?` |
| `generation_jobs` | `(promptId)` UNIQUE | プロンプト1:1制約 | - |
| `generation_jobs` | `(videoId)` UNIQUE | Video 1:1制約 | - |
| `monthly_quotas` | `(yearMonth)` UNIQUE | 月別枠取得 | `WHERE yearMonth = ?` |

---

## 11. API エンドポイント設計（内部管理用）

### 11.1 エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | `/api/internal/generation/status` | パイプライン稼働状況 | ADMIN |
| GET | `/api/internal/generation/jobs` | ジョブ一覧 | ADMIN |
| GET | `/api/internal/generation/quota` | 月間枠状況 | ADMIN |
| POST | `/api/internal/generation/trigger` | 手動生成トリガー | ADMIN |
| POST | `/api/internal/generation/cancel/[jobId]` | ジョブキャンセル | ADMIN |

> **注:** これらは管理者向けの内部API。MVP では Clerk の `UserRole.ADMIN` で認可する。公開APIではない。

### 11.2 パイプラインステータス API

```typescript
// GET /api/internal/generation/status

interface PipelineStatusResponse {
  quota: {
    yearMonth: string;
    used: number;
    max: number;
    remaining: number;
    totalCostUsd: number;
  };
  activeJobs: {
    queued: number;
    generating: number;
    uploading: number;
    transcoding: number;
  };
  recentJobs: Array<{
    id: string;
    channelName: string;
    aiModel: string;
    status: JobStatus;
    createdAt: string;
    completedAt: string | null;
  }>;
}
```

---

## 12. セキュリティ考慮事項

### 12.1 APIキー管理

| キー | 保管場所 | アクセス範囲 |
|------|---------|-----------|
| `RUNWAY_API_KEY` | Railway 環境変数 | Worker プロセスのみ |
| `GOOGLE_AI_API_KEY` (Veo) | Railway 環境変数 | Worker プロセスのみ |
| `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` | Railway + Vercel 環境変数 | Worker + Webhook ハンドラ |
| `UPSTASH_REDIS_URL` | Railway + Vercel 環境変数 | Worker + Cron |
| `CRON_SECRET` | Vercel 環境変数 | Cron エンドポイント認証 |

### 12.2 入力バリデーション

| フィールド | バリデーション |
|-----------|-------------|
| LLM 生成プロンプト | JSON スキーマ検証（title, videoPrompt 等の必須フィールド） |
| 動画生成パラメータ | duration: 5 or 10、ratio: 許可値のみ |
| Mux passthrough | JSON パース + 必須フィールド確認 |
| Cron 認証 | Bearer トークン一致確認 |
| 管理API | Clerk ADMIN ロール確認 |

### 12.3 コスト暴走防止

| 防御策 | 実装 |
|--------|------|
| 月間30本ハードリミット | MonthlyQuota トランザクション（§4） |
| Cron 間隔制御 | 1日1回（深夜1時） |
| 同時実行制御 | BullMQ concurrency: 2 |
| ジョブタイムアウト | 動画生成: 10分、アップロード: 5分 |
| 失敗時の枠返却 | releaseMonthlyQuota()（§4.1） |
| コスト累計モニタリング | MonthlyQuota.totalCostUsd で追跡 |

---

## 13. Zod バリデーションスキーマ

```typescript
// lib/validations/generation.ts

import { z } from "zod";

export const triggerGenerationSchema = z.object({
  channelId: z.string().cuid(),
  model: z.enum(["runway-gen4-turbo", "veo-3.1-fast"]).default("runway-gen4-turbo"),
  duration: z.number().int().refine((v) => v === 5 || v === 10, {
    message: "Duration must be 5 or 10 seconds",
  }).default(10),
});

export const cancelJobSchema = z.object({
  jobId: z.string().cuid(),
});

// LLM レスポンスの検証（プロンプト生成結果）
export const llmPromptResponseSchema = z.object({
  videoPrompt: z.string().min(10).max(2000),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  tags: z.array(z.string().max(50)).max(10),
  categorySlug: z.string().nullable().optional(),
  moods: z.array(z.string()).max(5),
  theme: z.string().max(500).nullable().optional(),
});

export type TriggerGeneration = z.infer<typeof triggerGenerationSchema>;
export type LlmPromptResponse = z.infer<typeof llmPromptResponseSchema>;
```

---

## 14. 将来の拡張ポイント

| フェーズ | 機能 | 説明 |
|---------|------|------|
| **MVP** | Cron + Runway/Veo + BullMQ | 基本パイプライン |
| **v2** | トレンドベース生成（UC-002） | ニュースAPI連携 → トレンドプロンプト自動生成 |
| **v2** | 品質ゲート | 生成動画の自動品質スコアリング → 閾値未満は再生成 |
| **v3** | ユーザーリクエスト（UC-003） | 視聴者のリクエストからプロンプト生成 |
| **v3** | 複数モデル並列生成 | 同じプロンプトで複数モデル生成 → 最高品質を採用 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-07 | 2.0 | 2段パイプライン対応（Flux Schnell 画像生成 → Gen-4 Turbo Image to Video）、コスト修正（Runway $0.05/秒、Veo $0.15/秒）、Runway API ステータス値修正（THROTTLED/RUNNING）、Cron 頻度を1日1回に変更、§5.0 画像生成 API 追加、processGenerateImage 追加 | tech-leader |
| 2026-03-06 | 1.0 | 初版作成 | tech-leader |
