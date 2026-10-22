import { expect, it } from 'vitest';
import { planFieldLabel, planIssueText } from '../../src/display/validation';

it('identifies missing income and each asset without exposing paths or treating absence as zero', () => {
  const cases = [
    ['monthlyNetIncome', '月税后工作收入：请填写；没有收入请填 0'],
    ['assets.cash', '现金：请填写；没有该类资产请填 0'],
    ['assets.stocks', '股票 / 基金：请填写；没有该类资产请填 0'],
    ['assets.bonds', '债券 / 存款：请填写；没有该类资产请填 0'],
    ['assets.other', '其他可投资资产：请填写；没有该类资产请填 0'],
  ];
  for (const [path, expected] of cases) expect(planIssueText({ path, code: 'missing', message: '请填写此项；没有请明确填 0' })).toBe(expected);
  expect(planIssueText({ path: 'currentAge', code: 'missing', message: '请填写此项；没有请明确填 0' })).toBe('当前年龄：请填写年龄');
});

it('distinguishes the insurance case, asset allocation and return scenario', () => {
  expect(planFieldLabel('coveragePlans.continue.pension')).toBe('继续缴纳社保医保 · 养老金待遇');
  expect(planFieldLabel('coveragePlans.stop.pension.startMonth')).toBe('从现在起停止缴纳社保医保 · 养老金起领时间');
  expect(planFieldLabel('targetAllocation.stocks')).toBe('股票 / 基金目标比例');
  expect(planFieldLabel('returnScenarios.conservative.bonds')).toBe('保守债券 / 存款收益假设');
});

it('identifies dynamic rows by their current order and name, including IDs containing dots', () => {
  const draft = { lifeEvents: [{ id: 'row.with.dots', label: '结婚', month: 12 }, { id: 'second', label: '结婚', month: 24 }] };
  expect(planFieldLabel('lifeEvents.row.with.dots.preRetirementAnnualBudget', draft)).toBe('人生节点 1「结婚」 · 退休前年完整预算');
  expect(planFieldLabel('lifeEvents.second.month', draft)).toBe('人生节点 2「结婚」 · 发生月');
  expect(planFieldLabel('lifeEvents.row.with.dots', draft)).toBe('人生节点 1「结婚」');
  expect(planFieldLabel('lifeEvents.second.month', { lifeEvents: draft.lifeEvents.slice(1) })).toBe('人生节点 1「结婚」 · 发生月');
});

it('keeps unknown structural issues readable without leaking an internal key', () => {
  expect(planIssueText({ path: 'unexpected.internal.field', code: 'invalid', message: '方案结构无效' })).toBe('退休规划方案：方案结构无效');
});
