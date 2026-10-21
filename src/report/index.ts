import { formatMoney } from '../display';

type ReportInput = { currentAge: number; desiredRetirementAge: number; planningEndAge: number; annualLivingExpense: number; inflationRate?: number; withdrawalRate?: number; cashBufferMonths?: number };
type ReportResult = { retirementTarget: { kind: 'solved'; total: number } | { kind: 'unresolved'; message: string }; desiredRetirement: { age: number }; stress?: { minimumBalance: number; firstShortfall?: { amount: number } }; attainment?: { kind: string; age?: number }; additionalContribution?: { kind: string; amount?: number } };
type ReportCase = { key: { coverage: string; returns: string }; outcome: { kind: 'evaluated'; result: ReportResult } | { kind: 'needs-input'; issues: readonly unknown[] } | { kind: 'unresolved'; message: string } };
export type ReportSnapshot = { modelVersion: string; snapshot: { inputs: ReportInput }; cases: readonly ReportCase[] };

export function renderMarkdownReport(evaluation: ReportSnapshot): string {
  const { inputs } = evaluation.snapshot;
  const lines = ['# FIRE 规划报告', '', `模型版本：${evaluation.modelVersion}`, `当前年龄：${inputs.currentAge} 岁`, `希望退休年龄：${inputs.desiredRetirementAge} 岁`, `规划终点：${inputs.planningEndAge} 岁`, `年度生活费：${formatMoney(inputs.annualLivingExpense)}`, '', '## 当前假设', `通胀：${((inputs.inflationRate ?? 0) * 100).toFixed(2)}%`, `初始提取率：${((inputs.withdrawalRate ?? 0) * 100).toFixed(2)}%`, `现金缓冲：${inputs.cashBufferMonths ?? 0} 个月`, '', '## 结果'];
  evaluation.cases.forEach(item => {
    lines.push(`### ${item.key.coverage === 'continue' ? '继续购买' : '停止购买'} · ${item.key.returns}`);
    if (item.outcome.kind === 'evaluated') {
      const result = item.outcome.result; const target = result.retirementTarget;
      lines.push(target.kind === 'solved' ? `目标资金：${formatMoney(target.total)}` : `目标：${target.message}`);
      lines.push(`希望退休：${result.desiredRetirement.age} 岁`);
      if (result.attainment) lines.push(`预计达标：${result.attainment.kind}${result.attainment.age === undefined ? '' : `（${result.attainment.age} 岁）`}`);
      if (result.additionalContribution) lines.push(`追加每月净投入：${result.additionalContribution.kind} ${formatMoney(result.additionalContribution.amount)}`);
      if (result.stress) lines.push(`压力测试最低余额：${formatMoney(result.stress.minimumBalance)}${result.stress.firstShortfall ? `，首次不足 ${formatMoney(result.stress.firstShortfall.amount)}` : ''}`);
    } else if (item.outcome.kind === 'needs-input') lines.push('状态：待完善（请补充相关资料）');
    else lines.push(`状态：${item.outcome.message}`);
  });
  lines.push('', '报告基于本次输入快照和明示假设，不代表保证收益或保证退休。');
  return lines.join('\n');
}
