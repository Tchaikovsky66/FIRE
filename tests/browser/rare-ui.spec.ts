import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

async function example(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /先用「小林的示例」/ }).click();
  await expect(page.locator('.results > .result-top .save-indicator')).toHaveText('当前输入结果');
}
async function goStep(page: Page, name: string) {
  await page.getByRole('navigation', { name: '六步规划' }).getByRole('button', { name: new RegExp(name) }).click();
}

test('Rare UI year/month editing commits exact linked months and resolves incomplete numeric edits', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await example(page);
  const counter = page.locator('.slider-value [data-slot=animated-counter]');
  await expect(counter).toBeVisible();
  expect(await counter.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(30);
  await page.getByRole('button', { name: '编辑规划基准月', exact: true }).click();
  await page.getByLabel('规划基准月 · 年', { exact: true }).fill('2027');
  await page.getByLabel('规划基准月 · 月', { exact: true }).fill('2');
  await page.getByRole('button', { name: '确认规划基准月', exact: true }).click();
  await expect(page.getByLabel('规划基准月', { exact: true })).toHaveValue('2027-02');
  await goStep(page, '未来变化');
  await page.getByRole('button', { name: '添加人生节点', exact: true }).click();
  await page.getByLabel('节点1生效月', { exact: true }).fill('-');
  await page.getByRole('button', { name: '编辑节点1生效月', exact: true }).click();
  await page.getByLabel('节点1生效月 · 年', { exact: true }).fill('2');
  await page.getByLabel('节点1生效月 · 个月', { exact: true }).fill('3');
  await page.getByRole('button', { name: '确认节点1生效月', exact: true }).click();
  await expect(page.getByLabel('节点1生效月', { exact: true })).toHaveValue('27');
  await expect(page.getByLabel('节点1年月', { exact: true })).toHaveValue('2029-05');
  await expect(page.getByLabel('节点1年龄', { exact: true })).toHaveValue('37.25');
  await page.getByRole('button', { name: '删除节点', exact: true }).click();
  await page.getByRole('button', { name: '取消删除节点', exact: true }).click();
  await expect(page.getByLabel('节点1名称', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除节点', exact: true }).click();
  await page.getByRole('button', { name: '确认删除节点', exact: true }).click();
  await expect(page.getByLabel('节点1名称', { exact: true })).toHaveCount(0);
  await goStep(page, '生活与时间');
  await expect(page.locator('.results > .result-top .save-indicator')).toHaveText('当前输入结果');
  await expect(page.locator('.workspace-toolbar .save-indicator')).toHaveText('已保存在此浏览器');
  await page.evaluate(() => scrollTo(0, 0));
  await mkdir('/tmp/fire-qa', { recursive: true });
  await page.screenshot({ path: `/tmp/fire-qa/${info.project.name}-rare-overview.png` });
  await counter.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/fire-qa/${info.project.name}-rare-counter.png` });
  expect(errors).toEqual([]);
});

test('Rare UI folder opens the real file chooser and imports only valid independent copies', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await example(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const bytes = await readFile((await (await downloadEvent).path())!);
  const id = await page.getByLabel('当前方案', { exact: true }).inputValue();
  await page.getByRole('button', { name: '导入 ↗', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const chooserEvent = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择 JSON 备份文件', exact: true }).press('Enter');
  await (await chooserEvent).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(dialog.getByRole('status')).toContainText('导入失败');
  await expect(page.getByLabel('当前方案', { exact: true })).toHaveValue(id);
  await page.screenshot({ path: `/tmp/fire-qa/${info.project.name}-rare-folder.png` });
  const validChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择 JSON 文件 ↗', exact: true }).click();
  await (await validChooser).setFiles({ name: 'plan.json', mimeType: 'application/json', buffer: bytes });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('当前方案', { exact: true })).not.toHaveValue(id);
  await expect(page.getByLabel('当前方案', { exact: true }).locator('option')).toHaveCount(3);
  await expect(page.locator('.results > .result-top .save-indicator')).toHaveText('当前输入结果');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '导入 ↗', exact: true }).click();
  await dialog.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
