export const MODEL_VERSION = '1.0.0';

export type AssetInputs = {
  cash?: number;
  stocks?: number;
  bonds?: number;
  other?: number;
};

/** Values supplied by the Session. Undefined means the field is still blank. */
export type PlanDraft = {
  currentAge?: number;
  desiredRetirementAge?: number;
  planningEndAge?: number;
  annualLivingExpense?: number;
  monthlyNetIncome?: number;
  assets?: AssetInputs;
  annualReturn?: number;
  inflationRate?: number;
  withdrawalRate?: number;
};

export type CompletePlanInputs = {
  currentAge: number;
  desiredRetirementAge: number;
  planningEndAge: number;
  annualLivingExpense: number;
  monthlyNetIncome: number;
  assets: Required<AssetInputs>;
  annualReturn: number;
  inflationRate: number;
  withdrawalRate: number;
};

export type FieldIssue = {
  code: 'missing' | 'invalid' | 'out-of-range';
  path: string;
  message: string;
};

export type AssetPathPoint = {
  month: number;
  age: number;
  balance: number;
  income: number;
  spending: number;
  shortfall: number;
};

export type PlanSnapshot = {
  inputs: CompletePlanInputs;
  capturedAtAge: number;
};

export type EvaluatedPlan = {
  kind: 'evaluated';
  modelVersion: typeof MODEL_VERSION;
  snapshot: PlanSnapshot;
  result: {
    retirementTarget: {
      total: number;
      investmentPrincipal: number;
      cashBuffer: number;
    };
    assetPath: readonly AssetPathPoint[];
    desiredRetirement: {
      age: number;
      projectedAssets: number;
      gap: number;
    };
  };
};

export type NeedsInputPlan = {
  kind: 'needs-input';
  issues: readonly FieldIssue[];
  preview: {
    knownAssets: number;
    knownAnnualLivingExpense?: number;
  };
};

export type InvalidPlan = {
  kind: 'invalid';
  issues: readonly FieldIssue[];
};

export type PlanEvaluation = EvaluatedPlan | NeedsInputPlan | InvalidPlan;
