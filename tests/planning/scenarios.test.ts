import { describe, it, expect } from 'vitest';
import { evaluatePlan, type PlanDraft } from '../../src/planning';
const none = {contributionMonthly:0, contributionStartMonth:0, contributionEndMonth:120, contributionsAlreadyDeducted:false, medicalSelfPayMonthly:0, pension:{status:'none' as const}, externalIncome:[]};
const base: PlanDraft = {currentAge:30, desiredRetirementAge:30, planningEndAge:32, annualLivingExpense:12000, monthlyNetIncome:0,assets:{cash:24000,stocks:0,bonds:0,other:0},annualReturn:0,inflationRate:0,withdrawalRate:1,cashBufferMonths:12,coveragePlans:{continue:none,stop:none}};
function result(draft:PlanDraft=base, coverage='continue', returns='baseline') {
 const e=evaluatePlan(draft); expect(e.kind).toBe('evaluated'); if(e.kind!=='evaluated')throw Error('not evaluated');
 const c=e.cases.find(c=>c.key.coverage===coverage&&c.key.returns===returns); expect(c?.outcome.kind).toBe('evaluated'); if(c?.outcome.kind!=='evaluated')throw Error('not case'); return c.outcome.result;
}
describe('scenario evaluation through Planning',()=>{
 it('uses the full path for a zero-return finite horizon and never double-adds buffer',()=>{
 const r=result(); expect(r.retirementTarget.kind).toBe('solved'); if(r.retirementTarget.kind!=='solved')return;
 expect(r.retirementTarget.wholePathNeed).toBeCloseTo(24000,1); expect(r.retirementTarget.total).toBeCloseTo(24000,1);
 expect(r.assetPath[0].balance).toBe(23000); expect(r.assetPath.at(-1)?.balance).toBeCloseTo(0);
 });
 it('emits six explicitly keyed cases and only baseline stress tests',()=>{
  const e=evaluatePlan(base);if(e.kind!=='evaluated')throw Error('not evaluated');
  expect(e.cases.map(c=>`${c.key.coverage}/${c.key.returns}`)).toEqual(['continue/conservative','continue/baseline','continue/optimistic','stop/conservative','stop/baseline','stop/optimistic']);
  expect(result(base,'continue','baseline').stress).toBeDefined();
  expect(result(base,'continue','optimistic').stress).toBeUndefined();
 });
 it('applies pensions only from their actual month and keeps an unknown case separate',()=>{
  const late={...none,pension:{status:'known' as const,startMonth:12,monthlyAmount:1000,growth:'nominal' as const,amountBasis:'start-month' as const}};
  const r=result({...base,coveragePlans:{continue:late,stop:{...none,pension:{status:'unknown'}}}});
  expect(r.assetPath[11].pensionIncome).toBe(0);
  expect(r.assetPath[12].pensionIncome).toBe(1000);
  const e=evaluatePlan({...base,coveragePlans:{continue:late,stop:{...none,pension:{status:'unknown'}}}});
  if(e.kind!=='evaluated')throw Error('not evaluated');
  expect(e.cases.filter(c=>c.key.coverage==='stop').every(c=>c.outcome.kind==='needs-input')).toBe(true);
 });
 it('replaces life budgets and charges an event once through the canonical monthly path',()=>{
  const r=result({...base,lifeEvents:[{id:'child',label:'孩子',month:12,postRetirementAnnualBudget:24000}],oneOffExpenses:[{id:'car',label:'购车',month:6,amount:2000}]});
  expect(r.assetPath[11].livingExpense).toBe(1000);
  expect(r.assetPath[12].livingExpense).toBe(2000);
  expect(r.assetPath.reduce((sum,p)=>sum+p.oneOffExpense,0)).toBe(2000);
  expect(r.assetPath.every(p=>p.balance>=0)).toBe(true);
 });
 it('uses independent asset returns and skips only shocked stock and bond returns',()=>{
  const r=result({...base,planningEndAge:31,annualLivingExpense:0,annualReturn:undefined,cashBufferMonths:0,assets:{cash:1000,stocks:1000,bonds:1000,other:0},targetAllocation:{cash:1/3,stocks:1/3,bonds:1/3,other:0},returnScenarios:{baseline:{cash:.12682503013196977,stocks:.12682503013196977,bonds:.12682503013196977,other:0}},stockShock:.65,bondShock:.95});
  expect(r.stress?.path[0].accounts.cash).toBeCloseTo(1010,6);
  expect(r.stress?.path[0].accounts.stocks).toBeCloseTo(650,6);
  expect(r.stress?.path[0].accounts.bonds).toBeCloseTo(950,6);
  expect(r.stress?.path[1].accounts.stocks).toBeCloseTo(656.5,6);
  expect(r.assetPath[0].accounts.stocks).toBeCloseTo(1010,6);
 });
 it('converts real flows by the month inflation factor and preserves fixed nominal income',()=>{
  const r=result({...base,planningEndAge:33,inflationRate:.1,assets:{cash:100000,stocks:0,bonds:0,other:0},externalIncome:[{id:'rent',monthlyAmount:100,startMonth:0,endMonth:36,growth:'nominal'}]});
  expect(r.assetPath[12].livingExpense).toBeCloseTo(1100);
  expect(r.assetPath[12].externalIncome).toBe(100);
 });
 it('treats omitted growth selection as nominal for external income and debt payments',()=>{
  const r=result({...base,planningEndAge:33,inflationRate:.1,assets:{cash:100000,stocks:0,bonds:0,other:0},externalIncome:[{id:'rent',monthlyAmount:100,startMonth:0,endMonth:36,annualGrowthRate:0}],debtPayments:[{id:'mortgage',monthlyAmount:200,startMonth:0,endMonth:36}]});
  expect(r.assetPath[12].externalIncome).toBe(100);
  expect(r.assetPath[12].debtPayment).toBe(200);
 });
 it('does not manufacture complete pension assumptions for omitted coverage',()=>{
  const e=evaluatePlan({...base,coveragePlans:undefined});if(e.kind!=='evaluated')throw Error('not evaluated');
  expect(e.cases.every(c=>c.outcome.kind==='needs-input')).toBe(true);expect(e.result).toBeUndefined();
 });
});
describe('review regressions through the public Planning seam', () => {
 it('treats a future pension amount as today purchasing power before nominal growth',()=>{
  const r=result({...base,inflationRate:.02,assets:{cash:100000,stocks:0,bonds:0,other:0},coveragePlans:{continue:{...none,pension:{status:'known',startMonth:12,monthlyAmount:1000,annualGrowthRate:0}},stop:none}});
  expect(r.assetPath[11].pensionIncome).toBe(0);
  expect(r.assetPath[12].pensionIncome).toBeCloseTo(1020);
  expect(r.assetPath[23].pensionIncome).toBeCloseTo(1020);
 });
 it('tracks the stress minimum in actual purchasing power at its own month',()=>{
  const r=result({...base,planningEndAge:50,annualLivingExpense:0,assets:{cash:100000,stocks:0,bonds:0,other:0},inflationRate:.02,cashBufferMonths:0});
  expect(r.stress?.minimumBalance).toBe(100000);
  expect(r.stress?.minimumRealBalance).toBeCloseTo(100000 / Math.pow(1.02,239/12), 5);
  expect(r.stress?.minimumRealBalanceMonth).toBe(239);
 });
});


