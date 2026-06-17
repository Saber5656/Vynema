# 検索機能: パフォーマンス設計（レンダリング・キャッシュ）

> 元ファイル: [search-performance-design.md](search-performance-design.md) から分割（§1-5）

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: analyzer
Task: #9

**前提: 個人開発レベルの予算制約（月額$50以下目標）**

---

## 1. レンダリング戦略

### 1.1 検索ページの方式

**CSR（クライアントサイドレンダリング）**

検索ページは DB 設計（Task #8）の方針に準拠し、完全 CSR で構成する。
検索バー・フィルタバーは静的シェルとして即座にレンダリングし、検索結果・オートコンプリートは全て TanStack Query で CSR 取得する。
URL パラメータ（`q`, `sort`, `model`, `channel`, `page`）で検索状態を管理し、ブラウザバック・ブックマーク・共有に対応する。

```
リクエスト: /search?q=landscape&model=runway&page=1
  |
[Vercel Edge] 静的シェル配信（ISR / CDN キャッシュ対象）
  |
[ブラウザ] 静的シェルを即座にレンダリング
  |-- Header + SearchBar + FilterBar -> 即表示
  |-- SearchResultsSkeleton -> ローディング UI
  |
[Client] TanStack Query（CSR）
  |-- GET /api/search?q=...&page=...  -> 検索結果取得
  |-- GET /api/search/autocomplete?q=... -> オートコンプリート
  |
[ブラウザ] 検索結果グリッド + ページネーション UI をレンダリング
```

### 1.2 レンダリング設定

| セクション | 方式 | キャッシュ | 理由 |
|-----------|------|----------|------|
| 検索バー + フィルタバー | **Static（シェル）** | CDN | 静的 UI。即座にレンダリング |
| 検索結果グリッド | **CSR（TanStack Query）** | staleTime=30秒 | クエリ依存。API 経由で取得 |
| ページネーション | **CSR** | — | URL params で状態管理 |
| オートコンプリート候補 | **CSR** | staleTime=60秒 | クライアント側でデバウンス処理 |
| 人気検索ワード | **ISR** | revalidate=300秒 | 低頻度更新の公開データ |

### 1.3 ページ構成（CSR ベース）

```typescript
// app/search/page.tsx

import { Suspense } from "react";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchFilters } from "@/components/search/SearchFilters";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { PopularSearches } from "@/components/search/PopularSearches";

/**
 * 検索ページ: 静的シェル + CSR
 * - シェル（SearchBar, SearchFilters）は静的に配信（CDN キャッシュ対象）
 * - 検索結果は CSR（TanStack Query）で取得
 * - URL params で検索状態を管理（ブックマーク・共有対応）
 */
export default function SearchPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-6">
      {/* 静的シェル: 即座にレンダリング */}
      <SearchBar />
      <SearchFilters />

      {/* 検索結果: CSR コンポーネント */}
      <Suspense>
        <SearchResultsClient />
      </Suspense>
    </div>
  );
}
```

**CSR 採用の理由**:
- 検索クエリはユーザーごとに異なり SSR キャッシュが無効（revalidate=0 と実質同じ）
- SSR + Streaming でも TTFB が 100-400ms 増加するだけで、CSR の静的シェル配信（TTFB ~50ms）の方が高速
- DB 設計（Task #8）で CSR 方針が確定済み
- URL params による状態管理でブラウザバック・ブックマーク・検索結果共有に対応

---

## 2. 検索レスポンスタイム目標

### 2.1 パーセンタイル別目標値

非機能要件 NFR-P03（検索結果表示時間 1秒以内）に基づき、以下の目標値を設定する。

| パーセンタイル | API レスポンスタイム | エンドツーエンド（UI描画完了） | 根拠 |
|-------------|-------------------|--------------------------|------|
| **p50** | **≤ 100ms** | **≤ 300ms** | 通常クエリ。インデックスヒットで高速応答 |
| **p95** | **≤ 300ms** | **≤ 700ms** | 複雑なフィルタ付きクエリ |
| **p99** | **≤ 500ms** | **≤ 1,000ms** | NFR-P03 準拠。ワーストケース |

