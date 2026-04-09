import type { Finding } from '../types/finding.js';
import type { FindingFeedback } from './types.js';

export function buildReflectionPrompt(context: {
  acceptedFindings: Array<{ finding: Finding; feedback: FindingFeedback }>;
  dismissedFindings: Array<{ finding: Finding; feedback: FindingFeedback }>;
}): string {
  const accepted = context.acceptedFindings.map(
    (af) => `- [${af.finding.severity}/${af.finding.category}] ${af.finding.title} (${af.finding.file_path}:${af.finding.line_start}) by ${af.finding.expert_id}`,
  );
  const dismissed = context.dismissedFindings.map(
    (df) => `- [${df.finding.severity}/${df.finding.category}] ${df.finding.title} (${df.finding.file_path}:${df.finding.line_start}) by ${df.finding.expert_id}${df.feedback.reason ? ` — reason: ${df.feedback.reason}` : ''}`,
  );

  return `You are a meta-learning system for a code review tool called CodeJury.

A review just completed and the developer provided feedback on the findings.

ACCEPTED findings (developer agreed these are real issues):
${accepted.length > 0 ? accepted.join('\n') : '(none)'}

DISMISSED findings (developer rejected these as false positives or noise):
${dismissed.length > 0 ? dismissed.join('\n') : '(none)'}

Based on these outcomes, provide your analysis as JSON:
{
  "observations": ["string array of high-level observations about what worked and what didn't"],
  "patternSuggestions": ["string array of review patterns worth codifying — things that were consistently accepted"],
  "calibrationUpdates": [
    {
      "expertId": "which expert",
      "category": "which category",
      "severity": "which severity",
      "adjustment": 0.1,
      "reason": "why this adjustment"
    }
  ]
}

Be specific and actionable. Only suggest calibration updates when there's a clear signal (3+ dismissed findings in a category).`;
}
