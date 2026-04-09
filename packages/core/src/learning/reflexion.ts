import { nanoid } from 'nanoid';
import type { SynthesizedReport } from '../types/review.js';
import type { Category, Severity } from '../types/finding.js';
import type { Reflection, ReviewEpisode, CalibrationDelta, FindingFeedback } from './types.js';

/**
 * Post-review reflexion — runs immediately, no LLM call.
 * Analyzes trajectories for efficiency patterns.
 */
export function postReviewReflection(
  episode: ReviewEpisode,
  report: SynthesizedReport,
): Reflection {
  const observations: string[] = [];
  const calibrationUpdates: CalibrationDelta[] = [];

  // Analyze per-expert efficiency
  for (const trajectory of episode.trajectories) {
    const findingsPerToolCall = trajectory.toolCallCount > 0
      ? trajectory.finalFindingCount / trajectory.toolCallCount
      : 0;

    if (trajectory.finalFindingCount === 0 && trajectory.toolCallCount > 5) {
      observations.push(
        `${trajectory.expertId} made ${trajectory.toolCallCount} tool calls but found 0 issues — may be over-exploring`,
      );
    }

    if (findingsPerToolCall > 0.5) {
      observations.push(
        `${trajectory.expertId} is efficient: ${trajectory.finalFindingCount} findings from ${trajectory.toolCallCount} tool calls`,
      );
    }

    if (trajectory.iterations >= 10) {
      observations.push(
        `${trajectory.expertId} hit max iterations — may need more context or a different approach`,
      );
    }
  }

  // Analyze unanimous findings — these are high-confidence
  const unanimous = report.findings.filter((f) => f.consensusStatus === 'unanimous');
  if (unanimous.length > 0) {
    observations.push(
      `${unanimous.length} finding(s) had unanimous agreement — high confidence issues`,
    );
  }

  // Analyze split findings — these may be false positives
  const split = report.findings.filter((f) => f.consensusStatus === 'split');
  if (split.length > 0) {
    observations.push(
      `${split.length} finding(s) had split consensus — developer judgment needed`,
    );
  }

  return {
    id: nanoid(),
    reviewId: episode.reviewId,
    trigger: 'post_review',
    observations,
    patternSuggestions: [],
    calibrationUpdates,
    timestamp: new Date(),
  };
}

/**
 * Post-feedback reflexion — runs after developer acts on findings.
 * This is the high-value learning step.
 * Returns a reflection without LLM (statistical analysis).
 * For LLM-powered deeper reflexion, use the reflexion prompt separately.
 */
export function postFeedbackReflection(
  feedbackBatch: FindingFeedback[],
  report: SynthesizedReport,
): Reflection {
  const observations: string[] = [];
  const patternSuggestions: string[] = [];
  const calibrationUpdates: CalibrationDelta[] = [];

  const findingMap = new Map(report.findings.map((f) => [f.id, f]));

  // Count feedback by expert × category
  const stats = new Map<string, { accepted: number; dismissed: number; total: number }>();

  for (const fb of feedbackBatch) {
    const finding = findingMap.get(fb.findingId);
    if (!finding) continue;

    for (const expertId of finding.contributingExperts) {
      const key = `${expertId}:${finding.category}:${finding.severity}`;
      const existing = stats.get(key) ?? { accepted: 0, dismissed: 0, total: 0 };
      existing.total++;
      if (fb.action === 'accept') existing.accepted++;
      if (fb.action === 'dismiss') existing.dismissed++;
      stats.set(key, existing);
    }
  }

  // Generate observations and calibration updates
  for (const [key, s] of stats) {
    const [expertId, category, severity] = key.split(':') as [string, string, string];
    const acceptRate = s.total > 0 ? s.accepted / s.total : 0;

    if (s.dismissed >= 3 && acceptRate < 0.3) {
      observations.push(
        `${expertId}'s ${category}/${severity} findings were dismissed ${s.dismissed}/${s.total} times — likely too noisy`,
      );
      calibrationUpdates.push({
        expertId: expertId!,
        category: category as Category,
        severity: severity as Severity,
        adjustment: -0.3,
        reason: `${s.dismissed}/${s.total} dismissed in this review`,
      });
    }

    if (s.accepted >= 2 && acceptRate > 0.8) {
      patternSuggestions.push(
        `${expertId} is strong at ${category}/${severity} — ${s.accepted}/${s.total} accepted`,
      );
      calibrationUpdates.push({
        expertId: expertId!,
        category: category as Category,
        severity: severity as Severity,
        adjustment: 0.2,
        reason: `${s.accepted}/${s.total} accepted in this review`,
      });
    }
  }

  // Overall summary
  const totalAccepted = feedbackBatch.filter((f) => f.action === 'accept').length;
  const totalDismissed = feedbackBatch.filter((f) => f.action === 'dismiss').length;
  observations.push(
    `Review outcome: ${totalAccepted} accepted, ${totalDismissed} dismissed out of ${feedbackBatch.length} findings`,
  );

  return {
    id: nanoid(),
    reviewId: report.reviewId,
    trigger: 'post_feedback',
    observations,
    patternSuggestions,
    calibrationUpdates,
    timestamp: new Date(),
  };
}
