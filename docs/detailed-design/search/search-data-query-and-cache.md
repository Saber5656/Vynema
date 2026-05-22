# 検索機能: クエリ・キャッシュ設計

> 元ファイル: [search-data-design.md](search-data-design.md) から分割（§6-9）

---

## 6. 検索クエリ設計

### 6.1 メイン検索クエリ

```typescript
// lib/queries/search.ts

import { Prisma } from "@prisma/client";

interface SearchParams {
  query: string;
  sort: "relevance" | "date" | "views" | "rating";
  duration: "any" | "short" | "medium" | "long";
  date: "any" | "today" | "week" | "month" | "year";
  model: string | null;
  categorySlug: string | null;
  mood: string | null;
  page: number;
  limit: number;
}

export async function searchVideos(params: SearchParams) {
  const { query, sort, duration, date, model, categorySlug, mood, page, limit } = params;
  const offset = (page - 1) * limit;
  const sanitizedQuery = query.trim();

  // pg_trgm の類似度閾値を設定（デフォルト 0.3 → 0.1 に緩和して再現率を向上）
  await prisma.$executeRaw`SELECT set_limit(0.1)`;

  // ── WHERE 条件の組み立て ──
  const conditions: Prisma.Sql[] = [
    Prisma.sql`v.status = 'PUBLISHED'`,
  ];

  // 検索条件（pg_trgm 類似 or ILIKE）
  if (sanitizedQuery.length >= 3) {
    conditions.push(Prisma.sql`(
      v.title % ${sanitizedQuery}
      OR c.name % ${sanitizedQuery}
      OR EXISTS (
        SELECT 1 FROM video_tags vt
        JOIN tags t ON t.id = vt.tag_id
        WHERE vt.video_id = v.id AND t.name % ${sanitizedQuery}
      )
      OR v.description % ${sanitizedQuery}
      OR v.ai_prompt % ${sanitizedQuery}
    )`);
  } else {
    // 短いクエリ: ILIKE フォールバック
    const likePattern = `%${sanitizedQuery}%`;
    conditions.push(Prisma.sql`(
      v.title ILIKE ${likePattern}
      OR c.name ILIKE ${likePattern}
      OR EXISTS (
        SELECT 1 FROM video_tags vt
        JOIN tags t ON t.id = vt.tag_id
        WHERE vt.video_id = v.id AND t.name ILIKE ${likePattern}
      )
      OR v.description ILIKE ${likePattern}
    )`);
  }

  // ── フィルタ条件 ──

  // 再生時間フィルタ
  if (duration === "short") {
    conditions.push(Prisma.sql`v.duration < 240`);          // < 4分
  } else if (duration === "medium") {
    conditions.push(Prisma.sql`v.duration >= 240 AND v.duration <= 1200`); // 4-20分
  } else if (duration === "long") {
    conditions.push(Prisma.sql`v.duration > 1200`);         // > 20分
  }

  // 日付フィルタ
  if (date === "today") {
    conditions.push(Prisma.sql`v.published_at >= NOW() - INTERVAL '1 day'`);
  } else if (date === "week") {
    conditions.push(Prisma.sql`v.published_at >= NOW() - INTERVAL '7 days'`);
  } else if (date === "month") {
    conditions.push(Prisma.sql`v.published_at >= NOW() - INTERVAL '30 days'`);
  } else if (date === "year") {
    conditions.push(Prisma.sql`v.published_at >= NOW() - INTERVAL '365 days'`);
  }

  // AIモデルフィルタ
  if (model) {
    conditions.push(Prisma.sql`v.ai_model = ${model}`);
  }

  // カテゴリフィルタ
  if (categorySlug) {
    conditions.push(Prisma.sql`cat.slug = ${categorySlug}`);
  }

  // ムードフィルタ
  if (mood) {
    conditions.push(Prisma.sql`${mood} = ANY(v.moods)`);
  }

  const whereClause = Prisma.join(conditions, " AND ");

  // ── ソート条件 ──
  let orderClause: Prisma.Sql;
  if (sort === "relevance" && sanitizedQuery.length >= 3) {
    // 重み付き類似度スコアでソート
    orderClause = Prisma.sql`(
      COALESCE(similarity(v.title, ${sanitizedQuery}), 0) * 1.0
      + COALESCE(similarity(c.name, ${sanitizedQuery}), 0) * 0.8
      + COALESCE(similarity(v.description, ${sanitizedQuery}), 0) * 0.5
      + COALESCE(similarity(v.ai_prompt, ${sanitizedQuery}), 0) * 0.3
    ) DESC, v.view_count DESC`;
  } else if (sort === "date") {
    orderClause = Prisma.sql`v.published_at DESC`;
  } else if (sort === "views") {
    orderClause = Prisma.sql`v.view_count DESC`;
  } else if (sort === "rating") {
    orderClause = Prisma.sql`v.quality_score DESC NULLS LAST`;
  } else {
    // relevance + 短いクエリ: viewCount フォールバック
    orderClause = Prisma.sql`v.view_count DESC`;
  }

  // ── メインクエリ ──
  const results = await prisma.$queryRaw<SearchResultRow[]>`
    SELECT
      v.id,
      v.title,
      v.description,
      v.mux_playback_id AS "muxPlaybackId",
      v.duration,
      v.view_count AS "viewCount",
      v.like_count AS "likeCount",
      v.dislike_count AS "dislikeCount",
      v.quality_score AS "qualityScore",
      v.moods,
      v.published_at AS "publishedAt",
      v.ai_model AS "aiModel",
      c.id AS "channelId",
      c.name AS "channelName",
      c.slug AS "channelSlug",
      c.avatar_url AS "channelAvatarUrl",
      cat.name AS "categoryName",
      cat.slug AS "categorySlug",
      ${sanitizedQuery.length >= 3
        ? Prisma.sql`(
            COALESCE(similarity(v.title, ${sanitizedQuery}), 0) * 1.0
            + COALESCE(similarity(c.name, ${sanitizedQuery}), 0) * 0.8
            + COALESCE(similarity(v.description, ${sanitizedQuery}), 0) * 0.5
            + COALESCE(similarity(v.ai_prompt, ${sanitizedQuery}), 0) * 0.3
          )`
        : Prisma.sql`1.0`
      } AS "relevanceScore"
    FROM videos v
    JOIN ai_channels c ON c.id = v.channel_id
    LEFT JOIN categories cat ON cat.id = v.category_id
    WHERE ${whereClause}
    ORDER BY ${orderClause}
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  // ── 件数カウント ──
  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM videos v
    JOIN ai_channels c ON c.id = v.channel_id
    LEFT JOIN categories cat ON cat.id = v.category_id
    WHERE ${whereClause}
  `;

  const totalCount = Number(countResult[0].count);
  const totalPages = Math.ceil(totalCount / limit);

  // ── タグの一括取得（N+1 回避）──
  const videoIds = results.map((r) => r.id);
  const videoTags = videoIds.length > 0
    ? await prisma.videoTag.findMany({
        where: { videoId: { in: videoIds } },
        select: {
          videoId: true,
          tag: { select: { name: true } },
        },
      })
    : [];

  const tagsByVideoId = new Map<string, { name: string }[]>();
  for (const vt of videoTags) {
    const existing = tagsByVideoId.get(vt.videoId) ?? [];
    existing.push({ name: vt.tag.name });
    tagsByVideoId.set(vt.videoId, existing);
  }

  // ── レスポンス整形 ──
  const formattedResults: SearchResult[] = results.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    muxPlaybackId: r.muxPlaybackId,
    duration: r.duration,
    viewCount: Number(r.viewCount),
    likeCount: r.likeCount,
    dislikeCount: r.dislikeCount,
    qualityScore: r.qualityScore,
    moods: r.moods,
    publishedAt: r.publishedAt.toISOString(),
    aiModel: r.aiModel,
    relevanceScore: Number(r.relevanceScore),
    channel: {
      id: r.channelId,
      name: r.channelName,
      slug: r.channelSlug,
      avatarUrl: r.channelAvatarUrl,
    },
    category: r.categoryName
      ? { name: r.categoryName, slug: r.categorySlug! }
      : null,
    tags: tagsByVideoId.get(r.id) ?? [],
  }));

  return {
    results: formattedResults,
    totalCount,
    page,
    totalPages,
    query: sanitizedQuery,
    filters: {
      sort: params.sort,
      duration: params.duration,
      date: params.date,
      model: params.model,
      categorySlug: params.categorySlug,
      mood: params.mood,
    },
  };
}
```

