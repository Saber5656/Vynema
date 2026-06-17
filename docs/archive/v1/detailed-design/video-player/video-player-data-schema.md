# 動画再生ページ: スキーマ設計

> 元ファイル: [video-player-data-design.md](video-player-data-design.md) から分割（§1-2）

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: tech-leader
Task: #5

---

## 1. 動画再生ページの概要

### 1.1 ページURL

```
/watch/[id]
```

### 1.2 ページに表示するデータ

| セクション | データ | ソース |
|-----------|--------|--------|
| 動画プレーヤー | HLS ストリーム | Mux Player (`muxPlaybackId`) |
| 動画メタデータ | タイトル、説明、公開日、再生数 | Video モデル |
| AI 生成情報 | AIモデル、プロンプト、パラメータ | Video モデル (`aiModel`, `aiPrompt`, `aiParams`) |
| Quality Score 詳細 | 総合スコア + 2軸（MVP）/ 5軸（v2以降） | Video モデル (`qualityScore`, `qualityDetails`) |
| チャンネル情報 | 名前、アバター、登録者数 | AIChannel モデル |
| いいね/低評価 | カウント + 現在ユーザーの状態 | Like モデル + Video キャッシュ |
| コメント | スレッド型コメント一覧 | Comment モデル |
| 関連動画 | 推薦タブ/Tier 3 の推薦動画 | Video クエリ |
| 視聴者の操作 | いいね、コメント投稿、保存、共有 | Like, Comment, SavedVideo |

### 1.3 レンダリング戦略

```
動画再生ページ: SSR + ISR (revalidate: 3600秒)

理由:
- OGP/SEO 対応が必須（SNS シェア時のプレビュー表示）
- 動画メタデータは頻繁に変わらない → 1時間キャッシュで十分
- いいね数/コメント数はキャッシュされた値で初期表示 → クライアントで最新化
```

---

## 2. 追加 Prisma スキーマ

ホーム画面DB設計（home-data-design.md）で定義済みのモデルに加え、動画再生ページで必要な追加モデルを定義する。

### 2.1 CommentLike（コメントいいね）

```prisma
// =============================================
// CommentLike（コメントのいいね）
// =============================================
model CommentLike {
  id        String   @id @default(cuid())

  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  commentId String
  comment   Comment  @relation(fields: [commentId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([userId, commentId])  // 1ユーザー1コメントに1回
  @@index([commentId])
  @@map("comment_likes")
}
```

### 2.2 既存モデルへの追加リレーション

```prisma
// User モデルに追加
model User {
  // ... 既存フィールド
  commentLikes CommentLike[]
}

// Comment モデルに追加
model Comment {
  // ... 既存フィールド
  commentLikes CommentLike[]
}
```

### 2.3 ER図（動画再生ページ関連）

```
Video ──────────────── AIChannel
  │                        │
  ├── 1:N → Comment        ├── name, slug, avatarUrl
  │         ├── body       ├── subscriberCount
  │         ├── parentId → Comment (self-ref)
  │         ├── likeCount
  │         └── 1:N → CommentLike
  │                   └── userId
  │
  ├── 1:N → Like
  │         ├── type (LIKE/DISLIKE)
  │         └── userId
  │
  ├── 1:N → View
  │         ├── userId?
  │         └── watchedSeconds
  │
  ├── 1:N → SavedVideo
  │         └── userId
  │
  ├── M:N → Tag (VideoTag)
  │
  ├── qualityScore, qualityDetails
  ├── aiModel, aiPrompt, aiParams
  └── muxAssetId, muxPlaybackId
```

---

