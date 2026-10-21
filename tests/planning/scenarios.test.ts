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
});