### 6.2 サジェストクエリ

```typescript
// lib/queries/search-suggest.ts

export async function getSearchSuggestions(
  query: string,
  userId: string | null,
  limit = 8
) {
  const sanitizedQuery = query.trim();
  const suggestions: SuggestItem[] = [];

  // 1. ユーザーの検索履歴からサジェスト（認証時のみ、最大3件）
  if (userId) {
    const histories = await prisma.searchHistory.findMany({
      where: {
        userId,
        query: { startsWith: sanitizedQuery, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      distinct: ["query"],
      select: { query: true },
    });

    for (const h of histories) {
      suggestions.push({ type: "history", text: h.query });
    }
  }

  const remaining = limit - suggestions.length;

  // 2. 動画タイトルからサジェスト（最大 remaining/2 件）
  const videoLimit = Math.ceil(remaining / 2);
  const videos = await prisma.video.findMany({
    where: {
      status: "PUBLISHED",
      title: { contains: sanitizedQuery, mode: "insensitive" },
    },
    orderBy: { viewCount: "desc" },
    take: videoLimit,
    select: {
      id: true,
      title: true,
      muxPlaybackId: true,
    },
  });

  for (const v of videos) {
    suggestions.push({
      type: "video",
      text: v.title,
      videoId: v.id,
      muxPlaybackId: v.muxPlaybackId,
    });
  }

  // 3. チャンネル名からサジェスト（残り枠）
  const channelLimit = limit - suggestions.length;
  if (channelLimit > 0) {
    const channels = await prisma.aIChannel.findMany({
      where: {
        isActive: true,
        name: { contains: sanitizedQuery, mode: "insensitive" },
      },
      orderBy: { subscriberCount: "desc" },
      take: channelLimit,
      select: {
        name: true,
        slug: true,
        avatarUrl: true,
      },
    });

    for (const ch of channels) {
      suggestions.push({
        type: "channel",
        text: ch.name,
        channelSlug: ch.slug,
        avatarUrl: ch.avatarUrl ?? undefined,
      });
    }
  }

  return { suggestions };
}
```

