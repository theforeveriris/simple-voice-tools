/**
 * E2E 快照工厂：视觉回归矩阵（页面 × 主题 × 语言）
 * 只覆盖静态可复现的场景（demo 数据、设置页、关于页），不覆盖录音动画——
 * 那些页面有时间维度的抖动，截图必然不稳定。
 * 基线：首次 `npx playwright test e2e/snapshots.spec.mts --update-snapshots` 生成；
 * 之后每次 PR 自动对比，像素差异超阈值（maxDiffPixels）即失败。
 * 语言切换走 localStorage（i18n 持久化键）；主题切换同走 localStorage + CSS 变量。
 */

import { expect, test } from '@playwright/test';

/** 快照掩码：隐藏一切时间/随机内容区域（日期串、热力图「今天」格等） */
const MASK_SELECTORS: string[] = [];

/** 应用挂载（跳过引导）+ 固定视口。语言/主题走 svt:settings:v1（zustand persist 的 settings 对象） */
async function boot(page: import('@playwright/test').Page, opts: { locale?: string; theme?: string } = {}) {
  // 冻结系统时间到固定锚点：demo 记录的 createdAt / 卡片时间串随之恒定，截图可复现
  const anchor = Date.UTC(2026, 0, 15, 8, 30, 0);
  await page.addInitScript(`{
    const realNow = Date.now.bind(Date);
    Date.now = () => ${anchor};
    const RealDate = Date;
    const FixedNow = ${anchor};
    class ShimDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(FixedNow);
        else super(...args);
      }
      static now() { return FixedNow; }
    }
    window.Date = ShimDate;
    window.__realNow = realNow;
  }`);
  await page.addInitScript(({ locale, theme }) => {
    window.localStorage.setItem('svt:onboarded', '1');
    if (locale || theme) {
      const raw = window.localStorage.getItem('svt:settings:v1');
      const parsed = raw ? (JSON.parse(raw) as { state?: { settings?: Record<string, unknown> } }) : { state: { settings: {} } };
      parsed.state = parsed.state ?? {};
      parsed.state.settings = { ...(parsed.state.settings ?? {}) };
      if (locale) parsed.state.settings.language = locale;
      if (theme) parsed.state.settings.theme = theme;
      window.localStorage.setItem('svt:settings:v1', JSON.stringify(parsed));
    }
  }, { locale: opts.locale, theme: opts.theme });
  await page.setViewportSize({ width: 420, height: 860 }); // 移动端标准视口（应用的主形态）
  await page.goto('/?demo=1');
  await expect(page.getByText(/Hz/).first()).toBeVisible({ timeout: 20_000 });
}

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.waitForTimeout(400); // 字体/动画 settle
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: false,
    maxDiffPixels: 96,
    mask: MASK_SELECTORS.map((s) => page.locator(s)),
    animations: 'disabled',
  });
}

test.describe('快照矩阵：分析页（demo 数据）', () => {
  const cases: { name: string; locale: string; theme: string }[] = [
    { name: 'analysis-zh-light', locale: 'zh-CN', theme: 'light' },
    { name: 'analysis-zh-dark', locale: 'zh-CN', theme: 'dark' },
    { name: 'analysis-en-light', locale: 'en', theme: 'light' },
    { name: 'analysis-ja-dark', locale: 'ja', theme: 'dark' },
  ];
  for (const c of cases) {
    test(`分析页 ${c.name}`, async ({ page }) => {
      await boot(page, { locale: c.locale, theme: c.theme });
      await shot(page, c.name);
    });
  }
});

test.describe('快照矩阵：历史页', () => {
  for (const c of [
    { name: 'history-zh-light', locale: 'zh-CN', theme: 'light' },
    { name: 'history-en-dark', locale: 'en', theme: 'dark' },
  ]) {
    test(`历史页 ${c.name}`, async ({ page }) => {
      await boot(page, { locale: c.locale, theme: c.theme });
      await page.getByRole('button', { name: /history|歷史|历史|履歴/i }).first().click();
      await expect(page.getByText(/Hz/).first()).toBeVisible();
      await shot(page, c.name);
    });
  }
});

test.describe('快照矩阵：设置主视图', () => {
  for (const c of [
    { name: 'settings-zh-light', locale: 'zh-CN', theme: 'light' },
    { name: 'settings-en-dark', locale: 'en', theme: 'dark' },
  ]) {
    test(`设置页 ${c.name}`, async ({ page }) => {
      await boot(page, { locale: c.locale, theme: c.theme });
      await page.getByRole('button', { name: /settings|設置|设置|設定/i }).first().click();
      await page.waitForTimeout(300);
      await shot(page, c.name);
    });
  }
});
