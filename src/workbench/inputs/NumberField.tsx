import { useId } from 'react';
import { useNumericField } from '../../session/numeric-editing';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { DurationPicker } from '@/components/ui/duration-picker';

type Props = { fieldId: string; group?: string; label: string; value: number | undefined; onChange: (value: number | undefined) => void; allowEmpty?: boolean; unit?: string; min?: number; max?: number; step?: number; integer?: boolean; slider?: boolean; hint?: string };
export function NumberField({ fieldId, group, label, value, onChange, allowEmpty = false, unit = '', min = 0, max = 100, step = 1, integer = false, slider = false, hint }: Props) {
  const id = useId();
  const { raw, issue, change } = useNumericField({ id: fieldId, group, label, value, min, integer, allowEmpty, onCommit: onChange });
  const months = unit === '个月后' || unit === '月';
  const safeValue = Number.isFinite(value) ? value! : 0;
  return <div className={`number-field${issue ? ' has-error' : ''}${slider ? ' slider-field' : ''}${months ? ' duration-field' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {slider && <div className="slider-value" aria-hidden="true"><>{Number.isFinite(value) ? <AnimatedCounter value={safeValue} decimals={integer || Number.isInteger(safeValue) ? 0 : 2} duration={0.35} /> : <b className="counter-empty">—</b>}</><span>{unit}</span></div>}
    {months && <DurationPicker fieldLabel={label} hoursLabel="年" minutesLabel="个月" maxHours={Math.max(1000, Math.floor(safeValue / 12))} maxMinutes={11} value={{ hours: Math.floor(Math.max(0, safeValue) / 12), minutes: Math.max(0, safeValue) % 12 }} onConfirm={v => change(String(v.hours * 12 + v.minutes))} />}
    <div className="number-box"><input id={id} aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} type="text" value={raw} aria-invalid={!!issue} autoComplete="off" onChange={event => change(event.target.value)} /><span>{unit}</span></div>
    {months && <small>按年 / 月选择，或直接填写总月数{unit === '个月后' ? '（距基准月）' : ''}。</small>}
    {slider && <input aria-label={`${label}快捷滑块`} type="range" min={min} max={Math.max(max, Number.isFinite(value) ? value! : max)} step={step} value={Number.isFinite(value) ? value : min} onChange={event => change(event.target.value)} />}
    {hint && <small>{hint}</small>}
    {issue && <small className="error">{issue === 'missing' ? '请填写此项；没有请明确填 0' : `请输入有效${integer ? '整数' : '数字'}（至少 ${min}）`}</small>}
  </div>;
}