### 2.2 レスポンスタイム内訳（p50 想定）

```
フェーズ                                    時間見積もり
--------------------------------------------------------------
クライアント -> Vercel Edge                :  10 ~  30ms
Vercel Edge -> Supabase (pg_trgm クエリ)   :  30 ~  60ms
  |-- pg_trgm similarity (GIN インデックス) :  10 ~  30ms
  |-- Prisma ORM オーバーヘッド            :   5 ~  10ms
  |-- ネットワーク往復                      :  15 ~  20ms
レスポンス生成 + JSON シリアライズ           :   5 ~  10ms
--------------------------------------------------------------
合計（API レスポンスタイム）                :  45 ~ 100ms
UI レンダリング（React 描画）               :  50 ~ 100ms
--------------------------------------------------------------
エンドツーエンド                            :  95 ~ 200ms -> p50 ≤ 300ms 達成可能
```

### 2.3 オートコンプリートのレスポンスタイム目標

| 項目 | 目標 | 理由 |
|------|------|------|
| デバウンス遅延 | 300ms | タイピング中の余分なリクエストを防止 |
| API レスポンス | ≤ 50ms | ユーザーが待機感を感じない閾値 |
| 候補表示完了 | ≤ 100ms（デバウンス後） | 即座のフィードバック |

---

## 3. Supabase 検索パフォーマンス最適化

### 3.1 pg_trgm の採用理由（search-data-design.md 準拠）

DB設計（Task #8）にて pg_trgm をメイン検索エンジンとして選定済み。本セクションはその決定に準拠する。

| 選択肢 | 判定 | 理由 |
|--------|------|------|
| **pg_trgm** | **採用（メイン）** | Supabase 標準搭載。日本語・英語の両方で部分一致・類似検索が可能。追加コスト$0 |
| PostgreSQL FTS（tsvector/tsquery） | 不採用 | 日本語トークナイズ非対応。英語のみの場合は高速だが、AI Theater は日本語UIのためミスマッチ |
| pgroonga | 不採用 | Supabase では拡張インストール不可（マネージド制約） |
| 外部検索サービス（Algolia/Meilisearch） | 不採用 | 追加コスト発生。月額$50予算に収まらない |

### 3.2 インデックス設計

#### pg_trgm GIN インデックス

```sql
-- pg_trgm 拡張の有効化
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Video テーブル: タイトル・説明文の類似検索用 GIN インデックス
CREATE INDEX idx_video_title_trgm ON "Video" USING GIN (title gin_trgm_ops);
CREATE INDEX idx_video_description_trgm ON "Video" USING GIN (description gin_trgm_ops);

-- AIChannel テーブル: チャンネル名の類似検索用 GIN インデックス
CREATE INDEX idx_channel_name_trgm ON "AIChannel" USING GIN (name gin_trgm_ops);
```

#### 検索対象フィールドと優先度

| 優先度 | フィールド | 検索方式 | 理由 |
|--------|----------|---------|------|
| **高** | Video.title | `similarity()` + `ILIKE` | ユーザーが最も検索対象にするフィールド |
| **中** | Video.description | `similarity()` | 補足的な検索対象 |
| **中** | AIChannel.name | `similarity()` | チャンネル名での検索 |
| **低** | Video.aiModel | `=` 完全一致 | フィルタとして使用（類似検索不要） |
| **低** | Video.tags | `@>` 配列包含 | タグフィルタとして使用 |

### 3.3 検索クエリ戦略

pg_trgm の `similarity()` をメインとし、短いクエリ（1-2文字）では `ILIKE` にフォールバックする。

| クエリ長 | 方式 | 理由 |
|---------|------|------|
| 1-2文字 | `ILIKE '%keyword%'` | pg_trgm は 3-gram のため、短いクエリでは精度が低い |
| **3文字以上** | **`similarity()` + `%` 演算子** | **メイン方式。類似度閾値 0.3 でフィルタ** |

