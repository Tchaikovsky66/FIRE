import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { evaluatePlan, type PlanDraft } from './planning';
import './styles.css';

const initial: PlanDraft = { currentAge: 35, desiredRetirementAge: 60, planningEndAge: 85, annualLivingExpense: 120000, monthlyNetIncome: 30000, assets: { cash: 100000, stocks: 400000, bonds: 200000, other: 0 } };

function App() {
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const evaluation = useMemo(() => evaluatePlan(draft), [draft]);
  const update = (field: keyof PlanDraft, value: string) => setDraft((current) => ({ ...current, [field]: value === '' ? undefined : Number(value) }));
  return <main className="app">
    <header><p className="eyebrow">本地优先 · FIRE 规划</p><h1>把退休计划变成一条看得懂的路径</h1><p className="lead">输入当前情况，查看目标资金与资产路径。结果只基于你填写的假设。</p></header>
    <section className="workspace">
      <form className="panel inputs" onSubmit={(event) => event.preventDefault()}><h2>建立你的基础方案</h2>
        <label>当前年龄<input aria-label="当前年龄" type="number" min="0" value={draft.currentAge ?? ''} onChange={(e) => update('currentAge', e.target.value)} /></label>
        <label>希望退休年龄<input aria-label="希望退休年龄" type="number" min="0" value={draft.desiredRetirementAge ?? ''} onChange={(e) => update('desiredRetirementAge', e.target.value)} /></label>
        <label>规划终点年龄<input aria-label="规划终点年龄" type="number" min="0" value={draft.planningEndAge ?? ''} onChange={(e) => update('planningEndAge', e.target.value)} /></label>
        <label>年度生活费（元）<input aria-label="年度生活费" type="number" min="0" value={draft.annualLivingExpense ?? ''} onChange={(e) => update('annualLivingExpense', e.target.value)} /></label>
        <label>月税后收入（元）<input aria-label="月税后收入" type="number" min="0" value={draft.monthlyNetIncome ?? ''} onChange={(e) => update('monthlyNetIncome', e.target.value)} /></label>
        <label>可投资资产（元）<input aria-label="可投资资产" type="number" min="0" value={draft.assets ? Object.values(draft.assets).reduce((a, b) => a + (b ?? 0), 0) : ''} onChange={(e) => setDraft((current) => ({ ...current, assets: { cash: Number(e.target.value) || 0, stocks: 0, bonds: 0, other: 0 } }))} /></label>
      </form>
      <section className="panel result" aria-live="polite"><div className="result-heading"><div><p className="eyebrow">当前评估</p><h2>{evaluation.kind === 'evaluated' ? '你的规划起点' : evaluation.kind === 'needs-input' ? '还差一点资料' : '请检查输入'}</h2></div><span className={`status ${evaluation.kind}`}>{evaluation.kind === 'evaluated' ? '已计算' : evaluation.kind === 'needs-input' ? '待完善' : '输入无效'}</span></div>
        {evaluation.kind === 'evaluated' ? <><div className="metrics"><div><span>退休目标资金</span><strong>¥{Math.round(evaluation.result.retirementTarget.total).toLocaleString('zh-CN')}</strong></div><div><span>希望退休年龄</span><strong>{evaluation.result.desiredRetirement.age} 岁</strong></div><div><span>当前资产</span><strong>¥{Math.round(evaluation.result.assetPath[0]?.balance ?? 0).toLocaleString('zh-CN')}</strong></div></div><div className="chart"><div className="chart-line" style={{ height: `${Math.min(100, Math.max(8, (evaluation.result.assetPath.at(-1)?.balance ?? 0) / evaluation.result.retirementTarget.total * 100))}%` }} /><span>资产路径预览</span></div><p className="hint">金额按今天购买力输入，模型版本 {evaluation.modelVersion}。详细人生节点、收益情景和方案管理将在后续步骤加入。</p></> : <><ul className="issues">{evaluation.issues.map((issue) => <li key={`${issue.path}-${issue.code}`}><b>{issue.path}</b>：{issue.message}</li>)}</ul>{evaluation.kind === 'needs-input' && <p className="hint">已填写资产预览：¥{evaluation.preview.knownAssets.toLocaleString('zh-CN')}</p>}</>}
      </section>
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
