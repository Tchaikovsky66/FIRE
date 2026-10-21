import { describe, expect, it } from 'vitest';
import { renderMarkdownReport, type ReportSnapshot } from '../../src/report';
import type { EvaluatedPlan, PlanSnapshot } from '../../src/planning';

const snapshot = { inputs: { currentAge: 30, desiredRetirementAge: 50, planningEndAge: 80, annualLivingExpense: 120000, monthlyNetIncome: 30000, assets: { cash: 0, stocks: 0, bonds: 0, other: 0 }, annualReturn: 0.04, inflationRate: 0.02, withdrawalRate: 0.03 }, capturedAtAge: 30 } as PlanSnapshot;
const evaluation = { kind: 'evaluated', modelVersion: '1.0.0', snapshot, cases: [
  { key: { coverage: 'continue', returns: 'baseline' }, outcome: { kind: 'evaluated', result: { retirementTarget: { kind: 'solved', total: 1000000, investmentPrincipal: 900000, cashBuffer: 100000, withdrawalRatePrincipal: 900000, withdrawalRateTotal: 1000000, wholePathNeed: 1000000, precision: 0.01 }, assetPath: [], desiredRetirement: { age: 50, month: 240, projectedAssets: 0 } } } },
  { key: { coverage: 'stop', returns: 'baseline' }, outcome: { kind: 'needs-input', issues: [] } },
] } as unknown as EvaluatedPlan;

describe('markdown reports', () => {
  it('renders the same evaluated snapshot without solving or silently zeroing unknown cases', () => {
    const report = renderMarkdownReport(evaluation as unknown as ReportSnapshot);
    expect(report).toContain('模型版本：1.0.0'); expect(report).toContain('约 100 万元'); expect(report).toContain('待完善'); expect(report).not.toContain('NaN');
  });
});
