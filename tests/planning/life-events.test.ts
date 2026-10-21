import { describe, expect, it } from 'vitest';
import {
  budgetAtMonth,
  compileLifeEventTimeline,
  monthFromAge,
  validateLifeEventTimeline,
  type LifeEventTimelineInput,
} from '../../src/planning/life-events';

const input: LifeEventTimelineInput = {
  startMonth: 0,
  endMonth: 60,
  currentPreRetirementAnnualBudget: 80_000,
  currentPostRetirementAnnualBudget: 100_000,
  events: [
    {
      id: 'marriage',
      label: '结婚',
      month: 12,
      preRetirementAnnualBudget: 140_000,
      postRetirementAnnualBudget: 160_000,
    },
    {
      id: 'child',
      label: '孩子出生',
      month: 24,
      preRetirementAnnualBudget: 200_000,
      postRetirementAnnualBudget: 220_000,
    },
  ],
  oneOffExpenses: [
    { id: 'wedding', label: '婚礼', month: 12, amount: 50_000 },
  ],
};

describe('life-event timeline seam', () => {
  it('replaces a complete stage budget from its effective month', () => {
    const compiled = compileLifeEventTimeline(input, 48);
    expect(compiled.issues).toEqual([]);
    expect(compiled.months[11].annualLivingBudget).toBe(80_000);
    expect(compiled.months[12].annualLivingBudget).toBe(140_000);
    expect(compiled.months[23].annualLivingBudget).toBe(140_000);
    expect(compiled.months[24].annualLivingBudget).toBe(200_000);
    expect(compiled.months[24].monthlyLivingBudget).toBeCloseTo(200_000 / 12);
  });

  it('keeps pre- and post-retirement budgets independent when retirement moves', () => {
    const retireAt36 = compileLifeEventTimeline(input, 36);
    const retireAt48 = compileLifeEventTimeline(input, 48);
    // Fixed life events remain in the same months; only the selected budget track changes.
    expect(retireAt36.months[24].retirementTrack).toBe('pre-retirement');
    expect(retireAt36.months[36].retirementTrack).toBe('post-retirement');
    expect(retireAt36.months[36].annualLivingBudget).toBe(220_000);
    expect(retireAt48.months[36].retirementTrack).toBe('pre-retirement');
    expect(retireAt48.months[36].annualLivingBudget).toBe(200_000);
    expect(retireAt48.months[48].retirementTrack).toBe('post-retirement');
    expect(retireAt48.months[48].annualLivingBudget).toBe(220_000);
  });

  it('charges one-off expenses exactly once in their selected month', () => {
    const compiled = compileLifeEventTimeline(input, 48);
    expect(compiled.months[11].oneOffExpenseTotal).toBe(0);
    expect(compiled.months[12].oneOffExpenseTotal).toBe(50_000);
    expect(compiled.months[12].oneOffExpenses).toHaveLength(1);
    expect(compiled.months.slice(13).reduce((total, month) => total + month.oneOffExpenseTotal, 0)).toBe(0);
  });

  it('surfaces same-month complete budget conflicts instead of silently accepting one', () => {
    const conflicting = {
      ...input,
      events: [
        ...input.events,
        {
          id: 'same-month-change',
          label: '同时变化',
          month: 12,
          preRetirementAnnualBudget: 150_000,
        },
      ],
    };
    const issues = validateLifeEventTimeline(conflicting);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'conflicting-budget',
        month: 12,
        track: 'pre-retirement',
        eventIds: expect.arrayContaining(['marriage', 'same-month-change']),
      }),
    ]));
  });

  it('reports invalid event and expense values with stable identifiers', () => {
    const invalid = {
      ...input,
      events: [{ ...input.events[0], month: 60 }],
      oneOffExpenses: [{ ...input.oneOffExpenses[0], amount: -1 }],
    };
    const issues = validateLifeEventTimeline(invalid);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-event-month', eventIds: ['marriage'] }),
      expect.objectContaining({ code: 'invalid-expense-amount', expenseIds: ['wedding'] }),
    ]));
  });

  it('converts age deltas to precise relative months', () => {
    expect(monthFromAge(35, 30)).toBe(60);
    expect(monthFromAge(30.5, 30)).toBe(6);
  });

  it('returns the selected track and latest applicable event for a single month', () => {
    expect(budgetAtMonth(input, 23, 48)).toEqual({
      track: 'pre-retirement',
      annualLivingBudget: 140_000,
      appliedEventIds: ['marriage'],
    });
    expect(budgetAtMonth(input, 48, 48)).toEqual({
      track: 'post-retirement',
      annualLivingBudget: 220_000,
      appliedEventIds: ['marriage', 'child'],
    });
  });
});

