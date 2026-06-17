# 動画再生ページ DB・データ設計書

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: tech-leader
Task: #5

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [video-player-data-schema.md](video-player-data-schema.md) | 概要・追加Prismaスキーマ | §1-2 |
| [video-player-data-api-and-query.md](video-player-data-api-and-query.md) | APIエンドポイント・クエリ最適化 | §3-4 |
| [video-player-data-infra.md](video-player-data-infra.md) | データフロー・インデックス・キャッシュ・OGP/SEO・セキュリティ | §5-12 |

## セクション索引

### video-player-data-schema.md
- §1. 動画再生ページの概要
- §2. 追加 Prisma スキーマ

### video-player-data-api-and-query.md
- §3. API エンドポイント設計
- §4. クエリ最適化

### video-player-data-infra.md
- §5. Server Component データフロー
- §6. インデックス設計
- §7. キャッシュ戦略
- §8. OGP/SEO 対応
- §9. 集計キャッシュ更新フロー
- §10. セキュリティ考慮事項
- §11. 用語マッピング: テーマ / ムード
- §12. Quality Score スケール変換

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0-1.5 | 初版〜レビュー対応 | tech-leader |
| 2026-03-07 | 1.6 | Mux Data カスタムディメンション相互参照追加 | tech-leader |
| 2026-03-21 | 2.0 | 3ファイルに分割（A2タスク） | project-manager |
