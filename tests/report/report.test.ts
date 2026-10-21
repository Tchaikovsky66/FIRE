import { describe, expect, it } from 'vitest';
import { renderMarkdownReport } from '../../src/report';
import { evaluatePlan, type PlanDraft } from '../../src/planning';

const coverage = { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0, contributionsAlreadyDeducted: false, medicalSelfPayMonthly: 0, pension: { status: 'none' as const }, externalIncome: [] };
const draft: PlanDraft = { baseMonth: '2026-10', currentAge: 30, desiredRetirementAge: 30, planningEndAge: 31, annualLivingExpense: 12000, retirementAnnualLivingExpense: 12000, monthlyNetIncome: 0, assets: { cash: 12000, stocks: 0, bonds: 0, other: 0 }, annualReturn: 0, inflationRate: 0, withdrawalRate: 1, cashBufferMonths: 0, coveragePlans: { continue: coverage, stop: { ...coverage, pension: { status: 'unknown' } } } };

describe('markdown reports', () => {
  it('renders one evaluated snapshot with inputs, assumptions, case states and stress findings', () => {
    const evaluation = evaluatePlan(draft); expect(evaluation.kind).toBe('evaluated'); if (evaluation.kind !== 'evaluated') return;
    const before = structuredClone(evaluation); const report = renderMarkdownReport(evaluation);
    expect(report).toContain('模型版本：1.0.1'); expect(report).toContain('约 12,000 元');
    expect(report).toContain('待完善'); expect(report).toContain('股票/基金'); expect(report).toContain('压力测试');
    expect(report).toContain('名义'); expect(report).toContain('今天购买力'); expect(report).not.toContain('NaN');
    expect(evaluation).toEqual(before);
  });
  it('names immediate funding and unresolved states without presenting unknown as zero', () => {
    const evaluation = evaluatePlan(draft); if (evaluation.kind !== 'evaluated') throw new Error('fixture');
    const baseline = evaluation.cases.find(item => item.key.coverage === 'continue' && item.key.returns === 'baseline')!;
    if (baseline.outcome.kind !== 'evaluated') throw new Error('fixture case');
    baseline.outcome.result.additionalContribution = { kind: 'immediate', amount: 20000, precision: .01 };
    baseline.outcome.result.attainment = { kind: 'unresolved', reason: 'search-bound', message: '搜索范围不足' };
    const report = renderMarkdownReport(evaluation);
    expect(report).toContain('立即一次性补足'); expect(report).toContain('搜索范围不足');
  });
});

it('describes missing known-pension fields without inventing a payment date', () => {
 const evaluation = evaluatePlan({...draft,coveragePlans:{continue:{...coverage,pension:{status:'known'}},stop:coverage}});
 if(evaluation.kind!=='evaluated') throw new Error('fixture');
 const report = renderMarkdownReport(evaluation);
 expect(report).toContain('养老金：待完善（缺少起领时间、月净金额）');
 expect(report).not.toMatch(/NaN|undefined/);
 expect(report).toContain('明确没有该项待遇');
});


it('uses the engine nominal default for unspecified income growth and labels explicit real growth', () => {
  const income = { id: 'rent', label: '租金', startMonth: 0, endMonth: 12, monthlyAmount: 100 };
  const evaluation = evaluatePlan({ ...draft, externalIncome: [income, { ...income, id: 'real-rent', label: '实际租金', growth: 'real' }] });
  if (evaluation.kind !== 'evaluated') throw new Error('fixture');
  const report = renderMarkdownReport(evaluation);
  expect(report).toMatch(/组合外收入 租金：[^\n]+固定名义口径/);
  expect(report).toMatch(/组合外收入 实际租金：[^\n]+按购买力增长口径/);
});
