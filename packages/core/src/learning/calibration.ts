import type Database from 'better-sqlite3';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FindingFeedback, CalibrationEntry, CalibrationConfig } from './types.js';
import { DEFAULT_CALIBRATION_CONFIG } from './types.js';
import type { Finding, Category, Severity, MergedFinding } from '../types/finding.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';

export class CalibrationEngine {
  private config: CalibrationConfig;

  constructor(private db: Database.Database, config?: Partial<CalibrationConfig>) {
    this.db.exec(LEARNING_SCHEMA);
    this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
  }

  updateFromFeedback(feedbackBatch: FindingFeedback[], findings: Finding[]): void {
    const findingMap = new Map(findings.map((f) => [f.id, f]));

    const upsert = this.db.prepare(
      `INSERT INTO calibration_entries (expert_id, category, severity, total_findings, accepted, dismissed, ignored, confidence_multiplier, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, 1.0, datetime('now'))
       ON CONFLICT(expert_id, category, severity) DO UPDATE SET
         total_findings = total_findings + 1,
         accepted = accepted + excluded.accepted,
         dismissed = dismissed + excluded.dismissed,
         ignored = ignored + excluded.ignored,
         updated_at = datetime('now')`,
    );

    const recalc = this.db.prepare(
      `UPDATE calibration_entries SET
         confidence_multiplier = CASE
           WHEN total_findings = 0 THEN 1.0
           ELSE MIN(2.0, MAX(0.1, (accepted + 0.5 * ignored) * 1.0 / total_findings))
         END
       WHERE expert_id = ? AND category = ? AND severity = ?`,
    );

    const tx = this.db.transaction(() => {
      for (const fb of feedbackBatch) {
        const finding = findingMap.get(fb.findingId);
        if (!finding) continue;
        const a = fb.action === 'accept' ? 1 : 0;
        const d = fb.action === 'dismiss' ? 1 : 0;
        const i = fb.action === 'ignore' ? 1 : 0;
        upsert.run(finding.expert_id, finding.category, finding.severity, a, d, i);
        recalc.run(finding.expert_id, finding.category, finding.severity);
      }
    });
    tx();
  }

  getConfidenceMultiplier(expertId: string, category: Category, severity: Severity): number {
    const row = this.db
      .prepare('SELECT confidence_multiplier, total_findings FROM calibration_entries WHERE expert_id = ? AND category = ? AND severity = ?')
      .get(expertId, category, severity) as { confidence_multiplier: number; total_findings: number } | undefined;
    if (!row || row.total_findings < this.config.minFindingsForCalibration) return 1.0;
    return row.confidence_multiplier;
  }

  getCalibrationSummary(expertId: string): string {
    const rows = this.db
      .prepare('SELECT * FROM calibration_entries WHERE expert_id = ? AND total_findings >= ? ORDER BY confidence_multiplier ASC')
      .all(expertId, this.config.minFindingsForCalibration) as Array<Record<string, unknown>>;
    if (rows.length === 0) return '';
    const lines: string[] = [`Calibration for ${expertId}:`];
    for (const r of rows) {
      const cat = r['category'] as string;
      const sev = r['severity'] as string;
      const mult = r['confidence_multiplier'] as number;
      const total = r['total_findings'] as number;
      const accepted = r['accepted'] as number;
      const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
      if (mult < 0.5) lines.push(`  ${cat}/${sev}: ${rate}% accept (${total} reviews) — reduce`);
      else if (mult > 1.2) lines.push(`  ${cat}/${sev}: ${rate}% accept (${total} reviews) — prioritize`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
  }

  getAllEntries(): CalibrationEntry[] {
    return (this.db.prepare('SELECT * FROM calibration_entries ORDER BY expert_id, category').all() as Array<Record<string, unknown>>)
      .map((r) => ({
        expertId: r['expert_id'] as string,
        category: r['category'] as Category,
        severity: r['severity'] as Severity,
        totalFindings: r['total_findings'] as number,
        accepted: r['accepted'] as number,
        dismissed: r['dismissed'] as number,
        ignored: r['ignored'] as number,
        confidenceMultiplier: r['confidence_multiplier'] as number,
        lastUpdated: new Date(r['updated_at'] as string),
      }));
  }

  async syncToMemoryFile(memoryDir: string): Promise<void> {
    const entries = this.getAllEntries();
    if (entries.length === 0) return;
    const perExpert: Record<string, { totalFindings: number; accepted: number; dismissed: number; accuracy: number }> = {};
    for (const e of entries) {
      if (!perExpert[e.expertId]) perExpert[e.expertId] = { totalFindings: 0, accepted: 0, dismissed: 0, accuracy: 0 };
      const pe = perExpert[e.expertId]!;
      pe.totalFindings += e.totalFindings;
      pe.accepted += e.accepted;
      pe.dismissed += e.dismissed;
      pe.accuracy = pe.totalFindings > 0 ? pe.accepted / pe.totalFindings : 0;
    }
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'calibration.json'), JSON.stringify({ lastUpdated: new Date().toISOString(), perExpert }, null, 2) + '\n');
  }
}

export function applyCalibration(
  findings: MergedFinding[],
  calibrationEngine: CalibrationEngine,
  config: CalibrationConfig = DEFAULT_CALIBRATION_CONFIG,
): MergedFinding[] {
  return findings
    .map((f) => {
      const multipliers = f.contributingExperts.map((eid) => calibrationEngine.getConfidenceMultiplier(eid, f.category, f.severity));
      const avg = multipliers.length > 0 ? multipliers.reduce((a, b) => a + b, 0) / multipliers.length : 1.0;
      // Clamp adjustedConfidence to [0, 1] range
      const adjusted = Math.min(1.0, Math.max(0.0, f.confidence * avg));
      return { ...f, adjustedConfidence: Number.isFinite(adjusted) ? adjusted : f.confidence };
    })
    .filter((f) => (f.adjustedConfidence ?? f.confidence) >= config.confidenceFloor);
}
