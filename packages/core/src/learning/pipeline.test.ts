import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SCHEMA } from '../db/schema.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';
import { EpisodicStore } from './episodic-store.js';
import { FeedbackStore } from './feedback.js';
import { CalibrationEngine, applyCalibration } from './calibration.js';
import { PatternLibrary } from './pattern-library.js';
import { postFeedbackReflection } from './reflexion.js';
import { discoverPatternCandidates, synthesizePatternFromCandidate } from './pattern-discovery.js';
import { runCompression } from './compression.js';
import type { Finding, MergedFinding } from '../types/finding.js';
import type { FindingFeedback } from './types.js';

let tmpDir: string;
let db: Database.Database;

function makeFinding(id: string, expert: string, category: string, severity: string, title: string): Finding {
  return {
    id, file_path: 'src/api/query.ts', line_start: 10, line_end: 20,
    severity: severity as Finding['severity'], category: category as Finding['category'],
    title, description: `${title} details`, suggested_fix: null, expert_id: expert, confidence: 0.8,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cj-pipeline-'));
  db = new Database(join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  db.exec(LEARNING_SCHEMA);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Learning Pipeline E2E', () => {
  it('complete cycle: review → feedback → calibration → reflexion → pattern discovery → compression', async () => {
    const episodicStore = new EpisodicStore(db);
    const feedbackStore = new FeedbackStore(db);
    const calibrationEngine = new CalibrationEngine(db, { minFindingsForCalibration: 2, confidenceFloor: 0.2, decayFactor: 0.95 });
    const patternLibrary = new PatternLibrary(db);

    const allFindings: Finding[] = [];
    const allFeedback: FindingFeedback[] = [];

    // Phase 1: Simulate 5 reviews with consistent feedback patterns
    for (let i = 0; i < 5; i++) {
      const reviewId = `rev${i}`;
      const f1 = makeFinding(`f${i}_1`, 'claude', 'security', 'warning', 'SQL injection in query builder');
      const f2 = makeFinding(`f${i}_2`, 'claude', 'style', 'info', 'Trailing whitespace');
      const f3 = makeFinding(`f${i}_3`, 'gemini', 'performance', 'warning', 'N+1 query detected');

      db.prepare("INSERT INTO review_sessions (review_id, repo, branch, commit_hash, scope_type, scope_json, started_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(reviewId, 'test', 'main', 'abc', 'staged', '{}');
      for (const f of [f1, f2, f3]) {
        db.prepare('INSERT INTO findings (id, review_id, file_path, line_start, line_end, severity, category, title, description, agreement_score, consensus_status, contributing_experts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
          f.id, reviewId, f.file_path, f.line_start, f.line_end, f.severity, f.category, f.title, f.description, 0.5, 'split', JSON.stringify([f.expert_id]),
        );
      }

      episodicStore.saveEpisode({
        reviewId, repoPath: '/test', timestamp: new Date(),
        trajectories: [{ expertId: 'claude', model: 'sonnet', steps: [{ iteration: 1, type: 'tool_call', toolName: 'read_file', timestamp: Date.now() }], totalInputTokens: 1000, totalOutputTokens: 500, iterations: 2, toolCallCount: 3, finalFindingCount: 2 }],
        findingIds: [f1.id, f2.id, f3.id], totalCostUsd: 0.01, durationMs: 5000, compressed: false,
      });

      // Consistent pattern: accept security+perf, dismiss style
      const fb1: FindingFeedback = { findingId: f1.id, reviewId, action: 'accept', timestamp: new Date() };
      const fb2: FindingFeedback = { findingId: f2.id, reviewId, action: 'dismiss', timestamp: new Date() };
      const fb3: FindingFeedback = { findingId: f3.id, reviewId, action: 'accept', timestamp: new Date() };
      feedbackStore.saveFeedback(fb1);
      feedbackStore.saveFeedback(fb2);
      feedbackStore.saveFeedback(fb3);
      allFindings.push(f1, f2, f3);
      allFeedback.push(fb1, fb2, fb3);
    }

    // Phase 2: Verify feedback
    const stats = feedbackStore.getFeedbackStats();
    expect(stats.totalAccepted).toBe(10);
    expect(stats.totalDismissed).toBe(5);

    // Phase 3: Calibration from feedback
    calibrationEngine.updateFromFeedback(allFeedback, allFindings);
    const styleMult = calibrationEngine.getConfidenceMultiplier('claude', 'style', 'info');
    const secMult = calibrationEngine.getConfidenceMultiplier('claude', 'security', 'warning');
    expect(styleMult).toBeLessThan(0.5);
    expect(secMult).toBeGreaterThan(0.5);

    // Phase 4: Apply calibration filters findings
    const merged: MergedFinding[] = [
      { ...makeFinding('t1', 'claude', 'style', 'info', 'Style'), agreementScore: 0.5, consensusStatus: 'split', contributingExperts: ['claude'], severityVotes: { claude: 'info' }, categoryVotes: { claude: 'style' }, dissentingOpinions: [] },
      { ...makeFinding('t2', 'claude', 'security', 'warning', 'SQL'), agreementScore: 1.0, consensusStatus: 'unanimous', contributingExperts: ['claude'], severityVotes: { claude: 'warning' }, categoryVotes: { claude: 'security' }, dissentingOpinions: [] },
    ];
    const filtered = applyCalibration(merged, calibrationEngine, { minFindingsForCalibration: 2, confidenceFloor: 0.2, decayFactor: 0.95 });
    const style = filtered.find((f) => f.category === 'style');
    const sec = filtered.find((f) => f.category === 'security');
    if (style && sec) expect(style.adjustedConfidence!).toBeLessThan(sec.adjustedConfidence!);

    // Phase 5: Reflexion
    const report = { reviewId: 'rev0', repo: 'test', branch: 'main', commit: 'abc', scope: { type: 'staged' as const }, findings: merged, summary: { totalFindings: 2, bySeverity: { critical: 0, error: 0, warning: 1, info: 1, style: 0 }, verdict: 'approve' as const, narrative: '' }, expertMetadata: [], costBreakdown: { totalCostUsd: 0, perExpert: {} }, timestamp: new Date() };
    const reflection = postFeedbackReflection(allFeedback.slice(0, 3), report);
    expect(reflection.observations.length).toBeGreaterThan(0);

    // Phase 6: Pattern discovery
    const feedbackHistory = feedbackStore.getRecentFeedbackWithFindings(100);
    const candidates = discoverPatternCandidates(feedbackHistory, [], { minSamples: 3, minAcceptRate: 0.5 });
    expect(candidates.length).toBeGreaterThan(0);

    if (candidates[0]) {
      const pattern = synthesizePatternFromCandidate(candidates[0]);
      patternLibrary.addPattern(pattern);
      const matched = patternLibrary.matchPatterns({ files: [{ path: 'src/api/query.ts', language: 'typescript', hunks: [], additions: 1, deletions: 0 }], repoName: 'test', branchName: 'main', directoryStructure: '', totalAdditions: 1, totalDeletions: 0 });
      expect(matched.length).toBeGreaterThan(0);
    }

    // Phase 7: Compression
    expect(episodicStore.getUncompressedCount()).toBe(5);
    const compResult = await runCompression(db, { episodeThreshold: 1, minEpisodesForPattern: 3, maxObservationsPerRun: 10 });
    expect(compResult.episodesCompressed).toBe(5);
    expect(episodicStore.getUncompressedCount()).toBe(0);

    // Phase 8: Memory sync
    await calibrationEngine.syncToMemoryFile(join(tmpDir, 'memory'));
    const calData = JSON.parse(readFileSync(join(tmpDir, 'memory', 'calibration.json'), 'utf-8'));
    expect(calData.perExpert['claude']).toBeDefined();
    expect(calData.perExpert['claude'].totalFindings).toBeGreaterThan(0);
  });
});
