# AIチャンネルページ: スキーマ設計

> 元ファイル: [channel-data-design.md](channel-data-design.md) から分割（§1-2）

## プロジェクト: AI Theater
作成日: 2026-02-26
担当: tech-leader
Task: #3

---

## 1. AIチャンネルページの概要

### 1.1 ページURL

```
/channel/[slug]
```

### 1.2 ページに表示するデータ

| セクション | データ | ソース |
|-----------|--------|--------|
| チャンネルヘッダー | バナー、アバター、名前、説明 | AIChannel モデル |
| チャンネル統計 | 動画数、総再生数、登録者数 | AIChannel 集計キャッシュ |
| AI エージェント情報 | 使用モデル、専門領域、得意ムード | AIChannel モデル |
| AI 生成統計 | 平均品質スコア、総生成時間、推定総コスト | AIChannel 集計キャッシュ |
| 登録ボタン | 登録/解除、登録者数 | Subscription モデル |
| 動画グリッド | チャンネル動画一覧（ページネーション） | Video モデル |
| JSON-LD | 構造化データ | AIChannel + Video 集計 |

### 1.3 レンダリング戦略

```
AIチャンネルページ: SSR + ISR (revalidate: 300秒)

理由:
- OGP/SEO 対応が必須（SNS シェア時のチャンネルプレビュー表示）
- チャンネル情報は頻繁に変わらない → 5分キャッシュで十分
- 登録者数・動画数はキャッシュされた集計値で初期表示 → クライアントで最新化
- 動画グリッドの追加読み込みは API Route + TanStack Query で行う
```

---

## 2. Prisma スキーマ拡張

### 2.1 AIChannel モデルの拡張

ホーム画面DB設計（home-data-design.md）で定義済みの AIChannel モデルに、チャンネルページ表示に必要なフィールドを追加する。

```prisma
// =============================================
// AIChannel（AI投稿者 = 仮想チャンネル）【拡張版】
// =============================================
model AIChannel {
  id          String   @id @default(cuid())
  name        String                        // "Aurora", "Nexus", "Prism" 等
  slug        String   @unique              // URL用スラッグ
  description String?
  avatarUrl   String?                       // AI生成アバター画像URL
  bannerUrl   String?                       // バナー画像URL
  accentColor String?                       // チャンネル固有カラー (#hex)

  // --- AI エージェント仕様 ---
  aiModel          String                   // 主に使用するAIモデル名
  supportedModels  String[]                 // サポートモデル一覧 ["runway-gen4-turbo", "veo-3.1-fast"]
  themes           String[]                 // 得意ジャンル ["自然", "風景"]
  specializations  String[]                 // 専門領域 ["cinematic", "animation"]

  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  videos        Video[]
  subscribers   Subscription[]

  // --- 集計キャッシュ（パフォーマンス用）---
  // 基本統計
  videoCount      Int    @default(0)
  subscriberCount Int    @default(0)
  totalViewCount  BigInt @default(0)

  // AI 生成統計（新規追加）
  totalGenerationTimeSec  Int    @default(0)   // 総生成時間（秒）
  totalEstimatedCostUsd   Float  @default(0)   // 推定総コスト（USD）
  averageQualityScore     Float?               // 平均品質スコア（0-100）

  @@index([slug])
  @@index([isActive, createdAt])
  @@map("ai_channels")
}
```

### 2.2 既存フィールドとの差分

| フィールド | 状態 | 説明 |
|-----------|------|------|
| `supportedModels` | **新規** | AIエージェントが対応するモデル一覧。`aiModel` が主要モデル、`supportedModels` はフォールバック含む全対応モデル |
| `specializations` | **新規** | 専門領域。`themes` がジャンル（自然、SF等）、`specializations` が技術的な得意分野（cinematic, animation等） |
| `totalGenerationTimeSec` | **新規** | チャンネル全動画の累計生成時間。Video INSERT 時にトランザクション更新 |
| `totalEstimatedCostUsd` | **新規** | チャンネル全動画の累計推定コスト。Video INSERT 時にトランザクション更新 |
| `averageQualityScore` | **新規** | チャンネル全動画の平均品質スコア（0-100）。定期バッチ or Video PUBLISHED 時に再計算 |

### 2.3 Video モデルへの追加フィールド

チャンネルレベルの AI 生成統計を算出するため、Video モデルに動画単位の生成メトリクスを追加する。

```prisma
model Video {
  // ... 既存フィールド（home-data-design.md + video-player-data-design.md）...

  // AI生成メトリクス（新規追加）
  generationTimeSec  Int?                    // 生成にかかった時間（秒）
  estimatedCostUsd   Float?                  // 推定生成コスト（USD）

  // ... 既存のリレーション・インデックス ...
}
```

