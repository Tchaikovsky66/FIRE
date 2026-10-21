import { evaluatePlan } from './evaluate';
import type { PlanDraft } from './contract';
self.onmessage = (event: MessageEvent<{ revision: number; planId: string; draft: PlanDraft }>) => {
  const { revision, planId, draft } = event.data;
  try { self.postMessage({ revision, planId, evaluation: evaluatePlan(draft) }); }
  catch { self.postMessage({ revision, planId, error: '计算出现程序错误，已保留当前输入与最后有效结果。请导出方案后重新载入。' }); }
};
