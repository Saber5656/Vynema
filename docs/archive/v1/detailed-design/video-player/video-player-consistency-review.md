# 動画再生ページ 技術整合性レビュー報告書

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: tech-leader
Task: #3

---

## 0. レビュー対象ドキュメント

| # | ドキュメント | 担当 | 略称 |
|---|------------|------|------|
| 1 | `video-player-data-design.md` | tech-leader | **DATA** |
| 2 | `video-player-performance-design.md` | analyzer | **PERF** |
| 3 | `video-player-uiux-improvements.md` | designer | **UIUX** |
| 4 | `home-data-design.md` | tech-leader | **HOME-DATA** |
| 5 | `home-performance-design.md` | tech-leader | **HOME-PERF** |
| 6 | `home-contrast-fix.md` | designer | **HOME-FIX** |
| 7 | `home-recommendation-source.md` | tech-leader | **HOME-REC** |
| 8 | `home-rate-limiting.md` | tech-leader | **HOME-RL** |

---

## 1. 重大な不整合（要修正）

### ISSUE-1: Quality Score のスケール不整合 [Critical]

**影響範囲**: DATA / UIUX / HOME-DATA

| ドキュメント | スケール | 参照箇所 |
|------------|---------|---------|
| HOME-DATA | **0-100** | `qualityScore Float?` コメント: "5軸複合スコア（0-100）" (L128) |
| DATA | **明示なし** | `qualityScore: number \| null` (L159), QualityDetails の各軸は 0-100 (L191-196) |
| UIUX | **0.0-5.0** | "Quality Score (0.0 - 5.0)" (L141), UI表示 "★ 4.8" (L67) |

**問題**: DB は 0-100 で保存するが、UI は 0.0-5.0 で表示する。変換ロジックが未定義。

**修正案**:
- DB: 0-100 のまま（HOME-DATA 準拠）
- API レスポンス: `qualityScore` は 0-100 の raw 値を返す
- UI 表示変換関数を定義:

```typescript
// lib/utils/quality-score.ts
/** DB値(0-100) → UI表示値(0.0-5.0) */
export function toDisplayScore(raw: number): number {
  return Math.round((raw / 20) * 10) / 10; // 例: 96 → 4.8
}
```

- DATA の `VideoDetailResponse` に補足コメントを追加
- UIUX に「DB値からの変換が必要」の注記を追加

---

### ISSUE-2: JSON-LD creator の @type 不整合 [Critical]

**影響範囲**: DATA / PERF

| ドキュメント | @type | name ソース | 参照箇所 |
|------------|-------|-----------|---------|
| DATA | `"Organization"` | `video.channel.name` | L1112-1143 |
| PERF | `"Person"` | `video.agent.name` | L193-213 |

**問題**: DATA は AIChannel モデル（DB 定義）に準拠して `Organization` + channel name を使用。PERF は `agent` という DB に存在しない概念を使用。

**修正案**:
- DATA を正とする（DB スキーマの AIChannel に対応）
- PERF の JSON-LD を以下に修正:

```typescript
creator: {
  "@type": "Organization",
  name: video.channel.name,
  url: `/channel/${video.channel.slug}`,
},
```

- PERF 内の `video.agent.name` 参照をすべて `video.channel.name` に統一

---

### ISSUE-3: コメントセクションのレンダリング方式の矛盾 [Critical]

**影響範囲**: DATA / PERF

| ドキュメント | 方式 | 参照箇所 |
|------------|------|---------|
| DATA | **Server Component + Suspense**（SSR で初回ロード） | L894: `<Suspense><CommentsSection videoId={id} userId={userId} /></Suspense>` |
| PERF | **Client Component + IntersectionObserver**（遅延読み込み） | L444-503: `useQuery({ enabled: shouldLoad })` + IntersectionObserver |

**問題**: DATA はコメントを SSR ストリーミングで取得し、PERF はクライアント側の IntersectionObserver で below-the-fold 時に初めてフェッチする。これらは根本的に異なるアーキテクチャ。

