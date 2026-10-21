import { decodePlanFile, encodePlanFile, type NamedPlan, type Workspace } from '../plan-documents';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PersistenceOutcome = { kind: 'saved' } | { kind: 'unsaved'; reason: 'unavailable'|'quota'|'invalid'; message: string };
export type RestoreOutcome = { kind: 'empty' } | { kind: 'restored'; workspace: Workspace } | { kind: 'error'; message: string };
const KEY = 'fire-planner/workspace/v1';
const failedMessage = '本地保存失败，当前方案仍保留在内存中，请导出备份。';

function validWorkspace(workspace: Workspace): boolean {
  return workspace.plans.length > 0 && workspace.plans.length <= 100 &&
    new Set(workspace.plans.map(plan => plan.id)).size === workspace.plans.length &&
    workspace.plans.some(plan => plan.id === workspace.activePlanId) &&
    workspace.plans.every(plan => decodePlanFile({ format: 'fire-plan', version: 1, plan }).kind === 'decoded');
}

export function saveWorkspace(storage: StorageLike, workspace: Workspace): PersistenceOutcome {
  if (!validWorkspace(workspace)) return { kind: 'unsaved', reason: 'invalid', message: '输入尚未有效保存，当前方案保留在内存中。' };
  try {
    const plans = workspace.plans.map(plan => JSON.parse(encodePlanFile(plan)));
    storage.setItem(KEY, JSON.stringify({ format: 'fire-workspace', version: 1, activePlanId: workspace.activePlanId, plans }));
    return { kind: 'saved' };
  } catch (error) {
    const quota = error !== null && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError';
    return { kind: 'unsaved', reason: quota ? 'quota' : 'unavailable', message: failedMessage };
  }
}

export function restoreWorkspace(storage: StorageLike): RestoreOutcome {
  let raw: string | null;
  try { raw = storage.getItem(KEY); } catch { return { kind: 'error', message: '无法读取本地方案。' }; }
  if (raw === null) return { kind: 'empty' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { kind: 'error', message: '本地方案结构无效。' };
    const record = parsed as Record<string, unknown>;
    if (record.format !== 'fire-workspace' || record.version !== 1 || !Array.isArray(record.plans) || typeof record.activePlanId !== 'string') return { kind: 'error', message: '本地方案版本或结构无效。' };
    const plans: NamedPlan[] = [];
    for (const file of record.plans) {
      const result = decodePlanFile(file);
      if (result.kind !== 'decoded') return { kind: 'error', message: result.message };
      plans.push(result.plan);
    }
    const workspace = { plans, activePlanId: record.activePlanId };
    if (!validWorkspace(workspace)) return { kind: 'error', message: '本地方案身份无效。' };
    return { kind: 'restored', workspace };
  } catch { return { kind: 'error', message: '本地方案无法解析。' }; }
}

export function exportWorkspacePlan(workspace: Workspace): string {
  const plan = workspace.plans.find(item => item.id === workspace.activePlanId);
  return plan ? encodePlanFile(plan) : '';
}
