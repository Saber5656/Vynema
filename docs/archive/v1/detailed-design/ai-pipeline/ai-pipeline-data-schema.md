# AI動画生成パイプライン: スキーマ設計

> 元ファイル: [ai-pipeline-data-design.md](ai-pipeline-data-design.md) から分割（§1-2）

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: tech-leader
Task: #13

---

## 1. AI動画生成パイプラインの概要

### 1.1 パイプラインアーキテクチャ

```
[トリガー]                    [Railway Worker]                     [外部API / Mux / Supabase]
    │                              │                                   │
    ▼                              ▼                                   ▼
┌─────────┐   BullMQ Queue   ┌──────────┐  Text to Image  ┌──────────────┐
│ Cron    │ ──────────────→  │ Worker   │ ───────────→    │ Flux Schnell │
│ (Vercel)│                  │ (Railway)│  ← Image URL    │ (画像生成)    │
│ 1日1回  │                  │          │                  └──────────────┘
└─────────┘                  │          │
                             │          │  Image to Video  ┌──────────────┐
                             │          │ ───────────→    │ Runway Gen-4 │
                             │          │  ← MP4 URL      │ Turbo        │
                             │          │                  └──────────────┘
                             │          │                        │
                             │          │  フォールバック           ▼ (失敗時)
                             │          │ ───────────→    ┌──────────────┐
                             │          │                 │ Veo 3.1 Fast │
                             │          │  ← MP4 URL      │ (Text to V)  │
                             │          │                  └──────────────┘
                             │          │
                             │          │  Mux Upload      ┌──────────────┐
                             │          │ ───────────→    │ Mux          │
                             │          │                 │ (Transcode)  │
                             └──────────┘                  └──────┬───────┘
                                                                  │ Webhook
                                                                  ▼
                                                           ┌──────────────┐
                                                           │ Next.js API  │
                                                           │ /api/webhooks│
                                                           │ /mux         │
                                                           └──────┬───────┘
                                                                  │ Prisma
                                                                  ▼
                                                           ┌──────────────┐
                                                           │ Supabase PG  │
                                                           │ Video →      │
                                                           │ PUBLISHED    │
                                                           └──────────────┘
```

> **2段パイプライン**: Gen-4 Turbo は Image to Video のみ対応のため、Text to Image（Flux Schnell）→ Image to Video（Gen-4 Turbo）の2段構成を採用。Veo 3.1 Fast へのフォールバック時は Text to Video を直接使用（画像生成ステップをスキップ）。

### 1.2 ユースケース対応表

| ユースケース ID | 説明 | 設計箇所 |
|:----------:|------|---------|
| UC-001 | スケジュールベース動画生成 | §2.1 GenerationSchedule, §3 Cron トリガー |
| UC-004 | 動画プロンプト生成 | §2.2 GenerationPrompt |
| UC-005 | 動画本体の生成 | §2.3 GenerationJob, §5 Runway/Veo 連携 |
| UC-006 | サムネイル自動生成 | §6 Mux Upload（Mux 自動生成に委任） |
| UC-007 | メタデータ自動生成 | §2.2 GenerationPrompt（LLM でタイトル等を生成） |
| UC-008 | コンテンツ安全性チェック | §2.3 GenerationJob.moderationStatus |
| UC-009 | 動画トランスコーディング | §6 Mux Upload（Mux 自動対応） |
| UC-010 | 動画アップロード・公開 | §6 Mux Upload + §7 Webhook |
| UC-011 | 生成失敗時のリトライ | §4 BullMQ リトライポリシー |

### 1.3 コスト制約

```
月間動画生成上限: 30本（固定、超過禁止）
AI生成コスト: $8-10/月（画像生成 ~$0.03/枚 + Gen-4 Turbo $0.25/5秒）
  内訳: 30本 × ($0.03 + $0.25) = $8.40/月（5秒動画の場合）
Railway ワーカー: $5-10/月（Usage-based）
合計: $13-20/月（予算 $50 の 26-40%）
```

### 1.4 人間アップロード防止: 3層防御

既存設計（MEMORY.md）の方針を踏襲:

