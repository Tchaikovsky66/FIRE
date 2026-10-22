import type { AssetBalances } from '../../planning';
import { formatMoney } from '../../display';
const categories = [{ key: 'cash', name: '现金', color: '#dcd4e7' }, { key: 'stocks', name: '股票 / 基金', color: '#85809c' }, { key: 'bonds', name: '债券 / 存款', color: '#91b3a5' }, { key: 'other', name: '其他', color: '#c5cec9' }] as const;
export function AssetBars({ accounts, target }: { accounts: AssetBalances; target?: number }) {
  const total = Object.values(accounts).reduce((sum, value) => sum + value, 0);
  return <div className="asset-overview" aria-label="当前金融资产构成"><div><span>当前金融资产</span><strong>{formatMoney(total)}</strong></div><svg viewBox="0 0 600 34" role="img" aria-label="现金、股票、债券及其他资产叠层柱"><title>当前持仓与未来目标配置分开；当前总资产不会因修改配置而改变</title>{categories.map((category, index) => { const preceding = categories.slice(0, index).reduce((sum, row) => sum + accounts[row.key], 0); return <rect key={category.key} x={total ? preceding / total * 600 : 0} y="4" height="24" width={total ? accounts[category.key] / total * 600 : 0} fill={category.color}><title>{category.name}：{formatMoney(accounts[category.key])}</title></rect>; })}</svg><div className="asset-legend">{categories.map(category => <span key={category.key}><i style={{ background: category.color }} />{category.name}</span>)}</div>{target !== undefined && <small>系统目标 {formatMoney(target)} · 希望退休时</small>}</div>;
}
