# ホーム画面 推薦理由表示 MVPデータソース定義

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: tech-leader
Task: #2
関連: CONSISTENCY-ISSUE-1（レビュー指摘）

---

## 1. 背景と目的

### 1.1 レビュー指摘事項

ホーム画面詳細設計レビュー（CONSISTENCY-ISSUE-1）にて、UX設計の「おすすめ理由」（RecommendationReason）に対応するデータソースがDB設計に未定義であることが指摘された。本ドキュメントでは、MVP段階で実装可能な推薦理由のデータソースを定義する。

### 1.2 UX設計で定義された推薦理由タイプ（6種）

| タイプ | 表示例 | 条件 |
|--------|--------|------|
| モデル嗜好 | 「Runway の動画をよく視聴しているため」 | 同一モデルの視聴履歴 |
| テーマ嗜好 | 「風景動画に興味がありそうなため」 | カテゴリの視聴傾向 |
| 品質重視 | 「品質スコアが高い人気動画」 | Quality Score 上位 |
| 急上昇 | 「今日急上昇中の動画」 | 直近の再生増加率 |
| 新着 | 「購読中の Aurora の新着動画」 | 購読チャンネルの新着 |
| 探索 | 「新しいジャンルの発見のため」 | 意図的なバブル破壊 |

---

## 2. MVPデータソース分析

### 2.1 利用可能なデータソース一覧

| データソース | モデル/テーブル | MVP初期で利用可能 | 備考 |
|------------|---------------|:-:|------|
| 動画の品質スコア | `Video.qualityScore` | ✅ | バッチ算出済み |
| 動画の再生数 | `Video.viewCount` | ✅ | 集計キャッシュ |
| 動画の公開日時 | `Video.publishedAt` | ✅ | 即時利用可能 |
| 動画のAIモデル | `Video.aiModel` | ✅ | 即時利用可能 |
| 動画のカテゴリ | `Video.categoryId` → `Category` | ✅ | 即時利用可能 |
| 動画のムード | `Video.moods` | ✅ | 即時利用可能 |
| いいね率 | `Video.likeCount` / (`likeCount` + `dislikeCount`) | ✅ | クライアント計算 |
| チャンネル購読状態 | `Subscription` | ✅ | 認証ユーザーのみ |
| ユーザー視聴履歴 | `View` (userId, videoId) | ✅ | 認証ユーザーのみ |
| 視聴履歴の集計（モデル別） | `View` JOIN `Video` → GROUP BY `aiModel` | ⚠️ | クエリコスト中。キャッシュ推奨 |
| 視聴履歴の集計（カテゴリ別） | `View` JOIN `Video` → GROUP BY `categoryId` | ⚠️ | クエリコスト中。キャッシュ推奨 |
| 直近の再生増加率 | `View` WHERE `createdAt` > 24h GROUP BY `videoId` | ⚠️ | Raw SQLが必要 |
| ユーザープロファイル（嗜好分析） | 未定義 | ❌ | 将来フェーズ |
| LLMによるプロンプト分析 | 外部API | ❌ | コスト・レイテンシの問題 |

### 2.2 実装難易度による分類

```
Tier 1: ユーザーデータ不要（未ログインでも表示可能）
  → 品質重視、急上昇、新着（セクション固定テキスト）

Tier 2: 基本ユーザーデータ（ログイン時、低コストクエリ）
  → 新着（購読チャンネル）、モデル嗜好（簡易集計）

Tier 3: 高度なパーソナライズ（将来フェーズ）
  → テーマ嗜好（多軸分析）、探索（バブル破壊アルゴリズム）
```

---

## 3. MVP実装方針

### 3.1 MVP Phase 1: セクションベース固定理由（Tier 1）

**ユーザーデータ不要。ホーム画面のセクション/タブに応じた固定テキストを表示。**

