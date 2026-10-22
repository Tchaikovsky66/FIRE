import { describe, expect, it } from 'vitest';
import { decodePlanFile, encodePlanFile, type NamedPlan } from '../../src/plan-documents';

const plan: NamedPlan = { id: 'personal', name: '个人方案', draft: { currentAge: 30, assets: { cash: 0 } } };

describe('versioned plan documents', () => {
  it('roundtrips incomplete input and explicit zero without persisting computed caches', () => {
    const encoded = encodePlanFile({ ...plan, cache: { stale: true } } as NamedPlan);
    expect(encoded).not.toContain('cache');
    const decoded = decodePlanFile(encoded);
    expect(decoded).toEqual({ kind: 'decoded', plan, migrated: false });
  });
  it('rejects a wrong structure, negative money, invalid enum and future versions', () => {
    const file = (draft: unknown) => ({ format: 'fire-plan', version: 1, plan: { ...plan, draft } });
    expect(decodePlanFile(file({ currentAge: '30' })).kind).toBe('invalid');
    expect(decodePlanFile(file({ assets: { cash: -1 } })).kind).toBe('invalid');
    expect(decodePlanFile(file({ coveragePlans: { continue: { pension: { status: 'maybe' } } } })).kind).toBe('invalid');
    expect(decodePlanFile({ format: 'fire-plan', version: 99, plan }).kind).toBe('unsupported-version');
    expect(decodePlanFile('{broken').kind).toBe('invalid');
  });
  it('migrates the supported historical inputs field and rejects unknown legacy versions', () => {
    const v0 = { format: 'fire-plan', version: 0, plan: { id: plan.id, name: plan.name, inputs: plan.draft } };
    expect(decodePlanFile(v0)).toEqual({ kind: 'decoded', migrated: true, plan });
    expect(decodePlanFile({ ...v0, version: -1 }).kind).toBe('unsupported-version');
  });
  it('roundtrips inactive pension numbers without treating them as active benefit inputs', () => {
    const stop = { contributionMonthly: 0, contributionStartMonth: 0, contributionEndMonth: 0, contributionsAlreadyDeducted: false, medicalSelfPayMonthly: 0, externalIncome: [], pension: { status: 'none' as const, startMonth: -180, monthlyAmount: 1200, annualGrowthRate: -2 } };
    const saved = { ...plan, draft: { ...plan.draft, coveragePlans: { stop } } };
    expect(decodePlanFile(encodePlanFile(saved))).toEqual({ kind: 'decoded', plan: saved, migrated: false });
    const file = (pension: unknown) => ({ format: 'fire-plan', version: 1, plan: { ...saved, draft: { ...saved.draft, coveragePlans: { stop: { ...stop, pension } } } } });
    expect(decodePlanFile(file({ ...stop.pension, status: 'known' })).kind).toBe('invalid');
    expect(decodePlanFile(file({ ...stop.pension, startMonth: 'bad' })).kind).toBe('invalid');
    expect(decodePlanFile(file({ ...stop.pension, monthlyAmount: Infinity })).kind).toBe('invalid');
  });
  it('validates partial nested drafts without accepting conflicts or impossible time ranges', () => {
    const file = (draft: unknown) => ({ format: 'fire-plan', version: 1, plan: { ...plan, draft } });
    expect(decodePlanFile(file({ targetAllocation: { stocks: 0.6 } })).kind).toBe('decoded');
    expect(decodePlanFile(file({ currentAge: 30, desiredRetirementAge: 25 })).kind).toBe('invalid');
    expect(decodePlanFile(file({ externalIncome: [{ id: 'rent', monthlyAmount: 1000, startMonth: 12, endMonth: 1 }] })).kind).toBe('invalid');
    expect(decodePlanFile(file({ lifeEvents: [{ id: 'a', label: '结婚', month: 12, preRetirementAnnualBudget: 10000 }, { id: 'b', label: '生育', month: 12, preRetirementAnnualBudget: 20000 }] })).kind).toBe('invalid');
  });
});

describe('plan deletion and names', () => {
  it('keeps remaining plans intact and only creates a blank when the last plan is deleted', async () => {
    const { deletePlan, createWorkspace, appendPlan } = await import('../../src/plan-documents');
    let created = 0;
    const blank = () => { created++; return { id: 'blank', name: '空白', draft: {} }; };
    const workspace = appendPlan(createWorkspace(plan), { ...plan, id: 'second', name: '第二份' });
    const remaining = deletePlan(workspace, 'second', blank);
    expect(created).toBe(0);
    expect(remaining).toEqual(createWorkspace(plan));
    expect(deletePlan(remaining, 'missing', blank)).toBe(remaining);
    const empty = deletePlan(remaining, plan.id, blank);
    expect(created).toBe(1);
    expect(empty).toEqual(createWorkspace({ id: 'blank', name: '空白', draft: {} }));
    expect(deletePlan(workspace, plan.id, blank).activePlanId).toBe('second');
  });
  it('trims names and rejects empty or oversized names without changing stored data', async () => {
    const { createWorkspace, renamePlan, decodePlanFile, encodePlanFile } = await import('../../src/plan-documents');
    const workspace = createWorkspace(plan);
    expect(renamePlan(workspace, plan.id, '   ')).toBe(workspace);
    expect(renamePlan(workspace, plan.id, '名'.repeat(501))).toBe(workspace);
    const renamed = renamePlan(workspace, plan.id, '  我的新规划  ');
    expect(renamed.plans[0].name).toBe('我的新规划');
    expect(decodePlanFile(encodePlanFile(renamed.plans[0])).kind).toBe('decoded');
  });
});
