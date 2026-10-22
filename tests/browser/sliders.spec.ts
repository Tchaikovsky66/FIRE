import { test, expect } from '@playwright/test';

async function example(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page).toHaveTitle('FIRE 规划');
  await page.getByRole('button', { name: /先用「小林的示例」/ }).click();
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
}

test('desired retirement age uses whole years and rejects a fractional manual edit', async ({ page }) => {
  await example(page);
  const age = page.getByLabel('希望退休年龄', { exact: true });
  const slider = page.getByRole('slider', { name: '希望退休年龄快捷滑块' });
  await expect(slider).toHaveAttribute('step', '1');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(age).toHaveValue('51');
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
  const path = await page.locator('.balance-line').getAttribute('d');
  await age.fill('51.5');
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('请输入有效整数（至少 0）', { exact: true })).toBeVisible();
  await expect(page.locator('.balance-line')).toHaveAttribute('d', path!);
  await expect(page.getByRole('button', { name: '导出结果图片', exact: true })).toBeDisabled();
  await age.fill('52');
  await expect(age).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.timeline-legend')).toContainText('希望退休 · 52 岁');
});

for (const field of ['希望退休年龄', '月税后工作收入']) {
  test(`${field} updates the curve and result numbers during a continuous held drag`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await example(page);
    if (field === '月税后工作收入') await page.getByRole('navigation', { name: '六步规划' }).getByRole('button', { name: /现在的基础/ }).click();
    const slider = page.getByRole('slider', { name: `${field}快捷滑块` });
    await slider.scrollIntoViewIfNeeded();
    const bounds = (await slider.boundingBox())!;
    const initial = await page.locator('.balance-line').getAttribute('d');
    const metrics = await page.locator('.metric-grid').innerText();
    // Observe rendered changes before mouseup, without pausing for the old 80ms debounce.
    await page.evaluate(() => {
      const snapshots: { path: string | null; metrics: string }[] = [];
      const observer = new MutationObserver(() => {
        const path = document.querySelector('.balance-line')?.getAttribute('d') ?? null;
        if (path && snapshots.at(-1)?.path !== path) snapshots.push({ path, metrics: document.querySelector('.metric-grid')?.textContent ?? '' });
      });
      observer.observe(document.querySelector('.results')!, { subtree: true, attributes: true, childList: true, characterData: true });
      Object.assign(window, { dragEvidence: { snapshots, observer } });
    });
    const start = field === '希望退休年龄' ? 50 / 80 : 25000 / 100000;
    const end = field === '希望退休年龄' ? 72 / 80 : 65000 / 100000;
    const x = (ratio: number) => bounds.x + 8 + ratio * (bounds.width - 16);
    await page.mouse.move(x(start), bounds.y + bounds.height / 2);
    await page.mouse.down();
    try {
      for (let step = 1; step <= 90; step++) await page.mouse.move(x(start + (end - start) * step / 90), bounds.y + bounds.height / 2);
      const evidence = await page.evaluate(() => {
        const { snapshots, observer } = (window as unknown as { dragEvidence: { snapshots: { path: string | null; metrics: string }[]; observer: MutationObserver } }).dragEvidence;
        observer.disconnect();
        return snapshots;
      });
      expect(evidence.filter(snapshot => snapshot.path !== initial).length).toBeGreaterThanOrEqual(2);
      expect(await page.locator('.metric-grid').innerText()).not.toBe(metrics);
      await expect(page.locator('.balance-line')).not.toHaveAttribute('d', initial!);
    } finally { await page.mouse.up(); }
    await expect(page.locator('.results')).toHaveAttribute('aria-busy', 'false');
    if (field === '希望退休年龄') {
      await expect(page.getByLabel(field, { exact: true })).toHaveValue('72');
      await expect(page.locator('.timeline-legend')).toContainText('希望退休 · 72 岁');
    } else await expect(page.getByLabel(field, { exact: true })).toHaveValue('65000');
    await page.getByTestId('funding-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/fire-qa/${testInfo.project.name}-${field === '希望退休年龄' ? 'age' : 'income'}-live.png` });
    expect(errors).toEqual([]);
  });
}
