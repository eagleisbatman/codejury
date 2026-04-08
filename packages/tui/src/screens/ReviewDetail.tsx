import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { SynthesizedReport, MergedFinding } from '@codejury/core';
import { SeverityBadge } from '../components/SeverityBadge.js';
import { ExpertDot } from '../components/ExpertDot.js';

interface ReviewDetailProps {
  report: SynthesizedReport;
  onSelectFinding?: (finding: MergedFinding) => void;
  onConsensus?: () => void;
  onBack?: () => void;
}

export function ReviewDetail({ report, onSelectFinding, onConsensus, onBack }: ReviewDetailProps) {
  const [selected, setSelected] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [expertFilter, setExpertFilter] = useState<string | null>(null);
  const VISIBLE_ROWS = 15;

  const allExperts = report.expertMetadata.map((m) => m.expertId);
  const displayFindings = expertFilter
    ? report.findings.filter((f) => f.contributingExperts.includes(expertFilter))
    : report.findings;

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) {
      setSelected((s) => {
        const next = Math.min(s + 1, displayFindings.length - 1);
        if (next >= scrollOffset + VISIBLE_ROWS) setScrollOffset(next - VISIBLE_ROWS + 1);
        return next;
      });
    }
    if (input === 'k' || key.upArrow) {
      setSelected((s) => {
        const next = Math.max(s - 1, 0);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
    }
    if (key.return && displayFindings[selected]) onSelectFinding?.(displayFindings[selected]!);
    if (key.tab) {
      if (expertFilter === null) {
        setExpertFilter(allExperts[0] ?? null);
      } else {
        const idx = allExperts.indexOf(expertFilter);
        setExpertFilter(idx < allExperts.length - 1 ? allExperts[idx + 1]! : null);
      }
      setSelected(0);
      setScrollOffset(0);
    }
    if (input === 'm') onConsensus?.();
    if (key.escape) onBack?.();
  });

  const sev = report.summary.bySeverity;
  const verdictColor = report.summary.verdict === 'approve' ? 'green'
    : report.summary.verdict === 'request_changes' ? 'red' : undefined;

  return (
    <Box flexDirection="column" gap={1}>
      {/* Header */}
      <Box gap={1}>
        <Text bold>{report.branch}</Text>
        <Text dimColor>·</Text>
        <Text color={verdictColor} bold>
          {report.summary.verdict === 'approve' ? 'PASS' : report.summary.verdict === 'request_changes' ? 'FAIL' : 'DISCUSS'}
        </Text>
        <Text dimColor>·</Text>
        <Text dimColor>{report.summary.totalFindings} findings</Text>
        <Text dimColor>· ${report.costBreakdown.totalCostUsd.toFixed(4)}</Text>
      </Box>

      {/* Severity summary — only show non-zero */}
      <Box gap={2}>
        {sev.critical > 0 && <Text color="red">{sev.critical} critical</Text>}
        {sev.error > 0 && <Text color="redBright">{sev.error} error</Text>}
        {sev.warning > 0 && <Text color="yellow">{sev.warning} warning</Text>}
        {sev.info > 0 && <Text>{sev.info} info</Text>}
        {sev.style > 0 && <Text dimColor>{sev.style} style</Text>}
      </Box>

      {/* Expert filter */}
      <Box gap={1}>
        <Text bold={expertFilter === null} underline={expertFilter === null}>all</Text>
        {allExperts.map((e) => (
          <Box key={e} gap={0}>
            <Text bold={expertFilter === e} underline={expertFilter === e}>{e}</Text>
          </Box>
        ))}
        {expertFilter && <Text dimColor>({displayFindings.length})</Text>}
        <Text dimColor>  tab to cycle</Text>
      </Box>

      {/* Findings list with scroll viewport */}
      <Box flexDirection="column">
        {displayFindings.length === 0 ? (
          <Text dimColor>
            {expertFilter ? `No findings from ${expertFilter}.` : 'No findings.'}
          </Text>
        ) : (
          <>
            {scrollOffset > 0 && <Text dimColor>  ↑ {scrollOffset} more above</Text>}
            {displayFindings.slice(scrollOffset, scrollOffset + VISIBLE_ROWS).map((f, i) => {
              const idx = scrollOffset + i;
              const sel = idx === selected;
              return (
                <Box key={f.id} gap={1}>
                  <Text bold={sel}>{sel ? '>' : ' '}</Text>
                  <SeverityBadge severity={f.severity} />
                  <Text bold={sel}>
                    {f.title.length > 48 ? f.title.slice(0, 47) + '…' : f.title.padEnd(48)}
                  </Text>
                  <Text dimColor>{(f.file_path.split('/').pop() ?? '') + ':' + f.line_start}</Text>
                  <Box gap={0}>
                    {f.contributingExperts.map((e) => <ExpertDot key={e} expertId={e} />)}
                  </Box>
                  <Text dimColor>{Math.round(f.agreementScore * 100)}%</Text>
                </Box>
              );
            })}
            {scrollOffset + VISIBLE_ROWS < displayFindings.length && (
              <Text dimColor>  ↓ {displayFindings.length - scrollOffset - VISIBLE_ROWS} more below</Text>
            )}
          </>
        )}
      </Box>

      <Text dimColor>j/k navigate  enter inspect  tab filter  m consensus  esc back</Text>
    </Box>
  );
}
