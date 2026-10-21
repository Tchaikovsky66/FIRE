import { createContext, useContext, useState, type ReactNode } from 'react';
import type { PlanDraft } from '../planning';

type NumericEdit = { raw: string; label: string; value: number | undefined; issue?: 'missing' | 'invalid'; group?: string };
type PlanEdits = ReadonlyMap<string, NumericEdit>;
export type NumericEdits = ReadonlyMap<string, PlanEdits>;
const parse = (raw: string) => raw.trim() === '' ? undefined : /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : NaN;

/** Editing strings belong to the session; only valid values reach PlanDraft. */
export function useNumericEditing() {
  const [edits, setEdits] = useState<NumericEdits>(new Map());
  const update = (planId: string, change: (current: PlanEdits) => PlanEdits) => setEdits(current => {
    const next = new Map(current);
    next.set(planId, change(current.get(planId) ?? new Map()));
    return next;
  });
  return {
    forPlan: (planId: string | undefined) => planId ? edits.get(planId) ?? new Map<string, NumericEdit>() : new Map<string, NumericEdit>(),
    write: (planId: string, id: string, edit: NumericEdit) => update(planId, current => {
      const next = new Map(current);
      if (edit.group) for (const [key, other] of next) if (other.group === edit.group) next.delete(key);
      next.set(id, edit);
      return next;
    }),
    reconcile: (planId: string, draft: PlanDraft, patch: Partial<PlanDraft>) => update(planId, current => {
      const next = new Map(current);
      for (const key of next.keys()) {
        for (const collection of ['debtPayments', 'externalIncome', 'lifeEvents', 'oneOffExpenses'] as const) {
          const rows = patch[collection];
          if (rows && key.startsWith(`${collection}/`) && !rows.some(row => key.startsWith(`${collection}/${row.id}/`))) next.delete(key);
        }
        if (patch.lifeEvents?.some(event => key.startsWith(`lifeEvents/${event.id}/time/`) && event.month !== draft.lifeEvents?.find(row => row.id === event.id)?.month)) next.delete(key);
        if (patch.currentAge !== undefined && key.endsWith('/age')) next.delete(key);
        for (const side of ['continue', 'stop'] as const) if (patch.coveragePlans?.[side]?.pension.status !== undefined && patch.coveragePlans[side]!.pension.status !== 'known' && key.startsWith(`coveragePlans/${side}/pension/`)) next.delete(key);
      }
      return next;
    }),
  };
}

type EditingContextValue = { edits: PlanEdits; write: (id: string, edit: NumericEdit) => void; onInput: () => void };
const EditingContext = createContext<EditingContextValue | null>(null);
export function NumericEditingProvider({ children, ...value }: EditingContextValue & { children: ReactNode }) {
  return <EditingContext.Provider value={value}>{children}</EditingContext.Provider>;
}

export function useNumericField({ id, group, label, value, min, allowEmpty, onCommit }: { id: string; group?: string; label: string; value: number | undefined; min: number; allowEmpty: boolean; onCommit: (value: number | undefined) => void }) {
  const context = useContext(EditingContext);
  if (!context) throw new Error('Numeric fields require a Session editing provider');
  const edit = context.edits.get(id);
  // A linked control may have replaced the committed value while this field was hidden.
  const current = edit && Object.is(edit.value, value) ? edit : undefined;
  const raw = current?.raw ?? (value === undefined ? '' : String(value));
  return {
    raw,
    issue: current?.issue,
    change: (nextRaw: string) => {
      const next = parse(nextRaw);
      const issue = next === undefined ? allowEmpty ? undefined : 'missing' : !Number.isFinite(next) || next < min ? 'invalid' : undefined;
      context.onInput();
      if (!issue) onCommit(next);
      context.write(id, { raw: nextRaw, label, value: issue ? value : next, issue, group });
    },
  };
}