| セクション/タブ | 推薦理由タイプ | 表示テキスト | データソース |
|----------------|--------------|------------|------------|
| Hero Section | 品質重視 | 「品質スコアが最も高い今週の動画」 | `Video.qualityScore` DESC + `publishedAt` > 7日前 |
| トレンドカルーセル | 急上昇 | 「今日急上昇中の動画」 | `Video.viewCount` DESC（MVP簡易版） |
| 高品質カルーセル | 品質重視 | 「AIクオリティスコアが高い人気動画」 | `Video.qualityScore` DESC |
| 新着グリッド | 新着 | 「新着のAI動画」 | `Video.publishedAt` DESC |
| カテゴリ別 | テーマ（固定） | 「{カテゴリ名}の動画」 | URL param `categorySlug` |
| ムード別 | テーマ（固定） | 「{ムード名}の雰囲気の動画」 | URL param `mood` |

**実装コード:**

```typescript
// lib/recommendation-reason.ts

export type RecommendationReasonType =
  | "quality"
  | "trending"
  | "new"
  | "subscription"
  | "model_preference"
  | "category"
  | "mood"
  | "explore";

export interface RecommendationReason {
  type: RecommendationReasonType;
  text: string;
  icon: string; // Lucide icon name
}

/**
 * MVP Phase 1: セクション/タブに応じた固定推薦理由を返す
 * ユーザーデータ不要（サーバー側で生成してクライアントに渡す）
 */
export function getStaticRecommendationReason(
  section: string,
  context?: { categoryName?: string; moodName?: string }
): RecommendationReason {
  switch (section) {
    case "hero":
      return {
        type: "quality",
        text: "品質スコアが最も高い今週の動画",
        icon: "Award",
      };
    case "trending":
      return {
        type: "trending",
        text: "今日急上昇中の動画",
        icon: "TrendingUp",
      };
    case "top-quality":
      return {
        type: "quality",
        text: "AIクオリティスコアが高い人気動画",
        icon: "Star",
      };
    case "new":
      return {
        type: "new",
        text: "新着のAI動画",
        icon: "Sparkles",
      };
    case "category":
      return {
        type: "category",
        text: `${context?.categoryName ?? ""}の動画`,
        icon: "Tag",
      };
    case "mood":
      return {
        type: "mood",
        text: `${context?.moodName ?? ""}の雰囲気の動画`,
        icon: "Palette",
      };
    default:
      return {
        type: "quality",
        text: "あなたにおすすめの動画",
        icon: "Lightbulb",
      };
  }
}
```

**API レスポンスへの統合:**

```typescript
// VideoCard 型に推薦理由を追加
interface VideoCardWithReason extends VideoCard {
  recommendationReason?: RecommendationReason;
}

// GET /api/videos のレスポンス
interface VideosResponse {
  videos: VideoCardWithReason[];
  nextCursor: string | null;
  hasMore: boolean;
  sectionReason?: RecommendationReason; // セクション全体の推薦理由
}
```

### 3.2 MVP Phase 2: ユーザーベース簡易パーソナライズ（Tier 2）

**ログインユーザーの視聴履歴から簡易的な推薦理由を生成。**

#### 3.2.1 購読チャンネル新着

```typescript
/**
 * 購読チャンネルの新着動画に推薦理由を付与
 */
async function getSubscriptionReasons(
  userId: string,
  videoIds: string[]
): Promise<Map<string, RecommendationReason>> {
  // ユーザーの購読チャンネルIDを取得
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    select: { channelId: true, channel: { select: { name: true } } },
  });

  const subscribedChannelIds = new Set(subscriptions.map((s) => s.channelId));
  const channelNames = new Map(
    subscriptions.map((s) => [s.channelId, s.channel.name])
  );

  // 対象動画のチャンネル情報を取得
  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: { id: true, channelId: true },
  });

  const reasons = new Map<string, RecommendationReason>();
  for (const video of videos) {
    if (subscribedChannelIds.has(video.channelId)) {
      reasons.set(video.id, {
        type: "subscription",
        text: `購読中の ${channelNames.get(video.channelId)} の新着動画`,
        icon: "Bell",
      });
    }
  }

  return reasons;
}
```

