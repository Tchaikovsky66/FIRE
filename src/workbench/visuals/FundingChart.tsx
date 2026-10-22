import { formatAge, formatMoney, monthLabel } from '../../display';
import { useEffect, useId, useRef, useState } from 'react';

type ChartPoint = { month: number; balance: number };
type Marker = { month: number; label: string };
const exactMoney = (value: number) => `${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 元`;
export function FundingChart({ path, target, retirementMonth, currentAge, baseMonth, nominal, markers = [] }: { path: readonly ChartPoint[]; target: number; retirementMonth: number; currentAge: number; baseMonth?: string; nominal?: boolean; markers?: readonly Marker[] }) {
  const chart = useRef<SVGSVGElement>(null);
  const hintId = useId();
  const [width, setWidth] = useState(760);
  const [activeIndex, setActiveIndex] = useState<number>();
  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = 260, pad = 38;
  const end = Math.max(1, path.at(-1)?.month ?? 1);
  const maximum = Math.max(1, target, ...path.map(point => point.balance)) * 1.08;
  const x = (month: number) => pad + month / end * (width - 2 * pad);
  const y = (amount: number) => height - pad - Math.max(0, amount) / maximum * (height - 2 * pad);
  const line = path.map((point, index) => `${index ? 'L' : 'M'}${x(point.month).toFixed(1)},${y(point.balance).toFixed(1)}`).join(' ');
  const active = activeIndex === undefined ? undefined : path[Math.min(activeIndex, path.length - 1)];
  const locate = (clientX: number) => {
    const bounds = chart.current?.getBoundingClientRect();
    if (!bounds || !path.length) return;
    const month = Math.max(0, Math.min(end, ((clientX - bounds.left) / bounds.width * width - pad) / (width - 2 * pad) * end));
    let nearest = 0;
    for (let index = 1; index < path.length; index++) if (Math.abs(path[index].month - month) < Math.abs(path[nearest].month - month)) nearest = index;
    setActiveIndex(nearest);
  };
  return <div className="funding-chart-container">
    <svg ref={chart} className="funding-chart" role="img" aria-label="资金曲线与退休目标线" aria-describedby={hintId} tabIndex={0} viewBox={`0 0 ${width} ${height}`} data-testid="funding-chart"
      onPointerMove={e => locate(e.clientX)} onPointerDown={e => locate(e.clientX)} onPointerLeave={e => { if (e.pointerType !== 'touch') setActiveIndex(undefined); }} onFocus={() => setActiveIndex(index => index ?? 0)} onBlur={() => setActiveIndex(undefined)}
      onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return; e.preventDefault(); setActiveIndex(index => e.key === 'Escape' ? undefined : e.key === 'Home' ? 0 : e.key === 'End' ? path.length - 1 : Math.max(0, Math.min(path.length - 1, (index ?? 0) + (e.key === 'ArrowRight' ? 1 : -1)))); }}>
      {[0, .5, 1].map(ratio => <g key={ratio}><line className="gridline" x1={pad} x2={width - pad} y1={y(maximum * ratio)} y2={y(maximum * ratio)} /><text x={pad} y={y(maximum * ratio) - 7}>{formatMoney(maximum * ratio)}</text></g>)}
      <line className="target-line" x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} /><text className="target-label" x={width - pad} y={y(target) - 8} textAnchor="end">希望退休时目标</text>
      <path className="balance-line" d={line} fill="none" />
      <line className="retirement-line" x1={x(retirementMonth)} x2={x(retirementMonth)} y1={pad} y2={height - pad} />
      {markers.map((marker, i) => <g key={`${marker.label}-${i}`}><circle cx={x(marker.month)} cy={height - pad} r="4" /><title>{marker.label}</title></g>)}
      {[0, .25, .5, .75, 1].map(ratio => <text key={ratio} x={x(end * ratio)} y={height - 10} textAnchor="middle">{Math.round(currentAge + end * ratio / 12)} 岁</text>)}
      {active && <g className="chart-crosshair" data-export-exclude="true" pointerEvents="none">
        <line x1={x(active.month)} x2={x(active.month)} y1={pad} y2={height - pad} /><line x1={pad} x2={width - pad} y1={y(active.balance)} y2={y(active.balance)} />
        <circle cx={x(active.month)} cy={y(active.balance)} r="4" />
        <rect x={pad} y={Math.max(1, y(active.balance) - 25)} width={Math.min(175, width - pad * 2)} height={20} rx="3" />
        <text data-testid="chart-y-value" x={pad + 6} y={Math.max(15, y(active.balance) - 10)}>{exactMoney(active.balance)}</text>
        <rect x={Math.max(pad, Math.min(width - pad - 100, x(active.month) - 50))} y={height - pad + 3} width={100} height={23} rx="3" />
        <text data-testid="chart-x-value" x={Math.max(pad + 50, Math.min(width - pad - 50, x(active.month)))} y={height - pad + 19} textAnchor="middle">{formatAge(currentAge + active.month / 12)}</text>
      </g>}
    </svg>
    <div id={hintId} className="chart-readout" data-export-exclude="true" aria-live="polite" data-testid="chart-readout">{active ? <><span>{formatAge(currentAge + active.month / 12)} · {baseMonth ? monthLabel(baseMonth, active.month) : `第 ${active.month} 月`}</span><strong>资产余额 {exactMoney(active.balance)}</strong><span>目标 {exactMoney(target)} · {nominal ? '未来账面金额（未扣除通胀）' : '今天购买力'}</span></> : <span>悬停或点按曲线查看每月数值；键盘聚焦后用左右键逐月查看。</span>}</div>
  </div>;
}