| 層 | 防御策 | 実装 |
|:---:|--------|------|
| 1 | サービスAPIキー限定 | Mux Upload API は Railway Worker のみが呼び出し可能（環境変数） |
| 2 | エンドポイント非公開 | `/api/internal/generate` は Railway Worker → Next.js API の内部通信のみ |
| 3 | 生成ジョブID参照整合性 | Video 作成時に `generationJobId` の存在を必須とする FK 制約 |

---

## 2. Prisma スキーマ設計

### 2.1 GenerationSchedule（生成スケジュール）

```prisma
// =============================================
// GenerationSchedule（AIチャンネル別の生成スケジュール）
// =============================================
model GenerationSchedule {
  id        String   @id @default(cuid())

  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id])

  cronExpression String                  // Cron 式 (e.g. "0 9 * * *" = 毎日9時)
  timezone       String   @default("Asia/Tokyo")
  isActive       Boolean  @default(true) // スケジュール有効/無効

  // 生成パラメータ
  defaultModel    String  @default("runway-gen4-turbo")  // デフォルトAIモデル
  defaultDuration Int     @default(10)                   // デフォルト生成秒数

  // 月間生成カウンター（プラットフォーム全体で30本上限）
  // → MonthlyQuota テーブルで一元管理（§2.5）

  lastTriggeredAt DateTime?
  nextTriggerAt   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([channelId])               // 1チャンネル1スケジュール
  @@index([isActive, nextTriggerAt])
  @@map("generation_schedules")
}
```

### 2.2 GenerationPrompt（生成プロンプト）

```prisma
// =============================================
// GenerationPrompt（LLM が生成したプロンプトセット）
// =============================================
model GenerationPrompt {
  id        String   @id @default(cuid())

  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id])

  // LLM 生成メタデータ
  llmModel     String                   // 使用LLM (e.g. "claude-sonnet-4-6")
  systemPrompt String                   // LLM に渡したシステムプロンプト
  rawResponse  String                   // LLM の生の応答（デバッグ用）

  // 解析済みプロンプト
  videoPrompt  String                   // 動画生成AIに渡すプロンプト
  title        String                   // 動画タイトル
  description  String                   // 動画説明文
  tags         String[]                 // タグ候補
  categorySlug String?                  // カテゴリスラッグ
  moods        String[]                 // ムード候補
  theme        String?                  // テーマ/コンセプト説明

  // 画像生成結果（2段パイプライン: Text to Image → Image to Video）
  inputImageUrl   String?              // 生成された入力画像URL（Flux Schnell 等）
  inputImageModel String?              // 使用した画像生成モデル (e.g. "flux-schnell")

  status   PromptStatus @default(PENDING)

  createdAt DateTime @default(now())

  // リレーション
  generationJob GenerationJob?

  @@index([channelId, status])
  @@index([status, createdAt])
  @@map("generation_prompts")
}

enum PromptStatus {
  PENDING      // 生成待ち
  APPROVED     // 自動承認済み（安全性チェック通過）
  REJECTED     // 安全性チェック不合格
  USED         // 動画生成に使用済み
}
```

### 2.3 GenerationJob（動画生成ジョブ）

