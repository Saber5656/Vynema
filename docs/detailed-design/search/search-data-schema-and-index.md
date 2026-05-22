# 検索機能: スキーマ・インデックス設計

> 元ファイル: [search-data-design.md](search-data-design.md) から分割（§1-5）

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: tech-leader
Task: #8

---

## 1. 検索機能の概要

### 1.1 ページURL

```
/search?q=keyword&sort=relevance&duration=any&date=any&model=any&category=any&page=1
```

### 1.2 検索対象と優先度

| 対象 | テーブル.カラム | 優先度 | 重み | 理由 |
|------|---------------|:------:|:----:|------|
| 動画タイトル | `Video.title` | P0 | 1.0 | 最も重要な検索対象 |
| チャンネル名 | `AIChannel.name` | P0 | 0.8 | チャンネル検索ニーズ |
| タグ | `Tag.name` | P0 | 0.7 | 分類ベースの検索 |
| 動画説明文 | `Video.description` | P1 | 0.5 | 補助的なマッチング |
| 生成プロンプト | `Video.aiPrompt` | P1 | 0.3 | AI Theater 固有の検索（差別化） |

### 1.3 レンダリング戦略

```
検索結果ページ: CSR（Client-Side Rendering）

理由:
- 検索クエリはユーザー入力に依存 → SSR/ISR のキャッシュ効率が低い
- URL パラメータによる動的ルーティング
- TanStack Query でクライアントキャッシュ + 楽観的 UI
- SEO は検索結果ページでは不要（Google は /search をクロールしない）
```

### 1.4 ユーザーストーリー対応

| ユーザーストーリー | 設計箇所 |
|------------------|---------|
| キーワードで動画を検索 | §3.1 検索 API |
| フィルタで絞り込み（AIモデル・カテゴリ等） | §3.2 フィルタパラメータ |
| 検索候補のサジェスト | §5 サジェスト設計 |
| 人気検索ワードの表示 | §6 人気検索ワード |
| 検索履歴の表示・削除 | §4 検索履歴モデル |

---

## 2. 全文検索エンジンの選定

### 2.1 候補比較

| 方式 | 日本語対応 | Supabase 対応 | コスト | 実装難易度 | 検索精度 |
|------|:--------:|:----------:|:-----:|:--------:|:------:|
| `ILIKE` (現状) | △ 部分一致のみ | ○ | $0 | 低 | 低 |
| **`pg_trgm`** | **○ N-gram分割** | **○ 標準拡張** | **$0** | **中** | **中** |
| PostgreSQL FTS (`tsvector`) | × 日本語未対応 | ○ | $0 | 中 | 高（英語） |
| `pgroonga` | ◎ 最高 | × 未提供 | - | - | - |
| Meilisearch / Typesense | ◎ | △ 別サービス | $10+/月 | 高 | 高 |

### 2.2 選定: pg_trgm

**`pg_trgm`（トライグラム）を採用する。**

理由:
1. **Supabase Free Tier で利用可能**: `CREATE EXTENSION pg_trgm;` で有効化
2. **日本語対応**: N-gram（3文字単位）分割により日本語の部分一致検索が可能
3. **コスト $0**: 外部検索サービス不要で月額予算に影響なし
4. **GIN インデックス対応**: `gin_trgm_ops` で高速な類似検索が可能
5. **類似度スコア**: `similarity()` 関数で関連度ランキングが実現可能
6. **ILIKE 高速化**: GIN インデックスにより `ILIKE '%keyword%'` も高速化される

制約:
- 1-2文字の検索ワードでは精度が低い（トライグラム = 3文字単位）→ §2.3 で対策
- 形態素解析ベースの検索（「走る」→「走った」等）は未対応 → MVP では許容

### 2.3 短いクエリへの対策

| クエリ長 | 方式 | 理由 |
|---------|------|------|
| 1文字 | `ILIKE '%x%'` フォールバック | pg_trgm は3文字未満で精度低下 |
| 2文字 | `ILIKE '%xx%'` フォールバック | 同上 |
| 3文字以上 | `pg_trgm` 類似検索 | トライグラムが有効に機能 |

```typescript
function buildSearchCondition(query: string) {
  if (query.length < 3) {
    // 短いクエリ: ILIKE フォールバック
    return Prisma.sql`title ILIKE ${'%' + query + '%'}`;
  }
  // 3文字以上: pg_trgm 類似検索
  return Prisma.sql`title % ${query}`;
}
```

---

