import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EpisodicStore } from './episodic-store.js';
import { FeedbackStore } from './feedback.js';
import { CalibrationEngine, applyCalibration } from './calibration.js';
import { PatternLibrary } from './pattern-library.js';
import { postReviewReflection } from './reflexion.js';
import { discoverPatternCandidates, synthesizePatternFromCandidate } from './pattern-discovery.js';
import { shouldCompress, runCompression } from './compression.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';
import { SCHEMA } from '../db/schema.js';
import type { MergedFinding } from '../types/finding.js';

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cj-learning-'));
  db = new Database(join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  db.exec(LEARNING_SCHEMA);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('EpisodicStore', () => {
  it('saves and retrieves an episode', () => {
    const store = new EpisodicStore(db);
    store.saveEpisode({
      reviewId: 'rev1', repoPath: '/test', timestamp: new Date(),
      trajectories: [{ expertId: 'claude', model: 'sonnet', steps: [{ iteration: 1, type: 'tool_call', toolName: 'read_file', timestamp: 1 }], totalInputTokens: 100, totalOutputTokens: 50, iterations: 1, toolCallCount: 1, finalFindingCount: 0 }],
      findingIds: [], totalCostUsd: 0.01, durationMs: 3000, compressed: false,
    });
    const episode = store.getEpisode('rev1');
    expect(episode).not.toBeNull();
    expect(episode!.trajectories).toHaveLength(1);
  });

  it('tracks uncompressed count', () => {
    const store = new EpisodicStore(db);
    const traj = { expertId: 'x', model: 'm', steps: [], totalInputTokens: 0, totalOutputTokens: 0, iterations: 0, toolCallCount: 0, finalFindingCount: 0 };
    store.saveEpisode({ reviewId: 'r1', repoPath: '/', timestamp: new Date(), trajectories: [traj], findingIds: [], totalCostUsd: 0, durationMs: 0, compressed: false });
    store.saveEpisode({ reviewId: 'r2', repoPath: '/', timestamp: new Date(), trajectories: [traj], findingIds: [], totalCostUsd: 0, durationMs: 0, compressed: false });
    expect(store.getUncompressedCount()).toBe(2);
    store.markCompressed(['r1']);
    expect(store.getUncompressedCount()).toBe(1);
  });
});

describe('FeedbackStore', () => {
  it('saves and retrieves feedback', () => {
    db.prepare("INSERT INTO review_sessions (review_id, repo, branch, commit_hash, scope_type, scope_json, started_at) VALUES ('rev1','r','b','c','staged','{}',datetime('now'))").run();
    db.prepare("INSERT INTO findings (id, review_id, file_path, line_start, line_end, severity, category, title, description) VALUES ('f1','rev1','a.ts',1,1,'warning','style','Test','desc')").run();
    const store = new FeedbackStore(db);
    store.saveFeedback({ findingId: 'f1', reviewId: 'rev1', action: 'accept', timestamp: new Date() });
    const fb = store.getFeedbackForFinding('f1');
    expect(fb).not.toBeNull();
    expect(fb!.action).toBe('accept');
  });

  it('computes stats', () => {
    const store = new FeedbackStore(db);
    store.saveFeedback({ findingId: 'f1', reviewId: 'rv', action: 'accept', timestamp: new Date() });
    store.saveFeedback({ findingId: 'f2', reviewId: 'rv', action: 'dismiss', timestamp: new Date() });
    store.saveFeedback({ findingId: 'f3', reviewId: 'rv', action: 'dismiss', timestamp: new Date() });
    const stats = store.getFeedbackStats();
    expect(stats.totalAccepted).toBe(1);
    expect(stats.totalDismissed).toBe(2);
  });
});

describe('CalibrationEngine', () => {
  it('updates from feedback and computes multipliers', () => {
    const engine = new CalibrationEngine(db, { minFindingsForCalibration: 2, confidenceFloor: 0.2, decayFactor: 0.95 });
    const findings = Array.from({ length: 3 }, (_, i) => ({
      id: `f${i}`, file_path: 'a.ts', line_start: 1, line_end: 1, severity: 'warning' as const, category: 'style' as const, title: 'T', description: 'D', suggested_fix: null, expert_id: 'claude', confidence: 0.8,
    }));
    engine.updateFromFeedback([
      { findingId: 'f0', reviewId: 'r', action: 'dismiss', timestamp: new Date() },
      { findingId: 'f1', reviewId: 'r', action: 'dismiss', timestamp: new Date() },
      { findingId: 'f2', reviewId: 'r', action: 'accept', timestamp: new Date() },
    ], findings);
    const mult = engine.getConfidenceMultiplier('claude', 'style', 'warning');
    expect(mult).toBeLessThan(1.0);
    expect(mult).toBeGreaterThan(0);
  });

  it('returns 1.0 for uncalibrated', () => {
    const engine = new CalibrationEngine(db);
    expect(engine.getConfidenceMultiplier('unknown', 'security', 'critical')).toBe(1.0);
  });
});

describe('PatternLibrary', () => {
  it('adds and retrieves patterns', () => {
    const lib = new PatternLibrary(db);
    lib.addPattern({ name: 'SQL check', description: 'SQL', promptFragment: 'Check SQL', triggerConditions: [{ type: 'language', value: 'typescript' }], successRate: 0.9, expertSource: 'claude', examples: [] });
    expect(lib.getActivePatterns()).toHaveLength(1);
  });

  it('matches patterns against payload', () => {
    const lib = new PatternLibrary(db);
    lib.addPattern({ name: 'TS', description: 'TS', promptFragment: 'TS', triggerConditions: [{ type: 'language', value: 'typescript' }], successRate: 0.8, expertSource: 'claude', examples: [] });
    const matched = lib.matchPatterns({ files: [{ path: 'a.ts', language: 'typescript', hunks: [], additions: 1, deletions: 0 }], repoName: 't', branchName: 'm', directoryStructure: '', totalAdditions: 1, totalDeletions: 0 });
    expect(matched).toHaveLength(1);
  });
});

describe('Reflexion', () => {
  it('generates post-review reflection', () => {
    const reflection = postReviewReflection(
      { reviewId: 'r1', repoPath: '/', timestamp: new Date(), trajectories: [{ expertId: 'claude', model: 'sonnet', steps: [], totalInputTokens: 1000, totalOutputTokens: 500, iterations: 10, toolCallCount: 3, finalFindingCount: 2 }], findingIds: [], totalCostUsd: 0.01, durationMs: 5000, compressed: false },
      { reviewId: 'r1', repo: 't', branch: 'm', commit: 'a', scope: { type: 'staged' }, findings: [], summary: { totalFindings: 0, bySeverity: { critical: 0, error: 0, warning: 0, info: 0, style: 0 }, verdict: 'approve', narrative: '' }, expertMetadata: [], costBreakdown: { totalCostUsd: 0, perExpert: {} }, timestamp: new Date() },
    );
    expect(reflection.observations.length).toBeGreaterThan(0);
    expect(reflection.trigger).toBe('post_review');
  });
});

describe('Pattern Discovery', () => {
  it('discovers candidates from clustered feedback', () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      finding: { id: `f${i}`, file_path: 'src/query.ts', line_start: i, line_end: i + 1, severity: 'warning' as const, category: 'security' as const, title: 'SQL injection in query', description: 'D', suggested_fix: null, expert_id: 'claude', confidence: 0.9 },
      feedback: { findingId: `f${i}`, reviewId: `r${i}`, action: 'accept' as const, timestamp: new Date() },
    }));
    const candidates = discoverPatternCandidates(history, [], { minSamples: 3, minAcceptRate: 0.6 });
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('synthesizes a pattern', () => {
    const pattern = synthesizePatternFromCandidate({ name: 'SQL injection', category: 'security', expertSource: 'claude', filePaths: ['src/q.ts'], findingTitles: ['SQL injection'], acceptRate: 0.9, sampleCount: 5 });
    expect(pattern.promptFragment).toContain('SQL injection');
  });
});

