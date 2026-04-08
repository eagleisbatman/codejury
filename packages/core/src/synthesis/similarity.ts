import { distance } from 'fastest-levenshtein';

export interface SimilarityStrategy {
  compare(a: string, b: string): number;
}

export class LevenshteinStrategy implements SimilarityStrategy {
  compare(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - distance(a, b) / maxLen;
  }
}
