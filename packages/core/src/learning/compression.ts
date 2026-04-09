import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { EpisodicStore } from './episodic-store.js';
import { FeedbackStore } from './feedback.js';
import { PatternLibrary } from './pattern-library.js';
import { discoverPatternCandidates, synthesizePatternFromCandidate } from './pattern-discovery.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';

export interface CompressionConfig {
  episodeThreshold: number;
  minEpisodesForPattern: number;
  maxObservationsPerRun: number;
}

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  episodeThreshold: 20,
  minEpisodesForPattern: 5,
  maxObservationsPerRun: 10,
};

export interface CompressionResult {
  episodesCompressed: number;
  observationsCreated: number;
  patternsDiscovered: number;
}

export function shouldCompress(db: Database.Database, threshold: number): boolean {
  db.exec(LEARNING_SCHEMA);
  const row = db.prepare('SELECT COUNT(DISTINCT review_id) as cnt FROM trajectories WHERE compressed = 0').get() as { cnt: number };
  return row.cnt >= threshold;
}

export async function runCompression(
  db: Database.Database,
  config: CompressionConfig = DEFAULT_COMPRESSION_CONFIG,
): Promise<CompressionResult> {
  const episodicStore = new EpisodicStore(db);
  const feedbackStore = new FeedbackStore(db);
  const patternLibrary = new PatternLibrary(db);

  const episodeIds = episodicStore.getUncompressedEpisodeIds(config.maxObservationsPerRun * 2);
  if (episodeIds.length === 0) return { episodesCompressed: 0, observationsCreated: 0, patternsDiscovered: 0 };

  const feedbackHistory = feedbackStore.getRecentFeedbackWithFindings(200);

  // Extract statistical observations from trajectories
  const observations: Array<{ observation: string; category: string; confidence: number }> = [];

  for (const episodeId of episodeIds) {
    const episode = episodicStore.getEpisode(episodeId);
    if (!episode) continue;
    for (const t of episode.trajectories) {
      if (t.finalFindingCount > 0 && t.toolCallCount > 0) {
        const eff = t.finalFindingCount / t.toolCallCount;
        if (eff > 0.3) observations.push({ observation: `${t.expertId} efficient: ${t.finalFindingCount} findings / ${t.toolCallCount} calls`, category: 'expert_strength', confidence: Math.min(0.9, eff) });
      }
      if (t.finalFindingCount === 0 && t.toolCallCount > 8) {
        observations.push({ observation: `${t.expertId} explored ${t.toolCallCount} calls, found nothing`, category: 'expert_weakness', confidence: 0.5 });
      }
    }
  }

  // Wrap all writes in a single transaction for atomicity
  const existingPatterns = patternLibrary.getActivePatterns();
  const candidates = discoverPatternCandidates(feedbackHistory, existingPatterns.map((p) => p.name), { minSamples: config.minEpisodesForPattern, minAcceptRate: 0.6 });
  const observationsToSave = observations.slice(0, config.maxObservationsPerRun);
  const patternsToAdd = candidates.slice(0, 5);

  const tx = db.transaction(() => {
    // Save observations
    const insertObs = db.prepare('INSERT INTO compressed_observations (id, source_episode_ids_json, observation, category, confidence) VALUES (?, ?, ?, ?, ?)');
    for (const obs of observationsToSave) {
      insertObs.run(nanoid(), JSON.stringify(episodeIds), obs.observation, obs.category, obs.confidence);
    }

    // Discover and add patterns
    for (const c of patternsToAdd) {
      patternLibrary.addPattern(synthesizePatternFromCandidate(c));
    }

    patternLibrary.deactivateStalePatterns();
    episodicStore.markCompressed(episodeIds);
  });
  tx();

  return { episodesCompressed: episodeIds.length, observationsCreated: observationsToSave.length, patternsDiscovered: patternsToAdd.length };
}
