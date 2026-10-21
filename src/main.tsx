import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type PlanDraft } from './planning';
import { usePlanningSession } from './session';
import { encodePlanFile, decodePlanFile, copyPlan, createWorkspace, type Workspace, type NamedPlan, validatePlanDraft } from './plan-documents';
import { restoreWorkspace, saveWorkspace } from './local-persistence';
import { renderMarkdownReport } from './report';
import { Results, EvaluationIssues, attainmentText, contributionText } from './workbench/Results';
import { steps, LifeFields, AssetFields, EventFields, InsuranceFields, AssumptionFields, coverageDefault } from './workbench/steps/PlanFields';
import { formatMoney, purchasingPower } from './display';
import './styles.css';

const baselineMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };
const blankPlan = (): NamedPlan => ({ id: crypto.randomUUID(), name: '我的退休方案', draft: { baseMonth: baselineMonth(), scope: 'individual', planningEndAge: 85, inflationRate: .02, withdrawalRate: .03, cashBufferMonths: 24 } });
function examplePlan(): NamedPlan {
  const base = coverageDefault();
  return { id: crypto.randomUUID(), name: '小林的选择 · 示例', isExample: true, draft: { baseMonth: baselineMonth(), scope: 'individual', currentAge: 35, desiredRetirementAge: 50, planningEndAge: 85, annualLivingExpense: 96000, retirementAnnualLivingExpense: 120000, annualRigidExpense: 60000, retirementAnnualRigidExpense: 72000, monthlyNetIncome: 25000, assets: { cash: 200000, stocks: 500000, bonds: 300000, other: 0 }, targetAllocation: { cash: .1, stocks: .5, bonds: .4, other: 0 }, coveragePlans: { continue: { ...base, contributionMonthly: 1500, contributionEndMonth: 300, contributionsAlreadyDeducted: false, medicalSelfPayMonthly: 500, pension: { status: 'known', startMonth: 300, monthlyAmount: 4000, annualGrowthRate: .02, existingRights: true } }, stop: { ...base, medicalSelfPayMonthly: 1000, pension: { status: 'known', startMonth: 300, monthlyAmount: 1200, annualGrowthRate: .02, existingRights: true } } }, inflationRate: .02, withdrawalRate: .03, cashBufferMonths: 24, otherReturnConfirmedZero: true } };
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
function loadInitial(): { workspace: Workspace; message: string; blocked: boolean } {
  try { const restored = restoreWorkspace(window.localStorage); if (restored.kind === 'restored') return { workspace: restored.workspace, message: '已从本地恢复，按当前模型重新计算', blocked: false }; return { workspace: createWorkspace(blankPlan()), message: restored.kind === 'error' ? `${restored.message} 原始本地数据已保留；新建或导入后才重新保存。` : '', blocked: restored.kind === 'error' }; } catch { return { workspace: createWorkspace(blankPlan()), message: '本地存储不可用，当前方案仍可编辑并导出', blocked: true }; }
}
function App() {
  const [initial] = useState(loadInitial);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [persistenceBlocked, setPersistenceBlocked] = useState(initial.blocked);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState(initial.message);
  const [saved, setSaved] = useState('正在保存');
  const [compareId, setCompareId] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const active = workspace.plans.find(plan => plan.id === workspace.activePlanId) ?? workspace.plans[0];
  const session = usePlanningSession(active);
  const { evaluation, lastValid, pending, latency, markInput } = session;
  const comparedPlan = workspace.plans.find(plan => plan.id === compareId);
  const comparisonSession = usePlanningSession(comparedPlan);
  const comparison = comparisonSession.evaluation?.kind === 'evaluated' ? comparisonSession.evaluation : undefined;
  useEffect(() => { if (session.error) setMessage(session.error); }, [session.error]);
  useEffect(() => {
    if (persistenceBlocked) { setSaved('未保存：原始本地数据已保留，可新建或导入'); return; }
    const timer = setTimeout(() => { try { const result = saveWorkspace(window.localStorage, workspace); setSaved(result.kind === 'saved' ? '已保存在此浏览器' : result.message); } catch { setSaved('未保存：本地存储不可用，请导出备份'); } }, 180);
    return () => clearTimeout(timer);
  }, [workspace, persistenceBlocked]);
  const patch = (value: Partial<PlanDraft>) => { markInput(); setWorkspace(current => ({ ...current, plans: current.plans.map(plan => plan.id === active.id ? { ...plan, draft: { ...plan.draft, ...value } } : plan) })); };
  const append = (plan: NamedPlan) => { setPersistenceBlocked(false); markInput(); setWorkspace(current => ({ plans: [...current.plans, plan], activePlanId: plan.id })); setStep(0); };
  const exportJson = () => { if (!validatePlanDraft(active.draft)) { setMessage('请先完成或修正无效数字，再导出有效方案；最后已保存的数据仍被保留。'); return; } download(encodePlanFile(active), `FIRE-${active.name}.json`, 'application/json'); setMessage('JSON 备份已生成，包含输入和假设，不包含旧计算缓存。'); };
  const exportReport = () => { if (pending || !evaluation || evaluation.kind !== 'evaluated') return; download(renderMarkdownReport(evaluation), `FIRE-${active.name}.md`, 'text/markdown;charset=utf-8'); setMessage('Markdown 报告已从当前同一评估快照生成。'); };
  const evaluated = evaluation?.kind === 'evaluated' ? evaluation : lastValid;
  const stale = pending || evaluation?.kind !== 'evaluated';
  const props = { draft: active.draft, patch };
  const comparisonResult = comparison?.cases.find(row => row.key.coverage === 'continue' && row.key.returns === 'baseline')?.outcome;
  const summaryResult = evaluated?.cases.find(row => row.key.coverage === 'continue' && row.key.returns === 'baseline')?.outcome;
  return <main className="app">
    <header className="app-header"><a className="brand" href="#" aria-label="FIRE 规划首页"><span className="brand-mark">F</span> FIRE<span className="brand-desc">自由，从算清开始</span></a><span className="local-label">本地规划 · 无需账号</span></header>
    <div className="workspace-toolbar"><div className="plan-picker"><label htmlFor="plan-select">当前方案</label><select id="plan-select" aria-label="当前方案" value={active.id} onChange={e => { markInput(); setWorkspace(current => ({ ...current, activePlanId: e.target.value })); setStep(0); }}>{workspace.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}{plan.isExample ? '（示例）' : ''}</option>)}</select><span className="save-indicator" role="status">{saved}</span></div><div className="toolbar-actions"><button type="button" onClick={() => append(blankPlan())}>新建</button><button type="button" onClick={() => { markInput(); setWorkspace(current => copyPlan(current, active.id)); }}>复制</button><button type="button" onClick={exportJson}>导出 JSON</button><button type="button" onClick={() => fileInput.current?.click()}>导入</button></div></div>
    <input ref={fileInput} aria-label="导入 JSON 文件" type="file" accept="application/json,.json" hidden onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { const decoded = decodePlanFile(await file.text()); if (decoded.kind !== 'decoded') { setMessage(`导入失败：${decoded.message}`); } else { append({ ...decoded.plan, id: crypto.randomUUID(), name: `${decoded.plan.name}（导入副本）` }); setMessage('已导入为新副本，现有方案已保留。'); } } catch { setMessage('导入失败：无法读取文件。现有方案已保留。'); } e.target.value = ''; }} />
    {message && <div className="notice" role="status"><span>{message}</span><button type="button" aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
    <div className="page-heading"><div><span className="section-number">FIRE PLANNER / 01</span><h1>你的生活，<br />由你来安排。</h1><p>从今天的收支，到未来的选择。用一条路径，理解退休需要的资金与时间。</p></div><div className="heading-aside"><span>一份方案，三个问题</span><p>需要多少资金<br />何时满足条件<br />每月还需投入多少</p></div></div>
    {active.isExample && <div className="example-notice">当前为独立示例，所有数字仅用于体验。<button type="button" onClick={() => append(blankPlan())}>建立我的空白方案</button></div>}
    {!active.isExample && workspace.plans.length === 1 && !active.draft.currentAge && <button type="button" className="example-link" onClick={() => append(examplePlan())}>先用「小林的示例」体验完整路径 →</button>}
    <div className="mobile-summary">{stale ? '正在更新 / 最后有效结果' : '继续购买 · 基准'}<strong>{summaryResult?.kind === 'evaluated' ? attainmentText(summaryResult.result) : '待完善资料'}</strong></div>
    <div className="workspace">
      <section className="inputs" aria-label="规划输入"><nav className="step-nav" aria-label="六步规划">{steps.map((label, index) => <button key={label} type="button" aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, '0')}</span><b>{label}</b></button>)}</nav>
        <form onSubmit={e => e.preventDefault()} className="step-form" key={active.id}><div className="step-title"><span className="section-number">STEP {String(step + 1).padStart(2, '0')} / 06</span><h2>{steps[step]}</h2></div>
          {step === 0 ? <LifeFields {...props} /> : step === 1 ? <AssetFields {...props} /> : step === 2 ? <EventFields {...props} /> : step === 3 ? <InsuranceFields {...props} /> : step === 4 ? <AssumptionFields {...props} /> : <><p className="section-copy">希望退休年龄是一种选择；预计达标年龄来自当前假设。你可以回到任何一步，比较不同生活安排。</p><label>方案名称<input aria-label="方案名称" value={active.name} onChange={e => setWorkspace(current => ({ ...current, plans: current.plans.map(plan => plan.id === active.id ? { ...plan, name: e.target.value } : plan) }))} /></label><button type="button" className="primary" disabled={pending || evaluation?.kind !== 'evaluated'} onClick={exportReport}>导出 Markdown 报告</button><h3>与另一个方案比较</h3><label>比较对象<select aria-label="比较对象" value={compareId} onChange={e => { comparisonSession.markInput(); setCompareId(e.target.value); }}><option value="">选择本地方案</option>{workspace.plans.filter(row => row.id !== active.id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{comparison && <div className="comparison-summary"><h4>{comparedPlan?.name}</h4><p className="hint">继续购买 · 基准收益 · 今天购买力</p>{comparisonResult?.kind === 'evaluated' ? <><p>所需资金：{comparisonResult.result.retirementTarget.kind === 'solved' ? formatMoney(purchasingPower(comparisonResult.result.retirementTarget.total, comparisonResult.result.desiredRetirement.month, comparison.snapshot.inputs.inflationRate)) : '求解范围不足'}</p><p>预计达标：{attainmentText(comparisonResult.result)}</p><p>追加净投入：{contributionText(comparisonResult.result)}</p></> : <p>待遇待完善</p>}<div className="table-scroll"><table><thead><tr><th>比较方案 / 情景</th><th>所需资金</th><th>预计达标</th><th>追加净投入</th></tr></thead><tbody>{comparison.cases.map(row => <tr key={`${row.key.coverage}-${row.key.returns}`}><th>{row.key.coverage === 'continue' ? '继续购买' : '不再购买'} / {{conservative:'保守',baseline:'基准',optimistic:'乐观'}[row.key.returns]}</th>{row.outcome.kind === 'evaluated' ? <><td>{row.outcome.result.retirementTarget.kind === 'solved' ? formatMoney(purchasingPower(row.outcome.result.retirementTarget.total,row.outcome.result.desiredRetirement.month,comparison.snapshot.inputs.inflationRate)) : row.outcome.result.retirementTarget.message}</td><td>{attainmentText(row.outcome.result)}</td><td>{contributionText(row.outcome.result)}</td></> : <td colSpan={3}>{row.outcome.kind === 'needs-input' ? '待遇待完善' : row.outcome.message}</td>}</tr>)}</tbody></table></div></div>}{compareId && !comparison && <p>{comparisonSession.pending ? '正在更新比较方案…' : '比较方案资料待完善，不能显示为零。'}</p>}<details className="life-note"><summary>退休以后，你想怎样过一天？</summary><p>试着留出一段时间，提前体验自己的退休生活。除了预算，还可以为作息、关系、运动与愿意持续做的事，留下位置。</p></details></>}
          <div className="step-actions"><button type="button" className="secondary" disabled={step === 0} onClick={() => setStep(n => n - 1)}>上一步</button><span>{step + 1} / 6</span><button type="button" className="primary" disabled={step === 5} onClick={() => setStep(n => n + 1)}>下一步 →</button></div>
        </form>
        {evaluation && <EvaluationIssues evaluation={evaluation} />}
        <p className="latency" data-testid="evaluation-latency">{latency === undefined ? '等待输入' : `最近一次输入 → ${evaluation?.kind === 'evaluated' ? '有效评估' : '输入校验'} ${Math.round(latency)} ms`}</p>
      </section>
      <Results evaluation={evaluated} stale={stale} pending={pending} />
    </div><footer><span>FIRE · 财务独立与提前退休规划</span><span>人民币 · 按月计算 · 数据保存在你的浏览器</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
