# 動画再生ページ詳細設計レビュー

作成日: 2026-02-23
担当: quality-control-manager (reviewer)
レビュー対象:
- docs/detailed-design/video-player/video-player-uiux-improvements.md
- docs/detailed-design/video-player/video-player-data-design.md
- docs/detailed-design/video-player/video-player-performance-design.md
- docs/detailed-design/video-player/video-player-benchmark-monitoring.md
- docs/detailed-design/video-player/video-player-consistency-review.md
- docs/figma/video-player-design-spec.md

整合性確認参照:
- docs/detailed-design/home/home-contrast-fix.md
- docs/detailed-design/home/home-recommendation-source.md
- docs/detailed-design/home/home-rate-limiting.md
- docs/figma/home-design-spec.md

---

## 1. 指摘事項（重要度順）

### [高] ISSUE-VR-1: ページ情報設計がドキュメント間で矛盾（サイドバー構成 vs タブパネル構成）

**内容**
- `video-player-uiux-improvements.md` は関連動画サイドバー前提（2カラム）で定義。
- `video-player-performance-design.md` / `video-player-data-design.md` も `<aside>` + `RelatedVideos` サイドバー構成。
- `video-player-design-spec.md` は v1.0 で「サイドバー廃止・3段タブUI」へ変更済み。

**根拠**
- `docs/detailed-design/video-player/video-player-uiux-improvements.md:539`
- `docs/detailed-design/video-player/video-player-performance-design.md:83`
- `docs/detailed-design/video-player/video-player-data-design.md:900`
- `docs/figma/video-player-design-spec.md:22`
- `docs/figma/video-player-design-spec.md:92`

**影響**
- 実装対象コンポーネント（`RelatedVideos` の配置、`WatchPageTabPanel` の責務、レスポンシブ設計）が確定せず、実装とFigmaが乖離する。

**対応**
- UI基準を `video-player-design-spec.md` に統一するか、逆にFigma仕様を旧アーキテクチャへ戻すかを決定し、全ドキュメントを同日改訂で同期する。

---

### [高] ISSUE-VR-2: Mux Data カスタムメタデータ定義が不一致

**内容**
- UIUXでは `custom_3 = video.qualityScore`。
- ベンチマーク計画では `custom_3 = agent_id` を要求。
- 同じ `custom_3` が別意味になっており、分析基盤が壊れる。

**根拠**
- `docs/detailed-design/video-player/video-player-uiux-improvements.md:391`
- `docs/detailed-design/video-player/video-player-benchmark-monitoring.md:537`

**影響**
- ダッシュボード指標の比較不能、クエリ誤解釈、分析自動化の失敗。

**対応**
- `custom_1..3` の正式スキーマを1箇所に定義（例: `generation_model`, `theme`, `quality_score_raw`）し、UIUX/Perf/Benchmarkを同値に統一。

---

### [中] ISSUE-VR-3: MuxPlayer import戦略が未統一（lazy採用の不徹底）

**内容**
- パフォーマンス設計は `@mux/mux-player-react/lazy` を採用。
- データ設計の実装例は通常importのまま。

**根拠**
- `docs/detailed-design/video-player/video-player-performance-design.md:242`
- `docs/detailed-design/video-player/video-player-data-design.md:954`

**影響**
- TTI見積もりと実装がズレる。バンドルサイズ最適化の前提が崩れる。

**対応**
- 実装例を lazy import に統一し、通常importを禁止事項として明記。

---

### [中] ISSUE-VR-4: コメントコンポーネント名の表記ゆれ（`CommentSection` / `CommentsSection`）

**内容**
- `performance-design` は `CommentSection`。
- `data-design` は `CommentsSection`。

**根拠**
- `docs/detailed-design/video-player/video-player-performance-design.md:46`
- `docs/detailed-design/video-player/video-player-data-design.md:896`

**影響**
- 実装時のimportエラー、レビュー時の追跡コスト増。

**対応**
- 正式名称を1つに固定し、全ドキュメント置換。

---

### [中] ISSUE-VR-5: Quality Score の意味定義が揺れている（2軸MVP式 vs 5軸詳細）

**内容**
- UIUXはMVP計算式を「likeRatio 50% + completionRate 50%」と定義。
- Data設計は「5軸スコア + 総合スコア」を前提にAPI/DBを設計。
- スケール変換（0-100→0.0-5.0）は定義済みだが、**総合値の算出元**が一致していない。

**根拠**
- `docs/detailed-design/video-player/video-player-uiux-improvements.md:140`
- `docs/detailed-design/video-player/video-player-data-design.md:25`
- `docs/detailed-design/video-player/video-player-data-design.md:159`

**影響**
- 同じ `qualityScore` でも算出ロジックが環境/時期で変わり、ランキング・表示・監視が不一致化。

