import { Box, Text, useInput } from 'ink';
import type { SynthesizedReport } from '@codejury/core';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { ExpertDot } from '../components/ExpertDot.js';

interface ConsensusMapProps {
  report: SynthesizedReport;
  onBack?: () => void;
}

export function ConsensusMap({ report, onBack }: ConsensusMapProps) {
  useInput((_input, key) => {
    if (key.escape) onBack?.();
  });

  const allExperts = report.expertMetadata.map((m) => m.expertId);

  // Consensus stats
  const unanimous = report.findings.filter((f) => f.consensusStatus === 'unanimous').length;
  const majority = report.findings.filter((f) => f.consensusStatus === 'majority').length;
  const split = report.findings.filter((f) => f.consensusStatus === 'split').length;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Consensus Map</Text>

      {/* Summary */}
      <Box gap={2}>
        {unanimous > 0 && <Text>{unanimous} unanimous</Text>}
        {majority > 0 && <Text color="yellow">{majority} majority</Text>}
        {split > 0 && <Text color="red">{split} split</Text>}
        <Text dimColor>{report.findings.length} total</Text>
      </Box>

      {/* Matrix header */}
      <Box gap={1}>
        <Text dimColor>{'Finding'.padEnd(35)}</Text>
        {allExperts.map((e) => (
          <Text key={e} dimColor>{e.slice(0, 6).padEnd(7)}</Text>
        ))}
        <Text dimColor>Status</Text>
      </Box>

      {/* Matrix rows */}
      <Box flexDirection="column">
        {report.findings.map((f) => (
          <Box key={f.id} gap={1}>
            <Box gap={1} width={35}>
              <SeverityBadge severity={f.severity} />
              <Text>{f.title.length > 22 ? f.title.slice(0, 21) + '…' : f.title}</Text>
            </Box>
            {allExperts.map((e) => (
              <Text key={e}>
                {f.contributingExperts.includes(e)
                  ? '  ✓    '
                  : '  ·    '}
              </Text>
            ))}
            <Text
              color={f.consensusStatus === 'unanimous' ? 'green'
                : f.consensusStatus === 'majority' ? 'yellow' : 'red'}
              dimColor={f.consensusStatus === 'unanimous'}
            >
              {f.consensusStatus.padEnd(10)} {Math.round(f.agreementScore * 100)}%
            </Text>
          </Box>
        ))}
      </Box>

      {/* Per-expert contribution */}
      <Text bold>Expert contributions</Text>
      <Box flexDirection="column">
        {report.expertMetadata.map((meta) => {
          const findings = report.findings.filter((f) =>
            f.contributingExperts.includes(meta.expertId),
          );
          const uniqueFindings = findings.filter(
            (f) => f.contributingExperts.length === 1,
          );

          return (
            <Box key={meta.expertId} gap={1}>
              <ExpertDot expertId={meta.expertId} />
              <Text>{meta.expertId.padEnd(10)}</Text>
              <Text>{String(findings.length).padEnd(3)} flagged</Text>
              <Text dimColor>{uniqueFindings.length} unique</Text>
              <Text dimColor>{meta.model}</Text>
              <Text dimColor>${meta.costUsd.toFixed(4)}</Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor>esc back</Text>
    </Box>
  );
}
