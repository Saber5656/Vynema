# 検索機能: データフロー・インフラ設計

> 元ファイル: [search-data-design.md](search-data-design.md) から分割（§10-14）

---

## 10. Server Component データフロー

### 10.1 ページ構成

```typescript
// app/search/page.tsx

"use client";

import { useSearchParams } from "next/navigation";
import { useSearch } from "@/hooks/useSearch";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const params = parseSearchParams(searchParams);

  const { data, isLoading, error } = useSearch(params);

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6">
      {/* 検索結果ヘッダー */}
      <SearchResultHeader
        query={params.query}
        totalCount={data?.totalCount ?? 0}
      />

      {/* フィルタバー */}
      <SearchFilters filters={data?.filters} />

      {/* 検索結果リスト */}
      {isLoading ? (
        <SearchResultSkeleton count={10} />
      ) : error ? (
        <SearchError />
      ) : data?.results.length === 0 ? (
        <SearchEmpty query={params.query} />
      ) : (
        <>
          <SearchResultList results={data.results} />
          <SearchPagination
            page={data.page}
            totalPages={data.totalPages}
          />
        </>
      )}
    </main>
  );
}
```

### 10.2 データフェッチフロー

```
ユーザーが検索バーにキーワード入力
    ↓
[300ms debounce]
    ↓
GET /api/search/suggest?q=keyword
    → Prisma: 履歴 + 動画タイトル + チャンネル名
    → サジェストドロップダウン表示
    ↓
ユーザーが Enter / 検索ボタン押下
    ↓
URL 遷移: /search?q=keyword&sort=relevance
    ↓
[Client Component] SearchPage
    ├── useSearch(params) → GET /api/search?q=keyword&sort=relevance
    │     ├── pg_trgm 類似検索（3文字以上）or ILIKE（短いクエリ）
    │     ├── フィルタ適用
    │     ├── COUNT(*) 件数取得
    │     └── タグバッチ取得
    │     合計: ~50-80ms
    │
    ├── TanStack Query キャッシュ管理
    │     ├── staleTime: 1分
    │     └── placeholderData: 前のデータを維持（ページ遷移時）
    │
    └── [非同期] 検索履歴保存（認証時のみ）
          └── saveSearchHistory(userId, query, resultCount)
```

---

## 11. Zod バリデーションスキーマ

```typescript
// lib/validations/search.ts

import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z
    .string()
    .min(1, "検索キーワードを入力してください")
    .max(100, "検索キーワードは100文字以内で入力してください")
    .transform((val) => val.trim()),
  sort: z.enum(["relevance", "date", "views", "rating"]).default("relevance"),
  duration: z.enum(["any", "short", "medium", "long"]).default("any"),
  date: z.enum(["any", "today", "week", "month", "year"]).default("any"),
  model: z.string().nullable().default(null),
  categorySlug: z.string().nullable().default(null),
  mood: z.string().nullable().default(null),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const suggestQuerySchema = z.object({
  q: z
    .string()
    .min(1)
    .max(50)
    .transform((val) => val.trim()),
  limit: z.coerce.number().int().min(1).max(10).default(8),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;
```

---

## 12. セキュリティ考慮事項

### 12.1 入力バリデーション

| フィールド | バリデーション |
|-----------|-------------|
| `q`（検索クエリ） | 1-100文字、trim、Zod |
| `sort` | enum: relevance / date / views / rating |
| `duration` | enum: any / short / medium / long |
| `date` | enum: any / today / week / month / year |
| `model` | 文字列 or null |
| `page` | 正の整数 |
| `limit` | 1-50 の整数 |

### 12.2 SQL インジェクション対策

- すべてのクエリに **Prisma の `$queryRaw` テンプレートリテラル**を使用
- テンプレートリテラルのプレースホルダ (`${value}`) は Prisma が自動的にパラメータ化
- ユーザー入力を直接 SQL 文字列に結合しない

```typescript
// ✅ 安全: Prisma のテンプレートリテラル（自動パラメータ化）
const results = await prisma.$queryRaw`
  SELECT * FROM videos WHERE title % ${userInput}
`;

// ❌ 危険: 文字列結合（絶対に使わない）
// const results = await prisma.$queryRawUnsafe(
//   `SELECT * FROM videos WHERE title % '${userInput}'`
// );
```

### 12.3 Rate Limiting

| エンドポイント | 制限 | 理由 |
|-------------|------|------|
| `/api/search` | 30 req/60s | 検索クエリの連続実行防止 |
| `/api/search/suggest` | 60 req/60s | タイピング中の高頻度リクエスト許容 |
| `/api/search/popular` | 10 req/60s | 低頻度で十分 |
| `/api/search/history` | 30 req/60s | 通常使用範囲 |
| `/api/search/history` (DELETE) | 5 req/60s | 削除操作は低頻度 |

Rate Limiting 実装は既存設計（home-rate-limiting.md）の Upstash `@upstash/ratelimit` パターンを踏襲する。

### 12.4 認可チェック

| アクション | チェック |
|-----------|---------|
| 動画検索 | 認証不要 |
| サジェスト取得 | 認証不要（履歴サジェストは認証時のみ含める） |
| 人気検索ワード取得 | 認証不要 |
| 検索履歴取得 | Clerk 認証必須 |
| 検索履歴削除 | Clerk 認証必須 + 本人のデータのみ |

---

## 13. AIモデルフィルタの選択肢

### 13.1 AIモデル一覧の動的取得

フィルタ UI の AIモデル選択肢は、DB から動的に取得する（ハードコードしない）。

```typescript
// lib/queries/search-filters.ts

/**
 * 検索フィルタの選択肢を取得する。
 * 公開済み動画で実際に使われているAIモデルの一覧を返す。
 */
export async function getAvailableModels() {
  const models = await prisma.video.findMany({
    where: { status: "PUBLISHED" },
    select: { aiModel: true },
    distinct: ["aiModel"],
  });

  // 表示名マッピング（video-player-data-design.md §3.7 と統一）
  const modelDisplayNames: Record<string, string> = {
    "runway-gen4-turbo": "Runway Gen-4",
    "veo-3.1-fast": "Veo 3.1",
    "kling-ai": "Kling",
    "sora": "Sora",
  };

  return models.map((m) => ({
    value: m.aiModel,
    label: modelDisplayNames[m.aiModel] ?? m.aiModel,
  }));
}
```

---

## 14. 将来の拡張ポイント

### 14.1 フェーズ別ロードマップ

| フェーズ | 機能 | 技術 |
|---------|------|------|
| **MVP（現在）** | pg_trgm 検索、フィルタ、サジェスト、検索履歴 | PostgreSQL pg_trgm + Prisma |
| **v2** | 検索クエリの自動補正（"Did you mean?"） | pg_trgm `similarity()` + 閾値判定 |
| **v2** | パーソナライズ検索（視聴履歴ベースのブースト） | View テーブル参照 + スコア加算 |
| **v3** | 外部検索エンジン移行（Meilisearch） | データ同期パイプライン + 検索 API 差し替え |

### 14.2 pg_trgm → Meilisearch 移行の判断基準

以下のいずれかに該当した場合、外部検索エンジンへの移行を検討する:

| 指標 | 閾値 | 理由 |
|------|------|------|
| 動画数 | > 50,000 本 | pg_trgm GIN インデックスのサイズ・検索速度 |
| 検索レイテンシ p95 | > 200ms | ユーザー体験の劣化 |
| 日本語検索の精度フィードバック | 否定的 | 形態素解析ベースの検索が必要 |
| 月額予算 | > $50 | 外部サービスのコスト枠確保 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成 | tech-leader |
