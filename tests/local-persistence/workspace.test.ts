import { describe, expect, it } from 'vitest';
import { createWorkspace, copyPlan, renamePlan, selectPlan, appendPlan, type NamedPlan } from '../../src/plan-documents';
import { restoreWorkspace, saveWorkspace, type StorageLike } from '../../src/local-persistence';

const plan: NamedPlan = { id: 'p', name: '方案', draft: { currentAge: 30 } };
const storage = (): StorageLike & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } }; };

describe('local workspace persistence', () => {
  it('saves, restores and copies without sharing mutable drafts', () => {
    const adapter = storage(); const workspace = createWorkspace(plan); const copied = copyPlan(workspace, 'p');
    expect(copied.plans).toHaveLength(2); expect(copied.plans[1].id).not.toBe('p');
    copied.plans[1].draft.assets = { cash: 20 }; expect(copied.plans[0].draft.assets).toBeUndefined();
    expect(saveWorkspace(adapter, renamePlan(selectPlan(copied, 'p'), 'p', '新方案'))).toEqual({ kind: 'saved' });
    const restored = restoreWorkspace(adapter); expect(restored.kind).toBe('restored');
  });
  it('keeps memory intact and reports storage failures', () => {
    const failing: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    const outcome = saveWorkspace(failing, createWorkspace(plan)); expect(outcome.kind).toBe('unsaved');
    expect(restoreWorkspace(failing)).toEqual({ kind: 'error', message: '无法读取本地方案。' });
  });
  it('imports as a distinct copy and rejects corrupt saved identities or non-finite edits', () => {
    const workspace = appendPlan(createWorkspace(plan), plan);
    expect(workspace.plans).toHaveLength(2); expect(workspace.activePlanId).not.toBe('p');
    const adapter = storage();
    expect(saveWorkspace(adapter, { ...workspace, activePlanId: 'missing' }).kind).toBe('unsaved');
    expect(saveWorkspace(adapter, createWorkspace({ ...plan, draft: { currentAge: NaN } })).kind).toBe('unsaved');
    expect(adapter.data.size).toBe(0);
  });
  it('re-evaluates restored inputs and reports quota failure without changing the workspace', () => {
    const adapter = storage(); const workspace = createWorkspace(plan);
    saveWorkspace(adapter, workspace);
    const restored = restoreWorkspace(adapter);
    expect(restored.kind).toBe('restored');
    if (restored.kind === 'restored') expect(restored.evaluations.p.kind).toBe('needs-input');
    const quota: StorageLike = { ...adapter, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); } };
    expect(saveWorkspace(quota, workspace)).toMatchObject({ kind: 'unsaved', reason: 'quota' });
    expect(workspace.plans[0].draft.currentAge).toBe(30);
  });
});
