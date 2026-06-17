# Task #12 調査報告書
## AIチャンネルページ 競合分析・UXパターン調査

**調査期間**: 2026-02-23
**担当**: researcher
**ステータス**: ✅ 完了

---

## 📊 調査結果サマリー

### 1. YouTube チャンネルページ構成要素（2026年最新）

#### カスタマイズ可能セクション

- **Home タブ**: 最大12個のカスタムセクション設定可能
- **デフォルト表示セクション**:
  - Short videos（Shorts）
  - Uploads（動画アップロード）
  - Created playlists（プレイリスト）
  - Subscriptions（登録チャンネル）

#### フィーチャーコンテンツ要素

| 要素 | 機能 | 用途 |
|------|------|------|
| **チャンネルトレーラー** | 動画自動再生 | 未登録ユーザー向けの導入 |
| **フィーチャー動画** | 特定動画ピン | チャンネルの代表作強調 |
| **プロフィール画像** | ブランドロゴ | チャンネル認識 |
| **バナー画像** | 大型ヘッダー | ブランディング |
| **チャンネル説明** | テキスト | 動画内容の概要説明 |

#### セクションタイプ

- **動画グリッド**: 公開動画一覧（時系列逆順）
- **プレイリスト**: シリーズ化されたコンテンツ
- **Shorts**: 短編動画専用セクション
- **ライブ配信**: 配信予定・過去配信
- **コミュニティクリップ**: ファンによる切り抜き動画

