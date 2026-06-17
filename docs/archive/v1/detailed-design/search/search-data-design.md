# 検索機能 DB・データ設計書

## プロジェクト: AI Theater
作成日: 2026-03-06
担当: tech-leader
Task: #8

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [search-data-schema-and-index.md](search-data-schema-and-index.md) | 概要・全文検索エンジン・API・Prismaスキーマ・検索インデックス | §1-5 |
| [search-data-query-and-cache.md](search-data-query-and-cache.md) | 検索クエリ・検索履歴・人気検索ワード・TanStack Queryキャッシュ | §6-9 |
| [search-data-infra.md](search-data-infra.md) | データフロー・Zodスキーマ・セキュリティ・AIモデルフィルタ・拡張ポイント | §10-14 |

## セクション索引

### search-data-schema-and-index.md
- §1. 検索機能の概要
- §2. 全文検索エンジンの選定
- §3. API エンドポイント設計
- §4. Prisma スキーマ拡張
- §5. 検索インデックス設計

### search-data-query-and-cache.md
- §6. 検索クエリ設計
- §7. 検索履歴の保存設計
- §8. 人気検索ワードの設計
- §9. TanStack Query キャッシュ設計

### search-data-infra.md
- §10. Server Component データフロー
- §11. Zod バリデーションスキーマ
- §12. セキュリティ考慮事項
- §13. AIモデルフィルタの選択肢
- §14. 将来の拡張ポイント

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-03-06 | 1.0 | 初版作成 | tech-leader |
| 2026-03-21 | 2.0 | 3ファイルに分割（A2タスク） | project-manager |
