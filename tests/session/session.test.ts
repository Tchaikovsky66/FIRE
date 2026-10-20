import { describe, expect, it } from 'vitest';
import { createSession, editPlan, type SessionState } from '../../src/session';
import { evaluatePlan, type PlanDraft } from '../../src/planning';

const complete: PlanDraft = {
  currentAge: 35, desiredRetirementAge: 60, planningEndAge: 85,
  annualLivingExpense: 120000, monthlyNetIncome: 30000,
  assets: { cash: 100000, stocks: 400000, bonds: 200000, other: 0 },
};

describe('Session', () => {
  it('keeps the last valid result while a new draft is incomplete', () => {
    const initial = createSession(complete);
    expect(initial.lastValid?.kind).toBe('evaluated');
    const edited = editPlan(initial, { annualLivingExpense: undefined });
    expect(edited.currentEvaluation.kind).toBe('needs-input');
    expect(edited.lastValid?.kind).toBe('evaluated');
    expect(edited.lastValidRevision).toBe(0);
    expect(edited.inputRevision).toBe(1);
  });

  it('keeps explicit zero distinct from blank', () => {
    const blank = editPlan(createSession(complete), { annualLivingExpense: undefined });
    const zero = editPlan(createSession(complete), { annualLivingExpense: 0 });
    expect(blank.currentEvaluation.kind).toBe('needs-input');
    expect(zero.currentEvaluation.kind).toBe('evaluated');
  });
});