```sql
-- 3文字以上のクエリ: pg_trgm similarity() をメインに使用
SELECT
  v.id, v.title, v."muxPlaybackId", v."viewCount",
  v.duration, v."qualityScore", v."aiModel", v."createdAt",
  c.id AS "channelId", c.name AS "channelName", c.slug AS "channelSlug",
  similarity(v.title, $1) AS title_sim,
  similarity(v.description, $1) AS desc_sim,
  -- タイトル類似度を重視したスコア計算
  (similarity(v.title, $1) * 2 + similarity(v.description, $1)) AS score
FROM "Video" v
JOIN "AIChannel" c ON v."channelId" = c.id
WHERE v.status = 'PUBLISHED'
  AND (v.title % $1 OR v.description % $1)
ORDER BY score DESC
LIMIT 20 OFFSET $2;

-- 1-2文字のクエリ: ILIKE フォールバック
SELECT v.id, v.title, ...
FROM "Video" v
JOIN "AIChannel" c ON v."channelId" = c.id
WHERE v.status = 'PUBLISHED'
  AND (v.title ILIKE '%' || $1 || '%' OR v.description ILIKE '%' || $1 || '%')
ORDER BY v."viewCount" DESC
LIMIT 20 OFFSET $2;
```

### 3.4 クエリパフォーマンス見積もり

| データ規模 | GIN(trgm) インデックス有無 | クエリ時間（見積もり） | 備考 |
|-----------|------------------------|-------------------|------|
| 500本 | あり | **< 15ms** | MVP 初期。インデックスがメモリに収まる |
| 5,000本 | あり | **< 50ms** | Supabase Free の 500MB 内 |
| 50,000本 | あり | **< 150ms** | Supabase Pro が必要（$25/月） |
| 500本 | なし | ~80ms | シーケンシャルスキャン（similarity 計算がCPU負荷） |
| 5,000本 | なし | ~500ms | パフォーマンス劣化が顕著 |

**結論**: GIN(trgm) インデックスにより MVP 規模（500本）では 15ms 以下で応答可能。p99 目標（500ms）も十分達成。

> **FTS との比較**: pg_trgm は tsvector/tsquery ベースの FTS と比較して同規模で 1.5 倍程度遅い。
> ただし MVP 規模では差異は無視可能（15ms vs 10ms）であり、日本語対応の利点が上回る。

### 3.5 Prisma での pg_trgm クエリ実装

Prisma は pg_trgm をネイティブサポートしていないため、`$queryRaw` を使用する。

```typescript
// lib/queries/search.ts

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

interface SearchParams {
  query: string;
  page?: number;
  limit?: number;
  sort?: "relevance" | "newest" | "popular";
  model?: string;
  channelSlug?: string;
}

export async function searchVideos({
  query,
  page = 1,
  limit = 20,
  sort = "relevance",
  model,
  channelSlug,
}: SearchParams) {
  const safeLimit = Math.min(limit, 50);
  const offset = (page - 1) * safeLimit;
  const isShortQuery = query.length < 3;

  // 動的 ORDER BY（SQL インジェクション防止のため固定値マッピング）
  const orderClause = {
    relevance: isShortQuery
      ? Prisma.sql`v."viewCount" DESC`
      : Prisma.sql`(similarity(v.title, ${query}) * 2 + similarity(v.description, ${query})) DESC`,
    newest: Prisma.sql`v."createdAt" DESC`,
    popular: Prisma.sql`v."viewCount" DESC`,
  }[sort];

  // WHERE 条件: 短いクエリは ILIKE、3文字以上は similarity
  const searchCondition = isShortQuery
    ? Prisma.sql`(v.title ILIKE ${"%" + query + "%"} OR v.description ILIKE ${"%" + query + "%"})`
    : Prisma.sql`(v.title % ${query} OR v.description % ${query})`;

  // 検索結果取得
  const videos = await prisma.$queryRaw`
    SELECT
      v.id,
      v.title,
      v."muxPlaybackId",
      v."viewCount",
      v.duration,
      v."qualityScore",
      v."aiModel",
      v."createdAt",
      c.id AS "channelId",
      c.name AS "channelName",
      c.slug AS "channelSlug"
    FROM "Video" v
    JOIN "AIChannel" c ON v."channelId" = c.id
    WHERE v.status = 'PUBLISHED'
      AND ${searchCondition}
      ${model ? Prisma.sql`AND v."aiModel" = ${model}` : Prisma.empty}
      ${channelSlug ? Prisma.sql`AND c.slug = ${channelSlug}` : Prisma.empty}
    ORDER BY ${orderClause}
    LIMIT ${safeLimit}
    OFFSET ${offset}
  `;

  // 総件数取得（ページネーション用）
  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "Video" v
    JOIN "AIChannel" c ON v."channelId" = c.id
    WHERE v.status = 'PUBLISHED'
      AND ${searchCondition}
      ${model ? Prisma.sql`AND v."aiModel" = ${model}` : Prisma.empty}
      ${channelSlug ? Prisma.sql`AND c.slug = ${channelSlug}` : Prisma.empty}
  `;

  const totalCount = Number(countResult[0].count);
  const totalPages = Math.ceil(totalCount / safeLimit);

  return {
    videos,
    page,
    totalPages,
    totalCount,
  };
}
```

---

## 4. 検索結果キャッシュ戦略

### 4.1 キャッシュレイヤー構成

```
[クライアント]
  |-- TanStack Query キャッシュ（staleTime=30秒）     <- Layer 1
  |
