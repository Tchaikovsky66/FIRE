export type AssetBalances = {
  cash: number;
  stocks: number;
  bonds: number;
  other: number;
};

export type TargetAllocation = AssetBalances;

export type OneOffCashExpense = {
  readonly id: string;
  readonly month: number;
  readonly amount: number;
};

export type AssetCashFlowInput = {
  readonly startMonth: number;
  readonly endMonth: number;
  readonly initialAssets: AssetBalances;
  readonly targetAllocation: TargetAllocation;
  readonly monthlyIncome: number;
  readonly monthlySpending: number;
  readonly debtPayments: number;
  readonly oneOffExpenses: readonly OneOffCashExpense[];
  /** Kept as metadata; housing value never enters withdrawable assets. */
  readonly selfOccupiedHomeValue?: number;
  /** Kept as metadata; the balance is not deducted from initial assets. */
  readonly debtBalance?: number;
  /** Optional annual nominal returns for each account, applied after payment. */
  readonly annualReturns?: Partial<AssetBalances>;
};

export type AssetFlowIssue = {
  readonly code: 'invalid-range' | 'invalid-amount' | 'invalid-allocation' | 'invalid-expense';
  readonly path?: string;
  readonly message: string;
};

export type AssetCashFlowMonth = {
  readonly month: number;
  readonly balanceBeforePayment: AssetBalances;
  readonly balanceAfterPayment: AssetBalances;
  readonly totalAssets: number;
  readonly income: number;
  readonly spending: number;
  readonly debtPayment: number;
  readonly oneOffExpenses: readonly OneOffCashExpense[];
  readonly cashUsed: number;
  readonly investmentTransfer: number;
  readonly paymentShortfall: number;
  readonly internalTransferNet: number;
  readonly selfOccupiedHomeValue?: number;
  readonly debtBalance?: number;
};

export type AssetCashFlowResult = {
  readonly months: readonly AssetCashFlowMonth[];
  readonly issues: readonly AssetFlowIssue[];
};

const ASSET_KEYS = ['cash', 'stocks', 'bonds', 'other'] as const;
const isFiniteNonNegative = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

const cloneAssets = (assets: AssetBalances): AssetBalances => ({ ...assets });
const totalAssets = (assets: AssetBalances): number => ASSET_KEYS.reduce((sum, key) => sum + assets[key], 0);

/** Shared account transaction used by all financial simulations. */
export function applyAccountCashFlow(current: AssetBalances, net: number, allocation: AssetBalances, cashTarget = 0): { assets: AssetBalances; cashUsed: number; investmentTransfer: number; shortfall: number } {
  const assets = cloneAssets(current);
  let cashUsed = 0;
  let investmentTransfer = 0;
  let shortfall = 0;
  if (net >= 0) {
    const toCash = Math.min(net, Math.max(0, cashTarget - assets.cash));
    assets.cash += toCash;
    const rest = net - toCash;
    for (const key of ASSET_KEYS) assets[key] += rest * allocation[key];
  } else {
    let need = -net;
    cashUsed = Math.min(assets.cash, need);
    assets.cash -= cashUsed;
    need -= cashUsed;
    const investKeys = ['stocks', 'bonds', 'other'] as const;
    for (let pass = 0; pass < 4 && need > 1e-10; pass++) {
      const active = investKeys.filter((key) => assets[key] > 0);
      if (!active.length) break;
      const weight = active.reduce((sum, key) => sum + allocation[key], 0);
      const before = need;
      for (const key of active) {
        const requested = before * (weight > 0 ? allocation[key] / weight : 1 / active.length);
        const sold = Math.min(assets[key], requested);
        assets[key] -= sold;
        need -= sold;
        investmentTransfer += sold;
      }
      // Holdings in an asset with zero future target weight still remain
      // available for payment after the preferred assets are exhausted.
      if (before - need <= 1e-10) {
        for (const key of active) {
          const sold = Math.min(assets[key], need);
          assets[key] -= sold;
          need -= sold;
          investmentTransfer += sold;
        }
      }
    }
    shortfall = Math.max(0, need);
  }
  return { assets, cashUsed, investmentTransfer, shortfall };
}

