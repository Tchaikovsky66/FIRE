import { useEffect, useId, useState } from 'react';

type Props = {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  slider?: boolean;
  hint?: string;
};
const parse = (raw: string) => raw.trim() === '' ? undefined : /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : NaN;

export function NumberField({ label, value, onChange, unit = '', min = 0, max = 100, step = 1, slider = false, hint }: Props) {
  const id = useId();
  const [buffer, setBuffer] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    if (!Object.is(parse(buffer), value)) setBuffer(value === undefined ? '' : Number.isFinite(value) ? String(value) : buffer);
  }, [value]); // Preserve an in-progress decimal while keeping slider/plan changes in sync.
  const invalid = buffer !== '' && (!Number.isFinite(parse(buffer)) || Number(buffer) < min);
  return <div className={`number-field${invalid ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}</label>
    <div className="number-box"><input id={id} aria-label={label} inputMode="decimal" type="text" value={buffer} aria-invalid={invalid} autoComplete="off" onChange={event => { setBuffer(event.target.value); onChange(parse(event.target.value)); }} /><span>{unit}</span></div>
    {slider && <input aria-label={`${label}快捷滑块`} type="range" min={min} max={Math.max(max, Number.isFinite(value) ? value! : max)} step={step} value={Number.isFinite(value) ? value : min} onChange={event => { const next = Number(event.target.value); setBuffer(String(next)); onChange(next); }} />}
    {hint && <small>{hint}</small>}
    {invalid && <small className="error">请输入有效数字（至少 {min}）</small>}
  </div>;
}
