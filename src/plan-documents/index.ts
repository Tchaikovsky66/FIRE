import type { PlanDraft } from '../planning';

export const PLAN_FILE_VERSION = 1;
export type NamedPlan = { id: string; name: string; draft: PlanDraft; isExample?: boolean };
export type PlanDocument = { format: 'fire-plan'; version: number; plan: NamedPlan };
export type DecodeOutcome =
  | { kind: 'decoded'; plan: NamedPlan; migrated: boolean }
  | { kind: 'invalid'; message: string }
  | { kind: 'unsupported-version'; message: string };

type Validator = (value: unknown) => boolean;
const number = (min = 0, max = 1e15): Validator => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const rate: Validator = value => typeof value === 'number' && Number.isFinite(value) && value > -1 && value <= 10;
const month: Validator = value => number(0, 1800)(value) && Number.isInteger(value);
const text: Validator = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
const boolean: Validator = value => typeof value === 'boolean';
const choice = (...allowed: string[]): Validator => value => typeof value === 'string' && allowed.includes(value);
const object = (schema: Record<string, Validator>, required: readonly string[] = []): Validator => value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (required.some(key => record[key] === undefined)) return false;
  return Object.entries(record).every(([key, item]) => Object.hasOwn(schema, key) && (item === undefined || schema[key](item)));
};
const list = (validator: Validator): Validator => value => Array.isArray(value) && value.length <= 1000 && value.every(validator);
const assets = object({ cash: number(), stocks: number(), bonds: number(), other: number() });
const allocation = object({ cash: number(0, 1), stocks: number(0, 1), bonds: number(0, 1), other: number(0, 1) });
const returns = object({ cash: rate, stocks: rate, bonds: rate, other: rate });
const income = object({ id: text, label: text, monthlyAmount: number(), startMonth: month, endMonth: month, annualGrowthRate: rate, growth: choice('real', 'nominal') }, ['id', 'monthlyAmount', 'startMonth', 'endMonth']);
const pensionMetadata = { status: choice('unknown', 'none', 'known'), existingRights: boolean, amountBasis: choice('today', 'start-month'), growth: choice('real', 'nominal') };
const finiteNumber: Validator = value => typeof value === 'number' && Number.isFinite(value);
const activePension = object({ ...pensionMetadata, startMonth: month, monthlyAmount: number(), annualGrowthRate: rate }, ['status']);
const inactivePension = object({ ...pensionMetadata, startMonth: finiteNumber, monthlyAmount: finiteNumber, annualGrowthRate: finiteNumber }, ['status']);
const pension: Validator = value => value !== null && typeof value === 'object' && (value as Record<string, unknown>).status === 'known' ? activePension(value) : inactivePension(value);
const insurance = object({ contributionMonthly: number(), contributionStartMonth: month, contributionEndMonth: month, contributionsAlreadyDeducted: boolean, medicalSelfPayMonthly: number(), pension, externalIncome: list(income), coverageNotes: text, contributionGrowth: choice('real', 'nominal'), medicalGrowth: choice('real', 'nominal') }, ['contributionMonthly', 'contributionStartMonth', 'contributionEndMonth', 'contributionsAlreadyDeducted', 'medicalSelfPayMonthly', 'pension', 'externalIncome']);
const schema: Record<string, Validator> = {
  currentAge: number(0, 150), desiredRetirementAge: number(0, 150), planningEndAge: number(0, 150),
  annualLivingExpense: number(), retirementAnnualLivingExpense: number(), annualRigidExpense: number(), retirementAnnualRigidExpense: number(), monthlyNetIncome: number(), assets,
  annualReturn: rate, inflationRate: rate, withdrawalRate: number(1e-8, 1),
  baseMonth: value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value), scope: choice('individual', 'household'), cashBufferMonths: month,
  stockShock: number(0, 1), bondShock: number(0, 1), targetAllocation: allocation, returnScenarios: object({ conservative: returns, baseline: returns, optimistic: returns }), otherReturnConfirmedZero: boolean,
  lifeEvents: list(object({ id: text, label: text, month, preRetirementAnnualBudget: number(), postRetirementAnnualBudget: number() }, ['id', 'label', 'month'])),
  oneOffExpenses: list(object({ id: text, label: text, month, amount: number() }, ['id', 'label', 'month', 'amount'])),
  debtPayments: list(object({ id: text, label: text, startMonth: month, endMonth: month, monthlyAmount: number(), growth: choice('real', 'nominal') }, ['id', 'startMonth', 'endMonth', 'monthlyAmount'])),
  coveragePlans: object({ continue: insurance, stop: insurance }), externalIncome: list(income), salaryRealGrowthRate: rate, salaryStartMonth: month, salaryEndMonth: month,
  selfOccupiedHomeValue: number(), rentalPropertyValue: number(), debtBalance: number(), manualTarget: number(), solverMaxAmount: number(.01, 1e18),
};
export function validatePlanDraft(draft: unknown): draft is PlanDraft {
  if (!object(schema)(draft)) return false;
  const record = draft as Record<string, unknown>;
  const current = record.currentAge as number | undefined, retirement = record.desiredRetirementAge as number | undefined, end = record.planningEndAge as number | undefined;
  if (current !== undefined && retirement !== undefined && retirement < current) return false;
  if (retirement !== undefined && end !== undefined && end <= retirement) return false;
  const intervalValid = (item: Record<string, unknown>) => (item.endMonth as number) >= (item.startMonth as number);
  for (const key of ['debtPayments', 'externalIncome']) {
    const items = record[key] as Record<string, unknown>[] | undefined;
    if (items && (!items.every(intervalValid) || new Set(items.map(item => item.id)).size !== items.length)) return false;
  }
  const plans = record.coveragePlans as Record<string, Record<string, unknown>> | undefined;
  if (plans) for (const plan of Object.values(plans).filter(Boolean)) {
    if ((plan.contributionEndMonth as number) < (plan.contributionStartMonth as number)) return false;
    if (!(plan.externalIncome as Record<string, unknown>[]).every(intervalValid)) return false;
  }
  const events = record.lifeEvents as Record<string, unknown>[] | undefined;
  if (events) {
    if (new Set(events.map(event => event.id)).size !== events.length) return false;
    for (const track of ['preRetirementAnnualBudget', 'postRetirementAnnualBudget']) {
      const budgetEvents = events.filter(event => event[track] !== undefined);
      if (new Set(budgetEvents.map(event => event.month)).size !== budgetEvents.length) return false;
    }
  }
  if (record.salaryStartMonth !== undefined && record.salaryEndMonth !== undefined && (record.salaryEndMonth as number) < (record.salaryStartMonth as number)) return false;
  if (record.annualRigidExpense !== undefined && record.annualLivingExpense !== undefined && (record.annualRigidExpense as number) > (record.annualLivingExpense as number)) return false;
  if (record.retirementAnnualRigidExpense !== undefined && record.retirementAnnualLivingExpense !== undefined && (record.retirementAnnualRigidExpense as number) > (record.retirementAnnualLivingExpense as number)) return false;
  const target = record.targetAllocation as Record<string, number> | undefined;
  if (target && ['cash', 'stocks', 'bonds', 'other'].every(key => target[key] !== undefined) && Math.abs(Object.values(target).reduce((total, value) => total + value, 0) - 1) > 1e-8) return false;
  const oneOffs = record.oneOffExpenses as Record<string, unknown>[] | undefined;
  if (oneOffs && new Set(oneOffs.map(event => event.id)).size !== oneOffs.length) return false;
  if (current !== undefined && end !== undefined) {
    const endMonth = Math.round((end - current) * 12);
    if ([...events ?? [], ...oneOffs ?? []].some(event => (event.month as number) >= endMonth)) return false;
  }
  return true;
}

