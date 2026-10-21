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
  const late={...none,pension:{status:'known' as const,startMonth:12,monthlyAmount:1000,growth:'nominal' as const}};
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
 it('does not manufacture complete pension assumptions for omitted coverage',()=>{
  const e=evaluatePlan({...base,coveragePlans:undefined});if(e.kind!=='evaluated')throw Error('not evaluated');
  expect(e.cases.every(c=>c.outcome.kind==='needs-input')).toBe(true);expect(e.result).toBeUndefined();
 });
});
