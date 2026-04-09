import type Database from 'better-sqlite3';
import type { ReviewEvent } from '../types/review.js';
import type { AgentStep, AgentTrajectory, ReviewEpisode } from './types.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';

/**
 * Capture an agent's trajectory from the event stream.
 */
export function captureTrajectory(
  events: ReviewEvent[],
  expertId: string,
  model: string,
): AgentTrajectory {
  const steps: AgentStep[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterations = 0;
  let toolCallCount = 0;
  let finalFindingCount = 0;

  for (const event of events) {
    if (!('expertId' in event) || event.expertId !== expertId) continue;

    switch (event.type) {
      case 'agent_iteration':
        iterations = event.iteration;
        break;
      case 'agent_tool_call':
        toolCallCount++;
        steps.push({
          iteration: event.iteration,
          type: 'tool_call',
          toolName: event.toolName,
          params: event.params,
          timestamp: Date.now(),
        });
        break;
      case 'agent_tool_result':
        steps.push({
          iteration: event.iteration,
          type: 'tool_result',
          toolName: event.toolName,
          resultSummary: event.resultSummary,
          timestamp: Date.now(),
        });
        break;
      case 'agent_thinking':
        steps.push({
          iteration: event.iteration,
          type: 'thinking',
          resultSummary: event.text.slice(0, 500),
          timestamp: Date.now(),
        });
        break;
      case 'expert_finding':
        finalFindingCount++;
        steps.push({
          iteration: 0,
          type: 'finding',
          findingId: event.finding.id,
          timestamp: Date.now(),
        });
        break;
      case 'expert_completed':
        totalInputTokens = event.meta.tokenUsage.inputTokens;
        totalOutputTokens = event.meta.tokenUsage.outputTokens;
        iterations = event.meta.iterations ?? iterations;
        toolCallCount = event.meta.toolCallCount ?? toolCallCount;
        finalFindingCount = event.meta.validFindings;
        break;
      case 'agent_context_reset':
        steps.push({
          iteration: event.iteration,
          type: 'context_reset',
          timestamp: Date.now(),
        });
        break;
    }
  }

  return {
    expertId,
    model,
    steps,
    totalInputTokens,
    totalOutputTokens,
    iterations,
    toolCallCount,
    finalFindingCount,
  };
}

export class EpisodicStore {
  constructor(private db: Database.Database) {
    this.db.exec(LEARNING_SCHEMA);
  }

  saveEpisode(episode: ReviewEpisode): void {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO trajectories (review_id, expert_id, model, steps_json, total_input_tokens, total_output_tokens, iterations, tool_call_count, final_finding_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const tx = this.db.transaction(() => {
      for (const t of episode.trajectories) {
        stmt.run(
          episode.reviewId,
          t.expertId,
          t.model,
          JSON.stringify(t.steps),
          t.totalInputTokens,
          t.totalOutputTokens,
          t.iterations,
          t.toolCallCount,
          t.finalFindingCount,
        );
      }
    });
    tx();
  }

  /**
   * Reconstruct an episode from stored trajectories.
   * Note: repoPath, findingIds, totalCostUsd, and durationMs are NOT stored
   * in the trajectories table, so they are reconstructed with defaults.
   * Only use this for trajectory-level analysis (compression, reflexion).
   */
  getEpisode(reviewId: string): ReviewEpisode | null {
    const rows = this.db
      .prepare('SELECT * FROM trajectories WHERE review_id = ?')
      .all(reviewId) as Array<Record<string, unknown>>;

    if (rows.length === 0) return null;

    const trajectories = rows.map((r) => ({
      expertId: r['expert_id'] as string,
      model: r['model'] as string,
      steps: JSON.parse(r['steps_json'] as string) as AgentStep[],
      totalInputTokens: r['total_input_tokens'] as number,
      totalOutputTokens: r['total_output_tokens'] as number,
      iterations: r['iterations'] as number,
      toolCallCount: r['tool_call_count'] as number,
      finalFindingCount: r['final_finding_count'] as number,
    }));

    return {
      reviewId,
      repoPath: '', // Not stored in trajectories table
      timestamp: new Date(rows[0]!['created_at'] as string),
      trajectories,
      findingIds: [], // Not stored in trajectories table
      totalCostUsd: 0, // Not stored in trajectories table
      durationMs: 0, // Not stored in trajectories table
      compressed: rows.some((r) => r['compressed'] === 1),
    };
  }

  getUncompressedCount(): number {
    const row = this.db.prepare('SELECT COUNT(DISTINCT review_id) as cnt FROM trajectories WHERE compressed = 0').get() as { cnt: number };
    return row.cnt;
  }

  getUncompressedEpisodeIds(limit: number = 50): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT review_id FROM trajectories WHERE compressed = 0 ORDER BY created_at ASC LIMIT ?')
      .all(limit) as Array<{ review_id: string }>;
    return rows.map((r) => r.review_id);
  }

  markCompressed(reviewIds: string[]): void {
    const stmt = this.db.prepare('UPDATE trajectories SET compressed = 1 WHERE review_id = ?');
    const tx = this.db.transaction(() => {
      for (const id of reviewIds) stmt.run(id);
    });
    tx();
  }
}
