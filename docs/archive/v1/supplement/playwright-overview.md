# Playwright 技術調査レポート

- 調査日: 2026-02-28
- 担当: researcher
- 目的: `docs/figma/` UI画像生成手段の評価

---

## 概要

Playwright は Microsoft 製のブラウザ自動化フレームワーク。
HTML/CSS をブラウザでレンダリングし、PNG/JPEG/WebP としてスクリーンショット出力する用途に使用できる。

---

## 基本仕様

| 項目 | 内容 |
|------|------|
| 開発元 | Microsoft |
| 対応ブラウザ | Chromium / Firefox（独自パッチ版） / WebKit |
| 対応言語 | JavaScript/TypeScript / Python / Java / C#/.NET |
| スクリーンショット形式 | PNG（ロスレス）/ JPEG（品質指定）/ WebP |
| デバイスプリセット | 100+種類（iPhone 12, iPad Pro, Pixel 等） |

---

## スクリーンショット機能

### 出力オプション

```javascript
await page.screenshot({
  path: 'output.png',
  fullPage: true,          // 全ページキャプチャ
  omitBackground: true,    // 透明背景（PNGのみ）
  clip: { x: 0, y: 0, width: 1920, height: 1080 }, // 範囲指定
});

// 要素単位
await page.locator('.channel-header').screenshot({ path: 'header.png' });
```

### デバイス別解像度指定

```javascript
// デスクトップ
await page.setViewportSize({ width: 1920, height: 1080 });

// モバイル（iPhone 12）
const { devices } = require('playwright');
const context = await browser.newContext(devices['iPhone 12']); // 390x844
```

---

## HTML → PNG 変換ワークフロー

Claude が Figma スペック Markdown から HTML/CSS を生成し、Playwright で PNG 出力する。

```javascript
const { chromium } = require('playwright');

async function generateMockup(htmlContent, outputPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // デスクトップ版
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${outputPath}/desktop.png`, fullPage: true });

  // モバイル版
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${outputPath}/mobile.png`, fullPage: true });

  await browser.close();
}
```

### AI Theater での出力先

```
docs/figma/
  ├── home/
  │   ├── desktop.png
  │   └── mobile.png
  ├── video-player/
  │   ├── desktop.png
  │   └── mobile.png
  └── channel/
      ├── desktop.png
      └── mobile.png
```

---

## Claude Code との統合方法

### 方法1: MCP方式

```bash
claude mcp add playwright -s local npx '@playwright/mcp@latest'
```

Claude が MCP ツール経由でブラウザを直接操作。

**MCP ツール一覧:**

| ツール | 機能 |
|--------|------|
| `screenshot` | ページ・要素のスクリーンショット |
| `navigate` | URL遷移 |
| `browser_snapshot` | アクセシビリティツリー取得 |
| `evaluate_javascript` | ページ内JS実行 |
| `click` / `type` | UI操作 |

**欠点:** トークン消費が多い（約 114,000 token/タスク）

### 方法2: CLI スクリプト方式（推奨）

```bash
npm install playwright
npx playwright install chromium
```

Claude が Node.js スクリプトを生成 → Bash で実行 → PNG 出力。
トークン消費は約 27,000 token（MCP比 4倍効率）。

---

## Playwright vs 代替手段

| 観点 | Playwright | Puppeteer | SVG直接生成 |
|------|-----------|-----------|------------|
| 出力品質 | 高（ブラウザレンダリング） | 高（Chromiumのみ） | 中（CSS効果不可） |
| セットアップ | npm install 必要 | npm install 必要 | 不要 |
| デバイス対応 | ✅ 100+プリセット | 手動設定 | — |
| CSS完全再現 | ✅ | ✅ | ❌ |
| フォント・画像 | ✅ | ✅ | △ |
| 2026年推奨度 | ✅ 最優先 | 既存プロジェクト向け | 軽量用途のみ |

---

## 注意事項

- Firefox はシステム版ではなく Playwright 独自パッチ版のみ対応
- 動的コンテンツは `waitForLoadState('networkidle')` で待機が必要
- Chromium バイナリのダウンロードが初回に発生（数百 MB）

---

## 参考リンク

- [Playwright 公式ドキュメント](https://playwright.dev/)
- [Screenshots API](https://playwright.dev/docs/screenshots)
- [Playwright MCP (microsoft/playwright-mcp)](https://github.com/microsoft/playwright-mcp)
