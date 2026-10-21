/**
 * Monthly life-event and budget compilation rules.
 *
 * This module deliberately has no browser or UI dependencies.  A month is a
 * zero-based offset from the plan's baseline month; the end month is
 * exclusive.  An event's budget is a complete replacement for the selected
 * track, rather than an increment on top of the previous budget.
 */

export type BudgetTrack = 'pre-retirement' | 'post-retirement';

export interface LifeEvent {
  readonly id: string;
  readonly label: string;
  /** Relative month at which the event takes effect (inclusive). */
  readonly month: number;
  /** Complete annual budget that replaces the prior pre-retirement budget. */
  readonly preRetirementAnnualBudget?: number;
  /** Complete annual budget that replaces the prior post-retirement budget. */
  readonly postRetirementAnnualBudget?: number;
}

export interface OneOffExpense {
  readonly id: string;
  readonly label: string;
  /** Relative month in which this expense is charged exactly once. */
  readonly month: number;
  readonly amount: number;
}

export interface LifeEventTimelineInput {
  readonly startMonth: number;
  /** Exclusive end month. */
  readonly endMonth: number;
  readonly currentPreRetirementAnnualBudget: number;
  readonly currentPostRetirementAnnualBudget: number;
  readonly events: readonly LifeEvent[];
  readonly oneOffExpenses: readonly OneOffExpense[];
}

export interface TimelineIssue {
  readonly code:
    | 'invalid-range'
    | 'invalid-event-month'
    | 'invalid-expense-month'
    | 'invalid-expense-amount'
    | 'duplicate-event-id'
    | 'duplicate-expense-id'
    | 'conflicting-budget';
  readonly message: string;
  readonly eventIds?: readonly string[];
  readonly expenseIds?: readonly string[];
  readonly month?: number;
  readonly track?: BudgetTrack;
}

export interface CompiledMonth {
  readonly month: number;
  readonly retirementTrack: BudgetTrack;
  readonly annualLivingBudget: number;
  readonly monthlyLivingBudget: number;
  readonly activeEventIds: readonly string[];
  readonly oneOffExpenses: readonly OneOffExpense[];
  readonly oneOffExpenseTotal: number;
}

export interface CompiledTimeline {
  readonly months: readonly CompiledMonth[];
  readonly issues: readonly TimelineIssue[];
}

export interface BudgetAtMonth {
  readonly track: BudgetTrack;
  readonly annualLivingBudget: number;
  readonly appliedEventIds: readonly string[];
}

const hasValue = (value: number | undefined): value is number => value !== undefined;

/** Convert an age in years to a relative month, preserving fractional years. */
export function monthFromAge(
  ageYears: number,
  baselineAgeYears: number,
): number {
  return (ageYears - baselineAgeYears) * 12;
}

