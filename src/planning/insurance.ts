/** Pure monthly comparison of the two explicitly entered insurance arrangements. */

export type InsurancePlanKey = 'continue' | 'stop';
export type PensionStatus = 'unknown' | 'none' | 'known';

export interface PensionBenefit {
  readonly status: PensionStatus;
  readonly startMonth?: number;
  readonly monthlyAmount?: number;
  readonly annualGrowthRate?: number;
  /** Documents that a known benefit survives in the stop-purchasing plan. */
  readonly existingRights?: boolean;
}

export interface ExternalIncome {
  readonly id: string;
  readonly monthlyAmount: number;
  readonly startMonth: number;
  readonly endMonth: number;
  readonly annualGrowthRate?: number;
}

export interface InsurancePlanInput {
  readonly contributionMonthly: number;
  readonly contributionStartMonth: number;
  readonly contributionEndMonth: number;
  readonly contributionsAlreadyDeducted: boolean;
  readonly medicalSelfPayMonthly: number;
  readonly pension: PensionBenefit;
  readonly externalIncome: readonly ExternalIncome[];
}

export interface InsuranceComparisonInput {
  readonly startMonth: number;
  readonly endMonth: number;
  readonly retirementMonth: number;
  readonly plans: Record<InsurancePlanKey, InsurancePlanInput>;
}

export interface InsuranceIssue {
  readonly code: 'invalid' | 'missing';
  readonly path: string;
  readonly message: string;
}

export interface InsuranceRow {
  readonly month: number;
  /** Entered amount, even when employment payroll already paid it. */
  readonly listedContribution: number;
  /** Amount charged to this plan's monthly cash flow. */
  readonly contribution: number;
  readonly contributionAlreadyDeducted: boolean;
  readonly medicalSelfPay: number;
  readonly pensionIncome: number;
  /** Income outside the investment portfolio, kept separate from returns. */
  readonly externalIncome: number;
  readonly netInsuranceCashFlow: number;
}

export type InsurancePlanEvaluation =
  | { readonly kind: 'needs-input'; readonly issues: readonly InsuranceIssue[] }
  | { readonly kind: 'evaluated'; readonly rows: readonly InsuranceRow[] };

export type InsuranceComparison =
  | { readonly kind: 'invalid'; readonly issues: readonly InsuranceIssue[] }
  | { readonly kind: 'evaluated'; readonly plans: Record<InsurancePlanKey, InsurancePlanEvaluation> };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: number, start: number, end: number) => value >= start && value <= end;

function validatePlan(input: InsuranceComparisonInput, plan: InsurancePlanInput, key: InsurancePlanKey): InsuranceIssue[] {
  const issues: InsuranceIssue[] = [];
  const path = (field: string) => `plans.${key}.${field}`;
  for (const [field, value] of [
    ['contributionMonthly', plan.contributionMonthly],
    ['contributionStartMonth', plan.contributionStartMonth],
    ['contributionEndMonth', plan.contributionEndMonth],
    ['medicalSelfPayMonthly', plan.medicalSelfPayMonthly],
  ] as const) {
    if (!finite(value) || value < 0) issues.push({ code: 'invalid', path: path(field), message: '请输入不小于 0 的有限数字' });
  }
  if (plan.contributionEndMonth < plan.contributionStartMonth) {
    issues.push({ code: 'invalid', path: path('contributionEndMonth'), message: '缴费结束月必须晚于开始月' });
  }
  const pension = plan.pension;
  if (pension.status === 'known') {
    if (!finite(pension.startMonth) || !finite(pension.monthlyAmount) || pension.monthlyAmount < 0) {
      issues.push({ code: 'missing', path: path('pension'), message: '已填写养老金方案时需要起领月份和净金额' });
    }
    if (pension.annualGrowthRate !== undefined && (!finite(pension.annualGrowthRate) || pension.annualGrowthRate <= -1)) {
      issues.push({ code: 'invalid', path: path('pension.annualGrowthRate'), message: '养老金增长率必须高于 -100%' });
    }
  } else if (pension.status !== 'none' && pension.status !== 'unknown') {
    issues.push({ code: 'invalid', path: path('pension.status'), message: '养老金状态无效' });
  }
  for (const income of plan.externalIncome) {
    if (!income.id || !finite(income.monthlyAmount) || income.monthlyAmount < 0 || !finite(income.startMonth) || !finite(income.endMonth) || income.endMonth < income.startMonth) {
      issues.push({ code: 'invalid', path: `${path('externalIncome')}.${income.id || 'unknown'}`, message: '组合外收入的金额和起止月份无效' });
    }
    if (income.annualGrowthRate !== undefined && (!finite(income.annualGrowthRate) || income.annualGrowthRate <= -1)) {
      issues.push({ code: 'invalid', path: `${path('externalIncome')}.${income.id}.annualGrowthRate`, message: '收入增长率必须高于 -100%' });
    }
  }
  return issues;
}

const growth = (amount: number, annualRate: number | undefined, monthsSinceStart: number): number =>
  amount * Math.pow(1 + (annualRate ?? 0), monthsSinceStart / 12);

function evaluatePlan(input: InsuranceComparisonInput, plan: InsurancePlanInput, key: InsurancePlanKey): InsurancePlanEvaluation {
  if (plan.pension.status === 'unknown') {
    return { kind: 'needs-input', issues: [{ code: 'missing', path: `plans.${key}.pension`, message: '请填写养老金待遇，或明确选择没有该项待遇' }] };
  }
  const rows: InsuranceRow[] = [];
  for (let month = input.startMonth; month < input.endMonth; month += 1) {
    const inContributionPeriod = key === 'continue' && month >= plan.contributionStartMonth && month < plan.contributionEndMonth;
    const listedContribution = inContributionPeriod ? plan.contributionMonthly : 0;
    const contribution = plan.contributionsAlreadyDeducted ? 0 : listedContribution;
    const pension = plan.pension.status === 'known' && month >= plan.pension.startMonth!
      ? growth(plan.pension.monthlyAmount!, plan.pension.annualGrowthRate, month - plan.pension.startMonth!)
      : 0;
    const externalIncome = plan.externalIncome.reduce((total, income) => {
      if (month < income.startMonth || month >= income.endMonth) return total;
      return total + growth(income.monthlyAmount, income.annualGrowthRate, month - income.startMonth);
    }, 0);
    rows.push({ month, listedContribution, contribution, contributionAlreadyDeducted: plan.contributionsAlreadyDeducted, medicalSelfPay: plan.medicalSelfPayMonthly, pensionIncome: pension, externalIncome, netInsuranceCashFlow: pension + externalIncome - contribution - plan.medicalSelfPayMonthly });
  }
  return { kind: 'evaluated', rows };
}

export function evaluateInsurancePlans(input: InsuranceComparisonInput): InsuranceComparison {
  const common: InsuranceIssue[] = [];
  if (!Number.isInteger(input.startMonth) || !Number.isInteger(input.endMonth) || input.endMonth <= input.startMonth) common.push({ code: 'invalid', path: 'months', message: '规划月份范围无效' });
  if (!Number.isInteger(input.retirementMonth)) common.push({ code: 'invalid', path: 'retirementMonth', message: '退休月份必须是整数' });
  const issues = (['continue', 'stop'] as const).flatMap((key) => validatePlan(input, input.plans[key], key));
  if (common.length || issues.length) return { kind: 'invalid', issues: [...common, ...issues] };
  return { kind: 'evaluated', plans: { continue: evaluatePlan(input, input.plans.continue, 'continue'), stop: evaluatePlan(input, input.plans.stop, 'stop') } };
}