describe('Compression', () => {
  it('shouldCompress with threshold', () => {
    expect(shouldCompress(db, 20)).toBe(false);
    const store = new EpisodicStore(db);
    const traj = { expertId: 'x', model: 'm', steps: [], totalInputTokens: 0, totalOutputTokens: 0, iterations: 0, toolCallCount: 0, finalFindingCount: 0 };
    for (let i = 0; i < 25; i++) store.saveEpisode({ reviewId: `r${i}`, repoPath: '/', timestamp: new Date(), trajectories: [traj], findingIds: [], totalCostUsd: 0, durationMs: 0, compressed: false });
    expect(shouldCompress(db, 20)).toBe(true);
  });

  it('marks episodes compressed', async () => {
    const store = new EpisodicStore(db);
    const traj = { expertId: 'claude', model: 's', steps: [{ iteration: 1, type: 'tool_call' as const, toolName: 'read_file', timestamp: 1 }], totalInputTokens: 100, totalOutputTokens: 50, iterations: 1, toolCallCount: 1, finalFindingCount: 1 };
    for (let i = 0; i < 5; i++) store.saveEpisode({ reviewId: `r${i}`, repoPath: '/', timestamp: new Date(), trajectories: [traj], findingIds: [], totalCostUsd: 0.01, durationMs: 3000, compressed: false });
    const result = await runCompression(db, { episodeThreshold: 1, minEpisodesForPattern: 3, maxObservationsPerRun: 5 });
    expect(result.episodesCompressed).toBeGreaterThan(0);
    expect(store.getUncompressedCount()).toBe(0);
  });
});
