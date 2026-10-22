import { describe, expect, it } from 'vitest';
import { createSession, sessionReducer } from '../../src/session';
import { evaluatePlan, type PlanDraft, type EvaluatedPlan } from '../../src/planning';
const complete: PlanDraft = { currentAge: 35, desiredRetirementAge: 36, planningEndAge: 37, annualLivingExpense: 12000, retirementAnnualLivingExpense: 12000, monthlyNetIncome: 30000, assets: {cash:100000,stocks:0,bonds:0,other:0} };
const evaluated = evaluatePlan(complete) as EvaluatedPlan;
describe('live Session revision boundary', () => {
 it('publishes a completed drag snapshot while keeping the latest input pending',()=>{
  let state=sessionReducer(createSession(),{type:'begin',planId:'one',revision:3});
  state=sessionReducer(state,{type:'preview',planId:'one',revision:2,evaluation:evaluated});
  expect(state.lastValid).toBe(evaluated);expect(state.lastValidRevision).toBe(2);
  expect(state.pending).toBe(true);expect(state.evaluation).toBeUndefined();
  expect(sessionReducer(state,{type:'preview',planId:'one',revision:1,evaluation:evaluated})).toBe(state);
  expect(sessionReducer(state,{type:'preview',planId:'two',revision:2,evaluation:evaluated})).toBe(state);
  expect(sessionReducer(state,{type:'preview',planId:'one',revision:3,evaluation:evaluated})).toBe(state);
  state=sessionReducer(state,{type:'settle',planId:'one',revision:3,evaluation:evaluated,latency:15});
  expect(state.pending).toBe(false);expect(state.lastValidRevision).toBe(3);
 });
 it('keeps the last valid result when the current worker reply is incomplete',()=>{
  let state=sessionReducer(createSession(),{type:'begin',planId:'one',revision:1});
  state=sessionReducer(state,{type:'settle',planId:'one',revision:1,evaluation:evaluated,latency:15});
  state=sessionReducer(state,{type:'begin',planId:'one',revision:2});
  state=sessionReducer(state,{type:'settle',planId:'one',revision:2,evaluation:evaluatePlan({...complete,annualLivingExpense:undefined}),latency:16});
  expect(state.evaluation?.kind).toBe('needs-input');expect(state.lastValid).toBe(evaluated);expect(state.lastValidRevision).toBe(1);
 });
 it('ignores a stale worker reply immediately after an input intent',()=>{
  let state=sessionReducer(createSession(),{type:'begin',planId:'one',revision:1});
  state=sessionReducer(state,{type:'invalidate',revision:2});
  const settled=sessionReducer(state,{type:'settle',planId:'one',revision:1,evaluation:evaluated,latency:5});
  expect(settled).toBe(state);expect(settled.pending).toBe(true);
 });
 it('does not pair a new plan identity with the old plan result and restores its own cached result',()=>{
  let state=sessionReducer(createSession(),{type:'begin',planId:'one',revision:1});
  state=sessionReducer(state,{type:'settle',planId:'one',revision:1,evaluation:evaluated,latency:15});
  state=sessionReducer(state,{type:'begin',planId:'two',revision:2});
  expect(state.lastValid).toBeUndefined();
  expect(sessionReducer(state,{type:'settle',planId:'one',revision:2,evaluation:evaluated,latency:5})).toBe(state);
  state=sessionReducer(state,{type:'begin',planId:'one',revision:3});expect(state.lastValid).toBe(evaluated);
 });
 it('forgets deleted plan results while preserving the remaining plan cache and ignoring old replies',()=>{
  let state=sessionReducer(createSession(),{type:'begin',planId:'one',revision:1});
  state=sessionReducer(state,{type:'settle',planId:'one',revision:1,evaluation:evaluated,latency:10});
  state=sessionReducer(state,{type:'begin',planId:'two',revision:2});
  state=sessionReducer(state,{type:'settle',planId:'two',revision:2,evaluation:evaluated,latency:10});
  state=sessionReducer(state,{type:'invalidate',revision:3});
  state=sessionReducer(state,{type:'forget',planId:'two'});
  expect(state.lastValid).toBeUndefined();
  expect(state.savedResults.has('two')).toBe(false);
  expect(state.savedResults.has('one')).toBe(true);
  expect(sessionReducer(state,{type:'settle',planId:'two',revision:2,evaluation:evaluated,latency:5})).toBe(state);
  state=sessionReducer(state,{type:'begin',planId:'two',revision:4});
  expect(state.lastValid).toBeUndefined();
 });

});
