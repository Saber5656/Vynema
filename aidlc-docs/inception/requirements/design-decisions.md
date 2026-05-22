# 設計決定事項ログ

## プロジェクト: AI Theater
作成日: 2026-03-19
フェーズ: Inception > Requirements Analysis

---

## 決定済み事項

### DD-001: 設計と実装の進行順序
**決定**: 設計と実装は並行して行わない。
- バックエンド設計（APIインターフェース定義）とDBテーブル定義を先に完了させる
- データの型・整合性が確認できてから実装に着手する
- **影響**: 準備タスクA5（統合Prismaスキーマ作成）は実装開始の**必須前提条件**

---

### DD-002: Quality Score の表現方式
**決定**: 内部はパーセンテージ（0〜100）、UIは五つ星表示（0.5刻み・切り上げ）

**内部計算式（MVP）**:
```
qualityScore（DB）= likeRatio × 50 + completionRate × 50
※ 0〜100のFloat値で保存
```

**UI変換式**:
```
starRating = Math.ceil((qualityScore / 100 * 5) / 0.5) * 0.5
```

**変換例**:
| DB値（%） | 生の星値 | 表示（切り上げ0.5刻み） | 見た目 |
|-----------|---------|----------------------|--------|
| 84 | 4.2 | **4.5** | ★★★★☆（半分黄色） |
| 80 | 4.0 | **4.0** | ★★★★☆（ちょうど4つ） |
| 61 | 3.05 | **3.5** | ★★★☆☆（半分黄色） |
| 100 | 5.0 | **5.0** | ★★★★★ |
| 10 | 0.5 | **0.5** | ☆☆☆☆☆（半分黄色） |

**表示ルール**:
- 黄色の星: `floor(starRating)` 個
- 半分黄色の星: `starRating % 1 === 0.5` のとき 1個
- グレーの星: 残り

**影響するドキュメント**:
- `home-data-design.md` § qualityScore フィールド定義（0-100のまま正しい）
- `video-player-uiux-improvements.md` § Quality Score 表示（UI表現の変換式追加が必要）
- 共通 StarRating コンポーネントで一元実装すること

---

### DD-003: AI生成動画の長さ設定
**決定**: 動画長はシステム設定から変更可能。選択肢は **5秒 / 10秒 / 15秒**

**設定箇所**: `/admin/pipeline` の設定パネル（または環境変数 + UI）

**コスト影響**:
| 動画長 | Runway Gen-4 コスト/本 | 月30本の合計 |
|--------|----------------------|------------|
| 5秒 | ~$0.125（$0.025/秒） | ~$3.75 |
| 10秒 | ~$0.25 | ~$7.50 |
| 15秒 | ~$0.375 | ~$11.25 |

※ Runway Gen-4 Turbo の実際のレート要確認

**影響するドキュメント**:
- `ai-pipeline-uiux-improvements.md` に設定UIを追加
- `ai-pipeline-data-design.md` の PipelineJob モデルに `videoDurationSeconds: Int` フィールド追加確認
- コスト見積ドキュメントの動画長前提を「可変（デフォルト10秒）」に更新

---

### DD-004: サイドバーの表示制御
**決定**: ハンバーガーボタンで表示/非表示を切り替え可能にする

**動作仕様**:
- デフォルト: 表示（w-240相当）
- 折りたたみ時: アイコンのみ（w-16相当）or 完全非表示
- 状態は Zustand でクライアント側に保持（リロード後も維持するため localStorage 保存推奨）
- **全ページ共通コンポーネント**として実装（ホーム・動画再生・チャンネル等で統一）

**影響するドキュメント**:
- `home-uiux-improvements.md` の Sidebar 仕様を更新
- `video-player-uiux-improvements.md`・`channel-uiux-improvements.md` の「サイドバー廃止」記載を「ハンバーガーで制御」に修正（M-4不整合の解消）

---

### DD-005: おすすめ理由の表示
**決定**: **不要。実装しない。**
- VideoCard・セクションヘッダーともにおすすめ理由の表示を廃止
- `home-uiux-improvements.md` の RecommendationReason UI設計は削除
- `home-recommendation-source.md` は参考資料として残すが実装対象外
- `home-data-design.md` の `sectionReason` フィールドはAPIレスポンスから除外
- `VideoCardWithReason` 型は不要（`VideoCard` のみ使用）
