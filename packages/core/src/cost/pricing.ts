interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-sonnet-4-20250514': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'claude-opus-4-20250514': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'claude-haiku-4-5-20251001': { inputPer1M: 0.8, outputPer1M: 4.0 },
  // Google
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'gemini-2.5-flash': { inputPer1M: 0.15, outputPer1M: 0.6 },
  // OpenAI
  'codex-mini': { inputPer1M: 1.5, outputPer1M: 6.0 },
  'gpt-4.1': { inputPer1M: 2.0, outputPer1M: 8.0 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },
  'o3-mini': { inputPer1M: 1.1, outputPer1M: 4.4 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (inputTokens / 1_000_000) * pricing.inputPer1M +
         (outputTokens / 1_000_000) * pricing.outputPer1M;
}

export function getModelPricing(model: string): ModelPricing | null {
  return PRICING[model] ?? null;
}

export function isFreeTier(model: string): boolean {
  const pricing = PRICING[model];
  return !pricing || (pricing.inputPer1M === 0 && pricing.outputPer1M === 0);
}

export { PRICING, type ModelPricing };