export function encodePlanFile(plan: NamedPlan): string {
  return JSON.stringify({ format: 'fire-plan', version: PLAN_FILE_VERSION, plan: { id: plan.id, name: plan.name, draft: plan.draft, ...(plan.isExample ? { isExample: true } : {}) } } satisfies PlanDocument, null, 2);
}

export function decodePlanFile(value: unknown): DecodeOutcome {
  let parsed: unknown;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { return { kind: 'invalid', message: '方案文件不是有效 JSON。' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid', message: '方案文件结构无效。' };
  const record = parsed as Record<string, unknown>;
  if (record.format !== 'fire-plan') return { kind: 'invalid', message: '无法识别方案文件类型。' };
  if (typeof record.version !== 'number' || !Number.isInteger(record.version)) return { kind: 'invalid', message: '方案文件版本无效。' };
  if (record.version > PLAN_FILE_VERSION || record.version < 0) return { kind: 'unsupported-version', message: '当前版本不支持此方案文件版本。' };
  if (!record.plan || typeof record.plan !== 'object' || Array.isArray(record.plan)) return { kind: 'invalid', message: '缺少方案内容。' };
  const source = record.plan as Record<string, unknown>;
  const draft = record.version === 0 ? source.inputs : source.draft;
  if (!text(source.id) || !text(source.name) || (source.isExample !== undefined && !boolean(source.isExample)) || !validatePlanDraft(draft)) return { kind: 'invalid', message: '方案身份或输入值无效。' };
  return { kind: 'decoded', plan: { id: source.id as string, name: source.name as string, draft: structuredClone(draft), ...(source.isExample === true ? { isExample: true } : {}) }, migrated: record.version < PLAN_FILE_VERSION };
}

export type Workspace = { plans: readonly NamedPlan[]; activePlanId: string };
const uniqueId = (base: string, plans: readonly NamedPlan[]) => { let id = base; let i = 2; while (plans.some(plan => plan.id === id)) id = `${base}-${i++}`; return id; };
export function createWorkspace(plan: NamedPlan): Workspace { return { plans: [structuredClone(plan)], activePlanId: plan.id }; }
export function appendPlan(workspace: Workspace, plan: NamedPlan): Workspace {
  const id = uniqueId(plan.id, workspace.plans);
  return { plans: [...workspace.plans, { ...structuredClone(plan), id }], activePlanId: id };
}
export function copyPlan(workspace: Workspace, id: string): Workspace {
  const source = workspace.plans.find(plan => plan.id === id); if (!source) return workspace;
  const nextId = uniqueId(`${source.id}-copy`, workspace.plans); const copy = { ...source, id: nextId, name: `${source.name} 副本`, draft: structuredClone(source.draft), isExample: false };
  return { plans: [...workspace.plans, copy], activePlanId: nextId };
}
export function renamePlan(workspace: Workspace, id: string, name: string): Workspace {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 500) return workspace;
  return { ...workspace, plans: workspace.plans.map(plan => plan.id === id ? { ...plan, name: trimmed } : plan) };
}
/** Call the blank factory only when deletion actually empties the workspace. */
export function deletePlan(workspace: Workspace, id: string, blank: () => NamedPlan): Workspace {
  const index = workspace.plans.findIndex(plan => plan.id === id);
  if (index < 0) return workspace;
  const plans = workspace.plans.filter(plan => plan.id !== id);
  if (!plans.length) return createWorkspace(blank());
  return { plans, activePlanId: workspace.activePlanId === id ? plans[Math.min(index, plans.length - 1)].id : workspace.activePlanId };
}
export function selectPlan(workspace: Workspace, id: string): Workspace { return workspace.plans.some(plan => plan.id === id) ? { ...workspace, activePlanId: id } : workspace; }