#### 3.2.2 AIモデル嗜好（簡易版）

```typescript
/**
 * 直近30日の視聴履歴からユーザーの好みのAIモデルを特定し、
 * 該当モデルの動画に推薦理由を付与
 */
async function getModelPreferenceReasons(
  userId: string,
  videoIds: string[]
): Promise<Map<string, RecommendationReason>> {
  // 直近30日の視聴履歴から、AIモデル別の視聴回数を集計
  const modelCounts = await prisma.$queryRaw<
    { ai_model: string; count: bigint }[]
  >`
    SELECT v.ai_model, COUNT(*) as count
    FROM views vw
    JOIN videos v ON vw.video_id = v.id
    WHERE vw.user_id = ${userId}
      AND vw.created_at > NOW() - INTERVAL '30 days'
    GROUP BY v.ai_model
    ORDER BY count DESC
    LIMIT 3
  `;

  if (modelCounts.length === 0) return new Map();

  // 最も視聴しているモデル
  const topModel = modelCounts[0].ai_model;
  const totalViews = modelCounts.reduce(
    (sum, m) => sum + Number(m.count),
    0
  );
  const topModelRatio = Number(modelCounts[0].count) / totalViews;

  // 閾値: 全視聴の30%以上が同一モデルなら「好み」と判定
  if (topModelRatio < 0.3) return new Map();

  // 対象動画のAIモデル情報を取得
  const videos = await prisma.video.findMany({
    where: { id: { in: videoIds } },
    select: { id: true, aiModel: true },
  });

  const modelDisplayNames: Record<string, string> = {
    "runway-gen4-turbo": "Runway Gen-4",
    "veo-3.1-fast": "Veo 3.1",
    "kling-ai": "Kling",
    "sora": "Sora",
  };

  const reasons = new Map<string, RecommendationReason>();
  for (const video of videos) {
    if (video.aiModel === topModel) {
      const displayName = modelDisplayNames[video.aiModel] ?? video.aiModel;
      reasons.set(video.id, {
        type: "model_preference",
        text: `${displayName} の動画をよく視聴しているため`,
        icon: "Brain",
      });
    }
  }

  return reasons;
}
```

#### 3.2.3 推薦理由の優先度マージ

```typescript
/**
 * 複数の推薦理由ソースをマージし、優先度順に1つの理由を選定
 * 優先度: subscription > model_preference > section default
 */
async function resolveRecommendationReasons(
  userId: string | null,
  videos: VideoCard[],
  sectionDefault: RecommendationReason
): Promise<VideoCardWithReason[]> {
  const videoIds = videos.map((v) => v.id);

  let subscriptionReasons = new Map<string, RecommendationReason>();
  let modelReasons = new Map<string, RecommendationReason>();

  if (userId) {
    // 並列で取得（パフォーマンス最適化）
    [subscriptionReasons, modelReasons] = await Promise.all([
      getSubscriptionReasons(userId, videoIds),
      getModelPreferenceReasons(userId, videoIds),
    ]);
  }

  return videos.map((video) => ({
    ...video,
    recommendationReason:
      subscriptionReasons.get(video.id) ??
      modelReasons.get(video.id) ??
      sectionDefault,
  }));
}
```

---

## 4. パフォーマンス考慮事項

### 4.1 クエリコスト

| 推薦理由タイプ | クエリ数 | 推定レイテンシ | キャッシュ |
|--------------|:------:|:----------:|:--------:|
| Tier 1（固定テキスト） | 0 | 0ms | 不要 |
| 購読チャンネル新着 | 2 | ~10ms | staleTime: 5分 |
| AIモデル嗜好 | 2 | ~20ms | staleTime: 30分 |

### 4.2 キャッシュ戦略

