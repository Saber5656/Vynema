# 検索機能: パフォーマンス設計（Rate Limiting・モニタリング）

> 元ファイル: [search-performance-design.md](search-performance-design.md) から分割（§6-11）

---

## 6. Rate Limiting 設計（検索 API 用）

### 6.1 既存設計との統合

home-rate-limiting.md 3.1 で `GET /api/search` は 30 req/60s（IP ベース）と定義済み。
検索固有の追加制限として、オートコンプリート API に独立した Rate Limiter を設置する。

### 6.2 エンドポイント別レート制限

| エンドポイント | レート制限 | 識別子 | 理由 |
|-------------|----------|--------|------|
| `GET /api/search` | 30 req/60s | IP | 既存定義（home-rate-limiting.md 3.1） |
| `GET /api/search` | 60 req/60s | userId（認証済み） | 認証ユーザーは緩和（3.3 準拠） |
| `GET /api/search/autocomplete` | 60 req/60s | IP | デバウンス後でも連続入力で頻繁に呼ばれる |

### 6.3 Rate Limiter 実装

```typescript
// lib/rate-limit.ts に追加

/**
 * オートコンプリート用 Rate Limiter
 * デバウンス（300ms）により実際のリクエスト頻度は低いが、
 * bot/スクレイピング対策として設定
 */
export const autocompleteRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "60 s"),
  analytics: true,
  prefix: "ratelimit:autocomplete",
});
```

### 6.4 API Route での適用

```typescript
// app/api/search/route.ts

import { type NextRequest } from "next/server";
import {
  readRateLimit,
  authReadRateLimit,
  checkRateLimit,
} from "@/lib/rate-limit";
import { searchVideos } from "@/lib/queries/search";
import { getSearchCache, setSearchCache } from "@/lib/search-cache";

export async function GET(request: NextRequest) {
  // Rate Limit チェック（既存の readRateLimit を使用）
  const rateLimitResponse = await checkRateLimit(
    readRateLimit,
    authReadRateLimit
  );
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 1) {
    return Response.json({ videos: [], page: 1, totalPages: 0, totalCount: 0 });
  }

  // クエリ長制限（パフォーマンス保護）
  if (query.length > 200) {
    return Response.json(
      { error: "Query too long" },
      { status: 400 }
    );
  }

  const sort = searchParams.get("sort") ?? "relevance";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  const model = searchParams.get("model") ?? undefined;
  const channelSlug = searchParams.get("channel") ?? undefined;

  const filters = {
    model: model ?? "",
    channel: channelSlug ?? "",
  };

  // Layer 2: Redis キャッシュチェック（1ページ目のみキャッシュ対象）
  if (page === 1) {
    const cached = await getSearchCache(query, sort, filters);
    if (cached) {
      return Response.json(cached, {
        headers: { "X-Cache": "HIT" },
      });
    }
  }

  // pg_trgm 検索クエリ実行
  const data = await searchVideos({
    query,
    page,
    limit,
    sort: sort as "relevance" | "newest" | "popular",
    model,
    channelSlug,
  });

  // Layer 2: Redis キャッシュ保存（1ページ目のみ）
  if (page === 1) {
    await setSearchCache(query, sort, filters, data);
  }

  return Response.json(data, {
    headers: { "X-Cache": "MISS" },
  });
}
```

```typescript
// app/api/search/autocomplete/route.ts

import { type NextRequest } from "next/server";
import { autocompleteRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(autocompleteRateLimit);
  if (rateLimitResponse) return rateLimitResponse;

  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return Response.json({ suggestions: [] });
  }

  // pg_trgm で類似タイトルを取得（上位5件）
  const suggestions = await prisma.$queryRaw`
    SELECT DISTINCT title, similarity(title, ${query}) AS sim
    FROM "Video"
    WHERE status = 'PUBLISHED'
      AND title % ${query}
    ORDER BY sim DESC
    LIMIT 5
  `;

  return Response.json({ suggestions });
}
```

---

## 7. Core Web Vitals への影響分析

### 7.1 目標値サマリー

| 指標 | 目標値 | Google基準 | 検索ページの LCP 要素 | 他ページとの差分 |
|------|--------|-----------|-------------------|--------------|
| **LCP** | **≤ 2.5秒** | ≤ 2.5秒 (Good) | 検索結果の最初のサムネイル画像 | ISR なし（dynamic）のため TTFB が増加 |
| **INP** | **≤ 200ms** | ≤ 200ms (Good) | 検索バー入力 / フィルタ選択 | デバウンスによりリアルタイム応答不要 |
| **CLS** | **≤ 0.1** | ≤ 0.1 (Good) | 検索結果の表示切替 | Skeleton で事前確保 |
| **TTFB** | **≤ 100ms** | ≤ 800ms (Good) | 静的シェル配信（CDN キャッシュ対象） | CSR のため TTFB は ISR ページと同等 |

