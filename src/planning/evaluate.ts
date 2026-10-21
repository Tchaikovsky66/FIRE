import { MODEL_VERSION, type CaseEvaluation, type FieldIssue, type PlanDraft, type PlanEvaluation } from './contract';
import { assetTotal, compileCase, simulate, solveTarget, stressSummary } from './internal/engine';
import { validatePlan } from './internal/validate';
import { solveRetirementTiming } from './internal/retirement-solve';

export function evaluatePlan(draft: PlanDraft): PlanEvaluation {
  const checked=validatePlan(draft);
  const knownAssets=Object.values(draft?.assets??{}).reduce((sum,value)=>sum+(typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0),0);
  if(checked.kind==='needs-input')return {kind:'needs-input',issues:checked.issues,preview:{knownAssets,knownAnnualLivingExpense:typeof draft.annualLivingExpense==='number'?draft.annualLivingExpense:undefined}};
  if(checked.kind==='invalid')return {kind:'invalid',issues:checked.issues};
  const inputs=checked.inputs!;
  const retirementMonth=Math.round((inputs.desiredRetirementAge-inputs.currentAge)*12);
  const cases:CaseEvaluation[]=[];
  for(const coverage of ['continue','stop'] as const)for(const scenario of ['conservative','baseline','optimistic'] as const){
    const missing:FieldIssue[]=[];
    const p=inputs.coveragePlans[coverage].pension;
    if(p.status==='unknown'||p.status==='known'&&(p.startMonth===undefined||p.monthlyAmount===undefined))missing.push({code:'missing',path:`coveragePlans.${coverage}.pension`,message:'请填写养老金起领时间与金额，或明确确认没有待遇'});
    if((inputs.assets.other>0||inputs.targetAllocation.other>0)&&draft.annualReturn===undefined&&draft.returnScenarios?.[scenario]?.other===undefined&&!draft.otherReturnConfirmedZero)missing.push({code:'missing',path:`returnScenarios.${scenario}.other`,message:'请填写其他资产收益，或确认按零收益估计'});
    if(missing.length){cases.push({key:{coverage,returns:scenario},outcome:{kind:'needs-input',issues:missing}});continue;}
    const ctx=compileCase(inputs,coverage,scenario,retirementMonth);
    if(ctx.flows.some(flow=>!Number.isFinite(1/flow.inflationFactor))){cases.push({key:{coverage,returns:scenario},outcome:{kind:'unresolved',reason:'numeric-error',message:'通胀换算超出有限数值范围'}});continue;}
    const target=solveTarget(ctx);
    if(target.kind==='unresolved'){cases.push({key:{coverage,returns:scenario},outcome:target});continue;}
    const pre=simulate(ctx,{endMonth:retirementMonth,collect:false});
    const projectedAssets=assetTotal(pre.finalAssets);
    const sim=simulate(ctx);
    if(pre.numericError||sim.numericError){cases.push({key:{coverage,returns:scenario},outcome:{kind:'unresolved',reason:'numeric-error',message:'当前假设导致非有限数值'}});continue;}
    cases.push({key:{coverage,returns:scenario},outcome:{kind:'evaluated',result:{...solveRetirementTiming(inputs,coverage,scenario),retirementTarget:target,assetPath:sim.path,desiredRetirement:{age:inputs.desiredRetirementAge,month:retirementMonth,projectedAssets,gap:target.total-projectedAssets},assumptions:{returns:{...inputs.returnScenarios[scenario]},inflationRate:inputs.inflationRate,withdrawalRate:inputs.withdrawalRate,cashBufferMonths:inputs.cashBufferMonths},firstShortfall:sim.firstShortfall,...(scenario==='baseline'?{stress:stressSummary(ctx,projectedAssets)}:{})}}});
  }
  const primary=cases.find(c=>c.key.coverage==='continue'&&c.key.returns==='baseline');
  return {kind:'evaluated',modelVersion:MODEL_VERSION,snapshot:{inputs,capturedAtAge:inputs.currentAge},cases,...(primary?.outcome.kind==='evaluated'?{result:primary.outcome.result}:{})};
}
