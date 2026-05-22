---
created: 2026-03-07
agent: claude-code
directory: /Users/takagiyasushi/Library/Mobile Documents/iCloud~md~obsidian/Documents/Yasu's Vault/11_Projects/Youtube-for-AI
tags:
  - ai-prompt
  - claude
  - ai-theater
  - team-session
  - phase2-complete
---

> **次回チーム起動時の参照用**: このセッションでフェーズ2（詳細設計）が全6画面完了。フェーズ3（実装）移行はproject-ownerの承認待ち。

## Q: チームを起動してください

`~/dotfiles/claude/team-config.md` の §8 を確認し、シングルペインモードでチーム起動を実施。

### 起動手順
1. `~/.claude/hooks/team-layout-reset.sh 5` でリセット
2. `TeamCreate` で `ai-theater` チーム作成
3. 5エージェントを並列 spawn（project-manager, tech-leader, designer, researcher, analyzer）

### チーム構成
| エージェント | ロール | モデル |
|-------------|--------|--------|
| project-manager | タスク管理・整合性チェック | opus |
| tech-leader | DB設計・パフォーマンス設計 | opus |
| designer | UI/UX設計・Figmaスペック | sonnet |
| researcher | 技術調査・競合分析 | haiku |
| analyzer | パフォーマンス分析・メトリクス | sonnet |

全エージェントが「準備完了」を報告。

---

## Q: 代替案としてreviewerもSonnetのモデルを用いて起動してください

reviewer（Sonnet）を追加 spawn。Codex CLI（quality-control-manager）の代替として稼働。
チーム構成が6エージェントに拡張。

---

## Q: まずは現在のタスクを整理してください

project-manager にタスク整理を指示。PROJECT-STATUS.md を読み、以下を TaskCreate で登録：

### 登録されたタスク（全15件）

#### A. 検索機能 詳細設計（5タスク）
| ID | タスク | 担当 | 依存 |
|----|--------|------|------|
| #7 | UI/UX改善設計 | designer | なし |
| #8 | DB・データ設計 | tech-leader | なし |
| #9 | パフォーマンス設計 | analyzer | なし |
| #10 | Figmaデザインスペック作成 | designer | #7 |
| #11 | 詳細設計レビュー | reviewer | #7,#8,#9,#10 |

#### B. AI動画生成パイプライン 詳細設計（5タスク）
| ID | タスク | 担当 | 依存 |
|----|--------|------|------|
| #12 | UI/UX改善設計 | designer | なし |
| #13 | DB・データ設計 | tech-leader | なし |
| #14 | パフォーマンス設計 | analyzer | なし |
| #15 | Figmaデザインスペック作成 | designer | #12 |
| #16 | 詳細設計レビュー | reviewer | #12,#13,#14,#15 |

#### C. MVP着手前の必須修正（5タスク）
| ID | タスク | 担当 |
|----|--------|------|
| #17 | [ホーム] text-tertiary コントラスト比修正 | designer |
| #18 | [ホーム] 推薦理由表示のMVPデータソース定義 | tech-leader |
| #19 | [ホーム] Rate Limiting 最低限の実装方針決定 | analyzer |
| #20 | [動画再生] レイアウト基準の単一化 | designer |
| #21 | [動画再生] Mux Data custom フィールド統一 | tech-leader |

---

## 作業開始 → 検索機能の設計進行

レビュー担当を reviewer に変更（#11, #16）。researcher にパイプライン事前調査を指示。

### 検索機能レビュー結果: B+
| ID | 問題 | 解決方針 |
|----|------|---------|
| SEARCH-ISSUE-1 | 検索エンジン方式不整合 (pg_trgm vs tsvector+pg_trgm) | pg_trgm に統一 |
| SEARCH-ISSUE-2 | ページネーション不整合 (オフセット vs カーソル) | オフセットに統一 |
| SEARCH-ISSUE-3 | レンダリング方式不整合 (CSR vs SSR Streaming) | CSR に統一 |

#22 として修正タスクを作成、analyzer が対応 → 修正完了、reviewer 再確認 OK。

---

## researcher パイプライン事前調査 完了

### 重要な発見
- **Runway Gen-4 Turbo は Image to Video のみ** — Text to Video 非対応
- コスト: 5秒動画1本 = $0.25（月30本で$7.50）
- Veo 3.1 Fast は Runway の約3倍コスト → フォールバック専用
- BullMQ: SSE での進捗通知を推奨（MVP）

---

## Q: プランAでいきましょ / 修正着手してください

### Gen-4 Turbo 方針決定: (A) 2段パイプライン

| 案 | 月コスト(30本) | 予算比 |
|----|---------------|--------|
| **(A) 2段パイプライン** | **$8.40** | **17%** |
| (B) Gen-4.5 | $18.00 | 36% |
| (C) Veo 3.1 Fast | $22.50 | 45% |

tech-leader 推奨の (A) を project-owner が承認。

### 修正タスク
| Task | 担当 | 内容 |
|------|------|------|
| #23 | tech-leader | DB設計修正（画像生成ステップ + コスト + ステータス + Cron頻度） |
| #24 | analyzer | パフォーマンス設計修正（E2E再計算 + PIPE-ISSUE-1/2） |
| #25 | designer | UI/UX・Figma修正（ステージ数 6→7） |

全修正完了 → reviewer 再レビュー: **A- / Go判定**

---

## パイプラインレビュー最終結果

**総合評価: B → A-（修正後）**

高優先度3件（PIPE-ISSUE-1/2/3）全て解消:
- ジョブ構造: DB設計（3分割）に統一
- クォータ管理: DB設計（MonthlyQuota）に統一
- Cron頻度: Perf設計（1日1回）に統一

---

## フェーズ2 詳細設計 全体完了

| 画面 | レビュー評価 | ステータス |
|------|-------------|-----------|
| ホーム画面 | A- | 完了（必須修正3件解決済み） |
| 動画再生ページ | A- | 完了（必須修正2件解決済み） |
| AIチャンネルページ | B+→全対応済 | 完了 |
| 認証・ユーザー管理 | B+→A- | 完了 |
| 検索機能 | B+→修正済 | 完了 |
| AI動画生成パイプライン | B→A- | 完了 |

### フェーズ移行基準チェック
- [x] 全画面レビュー A- 以上
- [x] 高優先度課題 0 件
- [x] 必須修正 全反映
- [x] コスト $50/月 以内（$20-40）
- [ ] project-owner 承認（未取得）

---

## Q: 振り返りを行ってください

PM が全6メンバーから KPTA フィードバックを収集・統合。

### 出力物
- `docs/retrospective/2026-03-07-phase2-detailed-design.md`
- スキルファイル4件更新（PM/tech-leader/reviewer/designer）
- PROJECT-STATUS.md フェーズ2完了に更新

### KPTA サマリー
- **Keep**: 画面×5観点分解、依存マップ、指摘IDトラッキング、事前調査
- **Problem**: DB↔Perf不一致の頻発、API制約の発見遅延（Gen-4 Turbo）、ファイル肥大化
- **Action**: 中間同期ポイント必須化、API調査クロスチェック、ドキュメント分割ルール

---

## Q: シャットダウンしてください

全6エージェントに shutdown_request → 全員承認・終了。TeamDelete でリソースクリーンアップ。
メモリ（MEMORY.md）をフェーズ2完了状態に更新。

### 次のアクション
- project-owner のフェーズ3（実装）移行承認
- 実装フェーズ開始前の準備タスク（A1〜A5）の実施
