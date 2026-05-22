# AI Theater - Team Configuration

`~/.claude/team-config.md` を継承。本ファイルはプロジェクト固有の設定を定義する。

---

## 1. プロジェクト概要

| 項目 | 値 |
|------|-----|
| プラットフォーム名 | AI Theater |
| コンセプト | AIだけが動画投稿できるYouTubeライクWebアプリ |
| 開発形態 | 個人開発 |
| 月額予算 | $50以下 |
| チーム名（Claude Code） | `ai-theater` |

---

## 2. 確定技術スタック

| カテゴリ    | 技術                                                |
| ------- | ------------------------------------------------- |
| フレームワーク | Next.js 15 App Router + TypeScript                |
| UI      | Tailwind CSS v4 + shadcn/ui                       |
| 動画配信    | Mux (Upload/Transcode/Player/CDN)                 |
| AI動画生成  | Runway Gen-4 Turbo (メイン) + Veo 3.1 Fast (フォールバック) |
| DB      | Supabase PostgreSQL + Prisma ORM                  |
| 認証      | Clerk                                             |
| 状態管理    | TanStack Query + Zustand                          |
| ジョブキュー  | BullMQ + Upstash Redis                            |
| デプロイ    | Vercel (フロント) + Railway (AIワーカー)                  |

---

## 3. ロール定義（プロジェクト固有）

| ロール | モデル固定ID | Claude Code 引数 | スキルファイル | プロジェクト固有の責務 |
|--------|-------------|------------------|---------------|----------------------|
| project-owner | — (人間) | — | — | プロジェクト方針決定・フェーズ移行承認 |
| project-manager | `claude-opus-4-6` | `opus` | `skills/project-manager-skill.md` | タスク分解（画面単位×5観点）・コスト管理（$50/月上限）・成果物間整合性チェック |
| tech-leader | `claude-opus-4-6` | `opus` | `skills/tech-lead-skill.md` | Prisma スキーマ設計・Next.js パフォーマンス最適化・Mux/Supabase/Clerk統合 |
| quality-control-manager | `gpt-5.3-codex` | — (CLI経由) | `skills/reviewer-skill.md` | 5カテゴリレビュー（ユーザーストーリー・非機能要件・a11y・セキュリティ・法的）・ドキュメント品質管理 |
| designer | `claude-sonnet-4-6` | `sonnet` | `skills/ux-designer-skill.md` | Quality Score UI・カルーセル+グリッドレイアウト・ムードブラウジング・Figmaスペック作成 |
| researcher | `claude-haiku-4-5-20251001` | `haiku` | — | 技術調査・API仕様確認・競合分析・最新ドキュメント取得 |
| analyzer | `claude-sonnet-4-6` | `sonnet` | — | Core Web Vitals 監視・Prisma クエリパフォーマンス分析・コスト推移追跡 |

---

## 4. フェーズ進捗

### フェーズ1: 基本設計 — 完了 (2026-02-22)

- 要件定義・アーキテクチャ設計
- 技術スタック調査・決定
- UI/UXデザイン・画面設計
- ユーザー要件・ユースケース整理

### フェーズ2: 詳細設計 — 進行中

| 画面 | ステータス | レビュー評価 |
|------|-----------|-------------|
| ホーム画面 | 完了 | A-（MVP着手可・必須修正3件） |
| 動画再生ページ | 未着手 | — |
| AIチャンネルページ | 未着手 | — |
| 検索機能 | 未着手 | — |
| AI動画生成パイプライン | 未着手 | — |
| 認証・ユーザー管理 | 未着手 | — |

### ホーム画面 MVP着手前の必須修正（3件）

1. `text-tertiary` on `surface` のコントラスト比修正（4.15 → 4.5:1以上）
2. 推薦理由表示のMVPデータソース定義
3. Rate Limiting の最低限の実装方針決定

### フェーズ3: 実装 — 未着手

### フェーズ4: テスト・仕上げ — 未着手

