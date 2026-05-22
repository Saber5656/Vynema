# AIチャンネルページ 詳細設計レビュー（レビュー1: 設計間整合性）

- 対象:
  - `docs/detailed-design/channel/channel-uiux-improvements.md`
  - `docs/detailed-design/channel/channel-data-design.md`
  - `docs/detailed-design/channel/channel-performance-design.md`
- レビュー担当: quality-control-manager
- レビュー日: 2026-02-27
- レビュー種別: 設計間整合性レビュー

## 総合評価

**評価: B+**

判定理由:
- 必須修正（高優先度）が6件あり、3ファイル間で実装インターフェースの不一致が複数存在。
- 特に URL/API/コンポーネント命名の不整合、ISR と認証状態の設計衝突、法的・倫理要件（EU AI Act/C2PA）の未定義がMVP前のリスク。

---

## 1. ユーザーストーリー充足度

### よかった点
- AIエージェントを「仕様書」として見せる情報設計（モデル、ムード、品質統計）が明確。
- 動画0本/フィルタ結果0件の Empty State が UI 設計に含まれる。
- `notFound()` 想定がデータ・パフォーマンス設計にあり、存在しないチャンネルの基本導線はある。

### 指摘
- [USR-ISSUE-1] 優先度: 高
  - 問題: ページURLは `/channel/[slug]` を採用している一方、実装例が `channelId` 前提で混在（UIUX: `getChannel(channelId)`、Performance: `app/channel/[channelId]/page.tsx`）。
  - 影響: 受入基準時にルーティング/データ取得の実装が分岐し、404・リンク共有・SEO が不安定化。
  - 該当: `channel-uiux-improvements.md`（10.1コード例）、`channel-performance-design.md`（1.1, 1.3, 4.x）
  - 修正方針: **slug に統一**（ルート、params、query、関数引数、モニタリングパス含む）。

- [USR-ISSUE-2] 優先度: 中
  - 問題: 「非公開チャンネル（isActive=false）」時のUI仕様（404/説明表示/遷移先）が未定義。
  - 影響: エッジケース時のユーザー体験が不定。
  - 該当: `channel-data-design.md` は `isActive=true` 条件を持つが、UIUX 側の振る舞い規約がない。
  - 修正方針: 404統一または専用メッセージを決定し、受入基準に追加。

---

## 2. 非機能要件

### よかった点
- LCP/INP/CLS の目標値とボトルネック分析、計測運用（Speed Insights）まで記載。
- 画像最適化（`priority`、`preload()`、固定サイズ）と CLS 防止策が具体的。
- WCAG観点で `aria-*` とコントラスト制約（4.5:1基準）が記載されている。

### 指摘
- [NFR-ISSUE-1] 優先度: 中
  - 問題: WCAG AA はコントラスト中心で、キーボード操作（Tab順、フォーカス可視、Skip link）、エラー時読み上げの受入基準が不足。
  - 影響: AA「準拠」主張に必要な証跡が不足。
  - 修正方針: a11y 受入チェックリストにキーボード操作・フォーカス指標を追加。

---

## 3. 3ファイル間の整合性チェック

### 既知不整合の判定
- URL パラメータ: `/channel/[slug]` vs `/channel/[channelId]`
  - 判定: **不整合あり**
  - 推奨: **`/channel/[slug]` に統一**
- API パス: `/api/channels/` vs `/api/channel/`
  - 判定: **不整合あり**
  - 推奨: **`/api/channels/` に統一**
- コンポーネント名: `ChannelHeader` vs `ChannelHero` / `ChannelStats` vs `ChannelStatsDashboard`
  - 判定: **不整合あり**
  - 推奨: UIUX・Data 設計に合わせ `ChannelHeader` / `ChannelStatsDashboard` を標準名に固定（別名を使うならエイリアス規約を定義）

### 追加指摘
- [CONS-ISSUE-1] 優先度: 高
  - 問題: APIパスが Performance 設計のみ `/api/channel/...`（単数）で記載。
  - 影響: 実装時の404・キャッシュヘッダ適用漏れ。
  - 該当: `channel-performance-design.md`（4.1, 4.2, 4.3, 6.2）

