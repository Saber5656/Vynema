# AI Theater - プロジェクト進捗管理

## プロジェクト概要
- **プラットフォーム名**: AI Theater
- **コンセプト**: AIだけが動画投稿できるYouTubeライクWebアプリケーション
- **開発形態**: 個人開発

## 確定技術スタック
| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 15 App Router + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| 動画配信 | Mux (Upload/Transcode/Player/CDN) |
| AI動画生成 | 2段パイプライン: Text → Flux Schnell (画像) → Runway Gen-4 Turbo (動画) + Veo 3.1 Fast (フォールバック) |
| DB | Supabase PostgreSQL + Prisma ORM |
| 認証 | Clerk |
| 状態管理 | TanStack Query + Zustand |
| ジョブキュー | BullMQ + Upstash Redis |
| デプロイ | Vercel (フロント) + Railway (AIワーカー) |

## フェーズ進捗

### フェーズ1: 計画・設計 ✅ 完了 (2026-02-22)
- [x] 要件定義・アーキテクチャ設計
- [x] 技術スタック調査・決定
- [x] UI/UXデザイン・画面設計（基本設計）
- [x] ユーザー要件・ユースケース整理

### フェーズ2: 詳細設計 ✅ 完了 (2026-03-07)
- [x] ホーム画面 詳細設計 ✅ 完了 (2026-02-22) — レビュー評価: A-
  - [x] UI/UX改善議論（YouTube超えの提案）
  - [x] DB・データ設計（Prisma 10モデル）
  - [x] ロードバランシング・パフォーマンス設計
  - [x] Figma再現用デザインスペック
  - [x] 詳細設計レビュー
  - [x] 必須修正3件対応（コントラスト比/推薦データソース/Rate Limiting）
- [x] 動画再生ページ 詳細設計 ✅ 完了 (2026-02-23) — レビュー評価: A-
  - [x] UI/UX改善議論（YouTube課題分析 + AI Theater 独自価値設計）
  - [x] DB・データ設計（API/型定義/Prismaクエリ）
  - [x] パフォーマンス設計（SSR+ISR/Core Web Vitals/コスト推計）
  - [x] Figma再現用デザインスペック（v1.0）
  - [x] 詳細設計レビュー
  - [x] 必須修正2件対応（レイアウト統一/Mux Data統一）
- [x] AIチャンネルページ 詳細設計 ✅ 完了 (2026-02-27) — レビュー評価: B+ → 全対応済
  - [x] UI/UX改善議論（競合課題分析 + AIエージェント仕様書型チャンネルページ設計）
  - [x] DB・データ設計（AIChannel拡張 + API 4本 + RLS + ISR/userState分離）
  - [x] パフォーマンス設計（ISR+CSRハイブリッド / Core Web Vitals / 追加コスト$0）
  - [x] Figmaデザインスペック（3ブレークポイント / 全コンポーネントpxスペック）
  - [x] 詳細設計レビュー + 指摘対応（SEC×3, CONS×4, LEGAL×2, USR×2, NFR×1）
- [x] 認証・ユーザー管理 詳細設計 ✅ 完了 (2026-02-28) — レビュー評価: B+ → A-
  - [x] UI/UX改善議論（OAuth only MVP / AuthModal / useAuthGuard / /settings 4タブ）
  - [x] DB・データ設計（User拡張 + RLS 12テーブル + IDOR防止 /api/users/me + GDPR対応）
  - [x] パフォーマンス設計（auth() ~0ms / Clerk Middleware / ISR-userState分離 / Webhook冪等性）
  - [x] Figmaデザインスペック（AuthModal 400px / /sign-in 2カラム / /settings 4タブ / WCAG AA全PASS）
  - [x] 詳細設計レビュー + 指摘対応（SEC×3, CONS×4, US×1, LEG×1 → 全対応済み）
- [x] 検索機能 詳細設計 ✅ 完了 (2026-03-03) — レビュー評価: A-
  - [x] UI/UX改善設計
  - [x] DB・データ設計（pg_trgm / offset / CSR）
  - [x] パフォーマンス設計
  - [x] Figmaデザインスペック
  - [x] 詳細設計レビュー
  - [x] 高優先度3件修正対応（pg_trgm統一/offset統一/CSR統一）
- [x] AI動画生成パイプライン 詳細設計 ✅ 完了 (2026-03-07) — レビュー評価: A-
  - [x] UI/UX改善設計（管理画面5ページ / PipelineStageIndicator 7ステージ）
  - [x] DB・データ設計（4ジョブチェーン / MonthlyQuota / IMAGE_GENERATING ステージ）
  - [x] パフォーマンス設計（E2E ≤3min / $0.253/本 / Upstash Free 28%）
  - [x] Figmaデザインスペック
  - [x] 詳細設計レビュー（v1.0 → v2.0: PIPE-ISSUE 3件全解消）
  - [x] 2段パイプライン対応修正（#23/#24/#25: DB/Perf/UI全面修正）
