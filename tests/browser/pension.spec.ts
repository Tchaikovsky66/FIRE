import { test, expect, type Page } from '@playwright/test';

const side = '从现在起停止缴纳社保医保';
const status = (page: Page) => page.getByLabel(`${side} · 养老金待遇`, { exact: true });
const age = (page: Page) => page.getByLabel(`${side} · 养老金起领年龄`, { exact: true });
const amount = (page: Page) => page.getByLabel(`${side} · 养老金月净金额`, { exact: true });
const go = (page: Page, step: string) => page.getByRole('navigation', { name: '六步规划' }).getByRole('button', { name: new RegExp(step) }).click();
const current = (page: Page) => expect(page.locator('.results > .result-top .save-indicator')).toHaveText('当前输入结果');

async function unknownPension(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle('FIRE 规划');
  await page.getByRole('button', { name: /先用「小林的示例」/ }).click();
  await current(page);
  await go(page, '保障与收入');
  await age(page).fill('');
  await amount(page).fill('');
  await status(page).selectOption('unknown');
  await page.locator('.result-controls').getByRole('button', { name: side, exact: true }).click();
  await current(page);
  await expect(page.locator('.results .validation')).toContainText('养老金待遇');
}

test('no pension ignores hidden invalid values and restores them when editing resumes', async ({ page }) => {
  await unknownPension(page);
  await status(page).selectOption('known');
  await age(page).fill('20');
  await amount(page).fill('1200');
  await expect(page.locator('.inputs .validation')).toContainText('养老金起领时间');
  await status(page).selectOption('none');
  await current(page);
  await expect(page.locator('.inputs .validation')).toHaveCount(0);
  await expect(page.locator('.results .validation')).toHaveCount(0);
  await expect(page.getByTestId('funding-chart')).toBeVisible();
  await expect(page.locator('.workspace-toolbar .save-indicator')).toHaveText('已保存在此浏览器');
  await page.reload();
  await current(page);
  await go(page, '保障与收入');
  await expect(status(page)).toHaveValue('none');
  await status(page).selectOption('known');
  await expect(age(page)).toHaveValue('20');
  await expect(amount(page)).toHaveValue('1200');
  await expect(page.locator('.results .validation')).toContainText('养老金起领时间');
  await expect(page.locator('.results')).not.toContainText('请填写养老金起领时间与金额');
  await age(page).fill('60');
  await current(page);
  await expect(page.locator('.results .validation')).toHaveCount(0);
});

for (const choice of ['none', 'known'] as const) {
  test(`resolved ${choice} pension shows the current editing blocker instead of an old pension warning`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await unknownPension(page);
    await go(page, '现在的基础');
    await page.getByLabel('现金', { exact: true }).fill('-');
    await go(page, '保障与收入');
    await status(page).selectOption(choice);
    if (choice === 'known') { await age(page).fill('60'); await amount(page).fill('2000'); }
    await expect(page.locator('.results .validation')).toContainText('现金：请输入有效数字');
    await expect(page.locator('.results .validation')).toContainText('结果尚未更新');
    await expect(page.locator('.results')).not.toContainText('请填写养老金起领时间与金额');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.results .validation').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/fire-qa/${testInfo.project.name}-pension-blocker-${choice}.png` });
    await go(page, '现在的基础');
    await page.getByLabel('现金', { exact: true }).fill('200000');
    await current(page);
    await expect(page.getByTestId('funding-chart')).toBeVisible();
    await expect(page.locator('.results .validation')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