**対応**
- MVPでは「総合値は2軸で算出、`qualityDetails`の残り3軸は将来null許容」等の移行方針を明記する。

---

### [低] ISSUE-VR-6: HomeのRate Limit定義と動画ページAPIの追記不足

**内容**
- 動画ページでは `GET /api/videos/[id]/comments` と `GET /api/videos/[id]/related` の制限値が定義済み。
- Home側の共通Rate Limit仕様に同等記載が不足。

**根拠**
- `docs/detailed-design/video-player/video-player-data-design.md:126`
- `docs/detailed-design/video-player/video-player-data-design.md:132`
- `docs/detailed-design/video-player/video-player-consistency-review.md:271`

**影響**
- 実装ガイドの分断により、運用時にAPIごとの制限適用漏れが起こりうる。

**対応**
- `home-rate-limiting.md` を「全API共通レート制限定義」に拡張。

---

## 2. 指定観点への判定

### 2.1 5ドキュメント間整合性（型/API/カラー/コンポーネント名）
- **判定: B+**
- `qualityScore` スケール変換（0-100→0.0-5.0）は概ね反映済み。
  - `docs/detailed-design/video-player/video-player-data-design.md:159`
  - `docs/figma/video-player-design-spec.md:281`
- コメントフィールド名 `body` は統一済み。
  - `docs/detailed-design/video-player/video-player-data-design.md:273`
  - `docs/detailed-design/video-player/video-player-performance-design.md:533`
- ただし、レイアウト方針とメタデータ定義の不一致が残存（ISSUE-VR-1,2）。

### 2.2 ホーム画面設計との一貫性（共通コンポーネント・デザイントークン）
- **判定: A-**
- `text-tertiary/quality-dim = #7A8390` 反映は良好。
  - `docs/detailed-design/home/home-contrast-fix.md:64`
  - `docs/figma/home-design-spec.md:47`
  - `docs/figma/video-player-design-spec.md:49`
- アニメーション共有（`fadeInOut`）も整合。
  - `docs/detailed-design/video-player/video-player-uiux-improvements.md:468`

### 2.3 Quality Scoreスケール統一（DB→UI変換）
- **判定: A-（要定義補強）**
- 変換関数 `toDisplayScore()` は明記済み。
  - `docs/detailed-design/video-player/video-player-data-design.md:1284`
- ただし、総合値算出ロジックの一次定義が2軸/5軸で揺れている（ISSUE-VR-5）。

### 2.4 コメントフィールド名統一（body）
- **判定: A**
- 主要設計書では `body` に統一済み。

### 2.5 パフォーマンス目標の実現可能性
- **判定: A-**
- 目標値自体（LCP/INP/CLS）は妥当。
- ただし、実装例側のlazy import不統一（ISSUE-VR-3）とアーキテクチャ不一致（ISSUE-VR-1）により、計測再現性が下がる。

### 2.6 WCAG AA コントラスト比 4.5:1 遵守
- **判定: A**
- 動画ページ仕様はホーム側修正（`#7A8390`）を継承し、AA基準を満たす記述。

### 2.7 50ドル/月予算制約との整合
- **判定: B+**
- 動画ページ設計は Mux観点で ~$34/月見積もり。
  - `docs/detailed-design/video-player/video-player-performance-design.md:802`
- ただしこれは動画配信コスト中心で、全体TCO（Vercel Pro移行・AI生成コスト変動）を含む統合予算表が動画ページ側に未記載。

---

## 3. 総合評価

| 観点 | 評価 | コメント |
|------|------|---------|
| 仕様整合性 | B+ | 中核設計は成立。UI構造と分析メタデータの不一致が主要リスク |
| 実装着手可能性 | A- | 主要P0を先に解消すれば着手可能 |
| 非機能（性能/アクセシビリティ/コスト） | A- | 方針は妥当。コスト定義と実装統一の補強が必要 |
| **全体** | **A-** | **必須修正2件（ISSUE-VR-1,2）と推奨修正3件で安定着手可能** |

---

## 4. 必須修正（MVP着手前）

1. レイアウト基準の単一化（サイドバー方式かタブ方式かを決定して全資料同期）
2. ~~Mux Data `custom_1..3` の意味を単一仕様に固定~~ **解決済み (2026-03-07)**: performance-design.md §10.3 に単一定義を確立し、全ドキュメント（UIUX/Benchmark/Data/Research）を統一。custom_1=aiModel, custom_2=qualityScore(raw), custom_3=channel.id

## 5. 推奨修正（MVP中）

1. `@mux/mux-player-react/lazy` の全資料統一
2. `CommentSection` 命名統一
3. Quality Score 総合値の算出ルールを「MVP版」と「将来版」で分離記述

