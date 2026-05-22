---
created: 2026-03-19
agent: claude-code
directory: /Users/takagiyasushi/Library/Mobile Documents/iCloud~md~obsidian/Documents/Yasu's Vault/11_Projects/Youtube-for-AI
tags:
  - ai-prompt
  - claude
  - ai-dlc
  - design-review
  - ai-theater
---

## Q: 先ほどcageというプロジェクトにてAI-DLCのフローを導入しました。https://github.com/awslabs/aidlc-workflows/pulse を参考にして現在のプロジェクトにAI-DLCを組み込んでください

まず現在のプロジェクト構造とcageプロジェクトのAI-DLC設定を確認します。

構造を把握しました。cageプロジェクトから `.aidlc-rule-details/` と `CLAUDE.md` をYoutube-for-AIプロジェクトにコピーし、`aidlc-docs/` の初期状態を作成します。

AI-DLCの導入が完了しました。以下が追加された構造です：

```
Youtube-for-AI/
├── CLAUDE.md                        ← AI-DLCワークフロー定義（cage から移植）
├── .aidlc-rule-details/             ← ルール詳細ファイル群
│   ├── common/                      （プロセス概要・セッション継続・コンテンツ検証等）
│   ├── inception/                   （ワークスペース検出・要件分析・ユーザーストーリー等）
│   ├── construction/                （機能設計・NFR・コード生成等）
│   ├── extensions/security/         （セキュリティベースライン制約）
│   └── operations/
└── aidlc-docs/                      ← ドキュメント出力先
    ├── aidlc-state.md               ← ワークフロー状態トラッキング
    ├── audit.md                     ← 監査ログ
    ├── inception/                   （plans・requirements・user-stories・application-design）
    ├── construction/                （plans・build-and-test）
    └── operations/
```

**cageとの違い（Youtube-for-AI向けの調整）：**
- `aidlc-state.md` にフェーズ2完了済みのコンテキストを記載
- セキュリティExtensionはデフォルト有効（認証はClerk委譲のためSECURITY-02は外部依存として記録）
- 既存の `docs/` 配下の詳細設計はReverse Engineering で活用できる状態

次にこのプロジェクトで開発作業を始める際は、`CLAUDE.md` のワークフローに従い、Workspace Detection → Requirements Analysis の流れで進めます（既存ドキュメントがあるためBrownfieldとして扱われます）。

---

## Q: 現在の設計および説明資料を参照して不明点を洗い出してください

AI-DLCのInception > Workspace Detection から開始します。まず既存ドキュメントを全体的に確認します。

調査完了しました。設計ドキュメント45ファイルを横断して洗い出した不明点を優先度別に整理します。

---

## 不明点・未解決事項一覧

### 🔴 高優先度（実装前に確定が必要）

| # | 箇所 | 不明点 |
|---|------|--------|
| H-1 | 認証設計 | `auth-uiux` でOAuth 2種のみ確定したが、`auth-data-design` の UserモデルにEmail/passwordHash フィールドが残っているか未確認。Clerk Dashboard の設定と不整合の可能性 |
| H-2 | おすすめ理由 | `home-uiux` で RecommendationReason 6タイプを設計しているが、`home-data-design` の `sectionReason` フィールドの**取得ロジックが未定義**。Phase 1 でどのテキストをどのクエリで返すか不明 |
| H-3 | Mux Webhook署名 | `home-data-design` に「署名検証（省略）」コメントがある。本番で必須だがどのライブラリ（`svix`等）で実装するか方針なし |
| H-4 | 準備タスクA5 | **統合Prismaスキーマが存在しない**。各画面のDB設計は個別ドキュメントに分散しており、スキーマ間の整合性（外部キー・インデックス重複等）が未検証 |

---

### 🟡 中優先度（実装中に判断が必要）

| # | 箇所 | 不明点 |
|---|------|--------|
| M-1 | Quality Score | `home-data-design` は `likeRatio × 50 + completionRate × 50`、`video-player-uiux` は `likeRatio × 0.5 + completionRate × 0.5` と表記ゆれあり。**スケールが 0-100 か 0-5.0 か不統一** |
| M-2 | Mood の DB値 | UIに Zen / Mystic があるが Prisma モデルの `Video.moods: String[]` に許容値のEnum定義なし。**DB制約なしで自由文字列になるリスク** |
| M-3 | 動画の長さ前提 | コスト見積は「10秒動画」前提、UIは [12:34] のような数分動画も想定。**実際の動画長が不明確で生成コスト・Mux配信コストの見積が変動する** |
| M-4 | サイドバー方針 | ホーム画面はサイドバーあり（w-240）、動画再生・チャンネルはサイドバー廃止。**全ページ共通レイアウトの方針が統一されていない** |
| M-5 | 検索API | UI/Figmaには検索バーがあるが、`home-data-design` に `/api/search` エンドポイントの詳細設計がない。**日本語形態素解析対応（pg_trgm or pg_fts）の方針不明** |
| M-6 | コスト上限 | BullMQ でのジョブ生成上限・月次Mux配信量の**アラート/ガード実装方針が未設計**。予算超過時の自動停止ロジックなし |

---

### 🟢 低優先度（Phase 2以降でよい）

| # | 箇所 | 不明点 |
|---|------|--------|
| L-1 | AIBadge | `aria-label` 未定義。スクリーンリーダーで「AI生成コンテンツ」と読まれない |
| L-2 | 無限スクロール | `aria-live` 未定義。読み込み完了通知がスクリーンリーダーに届かない |
| L-3 | `text-tertiary` 色 | `#6E7681 on #161B22` = 4.15:1（WCAG AA 4.5:1 未達）。使用箇所の洗い出しが必要 |
| L-4 | Hero Section | LCPの最大要因にも関わらず `priority={true}` の明示記載なし |
| L-5 | Vercel Hobby制限 | 商用利用不可のため本番時に Pro ($20/月) 必須 → 月額合計 $40-60 に膨張。移行タイミング未定 |
| L-6 | C2PA対応 | EU AI Act 対応でプロヴェナンス表示が将来必要になるが、設計未着手 |
| L-7 | VideoStatus | `MODERATION` ステータスがスキーマにあるが、自動/手動モデレーションの具体的フローが未設計 |

---

## 確認が必要な質問

これらの中で判断が必要なものをまとめると：

1. **H-2: おすすめ理由** — Phase 1は固定テキスト（「今日急上昇中」等）でよいか？
2. **H-4: 統合スキーマ** — 準備タスクA5を実装開始前に完了させるか、実装と並行するか？
3. **M-1: Quality Score** — スケールは 0.0〜5.0（星評価的） か 0〜100（パーセント的）か？
4. **M-3: 動画長** — MVP の生成動画はすべて何秒固定か（5秒、10秒、15秒など）？
5. **M-4: サイドバー** — 全ページでサイドバーなし（コンテンツ最大化）で統一するか？
