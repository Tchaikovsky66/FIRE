import { describe, expect, it } from 'vitest';
import { evaluatePlan, type PlanDraft } from '../../src/planning';

const none = { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0, contributionsAlreadyDeducted: false, medicalSelfPayMonthly: 0, pension: { status: 'none' as const }, externalIncome: [] };
const plan: PlanDraft = {
  currentAge: 40, desiredRetirementAge: 41, planningEndAge: 42,
  annualLivingExpense: 0, retirementAnnualLivingExpense: 12_000,
  monthlyNetIncome: 1_000,
  assets: { cash: 0, stocks: 0, bonds: 0, other: 0 },
  annualReturn: 0, inflationRate: 0, withdrawalRate: 1, cashBufferMonths: 0,
  coveragePlans: { continue: none, stop: none },
};

function baseline(draft: PlanDraft) {
  const result = evaluatePlan(draft);
  expect(result.kind).toBe('evaluated');
  if (result.kind !== 'evaluated') throw new Error('Expected a complete planning evaluation');
  const row = result.cases.find((item) => item.key.coverage === 'continue' && item.key.returns === 'baseline');
  expect(row?.outcome.kind).toBe('evaluated');
  if (!row || row.outcome.kind !== 'evaluated') throw new Error('Expected evaluated baseline');
  return row.outcome.result;
}

describe('retirement timing and contribution through evaluatePlan', () => {
  it('scans every candidate month and returns the first viable boundary', () => {
    const result = baseline(plan);
    // Twelve months of ¥1,000 accumulation cover twelve months of retirement.
    expect(result.attainment).toMatchObject({ kind: 'future', month: 12, age: 41 });
    expect(result.additionalContribution).toEqual({ kind: 'none', amount: 0 });
    expect(result.desiredRetirement.projectedAssets).toBeCloseTo(12_000, 2);
  });

  it('reports now and no additional contribution for an already funded plan', () => {
    const result = baseline({ ...plan, assets: { cash: 24_000, stocks: 0, bonds: 0, other: 0 } });
    expect(result.attainment).toMatchObject({ kind: 'now', month: 0, age: 40 });
    expect(result.additionalContribution).toEqual({ kind: 'none', amount: 0 });
  });

  it('reports an immediate one-off need when desired retirement is now', () => {
    const result = baseline({ ...plan, desiredRetirementAge: 40, monthlyNetIncome: 0 });
    expect(result.additionalContribution.kind).toBe('immediate');
    expect(result.additionalContribution.amount).toBeCloseTo(24_000, 1);
    expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN/);
  });

  it('returns the minimum monthly contribution and validates it by a fresh forward evaluation', () => {
    const draft = { ...plan, monthlyNetIncome: 0 };
    const result = baseline(draft);
    expect(result.additionalContribution.kind).toBe('monthly');
    const amount = result.additionalContribution.amount;
    expect(amount).toBeCloseTo(1_000, 1);
    const funded = baseline({ ...draft, monthlyNetIncome: amount });
    expect(funded.additionalContribution).toEqual({ kind: 'none', amount: 0 });
    const lower = baseline({ ...draft, monthlyNetIncome: amount - 0.1 });
    expect(lower.additionalContribution.kind).toBe('monthly');
  });

  it('keeps an early payment shortfall visible even after a later windfall', () => {
    const result = baseline({
      ...plan, monthlyNetIncome: 0, annualLivingExpense: 12_000,
      coveragePlans: { continue: { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0,
        contributionsAlreadyDeducted: true, medicalSelfPayMonthly: 0, pension: { status: 'none' },
        externalIncome: [{ id: 'later-income', startMonth: 6, endMonth: 24, monthlyAmount: 100_000 }] } },
    });
    expect(result.attainment.kind).toBe('not-reached');
    expect(result.assetPath[0].shortfall).toBeGreaterThan(0);
    expect(result.assetPath.at(-1)?.balance).toBeGreaterThan(0);
  });

  it('distinguishes solver range exhaustion from planning-period not reached', () => {
    const result = evaluatePlan({ ...plan, monthlyNetIncome: 0, solverMaxAmount: 1 });
    expect(result.kind).toBe('evaluated');
    if (result.kind !== 'evaluated') return;
    expect(result.cases.find((item) => item.key.coverage === 'continue' && item.key.returns === 'baseline')?.outcome.kind).toBe('unresolved');
  });
});

describe('non-monotonic retirement targets', () => {
  it('finds an early viable window without assuming later targets always improve', () => {
    const result = baseline({
      ...plan, desiredRetirementAge: 40.5, monthlyNetIncome: 0,
      assets: { cash: 5_000, stocks: 0, bonds: 0, other: 0 },
      lifeEvents: [{ id: 'later-budget', label: '后期生活', month: 12, postRetirementAnnualBudget: 24_000 }],
      coveragePlans: { continue: { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0,
        contributionsAlreadyDeducted: true, medicalSelfPayMonthly: 0,
        pension: { status: 'known', startMonth: 6, monthlyAmount: 2_000 }, externalIncome: [] } },
    });
    expect(result.attainment.kind).toBe('future');
    expect(result.attainment.month).toBe(1);
  });
});

describe('candidate-specific cash allocation', () => {
  it('forward-validates attained assets using that candidate retirement time', () => {
    const draft: PlanDraft = {
      ...plan, planningEndAge: 45, desiredRetirementAge: 43, monthlyNetIncome: 1_000,
      annualLivingExpense: 0, retirementAnnualLivingExpense: 12_000,
      annualReturn: undefined, cashBufferMonths: 24,
      targetAllocation: { cash: 0, stocks: 1, bonds: 0, other: 0 },
      returnScenarios: {
        conservative: { cash: 0, stocks: 1, bonds: 0, other: 0 },
        baseline: { cash: 0, stocks: 1, bonds: 0, other: 0 },
        optimistic: { cash: 0, stocks: 1, bonds: 0, other: 0 },
      },
    };
    const reported = baseline(draft).attainment;
    expect(reported.kind).toBe('future');
    if (reported.kind !== 'future') return;
    const candidate = baseline({ ...draft, desiredRetirementAge: reported.age });
    expect(candidate.additionalContribution).toEqual({ kind: 'none', amount: 0 });
    expect(candidate.firstShortfall).toBeUndefined();
    const before = baseline({ ...draft, desiredRetirementAge: reported.age - 1 / 12 });
    expect(before.additionalContribution.kind).toBe('monthly');
  });
});
