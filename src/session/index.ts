import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { PlanDraft, PlanEvaluation, EvaluatedPlan } from '../planning';

export type SessionState = {
  planId?: string;
  inputRevision: number;
  pending: boolean;
  evaluation?: PlanEvaluation;
  lastValid?: EvaluatedPlan;
  lastValidRevision?: number;
  savedResults: ReadonlyMap<string, { evaluation: EvaluatedPlan; revision: number }>;
  latency?: number;
  error?: string;
};
export type SessionAction =
  | { type: 'begin'; planId: string; revision: number }
  | { type: 'invalidate'; revision: number }
  | { type: 'settle'; planId: string; revision: number; evaluation: PlanEvaluation; latency: number }
  | { type: 'error'; revision: number; message: string };
export function createSession(): SessionState { return { inputRevision: 0, pending: true, savedResults: new Map() }; }

/** The same revision transition boundary is used by the live Worker hook and its tests. */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'begin') {
    const cached = state.savedResults.get(action.planId);
    return { ...state, planId: action.planId, inputRevision: action.revision, pending: true, evaluation: undefined, lastValid: cached?.evaluation, lastValidRevision: cached?.revision, error: undefined };
  }
  if (action.type === 'invalidate') return { ...state, inputRevision: action.revision, pending: true, evaluation: undefined, error: undefined };
  if (action.revision !== state.inputRevision) return state;
  if (action.type === 'error') return { ...state, pending: false, error: action.message };
  if (action.planId !== state.planId) return state;
  const { evaluation } = action;
  if (evaluation.kind !== 'evaluated') return { ...state, evaluation, pending: false, latency: action.latency };
  const savedResults = new Map(state.savedResults);
  savedResults.set(action.planId, { evaluation, revision: action.revision });
  return { ...state, evaluation, pending: false, latency: action.latency, lastValid: evaluation, lastValidRevision: action.revision, savedResults };
}

type PlanSource = { id: string; draft: PlanDraft };
type WorkerReply = { revision: number; planId: string; evaluation?: PlanEvaluation; error?: string };
export function usePlanningSession(plan: PlanSource | undefined, blocked = false) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, createSession);
  const revision = useRef(0);
  const inputAt = useRef(performance.now());
  const worker = useRef<Worker | null>(null);
  const markInput = useCallback(() => {
    inputAt.current = performance.now();
    dispatch({ type: 'invalidate', revision: ++revision.current });
  }, []);
  useEffect(() => {
    const instance = new Worker(new URL('../planning/worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      const message = event.data;
      if (message.revision !== revision.current) return;
      if (message.error) dispatch({ type: 'error', revision: message.revision, message: message.error });
      else if (message.evaluation) dispatch({ type: 'settle', planId: message.planId, revision: message.revision, evaluation: message.evaluation, latency: performance.now() - inputAt.current });
    };
    instance.onerror = () => dispatch({ type: 'error', revision: revision.current, message: '后台计算不可用，输入仍在内存中，请导出备份后重新载入。' });
    return () => { instance.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    if (!plan) return;
    const currentRevision = ++revision.current;
    inputAt.current = performance.now();
    dispatch({ type: 'begin', planId: plan.id, revision: currentRevision });
    if (blocked) return;
    const timer = setTimeout(() => worker.current?.postMessage({ revision: currentRevision, planId: plan.id, draft: plan.draft }), 80);
    return () => clearTimeout(timer);
  }, [plan?.id, plan?.draft, blocked]);
  // Never lend another plan's result to a newly selected identity before effects run.
  const current = state.planId === plan?.id ? state : { ...state, evaluation: undefined, lastValid: undefined, pending: true };
  return { ...current, ...(blocked ? { evaluation: undefined, pending: false } : {}), markInput };
}
