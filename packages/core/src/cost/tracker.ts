import type { ProjectConfig } from '../types/config.js';
import type { CostEstimate } from '../types/provider.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';

export interface BudgetCheck {
  withinBudget: boolean;
  estimatedCost: number;
  budgetLimit: number;
  remainingBudget: number;
}

/**
 * Check if a review's estimated cost is within budget.
 */
export function checkBudget(
  estimates: CostEstimate[],
  config: ProjectConfig,
  monthlyCostSoFar: number = 0,
): BudgetCheck {
  const estimatedCost = estimates.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
  const perReviewBudget = config.cost.budget_per_review;
  const monthlyBudget = config.cost.budget_monthly;
  const monthlyRemaining = monthlyBudget - monthlyCostSoFar;

  const effectiveLimit = Math.min(perReviewBudget, monthlyRemaining);

  return {
    withinBudget: estimatedCost <= effectiveLimit,
    estimatedCost,
    budgetLimit: effectiveLimit,
    remainingBudget: effectiveLimit - estimatedCost,
  };
}

/**
 * Enforce budget before starting a review.
 * Returns ok(true) if within budget, err with message if exceeded.
 */
export function enforceBudget(
  estimates: CostEstimate[],
  config: ProjectConfig,
  monthlyCostSoFar: number = 0,
): Result<true, Error> {
  const check = checkBudget(estimates, config, monthlyCostSoFar);

  if (check.withinBudget) {
    return ok(true as const);
  }

  return err(
    new Error(
      `Estimated cost $${check.estimatedCost.toFixed(4)} exceeds budget limit $${check.budgetLimit.toFixed(4)}. ` +
      `Monthly spend: $${monthlyCostSoFar.toFixed(4)}/${config.cost.budget_monthly.toFixed(2)}. ` +
      `Use --force to override or adjust cost.budget_per_review in config.`,
    ),
  );
}

/**
 * Check if monthly budget is approaching the limit.
 */
export function getMonthlyBudgetStatus(
  monthlyCostSoFar: number,
  monthlyBudget: number,
): { percentage: number; warning: boolean; exceeded: boolean } {
  const percentage = monthlyBudget > 0 ? (monthlyCostSoFar / monthlyBudget) * 100 : 0;
  return {
    percentage,
    warning: percentage >= 80,
    exceeded: percentage >= 100,
  };
}