### 7.2 LCP ボトルネック分析（目標 ≤ 2.5秒）

**LCP要素**: 検索結果グリッドの最初のサムネイル画像（CSR で取得後に表示）

```
フェーズ                                         時間見積もり
--------------------------------------------------------------
TTFB（静的シェル配信、CDN キャッシュ）            :  30 ~  80ms
HTML Parse + JS バンドル実行                      :  50 ~ 100ms
TanStack Query -> API リクエスト送信              :  10 ~  20ms
API レスポンス（pg_trgm + Redis キャッシュ）       :  45 ~ 100ms
React レンダリング（検索結果グリッド）              :  30 ~  50ms
サムネイル画像ダウンロード (WebP, Mux CDN)         : 150 ~ 400ms
画像デコード + レンダリング                        :  30 ~  50ms
--------------------------------------------------------------
合計                                             : 345ms ~ 800ms
                                                 -> LCP ≤ 2.5秒 達成可能
```

**CSR の利点**: 静的シェルを CDN から配信するため TTFB が ~50ms と高速（SSR dynamic の 100-400ms と比較）。
API リクエストの往復が追加されるが、pg_trgm クエリが高速（GIN インデックスで < 15ms）なため、
全体の LCP は SSR 方式とほぼ同等で 2.5 秒を十分達成可能。

### 7.3 INP ボトルネック分析（目標 ≤ 200ms）

| インタラクション | 処理内容 | 見積もり | 目標達成見込み |
|----------------|---------|---------|-------------|
| 検索バー入力 | state 更新のみ（デバウンスでAPI遅延） | ~10ms | OK |
| フィルタ選択 | URL params 更新 + TanStack Query キー変更 | ~60ms | OK |
| ソート切替 | URL params 更新 + 再フェッチ + Skeleton 表示 | ~80ms | OK |
| 検索実行（Enter/ボタン） | router.push + CSR 再フェッチ | ~50ms（UI 即反応） | OK |
| ページネーション操作 | URL params 更新 + 再フェッチ | ~50ms（前ページ表示維持） | OK |

### 7.4 CLS ボトルネック分析（目標 ≤ 0.1）

| シフト発生箇所 | シフト量（未対策） | 対策 | 対策後 |
|-------------|--------------|------|-------|
| 検索結果の表示（0件 -> N件） | 高 | `SearchResultsSkeleton` で事前確保 | ≈ 0 |
| フィルタバーの展開 | 低 | 固定高さまたは min-h 設定 | ≈ 0 |
| オートコンプリートドロップダウン | 低 | absolute 配置（フロー外） | ≈ 0 |
| サムネイル画像読み込み | 中 | `aspect-video` + Skeleton | ≈ 0 |

### 7.5 CLS 防止: Skeleton コンポーネント

