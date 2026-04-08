import { Box, Text, useInput } from 'ink';
import { useState, useEffect } from 'react';
import { join } from 'node:path';
import {
  ReviewRepository,
  PROJECT_DIR,
  discoverAvailableProviders,
  DEFAULT_CONFIG,
  type ReviewSession,
  type ProviderDiscovery,
} from '@codejury/core';
import { ExpertDot } from '../components/ExpertDot.js';

interface DashboardProps {
  cwd: string;
  onSelectReview?: (reviewId: string) => void;
  onNewReview?: () => void;
}

export function Dashboard({ cwd, onSelectReview, onNewReview }: DashboardProps) {
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [selected, setSelected] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [expertHealth, setExpertHealth] = useState<ProviderDiscovery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const db = new ReviewRepository(join(cwd, PROJECT_DIR, 'reviews.db'));
      setSessions(db.listSessions({ limit: 15 }));
      setTotalCost(db.getTotalCost());
      db.close();
    } catch {
      // No DB yet
    }
    setLoading(false);

    discoverAvailableProviders({
      claude: DEFAULT_CONFIG.experts.claude,
      gemini: DEFAULT_CONFIG.experts.gemini,
      openai: DEFAULT_CONFIG.experts.openai,
      ollama: DEFAULT_CONFIG.experts.ollama,
    }).then(setExpertHealth).catch(() => {});
  }, [cwd]);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) setSelected((s) => Math.min(s + 1, sessions.length - 1));
    if (input === 'k' || key.upArrow) setSelected((s) => Math.max(s - 1, 0));
    if (key.return && sessions[selected]) onSelectReview?.(sessions[selected]!.reviewId);
    if (input === 'n') onNewReview?.();
  });

  const verdictText = (v: string | undefined) =>
    v === 'approve' ? 'PASS' : v === 'request_changes' ? 'FAIL' : v ?? '—';
  const verdictColor = (v: string | undefined) =>
    v === 'approve' ? 'green' : v === 'request_changes' ? 'red' : undefined;

  return (
    <Box flexDirection="column" gap={1}>
      {/* Expert panel status */}
      {expertHealth.length > 0 && (
        <Box gap={2}>
          <Text dimColor>panel</Text>
          {expertHealth.map((e) => (
            <Box key={e.id} gap={0}>
              <ExpertDot expertId={e.id} active={e.available} />
              <Text dimColor={!e.available}> {e.id}</Text>
              {!e.available && <Text color="red"> ✗</Text>}
            </Box>
          ))}
          <Text dimColor>  cost: ${totalCost.toFixed(2)}</Text>
        </Box>
      )}

      <Text bold>Reviews</Text>

      {loading ? (
        <Text dimColor>loading...</Text>
      ) : sessions.length === 0 ? (
        <Text dimColor>No reviews yet. Press n to start.</Text>
      ) : (
        <Box flexDirection="column">
          {sessions.map((s, i) => {
            const sel = i === selected;
            const fc = s.findingCounts;
            return (
              <Box key={s.reviewId} gap={1}>
                <Text>{sel ? '>' : ' '}</Text>
                <Text dimColor>{s.startedAt.toISOString().slice(5, 10)}</Text>
                <Text>{s.branch.slice(0, 24).padEnd(24)}</Text>
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
        </Box>
      )}

      <Text dimColor>j/k navigate  enter open  n new review  2 experts  3 history  4 config  q quit</Text>
    </Box>
  );
}
