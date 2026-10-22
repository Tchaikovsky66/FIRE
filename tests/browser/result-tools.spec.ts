import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

async function current(page: Page) {
  await expect(page.locator('.results > .result-top .save-indicator')).toHaveText('当前输入结果');
}
async function example(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle('FIRE 规划');
  await page.getByRole('button', { name: /先用「小林的示例」/ }).click();
  await current(page);
}
async function remove(page: Page) {
  await page.getByRole('button', { name: '删除方案', exact: true }).click();
  await page.getByRole('button', { name: '确认删除方案', exact: true }).click();
}

test('rename, cancel, delete and reload preserve only remaining plans', async ({ page }) => {
  await example(page);
  const picker = page.getByLabel('当前方案', { exact: true });
  const original = await picker.inputValue();
  await page.getByRole('button', { name: '修改名称', exact: true }).click();
  const name = page.getByLabel('方案新名称', { exact: true });
  await name.fill('  ');
  await expect(page.getByRole('button', { name: '保存名称', exact: true })).toBeDisabled();
  await name.fill('  春日退休计划  ');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await expect(picker.locator('option:checked')).toContainText('春日退休计划');
  await page.getByRole('button', { name: '删除方案', exact: true }).click();
  await expect(page.getByRole('group', { name: '删除方案确认' })).toBeVisible();
  await page.getByRole('button', { name: '取消删除方案', exact: true }).click();
  await expect(picker).toHaveValue(original);
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await current(page);
  const copy = await picker.inputValue();
  await page.getByRole('navigation', { name: '六步规划' }).getByRole('button', { name: /退休路径/ }).click();
  await page.getByLabel('比较对象', { exact: true }).selectOption(original);
  await expect(page.locator('.comparison-summary')).toContainText('春日退休计划');
  await remove(page);
  await expect(picker.locator('option')).toHaveCount(2);
  await expect(picker.locator(`option[value="${copy}"]`)).toHaveCount(0);
  await expect(page.getByLabel('当前年龄', { exact: true })).toHaveValue('35');
  await page.getByLabel('当前年龄', { exact: true }).fill('-');
  await remove(page);
  await expect(picker.locator('option')).toHaveCount(1);
  await expect(page.getByLabel('当前年龄', { exact: true })).toHaveValue('');
  const last = await picker.inputValue();
  await remove(page);
  await expect(picker.locator('option')).toHaveCount(1);
  expect(await picker.inputValue()).not.toBe(last);
  await expect(page.getByLabel('当前年龄', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('当前年龄', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.workspace-toolbar .save-indicator')).toHaveText('已保存在此浏览器');
  await page.reload();
  await expect(picker.locator('option')).toHaveCount(1);
  await expect(picker.locator('option')).toHaveText(['我的退休方案']);
  expect(await page.evaluate(() => localStorage.getItem('fire-planner/workspace/v1'))).not.toContain('春日退休计划');
});

test('chart moves above metrics, stays visible on desktop, and reads exact monthly coordinates', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await example(page);
  const chart = page.getByTestId('funding-chart');
  expect(await page.locator('.chart-panel').evaluate(node => !!(node.compareDocumentPosition(document.querySelector('.metric-primary')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await chart.scrollIntoViewIfNeeded();
  const bounds = (await chart.boundingBox())!;
  if (info.project.name === 'mobile') await chart.tap({ position: { x: bounds.width / 2, y: 100 } });
  else await chart.hover({ position: { x: bounds.width / 2, y: 100 } });
  await expect(page.getByTestId('chart-readout')).toContainText('资产余额');
  await expect(page.getByTestId('chart-x-value')).toContainText('岁');
  await expect(page.getByTestId('chart-y-value')).toContainText('元');
  await chart.focus();
  await chart.press('Home');
  await expect(page.getByTestId('chart-readout')).toContainText('35 岁');
  const initial = await page.getByTestId('chart-readout').innerText();
  await chart.press('ArrowRight');
  await expect(page.getByTestId('chart-readout')).toContainText('35 岁 1 个月');
  await expect(page.getByTestId('chart-readout')).not.toHaveText(initial);
  await page.getByLabel('显示未来账面金额（未扣除通胀）').check();
  await chart.focus(); await chart.press('End');
  await expect(page.getByTestId('chart-readout')).toContainText('未来账面金额（未扣除通胀）');
  await expect(page.getByTestId('chart-readout')).toContainText('84 岁 11 个月');
  if (info.project.name === 'desktop') {
    await page.getByRole('navigation', { name: '六步规划' }).getByRole('button', { name: /投资假设/ }).click();
    await page.getByLabel('现金缓冲月数', { exact: true }).scrollIntoViewIfNeeded();
    const panel = (await page.locator('.chart-panel').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThanOrEqual(1000);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('/tmp/fire-qa', { recursive: true });
  await page.screenshot({ path: `/tmp/fire-qa/${info.project.name}-result-tools.png` });
  expect(errors).toEqual([]);
});

test('PNG contains a frozen result-only snapshot and export is blocked for incomplete edits', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await example(page);
  await page.getByRole('button', { name: '修改名称', exact: true }).click();
  await page.getByLabel('方案新名称').fill('结果图片验证');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.locator('.result-controls').getByRole('button', { name: '乐观', exact: true }).click();
  await page.getByLabel('显示未来账面金额（未扣除通胀）').check();
  // Observe the isolated export copy before rasterization removes it.
  await page.evaluate(() => {
    new MutationObserver(() => {
      const copy = document.querySelector('.export-results');
      if (copy) (window as unknown as { exportSnapshot: unknown }).exportSnapshot = {
        text: copy.textContent,
        controls: copy.querySelectorAll('button,input,select').length,
        monthly: !!copy.querySelector('.monthly-explanation'),
      };
    }).observe(document.body, { childList: true });
  });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出结果图片', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('FIRE-结果图片验证-结果.png');
  const data = await readFile((await download.path())!);
  expect(data.subarray(1, 4).toString()).toBe('PNG');
  expect(data.readUInt32BE(16)).toBe(1920);
  expect(data.readUInt32BE(20)).toBeGreaterThan(1000);
  await download.saveAs(`/tmp/fire-qa/${info.project.name}-export.png`);
  const snapshot = await page.evaluate(() => (window as unknown as { exportSnapshot: { text: string; controls: number; monthly: boolean } }).exportSnapshot);
  expect(snapshot.controls).toBe(0); expect(snapshot.monthly).toBe(false);
  for (const text of ['结果图片验证', '乐观情景', '未来各时点的账面人民币', '退休时遇到市场下跌（压力测试）', '两个社保医保缴费方案', '通胀']) expect(snapshot.text).toContain(text);
  expect(snapshot.text).not.toContain('月税后工作收入');
  await page.getByLabel('当前年龄', { exact: true }).fill('-');
  await expect(page.getByRole('button', { name: '导出结果图片', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