## 3. API エンドポイント設計

### 3.1 エンドポイント一覧

| メソッド | パス | 説明 | 認証 | Rate Limit |
|---------|------|------|:----:|-----------|
| GET | `/api/search` | 動画検索 | 不要 | 30 req/60s |
| GET | `/api/search/suggest` | サジェスト候補 | 不要 | 60 req/60s |
| GET | `/api/search/popular` | 人気検索ワード | 不要 | 10 req/60s |
| GET | `/api/search/history` | 検索履歴取得 | 必須 | 30 req/60s |
| DELETE | `/api/search/history` | 検索履歴全削除 | 必須 | 5 req/60s |
| DELETE | `/api/search/history/[id]` | 検索履歴個別削除 | 必須 | 10 req/60s |

### 3.2 検索 API: `GET /api/search`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `q` | string | - | 検索キーワード（必須、1-100文字） |
| `sort` | enum | "relevance" | ソート: relevance / date / views / rating |
| `duration` | enum | "any" | 再生時間: any / short(<4min) / medium(4-20min) / long(>20min) |
| `date` | enum | "any" | 日付: any / today / week / month / year |
| `model` | string | - | AIモデル絞り込み（例: "runway-gen4-turbo"） |
| `categorySlug` | string | - | カテゴリ絞り込み |
| `mood` | string | - | ムード絞り込み（例: "calm"） |
| `page` | number | 1 | ページ番号（1始まり） |
| `limit` | number | 20 | 取得件数（最大50） |

**レスポンス型:**

```typescript
interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  totalPages: number;
  query: string;
  filters: AppliedFilters;
}

interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  muxPlaybackId: string;
  duration: number | null;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  qualityScore: number | null;
  moods: string[];
  publishedAt: string;       // ISO 8601
  aiModel: string;
  // pg_trgm 類似度スコア（0.0-1.0）
  relevanceScore: number;
  channel: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
  category: {
    name: string;
    slug: string;
  } | null;
  tags: { name: string }[];
}

interface AppliedFilters {
  sort: "relevance" | "date" | "views" | "rating";
  duration: "any" | "short" | "medium" | "long";
  date: "any" | "today" | "week" | "month" | "year";
  model: string | null;
  categorySlug: string | null;
  mood: string | null;
}
```

**ページネーション方式: オフセットベース**

検索結果ではオフセットベースのページネーションを採用する（ホーム画面のカーソルベースとは異なる）。

理由:
- ページ番号ジャンプが必要（UI 設計 §2.3 で Pagination コンポーネントを使用）
- 検索結果は static なデータ（リアルタイム追加による重複/欠落の心配が少ない）
- `totalCount` + `totalPages` の表示が必要

```typescript
// オフセット計算
const offset = (page - 1) * limit;
```

### 3.3 サジェスト API: `GET /api/search/suggest`

**クエリパラメータ:**

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `q` | string | - | 入力中のテキスト（必須、1-50文字） |
| `limit` | number | 8 | 候補数（最大10） |

**レスポンス型:**

```typescript
interface SuggestResponse {
  suggestions: SuggestItem[];
}

interface SuggestItem {
  type: "video" | "channel" | "history";
  text: string;                          // 表示テキスト
  // video の場合
  videoId?: string;
  muxPlaybackId?: string;
  // channel の場合
  channelSlug?: string;
  avatarUrl?: string;
}
```

---

## 4. Prisma スキーマ拡張

### 4.1 SearchHistory（検索履歴）

```prisma
// =============================================
// SearchHistory（検索履歴）
// =============================================
model SearchHistory {
  id        String   @id @default(cuid())

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  query     String                        // 検索キーワード
  resultCount Int    @default(0)          // 検索結果件数

  createdAt DateTime @default(now())

  @@index([userId, createdAt])            // ユーザー別の検索履歴取得
  @@index([query, createdAt])             // 人気検索ワード集計用
  @@map("search_histories")
}
```

### 4.2 PopularSearch（人気検索ワード集計キャッシュ）

```prisma
// =============================================
// PopularSearch（人気検索ワード - 集計キャッシュ）
// =============================================
model PopularSearch {
  id        String   @id @default(cuid())

  query     String   @unique              // 検索キーワード（正規化済み）
  count     Int      @default(0)          // 集計期間内の検索回数
  period    String   @default("weekly")   // 集計期間: "daily" | "weekly"

  updatedAt DateTime @updatedAt

  @@index([period, count])                // 期間別人気順取得
  @@map("popular_searches")
}
```

