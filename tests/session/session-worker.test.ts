// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePlanningSession } from '../../src/session';
import { evaluatePlan, type PlanDraft } from '../../src/planning';

const draft: PlanDraft = { currentAge: 35, desiredRetirementAge: 36, planningEndAge: 37, annualLivingExpense: 12000, retirementAnnualLivingExpense: 12000, monthlyNetIncome: 30000, assets: { cash: 100000, stocks: 0, bonds: 0, other: 0 } };
type Request = { planId: string; revision: number; draft: PlanDraft };
class TestWorker {
  static instances: TestWorker[] = [];
  requests: Request[] = [];
  onmessage?: (event: { data: Request & { evaluation: ReturnType<typeof evaluatePlan> } }) => void;
  constructor() { TestWorker.instances.push(this); }
  postMessage(request: Request) { this.requests.push(request); }
  terminate() {}
  reply(index: number) {
    const request = this.requests[index];
    this.onmessage?.({ data: { ...request, evaluation: evaluatePlan(request.draft) } });
  }
}
let root: Root;
let session: ReturnType<typeof usePlanningSession>;
function Harness({ id = 'one', value = draft, blocked = false }: { id?: string; value?: PlanDraft; blocked?: boolean }) {
  session = usePlanningSession({ id, draft: value }, blocked);
  return null;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', TestWorker);
  TestWorker.instances = [];
  root = createRoot(document.createElement('div'));
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); });

it('starts immediately, coalesces continuous input, and publishes progress before the final reply', () => {
  act(() => root.render(createElement(Harness)));
  const worker = TestWorker.instances[0];
  expect(worker.requests).toHaveLength(1);
  for (const income of [31000, 32000, 33000]) act(() => {
    session.markInput();
    root.render(createElement(Harness, { value: { ...draft, monthlyNetIncome: income } }));
  });
  expect(worker.requests).toHaveLength(1);
  act(() => worker.reply(0));
  expect(session.lastValid?.snapshot.inputs.monthlyNetIncome).toBe(30000);
  expect(session.pending).toBe(true);
  expect(session.evaluation).toBeUndefined();
  expect(worker.requests).toHaveLength(2);
  expect(worker.requests[1].draft.monthlyNetIncome).toBe(33000);
  act(() => worker.reply(1));
  expect(session.pending).toBe(false);
  expect(session.lastValid?.snapshot.inputs.monthlyNetIncome).toBe(33000);
  expect(worker.requests).toHaveLength(2);
});

it('does not show an in-flight result from another plan or while an invalid edit blocks evaluation', () => {
  act(() => root.render(createElement(Harness)));
  const worker = TestWorker.instances[0];
  act(() => { session.markInput(); root.render(createElement(Harness, { id: 'two' })); });
  act(() => worker.reply(0));
  expect(session.lastValid).toBeUndefined();
  expect(worker.requests[1].planId).toBe('two');
  act(() => { session.markInput(); root.render(createElement(Harness, { id: 'two', blocked: true })); });
  act(() => worker.reply(1));
  expect(session.lastValid).toBeUndefined();
  expect(session.pending).toBe(false);
  expect(worker.requests).toHaveLength(2);
  act(() => root.render(createElement(Harness, { id: 'two' })));
  expect(worker.requests).toHaveLength(3);
  act(() => worker.reply(2));
  expect(session.pending).toBe(false);
  expect(session.evaluation?.kind).toBe('evaluated');
});
