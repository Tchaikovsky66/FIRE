import { useEffect, useId, useState } from 'react';
import { DurationPicker, type DurationValue } from '@/components/ui/duration-picker';

/** Rare UI's two duration segments express calendar years/months in this planner. */
export function MonthField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [raw, setRaw] = useState(value);
  const [issue, setIssue] = useState(false);
  useEffect(() => { setRaw(value); setIssue(false); }, [value]);
  const commit = (next: string) => {
    setRaw(next);
    const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(next) && Number(next.slice(0, 4)) > 0;
    setIssue(!valid);
    if (valid) onChange(next);
  };
  const [year, month] = value.split('-').map(Number);
  const confirm = (next: DurationValue) => commit(`${String(next.hours).padStart(4, '0')}-${String(next.minutes).padStart(2, '0')}`);
  return <div className="month-field">
    <label htmlFor={id}>{label}</label>
    <DurationPicker fieldLabel={label} hoursLabel="年" minutesLabel="月" maxHours={9999} maxMinutes={12} value={{ hours: year || 0, minutes: month || 0 }} onConfirm={confirm} />
    <div className="precise-time"><span>精确年月</span><input id={id} aria-label={label} type="text" inputMode="text" placeholder="YYYY-MM" value={raw} aria-invalid={issue} onChange={e => commit(e.target.value)} /></div>
    {issue && <small className="error">请输入有效年月（如 2026-10）；当前仍使用最后有效年月。</small>}
  </div>;
}
