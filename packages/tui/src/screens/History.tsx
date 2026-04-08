import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { useHistory } from '../hooks/useHistory.js';

type SortMode = 'newest' | 'most_findings' | 'highest_cost';

interface HistoryProps {
  cwd: string;
  onSelectReview?: (reviewId: string) => void;
  onBack?: () => void;
}

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'date',
  most_findings: 'findings',
  highest_cost: 'cost',
};

export function History({ cwd, onSelectReview, onBack }: HistoryProps) {
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [selected, setSelected] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const VISIBLE_ROWS = 15;

  const { sessions, totalCost, loading } = useHistory(cwd);

  let filtered = sessions;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = sessions.filter(
      (s) => s.branch.toLowerCase().includes(q) || s.repo.toLowerCase().includes(q),
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'newest':
        return b.startedAt.getTime() - a.startedAt.getTime();
      case 'most_findings': {
        const aTotal = Object.values(a.findingCounts).reduce((s, c) => s + c, 0);
        const bTotal = Object.values(b.findingCounts).reduce((s, c) => s + c, 0);
        return bTotal - aTotal;
      }
      case 'highest_cost':
        return b.totalCostUsd - a.totalCostUsd;
    }
  });

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) { setSearchMode(false); setSearchQuery(''); }
      else if (key.return) { setSearchMode(false); }
      else if (key.backspace || key.delete) { setSearchQuery((q) => q.slice(0, -1)); }
      else if (input && !key.ctrl && input !== '?') { setSearchQuery((q) => q + input); }
      return;
    }

    if (input === 'j' || key.downArrow) {
      setSelected((s) => {
        const next = Math.min(s + 1, sorted.length - 1);
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
    if (key.return && sorted[selected]) onSelectReview?.(sorted[selected]!.reviewId);
    if (input === '/') setSearchMode(true);
    if (input === 's') setSortMode((m) => m === 'newest' ? 'most_findings' : m === 'most_findings' ? 'highest_cost' : 'newest');
    if (key.escape) onBack?.();
  });

  if (loading) return <Text dimColor>loading...</Text>;

  const verdictText = (v: string | undefined) =>
    v === 'approve' ? 'PASS' : v === 'request_changes' ? 'FAIL' : v ?? '—';
  const verdictColor = (v: string | undefined) =>
    v === 'approve' ? 'green' : v === 'request_changes' ? 'red' : undefined;

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        <Text bold>History</Text>
        <Text dimColor>sort: {SORT_LABELS[sortMode]}</Text>
        <Text dimColor>${totalCost.toFixed(2)} total</Text>
      </Box>

      {searchMode && (
        <Box>
          <Text dimColor>/</Text>
          <Text>{searchQuery}</Text>
          <Text>_</Text>
        </Box>
      )}

      {sorted.length === 0 ? (
        <Text dimColor>
          {searchQuery ? `No results for "${searchQuery}"` : 'No history. Run cj review first.'}
        </Text>
      ) : (
        <Box flexDirection="column">
          {scrollOffset > 0 && <Text dimColor>  ↑ {scrollOffset} more</Text>}
          {sorted.slice(scrollOffset, scrollOffset + VISIBLE_ROWS).map((s, i) => {
            const idx = scrollOffset + i;
            const sel = idx === selected;
            const fc = s.findingCounts;

            return (
              <Box key={s.reviewId} gap={1}>
                <Text bold={sel}>{sel ? '>' : ' '}</Text>
                <Text dimColor>{s.startedAt.toISOString().slice(5, 10)}</Text>
                <Text bold={sel}>{s.branch.slice(0, 22).padEnd(22)}</Text>
                <Text color={verdictColor(s.verdict)} bold={s.verdict === 'request_changes'}>
                  {verdictText(s.verdict).padEnd(5)}
                </Text>
                {fc.critical > 0 && <Text color="red">{fc.critical}C</Text>}
                {fc.error > 0 && <Text color="redBright">{fc.error}E</Text>}
                {fc.warning > 0 && <Text color="yellow">{fc.warning}W</Text>}
                {(fc.critical === 0 && fc.error === 0 && fc.warning === 0) && <Text dimColor>clean</Text>}
                <Text dimColor>${s.totalCostUsd.toFixed(4)}</Text>
              </Box>
            );
          })}
          {scrollOffset + VISIBLE_ROWS < sorted.length && (
            <Text dimColor>  ↓ {sorted.length - scrollOffset - VISIBLE_ROWS} more</Text>
          )}
        </Box>
      )}

      <Text dimColor>j/k navigate  enter open  / search  s sort  esc back</Text>
    </Box>
  );
}