**修正案**: PERF の方式（クライアント遅延読み込み）を採用。理由:
1. コメントは below the fold であり、初期 SSR に含める必要がない
2. LCP/FCP の最適化に寄与する（初期 HTML サイズの削減）
3. 認証ユーザーの `isLiked` 状態取得があるため、クライアントフェッチの方が ISR キャッシュと相性が良い

DATA の page.tsx コードを修正:
```typescript
// CommentsSection は Client Component として実装
// Server Component の Suspense ではなく、Client の IntersectionObserver で遅延ロード
<CommentsSection videoId={id} />
// userId は Client Component 内で useAuth() から取得
```

---

### ISSUE-4: 関連動画 API レスポンス構造の不整合 [Critical]

**影響範囲**: DATA / PERF / UIUX

| ドキュメント | 構造 | 参照箇所 |
|------------|------|---------|
| DATA | **3セクション分離**: `{ upNext, sameModel, sameChannel }` | L443-458 |
| PERF | **フラットリスト**: `getRelatedVideos({videoId, agentId, categoryId, limit: 15})` | L556-596 |
| UIUX | **3セクション構成**: 「次に見る」「同じAIモデル」「AI Creator の他の動画」 | L562-575 |

**問題**: UIUX と DATA は3セクション分離で合意しているが、PERF はフラットリストを前提としている。

**修正案**: DATA の3セクション分離を正とする（UIUX の UI 設計に対応）。
- PERF の `RelatedVideos` Server Component を修正:

```typescript
// 修正前（PERF）
const relatedVideos = await getRelatedVideos({ videoId, agentId, categoryId, limit: 15 });

// 修正後（DATA準拠）
const relatedData = await getRelatedVideos(videoId);
// relatedData = { upNext: VideoCard[], sameModel: { modelName, videos }, sameChannel: { channelName, channelSlug, videos } }
```

- PERF の `RelatedVideoCard` の props から `video.agent` を `video.channel` に統一

---

### ISSUE-5: Comment モデルのフィールド名不整合 [Critical]

**影響範囲**: HOME-DATA / PERF

| ドキュメント | フィールド名 | 参照箇所 |
|------------|-----------|---------|
| HOME-DATA (Prisma スキーマ) | `body` | L226: `body String` |
| PERF (API Route コード) | `content` | L533: `select: { content: true }` |

**問題**: Prisma スキーマでは `Comment.body` だが、PERF のクエリコードでは `content` を select している。実行時エラーになる。

**修正案**: HOME-DATA の Prisma スキーマ（`body`）を正とする。PERF L533 を修正:
```typescript
select: {
  id: true,
  body: true,  // content → body に修正
  createdAt: true,
  user: { select: { id: true, name: true, imageUrl: true } },
},
```

---

## 2. 中程度の不整合（要調整）

### ISSUE-6: MuxPlayer import 方式の不一致 [Medium]

| ドキュメント | import 方式 | 参照箇所 |
|------------|-----------|---------|
| DATA | `import MuxPlayer from "@mux/mux-player-react"` | L952 |
| PERF | `import MuxPlayer from "@mux/mux-player-react/lazy"` | L241 |

**修正案**: PERF の `/lazy` import を採用（バンドルサイズ最適化）。DATA L952 を修正。

---

### ISSUE-7: MuxPlayer poster prop の欠落 [Medium]

| ドキュメント | poster 設定 | 参照箇所 |
|------------|-----------|---------|
| DATA | **なし** | L959-977: poster prop なし |
| PERF | **あり** | L260: `poster={...thumbnail.webp?time=5&width=1920}` |

**修正案**: PERF に準拠して poster を追加。LCP 最適化に必要。DATA の VideoPlayer コンポーネントに poster prop を追加。

---

### ISSUE-8: Suspense 境界設計の差異 [Medium]

| ドキュメント | Player+Metadata の Suspense | 参照箇所 |
|------------|-------------------------|---------|
| DATA | Suspense **なし**（直接レンダリング） | L879-891 |
| PERF | Suspense **あり**（VideoPlayerSection を Suspense で囲む） | L71-72 |

**問題**: DATA ではプレーヤーとメタデータを即座にレンダリング（`getVideoDetail` を page レベルで await）。PERF では Suspense 内で非同期取得。