### 6.3 N+1 回避ポイント

| パターン | 問題 | 解決策 |
|---------|------|--------|
| 検索結果 + チャンネル | N+1 | `$queryRaw` で JOIN（§6.1） |
| 検索結果 + カテゴリ | N+1 | `$queryRaw` で LEFT JOIN（§6.1） |
| 検索結果 + タグ | N+1 | **バッチ取得**: 全 videoId で一括 `findMany`（§6.1） |
| サジェスト（履歴+動画+チャンネル） | 3クエリ | 逐次実行（各クエリが前の結果に依存するため） |

### 6.4 クエリパフォーマンス見積もり

| クエリ | 推定レイテンシ | 備考 |
|--------|:----------:|------|
| `searchVideos` (pg_trgm) | ~30-50ms | GIN インデックス利用、5,000レコード規模 |
| `searchVideos` (ILIKE) | ~20-30ms | 短いクエリ時、GIN インデックスが ILIKE も高速化 |
| `COUNT(*)` | ~10-20ms | 同一 WHERE 条件で件数取得 |
| タグバッチ取得 | ~5-10ms | IN 句、20件分 |
| `getSearchSuggestions` | ~15-25ms | 3クエリ逐次（各5-10ms） |
| **検索ページ合計** | **~50-80ms** | 検索 + COUNT + タグ |

---

## 7. 検索履歴の保存設計

### 7.1 保存タイミング

```
ユーザーが検索を実行（Enter or 検索ボタン押下）
    ↓
[GET /api/search?q=keyword]
    ├── 検索クエリ実行
    └── 検索履歴の非同期保存（レスポンスをブロックしない）
```

### 7.2 保存ロジック

```typescript
// lib/queries/search-history.ts

/**
 * 検索履歴を保存する。
 * - ログインユーザーのみ保存
 * - 同一クエリの連続保存を防止（直近5分以内の同一クエリはスキップ）
 * - ユーザーあたり最大100件まで保持（古いものから削除）
 */
export async function saveSearchHistory(
  userId: string,
  query: string,
  resultCount: number
) {
  const normalizedQuery = query.trim().toLowerCase();

  // 直近5分以内に同一クエリがあればスキップ
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recent = await prisma.searchHistory.findFirst({
    where: {
      userId,
      query: normalizedQuery,
      createdAt: { gte: fiveMinAgo },
    },
    select: { id: true },
  });

  if (recent) return;

  // 検索履歴を保存
  await prisma.searchHistory.create({
    data: {
      userId,
      query: normalizedQuery,
      resultCount,
    },
  });

  // 100件を超えた古い履歴を削除
  const count = await prisma.searchHistory.count({ where: { userId } });
  if (count > 100) {
    const oldest = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: count - 100,
      select: { id: true },
    });
    await prisma.searchHistory.deleteMany({
      where: { id: { in: oldest.map((o) => o.id) } },
    });
  }
}
```

### 7.3 検索履歴取得 API

