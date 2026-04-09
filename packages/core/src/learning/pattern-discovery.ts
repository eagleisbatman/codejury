import { distance } from 'fastest-levenshtein';
import type { Finding } from '../types/finding.js';
import type { FindingFeedback, ReviewPattern, PatternTrigger } from './types.js';

export interface PatternCandidate {
  name: string;
  category: string;
  expertSource: string;
  filePaths: string[];
  findingTitles: string[];
  acceptRate: number;
  sampleCount: number;
}

/**
 * Discover pattern candidates by clustering accepted findings.
 */
export function discoverPatternCandidates(
  feedbackHistory: Array<{ finding: Finding; feedback: FindingFeedback }>,
  existingPatternNames: string[],
  config: { minSamples: number; minAcceptRate: number } = { minSamples: 3, minAcceptRate: 0.6 },
): PatternCandidate[] {
  // Group by (expert_id, category)
  const groups = new Map<string, Array<{ finding: Finding; accepted: boolean }>>();

  for (const { finding, feedback } of feedbackHistory) {
    const key = `${finding.expert_id}:${finding.category}`;
    const existing = groups.get(key) ?? [];
    existing.push({ finding, accepted: feedback.action === 'accept' });
    groups.set(key, existing);
  }

  const candidates: PatternCandidate[] = [];

  for (const [key, items] of groups) {
    if (items.length < config.minSamples) continue;

    const [expertSource, category] = key.split(':') as [string, string];
    const accepted = items.filter((i) => i.accepted);
    const acceptRate = accepted.length / items.length;

    if (acceptRate < config.minAcceptRate) continue;

    // Cluster accepted findings by title similarity
    const clusters = clusterByTitleSimilarity(accepted.map((a) => a.finding), 0.6);

    for (const cluster of clusters) {
      if (cluster.length < config.minSamples) continue;

      // Check if a similar pattern already exists
      const candidateName = cluster[0]!.title.slice(0, 50);
      const isDuplicate = existingPatternNames.some((pn) => {
        const sim = 1 - distance(pn.toLowerCase(), candidateName.toLowerCase()) / Math.max(pn.length, candidateName.length);
        return sim > 0.7;
      });
      if (isDuplicate) continue;

      candidates.push({
        name: candidateName,
        category: category!,
        expertSource: expertSource!,
        filePaths: [...new Set(cluster.map((f) => f.file_path))],
        findingTitles: cluster.map((f) => f.title),
        acceptRate,
        sampleCount: cluster.length,
      });
    }
  }

  return candidates.sort((a, b) => b.sampleCount * b.acceptRate - a.sampleCount * a.acceptRate);
}

function clusterByTitleSimilarity(findings: Finding[], threshold: number): Finding[][] {
  const clusters: Finding[][] = [];

  for (const finding of findings) {
    let placed = false;
    for (const cluster of clusters) {
      const representative = cluster[0]!;
      const maxLen = Math.max(representative.title.length, finding.title.length);
      const sim = maxLen > 0 ? 1 - distance(representative.title.toLowerCase(), finding.title.toLowerCase()) / maxLen : 1;
      if (sim >= threshold) {
        cluster.push(finding);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([finding]);
  }

  return clusters;
}

/**
 * Synthesize a ReviewPattern from a candidate (without LLM — template-based).
 */
export function synthesizePatternFromCandidate(candidate: PatternCandidate): Omit<ReviewPattern, 'id' | 'createdAt' | 'lastUsed' | 'timesApplied' | 'timesAccepted' | 'active'> {
  // Derive trigger conditions from file paths
  const triggers: PatternTrigger[] = [];

  // Extract common directory
  const dirs = candidate.filePaths.map((p) => p.split('/').slice(0, -1).join('/'));
  const commonDir = dirs.reduce((a, b) => {
    const aParts = a.split('/');
    const bParts = b.split('/');
    let i = 0;
    while (i < aParts.length && i < bParts.length && aParts[i] === bParts[i]) i++;
    return aParts.slice(0, i).join('/');
  });
  if (commonDir) triggers.push({ type: 'file_glob', value: `${commonDir}/**` });

  // Extract common extension
  const exts = [...new Set(candidate.filePaths.map((p) => p.split('.').pop()))];
  if (exts.length === 1) triggers.push({ type: 'file_glob', value: `**/*.${exts[0]}` });

  triggers.push({ type: 'category', value: candidate.category });

  return {
    name: candidate.name,
    description: `Auto-discovered pattern: ${candidate.findingTitles[0]} (${candidate.sampleCount} samples, ${Math.round(candidate.acceptRate * 100)}% accepted)`,
    promptFragment: `Pay attention to: ${candidate.findingTitles.slice(0, 3).join('; ')}. This pattern has been consistently accepted by the developer.`,
    triggerConditions: triggers,
    successRate: candidate.acceptRate,
    expertSource: candidate.expertSource,
    examples: candidate.filePaths.slice(0, 3).map((fp) => ({
      filePath: fp,
      codeSnippet: '',
      findingTitle: candidate.findingTitles[0] ?? '',
      accepted: true,
    })),
  };
}
