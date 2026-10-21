import type {
  AdditionalContribution, AssetBalances, Attainment, CompletePlanInputs,
  CoverageKey, ReturnScenario, RetirementTarget, SolverIssue,
} from '../contract';
import { compileCase, simulate, solveTarget, type CompiledCase } from './engine';

const total = (assets: AssetBalances): number => assets.cash + assets.stocks + assets.bonds + assets.other;
const precision = 0.01;

function referenceConstraint(ctx: CompiledCase): number {
  const start = ctx.retirementMonth;
  const count = Math.min(12, ctx.endMonth - start);
  const annualGap = count > 0 ? ctx.flows.slice(start, start + count)
    .reduce((sum, flow) => sum + flow.recurringSpending - flow.pensionIncome - flow.externalIncome, 0) * 12 / count : 0;
  return Math.max(0, annualGap) / ctx.inputs.withdrawalRate + ctx.bufferAt(start);
}

/**
 * Scan the actual candidate months. Each candidate is simulated independently
 * because cash-buffer replenishment at year boundaries can depend on the
 * selected retirement month. This keeps the candidate's A(R) exact.
 */
export function solveRetirementTiming(inputs: CompletePlanInputs, coverage: CoverageKey, scenario: ReturnScenario) {
  const endMonth = Math.round((inputs.planningEndAge - inputs.currentAge) * 12);
  const desiredMonth = Math.round((inputs.desiredRetirementAge - inputs.currentAge) * 12);
  const desiredCtx = compileCase(inputs, coverage, scenario, desiredMonth);
  const numericIssue: SolverIssue = { kind: 'unresolved', reason: 'numeric-error', message: '当前假设导致非有限数值' };
  const boundIssue: SolverIssue = { kind: 'unresolved', reason: 'search-bound', message: '无法在当前搜索范围求解' };
  let attainment: Attainment = { kind: 'not-reached' };
  let earlierUnresolved: SolverIssue | undefined;
  let earliestShortfall: { month: number; amount: number } | undefined;
  for (let month = 0; month < endMonth; month += 1) {
    const ctx = month === desiredMonth ? desiredCtx : compileCase(inputs, coverage, scenario, month);
    const pre = simulate(ctx, { endMonth: month, collect: false });
    if (pre.numericError) { earlierUnresolved ??= numericIssue; continue; }
    if (pre.firstShortfall) { earliestShortfall ??= pre.firstShortfall; continue; }
    const assets = total(pre.finalAssets);
    const required = referenceConstraint(ctx);
    if (!Number.isFinite(required)) { earlierUnresolved ??= numericIssue; continue; }
    if (required > inputs.solverMaxAmount) { earlierUnresolved ??= boundIssue; continue; }
    if (assets + 1e-7 < required) continue;
    const post = simulate(ctx, { startMonth: month, initialTotal: assets, collect: false });
    if (post.numericError) { earlierUnresolved ??= numericIssue; continue; }
    if (post.firstShortfall) continue;
    // The forward run passed both constraints. If the required target is beyond
    // the solver bound, do not assert a fully resolved attainment state.
    if (assets > inputs.solverMaxAmount) {
      const target = solveTarget(ctx);
      if (target.kind === 'unresolved') { earlierUnresolved ??= target; continue; }
    }
    attainment = earlierUnresolved ?? {
      kind: month === 0 ? 'now' : 'future', month, age: inputs.currentAge + month / 12,
      path: simulate(ctx).path,
    };
    break;
  }
  if (attainment.kind === 'not-reached') attainment = earlierUnresolved ?? {
    kind: 'not-reached', ...(earliestShortfall ? { firstShortfall: earliestShortfall } : {}),
  };

  const desiredTarget = solveTarget(desiredCtx);
  const checkContribution = (amount: number, target: RetirementTarget) => {
    const pre = simulate(desiredCtx, { endMonth: desiredMonth, additionalMonthly: amount, collect: false });
    if (pre.numericError) return 'unresolved';
    if (pre.firstShortfall || total(pre.finalAssets) + 1e-7 < target.total) return 'fails';
    const post = simulate(desiredCtx, { startMonth: desiredMonth, initialTotal: total(pre.finalAssets), collect: false });
    return post.numericError ? 'unresolved' : post.firstShortfall ? 'fails' : 'passes';
  };
  let additionalContribution: AdditionalContribution;
  if (desiredTarget.kind === 'unresolved') additionalContribution = desiredTarget;
  else if (checkContribution(0, desiredTarget) === 'passes') additionalContribution = { kind: 'none', amount: 0 };
  else if (desiredMonth === 0) {
    const amount = Math.max(0, desiredTarget.total - total(inputs.assets));
    const verified = simulate(desiredCtx, { initialTotal: total(inputs.assets) + amount, collect: false });
    additionalContribution = !verified.numericError && !verified.firstShortfall
      ? { kind: 'immediate', amount, precision } : numericIssue;
  } else {
    const limit = inputs.solverMaxAmount;
    let low = 0;
    let high = Math.min(1_000, limit);
    let upperCheck = checkContribution(high, desiredTarget);
    for (let iteration = 0; upperCheck === 'fails' && high < limit && iteration < 80; iteration += 1) {
      low = high; high = Math.min(limit, high * 2); upperCheck = checkContribution(high, desiredTarget);
    }
    if (upperCheck === 'unresolved') additionalContribution = numericIssue;
    else if (upperCheck !== 'passes') additionalContribution = { ...boundIssue, message: '追加每月净投入超出当前搜索范围' };
    else {
      for (let iteration = 0; high - low > precision && iteration < 80; iteration += 1) {
        const middle = low + (high - low) / 2;
        if (checkContribution(middle, desiredTarget) === 'passes') high = middle; else low = middle;
      }
      const amount = Math.ceil(high / precision) * precision;
      additionalContribution = checkContribution(amount, desiredTarget) === 'passes'
        ? { kind: 'monthly', amount, precision } : numericIssue;
    }
  }
  return { attainment, additionalContribution };
}