```typescript
// AIモデル嗜好のキャッシュ（TanStack Query）
// ユーザーの嗜好は頻繁に変わらないので長めのstaleTime
const { data: modelPreference } = useQuery({
  queryKey: ["user-model-preference", userId],
  queryFn: () => fetch("/api/user/preferences/model").then((r) => r.json()),
  staleTime: 30 * 60 * 1000, // 30分
  enabled: !!userId,
});
```

### 4.3 推薦理由を表示しないケース

| ケース | 理由 |
|--------|------|
| 動画が4件未満のセクション | 理由表示のスペースが無駄 |
| 検索結果ページ | 検索キーワードが明確な意図を示している |
| チャンネルページ | チャンネル名がそのまま理由になる |

---

## 5. UI統合ポイント

### 5.1 VideoCard への統合

```typescript
// components/video/VideoCard.tsx 内

{video.recommendationReason && (
  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-primary/[0.06] px-2.5 py-1.5 border-l-2 border-primary">
    <LucideIcon
      name={video.recommendationReason.icon}
      className="mt-0.5 h-3 w-3 shrink-0 text-text-secondary"
    />
    <span className="text-[11px] leading-snug text-text-secondary line-clamp-2">
      {video.recommendationReason.text}
    </span>
  </div>
)}
```

### 5.2 セクションヘッダーへの統合

カルーセルセクションの場合、個々のカードではなくセクションヘッダーに推薦理由を表示する方がスペース効率が良い:

```typescript
// components/home/SectionHeader.tsx

interface SectionHeaderProps {
  title: string;
  reason?: RecommendationReason;
  showAllLink?: string;
}

export function SectionHeader({ title, reason, showAllLink }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <h2 className="font-heading text-lg font-bold text-text-primary md:text-xl">
          {title}
        </h2>
        {reason && (
          <p className="mt-1 text-xs text-text-secondary">
            💡 {reason.text}
          </p>
        )}
      </div>
      {showAllLink && (
        <a href={showAllLink} className="text-sm font-medium text-primary">
          すべて見る →
        </a>
      )}
    </div>
  );
}
```

---

## 6. 将来の拡張（Tier 3）

### 6.1 テーマ嗜好の高度な分析

```
将来: UserPreference テーブルの導入
├── userId
├── preferredModels  Json   // { "runway-gen4-turbo": 0.45, "veo-3.1-fast": 0.30 }
├── preferredCategories Json
├── preferredMoods Json
├── lastCalculatedAt DateTime
└── バッチジョブで日次更新
```

### 6.2 探索モード（バブル破壊）

ユーザーの嗜好と**逆方向**のコンテンツを意図的に推薦:
- preferredModels に含まれない AIモデルの動画
- preferredCategories に含まれないカテゴリの高品質動画
- 推薦理由: 「新しいジャンルの発見のために」

### 6.3 LLMベースの理由生成

Quality Score の詳細情報 + ユーザー嗜好プロファイルを入力として、LLMで自然な日本語のおすすめ理由を生成:
- 「あなたが好きな風景系の動画で、特にプロンプトの創造性が高いと評価されています」
- コスト: LLM呼び出しが必要。バッチ生成 + キャッシュで対応

---

## 7. MVP実装ロードマップ

| フェーズ | 実装内容 | 工数目安 | 依存 |
|---------|---------|:------:|------|
| **Phase 1** | セクションベース固定理由 | 0.5日 | なし |
| **Phase 2a** | 購読チャンネル新着理由 | 0.5日 | Clerk認証、Subscription |
| **Phase 2b** | AIモデル嗜好理由 | 1日 | View データの蓄積 |
| **Phase 3** | UserPreference + バッチ計算 | 2-3日 | ユーザー数の増加後 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成 | tech-leader |
| 2026-03-07 | 1.1 | [必須修正 解決] MVP Phase 1 確定。home-uiux-improvements.md / home-data-design.md への統合完了。相互参照追加 | tech-leader |
