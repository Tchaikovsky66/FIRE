import { useId } from 'react';
import { useNumericField } from '../../session/numeric-editing';

type Props = {
  fieldId: string;
  group?: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  allowEmpty?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  slider?: boolean;
  hint?: string;
};

export function NumberField({ fieldId, group, label, value, onChange, allowEmpty = false, unit = '', min = 0, max = 100, step = 1, integer = false, slider = false, hint }: Props) {
  const id = useId();
  const { raw, issue, change } = useNumericField({ id: fieldId, group, label, value, min, integer, allowEmpty, onCommit: onChange });
  return <div className={`number-field${issue ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}</label>
    <div className="number-box"><input id={id} aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} type="text" value={raw} aria-invalid={!!issue} autoComplete="off" onChange={event => change(event.target.value)} /><span>{unit}</span></div>
    {slider && <input aria-label={`${label}快捷滑块`} type="range" min={min} max={Math.max(max, Number.isFinite(value) ? value! : max)} step={step} value={Number.isFinite(value) ? value : min} onChange={event => change(event.target.value)} />}
    {hint && <small>{hint}</small>}
    {issue && <small className="error">{issue === 'missing' ? '请填写此项；没有请明确填 0' : `请输入有效${integer ? '整数' : '数字'}（至少 ${min}）`}</small>}
  </div>;
}