```typescript
// components/search/SearchResultsSkeleton.tsx

import { Skeleton } from "@/components/ui/skeleton";

export function SearchResultsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div>
      {/* 検索結果件数プレースホルダー */}
      <Skeleton className="h-5 w-48 mb-4" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <div className="flex gap-3">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 8. コスト影響分析

### 8.1 検索機能固有のコスト要因

| コスト要因 | サービス | 単価 | 月間想定（MVP） | 月額 |
|-----------|---------|------|---------------|------|
| Supabase pg_trgm クエリ | Supabase Free | 無料（500MB DB） | ~3,000クエリ/月 | **$0** |
| Upstash Redis（キャッシュ + Rate Limit） | Upstash Free | 無料（10K/日） | ~4,000コマンド/日 | **$0** |
| Vercel Function 実行 | Vercel Hobby | 無料 | ~3,000回/月 | **$0** |
| サムネイル配信（検索結果） | Mux CDN + Vercel Image | 既存枠内 | ~10,000枚/月 | **$0** |

**追加コスト: $0。** 検索機能は既存の無料枠で完全に吸収可能。

### 8.2 Upstash Redis コマンド消費の合計見積もり（検索追加後）

| 用途 | コマンド/リクエスト | 日間リクエスト数 | 日間コマンド数 |
|------|-------------------|---------------|-------------|
| Rate Limiting（既存全API） | 2 | ~500 | ~1,000 |
| 検索 Rate Limiting | 2 | ~100 | ~200 |
| 検索キャッシュ GET | 1 | ~100 | ~100 |
| 検索キャッシュ SET | 1 | ~60（ミス時） | ~60 |
| オートコンプリート Rate Limiting | 2 | ~200 | ~400 |
| **合計** | — | — | **~1,760** |

**Upstash 無料枠（10,000コマンド/日）に対して余裕十分（使用率 ~18%）。**

### 8.3 Supabase DB 容量への影響

| 項目 | 追加容量 | 理由 |
|------|---------|------|
| GIN(trgm) インデックス: `idx_video_title_trgm` | ~150KB / 500動画 | title の trigram インデックス |
| GIN(trgm) インデックス: `idx_video_description_trgm` | ~300KB / 500動画 | description は title より長い |
| GIN(trgm) インデックス: `idx_channel_name_trgm` | ~10KB / 50チャンネル | チャンネル数は少ない |
| **合計** | **~460KB** | Supabase Free 500MB に対して十分 |

> **注**: pg_trgm は既存カラム（title, description, name）に直接 GIN インデックスを作成するため、FTS のような `search_vector` カラムの追加は不要。

### 8.4 月額コスト全体への影響

| シナリオ | 既存コスト（推定） | + 検索コスト | 合計 |
|---------|----------------|-----------|------|
| **最小構成**（月30本生成） | $20~$40 | **+$0** | **$20~$40** |
| **標準構成**（月100本生成） | $45~$75 | **+$0** | **$45~$75** |

### 8.5 スケーラビリティ限界点

| ボトルネック | 無料枠上限 | 到達予測 | 対策 |
|-----------|----------|---------|------|
| Supabase DB 500MB | 動画 ~5,000本 | 1-2年後 | Supabase Pro ($25/月) |
| Upstash 10,000コマンド/日 | ~2,500 検索/日 | トラフィック急増時 | Upstash Fixed ($10/月) |
| Vercel Hobby Function | 100GB 帯域/月 | 数万PV/月 | Vercel Pro ($20/月) |

**結論**: MVP 規模（500動画、1,000 UU/月）では全て無料枠内。月$50 制約に影響しない。

---

## 9. パフォーマンスモニタリング

### 9.1 検索固有の計測指標

| 指標 | 計測方法 | 目標値 | 確認頻度 |
|------|---------|-------|---------|
| 検索 API レスポンスタイム (p50/p95/p99) | Vercel Function ログ | p50≤100ms, p95≤300ms, p99≤500ms | 週次 |
| オートコンプリート API レスポンスタイム | Vercel Function ログ | ≤50ms | 週次 |
| Redis キャッシュヒット率 | `X-Cache` ヘッダー集計 | ≥30%（成長期以降） | 月次 |
| 検索結果 0件率 | カスタムログ | ≤30% | 月次 |
| LCP (検索ページ) | Vercel Speed Insights | ≤2.5秒 (P75) | 週次 |
| CLS (検索ページ) | Vercel Speed Insights | ≤0.1 (P75) | 週次 |

### 9.2 Vercel Speed Insights フィルタ設定

```
フィルタ: Path = "/search"  -> 検索ページの Core Web Vitals を独立計測
デバイス: Mobile / Desktop 別に確認
確認指標: LCP (P75), INP (P75), CLS (P75)
```

### 9.3 アラート・対応フロー

```
指標劣化検知
  |
  |-- 検索 API p95 > 500ms
  |    |-- PostgreSQL slow query log 確認
  |    |-- GIN インデックスの REINDEX 検討
  |    |-- Redis キャッシュ TTL 延長検討
  |
  |-- LCP > 4.0秒（検索結果表示遅延）
  |    |-- API レスポンスタイム確認（pg_trgm クエリの遅延？）
  |    |-- サムネイル配信の遅延確認
  |    |-- priority={true} の設定確認
  |
  |-- Redis コマンド消費 > 8,000/日
  |    |-- 検索キャッシュ TTL 延長（60秒 -> 300秒）
  |    |-- Upstash Fixed プラン検討
  |
  |-- 検索結果 0件率 > 50%
  |    |-- pg_trgm の類似度閾値調整（0.3 -> 0.2）
  |    |-- 検索対象フィールドの拡張検討