- [x] KPTA 振り返り ✅ 完了 (2026-03-07)

### フェーズ3: 実装（未着手 — project-owner 承認待ち）

#### フェーズ移行基準チェック
- [x] 全画面の詳細設計レビュー評価が A- 以上
- [x] 高優先度の課題が 0 件
- [x] 必須修正が全て反映済み
- [x] コスト見積もりが月額 $50 以内（推定 $20-40）
- [ ] project-owner の承認

#### 実装フェーズ開始前の準備タスク（KPTA Action より）
- [ ] A1: インターフェース定義書の作成（API パス命名規約、enum、コスト定数、共有型）
- [ ] A2: 1,000行超ドキュメントの分割（6ファイル対象）
- [ ] A3: 共有コンポーネントライブラリ文書の作成
- [x] A4: PIPE-ISSUE-5R 対応（Mux Webhook 統一）— 2026-03-21 完了
- [x] A5: 統合 Prisma スキーマの作成 — 2026-03-21 完了

### フェーズ4: テスト・仕上げ（未着手）

## ドキュメント管理
| パス | 内容 | レベル | ステータス |
|------|------|--------|-----------|
| `docs/ui-ux-design.md` | UI/UX基本設計書 | 基本設計 | 完了 |
| `docs/requirements/user-requirements-usecases.md` | ユーザー要件・ユースケース | 基本設計 | 完了 |
| **ホーム画面** | | | |
| `docs/detailed-design/home/home-uiux-improvements.md` | ホーム画面 UI/UX改善提案 | 詳細設計 | 完了 |
| `docs/detailed-design/home/home-data-design.md` | ホーム画面 DB・データ設計 | 詳細設計 | 完了 |
| `docs/detailed-design/home/home-performance-design.md` | ホーム画面 パフォーマンス設計 | 詳細設計 | 完了 |
| `docs/figma/home-design-spec.md` | ホーム画面 Figmaデザインスペック | 詳細設計 | 完了 |
| `docs/detailed-design/home/home-design-review.md` | ホーム画面 レビュー結果 | 詳細設計 | 完了 |
| `docs/detailed-design/home/home-review-preparation.md` | ホーム画面 レビュー準備 | 詳細設計 | 完了 |
| `docs/detailed-design/home/home-recommendation-source.md` | 推薦理由MVPデータソース定義 | 詳細設計 | 完了 |
| `docs/detailed-design/home/home-rate-limiting.md` | Rate Limiting 実装方針 | 詳細設計 | 完了 |
| **動画再生ページ** | | | |
| `docs/detailed-design/video-player/video-player-uiux-improvements.md` | 動画再生ページ UI/UX改善提案 | 詳細設計 | 完了 |
| `docs/detailed-design/video-player/video-player-data-design.md` | 動画再生ページ DB・データ設計 | 詳細設計 | 完了 |
| `docs/detailed-design/video-player/video-player-performance-design.md` | 動画再生ページ パフォーマンス設計 | 詳細設計 | 完了 |
| `docs/detailed-design/video-player/video-player-benchmark-monitoring.md` | 動画再生ページ ベンチマーク計画 | 詳細設計 | 完了 |
| `docs/detailed-design/video-player/video-player-consistency-review.md` | 動画再生ページ 整合性レビュー | 詳細設計 | 完了 |
| `docs/figma/video-player-design-spec.md` | 動画再生ページ Figmaデザインスペック | 詳細設計 | 完了 |
| `docs/detailed-design/video-player/video-player-design-review.md` | 動画再生ページ レビュー結果 | 詳細設計 | 完了 |
| **AIチャンネルページ** | | | |
| `docs/detailed-design/channel/task-12-research-summary.md` | AIチャンネルページ 調査報告書 | 詳細設計 | 完了 |
| `docs/detailed-design/channel/channel-uiux-improvements.md` | AIチャンネルページ UI/UX改善提案 | 詳細設計 | 完了 |
| `docs/detailed-design/channel/channel-data-design.md` | AIチャンネルページ DB・データ設計 | 詳細設計 | 完了 |
| `docs/detailed-design/channel/channel-performance-design.md` | AIチャンネルページ パフォーマンス設計 | 詳細設計 | 完了 |
| `docs/figma/channel-design-spec.md` | AIチャンネルページ Figmaデザインスペック | 詳細設計 | 完了 |
| `docs/detailed-design/channel/channel-design-review.md` | AIチャンネルページ レビュー結果 | 詳細設計 | 完了 |
| **認証・ユーザー管理** | | | |
| `docs/detailed-design/auth/auth-uiux-improvements.md` | 認証 UI/UX改善提案 | 詳細設計 | 完了 |
| `docs/detailed-design/auth/auth-data-design.md` | 認証 DB・データ設計 | 詳細設計 | 完了 |
| `docs/detailed-design/auth/auth-performance-design.md` | 認証 パフォーマンス設計 | 詳細設計 | 完了 |
| `docs/figma/auth/auth-design-spec.md` | 認証 Figmaデザインスペック | 詳細設計 | 完了 |
| `docs/detailed-design/auth/auth-design-review.md` | 認証 レビュー結果 | 詳細設計 | 完了 |
| **検索機能** | | | |
| `docs/detailed-design/search/search-uiux-improvements.md` | 検索 UI/UX改善提案 | 詳細設計 | 完了 |
| `docs/detailed-design/search/search-data-design.md` | 検索 DB・データ設計 | 詳細設計 | 完了 |
| `docs/detailed-design/search/search-performance-design.md` | 検索 パフォーマンス設計 | 詳細設計 | 完了 |
| `docs/figma/search-design-spec.md` | 検索 Figmaデザインスペック | 詳細設計 | 完了 |
| `docs/detailed-design/search/search-design-review.md` | 検索 レビュー結果 | 詳細設計 | 完了 |
| **AI動画生成パイプライン** | | | |
| `docs/detailed-design/pipeline/task-research-summary.md` | パイプライン 技術調査報告書 | 詳細設計 | 完了 |
| `docs/detailed-design/ai-pipeline/ai-pipeline-uiux-improvements.md` | パイプライン UI/UX改善提案 | 詳細設計 | 完了 (v2.0) |
| `docs/detailed-design/ai-pipeline/ai-pipeline-data-design.md` | パイプライン DB・データ設計 | 詳細設計 | 完了 (v2.0) |
| `docs/detailed-design/ai-pipeline/ai-pipeline-performance-design.md` | パイプライン パフォーマンス設計 | 詳細設計 | 完了 (v2.0) |
| `docs/figma/ai-pipeline-design-spec.md` | パイプライン Figmaデザインスペック | 詳細設計 | 完了 (v2.0) |
| `docs/detailed-design/ai-pipeline/ai-pipeline-design-review.md` | パイプライン レビュー結果 | 詳細設計 | 完了 (v2.0) |
| **振り返り** | | | |
| `docs/retrospective/2026-02-24-context-management.md` | KPTA 振り返り（第1回: コンテキスト管理） | 振り返り | 完了 |
| `docs/retrospective/2026-03-07-phase2-detailed-design.md` | KPTA 振り返り（第2回: フェーズ2完了） | 振り返り | 完了 |

