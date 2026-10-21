import type { AssetBalances, AssetPathPoint, CompletePlanInputs, CoverageKey, PaymentShortfall, ReturnScenario, StressResult, SolverIssue, TargetOutcome } from '../contract';
import { budgetAtMonth, type LifeEventTimelineInput } from '../life-events';
import { evaluateInsurancePlans } from '../insurance';
import { applyAccountCashFlow } from './account-cash-flow';

export type MonthlyFlow = {
  month: number; inflationFactor: number; workIncome: number; pensionIncome: number; externalIncome: number;
  livingExpense: number; contribution: number; medicalSelfPay: number; debtPayment: number; oneOffExpense: number;
  income: number; recurringSpending: number; spending: number;
};
export type CompiledCase = {
  inputs: CompletePlanInputs; coverage: CoverageKey; scenario: ReturnScenario; retirementMonth: number;
  endMonth: number; returns: AssetBalances; flows: readonly MonthlyFlow[]; bufferAt(month:number):number;
};
export type Simulation = { path: AssetPathPoint[]; finalAssets: AssetBalances; minimumBalance: number; minimumRealBalance: number; minimumBalanceMonth: number; minimumRealBalanceMonth: number; firstShortfall?: PaymentShortfall; numericError: boolean };
export const assetTotal = (assets: AssetBalances) => assets.cash + assets.stocks + assets.bonds + assets.other;
const keys = ['cash','stocks','bonds','other'] as const;

export function compileCase(inputs: CompletePlanInputs, coverage: CoverageKey, scenario: ReturnScenario, retirementMonth: number): CompiledCase {
  const endMonth = Math.round((inputs.planningEndAge-inputs.currentAge)*12);
  const timeline:LifeEventTimelineInput = {startMonth:0,endMonth,currentPreRetirementAnnualBudget:inputs.annualLivingExpense,currentPostRetirementAnnualBudget:inputs.retirementAnnualLivingExpense,events:inputs.lifeEvents??[],oneOffExpenses:inputs.oneOffExpenses??[]};
  const insurance = evaluateInsurancePlans({startMonth:0,endMonth,retirementMonth,employmentStartMonth:inputs.salaryStartMonth,employmentEndMonth:inputs.salaryEndMonth,plans:inputs.coveragePlans,inflationRate:inputs.inflationRate});
  const selected = insurance.kind==='evaluated'?insurance.plans[coverage]:undefined;
  const insuranceRows = selected?.kind==='evaluated'?selected.rows:[];
  const events = new Map<number,number>();
  for(const event of inputs.oneOffExpenses??[]) events.set(event.month,(events.get(event.month)??0)+event.amount);
  const flows:MonthlyFlow[]=[];
  for(let month=0;month<endMonth;month++){
    const inflationFactor=Math.pow(1+inputs.inflationRate,month/12);
    const budget=budgetAtMonth(timeline,month,retirementMonth);
    const row=insuranceRows[month];
    const workIncome=month<retirementMonth&&month>=(inputs.salaryStartMonth??0)&&month<(inputs.salaryEndMonth??endMonth)?inputs.monthlyNetIncome*inflationFactor*Math.pow(1+(inputs.salaryRealGrowthRate??0),month/12):0;
    let externalIncome=row?.externalIncome??0;
    for(const income of inputs.externalIncome??[]){
      if(month>=income.startMonth&&month<income.endMonth)externalIncome+=income.monthlyAmount*(income.growth==='real'?inflationFactor:1)*Math.pow(1+(income.annualGrowthRate??0),(month-income.startMonth)/12);
    }
    const pensionIncome=row?.pensionIncome??0;
    const livingExpense=budget.annualLivingBudget/12*inflationFactor;
    const contribution=row?.contribution??0;
    const medicalSelfPay=row?.medicalSelfPay??0;
    const debtPayment=(inputs.debtPayments??[]).reduce((sum,debt)=>month>=debt.startMonth&&month<debt.endMonth?sum+debt.monthlyAmount*(debt.growth==='real'?inflationFactor:1):sum,0);
    const oneOffExpense=(events.get(month)??0)*inflationFactor;
    const recurringSpending=livingExpense+contribution+medicalSelfPay+debtPayment;
    flows.push({month,inflationFactor,workIncome,pensionIncome,externalIncome,livingExpense,contribution,medicalSelfPay,debtPayment,oneOffExpense,income:workIncome+pensionIncome+externalIncome,recurringSpending,spending:recurringSpending+oneOffExpense});
  }
  const prefix=[0];for(const flow of flows)prefix.push(prefix.at(-1)!+flow.recurringSpending);
  const bufferAt=(month:number)=>prefix[Math.min(endMonth,month+inputs.cashBufferMonths)]!-prefix[Math.min(endMonth,month)]!;
  return {inputs,coverage,scenario,retirementMonth,endMonth,returns:inputs.returnScenarios[scenario],flows,bufferAt};
}

