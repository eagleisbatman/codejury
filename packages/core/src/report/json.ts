import type { SynthesizedReport } from '../types/review.js';

export function formatJson(report: SynthesizedReport): string {
  return JSON.stringify(report, null, 2);
}
