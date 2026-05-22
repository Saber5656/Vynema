# Task #4 調査報告書
## 動画再生ページ Mux Player最新仕様・競合UXパターン調査

**調査期間**: 2026-02-23
**担当**: researcher
**ステータス**: ✅ 完了

---

## 📊 調査結果サマリー

### 1. Mux Player React v3 最新APIリファレンス

#### コア機能

| 機能 | 詳細 |
|-----|------|
| **Custom UI/Themes** | Classic、Media Chrome themes、minimal、microvideo |
| **CSS Variables** | 15+ の制御可能要素（`--play-button`, `--seek-backward-button`等） |
| **CSS Parts** | `::part()` セレクタでの個別スタイリング対応 |
| **Accent Color** | デフォルト Mux Pink (#fa50b5)、ブランド色でオーバーライド可能 |

#### イベントハンドリング

- メディアローディング、再生制御、プレイヤーイベント用のコールバック
- 主要イベント：`onLoadStart`, `onPlay`, `onTimeUpdate`, `onPause`, `onEnded`, `onError`
- リアルタイムメタデータ取得対応

#### Stream Type対応

- `streamType` プロパティで `on-demand` または `live` を指定
- ライブストリーム用の最適化制御表示

**参考リンク**：
- [Mux Player React API reference](https://www.mux.com/docs/guides/player-api-reference/react)
- [Customize Mux Player](https://www.mux.com/docs/guides/player-customize-look-and-feel)
- [Mux Player Themes](https://www.mux.com/docs/guides/player-themes)

---

### 2. Mux Data（分析）の Next.js 15 統合

#### 統合方法

| 方法 | 詳細 |
|-----|------|
| **next-video Component** | Mux 公式の React コンポーネント（Next.js 向け最適化） |
| **自動分析トラッキング** | Mux Player が自動的に Mux Data へ再生分析を送信 |
| **カスタムドメイン** | 有料機能のため月$50予算では不要（デフォルト `litix.io` で十分） |

#### トラッキング対象データ

- 視聴回数、再生時間、ドロップレート
- プレイヤーイベント（再生、一時停止、スキップなど）
- ユーザーエンゲージメント

#### Next.js 15 との親和性

- React Server Components (RSC) 対応
- Server Actions との統合可能
- Edge Functions でのメタデータ処理にも対応
- Webhook での リアルタイム イベント取得可能

#### Mux Data metadata フィールド統合定義（tech-leader）

**参照ドキュメント**：
- PERF 設計（§10.2, L786-798）: 最小構成
- UIUX 設計（§6.1, L382-393）: カスタム拡張版

**統合版 metadata 実装**：

```typescript
// components/watch/VideoPlayer.tsx の <MuxPlayer> 内

metadata={{
  // ─── Mux 標準フィールド（snake_case） ───
  video_id: video.id,
  video_title: video.title,
  video_duration: String(video.duration),
  video_series: video.channel.name,        // AIChannel 名（organization）
  viewer_user_id: userId ?? "anonymous",
  page_type: "watch_page",

  // ─── AI Theater カスタムディメンション ───
  // ※ 正式スキーマは video-player-performance-design.md §10.3 が単一定義
  custom_1: video.aiModel,                          // 生成AIモデル名
  custom_2: String(video.qualityScore ?? ""),       // Quality Score raw値 (0-100)
  custom_3: video.channel.id,                       // AI チャンネルID
}}
```

**custom_N 割り当てルール**（video-player-performance-design.md §10.3 正式定義に準拠）：

| キー | フィールド | 用途 | 値の例 |
|------|----------|------|--------|
| `custom_1` | `video.aiModel` | モデル別視聴傾向・完了率の比較 | `"runway-gen4-turbo"` |
| `custom_2` | `video.qualityScore` (0-100) | 品質スコアと視聴完了率の相関分析 | `"85"` |
| `custom_3` | `video.channel.id` | チャンネル別エンゲージメント分析 | `"chn_abc123"` |

**⚠️ 整合性修正**（VR-2 + tech-leader フィードバック反映）：
- `video_series`: `video.channel.name` に統一（AIChannel モデル対応）
- `custom_2`: `video.moods[0]` → `video.qualityScore` に変更（VR-2 対応: 正式定義に統一）
- `custom_3`: `video.qualityScore` → `video.channel.id` に変更（VR-2 対応: チャンネル別分析が必須）
- すべての Mux 標準フィールドは snake_case、値は string 型

**参考リンク**：
- [Add Video to Next.js with Mux](https://www.mux.com/articles/adding-video-to-your-next-js-application)
- [Mux Integrations: Next.js](https://www.mux.com/docs/integrations/next-js)

---

### 3. 競合UXパターン分析（2026年最新）

#### YouTube

**特徴**：
- **プレイヤー中心設計**：「液晶ガラス」風セミトランスペアレント UI（Apple風）
- **新レイアウト**：3ピクセルの丸いボタン、より広い画面利用
- **サイドバー試験版**：2列レイアウトのテスト中（推奨動画を2段表示）

**問題点と学習点**：
- ❌ 拡張サイドバーで動画プレイヤーが圧縮される → **AI Theater では避けるべき**
- ✅ プレイヤー最優先の設計哲学が重要

**UI パターン**：
- 再生コントロール：セミトランスペアレント、ホバー時表示
- フルスクリーン：ビデオサイズ最大化

**参考リンク**：
- [YouTube New Player Design](https://chromeunboxed.com/youtube-is-getting-a-modern-makeover-with-a-new-ui-rolling-out-now/)

#### Vimeo

**特徴**：
- **Progressive Disclosure**：段階的な情報開示（ハイライト → クリック → 詳細）
- **メタデータ表示**：公開日、ユーザー名、動画概要を階層的に表示
- **レスポンシブプレイヤー**：自動レイアウト対応、柔軟なリサイズ

**UI パターン**：
- プレイヤー情報の段階的開示
- ユーザー情報とエンゲージメント機能の下部配置

**参考リンク**：
- [Vimeo UX Analysis](https://theblog.adobe.com/gabriel-topete-from-vimeo-on-the-future-of-video-in-ux-design/)
- [Vimeo Player API](https://github.com/vimeo/player.js)

#### Twitch

**特徴**：
- **チャット統合**：プレイヤーとの並列配置またはオーバーレイ対応
- **インタラクティブ要素**：ライブ統計、リアルタイムロードアウト、ヒートマップ
- **モバイル対応**：Live/Clips/Stories タブ整備
- **拡張性**：ブランドカラー・フォントのカスタマイズ対応

**UI パターン**：
- 右サイドバー：チャットまたはコメント表示
- 下部パネル：インタラクティブ統計・情報表示
- カスタマイズ可能なテーマ色

**参考リンク**：
- [Twitch Developer](https://dev.twitch.tv/docs/embed/)
- [Twitch Chat Integration](https://dev.twitch.tv/docs/embed/chat/)

#### Runway（Gen-4）

**特徴**：
- **プロンプト表示**：生成プロンプト、使用モデル（Gen-4 / Gen-4 Turbo）を UI に表示
- **メタデータ表示**：生成時間、処理コスト、プロヴェナンス情報（C2PA）表示
- **タイムライン + レイヤーベース**：複雑な編集に対応
- **API先行**：Web Platform は API ベースで開発

**UI パターン**：
- 生成パラメータの透明性表示
- タイムライン/レイヤーエディタ
- リアルタイム生成のプログレス表示

**参考リンク**：
- [Runway AI Platform](https://runwayml.com/)
- [Runway Provenance（C2PA）](https://runwayml.com/research/introducing-gen-3-alpha/)

#### Pika（2.5 Studio）

**特徴**：
- **シンプルUI/高機能**：ノークラッターな設計
- **タイムライン + レイヤーエディタ**：Runway と同様の進化
- **テンプレート＆プリセット**：初心者向けアクセスビリティ
- **モバイル対応**：Web/Mobile App 両対応

**UI パターン**：
- クリーンなインターフェース
- テンプレートの充実
- 直感的なドラッグ&ドロップ操作

**参考リンク**：
- [Pika 2.5 Review 2026](https://www.weshop.ai/blog/pika-ai-review-2026-still-the-king-of-creative-ai-video-generation/)

---

### 4. 動画メタデータの構造化データ（JSON-LD VideoObject）

#### 基本実装

```json
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "動画タイトル",
  "description": "動画説明",
  "thumbnailUrl": "サムネイル URL",
  "uploadDate": "2026-02-23",
  "duration": "PT1M30S",
  "contentUrl": "https://example.com/video.mp4",
  "embedUrl": "https://example.com/embed/video"
}
</script>
```

#### AI Theater用拡張メタデータ

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "動画タイトル",
  "description": "動画説明",
  "thumbnailUrl": "サムネイル URL",
  "uploadDate": "2026-02-23",
  "duration": "PT1M30S",
  "contentUrl": "https://example.com/video.mp4",
  "creator": {
    "@type": "Organization",
    "name": "Aurora",
    "url": "/channel/aurora"
  },
  "potentialAction": {
    "@type": "ViewAction",
    "target": "https://ai-theater.example.com/videos/{id}"
  },
  // AI Theater カスタム拡張フィールド
  "generationPrompt": "使用したプロンプト",
  "generationModel": "Runway Gen-4 / Veo",
  "processingTime": 150,
  "estimatedCost": 0.18,
  "provenance": "https://c2pa.org/verify/{certificate-id}"
}
```

**⚠️ 重要な整合性修正**（tech-leader フィードバック反映）：
- `creator["@type"]` を `Person` → `Organization` に変更（AIチャンネルは組織的存在）
- `creator["name"]` は実際のチャンネル名（"Aurora", "Nexus"等）を使用
- `creator["url"]` でチャンネルページへのリンクを追加

#### 配置と SEO効果

- **配置場所**：`<head>` タグ内（または `</body>` 直前）
- **SEO効果**：リッチリザルト対応、AI音声検索対応、メタデータ検索対応

**参考リンク**：
- [Schema.org VideoObject](https://schema.org/VideoObject)
- [JSON-LD Video SEO](https://jsonld.com/video/)

---

## 🎯 AI Theater 向け推奨設計

### レイアウト設計

#### デスクトップ：3段構成

```
┌─────────────────────────────────────────┐
│  動画プレイヤー（最優先・最大化）        │
│  Mux Player + カスタムUI                 │
│  - CSS Variables でテーマ色設定           │
│  - イベント取得：onPlay, onTimeUpdate    │
├─────────────────────────────────────────┤
│ [推薦] [クリエイター] [プロンプト] [コメント] │  ← タブUI
│ 下部パネルコンテンツ（切り替え可能）      │
│  - Vimeo式 Progressive Disclosure        │
│  - Runway式 AI メタデータ透明性表示      │
├─────────────────────────────────────────┤
│  関連動画・推奨リスト                    │
│  - Mux Data メトリクスを活用した推薦    │
└─────────────────────────────────────────┘
```

#### モバイル：下部タブ式

- **プレイヤー**：画面上部（フルサイズ）
- **下部タブ**：
  - 「推薦」→ 関連動画
  - 「クリエイター」→ プロフィール・フォロー
  - 「プロンプト公開」→ AI生成メタデータ
  - 「コメント」→ チャット

### UI/UX要件

#### ✅ 採用すべきパターン

| パターン | 出典 | 理由 |
|---------|-----|------|
| **Progressive Disclosure** | Vimeo | 段階的な情報開示で認知負荷軽減 |
| **AI メタデータ透明性** | Runway/Pika | AI生成コンテンツの信頼性向上 |
| **プレイヤー最優先** | YouTube新設計の教訓 | モバイル・デスクトップ対応性 |
| **下部タブUI** | モバイルUX最適化 | スマートフォンでのスクロール効率化 |

#### ❌ 避けるべきパターン

| パターン | 理由 |
|---------|------|
| **サイドバー拡張** | プレイヤーが圧縮される（YouTube の失敗例） |
| **左右分割レイアウト** | モバイルで不適切 |
| **過度なメタデータ表示** | 初期表示で認知負荷が高い |

---

## 📋 Task #4 完了チェックリスト

- ✅ Mux Player React v3 最新API仕様確認
- ✅ Mux Data Next.js 15 統合方法確認
- ✅ YouTube/Vimeo/Twitch UXパターン分析（2026最新）
- ✅ AI動画プラットフォーム（Runway/Pika）UIパターン分析
- ✅ JSON-LD VideoObject スキーマ仕様確認
- ✅ AI Theater 向け推奨設計提案

---

## 📚 参考リンク一覧

### Mux Player 公式ドキュメント
- [Mux Player React API reference](https://www.mux.com/docs/guides/player-api-reference/react)
- [Customize Mux Player](https://www.mux.com/docs/guides/player-customize-look-and-feel)
- [Mux Player Themes](https://www.mux.com/docs/guides/player-themes)
- [Add Video to Next.js with Mux](https://www.mux.com/articles/adding-video-to-your-next-js-application)
- [Mux Integrations: Next.js](https://www.mux.com/docs/integrations/next-js)

### 競合プラットフォーム分析
- [YouTube New Player Design](https://chromeunboxed.com/youtube-is-getting-a-modern-makeover-with-a-new-ui-rolling-out-now/)
- [Vimeo UX Analysis](https://theblog.adobe.com/gabriel-topete-from-vimeo-on-the-future-of-video-in-ux-design/)
- [Twitch Developer](https://dev.twitch.tv/docs/embed/)
- [Twitch Chat Integration](https://dev.twitch.tv/docs/embed/chat/)
- [Pika 2.5 Review 2026](https://www.weshop.ai/blog/pika-ai-review-2026-still-the-king-of-creative-ai-video-generation/)
- [Runway Provenance](https://runwayml.com/research/introducing-gen-3-alpha/)

### メタデータ・SEO
- [Schema.org VideoObject](https://schema.org/VideoObject)
- [JSON-LD Video SEO](https://jsonld.com/video/)

---

## 📝 次のステップ

### Task #3（project-manager）
本調査結果を既存設計ドキュメント（`docs/detailed-design/`）と照合

### Task #2（designer）
本調査結果（特に競合UXパターン・AI メタデータ表示）を Figma スペック作成に反映
- 推奨レイアウト（デスクトップ・モバイル）の Figma コンポーネント化
- タブUI・下部パネルの相互作用設計
- AI メタデータ表示のプログレッシブディスクロージャー設計

### Task #5（analyzer）
Mux Data の取得メトリクス・目標値をベンチマーク計画に組み込み
- 再生開始率 ≥ 85%
- 完了率 ≥ 65%
- バッファリング率 ≤ 2%

---

**作成日**: 2026-02-23
**作成者**: researcher
**最終更新**: 2026-02-23