function allocate(total:number,buffer:number,allocation:AssetBalances):AssetBalances{
  const cash=Math.min(Math.max(0,total),buffer);
  const rest=Math.max(0,total-cash);
  return {cash:cash+rest*allocation.cash,stocks:rest*allocation.stocks,bonds:rest*allocation.bonds,other:rest*allocation.other};
}

/** Sole monthly simulation for actual paths, reverse targets, contributions and stress. */
export function simulate(ctx:CompiledCase,options:{startMonth?:number;endMonth?:number;initialAssets?:AssetBalances;initialTotal?:number;additionalMonthly?:number;stress?:boolean;collect?:boolean}={}):Simulation{
  const start=options.startMonth??0,end=options.endMonth??ctx.endMonth;
  let assets={...(options.initialAssets??ctx.inputs.assets)};
  if(options.initialTotal!==undefined)assets=allocate(options.initialTotal,ctx.bufferAt(start),ctx.inputs.targetAllocation);
  const rates={cash:Math.pow(1+ctx.returns.cash,1/12)-1,stocks:Math.pow(1+ctx.returns.stocks,1/12)-1,bonds:Math.pow(1+ctx.returns.bonds,1/12)-1,other:Math.pow(1+ctx.returns.other,1/12)-1};
  let minimumBalance=assetTotal(assets),minimumBalanceMonth=start,minimumRealBalance=minimumBalance/Math.pow(1+ctx.inputs.inflationRate,start/12),minimumRealBalanceMonth=start;
  const trackMinimum=(month:number)=>{const nominal=assetTotal(assets),real=nominal/Math.pow(1+ctx.inputs.inflationRate,month/12);if(!Number.isFinite(real)){numericError=true;return;}if(nominal<minimumBalance){minimumBalance=nominal;minimumBalanceMonth=month;}if(real<minimumRealBalance){minimumRealBalance=real;minimumRealBalanceMonth=month;}};
  const path:AssetPathPoint[]=[];let firstShortfall:PaymentShortfall|undefined,numericError=!Number.isFinite(minimumRealBalance);
  for(let month=start;month<end;month++){
    const flow=ctx.flows[month];
    if(Object.values(flow).some(value=>!Number.isFinite(value))||!Number.isFinite(1/flow.inflationFactor)){numericError=true;break;}
    if(month===ctx.retirementMonth)assets=allocate(assetTotal(assets),ctx.bufferAt(month),ctx.inputs.targetAllocation);
    const openingAccounts={...assets};
    const isShock=options.stress===true&&month===ctx.retirementMonth;
    if(isShock){assets.stocks*=ctx.inputs.stockShock;assets.bonds*=ctx.inputs.bondShock;}
    trackMinimum(month);
    const additional=month<ctx.retirementMonth?(options.additionalMonthly??0)*flow.inflationFactor:0;
    const income=flow.income+additional;
    const payment=applyAccountCashFlow(assets,income-flow.spending,ctx.inputs.targetAllocation,ctx.bufferAt(month+1));
    assets=payment.assets;
    if(payment.shortfall>1e-8&&!firstShortfall)firstShortfall={month,amount:payment.shortfall};
    trackMinimum(month);
    const beforeReturn=assetTotal(assets);
    for(const key of keys)if(!(isShock&&(key==='stocks'||key==='bonds')))assets[key]*=1+rates[key];
    const returns=assetTotal(assets)-beforeReturn;
    // End-of-retirement-year transfers only move existing money.
    if(month>=ctx.retirementMonth&&(month-ctx.retirementMonth+1)%12===0)assets=allocate(assetTotal(assets),ctx.bufferAt(month+1),ctx.inputs.targetAllocation);
    const balance=assetTotal(assets);
    if(!Number.isFinite(balance)||!Number.isFinite(flow.spending)||!Number.isFinite(income)||keys.some(key=>!Number.isFinite(assets[key]))){numericError=true;break;}
    trackMinimum(month);
    if(options.collect!==false)path.push({month,age:ctx.inputs.currentAge+month/12,balance,income,spending:flow.spending,shortfall:payment.shortfall,inflationFactor:flow.inflationFactor,accounts:{...assets},openingAccounts,returns,investmentTransfer:payment.investmentTransfer,internalTransferNet:0,cashUsed:payment.cashUsed,bufferTarget:ctx.bufferAt(month+1),bufferShortage:Math.max(0,ctx.bufferAt(month+1)-assets.cash),livingExpense:flow.livingExpense,debtPayment:flow.debtPayment,oneOffExpense:flow.oneOffExpense,pensionIncome:flow.pensionIncome,externalIncome:flow.externalIncome,contribution:flow.contribution,medicalSelfPay:flow.medicalSelfPay});
  }
  return {path,finalAssets:assets,minimumBalance,minimumRealBalance,minimumBalanceMonth,minimumRealBalanceMonth,firstShortfall,numericError};
}