### 4.3 既存モデルへの追加リレーション

```prisma
// User モデルに追加
model User {
  // ... 既存フィールド（auth-data-design.md 準拠）
  searchHistories SearchHistory[]
}
```

### 4.4 ER図（検索機能関連）

```
User
  └── 1:N → SearchHistory
               ├── query (検索キーワード)
               ├── resultCount
               └── createdAt

PopularSearch（独立テーブル - バッチ更新）
  ├── query (正規化済みキーワード)
  ├── count (集計回数)
  └── period ("daily" | "weekly")

Video (既存)
  ├── title          ← 検索対象（重み 1.0）
  ├── description    ← 検索対象（重み 0.5）
  ├── aiPrompt       ← 検索対象（重み 0.3）
  ├── aiModel        ← フィルタ対象
  ├── duration       ← フィルタ対象
  ├── moods[]        ← フィルタ対象
  ├── N:1 → AIChannel
  │         └── name ← 検索対象（重み 0.8）
  ├── N:1 → Category
  │         └── slug ← フィルタ対象
  └── M:N → Tag
            └── name ← 検索対象（重み 0.7）
```

---

## 5. 検索インデックス設計

### 5.1 pg_trgm 拡張の有効化

```sql
-- Supabase SQL Editor または カスタムマイグレーション
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 5.2 GIN インデックス一覧

| テーブル | カラム | インデックス種別 | 用途 |
|---------|--------|:-------------:|------|
| `videos` | `title` | GIN (gin_trgm_ops) | タイトル検索 |
| `videos` | `description` | GIN (gin_trgm_ops) | 説明文検索 |
| `videos` | `ai_prompt` | GIN (gin_trgm_ops) | プロンプト検索 |
| `videos` | `ai_model` | B-tree | AIモデルフィルタ |
| `ai_channels` | `name` | GIN (gin_trgm_ops) | チャンネル名検索 |
| `tags` | `name` | GIN (gin_trgm_ops) | タグ検索 |
| `search_histories` | `(userId, createdAt)` | B-tree | 検索履歴取得 |
| `search_histories` | `(query, createdAt)` | B-tree | 人気ワード集計 |
| `popular_searches` | `(period, count)` | B-tree | 人気順取得 |

### 5.3 カスタムマイグレーション

```sql
-- prisma/migrations/xxx_add_search_indexes/migration.sql

-- pg_trgm 拡張の有効化
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 動画テーブルの検索インデックス
CREATE INDEX idx_videos_title_trgm
  ON videos USING gin (title gin_trgm_ops);

CREATE INDEX idx_videos_description_trgm
  ON videos USING gin (description gin_trgm_ops);

CREATE INDEX idx_videos_ai_prompt_trgm
  ON videos USING gin (ai_prompt gin_trgm_ops);

-- AIチャンネルの検索インデックス
CREATE INDEX idx_ai_channels_name_trgm
  ON ai_channels USING gin (name gin_trgm_ops);

-- タグの検索インデックス
CREATE INDEX idx_tags_name_trgm
  ON tags USING gin (name gin_trgm_ops);

-- 検索用の複合インデックス（フィルタ + ソート最適化）
CREATE INDEX idx_videos_search_published
  ON videos (status, published_at DESC)
  WHERE status = 'PUBLISHED';

-- AIモデルフィルタ用（pg_trgm ではなく B-tree で十分）
CREATE INDEX idx_videos_ai_model
  ON videos (ai_model)
  WHERE status = 'PUBLISHED';

-- 再生時間フィルタ用
CREATE INDEX idx_videos_duration
  ON videos (duration)
  WHERE status = 'PUBLISHED';
```

### 5.4 インデックスサイズの見積もり

MVP 想定データ量（最初の6ヶ月）:

| テーブル | レコード数 | pg_trgm GIN 推定サイズ | 備考 |
|---------|:--------:|:-------------------:|------|
| `videos.title` | 1,000-5,000 | ~2-5 MB | 短いテキスト |
| `videos.description` | 1,000-5,000 | ~5-15 MB | 中程度のテキスト |
| `videos.ai_prompt` | 1,000-5,000 | ~3-10 MB | 中程度のテキスト |
| `ai_channels.name` | 10-50 | < 1 MB | 非常に少ない |
| `tags.name` | 50-200 | < 1 MB | 短いテキスト |
| **合計** | | **~15-35 MB** | Supabase 500MB 枠内で十分 |

---

