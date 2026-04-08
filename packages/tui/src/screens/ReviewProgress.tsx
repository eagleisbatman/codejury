import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { ReviewEvent, SynthesizedReport, Finding } from '@codejury/core';
import { ExpertDot } from '../components/ExpertDot.js';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { ProgressBar } from '../components/ProgressBar.js';

interface ReviewProgressProps {
  events: ReviewEvent[];
  report: SynthesizedReport | null;
  error?: string;
  onBack?: () => void;
}

export function ReviewProgress({ events, report, error, onBack }: ReviewProgressProps) {
  useInput((_input, key) => {
    if (key.escape) onBack?.();
  });

  const expertStatuses = new Map<string, {
    status: 'running' | 'done' | 'failed';
    findings?: number;
    cost?: number;
    durationMs?: number;
    error?: string;
  }>();
  const streamedFindings: Array<{ expertId: string; finding: Finding }> = [];

  for (const event of events) {
    switch (event.type) {
      case 'expert_started':
        expertStatuses.set(event.expertId, { status: 'running' });
        break;
      case 'expert_finding':
        streamedFindings.push({ expertId: event.expertId, finding: event.finding });
        break;
      case 'expert_completed':
        expertStatuses.set(event.expertId, {
          status: 'done',
          findings: event.meta.validFindings,
          cost: event.meta.costUsd,
          durationMs: event.meta.durationMs,
        });
        break;
      case 'expert_failed':
        expertStatuses.set(event.expertId, { status: 'failed', error: event.error.message });
        break;
    }
  }

  const synthesisStarted = events.some((e) => e.type === 'synthesis_started');
  const totalExperts = expertStatuses.size;
  const doneExperts = Array.from(expertStatuses.values()).filter((s) => s.status === 'done').length;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Review in progress</Text>

      {expertStatuses.size === 0 && !report && !error && (
        <Box gap={1}>
          <Spinner type="dots" />
          <Text dimColor>dispatching to expert panel...</Text>
        </Box>
      )}

      {/* Expert status rows with progress bars */}
      <Box flexDirection="column">
        {Array.from(expertStatuses.entries()).map(([id, status]) => (
          <Box key={id} gap={1}>
            <ExpertDot expertId={id} active={status.status !== 'failed'} />
            <Text>{id.padEnd(10)}</Text>
            <ProgressBar
              value={status.status === 'done' ? 1 : status.status === 'running' ? 0.5 : 0}
              width={12}
              done={status.status === 'done'}
              failed={status.status === 'failed'}
            />
            {status.status === 'running' && (
              <>
                <Spinner type="dots" />
                <Text dimColor> reviewing...</Text>
              </>
            )}
            {status.status === 'done' && (
              <Text>
                {' '}{status.findings} findings
                <Text dimColor> {((status.durationMs ?? 0) / 1000).toFixed(1)}s ${status.cost?.toFixed(4)}</Text>
              </Text>
            )}
            {status.status === 'failed' && (
              <Text color="red"> failed: {status.error}</Text>
            )}
          </Box>
        ))}
      </Box>

      {/* Live finding stream */}
      {streamedFindings.length > 0 && !report && (
        <Box flexDirection="column">
          <Text dimColor>--- findings ({streamedFindings.length}) ---</Text>
          {streamedFindings.slice(-6).map((sf, i) => (
            <Box key={i} gap={1}>
              <ExpertDot expertId={sf.expertId} />
              <SeverityBadge severity={sf.finding.severity} />
              <Text>{sf.finding.title.length > 55 ? sf.finding.title.slice(0, 54) + '…' : sf.finding.title}</Text>
            </Box>
          ))}
          {streamedFindings.length > 6 && (
            <Text dimColor>  +{streamedFindings.length - 6} more</Text>
          )}
        </Box>
      )}

      {synthesisStarted && !report && (
        <Box gap={1}>
          <Spinner type="dots" />
          <Text>synthesizing {streamedFindings.length} findings from {doneExperts}/{totalExperts} experts...</Text>
        </Box>
      )}

      {report && (
        <Box flexDirection="column">
          <Text bold>
            Done: {streamedFindings.length} raw → {report.summary.totalFindings} deduplicated
          </Text>
          <Box gap={1}>
            <Text>Verdict:</Text>
            <Text color={report.summary.verdict === 'approve' ? 'green' : report.summary.verdict === 'request_changes' ? 'red' : undefined} bold>
              {report.summary.verdict === 'approve' ? 'PASS' : report.summary.verdict === 'request_changes' ? 'FAIL' : 'DISCUSS'}
            </Text>
          </Box>
        </Box>
      )}

      {error && (
        <Box flexDirection="column">
          <Text color="red" bold>Review failed</Text>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Text dimColor>esc back</Text>
    </Box>
  );
}
