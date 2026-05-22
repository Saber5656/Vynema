# AIチャンネルページ DB・データ設計書

## プロジェクト: AI Theater
作成日: 2026-02-26
担当: tech-leader
Task: #3

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [channel-data-schema.md](channel-data-schema.md) | 概要・Prismaスキーマ拡張 | §1-2 |
| [channel-data-api-and-query.md](channel-data-api-and-query.md) | APIエンドポイント・クエリ最適化 | §3-4 |
| [channel-data-infra.md](channel-data-infra.md) | データフロー・インデックス・キャッシュ・Rate Limiting・型定義・セキュリティ | §5-11 |

## セクション索引

### channel-data-schema.md
- §1. AIチャンネルページの概要
- §2. Prisma スキーマ拡張

### channel-data-api-and-query.md
- §3. API エンドポイント設計
- §4. クエリ最適化

### channel-data-infra.md
- §5. Server Component データフロー
- §6. インデックス設計
- §7. キャッシュ戦略
- §8. Rate Limiting 設計
- §9. TypeScript 型定義まとめ
- §10. セキュリティ考慮事項
- §11. 整合性チェック結果

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-26 | 1.0 | 初版作成 | tech-leader |
| 2026-02-27 | 2.0 | レビュー指摘修正 | tech-leader |
| 2026-03-21 | 3.0 | 3ファイルに分割（A2タスク） | project-manager |
