# ホーム画面 DB・データ設計書

## プロジェクト: AI Theater
作成日: 2026-02-22
担当: tech-lead
Task: #6

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [home-data-schema-and-api.md](home-data-schema-and-api.md) | Prismaスキーマ・APIエンドポイント・クエリ最適化 | §1-3 |
| [home-data-cache-and-infra.md](home-data-cache-and-infra.md) | キャッシュ戦略・インデックス・データフロー・Mux連携・シードデータ | §4-8 |

## セクション索引

### home-data-schema-and-api.md
- §1. Prisma スキーマ定義
- §2. ホーム画面用 API エンドポイント設計
- §3. データ取得クエリ最適化

### home-data-cache-and-infra.md
- §4. キャッシュ戦略
- §5. インデックス設計
- §6. Server Component データフロー（ホーム画面）
- §7. Mux 連携データフロー
- §8. 初期シードデータ

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-22 | 1.0-1.2 | 初版〜フィールド追加 | tech-lead |
| 2026-02-23 | 1.2 | sectionReason フィールド追加 | tech-leader |
| 2026-03-07 | 1.3 | 推薦理由データフロー統合 | tech-leader |
| 2026-03-21 | 2.0 | 2ファイルに分割（A2タスク） | project-manager |
