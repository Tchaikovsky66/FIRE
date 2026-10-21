const money = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
export function formatMoney(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '待完善';
  if (Math.abs(value) >= 100_000) return `约 ${(value / 10_000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })} 万元`;
  return `约 ${money.format(value)} 元`;
}
export function formatAge(age: number): string {
  const months = Math.round(age * 12);
  return `${Math.floor(months / 12)} 岁${months % 12 ? ` ${months % 12} 个月` : ''}`;
}
export function purchasingPower(nominal: number, month: number, inflation: number): number {
  return nominal / Math.pow(1 + inflation, month / 12);
}
export function monthLabel(baseline: string, offset: number): string {
  const [year, month] = baseline.split('-').map(Number);
  const total = year * 12 + month - 1 + offset;
  return `${Math.floor(total / 12)}-${String(total % 12 + 1).padStart(2, '0')}`;
}
