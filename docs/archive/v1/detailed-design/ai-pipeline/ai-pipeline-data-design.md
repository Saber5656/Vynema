# AI動画生成パイプライン DB・データ設計書

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: tech-leader
Task: #13

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [ai-pipeline-data-schema.md](ai-pipeline-data-schema.md) | 概要・Prismaスキーマ設計 | §1-2 |
| [ai-pipeline-data-queue-and-api.md](ai-pipeline-data-queue-and-api.md) | BullMQキュー・月間上限・外部AI生成API連携 | §3-5 |
| [ai-pipeline-data-infra.md](ai-pipeline-data-infra.md) | Mux連携・Cron・安全性チェック・フロー・インデックス・セキュリティ | §6-14 |

## セクション索引

### ai-pipeline-data-schema.md
- §1. AI動画生成パイプラインの概要
- §2. Prisma スキーマ設計

### ai-pipeline-data-queue-and-api.md
- §3. BullMQ ジョブキュー設計
- §4. 月間30本上限の管理ロジック
- §5. 外部AI生成API連携設計

### ai-pipeline-data-infra.md
- §6. Mux Upload API 連携
- §7. Cron トリガー設計
- §8. コンテンツ安全性チェック
- §9. 完全パイプラインフロー
- §10. インデックス設計
- §11. API エンドポイント設計（内部管理用）
- §12. セキュリティ考慮事項
- §13. Zod バリデーションスキーマ
- §14. 将来の拡張ポイント

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-07 | 2.0 | 2段パイプライン対応（Flux Schnell 画像生成 → Gen-4 Turbo Image to Video）、コスト修正（Runway $0.05/秒、Veo $0.15/秒）、Runway API ステータス値修正（THROTTLED/RUNNING）、Cron 頻度を1日1回に変更、§5.0 画像生成 API 追加、processGenerateImage 追加 | tech-leader |
| 2026-03-06 | 1.0 | 初版作成 | tech-leader |
| 2026-03-21 | 3.0 | 3ファイルに分割（A2タスク） | project-manager |
