import Database from 'better-sqlite3';
import { SCHEMA } from './schema.js';
import type { SynthesizedReport, ReviewSession, ReviewStatus } from '../types/review.js';
import type { Severity } from '../types/finding.js';

export class ReviewRepository {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  saveReport(report: SynthesizedReport): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO review_sessions (review_id, repo, branch, commit_hash, scope_type, scope_json, status, verdict, total_cost_usd, started_at, completed_at, report_json)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
        )
        .run(
          report.reviewId,
          report.repo,
          report.branch,
          report.commit,
          report.scope.type,
          JSON.stringify(report.scope),
          report.summary.verdict,
          report.costBreakdown.totalCostUsd,
          report.timestamp.toISOString(),
          new Date().toISOString(),
          JSON.stringify(report),
        );

      const findingStmt = this.db.prepare(
        `INSERT INTO findings (id, review_id, file_path, line_start, line_end, severity, category, title, description, suggested_fix, agreement_score, consensus_status, contributing_experts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const f of report.findings) {
        findingStmt.run(
          f.id,
          report.reviewId,
          f.file_path,
          f.line_start,
          f.line_end,
          f.severity,
          f.category,
          f.title,
          f.description,
          f.suggested_fix,
          f.agreementScore,
          f.consensusStatus,
          JSON.stringify(f.contributingExperts),
        );
      }

      const expertStmt = this.db.prepare(
        `INSERT INTO expert_runs (review_id, expert_id, model, input_tokens, output_tokens, cost_usd, duration_ms, raw_findings, valid_findings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const meta of report.expertMetadata) {
        expertStmt.run(
          report.reviewId,
          meta.expertId,
          meta.model,
          meta.tokenUsage.inputTokens,
          meta.tokenUsage.outputTokens,
          meta.costUsd,
          meta.durationMs,
          meta.rawFindings,
          meta.validFindings,
        );
      }
    });

    tx();
  }

  listSessions(options: {
    limit?: number;
    since?: Date;
    severity?: Severity;
    branch?: string;
  } = {}): ReviewSession[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.since) {
      conditions.push('started_at >= ?');
      params.push(options.since.toISOString());
    }
    if (options.branch) {
      conditions.push('branch = ?');
      params.push(options.branch);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 50;

    const rows = this.db
      .prepare(
        `SELECT review_id, repo, branch, commit_hash, scope_type, scope_json, status, verdict, total_cost_usd, started_at, completed_at
         FROM review_sessions ${where} ORDER BY started_at DESC LIMIT ?`,
      )
      .all(...params, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToSession(row));
  }

  getSession(reviewId: string): ReviewSession | null {
    const row = this.db
      .prepare('SELECT * FROM review_sessions WHERE review_id = ?')
      .get(reviewId) as Record<string, unknown> | undefined;

    return row ? this.rowToSession(row) : null;
  }

  getReport(reviewId: string): SynthesizedReport | null {
    const row = this.db
      .prepare('SELECT report_json FROM review_sessions WHERE review_id = ?')
      .get(reviewId) as { report_json: string | null } | undefined;

    if (!row?.report_json) return null;
    try {
      const parsed = JSON.parse(row.report_json);
      // Restore Date objects from ISO strings
      if (parsed.timestamp) parsed.timestamp = new Date(parsed.timestamp);
      return parsed as SynthesizedReport;
    } catch {
      return null;
    }
  }

  getTotalCost(since?: Date): number {
    const query = since
      ? this.db.prepare('SELECT COALESCE(SUM(total_cost_usd), 0) as total FROM review_sessions WHERE started_at >= ?')
      : this.db.prepare('SELECT COALESCE(SUM(total_cost_usd), 0) as total FROM review_sessions');

    const row = (since ? query.get(since.toISOString()) : query.get()) as { total: number };
    return row.total;
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  private rowToSession(row: Record<string, unknown>): ReviewSession {
    const findingCounts = this.db
      .prepare(
        'SELECT severity, COUNT(*) as count FROM findings WHERE review_id = ? GROUP BY severity',
      )
      .all(row['review_id']) as Array<{ severity: Severity; count: number }>;

    const counts: Record<Severity, number> = { critical: 0, error: 0, warning: 0, info: 0, style: 0 };
    for (const fc of findingCounts) {
      counts[fc.severity] = fc.count;
    }

    const experts = this.db
      .prepare('SELECT DISTINCT expert_id FROM expert_runs WHERE review_id = ?')
      .all(row['review_id']) as Array<{ expert_id: string }>;

    return {
      reviewId: row['review_id'] as string,
      repo: row['repo'] as string,
      branch: row['branch'] as string,
      commit: row['commit_hash'] as string,
      scope: JSON.parse(row['scope_json'] as string),
      status: row['status'] as ReviewStatus,
      startedAt: new Date(row['started_at'] as string),
      completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
      expertsUsed: experts.map((e) => e.expert_id),
      findingCounts: counts,
      verdict: row['verdict'] as ReviewSession['verdict'],
      totalCostUsd: row['total_cost_usd'] as number,
    };
  }
}