### 2.4 集計キャッシュ更新戦略

| フィールド | 更新タイミング | 更新方法 |
|-----------|-------------|---------|
| `AIChannel.totalGenerationTimeSec` | Video PUBLISHED 時 | トランザクション内で `increment: video.generationTimeSec` |
| `AIChannel.totalEstimatedCostUsd` | Video PUBLISHED 時 | トランザクション内で `increment: video.estimatedCostUsd` |
| `AIChannel.averageQualityScore` | 定期バッチ（1時間ごと）or Video PUBLISHED 時 | `AVG(qualityScore)` を再計算して格納 |
| `AIChannel.videoCount` | Video PUBLISHED 時 | 既存（home-data-design.md 準拠）`increment: 1` |
| `AIChannel.subscriberCount` | Subscription INSERT/DELETE 時 | 既存（home-data-design.md 準拠） |
| `AIChannel.totalViewCount` | View INSERT 時 | `increment: 1`（既存パターン拡張） |

```typescript
// Video が PUBLISHED になった時のチャンネル統計更新
async function onVideoPublished(video: {
  id: string;
  channelId: string;
  generationTimeSec: number | null;
  estimatedCostUsd: number | null;
  qualityScore: number | null;
}) {
  await prisma.$transaction(async (tx) => {
    // 1. videoCount を increment（既存パターン）
    // 2. 生成統計を increment
    await tx.aIChannel.update({
      where: { id: video.channelId },
      data: {
        videoCount: { increment: 1 },
        ...(video.generationTimeSec != null && {
          totalGenerationTimeSec: { increment: video.generationTimeSec },
        }),
        ...(video.estimatedCostUsd != null && {
          totalEstimatedCostUsd: { increment: video.estimatedCostUsd },
        }),
      },
    });

    // 3. averageQualityScore を再計算
    const avg = await tx.video.aggregate({
      where: {
        channelId: video.channelId,
        status: "PUBLISHED",
        qualityScore: { not: null },
      },
      _avg: { qualityScore: true },
    });

    if (avg._avg.qualityScore != null) {
      await tx.aIChannel.update({
        where: { id: video.channelId },
        data: {
          averageQualityScore: Math.round(avg._avg.qualityScore * 10) / 10,
        },
      });
    }
  });
}
```

### 2.5 ER図（チャンネルページ関連）

```
AIChannel
  │
  ├── name, slug, description
  ├── avatarUrl, bannerUrl, accentColor
  │
  ├── aiModel (主要モデル)
  ├── supportedModels[] (対応モデル一覧)
  ├── themes[] (得意ジャンル)
  ├── specializations[] (専門領域)
  │
  ├── videoCount, subscriberCount, totalViewCount (基本統計)
  ├── totalGenerationTimeSec, totalEstimatedCostUsd (生成統計)
  ├── averageQualityScore (品質統計)
  │
  ├── 1:N → Video
  │         ├── title, muxPlaybackId, duration
  │         ├── aiModel, aiPrompt
  │         ├── generationTimeSec, estimatedCostUsd (新規)
  │         ├── qualityScore (0-100), moods[]
  │         ├── viewCount, likeCount
  │         └── status, publishedAt
  │
  └── M:N → User (Subscription)
            ├── notify
            └── createdAt
```

### 2.6 シードデータ更新

```typescript
// prisma/seed.ts（既存シードデータに新規フィールドを追加）

const aiChannels = [
  {
    name: "Aurora",
    slug: "aurora",
    description: "自然・風景のフォトリアル映像を生成するAIクリエイター",
    aiModel: "runway-gen4-turbo",
    supportedModels: ["runway-gen4-turbo", "veo-3.1-fast"],
    themes: ["自然", "風景", "タイムラプス"],
    specializations: ["photorealistic", "landscape", "timelapse"],
    accentColor: "#00D2D3",
  },
  {
    name: "Nexus",
    slug: "nexus",
    description: "サイバーパンク・SF映像を得意とするAIクリエイター",
    aiModel: "veo-3.1-fast",
    supportedModels: ["veo-3.1-fast", "runway-gen4-turbo"],
    themes: ["SF", "テクノロジー", "サイバーパンク"],
    specializations: ["cyberpunk", "sci-fi", "neon"],
    accentColor: "#6C5CE7",
  },
  {
    name: "Prism",
    slug: "prism",
    description: "抽象アート・ジェネラティブアート映像のAIクリエイター",
    aiModel: "kling-ai",
    supportedModels: ["kling-ai", "runway-gen4-turbo"],
    themes: ["アート", "抽象", "ジェネラティブ"],
    specializations: ["abstract", "generative", "animation"],
    accentColor: "#FD79A8",
  },
];
```

---

