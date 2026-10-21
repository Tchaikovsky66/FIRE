import { describe, expect, it } from 'vitest';
import { evaluatePlan, type PlanDraft } from '../../src/planning';

const validPlan: PlanDraft = {
  currentAge: 35,
  desiredRetirementAge: 60,
  planningEndAge: 85,
  annualLivingExpense: 120_000,
  retirementAnnualLivingExpense: 120_000,
  monthlyNetIncome: 30_000,
  assets: { cash: 100_000, stocks: 400_000, bonds: 200_000, other: 0 },
  coveragePlans: {
    continue: { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0, contributionsAlreadyDeducted: false, medicalSelfPayMonthly: 0, pension: { status: 'none' }, externalIncome: [] },
    stop: { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0, contributionsAlreadyDeducted: false, medicalSelfPayMonthly: 0, pension: { status: 'none' }, externalIncome: [] },
  },
};

describe('evaluatePlan', () => {
  it('returns an evaluated deterministic snapshot for a complete minimal plan', () => {
    const first = evaluatePlan(validPlan);
    const second = evaluatePlan({ ...validPlan, assets: { ...validPlan.assets } });

    expect(first.kind).toBe('evaluated');
    expect(second).toEqual(first);
    if (first.kind !== 'evaluated') return;
    expect(first.modelVersion).toBe('1.0.1');
    expect(first.snapshot.inputs.currentAge).toBe(35);
    expect(first.result).toBeDefined();
    if (!first.result) return;
    expect(first.result.retirementTarget.kind).toBe('solved');
    if (first.result.retirementTarget.kind === 'solved') expect(first.result.retirementTarget.total).toBeGreaterThan(0);
    expect(first.result.assetPath).toHaveLength(600);
    expect(first.result.assetPath[0].age).toBe(35);
    expect(first.result.assetPath.at(-1)?.age).toBeCloseTo(85, 0);
    expect(first.result.assetPath.every((point) => Number.isFinite(point.balance))).toBe(true);
  });

  it('distinguishes missing required input from an explicit zero', () => {
    const missing = evaluatePlan({ ...validPlan, annualLivingExpense: undefined });
    expect(missing.kind).toBe('needs-input');
    if (missing.kind === 'needs-input') expect(missing.issues[0].code).toBe('missing');

    const zero = evaluatePlan({ ...validPlan, annualLivingExpense: 0 });
    expect(zero.kind).toBe('evaluated');
  });

  it('reports invalid values instead of producing a conclusion', () => {
    const invalid = evaluatePlan({ ...validPlan, currentAge: -1 });
    expect(invalid.kind).toBe('invalid');
    if (invalid.kind === 'invalid') expect(invalid.issues.some((issue) => issue.path === 'currentAge')).toBe(true);
  });
});

it('requires an explicit retirement budget and preserves a deliberate zero', () => {
 const missing = evaluatePlan({...validPlan,retirementAnnualLivingExpense:undefined});
 expect(missing.kind).toBe('needs-input');
 if(missing.kind==='needs-input') expect(missing.issues).toContainEqual(expect.objectContaining({path:'retirementAnnualLivingExpense',code:'missing'}));
 const zero = evaluatePlan({...validPlan,retirementAnnualLivingExpense:0});
 expect(zero.kind).toBe('evaluated');
 if(zero.kind==='evaluated') expect(zero.result?.assetPath[300].livingExpense).toBe(0);
});
