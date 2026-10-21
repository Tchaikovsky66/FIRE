import { describe, expect, it } from 'vitest';
import { evaluateInsurancePlans, type InsuranceComparisonInput } from '../../src/planning/insurance';

const base: InsuranceComparisonInput = {
  startMonth: 0,
  endMonth: 36,
  retirementMonth: 12,
  plans: {
    continue: {
      contributionMonthly: 1_000,
      contributionStartMonth: 0,
      contributionEndMonth: 12,
      contributionsAlreadyDeducted: false,
      medicalSelfPayMonthly: 300,
      pension: { status: 'known', startMonth: 24, monthlyAmount: 2_000, annualGrowthRate: 0 },
      externalIncome: [{ id: 'rent', monthlyAmount: 1_500, startMonth: 0, endMonth: 36, annualGrowthRate: 0 }],
    },
    stop: {
      contributionMonthly: 1_000,
      contributionStartMonth: 0,
      contributionEndMonth: 12,
      contributionsAlreadyDeducted: false,
      medicalSelfPayMonthly: 500,
      pension: { status: 'known', startMonth: 24, monthlyAmount: 1_200, annualGrowthRate: 0, existingRights: true },
      externalIncome: [],
    },
  },
};

describe('insurance comparison seam', () => {
  it('applies contributions, medical costs and pensions only in their effective months', () => {
    const result = evaluateInsurancePlans(base);
    expect(result.kind).toBe('evaluated');
    if (result.kind !== 'evaluated') return;
    const continuing = result.plans.continue;
    expect(continuing.rows[0]).toMatchObject({ contribution: 1_000, medicalSelfPay: 300, pensionIncome: 0, externalIncome: 1_500 });
    expect(continuing.rows[12]).toMatchObject({ contribution: 0, medicalSelfPay: 300, pensionIncome: 0, externalIncome: 1_500 });
    expect(continuing.rows[24]).toMatchObject({ pensionIncome: 2_000, externalIncome: 1_500 });
  });

  it('does not charge an employment contribution twice when already deducted', () => {
    const result = evaluateInsurancePlans({
      ...base,
      plans: { ...base.plans, continue: { ...base.plans.continue, contributionsAlreadyDeducted: true } },
    });
    expect(result.kind).toBe('evaluated');
    if (result.kind !== 'evaluated') return;
    expect(result.plans.continue.rows[0]).toMatchObject({ listedContribution: 1_000, contribution: 0, contributionAlreadyDeducted: true });
  });

  it('keeps unknown pension input local to the affected plan', () => {
    const result = evaluateInsurancePlans({
      ...base,
      plans: { ...base.plans, continue: { ...base.plans.continue, pension: { status: 'unknown' } } },
    });
    expect(result.kind).toBe('evaluated');
    if (result.kind !== 'evaluated') return;
    expect(result.plans.continue.kind).toBe('needs-input');
    expect(result.plans.stop.kind).toBe('evaluated');
  });

  it('preserves a known existing benefit in the stop-purchasing plan', () => {
    const result = evaluateInsurancePlans(base);
    expect(result.kind).toBe('evaluated');
    if (result.kind !== 'evaluated' || result.plans.stop.kind !== 'evaluated') return;
    expect(result.plans.stop.rows[24].pensionIncome).toBe(1_200);
  });

  it('stops future contributions without deleting pension rights or medical costs', () => {
    const result = evaluateInsurancePlans(base);
    if (result.kind !== 'evaluated' || result.plans.stop.kind !== 'evaluated') throw new Error('Expected stop case');
    expect(result.plans.stop.rows[0]).toMatchObject({ listedContribution: 0, contribution: 0, medicalSelfPay: 500 });
    expect(result.plans.stop.rows[24].pensionIncome).toBe(1_200);
  });
});
