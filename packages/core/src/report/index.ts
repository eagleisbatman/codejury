export { formatJson } from './json.js';
export { formatMarkdown } from './markdown.js';
export { formatSarif } from './sarif.js';
export { formatHtml } from './html.js';
export { buildPrComments, buildSummaryComment, postGitHubReview, type GitHubComment } from './github.js';

import type { SynthesizedReport } from '../types/review.js';
import type { OutputFormat } from '../types/config.js';
import { formatJson } from './json.js';
import { formatMarkdown } from './markdown.js';
import { formatSarif } from './sarif.js';
import { formatHtml } from './html.js';

export function formatReport(report: SynthesizedReport, format: OutputFormat): string {
  switch (format) {
    case 'json': return formatJson(report);
    case 'markdown': return formatMarkdown(report);
    case 'sarif': return formatSarif(report);
    case 'html': return formatHtml(report);
    case 'github': return formatMarkdown(report); // GitHub comments use markdown
  }
}
