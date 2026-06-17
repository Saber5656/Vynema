# 検索機能 詳細設計レビュー

## レビュー情報

| 項目 | 内容 |
|------|------|
| revision | REV-1 |
| 担当 | reviewer |
| 日付 | 2026-03-06 |
| レビュー対象 | `search-uiux-improvements.md` (Task #7), `search-data-design.md` (Task #8), `search-performance-design.md` (Task #9), `search-design-spec.md` (Task #10) |
| 比較参照 | `home-data-design.md`, `home-rate-limiting.md`, `video-player-data-design.md`, `channel-data-design.md`, `auth-data-design.md`, `home-design-spec.md`, `channel-design-spec.md` |

---

## 総合評価

| 項目 | 判定 |
|------|------|
| 総合評価 | **B+** |
| 着手判定 | **Conditional Go** |
| 判定理由 | 高優先度課題が **3件** 残存。ただし全て設計文書の修正で対応可能であり、アーキテクチャの根本変更は不要。高優先度課題を全件解決すれば **A-** に引き上げ可能 |

### 評価サマリ

| カテゴリ | 評価 | 要約 |
|---------|------|------|
| 1. ユーザーストーリー充足度 | A- | 検索・フィルタ・サジェスト・履歴の主要ストーリーを高品質にカバー。プロンプト検索タブのデータソースが未定義 |
| 2. 非機能要件 | B+ | パフォーマンス目標は現実的だが、検索エンジン方式の不整合が致命的 |
| 3. 4ファイル間整合性 | B | 検索エンジン（pg_trgm vs tsvector）、ページネーション方式、レンダリング方式で根本的な不一致あり |
| 4. セキュリティ | A- | SQLインジェクション対策・Rate Limiting・認可チェックは適切。軽微な改善余地あり |
| 5. 既存画面との整合性 | A- | デザイントークン・コンポーネント再利用は良好。Quality Score スケール統一済み |
| 6. 法的・倫理 | A | 検索機能に固有の法的リスクなし。検索履歴の GDPR 対応も考慮済み |

---

## よかった点

1. **AI Theater 固有の検索体験が秀逸**: AIモデル名・プロンプト・ムードによる検索は競合との明確な差別化。マッチ理由の表示（MatchReason コンポーネント）はプロンプト透明性の延長として自然。根拠: `search-uiux-improvements.md` §1.3, §7.1
2. **pg_trgm 選定の妥当性**: Supabase Free Tier で $0、日本語 N-gram 対応、GIN インデックスによる高速化。月額 $50 制約を完全に遵守。根拠: `search-data-design.md` §2.2
3. **N+1 回避設計**: メイン検索で JOIN、タグはバッチ取得。検索結果 50-80ms の見積もりは現実的。根拠: `search-data-design.md` §6.3
4. **デバウンス 300ms + 2段キャッシュ**: TanStack Query + Upstash Redis の2層キャッシュと 300ms デバウンスの組み合わせで、API 呼び出しを最大 89% 削減。根拠: `search-performance-design.md` §5.2
5. **デザイントークン完全継承**: `home-design-spec.md` のカラー・タイポグラフィ・スペーシングをそのまま継承し、検索固有の追加トークンなし。画面間の視覚的一貫性が確保されている。根拠: `search-design-spec.md` §1
6. **Zod バリデーションスキーマ**: 全クエリパラメータに型安全なバリデーションが定義済み。enum 制約により不正値を排除。根拠: `search-data-design.md` §11
7. **コスト影響 $0**: 検索機能の追加コストがゼロであることが明確に分析されており、Upstash コマンド消費の内訳（日間 1,760 / 無料枠 10,000）も具体的。根拠: `search-performance-design.md` §8
8. **検索履歴の重複防止・上限管理**: 5分以内の同一クエリスキップ + ユーザーあたり100件上限。ストレージ肥大化を防止。根拠: `search-data-design.md` §7.2

---

## 主要指摘

### 高優先度（着手前必須）

| 指摘ID | 概要 |
|--------|------|
| SEARCH-ISSUE-1 | 検索エンジン方式の不整合（pg_trgm vs tsvector） |
| SEARCH-ISSUE-2 | ページネーション方式の不整合（オフセット vs カーソル） |
| SEARCH-ISSUE-3 | レンダリング方式の不整合（CSR vs SSR） |

### 中優先度（開発中推奨）

| 指摘ID | 概要 |
|--------|------|
| SEARCH-ISSUE-4 | プロンプト検索タブの DB クエリ未定義 |
| SEARCH-ISSUE-5 | ソート選択肢の不一致（UI vs DB） |
| SEARCH-ISSUE-6 | サジェスト API エンドポイントの不一致 |
| SEARCH-ISSUE-7 | フィルタ項目の不一致（UI vs DB） |
| SEARCH-ISSUE-8 | 検索履歴の保存先の不一致（localStorage vs DB） |

### 低優先度（将来対応）

| 指摘ID | 概要 |
|--------|------|
| SEARCH-ISSUE-9 | チャンネル検索タブの DB クエリ未定義 |
| SEARCH-ISSUE-10 | オートコンプリート発火閾値の不一致 |

---

## 指摘詳細

### [SEARCH-ISSUE-1] 検索エンジン方式の根本的不整合（高）

**問題**: DB 設計（tech-leader）とパフォーマンス設計（analyzer）で、検索エンジンの方式が完全に異なる。

| 観点 | search-data-design.md (tech-leader) | search-performance-design.md (analyzer) |
|------|--------------------------------------|----------------------------------------|
| 主要方式 | **pg_trgm のみ** | **PostgreSQL FTS (tsvector/tsquery) + pg_trgm 補助** |
| インデックス | GIN (gin_trgm_ops) | GIN (tsvector) + GIN (gin_trgm_ops) |
| 検索カラム | 既存カラムに GIN インデックス追加 | `search_vector` GENERATED STORED カラム追加 |
| 重み付け | `similarity()` 関数で重み計算 | `setweight()` A/B/C/D で重み付け |
| テーブル名 | snake_case (`videos`, `ai_channels`) | PascalCase (`"Video"`, `"AIChannel"`) |
| 日本語対応 | pg_trgm の N-gram で部分一致 | tsvector は日本語未対応 → pg_trgm フォールバック |

**根拠**:
- `search-data-design.md:66-73` (pg_trgm 採用理由)
- `search-performance-design.md:149-165` (tsvector + GIN インデックス定義)
- `search-data-design.md:335-373` (pg_trgm GIN マイグレーション)
- `search-performance-design.md:149-187` (tsvector GENERATED STORED カラム)

**対応方針**: いずれか一方に統一する必要がある。推奨は **pg_trgm 方式に統一**（tech-leader 案）。理由:
1. AI Theater は日本語検索が必須 -- tsvector の `'english'` 辞書は日本語トークナイズに非対応
2. pg_trgm 単独で MVP の要件（部分一致 + 類似度ランキング + GIN 高速化）を満たす
3. `search_vector` GENERATED カラムの追加が不要になり、スキーマがシンプルに保てる
4. パフォーマンス設計の §3.3 でも結局 pg_trgm フォールバックを使っており、tsvector の実効的な価値が低い

**アクション**: analyzer がパフォーマンス設計の §3 を pg_trgm 方式に合わせて改訂する。テーブル名も Prisma `@@map` 準拠の snake_case に統一する。

---

### [SEARCH-ISSUE-2] ページネーション方式の不整合（高）

**問題**: DB 設計とパフォーマンス設計で、ページネーション方式が異なる。

| 観点 | search-data-design.md | search-performance-design.md |
|------|----------------------|----------------------------|
| 方式 | **オフセットベース** (page + limit) | **カーソルベース** (cursor + limit) |
| レスポンス | `totalCount`, `totalPages`, `page` | `nextCursor`, `hasMore` |
| UI | ページ番号ジャンプ対応 | 無限スクロール |
| 理由 | UI 設計で Pagination コンポーネント使用 | `useInfiniteQuery` + IntersectionObserver |

**根拠**:
- `search-data-design.md:180-192` (オフセットベースの理由と実装)
- `search-performance-design.md:283-294` (カーソルベースの searchVideos 実装)
- `search-performance-design.md:337-355` (useInfiniteQuery + cursor)
- `search-uiux-improvements.md:392-394` (Pagination コンポーネント表示)
- `search-design-spec.md` §5.1 (Pagination コンポーネント)

**対応方針**: UI/UX 設計と Figma スペックの双方が **ページ番号付きページネーション** を採用しているため、**オフセットベースに統一** する（tech-leader 案）。

理由:
1. UI ワイヤーフレームに `[< 前へ] [1] [2] [3] ... [42] [次へ >]` が明記されている
2. 検索結果は「ページ N を見る」UX が自然（YouTube/Google と同様）
3. `totalCount` / `totalPages` の表示が UI 要件
4. 無限スクロールはホーム画面のフィード向き、検索結果にはページネーションが適切

**アクション**: analyzer がパフォーマンス設計の §3.5, §4.2, §5.3 をオフセットベースに改訂する。`useInfiniteQuery` を `useQuery` + `keepPreviousData` に変更する。

---

### [SEARCH-ISSUE-3] レンダリング方式の不整合（高）

**問題**: DB 設計とパフォーマンス設計で、ページのレンダリング方式が異なる。

| 観点 | search-data-design.md | search-performance-design.md |
|------|----------------------|----------------------------|
| 方式 | **CSR**（`"use client"` ページ） | **SSR (Streaming)** + CSR |
| ページ構成 | Client Component が `useSearch()` で全データ取得 | Server Component + Suspense 境界 + Client hydration |
| 初期表示 | クライアントで検索実行 → ローディング → 表示 | サーバーで検索結果を含むHTMLをストリーミング |
| SEO | 不要と判断 | 考慮なし（dynamic） |

**根拠**:
- `search-data-design.md:31-38` (CSR の理由)
- `search-data-design.md:1008-1052` (use client ページ全体)
- `search-performance-design.md:46-89` (SSR Streaming + Suspense)

**対応方針**: どちらかに統一する。推奨は **CSR（tech-leader 案）** または **SSR + Client hydration のハイブリッド（analyzer 案）**。

CSR を推奨する理由:
1. 検索結果ページは SEO 不要（Google は `/search` をクロールしない）
2. `TanStack Query` でのクライアントキャッシュが有効に機能する
3. フィルタ変更・ソート変更のたびにサーバーラウンドトリップが不要
4. 実装がシンプル

SSR ハイブリッドの利点:
1. 初回表示の TTFB が速い（Skeleton ではなく実データ表示）
2. JavaScript 無効環境でも検索結果が表示される

**アクション**: project-manager が方針を決定し、採用されなかった側の設計を改訂する。

---

### [SEARCH-ISSUE-4] プロンプト検索タブの DB クエリ未定義（中）

**問題**: UI/UX 設計で3つの検索結果タブ（動画 / AIチャンネル / プロンプト）が定義されているが、DB 設計には「動画」タブの検索クエリしか実装されていない。「プロンプト」タブは `Video.aiPrompt` の全文検索が必要だが、専用の API エンドポイントもクエリも未定義。

**根拠**:
- `search-uiux-improvements.md:470-477` (3タブ構成の定義)
- `search-data-design.md:101-113` (API エンドポイント一覧 -- プロンプト検索なし)
- `search-design-spec.md` §5.2 (Tab 3: "プロンプト" + count badge)

**対応方針**:
1. `/api/search` に `tab` パラメータを追加し、タブごとに検索対象を切り替える
2. または MVP ではプロンプトタブを「動画」タブの結果をプロンプト表示形式に変えるだけにする（追加クエリ不要）

---

### [SEARCH-ISSUE-5] ソート選択肢の不一致（中）

**問題**: UI/UX 設計のソート選択肢と DB 設計のソート enum が一致していない。

| UI/UX (search-uiux-improvements.md §6.2) | DB (search-data-design.md §3.2) | Figma (search-design-spec.md §5.3) |
|-------------------------------------------|--------------------------------|-------------------------------------|
| 関連度 | relevance | 関連度 |
| Quality Score 高い順 | **rating** | Quality Score 高い順 |
| 再生数 多い順 | views | 再生数 多い順 |
| アップロード日 新しい順 | date | アップロード日 新しい順 |
| いいね率 高い順 | **(なし)** | いいね率 高い順 |

**根拠**:
- `search-uiux-improvements.md:603-608` (ソート5項目)
- `search-data-design.md:121` (sort enum: relevance / date / views / rating)
- `search-data-design.md:493-510` (ORDER BY 実装 -- rating は quality_score)
- `search-design-spec.md` §5.3 (Sort Select の5選択肢)

**不整合点**:
1. UI の「Quality Score 高い順」が DB の `rating` に対応するが名称が異なる
2. UI の「いいね率 高い順」が DB の sort enum に存在しない
3. DB の `sort` パラメータに `quality` がなく `rating` を使っている

**対応方針**: sort enum を `relevance | date | views | quality | likes` に統一し、UI ラベルとの対応表を明記する。`likes` のソートクエリ（`like_count / (like_count + dislike_count) DESC`）を DB 設計に追加する。

---

### [SEARCH-ISSUE-6] サジェスト API エンドポイントの不一致（中）

**問題**: サジェスト機能の API パスがドキュメント間で異なる。

| ドキュメント | エンドポイント |
|-------------|-------------|
| search-data-design.md §3.1 | `/api/search/suggest` |
| search-performance-design.md §5.1, §6.2 | `/api/search/autocomplete` |
| search-uiux-improvements.md §3.3 | `/api/search/suggest` |

**根拠**:
- `search-data-design.md:108` (`/api/search/suggest`)
- `search-performance-design.md:479` (`/api/search/autocomplete`)
- `search-performance-design.md:607,724` (`/api/search/autocomplete`)

**対応方針**: `/api/search/suggest` に統一する（tech-leader + designer の2ドキュメントが一致しているため）。パフォーマンス設計の `autocomplete` を `suggest` に置換する。

---

### [SEARCH-ISSUE-7] フィルタ項目の不一致（中）

**問題**: UI/UX 設計では6種類のフィルタを定義しているが、DB 設計のクエリパラメータにはそのうち一部しか実装されていない。

| フィルタ | UI/UX 定義 | DB パラメータ | DB クエリ実装 |
|---------|-----------|-------------|-------------|
| AIモデル | Multi-select | `model` (string) | `v.ai_model = ${model}` (単一値) |
| ムード | Multi-select | `mood` (string) | `${mood} = ANY(v.moods)` (単一値) |
| Quality Score | Range (4.0/3.0/すべて) | **(なし)** | **(なし)** |
| 再生時間 | Single-select | `duration` | 実装済み |
| アップロード日 | Single-select | `date` | 実装済み |
| カテゴリ | Single-select | `categorySlug` | 実装済み |

**根拠**:
- `search-uiux-improvements.md:517-524` (6フィルタ定義)
- `search-data-design.md:117-128` (クエリパラメータ -- Quality Score なし)
- `search-data-design.md:475-487` (フィルタ条件 -- model/mood は単一値)

**不整合点**:
1. AIモデル / ムードが UI では Multi-select だが、DB は単一値パラメータ
2. Quality Score フィルタが DB に未実装
3. URL パラメータの `quality` が Zod スキーマにも API パラメータにもない

**対応方針**:
1. `model` と `mood` を配列パラメータに変更（`model=runway&model=sora`）
2. `quality` パラメータ（`quality=4.0` / `quality=3.0`）を追加し、`WHERE v.quality_score >= ${quality * 20}` を実装（DB は 0-100 スケール）
3. Zod スキーマも合わせて更新

---

### [SEARCH-ISSUE-8] 検索履歴の保存先の不一致（中）

**問題**: UI/UX 設計では検索履歴を **localStorage** に保存する設計だが、DB 設計では **SearchHistory テーブル** に保存する設計になっている。

| 観点 | search-uiux-improvements.md | search-data-design.md |
|------|---------------------------|---------------------|
| 保存先 | localStorage | SearchHistory テーブル (DB) |
| 最大件数 | 10件 | 100件 |
| 認証要否 | 不要（ブラウザローカル） | 必須（userId 必須） |
| デバイス間同期 | なし | あり |
| API | なし | GET/DELETE `/api/search/history` |

**根拠**:
- `search-uiux-improvements.md:318-341` (localStorage ベースの useSearchHistory フック)
- `search-data-design.md:228-247` (SearchHistory Prisma モデル)
- `search-data-design.md:752-825` (DB 保存ロジック)

**対応方針**: 両方を活かすハイブリッド方式を推奨。
- **未認証ユーザー**: localStorage に保存（UI/UX 設計の方式）
- **認証済みユーザー**: DB に保存 + サジェストに使用（DB 設計の方式）
- サジェスト API は認証時のみ DB の履歴を参照し、未認証時は localStorage の履歴をクライアント側で表示

---

### [SEARCH-ISSUE-9] チャンネル検索タブの DB クエリ未定義（低）

**問題**: UI/UX 設計で「AIチャンネル」タブが定義されているが、DB 設計にチャンネル検索専用のクエリが未定義。メイン検索クエリ（§6.1）は `videos` テーブルを対象としており、`ai_channels` テーブルを直接検索するクエリがない。

**根拠**:
- `search-uiux-improvements.md:474-476` (AIチャンネルタブ)
- `search-data-design.md:394-625` (searchVideos クエリのみ)

**対応方針**: チャンネル検索用のクエリを追加するか、MVP ではチャンネルタブを動画検索結果から channel を集約して表示する方式にする。

---

### [SEARCH-ISSUE-10] オートコンプリート発火閾値の不一致（低）

**問題**: オートコンプリートの発火条件（最低入力文字数）がドキュメント間で異なる。

| ドキュメント | 発火閾値 |
|------------|---------|
| search-data-design.md §3.3 | 1文字以上 (`q: string min(1)`) |
| search-data-design.md §9.1 | 1文字以上 (`enabled: query.length >= 1`) |
| search-performance-design.md §5.1 | 2文字以上 (`enabled: debouncedInput.length >= 2`) |

**根拠**:
- `search-data-design.md:200` (suggestQuerySchema: min(1))
- `search-data-design.md:949` (useSearchSuggest: enabled query.length >= 1)
- `search-performance-design.md:484` (useAutocomplete: enabled >= 2)

**対応方針**: 日本語検索を考慮すると1文字でもサジェスト価値がある（漢字1文字でも意味がある）ため、**1文字以上** に統一する。

---

## クロスチェック結果

### UI <-> DB 整合性

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| 検索対象フィールド | OK | UI の5検索対象（タイトル/チャンネル名/タグ/説明/プロンプト）が DB クエリの WHERE 条件と一致 |
| フィルタ項目 | **NG** | SEARCH-ISSUE-7 参照。Quality Score フィルタ未実装、Multi-select 非対応 |
| ソート項目 | **NG** | SEARCH-ISSUE-5 参照。「いいね率」ソート未実装、`rating` vs `quality` 名称不一致 |
| レスポンス型 | OK | SearchResult 型のフィールドが UI 表示項目と一致 |
| ページネーション | **NG** | SEARCH-ISSUE-2 参照。オフセット vs カーソル |
| サジェスト型 | OK | SuggestItem 型が UI の4カテゴリ（履歴/動画/チャンネル/モデル）に対応 |
| URL パラメータ | 部分一致 | UI の `tab` パラメータが DB に未反映。`quality` パラメータ未実装 |

### UI <-> 技術スタック 整合性

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| shadcn/ui コンポーネント | OK | Tabs, Popover, Command, Sheet, Select, Skeleton -- 全て shadcn/ui で実現可能 |
| Tailwind CSS v4 | OK | デザイントークンが CSS 変数ベースで Tailwind v4 互換 |
| Mux サムネイル | OK | `image.mux.com/{id}/thumbnail.webp` 形式が Figma と DB の muxPlaybackId に対応 |
| レスポンシブブレークポイント | OK | mobile(<640) / tablet(640-1023) / desktop(1024+) が全ドキュメントで一致 |
| Next.js App Router | 部分一致 | SEARCH-ISSUE-3 参照。CSR vs SSR の方針未統一 |

### DB <-> パフォーマンス 整合性

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| 検索エンジン方式 | **NG** | SEARCH-ISSUE-1 参照。pg_trgm vs tsvector |
| インデックス設計 | **NG** | DB は gin_trgm_ops のみ、Perf は tsvector GIN + trgm GIN |
| キャッシュ戦略 | 部分一致 | DB: TanStack staleTime=60s / Perf: TanStack staleTime=30s |
| Rate Limiting | OK | 両方とも 30 req/60s (検索), 60 req/60s (サジェスト) |
| テーブル名 | **NG** | DB: snake_case (`videos`) / Perf: PascalCase (`"Video"`) -- Prisma @@map 準拠なら snake_case が正 |
| クエリパフォーマンス見積もり | 一致 | p50: 30-50ms (DB) vs <30ms (Perf, 5000本) -- 同等 |

### 全体 <-> コスト 整合性

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| Supabase Free Tier | OK | pg_trgm は追加コスト $0。GIN インデックス合計 ~15-35MB は 500MB 枠内 |
| Upstash Free Tier | OK | 日間 1,760 コマンド / 上限 10,000。使用率 18% で十分 |
| Vercel Hobby | OK | 検索 API は Function 実行回数に含まれるが、~3,000回/月は無料枠内 |
| 合計追加コスト | OK | **$0** -- 既存無料枠で完全吸収 |

### 全体 <-> 要件 整合性

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| NFR-P03（検索結果1秒以内） | OK | API p99 <= 500ms + UI 描画 <= 500ms = 1秒以内 |
| WCAG AA コントラスト | OK | `#7A8390` placeholder (MEMORY.md #8 準拠)、`#8B7CF8` テキスト on `#0D1117` = 5.71:1 |
| JSON-LD creator @type | N/A | 検索結果ページには JSON-LD 不要（SEO 対象外） |
| コメント body 統一 | N/A | 検索機能にコメントなし |

### 既存画面整合性チェック（MEMORY.md チェックポイント準拠）

| # | チェックポイント | 結果 | 備考 |
|---|---------------|------|------|
| 1 | Quality Score スケール（DB:0-100 / UI:0.0-5.0） | OK | 検索結果の `qualityScore` は DB値(0-100)で返却。UI 表示時に `toDisplayScore()` で変換する設計が既存画面と一致 |
| 2 | コメントフィールド名 `body` | N/A | 検索機能にコメントなし |
| 3 | JSON-LD creator @type = Organization | N/A | 検索結果ページに JSON-LD なし |
| 4 | MuxPlayer import | N/A | 検索結果ページに MuxPlayer なし |
| 5 | コンポーネント名 単数/複数形 | OK | `SearchHistory`(単数), `PopularSearch`(単数) -- 既存の `Subscription`, `Comment` と統一 |
| 6 | Mux Data custom_1..3 | N/A | 検索結果ページに Mux Data なし |
| 7 | レイアウト方式（タブUI） | OK | SearchResultTabs で動画/チャンネル/プロンプトのタブ切替。既存の Progressive Disclosure パターンと一致 |
| 8 | カラー値 #7A8390（WCAG AA 準拠） | OK | SearchBar placeholder に `#7A8390` を使用。WCAG AA 4.5:1 準拠 |

---

## セキュリティチェック

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| SQL インジェクション | **PASS** | Prisma `$queryRaw` テンプレートリテラルで自動パラメータ化。`$queryRawUnsafe` は使用していない |
| XSS（検索クエリ表示） | **PASS** | React の JSX 自動エスケープにより `{query}` 表示は安全。`dangerouslySetInnerHTML` の使用なし |
| 入力バリデーション | **PASS** | Zod スキーマで全パラメータをバリデーション。`q` は 1-100 文字制限 |
| Rate Limiting | **PASS** | 全検索エンドポイントに Upstash Rate Limiting 設定済み |
| 認可チェック | **PASS** | 検索・サジェスト・人気ワードは公開。履歴取得/削除は Clerk 認証必須 + 本人データのみ |
| Cron エンドポイント保護 | **PASS** | `/api/cron/popular-searches` は `CRON_SECRET` Bearer トークンで保護 |
| クエリ長制限 | **PASS** | パフォーマンス設計で 200 文字制限あり（DoS 防止）。ただし Zod は 100 文字 -- **100 文字に統一推奨** |
| ReDoS | **PASS** | 正規表現パターンの使用なし。pg_trgm は固定アルゴリズム |

---

## アクセシビリティチェック

| チェック項目 | 結果 | 備考 |
|------------|------|------|
| キーボードナビゲーション | OK | `/`, `Ctrl+K`, `Escape`, `Enter`, 矢印キーが定義済み |
| focus-visible | OK | SearchBar, TabsTrigger, VideoSearchResultCard に `outline: 2px solid #8B7CF8` |
| ARIA ロール | 部分的 | SearchSuggestionPanel に `role="listbox"`, SuggestionItem に `role="option"` が推奨だが未明記 |
| スクリーンリーダー | 部分的 | 検索結果件数の `aria-live="polite"` アナウンスが未定義 |
| コントラスト比 | OK | 全テキスト要素が WCAG AA 4.5:1 以上 |
| touch target | OK | モバイルのタッチターゲットは最小 40px (SearchBar), 32px (FilterDropdown) |

---

## Go/No-Go 判定

### 判定: **Conditional Go**

高優先度課題 3件（SEARCH-ISSUE-1, 2, 3）は全てドキュメント間の方針不一致であり、いずれか一方に統一するだけで解決できる。アーキテクチャの根本変更や技術スタックの入れ替えは不要。

### 条件

以下を満たした場合、MVP 実装着手を許可する:

1. **SEARCH-ISSUE-1**: 検索エンジン方式を pg_trgm に統一（パフォーマンス設計の改訂）
2. **SEARCH-ISSUE-2**: ページネーション方式をオフセットベースに統一（パフォーマンス設計の改訂）
3. **SEARCH-ISSUE-3**: レンダリング方式を CSR または SSR に統一（project-manager 決定 + 改訂）

### 条件達成後の期待評価: **A-**

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成（Task #11） | reviewer |
