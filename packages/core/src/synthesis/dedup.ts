import type { Finding, MergedFinding, Severity, Category, DissentingOpinion } from '../types/finding.js';
import { SEVERITY_ORDER, CATEGORY_PRIORITY } from '../types/finding.js';
import type { SimilarityStrategy } from './similarity.js';
import { LevenshteinStrategy } from './similarity.js';

const LINE_OVERLAP_TOLERANCE = 5;

interface TaggedFinding extends Finding {
  _sourceExpert: string;
}

function linesOverlap(a: Finding, b: Finding): boolean {
  return (
    a.file_path === b.file_path &&
    a.line_start <= b.line_end + LINE_OVERLAP_TOLERANCE &&
    b.line_start <= a.line_end + LINE_OVERLAP_TOLERANCE
  );
}

function resolveHighestSeverity(votes: Record<string, Severity>): Severity {
  let highest: Severity = 'style';
  for (const sev of Object.values(votes)) {
    if (SEVERITY_ORDER[sev] > SEVERITY_ORDER[highest]) {
      highest = sev;
    }
  }
  return highest;
}

function resolveMajorityCategory(votes: Record<string, Category>): Category {
  const counts: Record<string, number> = {};
  for (const cat of Object.values(votes)) {
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  let best: Category = 'style';
  let bestCount = 0;
  for (const [cat, count] of Object.entries(counts)) {
    if (count > bestCount || (count === bestCount && CATEGORY_PRIORITY[cat as Category] > CATEGORY_PRIORITY[best])) {
      best = cat as Category;
      bestCount = count;
    }
  }
  return best;
}

function buildDissentingOpinions(
  findings: TaggedFinding[],
  consensusSeverity: Severity,
  consensusCategory: Category,
): DissentingOpinion[] {
  const dissents: DissentingOpinion[] = [];
  for (const f of findings) {
    if (f.severity !== consensusSeverity || f.category !== consensusCategory) {
      dissents.push({
        expertId: f._sourceExpert,
        severity: f.severity,
        category: f.category,
        reasoning: f.description,
      });
    }
  }
  return dissents;
}

function mergeFindingGroup(
  group: TaggedFinding[],
  totalExperts: number,
): MergedFinding {
  // Use the finding with the longest description as the base
  const base = group.reduce((a, b) =>
    a.description.length >= b.description.length ? a : b,
  );

  const contributingExperts = [...new Set(group.map((f) => f._sourceExpert))];
  const agreementScore = contributingExperts.length / totalExperts;

  const severityVotes: Record<string, Severity> = {};
  const categoryVotes: Record<string, Category> = {};
  for (const f of group) {
    severityVotes[f._sourceExpert] = f.severity;
    categoryVotes[f._sourceExpert] = f.category;
  }

  const severity = resolveHighestSeverity(severityVotes);
  const category = resolveMajorityCategory(categoryVotes);
  const dissentingOpinions = buildDissentingOpinions(group, severity, category);

  // Pick the most detailed suggested_fix
  const suggestedFix = group.reduce<string | null>((best, f) => {
    if (!f.suggested_fix) return best;
    if (!best || f.suggested_fix.length > best.length) return f.suggested_fix;
    return best;
  }, null);

  const consensusStatus: MergedFinding['consensusStatus'] =
    agreementScore === 1 ? 'unanimous' : agreementScore > 0.5 ? 'majority' : 'split';

  return {
    ...base,
    severity,
    category,
    suggested_fix: suggestedFix,
    agreementScore,
    consensusStatus,
    contributingExperts,
    severityVotes,
    categoryVotes,
    dissentingOpinions,
  };
}

export function deduplicateFindings(
  expertFindings: Finding[][],
  options: {
    dedupThreshold?: number;
    similarity?: SimilarityStrategy;
  } = {},
): MergedFinding[] {
  const threshold = options.dedupThreshold ?? 0.75;
  const similarity = options.similarity ?? new LevenshteinStrategy();
  const totalExperts = expertFindings.length;

  // Tag each finding with its source expert
  const allFindings: TaggedFinding[] = expertFindings.flatMap((findings) =>
    findings.map((f) => ({ ...f, _sourceExpert: f.expert_id })),
  );

  if (allFindings.length === 0) return [];

  // Group by file_path
  const byFile = new Map<string, TaggedFinding[]>();
  for (const f of allFindings) {
    const existing = byFile.get(f.file_path) ?? [];
    existing.push(f);
    byFile.set(f.file_path, existing);
  }

  const merged: MergedFinding[] = [];

  for (const [_, fileFindings] of byFile) {
    const clusters: TaggedFinding[][] = [];

    for (const finding of fileFindings) {
      let placed = false;

      for (const cluster of clusters) {
        // Stage 1: Line overlap
        if (cluster.some((c) => linesOverlap(c, finding))) {
          cluster.push(finding);
          placed = true;
          break;
        }

        // Stage 2: Title similarity
        if (
          cluster.some((c) => {
            const sim = similarity.compare(
              c.title.toLowerCase(),
              finding.title.toLowerCase(),
            );
            return sim >= threshold;
          })
        ) {
          cluster.push(finding);
          placed = true;
          break;
        }
      }

      if (!placed) {
        clusters.push([finding]);
      }
    }

    for (const cluster of clusters) {
      merged.push(mergeFindingGroup(cluster, totalExperts));
    }
  }

  return merged;
}
