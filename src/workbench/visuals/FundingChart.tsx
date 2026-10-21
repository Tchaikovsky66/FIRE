import { formatMoney } from '../../display';

type ChartPoint = { month: number; balance: number };
type Marker = { month: number; label: string };
export function FundingChart({ path, target, retirementMonth, currentAge, markers = [] }: { path: readonly ChartPoint[]; target: number; retirementMonth: number; currentAge: number; markers?: readonly Marker[] }) {
  const width = 760, height = 260, pad = 38;
  const end = Math.max(1, path.at(-1)?.month ?? 1);
  const maximum = Math.max(1, target, ...path.map(point => point.balance)) * 1.08;
  const x = (month: number) => pad + month / end * (width - 2 * pad);
  const y = (amount: number) => height - pad - Math.max(0, amount) / maximum * (height - 2 * pad);
  const line = path.map((point, index) => `${index ? 'L' : 'M'}${x(point.month).toFixed(1)},${y(point.balance).toFixed(1)}`).join(' ');
  return <svg className="funding-chart" role="img" aria-label="资金曲线与退休目标线" viewBox={`0 0 ${width} ${height}`} data-testid="funding-chart">
    {[0, .5, 1].map(ratio => <g key={ratio}><line className="gridline" x1={pad} x2={width - pad} y1={y(maximum * ratio)} y2={y(maximum * ratio)} /><text x={pad} y={y(maximum * ratio) - 7}>{formatMoney(maximum * ratio)}</text></g>)}
    <line className="target-line" x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} /><text className="target-label" x={width - pad} y={y(target) - 8} textAnchor="end">希望退休时目标</text>
    <path className="balance-line" d={line} fill="none" />
    <line className="retirement-line" x1={x(retirementMonth)} x2={x(retirementMonth)} y1={pad} y2={height - pad} />
    {markers.map((marker, i) => <g key={`${marker.label}-${i}`}><circle cx={x(marker.month)} cy={height - pad} r="4" /><title>{marker.label}</title></g>)}
    {[0, .25, .5, .75, 1].map(ratio => <text key={ratio} x={x(end * ratio)} y={height - 10} textAnchor="middle">{Math.round(currentAge + end * ratio / 12)} 岁</text>)}
  </svg>;
}
