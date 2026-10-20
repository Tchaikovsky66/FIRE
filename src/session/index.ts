import { evaluatePlan, type PlanDraft, type PlanEvaluation } from '../planning';

export type SessionState = {
  draft: PlanDraft;
  inputRevision: number;
  currentEvaluation: PlanEvaluation;
  lastValid?: Extract<PlanEvaluation, { kind: 'evaluated' }>;
  lastValidRevision?: number;
};

export function createSession(draft: PlanDraft = {}): SessionState {
  const currentEvaluation = evaluatePlan(draft);
  return {
    draft,
    inputRevision: 0,
    currentEvaluation,
    ...(currentEvaluation.kind === 'evaluated' ? { lastValid: currentEvaluation, lastValidRevision: 0 } : {}),
  };
}

export function editPlan(state: SessionState, patch: Partial<PlanDraft>): SessionState {
  const draft = { ...state.draft, ...patch };
  const currentEvaluation = evaluatePlan(draft);
  const inputRevision = state.inputRevision + 1;
  if (currentEvaluation.kind === 'evaluated') {
    return { draft, inputRevision, currentEvaluation, lastValid: currentEvaluation, lastValidRevision: inputRevision };
  }
  return { ...state, draft, inputRevision, currentEvaluation };
}