---

## 5. コスト管理

### 月額予算: $50以下

| サービス          | プラン         | 月額         | 備考                       |
| ------------- | ----------- | ---------- | ------------------------ |
| Vercel        | Hobby (無料)  | $0         | 本番移行時 Pro $20/月          |
| Supabase      | Free        | $0         | 500MB DB、動画5,000本まで      |
| Clerk         | Free        | $0         | 10,000 MAU まで            |
| Mux           | 従量課金        | ~$14       | 月2,000視聴想定               |
| Upstash Redis | Free        | $0         | 10,000コマンド/日             |
| Railway       | Usage-based | $5-10      | AI生成ワーカー                 |
| AI動画生成        | 従量課金        | $15-25     | Runway Gen-4 Turbo 30本/月 |
| **合計**        |             | **$20-40** |                          |

### コスト制約ルール

- MVP月間動画生成上限: 30本固定
- Muxスケーリング閾値: 月10,000視聴超で再検討
- AI生成コスト比率が予算50%超の場合は生成頻度の上限設定必須

---

## 6. 詳細設計のタスク分解パターン

画面単位で以下の5タスクに分解する：

```
1. [UI/UX改善議論]     → designer
2. [DB・データ設計]     → tech-leader
3. [パフォーマンス設計] → tech-leader
4. [デザインスペック]   → designer        ※ タスク1完了後に着手
5. [詳細設計レビュー]   → quality-control-manager  ※ タスク1-4全完了後に着手
```

### 依存関係

```
[1. UI/UX改善] ─────→ [4. デザインスペック]
[2. DB設計]         ─→ [5. レビュー]
[3. パフォーマンス] ─→ [5. レビュー]
[4. デザインスペック] → [5. レビュー]
```

---

## 7. ドキュメント一覧

| パス | 内容 | ステータス |
|------|------|-----------|
| `docs/ui-ux-design.md` | UI/UX基本設計書 | 完了 |
| `docs/requirements/user-requirements-usecases.md` | ユーザー要件・ユースケース | 完了 |
| `docs/detailed-design/home/home-uiux-improvements.md` | ホーム画面 UI/UX改善提案 | 完了 |
| `docs/detailed-design/home/home-data-design.md` | ホーム画面 DB・データ設計 | 完了 |
| `docs/detailed-design/home/home-performance-design.md` | ホーム画面 パフォーマンス設計 | 完了 |
| `docs/figma/home-design-spec.md` | ホーム画面 Figmaデザインスペック | 完了 |
| `docs/detailed-design/home/home-design-review.md` | ホーム画面 レビュー結果 | 完了 |
| `docs/detailed-design/home/home-review-preparation.md` | ホーム画面 レビュー準備 | 完了 |
| `docs/retrospective/2026-02-24-context-management.md` | KPTA 振り返り（フェーズ2 第1回） | 完了 |
| `docs/context-memos/` | タスク切り替え時の要約メモ保管先 | 運用中 |

---

## 8. フェーズ移行基準

### 詳細設計 → 実装

- 全画面の詳細設計レビュー評価が A- 以上
- 高優先度の課題が 0 件
- 必須修正が全て反映済み
- コスト見積もりが月額 $50 以内
- project-owner の承認

---

## 9. コンテキスト管理（プロジェクト固有）

汎用ルールは `~/.claude/team-config.md` セクション7 を参照。本セクションは AI Theater 固有の運用を定義する。

### 9.1 大規模ファイルの細分化検討

以下のファイルが 1,000行を超えており、細分化を検討すること。今後の詳細設計でも同規模になる場合は画面単位サブディレクトリ内でさらに分割する。

| ファイル | 行数 | 細分化候補 |
|---------|------|-----------|
| `video-player-data-design.md` | 1,337 | Prismaスキーマ / API定義 / 型定義 / JSX実装例 を分離 |
| `home-design-spec.md` | 1,185 | コンポーネント別（Hero/VideoCard/Navigation 等）に分離 |
| `home-data-design.md` | 1,140 | Prismaスキーマ / API定義 / 型定義 を分離 |
| `home-uiux-improvements.md` | 1,097 | レイアウト設計 / コンポーネント詳細 / アニメーション を分離 |

