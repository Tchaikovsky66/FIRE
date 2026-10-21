import type { AdditionalContribution, Attainment, CaseResult, EvaluatedPlan } from '../planning/contract';
import { formatAge, formatMoney, monthLabel, purchasingPower } from '../display';

export type ReportSnapshot = EvaluatedPlan;
const scenarioLabels = { conservative: '保守', baseline: '基准', optimistic: '乐观' };
const assetLabels = { cash: '现金', stocks: '股票/基金', bonds: '债券/存款', other: '其他可投资资产' };
const escape = (text: string) => text.replace(/[\\`*_{}[\]<>#|]/g, '\\$&').replace(/\r?\n/g, ' ');
const percent = (rate: number) => `${(rate * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;

function attainmentText(attainment: Attainment | undefined): string {
  if (!attainment) return '尚未计算';
  if (attainment.kind === 'unresolved') return escape(attainment.message);
  if (attainment.kind === 'not-reached') return '规划期内未达标';
  return attainment.kind === 'now' ? '现在' : formatAge(attainment.age);
}
function contributionText(contribution: AdditionalContribution | undefined): string {
  if (!contribution) return '尚未计算';
  if (contribution.kind === 'unresolved') return escape(contribution.message);
  if (contribution.kind === 'none') return '无需追加（0 元）';
  return `${contribution.kind === 'immediate' ? '立即一次性补足' : '追加每月净投入（今天购买力）'}：${formatMoney(contribution.amount)}`;
}

export function renderMarkdownReport(evaluation: ReportSnapshot): string {
  const { inputs } = evaluation.snapshot;
  const atMonth = (month: number) => inputs.baseMonth ? monthLabel(inputs.baseMonth, month) : `基准月后第 ${month} 月`;
  const amount = (value: number, month: number) => `${formatMoney(value)}（${atMonth(month)} 名义金额；今天购买力 ${formatMoney(purchasingPower(value, month, inputs.inflationRate))}）`;
  const lines = [
    '# FIRE 规划报告', '', `模型版本：${evaluation.modelVersion}`,
    `统计范围：${inputs.scope === 'household' ? '家庭' : '个人'}`,
    `规划基准月：${inputs.baseMonth ?? '未填写'}`,
    `当前年龄：${formatAge(inputs.currentAge)}`,
    `希望退休年龄：${formatAge(inputs.desiredRetirementAge)}`,
    `规划终点：${formatAge(inputs.planningEndAge)}`,
    `当前年度生活费：${formatMoney(inputs.annualLivingExpense)}（今天购买力）`,
    `退休年度生活费：${formatMoney(inputs.retirementAnnualLivingExpense ?? inputs.annualLivingExpense)}（今天购买力）`,
    `工作月税后收入：${formatMoney(inputs.monthlyNetIncome)}（今天购买力）`,
    '', '## 当前资产与固定事件',
    ...Object.entries(inputs.assets).map(([key, value]) => `${assetLabels[key as keyof typeof assetLabels]}：${formatMoney(value)}`),
    `自住房价值（不计入可提款资金）：${inputs.selfOccupiedHomeValue === undefined ? '未填写' : formatMoney(inputs.selfOccupiedHomeValue)}`,
    `出租房价值（仅净租金计入现金流）：${inputs.rentalPropertyValue === undefined ? '未填写' : formatMoney(inputs.rentalPropertyValue)}`,
    `债务余额（仅说明；还款进入现金流）：${inputs.debtBalance === undefined ? '未填写' : formatMoney(inputs.debtBalance)}`,
    ...inputs.lifeEvents?.map(event => `人生节点 ${escape(event.label)}：${atMonth(event.month)}；完整退休前预算 ${formatMoney(event.preRetirementAnnualBudget)}；完整退休后预算 ${formatMoney(event.postRetirementAnnualBudget)}`) ?? [],
    ...inputs.oneOffExpenses?.map(event => `一次性支出 ${escape(event.label)}：${atMonth(event.month)}，${formatMoney(event.amount)}（今天购买力）`) ?? [],
    ...inputs.debtPayments?.map(debt => `债务还款 ${escape(debt.label ?? debt.id)}：${atMonth(debt.startMonth)} 至 ${atMonth(debt.endMonth)}（结束月不含），每月 ${formatMoney(debt.monthlyAmount)}`) ?? [],
    '', '## 明示假设',
    `通胀：${percent(inputs.inflationRate)}`,
    `初始提取率：${percent(inputs.withdrawalRate)}（独立于收益率）`,
    `现金缓冲：未来 ${inputs.cashBufferMonths} 个月经常性生活费（现有资产内部划分）`,
    `工作实际收入增长：${percent(inputs.salaryRealGrowthRate ?? 0)}`,
    `退休首月冲击：股票保留 ${percent(inputs.stockShock)}，债券保留 ${percent(inputs.bondShock)}，现金不受冲击。`,
    `手动资金目标：${inputs.manualTarget === undefined ? '未填写' : `${formatMoney(inputs.manualTarget)}（今天购买力；仅用于对照）`}`,
    '收益为名义总回报，包含分红和利息并已扣常规成本；未单独模拟交易税费。',
  ];
  for (const coverage of ['continue', 'stop'] as const) {
    const plan = inputs.coveragePlans[coverage];
    lines.push('', `## ${coverage === 'continue' ? '继续购买' : '不再购买'}社保医保`,
      `未来缴费：${coverage === 'stop' ? '从现在起不再计入' : `${formatMoney(plan.contributionMonthly)}/月，${atMonth(plan.contributionStartMonth)} 至 ${atMonth(plan.contributionEndMonth)}（结束月不含）`}`,
      `在职个人缴费：${plan.contributionsAlreadyDeducted ? '已从到手工资扣除，不重复扣减；离职后自行缴费仍按设定处理' : '按单独支出处理'}`,
      `医疗自付：每月 ${formatMoney(plan.medicalSelfPayMonthly)}`,
      `养老金：${plan.pension.status === 'unknown' ? '待完善' : plan.pension.status === 'none' ? '明确没有该项待遇' : `${formatMoney(plan.pension.monthlyAmount)}/月（${plan.pension.amountBasis === 'start-month' ? '起领月名义金额' : '今天购买力'}），从 ${atMonth(plan.pension.startMonth!)} 开始，年增长 ${percent(plan.pension.annualGrowthRate ?? 0)}`}`,
      '已有养老金权益按输入保留；资格、医保衔接和待遇有效性需用户核对。');
    for (const income of [...inputs.externalIncome ?? [], ...plan.externalIncome]) lines.push(`组合外收入 ${escape(income.label ?? income.id)}：${atMonth(income.startMonth)} 至 ${atMonth(income.endMonth)}（结束月不含），每月 ${formatMoney(income.monthlyAmount)}，${income.growth === 'nominal' ? '固定名义口径' : '按购买力增长口径'}，年增长 ${percent(income.annualGrowthRate ?? 0)}`);
    for (const item of evaluation.cases.filter(item => item.key.coverage === coverage)) {
      lines.push('', `### ${scenarioLabels[item.key.returns]}收益情景`);
      const outcome = item.outcome;
      if (outcome.kind === 'needs-input') {
        lines.push('状态：待完善');
        for (const issue of outcome.issues) lines.push(`- ${escape(issue.message)}（${escape(issue.path)}；${issue.code}）`);
      } else if (outcome.kind === 'unresolved') lines.push(`状态：${outcome.reason === 'numeric-error' ? '计算数值错误' : '无法在当前搜索范围求解'}（${escape(outcome.message)}）`);
      else appendCaseResult(lines, outcome.result, amount, atMonth);
    }
  }
  lines.push('', '## 结果边界', '所有结果依赖本次输入快照和明示假设，不代表保证收益或保证可以退休。', '社保医保资金差异不是保障价值的完整定价；压力测试保持原消费、节点和收入，不自动减支或延后退休。');
  return lines.join('\n');
}

function appendCaseResult(lines: string[], result: CaseResult, amount: (value: number, month: number) => string, atMonth: (month: number) => string) {
  const month = result.desiredRetirement.month;
  lines.push(`收益假设：${Object.entries(result.assumptions.returns).map(([key, value]) => `${assetLabels[key as keyof typeof assetLabels]} ${percent(value)}`).join('；')}`);
  const target = result.retirementTarget;
  if (target.kind === 'unresolved') lines.push(`目标状态：${escape(target.message)}`);
  else lines.push(`推荐目标总资金：${amount(target.total, target.month)}`, `可配置投资本金：${amount(target.investmentPrincipal, target.month)}`, `现金缓冲：${amount(target.cashBuffer, target.month)}`, `提取率参考本金：${amount(target.withdrawalRatePrincipal, target.month)}`, `全程资金需求：${amount(target.wholePathNeed, target.month)}`);
  lines.push(`希望退休时预计资产：${amount(result.desiredRetirement.projectedAssets, month)}`, `资金目标差额：${result.desiredRetirement.gap === undefined ? '无法求解' : amount(result.desiredRetirement.gap, month)}`, `预计达标：${attainmentText(result.attainment)}`, `追加投入：${contributionText(result.additionalContribution)}`);
  if (result.firstShortfall) lines.push(`首次付款不足：${atMonth(result.firstShortfall.month)}，未覆盖 ${amount(result.firstShortfall.amount, result.firstShortfall.month)}`);
  if (result.stress) {
    const stress = result.stress;
    lines.push('#### 压力测试', `退休起点：${atMonth(stress.retirementMonth)}；初始资金 ${amount(stress.initialAssets, stress.retirementMonth)}`, `路径最低名义余额：${formatMoney(stress.minimumBalance)}（${atMonth(stress.minimumBalanceMonth)}）`, `路径最低实际购买力余额：${formatMoney(stress.minimumRealBalance)}（今天购买力；${atMonth(stress.minimumRealBalanceMonth)}）`, stress.firstShortfall ? `首次资金不足：${atMonth(stress.firstShortfall.month)}，未覆盖 ${amount(stress.firstShortfall.amount, stress.firstShortfall.month)}` : '压力测试路径未出现付款不足。');
  }
}