[API Route]
  |-- Upstash Redis キャッシュ（TTL=60秒）            <- Layer 2
  |
[Supabase]
  |-- PostgreSQL pg_trgm（GIN インデックス）          <- データソース
```

### 4.2 Layer 1: TanStack Query クライアントキャッシュ

```typescript
// hooks/useSearchResults.ts

"use client";

import { useQuery } from "@tanstack/react-query";
import type { SearchResponse } from "@/lib/types";

interface UseSearchResultsParams {
  query: string;
  page?: number;
  sort?: string;
  model?: string;
  channelSlug?: string;
}

export function useSearchResults({
  query,
  page = 1,
  sort = "relevance",
  model,
  channelSlug,
}: UseSearchResultsParams) {
  return useQuery({
    queryKey: ["search", query, page, sort, model, channelSlug],
    queryFn: async (): Promise<SearchResponse> => {
      const params = new URLSearchParams({
        q: query,
        sort,
        limit: "20",
        page: String(page),
      });
      if (model) params.set("model", model);
      if (channelSlug) params.set("channel", channelSlug);
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: query.length > 0,
    staleTime: 30 * 1000,          // 30秒キャッシュ
    gcTime: 5 * 60 * 1000,         // 5分間 GC 保持
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev, // ページ切替時に前データを表示
  });
}
```

### 4.3 Layer 2: Upstash Redis サーバーサイドキャッシュ

人気クエリのキャッシュにより Supabase への pg_trgm クエリを削減する。

```typescript
// lib/search-cache.ts

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const SEARCH_CACHE_TTL = 60; // 60秒
const CACHE_PREFIX = "search:";

/**
 * 検索結果のキャッシュキー生成
 * クエリ + ソート + フィルタの組み合わせでユニークキーを生成
 */
function getCacheKey(query: string, sort: string, filters: Record<string, string>): string {
  const filterStr = Object.entries(filters)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join("|");
  return `${CACHE_PREFIX}${query.toLowerCase()}:${sort}:${filterStr}`;
}

/**
 * キャッシュから検索結果を取得（ヒットしない場合は null）
 */
export async function getSearchCache(
  query: string,
  sort: string,
  filters: Record<string, string>
): Promise<unknown | null> {
  try {
    const key = getCacheKey(query, sort, filters);
    return await redis.get(key);
  } catch {
    // Redis 障害時はキャッシュミスとして処理（可用性優先）
    console.error("[SearchCache] Redis error, skipping cache");
    return null;
  }
}

/**
 * 検索結果をキャッシュに保存
 */
export async function setSearchCache(
  query: string,
  sort: string,
  filters: Record<string, string>,
  data: unknown
): Promise<void> {
  try {
    const key = getCacheKey(query, sort, filters);
    await redis.set(key, JSON.stringify(data), { ex: SEARCH_CACHE_TTL });
  } catch {
    console.error("[SearchCache] Redis write error, skipping");
  }
}
```

### 4.4 キャッシュ効果の見積もり

| シナリオ | キャッシュヒット率（推定） | Supabase クエリ削減率 | 根拠 |
|---------|----------------------|-------------------|------|
| MVP初期（100 UU/月） | ~20% | ~20% | ユニーククエリが多い |
| 成長期（1,000 UU/月） | ~40% | ~40% | 人気クエリの重複増加 |
| 安定期（5,000 UU/月） | ~60% | ~60% | ロングテール分布で上位クエリが集中 |

**Redis コマンド消費（キャッシュ込み）**:
- 検索キャッシュ GET: 1コマンド/検索
- 検索キャッシュ SET: 1コマンド/キャッシュミス
- Rate Limiting: 2コマンド/検索（既存設計）
- 合計: 3-4コマンド/検索
- 1,000検索/日 x 4 = 4,000コマンド/日 -> **Upstash 無料枠（10,000/日）内**

---

## 5. デバウンス・スロットリングによる API 呼び出し最適化

### 5.1 オートコンプリートのデバウンス

ユーザーのキーストロークごとに API を呼び出すと、無駄なリクエストが大量に発生する。
デバウンスにより、タイピング停止後にのみリクエストを送信する。

```typescript
// hooks/useAutocomplete.ts

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

/**
 * デバウンスフック
 * 入力が 300ms 停止した後にのみ値を更新
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useAutocomplete(input: string) {
  // 300ms デバウンス
  const debouncedInput = useDebounce(input, 300);

  return useQuery({
    queryKey: ["autocomplete", debouncedInput],
    queryFn: async () => {
      const res = await fetch(
        `/api/search/autocomplete?q=${encodeURIComponent(debouncedInput)}`
      );
      return res.json();
    },
    enabled: debouncedInput.length >= 2, // 2文字以上で検索開始
    staleTime: 60 * 1000,               // 60秒キャッシュ
    refetchOnWindowFocus: false,
  });
}
```

### 5.2 デバウンスによるリクエスト削減効果

```
デバウンスなし:
  ユーザーが "landscape" と入力（9文字）
  -> 9 API リクエスト発生

デバウンス 300ms:
  ユーザーが "landscape" と入力（平均タイピング速度 200ms/文字）
  -> 1 API リクエスト発生（タイピング完了後）

削減率: ~89%
```

| デバウンス設定 | リクエスト削減率 | UX への影響 |
|-------------|--------------|-----------|
| 100ms | ~50% | レスポンシブだが削減効果が低い |
| **300ms** | **~89%** | **採用: 削減効果と UX のバランス最良** |
| 500ms | ~95% | 遅延感がありUXが低下 |

### 5.3 ページネーション UI

オフセットベースのページネーションコンポーネントで検索結果を切り替える。URL パラメータ（`page`）で状態を管理し、ブラウザバック・ブックマーク・共有に対応する。

```typescript
// components/search/SearchResultsClient.tsx

"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useSearchResults } from "@/hooks/useSearchResults";
import { VideoCard } from "@/components/video/VideoCard";
import { SearchResultsSkeleton } from "@/components/search/SearchResultsSkeleton";
import { Pagination } from "@/components/ui/pagination";

export function SearchResultsClient({
  query,
  sort,
  model,
  channelSlug,
}: SearchResultsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentPage = Number(searchParams.get("page") ?? "1");

  const { data, isLoading, isPlaceholderData } = useSearchResults({
    query,
    page: currentPage,
    sort,
    model,
    channelSlug,
  });

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  if (isLoading) return <SearchResultsSkeleton count={12} />;

  const videos = data?.videos ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 0;

  return (
    <>
      {/* 検索結果件数 */}
      <p className="text-sm text-text-secondary mb-4">
        {totalCount > 0
          ? `"${query}" の検索結果（${totalCount}件）`
          : `"${query}" に一致する動画が見つかりません`}
      </p>

      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        style={{ opacity: isPlaceholderData ? 0.7 : 1 }}
      >
        {videos.map((video, index) => (
          <VideoCard
            key={video.id}
            video={video}
            variant="grid"
            priority={index < 4}
          />
        ))}
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          className="mt-8"
        />
      )}
    </>
  );
}
```

---

