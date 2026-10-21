import type { AssetBalances, CompletePlanInputs, FieldIssue, PlanDraft, ReturnScenario, ScenarioReturns } from '../contract';
import type { InsurancePlanInput } from '../insurance';
import { validateLifeEventTimeline } from '../life-events';

const ASSETS = ['cash','stocks','bonds','other'] as const;
const SCENARIOS = ['conservative','baseline','optimistic'] as const;
const defaults:ScenarioReturns={conservative:{cash:.005,bonds:.01,stocks:.02,other:0},baseline:{cash:.015,bonds:.025,stocks:.06,other:0},optimistic:{cash:.02,bonds:.04,stocks:.08,other:0}};
const isObject=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export type Validation={kind:'needs-input'|'invalid'|'complete';issues:FieldIssue[];inputs?:CompletePlanInputs};

export function validatePlan(draft:PlanDraft):Validation {
  const issues:FieldIssue[]=[];
  const issue=(path:string,message:string,code:FieldIssue['code']='invalid')=>issues.push({path,message,code});
  const num=(path:string,v:unknown,min=0,max=1e15,required=false,integer=false)=>{
    if(v===undefined){if(required)issue(path,'请填写此项；没有请明确填 0','missing');return;}
    if(!finite(v))issue(path,'请输入有限数字');
    else if(v<min||v>max||(integer&&!Number.isInteger(v)))issue(path,integer?'请输入范围内的整数':'数值超出允许范围','out-of-range');
  };
  const rate=(path:string,v:unknown)=>{if(v!==undefined&&(!finite(v)||v<=-1||v>10))issue(path,'年率必须高于 -100% 且不超过 1000%','out-of-range');};
  const text=(path:string,v:unknown)=>{if(typeof v!=='string'||!v.trim()||v.length>500)issue(path,'请输入有效文本');};
  if(!isObject(draft))return {kind:'invalid',issues:[{code:'invalid',path:'plan',message:'方案结构无效'}]};
  num('currentAge',draft.currentAge,0,150,true);num('desiredRetirementAge',draft.desiredRetirementAge,0,150,true);num('planningEndAge',draft.planningEndAge,0,150,true);
  num('annualLivingExpense',draft.annualLivingExpense,0,1e15,true);num('retirementAnnualLivingExpense',draft.retirementAnnualLivingExpense,0,1e15,true);num('monthlyNetIncome',draft.monthlyNetIncome,0,1e15,true);
  if(draft.assets!==undefined&&!isObject(draft.assets))issue('assets','资产结构无效');
  for(const k of ASSETS)num(`assets.${k}`,isObject(draft.assets)?draft.assets[k]:undefined,0,1e15,true);
  for(const k of ['annualRigidExpense','retirementAnnualRigidExpense','selfOccupiedHomeValue','rentalPropertyValue','debtBalance','manualTarget'] as const)num(k,draft[k]);
  if(finite(draft.annualRigidExpense)&&finite(draft.annualLivingExpense)&&draft.annualRigidExpense>draft.annualLivingExpense)issue('annualRigidExpense','刚性生活费不能超过完整生活费','out-of-range');
  if(finite(draft.retirementAnnualRigidExpense)&&finite(draft.retirementAnnualLivingExpense)&&draft.retirementAnnualRigidExpense>draft.retirementAnnualLivingExpense)issue('retirementAnnualRigidExpense','刚性生活费不能超过完整生活费','out-of-range');
  if(finite(draft.currentAge)&&finite(draft.desiredRetirementAge)&&draft.desiredRetirementAge<draft.currentAge)issue('desiredRetirementAge','希望退休年龄不能早于当前年龄','out-of-range');
  if(finite(draft.planningEndAge)&&finite(draft.desiredRetirementAge)&&draft.planningEndAge<=draft.desiredRetirementAge)issue('planningEndAge','规划终点必须晚于希望退休年龄','out-of-range');
  if(draft.scope!==undefined&&!['individual','household'].includes(draft.scope))issue('scope','统计范围无效');
  if(draft.baseMonth!==undefined&&(typeof draft.baseMonth!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.baseMonth)))issue('baseMonth','基准月份格式须为 YYYY-MM');
  rate('annualReturn',draft.annualReturn);rate('inflationRate',draft.inflationRate);rate('salaryRealGrowthRate',draft.salaryRealGrowthRate);
  num('withdrawalRate',draft.withdrawalRate,1e-8,1);num('cashBufferMonths',draft.cashBufferMonths,0,1800,false,true);
  num('stockShock',draft.stockShock,0,1);num('bondShock',draft.bondShock,0,1);num('solverMaxAmount',draft.solverMaxAmount,.01,1e18);
  num('salaryStartMonth',draft.salaryStartMonth,0,1800,false,true);num('salaryEndMonth',draft.salaryEndMonth,0,1800,false,true);
  if(draft.salaryEndMonth!==undefined&&draft.salaryStartMonth!==undefined&&draft.salaryEndMonth<draft.salaryStartMonth)issue('salaryEndMonth','工作结束时间不能早于开始时间');
  if(draft.otherReturnConfirmedZero!==undefined&&typeof draft.otherReturnConfirmedZero!=='boolean')issue('otherReturnConfirmedZero','确认状态无效');
  if(draft.targetAllocation!==undefined){
    if(!isObject(draft.targetAllocation))issue('targetAllocation','目标配置结构无效');
    else {for(const k of ASSETS)num(`targetAllocation.${k}`,draft.targetAllocation[k],0,1,true);if(ASSETS.every(k=>finite(draft.targetAllocation![k]))&&Math.abs(ASSETS.reduce((s,k)=>s+draft.targetAllocation![k]!,0)-1)>1e-8)issue('targetAllocation','目标配置比例之和必须为 100%','out-of-range');}
  }
  if(draft.returnScenarios!==undefined){
    if(!isObject(draft.returnScenarios))issue('returnScenarios','收益情景结构无效');
    else for(const s of SCENARIOS)if(draft.returnScenarios[s]!==undefined){if(!isObject(draft.returnScenarios[s]))issue(`returnScenarios.${s}`,'收益情景结构无效');else for(const k of ASSETS)rate(`returnScenarios.${s}.${k}`,draft.returnScenarios[s]![k]);}
  }
  const endMonth=finite(draft.planningEndAge)&&finite(draft.currentAge)?Math.round((draft.planningEndAge-draft.currentAge)*12):1800;
  for(const key of ['lifeEvents','oneOffExpenses','debtPayments','externalIncome'] as const)if(draft[key]!==undefined&&!Array.isArray(draft[key]))issue(key,'请输入有效列表');
  const ids=(path:string,entries:readonly {id:string}[])=>{const seen=new Set<string>();for(const entry of entries){if(!isObject(entry)){issue(path,'条目结构无效');continue;}text(`${path}.id`,entry.id);if(seen.has(entry.id))issue(`${path}.${entry.id}`,'条目 ID 不能重复');seen.add(entry.id);}};
  if(Array.isArray(draft.lifeEvents)){
    ids('lifeEvents',draft.lifeEvents);
    for(const e of draft.lifeEvents){if(!isObject(e))continue;text(`lifeEvents.${e.id}.label`,e.label);num(`lifeEvents.${e.id}.month`,e.month,0,Math.max(0,endMonth-1),true,true);num(`lifeEvents.${e.id}.preRetirementAnnualBudget`,e.preRetirementAnnualBudget);num(`lifeEvents.${e.id}.postRetirementAnnualBudget`,e.postRetirementAnnualBudget);}
    if(draft.lifeEvents.every(isObject)){
      const conflict=validateLifeEventTimeline({startMonth:0,endMonth:Math.max(1,endMonth),currentPreRetirementAnnualBudget:0,currentPostRetirementAnnualBudget:0,events:draft.lifeEvents as unknown as import('../life-events').LifeEvent[],oneOffExpenses:[]}).filter(i=>i.code==='conflicting-budget');
      for(const c of conflict)issue(`lifeEvents.${c.eventIds?.[0]??''}`,'同月有多个完整预算，请合并或修改时间','conflicting-budget');
    }
  }
  if(Array.isArray(draft.oneOffExpenses)){ids('oneOffExpenses',draft.oneOffExpenses);for(const e of draft.oneOffExpenses){if(!isObject(e))continue;text(`oneOffExpenses.${e.id}.label`,e.label);num(`oneOffExpenses.${e.id}.month`,e.month,0,Math.max(0,endMonth-1),true,true);num(`oneOffExpenses.${e.id}.amount`,e.amount,0,1e15,true);}}
  const interval=(path:string,start:unknown,end:unknown)=>{num(`${path}.startMonth`,start,0,1800,true,true);num(`${path}.endMonth`,end,0,1800,true,true);if(finite(start)&&finite(end)&&end<start)issue(`${path}.endMonth`,'结束月份不能早于开始月份');};
  const growth=(path:string,value:unknown)=>{if(value!==undefined&&value!=='real'&&value!=='nominal')issue(path,'增长口径无效');};
  const incomes=(path:string,values:unknown)=>{if(!Array.isArray(values)){issue(path,'组合外收入结构无效');return;}ids(path,values);for(const e of values){if(!isObject(e))continue;num(`${path}.${e.id}.monthlyAmount`,e.monthlyAmount,0,1e15,true);interval(`${path}.${e.id}`,e.startMonth,e.endMonth);rate(`${path}.${e.id}.annualGrowthRate`,e.annualGrowthRate);growth(`${path}.${e.id}.growth`,e.growth);}};
  if(Array.isArray(draft.externalIncome))incomes('externalIncome',draft.externalIncome);
  if(Array.isArray(draft.debtPayments)){ids('debtPayments',draft.debtPayments);for(const d of draft.debtPayments){if(!isObject(d))continue;interval(`debtPayments.${d.id}`,d.startMonth,d.endMonth);num(`debtPayments.${d.id}.monthlyAmount`,d.monthlyAmount,0,1e15,true);growth(`debtPayments.${d.id}.growth`,d.growth);}}
  if(draft.coveragePlans!==undefined){if(!isObject(draft.coveragePlans))issue('coveragePlans','社保医保方案结构无效');else for(const coverage of ['continue','stop'] as const){const p=draft.coveragePlans[coverage];if(p===undefined)continue;const path=`coveragePlans.${coverage}`;if(!isObject(p)){issue(path,'社保医保方案结构无效');continue;}num(`${path}.contributionMonthly`,p.contributionMonthly,0,1e15,true);interval(`${path}.contribution`,p.contributionStartMonth,p.contributionEndMonth);if(typeof p.contributionsAlreadyDeducted!=='boolean')issue(`${path}.contributionsAlreadyDeducted`,'请确认工资是否已扣缴费');num(`${path}.medicalSelfPayMonthly`,p.medicalSelfPayMonthly,0,1e15,true);growth(`${path}.contributionGrowth`,p.contributionGrowth);if(!isObject(p.pension)||!['unknown','none','known'].includes(p.pension.status))issue(`${path}.pension`,'养老金状态无效');else{num(`${path}.pension.startMonth`,p.pension.startMonth,0,1800,false,true);num(`${path}.pension.monthlyAmount`,p.pension.monthlyAmount);rate(`${path}.pension.annualGrowthRate`,p.pension.annualGrowthRate);growth(`${path}.pension.growth`,p.pension.growth);if(p.pension.amountBasis!==undefined&&!['today','start-month'].includes(p.pension.amountBasis))issue(`${path}.pension.amountBasis`,'养老金金额口径无效');if(p.pension.existingRights!==undefined&&typeof p.pension.existingRights!=='boolean')issue(`${path}.pension.existingRights`,'已有权益状态无效');}incomes(`${path}.externalIncome`,p.externalIncome);}}
  const invalid=issues.some(i=>i.code!=='missing');if(invalid)return {kind:'invalid',issues};if(issues.length)return {kind:'needs-input',issues};
  const assets={...draft.assets} as AssetBalances;const total=ASSETS.reduce((sum,k)=>sum+assets[k],0);
  const target=draft.targetAllocation?{...draft.targetAllocation} as AssetBalances:ASSETS.reduce((obj,k)=>({...obj,[k]:total?assets[k]/total:k==='cash'?1:0}),{} as AssetBalances);
  const returns={} as ScenarioReturns;
  for(const s of SCENARIOS){returns[s]={...defaults[s],...draft.returnScenarios?.[s]};if(draft.annualReturn!==undefined)for(const k of ASSETS)returns[s][k]=draft.annualReturn;}
  const unknown=():InsurancePlanInput=>({contributionMonthly:0,contributionStartMonth:0,contributionEndMonth:0,contributionsAlreadyDeducted:false,medicalSelfPayMonthly:0,pension:{status:'unknown'},externalIncome:[]});
  const inputs:CompletePlanInputs={...structuredClone(draft),currentAge:draft.currentAge!,desiredRetirementAge:draft.desiredRetirementAge!,planningEndAge:draft.planningEndAge!,annualLivingExpense:draft.annualLivingExpense!,retirementAnnualLivingExpense:draft.retirementAnnualLivingExpense!,monthlyNetIncome:draft.monthlyNetIncome!,assets,inflationRate:draft.inflationRate??.02,withdrawalRate:draft.withdrawalRate??.03,cashBufferMonths:draft.cashBufferMonths??24,stockShock:draft.stockShock??.65,bondShock:draft.bondShock??.95,targetAllocation:target,returnScenarios:returns,coveragePlans:{continue:structuredClone(draft.coveragePlans?.continue??unknown()),stop:structuredClone(draft.coveragePlans?.stop??unknown())},solverMaxAmount:draft.solverMaxAmount??1e14};
  return {kind:'complete',issues:[],inputs};
}
