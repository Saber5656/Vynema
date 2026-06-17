# Figma MCP 技術調査レポート

- 調査日: 2026-02-28
- 担当: researcher
- 目的: `docs/figma/` UI画像生成手段の評価・Playwright MCP との比較

---

## 概要

Figma MCP（Model Context Protocol）は Figma 公式が 2026年1月から提供する、AI エージェントと Figma デザインを連携させるプロトコル。**デザイン → コード方向の片方向自動化**に特化しており、逆方向（Markdown → Figma 自動生成）は非対応。

---

## 種類と機能比較

| 項目 | 公式リモート版 | 公式デスクトップ版 | @rui-branco/figma-mcp |
|------|--------------|-----------------|----------------------|
| セットアップ | ブラウザのみ可 | Figma デスクトップ必須 | Node.js 18+ |
| 認証方式 | OAuth 2.0 | Figma デスクトップ内 | Figma API Token |
| デザイン読取 | ✅ | ✅ | ✅ |
| React/Tailwind コード生成 | ✅ | ✅ | ✅ |
| PNG/SVG/JPG エクスポート | ✅ | ✅ | ✅ 専門（バッチ対応） |
| 変数・デザイントークン抽出 | ✅ | ✅ | ✅ |
| generate_figma_design | ✅（リモートのみ） | ❌ | ❌ |
| Markdown → Figma 自動生成 | ❌ | ❌ | ❌ |
| 料金 | Figma 有料プラン | Figma 有料プラン | 無料 |

---

## 主要ツール（公式版）

| ツール名 | 機能 | 出力 |
|---------|------|------|
| `get_design_context` | フレーム・コンポーネント構造、レイアウト、テキストスタイル抽出 | React + Tailwind コード |
| `get_variable_defs` | カラー、スペーシング、タイポグラフィ変数取得 | JSON |
| `get_code_connect_mappings` | Figma Node ID ↔ コードベースコンポーネントのマッピング | JSON |
| `get_screenshot` | 選択フレームの PNG 画像（base64） | バイナリ |
| `generate_figma_design` | ブラウザ実行中の HTML UI を Figma レイヤーに変換（リモートのみ） | Figma Design |

---

## Claude Code セットアップ

### リモート版（推奨）

```bash
# プロジェクトスコープ
claude mcp add --transport http figma https://mcp.figma.com/mcp

# 全プロジェクト共通
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```

### 認証

1. Claude Code で `/mcp` コマンド実行
2. `figma` を選択 → `Authenticate`
3. OAuth 2.0 認可画面で `Allow Access`
4. "Authentication successful" を確認

### 使用方法

```
# Figma ファイル URL を Claude Code に貼り付けるだけ
https://www.figma.com/design/xxxxxxx/...?node-id=...
```

---

## できること・できないこと

### ✅ できること

- Figma 上の既存デザインから React/Tailwind コードを自動生成
- デザイントークン（カラー・スペーシング等）を JSON で抽出
- フレームを PNG/SVG/JPG でエクスポート（@rui-branco 版はバッチ対応）
- Code Connect で Figma ↔ コードベースのマッピングを保守
- `generate_figma_design` でブラウザ上の HTML を Figma レイヤー化（リモート版限定）

### ❌ できないこと

- **Markdown スペックから Figma デザインを自動生成**（MCP では非対応）
- Figma デザインをプログラム経由で新規作成・編集
- 複数ファイルの同時並列参照（制限あり）

### Markdown → Figma の代替手段

- Figma 公式プラグイン「[Markdown to Figma](https://www.figma.com/community/plugin/1577586353345859855/markdown-to-figma)」（手動操作、MCP 非対応）
- HTML 経由の間接変換: Markdown → HTML 生成 → `generate_figma_design` で取り込み（非効率）

---

## 料金プラン別制限

| 項目 | Starter（無料） | Professional（$12/月） |
|------|----------------|----------------------|
| MCP ツール呼び出し | 6回/月 | 無制限 |
| AI クレジット（3月26日以降） | 500/月（150/日上限） | 1,500/月 |
| デスクトップサーバー | ❌ | ✅（Dev/Full Seat） |
| リモートサーバー | ✅ | ✅ |

---

## Playwright MCP との使い分け指針

| ユースケース | 推奨 | 理由 |
|-----------|------|------|
| Figma デザインから React コンポーネント実装 | **Figma MCP** | 確定デザインから正確なコード生成 |
| デザイントークン（カラー・スペーシング）抽出 | **Figma MCP** | 変数定義を直接取得 |
| 実装後の視覚比較・レグレッション検証 | **Playwright MCP** | 実ブラウザレンダリングが必要 |
| レスポンシブデザイン検証 | **Playwright MCP** | Figma はモック検証のみ |
| CI/CD 統合の自動視覚テスト | **Playwright MCP** | ヘッドレス実行可能 |
| Markdown スペック → UI 画像生成 | **Playwright + カスタムスクリプト** | Figma MCP は Markdown 非対応のため |

### 推奨ワークフロー（設計検証パイプライン）

```
1. Figma MCP でデザイン抽出
         ↓
2. Claude が React コード生成
         ↓
3. Playwright MCP でスクリーンショット
         ↓
4. Figma 設計 vs 実装を視覚比較
         ↓
5. 差異があれば Figma 修正 → 1 に戻る
   問題なければリリース
```

---

## AI Theater プロジェクトへの活用方針

| 目的 | 手段 | 備考 |
|------|------|------|
| `docs/figma/` の Markdown スペックから UI 画像生成 | **Playwright + CLIスクリプト** | Figma MCP は非対応のため |
| 実装フェーズでのデザイン → コード自動生成 | **Figma MCP（公式リモート版）** | 設計確定後に導入 |
| 実装後のビジュアルリグレッション | **Playwright MCP** | CI/CD パイプライン統合 |

**月額予算への影響**: Figma Pro 利用時は追加費用なし。未利用時は +$12/月。

---

## 参考リンク

- [Figma MCP 公式ドキュメント](https://developers.figma.com/docs/figma-mcp-server/)
- [Figma MCP セットアップガイド](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [リモート vs デスクトップサーバー比較](https://help.figma.com/hc/en-us/articles/35281385065751-Figma-MCP-collection-Compare-Figma-s-remote-and-desktop-MCP-servers)
- [ツール・プロンプト一覧](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [@rui-branco/figma-mcp GitHub](https://github.com/rui-branco/figma-mcp)
- [Design to Code with Figma MCP - Builder.io](https://www.builder.io/blog/figma-mcp-server)
- [Figma MCP vs Playwright MCP 比較](https://javascript.plainenglish.io/experience-story-figma-mcp-claude-code-playwright-68b20bb0f8ce)