**修正案**: 以下のハイブリッド方式を推奨:
- **メインデータ（Video + Channel）**: page レベルで await（DATA 方式） → OGP 生成に必要なため
- **コメント + 関連動画**: Suspense or Client 遅延（PERF 方式）

理由: `generateMetadata` で video データが必要なため、page レベルでの await は必須。Suspense で囲むとメタデータ生成が遅延する。

---

### ISSUE-9: OGP サムネイルサイズの不一致 [Medium]

| ドキュメント | サイズ | 参照箇所 |
|------------|-------|---------|
| DATA | `width=1200&height=630` | L839 |
| PERF | `width=1280&height=720` | L142 |

**修正案**: OGP 推奨サイズは 1200x630（1.91:1 比率）。DATA を正とする。
- ただし、動画は 16:9 なので `width=1200&height=675` がより正確
- Twitter player card 用には別途 1280x720 を使用するのは妥当

---

### ISSUE-10: Twitter Card player URL の欠落 [Medium]

| ドキュメント | player embed | 参照箇所 |
|------------|------------|---------|
| DATA | `/embed/${video.muxPlaybackId}` (playerUrl あり) | L851-856 |
| PERF | なし（images のみ） | L173-176 |

**修正案**: DATA の player embed 方式を採用。PERF に `players` 配列を追加。

---

### ISSUE-11: `modelDisplayNames` の重複定義 [Medium]

| ドキュメント | 定義箇所 |
|------------|---------|
| DATA | L523-528: `getRelatedVideos` 関数内 |
| HOME-REC | L264-269: `getModelPreferenceReasons` 関数内 |

**修正案**: 共通定数として一元化:

```typescript
// lib/constants/ai-models.ts
export const AI_MODEL_DISPLAY_NAMES: Record<string, string> = {
  "runway-gen4-turbo": "Runway Gen-4",
  "veo-3.1-fast": "Veo 3.1",
  "kling-ai": "Kling",
  "sora": "Sora",
};
```

両ドキュメントの該当箇所から参照に変更。

---

## 3. 軽微な不整合（確認事項）

### ISSUE-12: BigInt → number の変換 [Low]

HOME-DATA の `Video.viewCount` は `BigInt` 型だが、DATA の TypeScript インターフェース (`VideoDetail`) では `viewCount: number` となっている。JSON シリアライゼーション時に `BigInt` は直接変換できないため、API レスポンス生成時に `Number()` 変換が必要。

**確認事項**: MVP のデータ規模（〜数百万再生）では `Number.MAX_SAFE_INTEGER` を超えないため問題ないが、クエリ結果の型変換を明示的に行うこと。

---

### ISSUE-13: Rate Limiting 値の一貫性確認 [Low]

DATA と HOME-RL の Rate Limit 値を比較:

| エンドポイント | DATA | HOME-RL | 一致 |
|-------------|------|---------|:---:|
| `GET /api/videos/[id]` | 60 req/60s | 60 req/60s | ✅ |
| `GET /api/videos/[id]/comments` | 60 req/60s | （未定義） | — |
| `POST /api/videos/[id]/comments` | 5 req/60s | 5 req/60s | ✅ |
| `POST /api/videos/[id]/like` | 10 req/60s | 10 req/60s | ✅ |
| `POST /api/views` | 30 req/60s | 30 req/60s | ✅ |

**確認事項**: `GET /api/videos/[id]/comments` と `GET /api/videos/[id]/related` の Rate Limit を HOME-RL に追加定義する必要あり。

---

### ISSUE-14: text-tertiary 修正値の反映確認 [Low]

HOME-FIX で `text-tertiary` を `#7A8390` に修正済み。UIUX §8.2 で "text-tertiary = #7A8390 ← Task #1 修正値を使用" と記載あり。 → **整合性 OK**

---

### ISSUE-15: `preload` 方式の一貫性 [Low]

DATA と PERF の両方で `preload="metadata"` を設定。 → **整合性 OK**

---

## 4. ホーム画面設計との一貫性

### 4.1 一貫している項目

