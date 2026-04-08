import type { SynthesizedReport } from '../types/review.js';
import type { Severity } from '../types/finding.js';

type SarifLevel = 'error' | 'warning' | 'note' | 'none';

const SEVERITY_TO_SARIF: Record<Severity, SarifLevel> = {
  critical: 'error',
  error: 'error',
  warning: 'warning',
  info: 'note',
  style: 'note',
};

export function formatSarif(report: SynthesizedReport): string {
  const rules = report.findings.map((f, i) => ({
    id: `CJ${String(i + 1).padStart(3, '0')}`,
    name: f.title.replace(/[^a-zA-Z0-9]/g, ''),
    shortDescription: { text: f.title },
    fullDescription: { text: f.description },
    defaultConfiguration: { level: SEVERITY_TO_SARIF[f.severity] },
    properties: {
      category: f.category,
      agreementScore: f.agreementScore,
      consensusStatus: f.consensusStatus,
    },
  }));

  const results = report.findings.map((f, i) => ({
    ruleId: `CJ${String(i + 1).padStart(3, '0')}`,
    level: SEVERITY_TO_SARIF[f.severity],
    message: { text: f.description },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.file_path },
          region: {
            startLine: f.line_start,
            endLine: f.line_end,
          },
        },
      },
    ],
    ...(f.suggested_fix
      ? {
          fixes: [
            {
              description: { text: 'Suggested fix' },
              artifactChanges: [
                {
                  artifactLocation: { uri: f.file_path },
                  replacements: [
                    {
                      deletedRegion: {
                        startLine: f.line_start,
                        endLine: f.line_end,
                      },
                      insertedContent: { text: f.suggested_fix },
                    },
                  ],
                },
              ],
            },
          ],
        }
      : {}),
    properties: {
      expertAgreement: f.agreementScore,
      contributingExperts: f.contributingExperts,
    },
  }));

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'CodeJury',
            version: '0.1.0',
            informationUri: 'https://github.com/codejury/codejury',
            rules,
          },
        },
        results,
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              verdict: report.summary.verdict,
              totalCost: report.costBreakdown.totalCostUsd,
              expertCount: report.expertMetadata.length,
            },
          },
        ],
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
