import type Database from 'better-sqlite3';
import type { FindingFeedback, FeedbackAction } from './types.js';
import type { Finding } from '../types/finding.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';

export class FeedbackStore {
  constructor(private db: Database.Database) {
    this.db.exec(LEARNING_SCHEMA);
  }

  saveFeedback(feedback: FindingFeedback): void {
    this.db
      .prepare(
        `INSERT INTO finding_feedback (finding_id, review_id, action, reason)
         VALUES (?, ?, ?, ?)`,
      )
      .run(feedback.findingId, feedback.reviewId, feedback.action, feedback.reason ?? null);
  }

  getFeedbackForReview(reviewId: string): FindingFeedback[] {
    const rows = this.db
      .prepare('SELECT * FROM finding_feedback WHERE review_id = ?')
      .all(reviewId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      findingId: r['finding_id'] as string,
      reviewId: r['review_id'] as string,
      action: r['action'] as FeedbackAction,
      timestamp: new Date(r['created_at'] as string),
      reason: r['reason'] as string | undefined,
    }));
  }

  getFeedbackForFinding(findingId: string): FindingFeedback | null {
    const row = this.db
      .prepare('SELECT * FROM finding_feedback WHERE finding_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(findingId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      findingId: row['finding_id'] as string,
      reviewId: row['review_id'] as string,
      action: row['action'] as FeedbackAction,
      timestamp: new Date(row['created_at'] as string),
      reason: row['reason'] as string | undefined,
    };
  }

  getRecentFeedbackWithFindings(limit: number = 100): Array<{ finding: Finding; feedback: FindingFeedback }> {
    const rows = this.db
      .prepare(
        `SELECT f.id, f.file_path, f.line_start, f.line_end, f.severity, f.category, f.title, f.description, f.suggested_fix, f.agreement_score, f.contributing_experts, f.review_id,
                fb.action as fb_action, fb.reason as fb_reason, fb.created_at as fb_created_at
         FROM findings f JOIN finding_feedback fb ON f.id = fb.finding_id
         ORDER BY fb.created_at DESC LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>;

    return rows.map((r) => {
      // Extract first contributing expert as the expert_id
      let expertId = 'unknown';
      try {
        const experts = JSON.parse(r['contributing_experts'] as string) as string[];
        if (experts.length > 0) expertId = experts[0]!;
      } catch {
        // Fall back to 'unknown' if contributing_experts is malformed
      }

      return {
        finding: {
          id: r['id'] as string,
          file_path: r['file_path'] as string,
          line_start: r['line_start'] as number,
          line_end: r['line_end'] as number,
          severity: r['severity'] as Finding['severity'],
          category: r['category'] as Finding['category'],
          title: r['title'] as string,
          description: r['description'] as string,
          suggested_fix: r['suggested_fix'] as string | null,
          expert_id: expertId,
          confidence: (r['agreement_score'] as number) ?? 0.5,
        },
        feedback: {
          findingId: r['id'] as string,
          reviewId: r['review_id'] as string,
          action: r['fb_action'] as FeedbackAction,
          timestamp: new Date(r['fb_created_at'] as string),
          reason: r['fb_reason'] as string | undefined,
        },
      };
    });
  }

  getFeedbackStats(): {
    totalAccepted: number;
    totalDismissed: number;
    totalIgnored: number;
  } {
    const row = this.db
      .prepare(
        `SELECT
          SUM(CASE WHEN action = 'accept' THEN 1 ELSE 0 END) as accepted,
          SUM(CASE WHEN action = 'dismiss' THEN 1 ELSE 0 END) as dismissed,
          SUM(CASE WHEN action = 'ignore' THEN 1 ELSE 0 END) as ignored
        FROM finding_feedback`,
      )
      .get() as { accepted: number; dismissed: number; ignored: number };

    return {
      totalAccepted: row.accepted ?? 0,
      totalDismissed: row.dismissed ?? 0,
      totalIgnored: row.ignored ?? 0,
    };
  }
}
