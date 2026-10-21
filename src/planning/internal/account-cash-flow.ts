export type AssetBalances = { cash: number; stocks: number; bonds: number; other: number };

const ASSET_KEYS = ['cash', 'stocks', 'bonds', 'other'] as const;
const cloneAssets = (assets: AssetBalances): AssetBalances => ({ ...assets });

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
