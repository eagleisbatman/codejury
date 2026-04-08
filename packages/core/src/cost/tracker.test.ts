import { describe, it, expect } from 'vitest';
import { checkBudget, enforceBudget, getMonthlyBudgetStatus } from './tracker.js';
import { DEFAULT_CONFIG } from '../types/config.js';

describe('checkBudget', () => {
  it('passes when within per-review budget', () => {
    const result = checkBudget(
      [{ estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.10 }],
      DEFAULT_CONFIG,
    );
    expect(result.withinBudget).toBe(true);
    expect(result.estimatedCost).toBe(0.10);
  });

  it('fails when exceeding per-review budget', () => {
    const result = checkBudget(
      [{ estimatedInputTokens: 100000, estimatedOutputTokens: 50000, estimatedCostUsd: 5.00 }],
      DEFAULT_CONFIG, // budget_per_review = 0.50
    );
    expect(result.withinBudget).toBe(false);
  });

  it('considers monthly remaining budget', () => {
    const result = checkBudget(
      [{ estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.30 }],
      DEFAULT_CONFIG, // budget_monthly = 20
      19.80, // almost at limit
    );
    expect(result.withinBudget).toBe(false);
    expect(result.budgetLimit).toBeCloseTo(0.20, 2);
  });

  it('sums multiple expert estimates', () => {
    const result = checkBudget(
      [
        { estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.10 },
        { estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.15 },
        { estimatedInputTokens: 1000, estimatedOutputTokens: 500, estimatedCostUsd: 0.20 },
      ],
      DEFAULT_CONFIG,
    );
    expect(result.estimatedCost).toBeCloseTo(0.45, 2);
    expect(result.withinBudget).toBe(true);
  });
});

describe('enforceBudget', () => {
  it('returns ok when within budget', () => {
    const result = enforceBudget(
      [{ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0.10 }],
      DEFAULT_CONFIG,
    );
    expect(result.ok).toBe(true);
  });

  it('returns error with message when over budget', () => {
    const result = enforceBudget(
      [{ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 5.00 }],
      DEFAULT_CONFIG,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('exceeds budget');
    }
  });
});

describe('getMonthlyBudgetStatus', () => {
  it('calculates percentage correctly', () => {
    const status = getMonthlyBudgetStatus(10, 20);
    expect(status.percentage).toBe(50);
    expect(status.warning).toBe(false);
    expect(status.exceeded).toBe(false);
  });

  it('flags warning at 80%', () => {
    const status = getMonthlyBudgetStatus(16, 20);
    expect(status.warning).toBe(true);
    expect(status.exceeded).toBe(false);
  });

  it('flags exceeded at 100%', () => {
    const status = getMonthlyBudgetStatus(20, 20);
    expect(status.exceeded).toBe(true);
  });
});