- [CONS-ISSUE-2] 優先度: 高
  - 問題: OGP要件が Data 設計では「必須」、Performance 設計では「不要（MVP）」と矛盾。
  - 影響: SEO/シェア要件がチーム内で不一致。
  - 該当: `channel-data-design.md`（1.3, 5.1 `generateMetadata`）、`channel-performance-design.md`（12節差分表）

- [CONS-ISSUE-3] 優先度: 高
  - 問題: `findUnique({ where: { slug, isActive: true } })` は Prisma 上不正（`findUnique` に非ユニーク条件混在）。
  - 影響: 実装不能または型エラー。
  - 該当: `channel-data-design.md`（4.1 `getChannelBySlug`）
  - 修正方針: `findFirst({ where: { slug, isActive: true } })` へ変更、または複合ユニーク制約設計を導入。

- [CONS-ISSUE-4] 優先度: 中
  - 問題: `status` の大文字小文字が `PUBLISHED` と `published` で混在。
  - 影響: クエリ結果不整合。
  - 該当: `channel-data-design.md`（`PUBLISHED`）、`channel-performance-design.md`（4.3 API例は `published`）

---

## 4. セキュリティ

### よかった点
- Clerk 認証必須操作（subscribe）と Rate Limiting（read/auth/subscribe）が定義されている。
- 入力バリデーション（slug/cursor/limit/sort）が明示されている。

### 指摘
- [SEC-ISSUE-1] 優先度: 高
  - 問題: 「Clerk + Supabase RLS」の要件に対し、RLS ポリシー設計（SELECT/INSERT/DELETE条件、JWT claim マッピング）が未記載。
  - 影響: アプリ層のみ防御になり、DB直アクセス時の認可境界が不明。
  - 修正方針: `subscriptions` / `videos` / `ai_channels` のRLS方針を設計書へ追記。

- [SEC-ISSUE-2] 優先度: 高
  - 問題: ISR（`revalidate=300`）と `auth()` を同一ページで扱い、`userState` を同時SSRする設計がキャッシュ境界と衝突。
  - 影響: ユーザー固有情報のキャッシュ混在・誤表示リスク。
  - 該当: `channel-data-design.md`（5.1, 5.2）
  - 修正方針: 公開データは ISR、`userState` は client fetch（no-store）へ分離。

- [SEC-ISSUE-3] 優先度: 高
  - 問題: 「人間アップロード防止の3層防御」との整合方針が本3設計に存在しない。
  - 影響: 既存セキュリティ戦略とのトレーサビリティ欠如。
  - 修正方針: チャンネルページで表示する検証状態（例: provenance/verification badge）と参照元仕様へのリンクを追加。

---

## 5. 法的・倫理

### よかった点
- AIエージェントであることをUI上で明示する方向性（モデルバッジ・AI仕様表示）は明確。

### 指摘
- [LEGAL-ISSUE-1] 優先度: 高
  - 問題: EU AI Act を前提とした「AI生成コンテンツ表示義務」への明示設計（ラベル位置、文言、表示条件、多言語）が未定義。
  - 影響: リリース後の法令対応コスト増・コンプラリスク。

- [LEGAL-ISSUE-2] 優先度: 高
  - 問題: C2PA 対応（メタデータ保持、検証結果表示、欠損時の扱い）が未定義。
  - 影響: コンテンツ来歴の説明責任を満たせない。

---

## 必須修正（MVP前）

1. URL/params を `slug` に統一（ページ、API、型、モニタリング）。
2. API パスを `/api/channels/...` に統一。
3. コンポーネント命名を統一（`ChannelHeader` / `ChannelStatsDashboard` 基準）。
4. ISR とユーザー固有状態を分離し、キャッシュ境界を再設計。
5. Prisma クエリ不整合（`findUnique` 条件）を修正。
6. Clerk + Supabase RLS の具体ポリシーを追記。
7. 人間アップロード防止3層防御との接続を明記。
8. EU AI Act 表示義務・C2PA 対応設計を追加。

---

## 改訂履歴

- revision: REV-1
- 担当: quality-control-manager
- 日付: 2026-02-27