describe('canonical cash flow and coverage regressions', () => {
 it('pays cash first, transfers investments, and excludes housing and debt principal', () => {
  const r=result({...base,desiredRetirementAge:31,cashBufferMonths:0,annualLivingExpense:1800,monthlyNetIncome:0,assets:{cash:100,stocks:300,bonds:100,other:0},targetAllocation:{cash:.2,stocks:.6,bonds:.2,other:0},selfOccupiedHomeValue:900000,debtBalance:500000});
  expect(r.assetPath[0]).toMatchObject({cashUsed:100,balance:350,internalTransferNet:0});
  expect(r.assetPath[0].investmentTransfer).toBeCloseTo(50);expect(r.assetPath[0].shortfall).toBeCloseTo(0);
  expect(r.assetPath[3].shortfall).toBeCloseTo(100);
  expect(r.assetPath[3].accounts).toEqual({cash:0,stocks:0,bonds:0,other:0});
 });
 it('keeps target allocation separate from current holdings and only allocates new surplus',()=>{
  const r=result({...base,desiredRetirementAge:31,cashBufferMonths:0,annualLivingExpense:0,monthlyNetIncome:500,assets:{cash:100,stocks:300,bonds:100,other:0},targetAllocation:{cash:.2,stocks:.6,bonds:.2,other:0}});
  expect(r.assetPath[0].openingAccounts).toEqual({cash:100,stocks:300,bonds:100,other:0});
  expect(r.assetPath[0].accounts).toEqual({cash:200,stocks:600,bonds:200,other:0});
  expect(r.assetPath[0].balance).toBe(1000);
 });
 it('keeps fixed event dates while changing independent work and retirement budgets',()=>{
  const draft={...base,planningEndAge:33,annualLivingExpense:12000,retirementAnnualLivingExpense:24000,lifeEvents:[{id:'child',label:'孩子',month:6,preRetirementAnnualBudget:36000,postRetirementAnnualBudget:48000}]};
  const early=result({...draft,desiredRetirementAge:31});const later=result({...draft,desiredRetirementAge:32});
  expect(early.assetPath[6].livingExpense).toBe(3000);expect(later.assetPath[6].livingExpense).toBe(3000);
  expect(early.assetPath[12].livingExpense).toBe(4000);expect(later.assetPath[12].livingExpense).toBe(3000);
 });
 it('does not double-charge payroll contributions and retains stop-plan pension rights and medical spending',()=>{
  const plan={...none,contributionMonthly:1000,contributionEndMonth:24,contributionsAlreadyDeducted:true,medicalSelfPayMonthly:300,pension:{status:'known' as const,startMonth:12,monthlyAmount:1200,existingRights:true}};
  const draft={...base,planningEndAge:33,desiredRetirementAge:31,coveragePlans:{continue:plan,stop:{...plan,medicalSelfPayMonthly:500}}};
  const continuing=result(draft); const stopped=result(draft,'stop');
  expect(continuing.assetPath[0].contribution).toBe(0);expect(continuing.assetPath[12].contribution).toBe(1000);
  expect(stopped.assetPath[0].contribution).toBe(0);expect(stopped.assetPath[12]).toMatchObject({pensionIncome:1200,medicalSelfPay:500});
 });
});
