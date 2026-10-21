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
});