| 項目 | ホーム画面 | 動画再生ページ | 判定 |
|------|----------|-------------|:---:|
| ISR 戦略 | revalidate=60 | revalidate=3600 | ✅ 適切な差別化 |
| カーソルベース・ページネーション | 採用 | 採用（コメント） | ✅ |
| TanStack Query + 楽観的更新 | 採用 | 採用 | ✅ |
| Prisma `select` 最適化 | 採用 | 採用 | ✅ |
| N+1 回避パターン | ネスト select | ネスト select + バッチ取得 | ✅ |
| Mux サムネイル WebP | 採用 | 採用 | ✅ |
| Skeleton UI + CLS 防止 | aspect-video | aspect-video | ✅ |
| Rate Limiting | Upstash Sliding Window | 同一（HOME-RL 参照） | ✅ |
| Clerk 認証パターン | Webhook同期 + auth() | 同一 | ✅ |
| デザイントークン | HOME-FIX 修正済み | UIUX で反映済み | ✅ |

### 4.2 不一致の恐れがある項目

| 項目 | ホーム画面 | 動画再生ページ | 対応 |
|------|----------|-------------|------|
| VideoCard の型定義 | `VideoCard` (HOME-DATA §2.4) | `VideoCard` (DATA §3.7) | 同名だが微妙にフィールドが異なる。共通型を定義すべき |
| Quality Score スケール | 0-100 (DB) | 0-5 (UI 表示) | **ISSUE-1** で対応 |
| `videoCardSelect` 定義 | HOME-DATA §4.2 | DATA §3.7 (暗黙) | 共通化推奨 |

---

## 5. 修正優先度まとめ

| 優先度 | Issue | 概要 | 影響 |
|:-----:|:-----:|------|------|
| **P0** | ISSUE-1 | Quality Score スケール不整合 | UI表示が壊れる |
| **P0** | ISSUE-2 | JSON-LD creator @type 不整合 | SEO/構造化データが不正 |
| **P0** | ISSUE-3 | コメントのレンダリング方式矛盾 | アーキテクチャ決定が必要 |
| **P0** | ISSUE-4 | 関連動画レスポンス構造不整合 | API/UI が接続できない |
| **P0** | ISSUE-5 | Comment フィールド名（body vs content） | 実行時エラー |
| **P1** | ISSUE-6 | MuxPlayer import 方式 | パフォーマンス |
| **P1** | ISSUE-7 | MuxPlayer poster 欠落 | LCP 最適化 |
| **P1** | ISSUE-8 | Suspense 境界設計の差異 | アーキテクチャ統一 |
| **P1** | ISSUE-9 | OGP サムネイルサイズ | OGP 表示品質 |
| **P1** | ISSUE-10 | Twitter Card player URL | SNS シェア体験 |
| **P2** | ISSUE-11 | modelDisplayNames 重複 | コード品質 |
| **P2** | ISSUE-12 | BigInt → number 変換 | 型安全性 |
| **P2** | ISSUE-13 | Rate Limit 追加定義 | セキュリティ |

---

## 6. 推奨アクション

### 6.1 即時対応（P0）

1. **Quality Score 変換関数の定義** → tech-leader が DATA / UIUX に追記
2. **JSON-LD creator の統一** → analyzer が PERF を修正
3. **コメントセクションの方式決定** → tech-leader + analyzer で合意 → PERF 方式（Client遅延）を推奨
4. **関連動画 API の統一** → analyzer が PERF を DATA に合わせて修正
5. **Comment.body フィールド名修正** → analyzer が PERF を修正

### 6.2 次回設計サイクル（P1）

6. MuxPlayer の import / poster 統一 → DATA を PERF に合わせて修正
7. Suspense 境界の正式決定 → ハイブリッド方式を両ドキュメントに反映
8. OGP サイズの統一 → DATA 基準（1200x630）で PERF を修正
9. Twitter Card の統一 → DATA 基準で PERF に player embed を追加

### 6.3 実装フェーズで対応（P2）

10. `AI_MODEL_DISPLAY_NAMES` の共通定数化
11. BigInt 変換のユーティリティ追加
12. 動画再生ページ固有 API の Rate Limit を HOME-RL に追加

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成（8ドキュメント横断レビュー） | tech-leader |
