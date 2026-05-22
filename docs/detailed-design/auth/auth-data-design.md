# 認証・ユーザー管理 DB・データ設計書

## プロジェクト: AI Theater
作成日: 2026-02-28
担当: tech-leader
Task: #12

---

> **本ファイルは目次です。** 各セクションの詳細は以下のサブファイルを参照してください。

## サブファイル一覧

| ファイル | 内容 | セクション |
|---------|------|-----------|
| [auth-data-schema-and-sync.md](auth-data-schema-and-sync.md) | 概要・Prismaスキーマ・Clerk連携設計 | §1-3 |
| [auth-data-api-endpoints.md](auth-data-api-endpoints.md) | API エンドポイント設計（CRUD・設定タブ） | §4 |
| [auth-data-security-and-infra.md](auth-data-security-and-infra.md) | Middleware・RLS・セッション・Rate Limiting・GDPR・型定義・セキュリティ | §5-14 |

## セクション索引

### auth-data-schema-and-sync.md
- §1. 認証・ユーザー管理の概要
- §2. Prisma スキーマ: User モデル拡張
- §3. Clerk ↔ Supabase 連携設計

### auth-data-api-endpoints.md
- §4. 認証関連 API エンドポイント設計
  - §4.1 エンドポイント一覧
  - §4.1.1 /settings タブ別 API・データ設計
  - §4.2 プロフィール取得
  - §4.3 プロフィール更新
  - §4.4 アカウント削除
  - §4.5 フォロー中チャンネル一覧
  - §4.6 保存済み動画一覧
  - §4.7 視聴履歴
  - §4.8 /settings タブ別まとめ

### auth-data-security-and-infra.md
- §5. Clerk Middleware 設計
- §6. Supabase RLS ポリシー全体設計
- §7. セッション管理・トークンリフレッシュ戦略
- §8. Rate Limiting 設計
- §9. GDPR / アカウント削除フロー
- §10. インデックス設計
- §11. TypeScript 型定義まとめ
- §12. セキュリティ考慮事項
- §13. 環境変数一覧
- §14. 整合性チェック結果

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-28 | 1.0 | 初版作成 | tech-leader |
| 2026-02-28 | REV-2 | レビュー指摘修正（SEC-ISSUE-1, CONS-ISSUE-1, US-ISSUE-1, CONS-ISSUE-2, SEC-ISSUE-3） | tech-leader |
| 2026-03-21 | 2.0 | 3ファイルに分割（A2タスク） | project-manager |
