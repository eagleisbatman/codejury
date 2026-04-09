import { z } from 'zod';
import type { Finding, MergedFinding, Severity } from './finding.js';
import type { ExpertRunMeta } from './provider.js';

// --- Git Scope ---

export const gitScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('staged') }),
  z.object({ type: z.literal('unstaged') }),
  z.object({ type: z.literal('branch'), name: z.string() }),
  z.object({
    type: z.literal('commit_range'),
    from: z.string(),
    to: z.string(),
  }),
  z.object({
    type: z.literal('pr'),
    url: z.string().url(),
    forge: z.enum(['github', 'gitlab']),
  }),
  z.object({
    type: z.literal('files'),
    paths: z.array(z.string()).min(1),
  }),
]);

export type GitScope = z.infer<typeof gitScopeSchema>;

// --- Verdict ---

export const verdictEnum = z.enum(['approve', 'request_changes', 'needs_discussion']);
export type Verdict = z.infer<typeof verdictEnum>;

// --- Cost Breakdown ---

export interface CostBreakdown {
  totalCostUsd: number;
  perExpert: Record<string, number>;
  estimatedSavingsVsFullPanel?: number;
}

// --- Review Session ---

export type ReviewStatus = 'running' | 'completed' | 'failed';

export interface ReviewSession {
  reviewId: string;
  repo: string;
  branch: string;
  commit: string;
  scope: GitScope;
  status: ReviewStatus;
  startedAt: Date;
  completedAt?: Date;
  expertsUsed: string[];
  findingCounts: Record<Severity, number>;
  verdict?: Verdict;
  totalCostUsd: number;
}

// --- Synthesized Report ---

export interface SynthesizedReport {
  reviewId: string;
  repo: string;
  branch: string;
  commit: string;
  scope: GitScope;
  findings: MergedFinding[];
  summary: {
    totalFindings: number;
    bySeverity: Record<Severity, number>;
    verdict: Verdict;
    narrative: string;
  };
  expertMetadata: ExpertRunMeta[];
  costBreakdown: CostBreakdown;
  timestamp: Date;
}

// --- Review Events (yielded by orchestrator) ---

export type ReviewEvent =
  | { type: 'review_started'; scope: GitScope; experts: string[] }
  | { type: 'expert_started'; expertId: string }
  | { type: 'expert_finding'; expertId: string; finding: Finding }
  | { type: 'expert_completed'; expertId: string; meta: ExpertRunMeta }
  | { type: 'expert_failed'; expertId: string; error: Error }
  | { type: 'agent_tool_call'; expertId: string; toolName: string; params: Record<string, unknown>; iteration: number }
  | { type: 'agent_tool_result'; expertId: string; toolName: string; resultSummary: string; iteration: number }
  | { type: 'agent_thinking'; expertId: string; text: string; iteration: number }
  | { type: 'agent_iteration'; expertId: string; iteration: number; findingsSoFar: number }
  | { type: 'agent_finding'; expertId: string; finding: Finding; iteration: number }
  | { type: 'agent_context_reset'; expertId: string; reason: string; iteration: number }
  | { type: 'synthesis_started' }
  | { type: 'synthesis_complete'; report: SynthesizedReport };