function validate(input: AssetCashFlowInput): AssetFlowIssue[] {
  const issues: AssetFlowIssue[] = [];
  if (!Number.isInteger(input.startMonth) || !Number.isInteger(input.endMonth) || input.endMonth <= input.startMonth) {
    issues.push({ code: 'invalid-range', message: '结束月份必须晚于开始月份。' });
  }
  for (const key of ASSET_KEYS) {
    if (!isFiniteNonNegative(input.initialAssets[key])) {
      issues.push({ code: 'invalid-amount', path: `initialAssets.${key}`, message: '资产必须是非负有限金额。' });
    }
    if (!Number.isFinite(input.targetAllocation[key]) || input.targetAllocation[key] < 0) {
      issues.push({ code: 'invalid-allocation', path: `targetAllocation.${key}`, message: '配置比例必须是非负有限数字。' });
    }
  }
  const allocationTotal = ASSET_KEYS.reduce((sum, key) => sum + input.targetAllocation[key], 0);
  if (Math.abs(allocationTotal - 1) > 1e-9) {
    issues.push({ code: 'invalid-allocation', message: '目标配置比例之和必须为 100%。' });
  }
  for (const [path, value] of [
    ['monthlyIncome', input.monthlyIncome],
    ['monthlySpending', input.monthlySpending],
    ['debtPayments', input.debtPayments],
  ] as const) {
    if (!isFiniteNonNegative(value)) issues.push({ code: 'invalid-amount', path, message: '现金流必须是非负有限金额。' });
  }
  for (const expense of input.oneOffExpenses) {
    if (!Number.isInteger(expense.month) || expense.month < input.startMonth || expense.month >= input.endMonth || !isFiniteNonNegative(expense.amount)) {
      issues.push({ code: 'invalid-expense', path: expense.id, message: '一次性支出必须位于规划期内且金额非负。' });
    }
  }
  return issues;
}

function applyRebalance(assets: AssetBalances, allocation: TargetAllocation): AssetBalances {
  const total = totalAssets(assets);
  return ASSET_KEYS.reduce((next, key) => ({ ...next, [key]: total * allocation[key] }), {} as AssetBalances);
}

function applyInvestmentTransferForShortfall(assets: AssetBalances, needed: number): { assets: AssetBalances; transfer: number } {
  let remaining = needed;
  let transferred = 0;
  const next = cloneAssets(assets);
  for (const key of ['stocks', 'bonds', 'other'] as const) {
    const amount = Math.min(next[key], remaining);
    next[key] -= amount;
    remaining -= amount;
    transferred += amount;
  }
  return { assets: next, transfer: transferred };
}

export function simulateAssetCashFlow(input: AssetCashFlowInput): AssetCashFlowResult {
  const issues = validate(input);
  if (issues.length > 0) return { months: [], issues };
  let assets = cloneAssets(input.initialAssets);
  const months: AssetCashFlowMonth[] = [];
  const monthlyReturns = ASSET_KEYS.reduce((rates, key) => ({ ...rates, [key]: Math.pow(1 + (input.annualReturns?.[key] ?? 0), 1 / 12) - 1 }), {} as AssetBalances);
  for (let month = input.startMonth; month < input.endMonth; month += 1) {
    const oneOffExpenses = input.oneOffExpenses.filter((expense) => expense.month === month);
    const spending = input.monthlySpending;
    const debtPayment = input.debtPayments;
    const outflow = spending + debtPayment + oneOffExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const net = input.monthlyIncome - outflow;
    const before = cloneAssets(assets);
    let cashUsed = 0;
    let investmentTransfer = 0;
    let shortfall = 0;
    if (net < 0) {
      const need = -net;
      cashUsed = Math.min(assets.cash, need);
      assets.cash -= cashUsed;
      const moved = applyInvestmentTransferForShortfall(assets, need - cashUsed);
      assets = moved.assets;
      investmentTransfer = moved.transfer;
      shortfall = need - cashUsed - investmentTransfer;
    } else {
      assets.cash += net;
      assets = applyRebalance(assets, input.targetAllocation);
    }
    const afterPayment = cloneAssets(assets);
    const total = totalAssets(afterPayment);
    const internalTransferNet = 0;
    for (const key of ASSET_KEYS) assets[key] *= 1 + monthlyReturns[key];
    months.push({
      month,
      balanceBeforePayment: before,
      balanceAfterPayment: afterPayment,
      totalAssets: total,
      income: input.monthlyIncome,
      spending,
      debtPayment,
      oneOffExpenses,
      cashUsed,
      investmentTransfer,
      paymentShortfall: shortfall,
      internalTransferNet,
      selfOccupiedHomeValue: input.selfOccupiedHomeValue,
      debtBalance: input.debtBalance,
    });
  }
  return { months, issues: [] };
}
