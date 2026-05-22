# テックリーダー スキル定義

## 役割
技術的な不安要素の解消、技術スタック選定、アーキテクチャ設計、DB設計、パフォーマンス最適化を担当する技術統括者。

---

## 1. 技術スタック調査の手法

### 調査の構造化パターン
技術スタック調査は以下のカテゴリで体系的に行う：
1. **フレームワーク**: Next.js App Router + TypeScript（確定済み）
2. **UIライブラリ**: shadcn/ui vs Chakra UI vs Radix UI
3. **動画インフラ**: Mux vs 自前(FFmpeg+R2) vs AWS MediaConvert
4. **AI動画生成**: Runway vs Sora vs Veo vs Kling（API成熟度・コスト比較）
5. **DB/ORM**: Prisma vs Drizzle + PostgreSQLホスティング
6. **認証**: Clerk vs NextAuth vs Supabase Auth
7. **ストレージ/CDN**: R2 vs S3 vs Bunny.net vs Mux
8. **デプロイ**: Vercel + Railway/Fly.io のハイブリッド

### 比較表の作成基準
各技術を以下の軸で比較する：
| 軸 | 重み（個人開発） |
|---|---|
| API成熟度・安定性 | 高 |
| コスト（無料枠含む） | 最高 |
| 開発工数・DX | 高 |
| ドキュメント・エコシステム | 中 |
| スケーラビリティ | 低（MVP段階） |
| ベンダーロックイン | 低（MVP段階） |

### サブエージェント活用の注意点（反省）
- 複数のサブエージェントを起動する場合、**調査範囲を明確に分割**すること
- 例: AI動画生成API調査 と 動画ストリーミング技術調査 は別エージェントに
- 同じ技術について異なる推奨が出る問題があった → サブエージェントの調査結果は統合・整理してからチームに報告すべき
- モデル名の混在（Gen-3 vs Gen-4等）が発生 → 最新情報を優先し、報告時に統一

---

## 2. DB設計（Prisma）のパターン

### スキーマ設計原則
1. **集計キャッシュフィールド**を積極的に使う（viewCount, likeCount等）→ COUNT クエリを回避
2. **カーソルベースページネーション**を採用（OFFSETはデータ量増加でパフォーマンス劣化）
3. **select による必要カラムのみ取得**（レスポンスサイズ約60%削減）
4. **複合インデックス**を適切に設計（ソート・フィルタ用）

### 動画プラットフォーム特有のスキーマパターン
```prisma
model Video {
  // 基本情報
  id, title, description, slug
  // AI生成メタデータ
  aiModel, aiPrompt, aiGenerationId
  // Mux統合
  muxAssetId, muxPlaybackId, muxThumbnailUrl
  // 集計キャッシュ（COUNTクエリ回避）
  viewCount, likeCount, dislikeCount, commentCount
  // Quality Score（MVP: 2軸簡易版）
  qualityScore Float?
  qualityDetails Json?
  // ムード分類
  moods String[]
  // ステータス管理
  status: PROCESSING | READY | PUBLISHED | HIDDEN
}
```

### Supabase + Prisma 接続設定
```
DATABASE_URL         = Supabase Pooler URL (アプリ用)
DIRECT_DATABASE_URL  = Supabase Direct URL (マイグレーション用)
```
この二重設定は初期セットアップ時に必ず必要。忘れるとマイグレーション失敗する。

### PostgreSQL GINインデックス（配列検索用）
Prismaの`@@index`ではGINインデックスを作れないため、カスタムマイグレーションが必要：
```sql
CREATE INDEX idx_video_moods ON "Video" USING GIN ("moods");
```

---

## 3. パフォーマンス設計パターン

### Next.js App Router レンダリング戦略
| ページ種別 | 戦略 | 理由 |
|-----------|------|------|
| ホーム | Streaming SSR + ISR(60秒) | 動的コンテンツだが頻繁な更新は不要 |
| 動画再生 | SSR（動的） | OGP/SEO対応必須 |
| 検索結果 | SSR（動的） | クエリパラメータ依存 |
| AIチャンネル | ISR(300秒) | 更新頻度低い |

### サムネイル最適化
- Mux Thumbnail API: `image.mux.com/{playbackId}/thumbnail.webp`
- next/image で最適化（自動WebP/AVIF変換、レスポンシブsizes）
- 最初の4枚は `priority` 属性でLCP最適化
- それ以外は `loading="lazy"` で遅延読み込み

### ホーム画面の並列データフェッチ
```typescript
const [hero, trending, topQuality, latest] = await Promise.all([
  getHeroVideo(),
  getTrendingVideos(10),
  getTopQualityVideos(10),
  getLatestVideos(20),
]);
```
逐次180ms → 並列50ms（約3.6倍高速化）

### キャッシュ戦略
- Server Component: ISR（revalidate=60秒）
- Client: TanStack Query（staleTime=1分、gcTime=5分）
- SSRデータをTanStack Queryにシード（二重フェッチ回避）

---

## 4. アーキテクチャ判断の記録

### Mux採用の決定理由
- FFmpegトランスコード + R2ストレージ + CDN設定が全て不要に
- Railwayワーカーの責務がAI生成ジョブのみに特化 → 大幅シンプル化
- Mux PlayerのReact統合（`@mux/mux-player-react`）が容易
- 移行パス: スケール時にR2+FFmpegへの移行は動画ストレージ層の差し替えのみ

### Clerk + Supabase の統合パターン
- Clerk Webhook → Next.js API Route → Prisma → Supabase User テーブル
- UserテーブルにclerkIdを保持し、Clerk Webhookで自動同期
- JWTにclerkIdを含め、APIリクエスト時にUser特定

### 人間アップロード防止の3層防御
1. AI生成パイプライン（Railwayワーカー）のみサービスAPIキーでMux Upload API呼び出し可能
2. フロントエンドからのアップロードエンドポイントを非公開
3. DB登録時に生成ジョブIDの参照整合性チェック

---

## 5. 反省点・改善案

1. **サブエージェントの調査結果の統一**: 複数サブエージェントが異なるモデル名（Gen-3/Gen-4）や異なるストレージ推奨（R2/Bunny.net/Mux）を出した → 報告前に統合・整理すべき
2. **技術選定の二転三転**: R2→Bunny.net→Muxと変遷 → 最初に選択肢を全て洗い出し、比較表で一括判断すべき
3. **DB設計のUI要件との同期不足**: UI/UX提案と同時並行でDB設計を行ったため、Quality ScoreやMoodsのフィールドが後から追加になった → UI要件を先に確認してからDB設計に着手する方が手戻りが少ない
4. **コスト試算を早期に**: パフォーマンス設計とは別に、コスト試算を初期段階で行うべき

### フェーズ2 振り返りからの追加ルール（2026-03-07）
5. **Single Source of Truth の明確化** — 共有データ（Mux Data custom フィールド、コスト定数等）は正規定義ファイルを1つ決め、他ドキュメントは参照コメントで紐づける
6. **外部API調査結果の着手前クロスチェック** — researcher の調査報告書のコスト値・API制約を、設計着手前に必ず突合する。差異がある場合は理由をコメントで明記
7. **DB設計とPerf設計の中間同期** — 並行作業時はジョブ構造・キュー設計・APIパスの3点について完成前に同期する
8. **1,000行超ドキュメントの分割** — 設計ドキュメントが1,000行を超えた場合、Prismaスキーマ/API定義/型定義/実装例をサブファイルに分離する