/** Return all structural and value issues without silently choosing a conflict. */
export function validateLifeEventTimeline(
  input: LifeEventTimelineInput,
): readonly TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  if (
    !Number.isInteger(input.startMonth) ||
    !Number.isInteger(input.endMonth) ||
    input.endMonth <= input.startMonth
  ) {
    issues.push({
      code: 'invalid-range',
      message: 'Timeline end month must be after its start month.',
    });
  }

  const eventIds = new Map<string, LifeEvent>();
  for (const event of input.events) {
    if (!Number.isInteger(event.month) || event.month < input.startMonth || event.month >= input.endMonth) {
      issues.push({
        code: 'invalid-event-month',
        message: `Event ${event.id} must fall within the planning months.`,
        eventIds: [event.id],
        month: event.month,
      });
    }
    const existing = eventIds.get(event.id);
    if (existing) {
      issues.push({
        code: 'duplicate-event-id',
        message: `Event id ${event.id} is used more than once.`,
        eventIds: [existing.id, event.id],
      });
    } else {
      eventIds.set(event.id, event);
    }
    for (const [track, budget] of [
      ['pre-retirement', event.preRetirementAnnualBudget],
      ['post-retirement', event.postRetirementAnnualBudget],
    ] as const) {
      if (hasValue(budget) && (!Number.isFinite(budget) || budget < 0)) {
        issues.push({
          code: 'conflicting-budget',
          message: `Event ${event.id} has an invalid ${track} budget.`,
          eventIds: [event.id],
          month: event.month,
          track,
        });
      }
    }
  }

  const expenseIds = new Map<string, OneOffExpense>();
  for (const expense of input.oneOffExpenses) {
    if (!Number.isInteger(expense.month) || expense.month < input.startMonth || expense.month >= input.endMonth) {
      issues.push({
        code: 'invalid-expense-month',
        message: `Expense ${expense.id} must fall within the planning months.`,
        expenseIds: [expense.id],
        month: expense.month,
      });
    }
    if (!Number.isFinite(expense.amount) || expense.amount < 0) {
      issues.push({
        code: 'invalid-expense-amount',
        message: `Expense ${expense.id} must have a non-negative finite amount.`,
        expenseIds: [expense.id],
        month: expense.month,
      });
    }
    const existing = expenseIds.get(expense.id);
    if (existing) {
      issues.push({
        code: 'duplicate-expense-id',
        message: `Expense id ${expense.id} is used more than once.`,
        expenseIds: [existing.id, expense.id],
      });
    } else {
      expenseIds.set(expense.id, expense);
    }
  }

  for (const track of ['pre-retirement', 'post-retirement'] as const) {
    const byMonth = new Map<number, LifeEvent[]>();
    for (const event of input.events) {
      const budget = track === 'pre-retirement'
        ? event.preRetirementAnnualBudget
        : event.postRetirementAnnualBudget;
      if (!hasValue(budget)) continue;
      const sameMonth = byMonth.get(event.month) ?? [];
      sameMonth.push(event);
      byMonth.set(event.month, sameMonth);
    }
    for (const [month, events] of byMonth) {
      if (events.length > 1) {
        issues.push({
          code: 'conflicting-budget',
          message: `Multiple complete ${track} budgets take effect in month ${month}; merge or resolve them explicitly.`,
          eventIds: events.map((event) => event.id),
          month,
          track,
        });
      }
    }
  }

  return issues;
}

/**
 * Pick the latest complete budget on a track at a month.  Events are not
 * shifted when retirement age changes; only the selected track changes.
 */
export function budgetAtMonth(
  input: LifeEventTimelineInput,
  month: number,
  retirementMonth: number,
): BudgetAtMonth {
  const track: BudgetTrack = month < retirementMonth ? 'pre-retirement' : 'post-retirement';
  let annualLivingBudget = track === 'pre-retirement'
    ? input.currentPreRetirementAnnualBudget
    : input.currentPostRetirementAnnualBudget;
  const appliedEventIds: string[] = [];
  const events = [...input.events]
    .filter((event) => event.month <= month)
    .sort((a, b) => a.month - b.month || a.id.localeCompare(b.id));
  for (const event of events) {
    const budget = track === 'pre-retirement'
      ? event.preRetirementAnnualBudget
      : event.postRetirementAnnualBudget;
    if (!hasValue(budget)) continue;
    annualLivingBudget = budget;
    appliedEventIds.push(event.id);
  }
  return { track, annualLivingBudget, appliedEventIds };
}

/** Compile each month using inclusive start and exclusive end semantics. */
export function compileLifeEventTimeline(
  input: LifeEventTimelineInput,
  retirementMonth: number,
): CompiledTimeline {
  const issues = validateLifeEventTimeline(input);
  const months: CompiledMonth[] = [];
  if (issues.some((issue) => issue.code === 'invalid-range')) {
    return { months, issues };
  }
  for (let month = input.startMonth; month < input.endMonth; month += 1) {
    const budget = budgetAtMonth(input, month, retirementMonth);
    const oneOffExpenses = input.oneOffExpenses.filter((expense) => expense.month === month);
    const oneOffExpenseTotal = oneOffExpenses.reduce((total, expense) => total + expense.amount, 0);
    months.push({
      month,
      retirementTrack: budget.track,
      annualLivingBudget: budget.annualLivingBudget,
      monthlyLivingBudget: budget.annualLivingBudget / 12,
      activeEventIds: budget.appliedEventIds,
      oneOffExpenses,
      oneOffExpenseTotal,
    });
  }
  return { months, issues };
}
