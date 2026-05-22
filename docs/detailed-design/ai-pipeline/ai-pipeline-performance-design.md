# AI動画生成パイプライン パフォーマンス設計書

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: analyzer
Task: #14

**前提: 個人開発レベルの予算制約（月額$50以下目標）。AI動画生成コストが最大の支出項目。**

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [ai-pipeline-perf-architecture.md](ai-pipeline-perf-architecture.md) | アーキテクチャ・BullMQ・Railway・Runway Rate Limiting | §1-4 |
| [ai-pipeline-perf-optimization.md](ai-pipeline-perf-optimization.md) | リトライ戦略・コスト最適化・Muxアップロード・Cron・モニタリング | §5-11 |

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成 | analyzer |
| 2026-03-07 | 2.0 | 2段パイプライン対応 + DB設計整合 | analyzer |
| 2026-03-21 | 3.0 | 2ファイルに分割（A2タスク） | project-manager |
