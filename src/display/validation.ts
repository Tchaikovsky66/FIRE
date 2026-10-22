import type { FieldIssue, PlanDraft } from '../planning/contract';
import { coverageNames } from './index';

const assets: Record<string, string> = { cash: '现金', stocks: '股票 / 基金', bonds: '债券 / 存款', other: '其他可投资资产' };
const scenarios: Record<string, string> = { conservative: '保守', baseline: '基准', optimistic: '乐观' };
const fields: Record<string, string> = {
  plan: '退休规划方案', currentAge: '当前年龄', desiredRetirementAge: '希望退休年龄', planningEndAge: '规划终点年龄',
  annualLivingExpense: '退休前年生活费', retirementAnnualLivingExpense: '退休后年生活费',
  annualRigidExpense: '退休前其中刚性支出', retirementAnnualRigidExpense: '退休后其中刚性支出', monthlyNetIncome: '月税后工作收入',
  assets: '当前金融资产', targetAllocation: '未来目标配置', returnScenarios: '收益假设', coveragePlans: '社保医保方案',
  baseMonth: '规划基准月', scope: '统计范围', annualReturn: '组合年收益', inflationRate: '通胀年率', withdrawalRate: '初始提取率',
  cashBufferMonths: '现金缓冲月数', stockShock: '股票下跌后剩余比例', bondShock: '债券下跌后剩余比例',
  salaryRealGrowthRate: '工资实际年增长', salaryStartMonth: '工资开始月', salaryEndMonth: '工资最晚结束月',
  selfOccupiedHomeValue: '自住房估值', rentalPropertyValue: '出租房估值', debtBalance: '债务余额', manualTarget: '手动资金目标',
  solverMaxAmount: '资金求解范围', otherReturnConfirmedZero: '其他资产零收益确认',
};
const rowFields: Record<string, string> = {
  id: '条目标识', label: '名称', month: '发生月', amount: '金额', monthlyAmount: '每月金额',
  startMonth: '开始月', endMonth: '结束月（不含）', annualGrowthRate: '名义年增长', growth: '增长口径',
  preRetirementAnnualBudget: '退休前年完整预算', postRetirementAnnualBudget: '退休后年完整预算',
};
const pensionFields: Record<string, string> = {
  status: '养老金待遇', startMonth: '养老金起领时间', monthlyAmount: '养老金月净金额',
  annualGrowthRate: '养老金名义年增长', amountBasis: '养老金金额口径', growth: '养老金增长口径', existingRights: '已有缴费记录',
};
const coverageFields: Record<string, string> = {
  contributionMonthly: '每月养老医保个人缴费', contributionStartMonth: '缴费开始月', contributionEndMonth: '缴费结束月（不含）',
  contribution: '缴费时间', contributionsAlreadyDeducted: '在职缴费是否已从到手工资扣除', contributionGrowth: '缴费增长口径',
  medicalSelfPayMonthly: '医疗自付预算', pension: '养老金待遇',
};
type Row = { id: string; label?: string };
function rowLabel(path: string, prefix: string, label: string, rows?: readonly Row[]): string {
  // Match full stored IDs, which may themselves contain dots.
  const index = rows?.findIndex(row => path === `${prefix}.${row.id}` || path.startsWith(`${prefix}.${row.id}.`)) ?? -1;
  const row = index >= 0 ? rows![index] : undefined;
  const name = row ? `${label} ${index + 1}${row.label ? `「${row.label}」` : ''}` : label;
  const suffix = row ? path.slice(`${prefix}.${row.id}`.length + 1) : path.split('.').at(-1)!;
  return rowFields[suffix] ? `${name} · ${rowFields[suffix]}` : name;
}

export function planFieldLabel(path: string, draft?: PlanDraft): string {
  if (fields[path]) return fields[path];
  const [group, key, field, detail] = path.split('.');
  if (group === 'assets') return assets[key] ?? fields.assets;
  if (group === 'targetAllocation') return assets[key] ? `${assets[key]}目标比例` : fields.targetAllocation;
  if (group === 'returnScenarios') return `${scenarios[key] ?? ''}${assets[field] ?? ''}收益假设`;
  if (group === 'coveragePlans' || group === 'plans') {
    const name = key === 'continue' || key === 'stop' ? coverageNames[key] : '社保医保方案';
    if (field === 'externalIncome') {
      const rows = key === 'continue' || key === 'stop' ? draft?.coveragePlans?.[key]?.externalIncome : undefined;
      return `${name} · ${rowLabel(path, `${group}.${key}.externalIncome`, '组合外收入', rows)}`;
    }
    const label = field === 'pension' ? pensionFields[detail] ?? '养老金待遇'
      : field === 'contribution' && detail ? rowFields[detail] : coverageFields[field];
    return label ? `${name} · ${label}` : name;
  }
  for (const [prefix, label, rows] of [
    ['lifeEvents', '人生节点', draft?.lifeEvents], ['oneOffExpenses', '一次性大额支出', draft?.oneOffExpenses],
    ['debtPayments', '独立付款', draft?.debtPayments], ['externalIncome', '组合外收入', draft?.externalIncome],
  ] as const) {
    if (group === prefix) return rowLabel(path, prefix, label, rows);
  }
  return '退休规划方案';
}

export function planIssueText(issue: FieldIssue, draft?: PlanDraft): string {
  let message = issue.message;
  if (issue.code === 'missing' && message === '请填写此项；没有请明确填 0') {
    message = issue.path === 'monthlyNetIncome' ? '请填写；没有收入请填 0'
      : issue.path.startsWith('assets.') ? '请填写；没有该类资产请填 0'
      : /Age$/.test(issue.path) ? '请填写年龄'
      : '请填写；没有此项开销或金额请填 0';
  }
  return `${planFieldLabel(issue.path, draft)}：${message.replace('条目 ID', '条目标识')}`;
}