export function withdrawalReference(ctx: CompiledCase) {
  const start = ctx.retirementMonth;
  const count = Math.min(12, ctx.endMonth - start);
  const annualGap = count > 0 ? ctx.flows.slice(start, start + count)
    .reduce((sum, flow) => sum + flow.recurringSpending - flow.pensionIncome - flow.externalIncome, 0) * 12 / count : 0;
  const principal = Math.max(0, annualGap) / ctx.inputs.withdrawalRate;
  return { principal, total: principal + ctx.bufferAt(start) };
}

export function solveTarget(ctx:CompiledCase):TargetOutcome{
  const R=ctx.retirementMonth,C=ctx.bufferAt(R);
  const { principal: withdrawalRatePrincipal, total: withdrawalRateTotal } = withdrawalReference(ctx);
  const bound=ctx.inputs.solverMaxAmount,precision=0.01;
  if(!Number.isFinite(C)||!Number.isFinite(withdrawalRateTotal))return {kind:'unresolved',reason:'numeric-error',message:'当前假设导致非有限数值'};
  if(C>bound||withdrawalRateTotal>bound)return {kind:'unresolved',reason:'search-bound',message:'无法在当前搜索范围求解'};
  const numericIssue:SolverIssue={kind:'unresolved',reason:'numeric-error',message:'当前假设导致非有限数值'};
  const check=(amount:number)=>{const s=simulate(ctx,{startMonth:R,initialTotal:amount,collect:false});return s.numericError?'numeric-error':s.firstShortfall?'fails':'passes';};
  let low=C,high=C;
  const initial=check(C);
  if(initial==='numeric-error')return numericIssue;
  if(initial==='fails'){
    high=Math.min(bound,Math.max(C+1,withdrawalRateTotal,1000));
    let upper=check(high);
    while(high<bound&&upper==='fails'){high=Math.min(bound,high*2);upper=check(high);}
    if(upper==='numeric-error')return numericIssue;
    if(upper==='fails')return {kind:'unresolved',reason:'search-bound',message:'无法在当前搜索范围求解'};
    for(let i=0;i<80&&high-low>precision;i++){
      const mid=(low+high)/2,outcome=check(mid);
      if(outcome==='numeric-error')return numericIssue;
      if(outcome==='passes')high=mid;else low=mid;
    }
  }
  const wholePathNeed=high,total=Math.max(withdrawalRateTotal,wholePathNeed);
  if(check(total)!=='passes')return {kind:'unresolved',reason:'numeric-error',message:'目标资金未通过正向验证'};
  return {kind:'solved',month:R,total,investmentPrincipal:Math.max(0,total-C),cashBuffer:C,withdrawalRatePrincipal,withdrawalRateTotal,wholePathNeed,precision};
}
export function stressSummary(ctx:CompiledCase,initialTotal:number):StressResult|SolverIssue{
  const s=simulate(ctx,{startMonth:ctx.retirementMonth,initialTotal,stress:true});
  if(s.numericError)return {kind:'unresolved',reason:'numeric-error',message:'压力测试出现非有限数值'};
  return {retirementMonth:ctx.retirementMonth,initialAssets:initialTotal,minimumBalance:s.minimumBalance,minimumRealBalance:s.minimumRealBalance,minimumBalanceMonth:s.minimumBalanceMonth,minimumRealBalanceMonth:s.minimumRealBalanceMonth,firstShortfall:s.firstShortfall,path:s.path,stockShock:ctx.inputs.stockShock,bondShock:ctx.inputs.bondShock};
}
