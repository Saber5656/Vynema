/**
 * AI Theater UI モックアップ生成スクリプト
 * 使用方法:
 *   node scripts/generate-mockups.js
 *
 * Playwright インストール先: ~/.local/lib/playwright/
 *   cd ~/.local/lib/playwright && npm install playwright
 *   cd ~/.local/lib/playwright && npx playwright install chromium
 */

const { chromium } = require(require('path').join(require('os').homedir(), '.local/lib/playwright/node_modules/playwright'));
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const SCREENS = [
  { name: 'home',         file: 'docs/figma/home/mockup.html',         outDir: 'docs/figma/home' },
  { name: 'video-player', file: 'docs/figma/video-player/mockup.html', outDir: 'docs/figma/video-player' },
  { name: 'channel',      file: 'docs/figma/channel/mockup.html',      outDir: 'docs/figma/channel' },
];

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'tablet',  width: 768,  height: 1024 },
  { label: 'mobile',  width: 375,  height: 812 },
];

async function generateMockups() {
  console.log('🚀 Playwright モックアップ生成を開始します...\n');
  const browser = await chromium.launch();

  for (const screen of SCREENS) {
    const fileUrl = `file://${path.join(PROJECT_ROOT, screen.file)}`;
    const outDir  = path.join(PROJECT_ROOT, screen.outDir);

    console.log(`📄 [${screen.name}] ${screen.file}`);

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      try {
        await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
        // フォント読み込み待機
        await page.waitForTimeout(1000);

        const outputPath = path.join(outDir, `${vp.label}.png`);
        await page.screenshot({ path: outputPath, fullPage: true });
        console.log(`  ✅ ${vp.label}.png (${vp.width}×${vp.height}) → ${screen.outDir}/`);
      } catch (err) {
        console.error(`  ❌ ${vp.label} 生成失敗:`, err.message);
      } finally {
        await context.close();
      }
    }
    console.log('');
  }

  await browser.close();
  console.log('✨ 全モックアップの生成が完了しました。');
  console.log(`\n出力先:\n${SCREENS.map(s => `  docs/figma/${s.name}/  (desktop.png / tablet.png / mobile.png)`).join('\n')}`);
}

generateMockups().catch(err => {
  console.error('❌ エラーが発生しました:', err);
  process.exit(1);
});
