import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import clipboardy from 'clipboardy';
import type { MergedFinding } from '@codejury/core';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { ExpertDot } from '../components/ExpertDot.js';

interface FindingInspectorProps {
  finding: MergedFinding;
  onBack?: () => void;
}

export function FindingInspector({ finding, onBack }: FindingInspectorProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useInput((input, key) => {
    if (key.escape) onBack?.();
    if (input === 'c' && finding.suggested_fix) {
      try {
        clipboardy.writeSync(finding.suggested_fix);
        setCopied(true);
        setCopyError(false);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopyError(true);
        setTimeout(() => setCopyError(false), 3000);
      }
    }
  });

  const agreementColor = finding.agreementScore === 1 ? 'green'
    : finding.agreementScore > 0.5 ? 'yellow' : 'red';

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        <SeverityBadge severity={finding.severity} />
        <Text bold>{finding.title}</Text>
      </Box>

      <Box gap={2}>
        <Text dimColor>{finding.file_path}:{finding.line_start}-{finding.line_end}</Text>
        <Text dimColor>{finding.category}</Text>
        <Text color={agreementColor}>{Math.round(finding.agreementScore * 100)}% {finding.consensusStatus}</Text>
      </Box>

      <Box gap={1}>
        <Text dimColor>experts:</Text>
        {finding.contributingExperts.map((e) => (
          <Box key={e} gap={0}>
            <ExpertDot expertId={e} />
            <Text dimColor> {e}</Text>
          </Box>
        ))}
      </Box>

      <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
        <Text>{finding.description}</Text>
      </Box>

      {finding.suggested_fix && (
        <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text bold>Suggested fix</Text>
            {copied ? <Text color="green">copied!</Text>
              : copyError ? <Text color="red">copy failed</Text>
              : <Text dimColor>c to copy</Text>}
          </Box>
          <Text>{finding.suggested_fix}</Text>
        </Box>
      )}

      {finding.dissentingOpinions.length > 0 && (
        <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
          <Text color="yellow">Dissent</Text>
          {finding.dissentingOpinions.map((d, i) => (
            <Box key={i} flexDirection="column">
              <Text bold>{d.expertId} <Text dimColor>({d.severity}/{d.category})</Text></Text>
              <Text>{d.reasoning.length > 300 ? d.reasoning.slice(0, 299) + '…' : d.reasoning}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box gap={1}>
        <Text dimColor>votes:</Text>
        {Object.entries(finding.severityVotes).map(([expert, sev]) => (
          <Text key={expert} dimColor>{expert}={sev}</Text>
        ))}
      </Box>

      <Text dimColor>c copy fix  esc back</Text>
    </Box>
  );
}