```typescript
// GET /api/search/history

export async function getSearchHistory(userId: string, limit = 20) {
  return prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    distinct: ["query"],           // 重複クエリを除去
    select: {
      id: true,
      query: true,
      resultCount: true,
      createdAt: true,
    },
  });
}
```

---

## 8. 人気検索ワードの設計

### 8.1 集計方式

人気検索ワードは `SearchHistory` テーブルから定期バッチで `PopularSearch` テーブルに集計する。

```
[バッチ処理] 15分ごと（MVP では Vercel Cron Functions）
    ↓
SearchHistory から直近7日間のクエリを集計
    ↓
PopularSearch テーブルに upsert
    ↓
古い集計データを削除
```

### 8.2 集計バッチ

```typescript
// app/api/cron/popular-searches/route.ts

import { NextResponse } from "next/server";

// Vercel Cron: 15分ごと
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Cron 認証（Vercel Cron Secret）
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 直近7日間の検索クエリを集計
  const popular = await prisma.$queryRaw<{ query: string; count: bigint }[]>`
    SELECT query, COUNT(*) as count
    FROM search_histories
    WHERE created_at >= NOW() - INTERVAL '7 days'
    GROUP BY query
    HAVING COUNT(*) >= 3
    ORDER BY count DESC
    LIMIT 50
  `;

  // PopularSearch テーブルに upsert
  for (const item of popular) {
    await prisma.popularSearch.upsert({
      where: { query: item.query },
      update: {
        count: Number(item.count),
        period: "weekly",
      },
      create: {
        query: item.query,
        count: Number(item.count),
        period: "weekly",
      },
    });
  }

  // 集計結果に含まれなかったレコードを削除（検索されなくなったワード）
  const activeQueries = popular.map((p) => p.query);
  if (activeQueries.length > 0) {
    await prisma.popularSearch.deleteMany({
      where: {
        period: "weekly",
        query: { notIn: activeQueries },
      },
    });
  }

  return NextResponse.json({ updated: popular.length });
}
```

### 8.3 人気検索ワード取得 API

```typescript
// GET /api/search/popular

export async function getPopularSearches(limit = 10) {
  return prisma.popularSearch.findMany({
    where: { period: "weekly" },
    orderBy: { count: "desc" },
    take: limit,
    select: {
      query: true,
      count: true,
    },
  });
}
```

---

## 9. TanStack Query キャッシュ設計

### 9.1 クライアント側キャッシュ設定

```typescript
// hooks/useSearch.ts

import { useQuery, keepPreviousData } from "@tanstack/react-query";

export function useSearch(params: SearchParams) {
  return useQuery({
    queryKey: ["search", params],
    queryFn: () => fetchApi<SearchResponse>(`/api/search?${toSearchParams(params)}`),
    enabled: !!params.query,           // クエリが空なら実行しない
    staleTime: 60 * 1000,             // 1分間はキャッシュをfreshとみなす
    gcTime: 5 * 60 * 1000,            // 5分間キャッシュ保持
    placeholderData: keepPreviousData, // ページ遷移時に前のデータを維持
  });
}

// サジェスト（高頻度リクエスト → debounce + 短い staleTime）
export function useSearchSuggest(query: string) {
  return useQuery({
    queryKey: ["search-suggest", query],
    queryFn: () => fetchApi<SuggestResponse>(`/api/search/suggest?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 1,
    staleTime: 30 * 1000,             // 30秒
    gcTime: 60 * 1000,                // 1分
  });
}

// 人気検索ワード（低頻度更新 → 長い staleTime）
export function usePopularSearches() {
  return useQuery({
    queryKey: ["popular-searches"],
    queryFn: () => fetchApi<{ query: string; count: number }[]>("/api/search/popular"),
    staleTime: 5 * 60 * 1000,         // 5分
    gcTime: 10 * 60 * 1000,           // 10分
  });
}

// 検索履歴
export function useSearchHistory() {
  return useQuery({
    queryKey: ["search-history"],
    queryFn: () => fetchApi<SearchHistoryItem[]>("/api/search/history"),
    staleTime: 0,                      // 常に最新を取得
  });
}
```

### 9.2 debounce 設計（サジェスト）

```typescript
// hooks/useDebouncedValue.ts

import { useState, useEffect } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

// 使用例: SearchBar.tsx
function SearchBar() {
  const [input, setInput] = useState("");
  const debouncedQuery = useDebouncedValue(input, 300);
  const { data: suggestions } = useSearchSuggest(debouncedQuery);
  // ...
}
```

---

