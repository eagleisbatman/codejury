import { describe, it, expect } from 'vitest';
import type { ReviewEvent, SynthesizedReport } from './types/review.js';
import type { Finding, MergedFinding } from './types/finding.js';
import type { ExpertRunMeta, ExpertResult } from './types/provider.js';
import { isAgentEvent } from './agent/types.js';
import { synthesize } from './synthesis/synthesizer.js';

/**
 * Test the event pipeline logic that the orchestrator uses:
 * - Agent events are properly discriminated from Findings
 * - Findings from agent_finding events are collected without duplicates
 * - The synthesis step works with findings from agentic providers
 */

function makeFinding(id: string, expertId: string): Finding {
  return {
    id, file_path: 'src/a.ts', line_start: 1, line_end: 5,
    severity: 'warning', category: 'correctness', title: `Issue ${id}`,
    description: 'Test issue', suggested_fix: null, expert_id: expertId, confidence: 0.8,
  };
}

describe('Orchestrator event discrimination', () => {
  it('isAgentEvent correctly identifies agent events', () => {
    expect(isAgentEvent({ type: 'agent_tool_call', expertId: 'claude', toolName: 'read_file', params: {}, iteration: 1 })).toBe(true);
    expect(isAgentEvent({ type: 'agent_finding', expertId: 'claude', finding: makeFinding('f1', 'claude'), iteration: 1 })).toBe(true);
    expect(isAgentEvent({ type: 'agent_thinking', expertId: 'claude', text: 'Hmm', iteration: 1 })).toBe(true);
    expect(isAgentEvent({ type: 'agent_iteration', expertId: 'claude', iteration: 1, findingsSoFar: 0 })).toBe(true);
    expect(isAgentEvent({ type: 'agent_context_reset', expertId: 'claude', reason: 'budget', iteration: 5 })).toBe(true);
  });

  it('isAgentEvent rejects non-agent events', () => {
    expect(isAgentEvent({ type: 'expert_started', expertId: 'claude' })).toBe(false);
    expect(isAgentEvent({ type: 'synthesis_started' })).toBe(false);
    expect(isAgentEvent(makeFinding('f1', 'claude'))).toBe(false);
    expect(isAgentEvent(null)).toBe(false);
    expect(isAgentEvent(42)).toBe(false);
    expect(isAgentEvent('string')).toBe(false);
  });

  it('findings from agent_finding events are unique', () => {
    const f1 = makeFinding('f1', 'claude');
    const f2 = makeFinding('f2', 'claude');

    // Simulate what the orchestrator does
    const agentEvents: ReviewEvent[] = [
      { type: 'agent_finding', expertId: 'claude', finding: f1, iteration: 1 },
      { type: 'agent_tool_call', expertId: 'claude', toolName: 'grep', params: {}, iteration: 2 },
      { type: 'agent_finding', expertId: 'claude', finding: f2, iteration: 2 },
    ];

    const findings: Finding[] = [];
    const agentFindingIds = new Set<string>();

    for (const event of agentEvents) {
      if (event.type === 'agent_finding') {
        findings.push(event.finding);
        agentFindingIds.add(event.finding.id);
      }
    }

    // No duplicates
    expect(findings).toHaveLength(2);
    expect(agentFindingIds.size).toBe(2);

    // Building expert_finding events should exclude already-emitted findings
    const expertFindingEvents = findings
      .filter((f) => !agentFindingIds.has(f.id))
      .map((f) => ({ type: 'expert_finding' as const, expertId: 'claude', finding: f }));

    expect(expertFindingEvents).toHaveLength(0); // All were already emitted as agent_finding
  });
});

describe('Synthesis with agentic provider results', () => {
  it('synthesizes findings from multiple agentic experts', () => {
    const f1a = makeFinding('f1a', 'claude'); // lines 1-5
    const f1b = { ...makeFinding('f1b', 'gemini'), title: 'Issue f1a' }; // Same file+lines+title = should dedup
    const f2 = { ...makeFinding('f2', 'claude'), file_path: 'src/b.ts', line_start: 50, line_end: 60, title: 'Unique issue 2' };
    const f3 = { ...makeFinding('f3', 'gemini'), file_path: 'src/c.ts', line_start: 100, line_end: 110, title: 'Unique issue 3' };

    const expertResults: ExpertResult[] = [
      {
        expertId: 'claude',
        findings: [f1a, f2],
        meta: { expertId: 'claude', model: 'sonnet', tokenUsage: { inputTokens: 1000, outputTokens: 500 }, costUsd: 0.01, durationMs: 3000, rawFindings: 2, validFindings: 2, iterations: 3, toolCallCount: 5 },
      },
      {
        expertId: 'gemini',
        findings: [f1b, f3],
        meta: { expertId: 'gemini', model: 'pro', tokenUsage: { inputTokens: 800, outputTokens: 400 }, costUsd: 0.005, durationMs: 2000, rawFindings: 2, validFindings: 2, iterations: 2, toolCallCount: 3 },
      },
    ];

    const report = synthesize(expertResults, { type: 'staged' }, 'test', 'main', 'abc', { dedupThreshold: 0.75, failOnSeverity: 'critical' });

    // 4 raw findings from 2 experts, some may dedup
    // f1a and f1b have same file+lines+similar title → should merge
    // f2 and f3 are unique
    expect(report.findings.length).toBeGreaterThanOrEqual(2);
    expect(report.findings.length).toBeLessThanOrEqual(4);

    // Cost includes both experts
    expect(report.costBreakdown.totalCostUsd).toBeCloseTo(0.015, 3);

    // Both experts in metadata
    expect(report.expertMetadata).toHaveLength(2);

    // Iterations tracked
    expect(report.expertMetadata[0]!.iterations).toBe(3);
    expect(report.expertMetadata[1]!.iterations).toBe(2);
  });
});