```prisma
// =============================================
// GenerationJob（動画生成ジョブの状態管理）
// =============================================
model GenerationJob {
  id        String   @id @default(cuid())

  channelId String
  channel   AIChannel @relation(fields: [channelId], references: [id])

  promptId  String   @unique
  prompt    GenerationPrompt @relation(fields: [promptId], references: [id])

  // AI動画生成
  aiModel         String                  // 実際に使用したAIモデル
  aiRequestId     String?                 // 外部API のリクエストID（Runway task ID 等）
  aiRequestParams Json?                   // APIリクエストパラメータ（JSON）
  aiResponseRaw   Json?                   // APIレスポンス生データ（デバッグ用）

  // 生成結果
  outputUrl       String?                 // 生成された動画の一時URL
  outputDuration  Int?                    // 生成された動画の長さ（秒）
  outputResolution String?                // 解像度 (e.g. "1280x768")

  // コスト・パフォーマンス
  generationTimeSec Int?                  // 生成にかかった時間（秒）
  estimatedCostUsd  Float?                // 推定コスト（USD）
  retryCount        Int     @default(0)   // リトライ回数

  // モデレーション
  moderationStatus ModerationStatus @default(PENDING)
  moderationResult Json?                  // モデレーション結果の詳細

  // Mux アップロード
  muxUploadId   String?                   // Mux Upload ID
  muxAssetId    String?                   // Mux Asset ID（トランスコード完了後）

  // ジョブ状態
  status       JobStatus @default(QUEUED)
  failReason   String?                    // 失敗理由
  startedAt    DateTime?                  // 処理開始日時
  completedAt  DateTime?                  // 処理完了日時

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // 生成された Video レコード
  videoId String?  @unique
  video   Video?   @relation(fields: [videoId], references: [id])

  @@index([channelId, status])
  @@index([status, createdAt])
  @@index([aiModel, status])
  @@map("generation_jobs")
}

enum JobStatus {
  QUEUED           // BullMQ キューに投入済み
  PROMPT_GENERATING  // プロンプト生成中（LLM）
  IMAGE_GENERATING   // 入力画像生成中（Flux Schnell → Gen-4 Turbo 用）
  GENERATING       // AI動画生成中
  MODERATING       // コンテンツ安全性チェック中
  UPLOADING        // Mux にアップロード中
  TRANSCODING      // Mux トランスコード中
  PUBLISHING       // メタデータ登録・公開処理中
  COMPLETED        // 正常完了
  FAILED           // 失敗（リトライ上限到達）
  CANCELLED        // 手動キャンセル
}

enum ModerationStatus {
  PENDING          // 未チェック
  PASSED           // 合格
  FLAGGED          // 要確認（軽度の警告）
  REJECTED         // 不合格（公開不可）
}
```

### 2.4 既存モデルへのリレーション追加

```prisma
// AIChannel モデルに追加
model AIChannel {
  // ... 既存フィールド（channel-data-design.md 準拠）
  generationSchedule GenerationSchedule?
  generationPrompts  GenerationPrompt[]
  generationJobs     GenerationJob[]
}

// Video モデルに追加
model Video {
  // ... 既存フィールド（home-data-design.md 準拠）

  // AI生成ジョブとの紐付け（人間アップロード防止の第3層）
  generationJob GenerationJob?
}
```

### 2.5 MonthlyQuota（月間生成枠管理）

```prisma
// =============================================
// MonthlyQuota（月間生成枠の管理）
// =============================================
model MonthlyQuota {
  id        String   @id @default(cuid())

  yearMonth String   @unique              // "2026-03" 形式
  maxCount  Int      @default(30)         // 月間上限（固定30本）
  usedCount Int      @default(0)          // 使用済み本数
  totalCostUsd Float @default(0)          // 月間累計コスト

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("monthly_quotas")
}
```

### 2.6 ER図（AI動画生成パイプライン）

```
GenerationSchedule
  │ (1チャンネル1スケジュール)
  └── N:1 → AIChannel

AIChannel
  ├── 1:N → GenerationPrompt
  │         ├── videoPrompt, title, description
  │         ├── tags[], moods[], categorySlug
  │         ├── inputImageUrl, inputImageModel   // 2段パイプライン用
  │         ├── llmModel, systemPrompt
  │         └── status (PENDING → APPROVED → USED)
  │
  ├── 1:N → GenerationJob
  │         ├── 1:1 → GenerationPrompt
  │         ├── aiModel, aiRequestId
  │         ├── outputUrl, outputDuration
  │         ├── generationTimeSec, estimatedCostUsd
  │         ├── moderationStatus (PENDING → PASSED)
  │         ├── muxUploadId, muxAssetId
  │         ├── status (QUEUED → PROMPT_GENERATING → IMAGE_GENERATING → GENERATING → ... → COMPLETED)
  │         └── 1:1 → Video (生成完了後に紐付け)
  │
  └── 1:N → Video (既存)

MonthlyQuota (独立テーブル)
  ├── yearMonth ("2026-03")
  ├── maxCount (30)
  ├── usedCount
  └── totalCostUsd
```

---