細分化の実施タイミングは次画面の詳細設計着手前とし、既存画面分は実装フェーズ移行前に対応する。

### 9.2 クロスドキュメント依存マップ

画面間で共有される設計要素。整合性チェック時はこのマップに基づいて参照範囲を限定する。

```
共有デザイントークン:
  色: text-tertiary=#7A8390, quality-dim=#7A8390, surface=#0D1117
  → home-design-spec.md §カラーパレット / video-player-design-spec.md §カラー定義

共有コンポーネント:
  VideoCard, AIBadge, QualityBadge
  → home-uiux-improvements.md / video-player-uiux-improvements.md

共有データモデル:
  Quality Score (DB: 0-100 → UI: 0.0-5.0), Comment.body
  → home-data-design.md / video-player-data-design.md

共有パフォーマンス基準:
  Core Web Vitals 目標, Mux Player preload 戦略
  → home-performance-design.md / video-player-performance-design.md

Mux Data メタデータスキーマ:
  custom_1=generation_model, custom_2=quality_score_raw, custom_3=channel_id
  → video-player-performance-design.md §10.3（正規定義）
```

### 9.3 レビュータスクの分割ガイドライン

PM がレビュータスクを作成する際は、1レビュータスクあたり同時参照ドキュメントを制限する。

```
NG: 「ホーム+動画再生の全8ドキュメント横断レビュー」（~11,000行 → コンテキスト枯渇）

OK: 以下のように分割する
  レビュー1: video-player 内の UIUX + Data + Perf 整合性（3ファイル）
  レビュー2: video-player Figma spec vs 設計ドキュメント整合性（2-3ファイル）
  レビュー3: ホーム画面 ↔ 動画再生の共有要素整合性（依存マップ参照、該当セクションのみ）
  統合レビュー: 各分割レビューの結果を統合（レビュー結果ファイルのみ参照）
```

### 9.4 コンテキストメモの保管先

タスク切り替え時の要約メモは以下に保管する:

```
{project-root}/docs/context-memos/{role}-{task-id}-summary.md
```

例: `docs/context-memos/tech-leader-task15-summary.md`

### 9.5 既知の整合性チェックポイント

過去のレビューで発見された不整合パターン。新画面の設計時にも同種の問題が発生しやすいため、事前チェックリストとして使用する。

| # | チェック項目 | 発見元 |
|---|-------------|--------|
| 1 | Quality Score スケール（DB: 0-100 ↔ UI: 0.0-5.0）が全箇所で統一されているか | VR-5 |
| 2 | コメントフィールド名が `body` で統一されているか | P0 ISSUE-5 |
| 3 | JSON-LD の creator `@type` が `Organization`（AIChannel 準拠）か | P0 ISSUE-2 |
| 4 | MuxPlayer import が `@mux/mux-player-react/lazy` か | VR-3 |
| 5 | コンポーネント名の単数/複数形が統一されているか | VR-4 |
| 6 | Mux Data custom_1..3 が正規スキーマ（§10.3）と一致するか | VR-2 |
| 7 | レイアウト方式（タブUI）が全ドキュメントで統一されているか | VR-1 |
| 8 | カラー値が `#7A8390`（WCAG AA 4.5:1 準拠）で統一されているか | P0 ISSUE-1 |

---

## 10. tmux レイアウト設定

本プロジェクトのエージェント数: **5**（PM, tech-leader, designer, researcher, analyzer）

チーム起動前のリセット:

```bash
~/.claude/hooks/team-layout-reset.sh 5
```

レイアウトの詳細は `~/.claude/team-config.md` セクション 8 を参照。

---

## 最終更新

2026-02-24
