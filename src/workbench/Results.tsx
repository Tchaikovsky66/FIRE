import { useRef, useState } from 'react';
import type { EvaluatedPlan, CoverageKey, ReturnScenario, CaseResult, PlanEvaluation, PlanDraft } from '../planning';
import { coverageNames, formatAge, formatMoney, purchasingPower } from '../display';
import { planIssueText } from '../display/validation';
import { FundingChart } from './visuals/FundingChart';
import { AssetBars } from './visuals/AssetBars';
import { downloadResultImage } from '../result-image';
const coverNames = coverageNames;
const scenarioNames = { conservative: '保守', baseline: '基准', optimistic: '乐观' };
export function attainmentText(result: CaseResult): string {
  const value = result.attainment;
  if (!value) return '正在求解';
  if (value.kind === 'now') return '现在';
  if (value.kind === 'future') return `约 ${formatAge(value.age)}`;
  if (value.kind === 'not-reached') return '规划期内未达标';
  return value.kind === 'unresolved' && value.reason === 'numeric-error' ? '计算数值错误' : '求解范围不足';
}
export function contributionText(result: CaseResult): string {
  const value = result.additionalContribution;
  if (!value) return '正在求解';
  if (value.kind === 'none') return '无需追加';
  if (value.kind === 'monthly') return `${formatMoney(value.amount)} / 月`;
  if (value.kind === 'immediate') return `立即一次性 ${formatMoney(value.amount)}`;
  return value.kind === 'unresolved' && value.reason === 'numeric-error' ? '计算数值错误' : '求解范围不足';
}
export function EvaluationIssues({ evaluation, draft }: { evaluation: PlanEvaluation; draft: PlanDraft }) {
  if (evaluation.kind === 'evaluated') return null;
  return <div className="validation" role="status"><b>{evaluation.kind === 'invalid' ? '请检查输入' : '资料待完善'}</b><ul>{evaluation.issues.map((issue, i) => <li key={`${issue.path}-${i}`}>{planIssueText(issue, draft)}</li>)}</ul>{evaluation.kind === 'needs-input' && <p>已知金融资产预览：{formatMoney(evaluation.preview.knownAssets)}</p>}</div>;
}
export function Results({ planName, evaluation, stale, pending, inputIssues = [] }: { planName: string; evaluation?: EvaluatedPlan; stale: boolean; pending: boolean; inputIssues?: readonly string[] }) {
  const section = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [coverage, setCoverage] = useState<CoverageKey>('continue');
  const [returns, setReturns] = useState<ReturnScenario>('baseline');
  const [nominal, setNominal] = useState(false);
  if (!evaluation) return <section className="results empty-results"><span className="orbit" /><h2>先留一点空间给未来</h2><p>完善年龄、生活费、收入和四类资产后，在这里查看你的退休路径。没有的项目请明确填 0。</p><p className="hint">个人数据默认空白，也可以载入独立标识的示例方案体验。</p></section>;
  const selected = evaluation.cases.find(row => row.key.coverage === coverage && row.key.returns === returns);
  const result = selected?.outcome.kind === 'evaluated' ? selected.outcome.result : undefined;
  const baseline = evaluation.cases.find(row => row.key.coverage === coverage && row.key.returns === 'baseline')?.outcome;
  const stress = baseline?.kind === 'evaluated' ? baseline.result.stress : undefined;
  const inputs = evaluation.snapshot.inputs;
  const retired = Math.round((inputs.desiredRetirementAge - inputs.currentAge) * 12);
  const inflation = inputs.inflationRate;
  const amount = (value: number, month = retired) => nominal ? value : purchasingPower(value, month, inflation);
  const target = result?.retirementTarget.kind === 'solved' ? result.retirementTarget : undefined;
  const data = result?.assetPath.map(point => ({ month: point.month, balance: amount(point.balance, point.month) })) ?? [];
  return <section ref={section} className={`results${stale ? ' is-stale' : ''}`} aria-busy={pending} aria-label="规划结果">
    <div className="result-top"><div><span className="section-number">YOUR RETIREMENT PATH</span><h2>把选择权，慢慢存起来。</h2></div><span className={`save-indicator${stale ? ' unsaved' : ''}`}>{pending ? '正在更新' : stale ? '最后有效结果' : '当前输入结果'}</span></div>
    <div className="result-controls"><div className="segmented" aria-label="社保医保缴费方案">{(['continue', 'stop'] as const).map(side => <button key={side} type="button" aria-pressed={coverage === side} onClick={() => setCoverage(side)}>{coverNames[side]}</button>)}</div><div className="segmented" aria-label="收益情景">{(['conservative', 'baseline', 'optimistic'] as const).map(side => <button key={side} type="button" aria-pressed={returns === side} onClick={() => setReturns(side)}>{scenarioNames[side]}</button>)}</div>
    <div className="image-export" data-export-exclude="true"><button type="button" disabled={stale || exporting || !result} onClick={async () => {
      if (!section.current || stale || !result) return;
      setExporting(true); setExportMessage('');
      try { await downloadResultImage(section.current, planName); setExportMessage('结果图片已生成。'); }
      catch { setExportMessage('图片生成失败，请重试。'); }
      finally { setExporting(false); }
    }}>{exporting ? '正在生成图片…' : '导出结果图片'}</button><span role="status">{exportMessage || (stale ? '完成输入并等待计算后可导出' : 'PNG · 仅包含结果')}</span></div></div>
    {inputIssues.length > 0 && <div className="validation" role="status"><b>结果尚未更新 · 请先完善当前输入</b><ul>{inputIssues.map((issue, index) => <li key={index}>{issue}</li>)}</ul><p>下方如有图表或数字，仍为最后有效结果；修正后会自动重新测算。</p></div>}
    {selected?.outcome.kind === 'needs-input' ? stale ? inputIssues.length === 0 && <p role="status">正在更新当前方案，养老金资料状态待重新确认。</p> : <div className="validation"><b>{coverNames[coverage]} · 待完善</b><ul>{selected.outcome.issues.map(issue => <li key={issue.path}>{planIssueText(issue, inputs)}</li>)}</ul><p>另一社保医保方案可独立查看，不把未知待遇视为 0。</p></div> : !result ? <div className="validation">求解范围不足或数值错误，请检查假设。</div> : <>
      <div className="chart-panel">
      <div className="chart-heading"><h3>资金随时间的路径</h3><label className="check"><input type="checkbox" checked={nominal} onChange={e => setNominal(e.target.checked)} />显示未来账面金额（未扣除通胀）</label></div><p className="hint">{coverNames[coverage]} · {scenarioNames[returns]}情景 · {nominal ? '金额按未来各时点的账面人民币显示，未扣除通胀。' : '金额已扣除通胀影响，统一折算成今天的购买力，便于判断够不够生活。'}曲线对应希望退休起点；虚线为该时点所需目标。</p>
      <FundingChart baseMonth={inputs.baseMonth} nominal={nominal} path={data} target={target ? amount(target.total) : 0} retirementMonth={retired} currentAge={inputs.currentAge} markers={(inputs.lifeEvents ?? []).map(event => ({ month: event.month, label: event.label }))} />
      <div className="timeline-legend"><span>现在 · {formatAge(inputs.currentAge)}</span><span>希望退休 · {formatAge(inputs.desiredRetirementAge)}</span><span>终点 · {formatAge(inputs.planningEndAge)}</span></div>

      </div>
      <details><summary>账面金额与今天购买力有什么区别？</summary><p className="hint">例如，若年通胀为 2%，10 年后的约 122 万元，相当于今天 100 万元的购买力。切换只改变显示口径，不改变退休安排。</p></details>
      <div className="event-tags">{(inputs.lifeEvents ?? []).map(event => <span key={event.id}>{event.label} · {formatAge(inputs.currentAge + event.month / 12)}</span>)}{(inputs.oneOffExpenses ?? []).map(event => <span key={event.id}>{event.label} · {formatMoney(event.amount)}</span>)}</div>
      <div className="metric-primary"><span>{coverNames[coverage]} · {scenarioNames[returns]}情景</span><div className="metric-label">希望退休时所需总资金</div><strong data-testid="target-total">{target ? formatMoney(amount(target.total)) : '无法在搜索范围求解'}</strong><p>{target ? <>投资本金 {formatMoney(amount(target.investmentPrincipal))} <i>＋</i> 现金缓冲 {formatMoney(amount(target.cashBuffer))}</> : '请调整当前假设，边界值不是精确目标。'}</p></div>
      <AssetBars accounts={inputs.assets} target={target ? amount(target.total) : undefined} /><div className="metric-grid"><div><span>按现状预计达标</span><strong data-testid="attainment">{attainmentText(result)}</strong>{result.attainment?.kind === 'future' && <small>距今约 {(result.attainment.month / 12).toFixed(1)} 年</small>}</div><div><span>希望退休时预计资产</span><strong>{formatMoney(amount(result.desiredRetirement.projectedAssets))}</strong><small>{formatAge(result.desiredRetirement.age)} · 月初余额</small></div><div><span>目标差额（目标 − 资产）</span><strong>{result.desiredRetirement.gap === undefined ? '求解范围不足' : formatMoney(amount(result.desiredRetirement.gap))}</strong></div><div className="accent-metric"><span>从现在起追加每月净投入</span><strong data-testid="additional-contribution">{contributionText(result)}</strong><small>税后、支付开销后留下的钱 · 今天购买力</small></div></div>
      {result.firstShortfall && <div className="validation error"><b>希望退休路径出现付款不足</b><p>第 {result.firstShortfall.month} 月（约 {formatAge(inputs.currentAge + result.firstShortfall.month / 12)}），未覆盖 {formatMoney(amount(result.firstShortfall.amount, result.firstShortfall.month))}。后来收入恢复不会消除这次不足。</p></div>}
      <details><summary>目标构成与资金来源</summary>{target && <dl><dt>提取率参考投资本金</dt><dd>{formatMoney(amount(target.withdrawalRatePrincipal))}</dd><dt>提取率约束总资金（含现金）</dt><dd>{formatMoney(amount(target.withdrawalRateTotal))}</dd><dt>全程资金需求</dt><dd>{formatMoney(amount(target.wholePathNeed))}</dd><dt>推荐目标</dt><dd>以上两种总约束取较高值</dd></dl>}{inputs.manualTarget !== undefined && <p>手动目标 {formatMoney(inputs.manualTarget)}（今天购买力），仅作对照。</p>}<p className="hint">现金缓冲从已有资产内部划分；自住房不计入可提款资金，房产净租金单独计入收入。债务余额不再整笔扣除。</p></details>
      {stress && <div className="stress-section"><div className="chart-heading"><h3>退休时遇到市场下跌（压力测试）</h3><span className="muted">基准收益 · 原定消费</span></div><p className="hint">假设退休第一个月遭遇市场下跌，之后按基准收益继续测算，观察资金能否支付原定生活费。</p><div className="stress-grid"><div><span>最低总余额</span><strong>{formatMoney(nominal ? stress.minimumBalance : stress.minimumRealBalance)}</strong></div><div><span>首次付款不足</span><strong>{stress.firstShortfall ? `第 ${stress.firstShortfall.month} 月` : '规划期内未发生'}</strong></div></div>{stress.firstShortfall && <p>该月未覆盖 {formatMoney(amount(stress.firstShortfall.amount, stress.firstShortfall.month))}</p>}<p className="hint">最低值时点：第 {nominal ? stress.minimumBalanceMonth : stress.minimumRealBalanceMonth} 月；退休起点：{formatAge(inputs.currentAge + stress.retirementMonth / 12)}；起始资金 {formatMoney(amount(stress.initialAssets))}；股票下跌 {((1 - stress.stockShock) * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%（剩余 {(stress.stockShock * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%），债券下跌 {((1 - stress.bondShock) * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%（剩余 {(stress.bondShock * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%），现金不受这次下跌影响。未自动减支、延后退休或提高回报。这是假设测试，不代表市场预测。</p></div>}
      <h3>两个社保医保缴费方案 · 三种收益假设</h3><div className="table-scroll"><table><thead><tr><th>方案 / 情景</th><th>所需总资金</th><th>预计达标</th><th>追加净投入</th></tr></thead><tbody>{evaluation.cases.map(row => <tr key={`${row.key.coverage}-${row.key.returns}`}><th>{coverNames[row.key.coverage]} / {scenarioNames[row.key.returns]}</th>{row.outcome.kind === 'evaluated' ? <><td>{row.outcome.result.retirementTarget.kind === 'solved' ? formatMoney(amount(row.outcome.result.retirementTarget.total)) : '求解范围不足'}</td><td>{attainmentText(row.outcome.result)}</td><td>{contributionText(row.outcome.result)}</td></> : <td colSpan={3}>{row.outcome.kind === 'needs-input' ? '待遇待完善' : row.outcome.reason === 'numeric-error' ? '计算数值错误' : '求解范围不足'}</td>}</tr>)}</tbody></table></div>
      <details className="monthly-explanation"><summary>使用的假设与月度解释</summary><p>通胀 {(inflation * 100).toFixed(1)}%；初始提取率 {(inputs.withdrawalRate * 100).toFixed(1)}%；现金缓冲 {inputs.cashBufferMonths} 个月。模型 {evaluation.modelVersion}。</p><p>当前情景年化总回报：现金 {(result.assumptions.returns.cash * 100).toFixed(1)}%、股票 {(result.assumptions.returns.stocks * 100).toFixed(1)}%、债券 {(result.assumptions.returns.bonds * 100).toFixed(1)}%、其他 {(result.assumptions.returns.other * 100).toFixed(1)}%。</p><div className="table-scroll"><table><thead><tr><th>月份</th><th>生活费</th><th>收入</th><th>大额支出</th><th>余额</th><th>缓冲不足</th></tr></thead><tbody>{result.assetPath.filter(point => point.month % 12 === 0 || point.shortfall > 0 || point.oneOffExpense > 0).map(point => <tr key={point.month}><td>{point.month}</td><td>{formatMoney(amount(point.livingExpense, point.month))}</td><td>{formatMoney(amount(point.income, point.month))}</td><td>{formatMoney(amount(point.oneOffExpense, point.month))}</td><td>{formatMoney(amount(point.balance, point.month))}</td><td>{formatMoney(amount(point.bufferShortage, point.month))}</td></tr>)}</tbody></table></div></details>
    </>}
    <p className="result-assumptions hint">通胀 {(inflation * 100).toFixed(1)}% · 初始提取率 {(inputs.withdrawalRate * 100).toFixed(1)}% · 现金缓冲 {inputs.cashBufferMonths} 个月 · 模型 {evaluation.modelVersion}</p>
    <p className="model-note">所有结果依赖录入数据与明示假设，不代表保证收益或保证可以退休。社保医保资金差异不等于保障价值的完整定价。</p>
  </section>;
}