## コスト管理

### 月額予算: $50以下（個人開発）

| サービス | プラン | 月額 | 備考 |
|---------|--------|------|------|
| Vercel | Hobby (無料) | $0 | 商用利用不可。本番移行時 Pro $20/月 |
| Supabase | Free | $0 | 500MB DB、動画5,000本まで対応 |
| Clerk | Free | $0 | 10,000 MAU まで |
| Mux | 従量課金 | ~$14 | 月2,000視聴想定 |
| Upstash Redis | Free | $0 | 10,000コマンド/日（使用率28%） |
| Railway | Usage-based | $5-10 | AI生成ワーカー |
| AI動画生成 (30本/月) | 従量課金 | ~$8.59 | 2段パイプライン: Flux $0.003 + Runway $0.25 = $0.253/本 |
| **合計** | | **$20-40** | |

### コスト制約ルール
- **MVP月間動画生成上限: 30本固定**（超過禁止）
- **Vercel本番移行**: Pro ($20/月) へのアップグレードが必要（合計 $40-60/月に上昇）
- **Muxスケーリング閾値**: 月10,000視聴超で料金体系の見直しが必要（~$60/月に上昇）
- **AI生成コスト比率**: 2段パイプライン採用により旧比47%削減。$8.59/月（予算の約20%）

## 現在のステータス
フェーズ2（詳細設計）が全6画面/機能で完了。全てレビュー評価 A- 以上を達成し、高優先度の課題は0件。KPTA 振り返りも完了済み。フェーズ3（実装）への移行は project-owner の承認待ち。

### 詳細設計 完了済み画面サマリー
| 画面 | 完了日 | レビュー評価 | 必須修正 |
|------|--------|-------------|---------|
| ホーム画面 | 2026-02-22 | A- | 3件 → 全対応済 |
| 動画再生ページ | 2026-02-23 | A- | 2件 → 全対応済 |
| AIチャンネルページ | 2026-02-27 | B+ → 全対応済 | 14件 → 全対応済 |
| 認証・ユーザー管理 | 2026-02-28 | B+ → A- | 9件 → 全対応済 |
| 検索機能 | 2026-03-03 | A- | 3件 → 全対応済 |
| AI動画生成パイプライン | 2026-03-07 | A- | 3件(PIPE-ISSUE) → 全対応済 |

### 次のアクション
1. **project-owner のフェーズ移行承認取得**
2. 実装フェーズ開始前の準備タスク（A1〜A5）の実施
3. フェーズ3（実装）開始

## 最終更新
2026-03-07
