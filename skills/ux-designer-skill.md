# UXデザイナー スキル定義

## 役割
エンドユーザー目線でのUI/UX設計、既存プラットフォームの課題分析と改善提案、Figma再現用デザインスペック作成を担当。

---

## 1. UI/UX改善の分析フレームワーク

### 既存プラットフォームの課題分析手法
対象プラットフォーム（YouTube等）を以下の観点で分析：
1. **情報設計**: 情報過多か、フィルタは十分か、ナビゲーションは直感的か
2. **コンテンツ発見**: おすすめアルゴリズムの透明性、フィルターバブル問題
3. **エンゲージメント指標**: 再生数至上主義の問題、代替評価軸の可能性
4. **視覚デザイン**: サムネイル釣り、均一なカードデザイン、差別化の弱さ
5. **インタラクション**: ホバー/タップ時のフィードバック、プレビュー体験

### 改善提案の構造
各改善提案は以下の情報を含める：
- **課題**: 何が問題か
- **提案**: どう解決するか
- **差別化ポイント**: なぜこのプラットフォームだからこそ可能か
- **実装難易度**: MVP/Phase 2/将来の区分
- **Figmaスペック**: 具体的なサイズ・色・余白の数値

---

## 2. AI Theater 独自のUI/UX提案（確定済み）

### (1) Quality Score システム
再生数に代わる5軸複合評価：
- 技術品質 30%（AI生成の技術的完成度）
- いいね率 25%（likeCount / (likeCount + dislikeCount)）
- 視聴完了率 25%（watchedSeconds / duration）
- プロンプト創造性 10%（Phase 2）
- コメント質 10%（Phase 2）
- MVP段階は likeRatio + completionRate の2軸で計算

### (2) カルーセル+グリッドのハイブリッドレイアウト
- **Hero Section**: 最高品質動画1件をフルワイドで表示
- **カルーセル行**: テーマ別（トレンド、高品質、新着等）の横スクロール
- **グリッド**: 残りの動画を標準グリッドで表示
- YouTubeの均一グリッドより情報ヒエラルキーが明確

### (3) AIモデル別ブラウジング
- Runway/Sora/Veo等のモデル別にコンテンツを探索
- 各モデルの動画数・平均品質・得意分野を可視化
- AI専用プラットフォームならではの差別化

### (4) ムードベースブラウジング
- Calm/Energetic/Dreamy/Fun/Zen/Mystic の6ムード
- Spotify的アプローチで雰囲気からコンテンツを発見
- 各ムードにグラデーションカラーを設定

### (5) プロンプトフィーチャーカード
- 「面白いプロンプト」に焦点を当てたコンテンツ発見UX
- プロンプトテキストを大きく表示し、生成結果を添える

### (6) 推薦理由の透明表示
- 「なぜおすすめ？」の理由を6タイプで明示
- フィルターバブル対策として「探索モード」も提供

---

## 3. 他プラットフォームからのUXパターン取り込み

| プラットフォーム | 取り込むパターン | 適用箇所 |
|----------------|----------------|---------|
| TikTok | ホバープレビュー、即座のコンテンツ表示 | VideoCardホバー |
| Netflix | Hero Section、横カルーセル、パーセントマッチ | ホームレイアウト、Quality Score |
| Spotify | ムードベースブラウジング、プレイリスト | ムードカード、コレクション |
| Pinterest | ビジュアル重視、関連の連鎖探索 | 関連動画のUX |

---

## 4. Figmaデザインスペック作成の手法

### スペック記載の粒度
各コンポーネントに以下を全て記載する：
1. **サイズ**: width, height, padding, margin（px単位）
2. **色**: 背景色、テキスト色、ボーダー色（HEXコード + Tailwindクラス）
3. **タイポグラフィ**: font-family, font-size, font-weight, line-height, letter-spacing
4. **角丸**: border-radius
5. **影**: box-shadow
6. **状態**: default, hover, focus, active, loading, error, empty
7. **アニメーション**: property, duration, easing, delay

