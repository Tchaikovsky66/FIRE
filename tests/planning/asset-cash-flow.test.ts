import { describe, expect, it } from 'vitest';
import { simulateAssetCashFlow, type AssetCashFlowInput } from '../../src/planning/asset-cash-flow';

const base: AssetCashFlowInput = {
  startMonth: 0,
  endMonth: 3,
  initialAssets: { cash: 100, stocks: 300, bonds: 100, other: 0 },
  targetAllocation: { cash: 0.2, stocks: 0.6, bonds: 0.2, other: 0 },
  monthlyIncome: 0,
  monthlySpending: 0,
  debtPayments: 0,
  oneOffExpenses: [],
  selfOccupiedHomeValue: 900_000,
  debtBalance: 500_000,
};

describe('asset cash-flow seam', () => {
  it('uses cash before investment transfers and conserves total assets', () => {
    const result = simulateAssetCashFlow({
      ...base,
      monthlySpending: 150,
    });
    expect(result.issues).toEqual([]);
    expect(result.months[0].cashUsed).toBe(100);
    expect(result.months[0].investmentTransfer).toBe(50);
    expect(result.months[0].paymentShortfall).toBe(0);
    expect(result.months[0].totalAssets).toBe(350);
    expect(result.months[0].selfOccupiedHomeValue).toBe(900_000);
    expect(result.months[0].debtBalance).toBe(500_000);
  });

  it('records an uncovered month after cash and investments are exhausted', () => {
    const result = simulateAssetCashFlow({ ...base, monthlySpending: 600 });
    expect(result.months[0].paymentShortfall).toBe(100);
    expect(result.months[0].totalAssets).toBe(0);
    expect(result.months[0].balanceAfterPayment).toEqual({ cash: 0, stocks: 0, bonds: 0, other: 0 });
  });

  it('keeps target allocation separate and rebalances surplus without creating money', () => {
    const result = simulateAssetCashFlow({
      ...base,
      monthlyIncome: 500,
      monthlySpending: 0,
    });
    expect(result.months[0].totalAssets).toBe(1000);
    expect(result.months[0].balanceAfterPayment).toEqual({ cash: 200, stocks: 600, bonds: 200, other: 0 });
    expect(result.months[0].internalTransferNet).toBe(0);
  });

  it('rejects an allocation that is not a complete distribution', () => {
    const result = simulateAssetCashFlow({ ...base, targetAllocation: { cash: 0.5, stocks: 0.5, bonds: 0.5, other: 0 } });
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-allocation' })]));
    expect(result.months).toEqual([]);
  });
});
