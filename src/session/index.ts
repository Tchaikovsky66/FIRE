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
  | { type: 'forget'; planId: string }
  | { type: 'begin'; planId: string; revision: number }
  | { type: 'invalidate'; revision: number }
  | { type: 'preview'; planId: string; revision: number; evaluation: EvaluatedPlan }
  | { type: 'settle'; planId: string; revision: number; evaluation: PlanEvaluation; latency: number }
  | { type: 'error'; revision: number; message: string };
export function createSession(): SessionState { return { inputRevision: 0, pending: true, savedResults: new Map() }; }

/** The same revision transition boundary is used by the live Worker hook and its tests. */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'forget') {
    const savedResults = new Map(state.savedResults);
    savedResults.delete(action.planId);
    return { ...state, savedResults, ...(state.planId === action.planId ? { evaluation: undefined, lastValid: undefined, lastValidRevision: undefined } : {}) };
  }
  if (action.type === 'begin') {
    const cached = state.savedResults.get(action.planId);
    return { ...state, planId: action.planId, inputRevision: action.revision, pending: true, evaluation: undefined, lastValid: cached?.evaluation, lastValidRevision: cached?.revision, error: undefined };
  }
  if (action.type === 'invalidate') return { ...state, inputRevision: action.revision, pending: true, evaluation: undefined, error: undefined };
  if (action.type === 'preview') {
    if (action.planId !== state.planId || action.revision >= state.inputRevision || action.revision <= (state.lastValidRevision ?? -1)) return state;
    const savedResults = new Map(state.savedResults);
    savedResults.set(action.planId, { evaluation: action.evaluation, revision: action.revision });
    return { ...state, savedResults, lastValid: action.evaluation, lastValidRevision: action.revision };
  }
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
type WorkerRequest = { revision: number; planId: string; draft: PlanDraft };
export function usePlanningSession(plan: PlanSource | undefined, blocked = false) {
  const [state, dispatch] = useReducer(sessionReducer, undefined, createSession);
  const revision = useRef(0);
  const inputAt = useRef(performance.now());
  const worker = useRef<Worker | null>(null);
  const latestRequest = useRef<WorkerRequest | undefined>(undefined);
  const computing = useRef(false);
  const sendLatest = useCallback(() => {
    const request = latestRequest.current;
    if (computing.current || !worker.current || !request || request.revision !== revision.current) return;
    computing.current = true;
    worker.current.postMessage(request);
  }, []);
  const markInput = useCallback(() => {
    inputAt.current = performance.now();
    dispatch({ type: 'invalidate', revision: ++revision.current });
  }, []);
  useEffect(() => {
    const instance = new Worker(new URL('../planning/worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<WorkerReply>) => {
      const message = event.data;
      computing.current = false;
      const latest = latestRequest.current;
      if (message.revision === revision.current) {
        if (message.error) dispatch({ type: 'error', revision: message.revision, message: message.error });
        else if (message.evaluation) dispatch({ type: 'settle', planId: message.planId, revision: message.revision, evaluation: message.evaluation, latency: performance.now() - inputAt.current });
      } else if (latest?.revision === revision.current && latest.planId === message.planId && message.evaluation?.kind === 'evaluated') {
        // Show completed snapshots during a drag, without marking newer input as settled.
        dispatch({ type: 'preview', planId: message.planId, revision: message.revision, evaluation: message.evaluation });
      }
      if (latest && latest.revision > message.revision) sendLatest();
    };
    instance.onerror = () => dispatch({ type: 'error', revision: revision.current, message: '后台计算不可用，输入仍在内存中，请导出备份后重新载入。' });
    return () => { instance.terminate(); worker.current = null; computing.current = false; };
  }, [sendLatest]);
  useEffect(() => {
    latestRequest.current = undefined;
    if (!plan) return;
    const currentRevision = ++revision.current;
    inputAt.current = performance.now();
    dispatch({ type: 'begin', planId: plan.id, revision: currentRevision });
    if (blocked) return;
    // One in-flight calculation plus the latest input avoids a growing Worker queue.
    latestRequest.current = { revision: currentRevision, planId: plan.id, draft: plan.draft };
    sendLatest();
  }, [plan?.id, plan?.draft, blocked, sendLatest]);
  // Never lend another plan's result to a newly selected identity before effects run.
  const current = state.planId === plan?.id ? state : { ...state, evaluation: undefined, lastValid: undefined, pending: true };
  return { ...current, ...(blocked ? { evaluation: undefined, pending: false } : {}), markInput, forgetPlan: (planId: string) => dispatch({ type: 'forget', planId }) };
}