**参考リンク**: [YouTube Channel Customization](https://support.google.com/youtube/answer/3219384?hl=en)

---

### 2. Twitch チャンネルページのUXパターン

#### プロフィール構成仕様

| 要素 | 仕様 | 推奨フォーマット | 備考 |
|------|------|-----------------|------|
| **プロフィールバナー** | 1200×480px | PNG-24 | Dark/Light Mode対応 |
| **パネル幅** | 固定 320px | — | 複数パネル設置可能 |
| **パネル数** | 最大制限なし | — | スクロール対応 |
| **アニメーション** | GIF・ループ動画対応 | MP4, GIF, APNG | 微細な動きが効果的 |

#### パネル推奨配置順序（エンゲージメント最適化）

1. **About Me パネル**: プロフィール情報、自己紹介
2. **Social Links パネル**: Twitter、Discord、YouTube等
3. **Donate/Support パネル**: 支援ボタン、Tipping機能
4. **Schedule パネル**: 配信予定
5. **Rules パネル**: チャンネルルール

#### パネルトレンド（2026年）

**Extension Panels（動的パネル）**:
- Spotify Now Playing（現在再生中の楽曲）
- Leaderboards（サポーターランキング）
- Games Integration（ゲームスコア表示）
- Alerts（フォロー・チップ通知）

**アニメーション効果**:
- ネオンサイン風の点滅
- 浮遊・スライドエフェクト
- グラデーション変化
- パーティクル効果

**参考リンク**: [Twitch Graphics Guide 2026](https://www.streamscheme.com/twitch-graphics/)

---

### 3. AI生成プラットフォームのクリエイターページUI

#### Runway（Gen-4）

**UI デザイン哲学**:
- **プロジェクト中心**: タイムライン + レイヤーベースのエディタ
- **モデル透明性**: Gen-4、Gen-4 Turbo等を明確に表示
- **機能ショーケース**: テキスト→動画、画像→動画、オブジェクト削除等をビジュアル化

**クリエイターページの要素**:
- プロジェクト一覧（グリッド表示）
- 使用モデル・バージョン表示
- 生成パラメータ（プロンプト・品質設定）の編集可能なUIパネル
- APIドキュメント・統合ガイド
- コラボレーション機能（プロジェクト共有）

#### Pika（Studio）

**UI デザイン哲学**:
- **シンプル・高機能**: ノークラッターなインターフェース
- **テンプレート先行**: プリセットテンプレート＆スタイルから開始
- **ワンタップエクスポート**: Reels、TikTok、Shorts への直接書き出し

**クリエイターページの要素**:
- テンプレートギャラリー
- 最近のプロジェクト一覧
- 生成済み動画ライブラリ
- スタイル・ムード別の動画分類
- エクスポート履歴とSNS連携ステータス
- コミュニティ機能（Discord連携）

**参考リンク**:
- [Runway Platform](https://runwayml.com/)
- [Pika AI Platform](https://pika.art/)

---

### 4. AI Theater のAIチャンネルの独自性

#### 人間クリエイターとの根本的な違い

| 項目 | 人間クリエイター | AI エージェント（AI Theater） |
|------|------------------|--------------------------|
| **プロフィール** | 顔写真・プロフィール文 | **AIエージェント情報**: 名前（Aurora等）、生成モデル、専門領域 |
| **統計情報** | 動画本数、総再生時間、登録者数 | **同上 + AI生成統計**: 総生成本数、総処理時間（秒）、推定総コスト（ドル） |
| **コンテンツメタデータ** | タイトル・説明文・タグ | **AI生成メタデータ**: 使用プロンプト、使用モデル（Runway Gen-4/Veo）、処理時間、品質スコア |
| **プロヴェナンス** | 不要 | **C2PA認証情報**: コンテンツ生成の透明性・検証可能性 |
| **プロフィール特性** | SNSリンク・連絡先・経歴 | **AIエージェント仕様**: 使用可能モデル一覧、得意なムード/テーマ、品質スコア範囲、生成パターン例 |

#### チャンネルページの差別化ポイント

1. **AIエージェント情報の明確表示**:
   - 「Aurora は Runway Gen-4 Turbo で構築された AI エージェント」
   - 主要モデル、サポートモデル一覧
   - 生成時間の平均値、品質スコア範囲

2. **生成プロセスの透明性**:
   - 各動画に「プロンプト開示」ボタン
   - 使用モデル、処理時間、推定コスト表示
   - ユーザーが同じプロンプトで再生成できる機能（将来）

3. **品質スコア視覚化**:
   - チャンネル全体の平均Quality Score（ゲージ表示）
   - ムード別、処理時間別の品質分布グラフ
   - 「Top Quality Videos」セクション

4. **ムード・スタイル別フィルタリング**:
   - 「Calm」「Energetic」「Cinematic」等のカテゴリ分類
   - ユーザーが好みのスタイル動画を検索可能

---

### 5. チャンネルページに必要なデータ項目

#### チャンネル基本情報

```typescript
interface AIChannel {
  id: string;
  name: string;                    // チャンネル名（"Aurora"等）
  description: string;             // チャンネル説明
  profileImage: string;            // プロフィール画像URL（AIアバター等）
  bannerImage: string;             // バナー画像URL

  // AIエージェント固有
  aiModel: string;                 // 使用AIモデル（"runway-gen4-turbo"等）
  moods: string[];                 // 得意なムード配列（["calm", "energetic"]等）
  specializations?: string[];      // 専門領域（["cinematic", "animation"]等）

  createdAt: Date;                 // チャンネル開設日
  updatedAt: Date;
}
```

#### チャンネル統計情報

```typescript
interface ChannelStatistics {
  channelId: string;

  // ビュー統計
  totalVideos: number;             // 公開済み動画数
  totalViewCount: number;          // 総再生数
  followerCount: number;           // 登録者数
  engagementRate: number;          // エンゲージメント率（%）

  // AI生成統計
  totalGenerationTime: number;     // 総生成時間（秒）
  totalEstimatedCost: number;      // 推定総コスト（ドル）
  averageGenerationTime: number;   // 平均生成時間（秒）
  averageQualityScore: number;     // 平均Quality Score（0-100）

  // メタデータ
  lastUpdated: Date;
}
```

#### エージェント仕様情報

```typescript
interface AIAgentSpecs {
  channelId: string;

  // モデル情報
  primaryModel: string;            // 主要AIモデル
  supportedModels: string[];       // サポートモデル一覧

  // 品質スコア統計
  qualityScoreRange: {
    min: number;                   // 最低スコア
    max: number;                   // 最高スコア
    average: number;               // 平均スコア
  };

  // ムード別統計
  moodPreferences: {
    [mood: string]: {
      count: number;               // このムードの動画数
      avgQualityScore: number;     // ムード別平均スコア
      avgGenerationTime: number;   // ムード別平均生成時間
    };
  };

  // 生成パターン統計
  generationStats: {
    totalPrompts: number;          // 総プロンプト数
    uniquePrompts: number;         // ユニークプロンプト数
    averageProcessingTime: number; // 平均処理時間（秒）
    promptVariance: number;        // プロンプト多様性スコア
  };
}
```

#### UI表示要素

**プロフィールセクション**:
- チャンネル名、説明
- フォロー/登録ボタン
- AIエージェント情報バッジ（「Runway Gen-4 Turbo」）

**統計ダッシュボード**:
- 動画数、総再生数、登録者数
- 平均Quality Score（ゲージ表示）
- 総生成時間、推定総コスト

**AIエージェント仕様セクション**:
- 使用可能モデル一覧
- 得意なムード（タグ表示）
- 品質スコア分布グラフ

**動画グリッド**:
- サムネイル画像
- タイトル
- 再生数、Quality Score
- 生成日、使用モデル（ホバー時表示）

**メタデータ表示パネル**（動画詳細ページ）:
- 生成プロンプト
- 使用モデル、処理時間
- 推定コスト（任意）
- C2PA認証リンク

---

## 🎯 AI Theater 向け推奨設計ポイント

### ✅ 採用すべきパターン

| パターン | 出典 | 理由 | 実装例 |
|---------|-----|------|--------|
| **セクションカスタマイズ** | YouTube | コンテンツの柔軟な構成 | Home 最大12セクション |
| **パネル配置** | Twitch | 統計情報の効率的な表示 | 左右パネルで仕様・統計 |
| **AI メタデータ透明性** | Runway/Pika | 生成プロセスの信頼性向上 | プロンプト、モデル、コスト表示 |
| **品質スコア視覚化** | AI Platform | AIエージェントの実力表示 | ゲージ・グラフ表示 |
| **ムード別フィルタリング** | AI Platform | ユーザーの好みに応じた検索 | タグベースのセクション分類 |

### ❌ 避けるべきパターン

| パターン | 理由 |
|---------|------|
| **人間クリエイター向けプロフィール** | AIエージェントには顔写真、SNSリンク不要 |
| **収益化情報・アナリティクス公開** | 個人開発予算制約により実装不要 |
| **複雑なエディタUI** | ユーザーは視聴者のため、編集機能は不要 |

---

## 📋 次のステップ

### designer（Task #?)
チャンネルページのFigmaワイヤフレーム設計
- セクション構成（Home、Videos、About、Community等）
- パネルレイアウト（プロフィール、統計、AIエージェント仕様）
- 動画グリッドのレスポンシブ設計

### tech-leader（DB設計）
DB スキーマの `AIChannel` モデルにデータ項目を追加
- `aiModel`, `moods`, `specializations` フィールド
- `ChannelStatistics` テーブルの統計フィールド
- `AIAgentSpecs` テーブルの仕様フィールド

### analyzer（パフォーマンス計測）
チャンネルページのパフォーマンス計測指標を策定
- 動画グリッドのLCP目標値
- パネル読み込み時間
- Mux Data チャンネル別メトリクス集計

---

## 📚 参考リンク一覧

### YouTube
- [YouTube Channel Customization](https://support.google.com/youtube/answer/3219384?hl=en)
- [YouTube Layout Best Practices 2026](https://videoboosters.club/2026/02/09/youtube-layout/)

### Twitch
- [Twitch Graphics Guide 2026](https://www.streamscheme.com/twitch-graphics/)
- [Twitch Channel Page Setup](https://link.twitch.tv/ChannelPageSetup)

### AI Platforms
- [Runway AI Platform](https://runwayml.com/)
- [Pika AI Platform](https://pika.art/)

### Creator Analytics
- [SocialBlade Creator Statistics](https://socialblade.com/)
- [YouTube Engagement Rate Calculator](https://www.1stcollab.com/tools/youtube-engagement-calculator)
- [Creator Engagement Metrics](https://favikon.com/blog/how-to-calculate-engagement-rate-of-any-creator-on-any-social-media)

---

**作成日**: 2026-02-23
**作成者**: researcher
**最終更新**: 2026-02-23
