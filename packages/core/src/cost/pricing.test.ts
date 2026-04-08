import { describe, it, expect } from 'vitest';
import { calculateCost, getModelPricing, isFreeTier } from './pricing.js';

describe('calculateCost', () => {
  it('calculates Claude Sonnet cost', () => {
    // 1000 input tokens, 500 output tokens
    // Input: (1000/1M) * 3.0 = 0.003
    // Output: (500/1M) * 15.0 = 0.0075
    const cost = calculateCost('claude-sonnet-4-20250514', 1000, 500);
    expect(cost).toBeCloseTo(0.0105, 5);
  });

  it('returns 0 for unknown model', () => {
    expect(calculateCost('unknown-model', 1000, 500)).toBe(0);
  });

  it('calculates Gemini cost', () => {
    const cost = calculateCost('gemini-2.5-pro', 1000, 500);
    // Input: (1000/1M) * 1.25 = 0.00125
    // Output: (500/1M) * 10.0 = 0.005
    expect(cost).toBeCloseTo(0.00625, 5);
  });

  it('handles zero tokens', () => {
    expect(calculateCost('claude-sonnet-4-20250514', 0, 0)).toBe(0);
  });
});

describe('getModelPricing', () => {
  it('returns pricing for known model', () => {
    const pricing = getModelPricing('claude-sonnet-4-20250514');
    expect(pricing).toEqual({ inputPer1M: 3.0, outputPer1M: 15.0 });
  });

  it('returns null for unknown model', () => {
    expect(getModelPricing('unknown')).toBeNull();
  });
});

describe('isFreeTier', () => {
  it('returns false for paid models', () => {
    expect(isFreeTier('claude-sonnet-4-20250514')).toBe(false);
  });

  it('returns true for unknown models (assumed local/free)', () => {
    expect(isFreeTier('qwen2.5-coder:32b')).toBe(true);
  });
});
