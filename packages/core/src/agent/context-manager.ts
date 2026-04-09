export interface ContextBudget {
  /** Estimated tokens in the current conversation (messages array) */
  currentConversationTokens: number;
  /** Model's context window limit */
  contextWindowSize: number;
  /** Fraction at which to trigger reset (e.g., 0.8 = 80%) */
  resetThreshold: number;
}

/**
 * Estimate the token count of the current messages array.
 * Uses ~4 chars per token heuristic (same as prompt.ts estimateTokenCount).
 */
export function estimateMessagesTokens(messages: Array<{ content: unknown }>): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      totalChars += JSON.stringify(msg.content).length;
    } else if (msg.content !== null && typeof msg.content === 'object') {
      totalChars += JSON.stringify(msg.content).length;
    }
  }
  return Math.ceil(totalChars / 4);
}

export function shouldResetContext(budget: ContextBudget): boolean {
  if (budget.contextWindowSize <= 0) return false;
  return budget.currentConversationTokens / budget.contextWindowSize > budget.resetThreshold;
}

export function buildSummarizeRequest(
  findings: Array<{ title: string; severity: string }>,
  iteration: number,
): string {
  const findingSummary = findings.length > 0
    ? `Findings so far:\n${findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}`).join('\n')}`
    : 'No findings yet.';

  return `You are at iteration ${iteration} of the review. Your context is getting full.
Summarize what you've learned so far about this codebase and the changes, then continue reviewing.

${findingSummary}

Continue using tools to explore any areas you haven't checked yet. Call report_finding for any new issues.`;
}