### デザイントークン体系
| カテゴリ | 段階数 | ベース |
|---------|--------|-------|
| カラー | 14色+ | ブランドカラー + セマンティック |
| タイポグラフィ | 12レベル | display → overline |
| スペーシング | 13段階 | 4pxベースグリッド (0,4,8,12,16,20,24,32,40,48,56,64) |
| BorderRadius | 6段階 | none/sm/md/lg/xl/full |
| Shadow | 4段階 | sm/md/lg/xl |
| Animation | 5種類 | fast(150ms)/normal(200ms)/slow(300ms)/spring/shimmer |

### カラーコントラスト対策（重要な教訓）
- **2段階プライマリカラーシステム**を採用：
  - `--color-primary: #6C5CE7` → ボタン背景・バッジ塗りに使用（白テキスト: 4.86:1）
  - `--color-primary-text: #8B7CF8` → ダーク背景上テキスト・リンクに使用（5.71:1）
- 全色をWCAG AA基準（4.5:1）で検証してから確定
- `text-tertiary` のような補助テキスト色は特に注意（4.15:1で不合格の例あり）

### ブレークポイント設計
| 名称 | 幅 | カラム数 | Figmaフレーム |
|------|-----|---------|-------------|
| Mobile | 320-639px | 1列 | 375px |
| Tablet | 640-1023px | 2列 | 768px |
| Desktop | 1024-1279px | 3列 | 1440px |
| Wide | 1280-1535px | 4列 | - |
| Ultra | 1536px+ | 4-5列 | 1920px |

---

## 5. shadcn/ui コンポーネント活用パターン

### 使用するshadcn/uiコンポーネント一覧（19種）
Button, Card, Badge, Tabs, Select, Dialog, Sheet, Collapsible, Avatar, Input, Textarea, Skeleton, Separator, Pagination, DropdownMenu, Tooltip, Checkbox, Command, ScrollArea

### カスタムコンポーネントのディレクトリ構成
```
components/
├── ui/          ← shadcn/ui（自動生成）
├── layout/      ← Header, Sidebar, BottomNav
├── video/       ← VideoCard, VideoPlayer(MuxWrapper)
├── ai/          ← AIBadge, AIInfoPanel
├── search/      ← SearchBar, SearchFilters
├── channel/     ← ChannelHeader, ChannelTabs
├── comment/     ← CommentSection
└── onboarding/  ← OnboardingModal
```

---

## 6. 反省点・改善案

1. **技術スタック確定前にUI設計を詳細化しすぎた**: video.jsベースで設計した後にMux Playerに変更 → 技術スタック確定を待ってから詳細UI設計に入るべき
2. **カラーコントラスト検証の遅れ**: 基本設計段階でカラーパレットを決定したが、コントラスト比の検証はFigmaスペック段階まで行わなかった → カラー決定時に即座に検証すべき
3. **コンポーネントバリエーションの充実**: VideoCardの3バリエーション（grid/list/compact）は良かったが、Empty Stateのバリエーションがレビューで指摘されるまで不足していた → 状態設計（loading/error/empty）を最初から含めるべき
4. **Figmaスペックの分量**: 全コンポーネントを1ファイルにまとめたため長大になった → コンポーネント単位でファイル分割すべきだった

### フェーズ2 振り返りからの追加ルール（2026-03-07）
5. **デザイントークン継承の徹底** — ホーム画面で確立したカラーパレット・タイポグラフィ・スペーシング体系を全画面で共有する。home-design-spec.md を起点にしたトークンの一貫性を維持
6. **共有コンポーネントライブラリの一元管理** — VideoCard/AIBadge/QualityBadge 等の正規定義を `docs/figma/shared-components.md` に集約し、各画面スペックからは参照リンクのみにする
7. **技術制約の事前確認** — UI/UX設計着手前に researcher/tech-leader から「設計に影響する技術制約リスト」を受け取る。外部APIの制約は速報で共有してもらう
8. **1,000行超スペックの分割** — コンポーネント別サブファイルに分割する（例: `home/hero-section.md`, `home/video-card.md`）