```

### 9.4 モニタリング構成（全て無料）

| 計測対象 | ツール | コスト | 確認頻度 |
|---------|--------|-------|---------|
| LCP / INP / CLS（検索ページ） | Vercel Speed Insights | 無料 (Hobby) | 週次 |
| API レスポンスタイム | Vercel Dashboard Functions | 無料 (Hobby) | 週次 |
| Redis キャッシュヒット率 | Upstash Dashboard | 無料 | 月次 |
| ページビュー | Vercel Analytics | 無料 (Hobby) | 月次 |
| エラートラッキング | Vercel ログ | 無料 (Hobby) | 即時（エラー時） |

---

## 10. 実装チェックリスト

### レスポンスタイム

- [ ] 検索 API p50 ≤ 100ms（Vercel Function ログで確認）
- [ ] 検索 API p95 ≤ 300ms
- [ ] オートコンプリート API ≤ 50ms

### インデックス

- [ ] pg_trgm 拡張が有効化されている（`CREATE EXTENSION IF NOT EXISTS pg_trgm`）
- [ ] `idx_video_title_trgm` GIN インデックスが作成されている
- [ ] `idx_video_description_trgm` GIN インデックスが作成されている
- [ ] `idx_channel_name_trgm` GIN インデックスが作成されている

### キャッシュ

- [ ] TanStack Query の staleTime=30秒 が設定されている
- [ ] Upstash Redis キャッシュ（TTL=60秒）が検索 API に実装されている
- [ ] Redis 障害時のフォールバック（キャッシュスキップ）が実装されている
- [ ] `X-Cache` ヘッダーでキャッシュヒット/ミスが判別可能

### デバウンス・スロットリング

- [ ] オートコンプリートにデバウンス 300ms が実装されている
- [ ] オートコンプリートは 2文字以上で発火する設定
- [ ] Pagination コンポーネントが URL params（`page`）で状態管理されている

### Rate Limiting

- [ ] `GET /api/search` に 30 req/60s（IP）/ 60 req/60s（認証済み）が設定されている
- [ ] `GET /api/search/autocomplete` に 60 req/60s が設定されている
- [ ] クエリ長制限（200文字）が実装されている

### Core Web Vitals

- [ ] **LCP ≤ 2.5秒**: 最初の4枚のサムネイルに `priority={true}` が設定されている
- [ ] **INP ≤ 200ms**: フィルタ・ソートが URL params で管理されている
- [ ] **CLS ≤ 0.1**: `SearchResultsSkeleton` でグリッドのスペースが事前確保されている
- [ ] 検索ページが CSR ベース（静的シェル + TanStack Query）で構成されている
- [ ] Vercel Speed Insights が有効になっている

### モニタリング

- [ ] Vercel Speed Insights で `/search` パスのフィルタが設定されている
- [ ] Upstash Dashboard でコマンド消費量を確認可能

---

## 11. 前ページとの差分まとめ

| 項目 | ホーム画面 | 動画再生ページ | チャンネルページ | 認証ページ | **検索ページ** |
|------|----------|-------------|--------------|----------|------------|
| レンダリング | ISR | ISR | ISR | 静的/force-dynamic | **CSR（静的シェル + TanStack Query）** |
| LCP 要素 | サムネイル(480px) | Player poster(1920px) | バナー画像(1200px) | Clerk フォーム | **検索結果サムネイル(480px)** |
| TTFB 目標 | ≤200ms | ≤200ms | ≤200ms | ≤200ms | **≤100ms（静的シェル CDN 配信）** |
| キャッシュ | ISR + CDN | ISR + CDN | ISR + CDN | 静的 | **CDN（シェル）+ Redis + TanStack Query** |
| Rate Limiting | 60 req/60s | 60 req/60s | 30 req/60s | Middleware | **30 req/60s + autocomplete 60 req/60s** |
| DB クエリ | Prisma findMany | Prisma findFirst | Prisma findMany | Webhook upsert | **$queryRaw pg_trgm** |
| ページネーション | — | — | — | — | **オフセットベース（Pagination コンポーネント）** |
| 追加コスト | -- | -- | +$0 | +$0 | **+$0** |
| 特記事項 | -- | Mux Data | Supabase Storage | Clerk JWT | **デバウンス 300ms, GIN(trgm) インデックス** |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成（Task #9） | analyzer |
| 2026-03-07 | 2.0 | レビュー指摘3件対応（Task #22）: SEARCH-ISSUE-1 FTS→pg_trgm / SEARCH-ISSUE-2 カーソル→オフセットページネーション / SEARCH-ISSUE-3 SSR→CSR | analyzer |
