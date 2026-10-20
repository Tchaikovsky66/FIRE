import {
  MODEL_VERSION,
  type CompletePlanInputs,
  type FieldIssue,
  type PlanDraft,
  type PlanEvaluation,
} from './contract';

const REQUIRED_FIELDS = [
  'currentAge',
  'desiredRetirementAge',
  'planningEndAge',
  'annualLivingExpense',
  'monthlyNetIncome',
  'assets',
] as const;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function validate(draft: PlanDraft): { kind: 'needs-input' | 'invalid' | 'complete'; issues: FieldIssue[]; inputs?: CompletePlanInputs } {
  const missing: FieldIssue[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = draft[field];
    if (value === undefined || value === null) {
      missing.push({ code: 'missing', path: field, message: '请填写此项' });
    }
  }
  const assets = draft.assets ?? {};
  for (const field of ['cash', 'stocks', 'bonds', 'other'] as const) {
    if (assets[field] === undefined) {
      missing.push({ code: 'missing', path: `assets.${field}`, message: '请填写此项；没有资产请明确填 0' });
    }
  }
  if (missing.length > 0) return { kind: 'needs-input', issues: missing };

  const values = [
    ['currentAge', draft.currentAge],
    ['desiredRetirementAge', draft.desiredRetirementAge],
    ['planningEndAge', draft.planningEndAge],
    ['annualLivingExpense', draft.annualLivingExpense],
    ['monthlyNetIncome', draft.monthlyNetIncome],
    ['assets.cash', assets.cash],
    ['assets.stocks', assets.stocks],
    ['assets.bonds', assets.bonds],
    ['assets.other', assets.other],
    ['annualReturn', draft.annualReturn ?? 0.04],
    ['inflationRate', draft.inflationRate ?? 0.02],
    ['withdrawalRate', draft.withdrawalRate ?? 0.03],
  ] as const;
  const invalid: FieldIssue[] = [];
  for (const [path, raw] of values) {
    const value = asNumber(raw);
    if (value === undefined) {
      invalid.push({ code: 'invalid', path, message: '请输入有限数字' });
    } else if (['annualReturn', 'inflationRate'].includes(path) && value <= -1) {
      invalid.push({ code: 'out-of-range', path, message: '收益或通胀率必须高于 -100%' });
    } else if (path === 'withdrawalRate' && (value <= 0 || value > 1)) {
      invalid.push({ code: 'out-of-range', path, message: '提取率必须大于 0 且不超过 100%' });
    } else if (!['annualReturn', 'inflationRate'].includes(path) && value < 0) {
      invalid.push({ code: 'out-of-range', path, message: '不能填写负数' });
    }
  }
  if (asNumber(draft.desiredRetirementAge) !== undefined && asNumber(draft.currentAge) !== undefined && draft.desiredRetirementAge! < draft.currentAge!) {
    invalid.push({ code: 'out-of-range', path: 'desiredRetirementAge', message: '希望退休年龄不能早于当前年龄' });
  }
  if (asNumber(draft.planningEndAge) !== undefined && asNumber(draft.desiredRetirementAge) !== undefined && draft.planningEndAge! <= draft.desiredRetirementAge!) {
    invalid.push({ code: 'out-of-range', path: 'planningEndAge', message: '规划终点必须晚于希望退休年龄' });
  }
  if (invalid.length > 0) return { kind: 'invalid', issues: invalid };

  return {
    kind: 'complete',
    issues: [],
    inputs: {
      currentAge: draft.currentAge!, desiredRetirementAge: draft.desiredRetirementAge!, planningEndAge: draft.planningEndAge!,
      annualLivingExpense: draft.annualLivingExpense!, monthlyNetIncome: draft.monthlyNetIncome!,
      assets: { cash: assets.cash!, stocks: assets.stocks!, bonds: assets.bonds!, other: assets.other! },
      annualReturn: draft.annualReturn ?? 0.04, inflationRate: draft.inflationRate ?? 0.02, withdrawalRate: draft.withdrawalRate ?? 0.03,
    },
  };
}

export function evaluatePlan(draft: PlanDraft): PlanEvaluation {
  const checked = validate(draft);
  const knownAssets = Object.values(draft.assets ?? {}).reduce((sum, value) => sum + (asNumber(value) ?? 0), 0);
  if (checked.kind === 'needs-input') {
    return { kind: 'needs-input', issues: checked.issues, preview: { knownAssets, knownAnnualLivingExpense: asNumber(draft.annualLivingExpense) } };
  }
  if (checked.kind === 'invalid') return { kind: 'invalid', issues: checked.issues };
  const inputs = checked.inputs!;
  const months = Math.round((inputs.planningEndAge - inputs.currentAge) * 12);
  const retirementMonth = Math.round((inputs.desiredRetirementAge - inputs.currentAge) * 12);
  const monthlyReturn = Math.pow(1 + inputs.annualReturn, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + inputs.inflationRate, 1 / 12) - 1;
  let balance = Object.values(inputs.assets).reduce((sum, value) => sum + value, 0);
  const assetPath = [];
  for (let month = 0; month < months; month += 1) {
    const income = month < retirementMonth ? inputs.monthlyNetIncome : 0;
    const spending = (inputs.annualLivingExpense / 12) * Math.pow(1 + monthlyInflation, month);
    const shortfall = Math.max(0, spending - income - balance);
    balance = (balance + income - spending) * (1 + monthlyReturn);
    assetPath.push({ month, age: inputs.currentAge + month / 12, balance, income, spending, shortfall });
  }
  const cashBuffer = inputs.annualLivingExpense * 2;
  const investmentPrincipal = Math.max(0, inputs.annualLivingExpense - inputs.monthlyNetIncome * 12) / inputs.withdrawalRate;
  const total = investmentPrincipal + cashBuffer;
  const desiredPoint = assetPath[Math.min(retirementMonth, assetPath.length - 1)];
  return {
    kind: 'evaluated', modelVersion: MODEL_VERSION,
    snapshot: { inputs, capturedAtAge: inputs.currentAge },
    result: {
      retirementTarget: { total, investmentPrincipal, cashBuffer },
      assetPath,
      desiredRetirement: { age: inputs.desiredRetirementAge, projectedAssets: desiredPoint?.balance ?? balance, gap: total - (desiredPoint?.balance ?? balance) },
    },
  };
}
