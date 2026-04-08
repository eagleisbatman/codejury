import { Box, Text, useApp, useInput } from 'ink';
import { useState, useEffect, useCallback } from 'react';
import { join } from 'node:path';
import type { MergedFinding, SynthesizedReport } from '@codejury/core';
import { ReviewRepository, PROJECT_DIR } from '@codejury/core';
import { Header } from './components/Header.js';
import { Dashboard } from './screens/Dashboard.js';
import { ReviewProgress } from './screens/ReviewProgress.js';
import { ReviewDetail } from './screens/ReviewDetail.js';
import { FindingInspector } from './screens/FindingInspector.js';
import { ExpertPanel } from './screens/ExpertPanel.js';
import { History } from './screens/History.js';
import { Config } from './screens/Config.js';
import { ConsensusMap } from './screens/ConsensusMap.js';
import { useLoadProject, ProjectContext } from './hooks/useProject.js';
import { useReview } from './hooks/useReview.js';

type Screen =
  | { type: 'dashboard' }
  | { type: 'review_progress' }
  | { type: 'review_detail'; report: SynthesizedReport }
  | { type: 'finding_inspector'; finding: MergedFinding; report: SynthesizedReport }
  | { type: 'consensus_map'; report: SynthesizedReport }
  | { type: 'expert_panel' }
  | { type: 'history' }
  | { type: 'config' };

const SCREEN_NAMES: Record<Screen['type'], string> = {
  dashboard: 'Dashboard',
  review_progress: 'Review',
  review_detail: 'Findings',
  finding_inspector: 'Inspector',
  consensus_map: 'Consensus',
  expert_panel: 'Experts',
  history: 'History',
  config: 'Config',
};

export default function App() {
  const cwd = process.cwd();
  const project = useLoadProject(cwd);
  const review = useReview(cwd, project.config);
  const { exit } = useApp();

  const [screen, setScreen] = useState<Screen>({ type: 'dashboard' });
  const [showHelp, setShowHelp] = useState(false);

  useInput((input) => {
    if (input === '?') {
      setShowHelp((h) => !h);
      return;
    }
    if (showHelp) { setShowHelp(false); return; }
    if (input === 'q' && screen.type === 'dashboard') exit();
    if (screen.type === 'dashboard') {
      if (input === '2') setScreen({ type: 'expert_panel' });
      if (input === '3') setScreen({ type: 'history' });
      if (input === '4') setScreen({ type: 'config' });
    }
  });

  const handleNewReview = useCallback(async () => {
    setScreen({ type: 'review_progress' });
    await review.startReview({ type: 'staged' });
  }, [review]);

  const loadReport = useCallback((reviewId: string) => {
    try {
      const db = new ReviewRepository(join(cwd, PROJECT_DIR, 'reviews.db'));
      const report = db.getReport(reviewId);
      db.close();
      if (report) {
        setScreen({ type: 'review_detail', report });
      }
    } catch {
      // DB not available
    }
  }, [cwd]);

  // Auto-navigate from progress to detail when review completes
  useEffect(() => {
    if (screen.type === 'review_progress' && review.report) {
      const timer = setTimeout(
        () => setScreen({ type: 'review_detail', report: review.report! }),
        1000,
      );
      return () => clearTimeout(timer);
    }
  }, [screen.type, review.report]);

  const experts = project.config.experts.enabled;
  const cost = review.report?.costBreakdown.totalCostUsd;

  return (
    <ProjectContext.Provider value={project}>
      <Box flexDirection="column" height="100%">
        <Header
          projectName={project.config.project.name || cwd.split('/').pop() || 'project'}
          activeScreen={SCREEN_NAMES[screen.type]}
          experts={experts}
          cost={cost}
        />

        <Box flexDirection="column" paddingX={1} paddingY={1} flexGrow={1}>
          {showHelp && (
            <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={2} paddingY={1}>
              <Text bold>Keyboard shortcuts</Text>
              <Text> </Text>
              <Text dimColor>Dashboard    j/k navigate  enter open  n new  2 experts  3 history  4 config  q quit</Text>
              <Text dimColor>Findings     j/k navigate  enter inspect  tab filter expert  m consensus  esc back</Text>
              <Text dimColor>Inspector    c copy fix  esc back</Text>
              <Text dimColor>History      j/k navigate  enter open  / search  s sort  esc back</Text>
              <Text dimColor>Experts      j/k navigate  t test  esc back</Text>
              <Text dimColor>Config       e open in $EDITOR  esc back</Text>
              <Text> </Text>
              <Text dimColor>press any key to dismiss</Text>
            </Box>
          )}

          {project.loading ? (
            <Text dimColor>loading config...</Text>
          ) : (
            <>
              {project.error && (
                <Text color="yellow" dimColor>config: {project.error} (using defaults)</Text>
              )}

              {screen.type === 'dashboard' && (
                <Dashboard
                  cwd={cwd}
                  onNewReview={handleNewReview}
                  onSelectReview={loadReport}
                />
              )}

              {screen.type === 'review_progress' && (
                <ReviewProgress
                  events={review.events}
                  report={review.report}
                  error={review.error}
                  onBack={() => setScreen({ type: 'dashboard' })}
                />
              )}

              {screen.type === 'review_detail' && (
                <ReviewDetail
                  report={screen.report}
                  onSelectFinding={(f) =>
                    setScreen({ type: 'finding_inspector', finding: f, report: screen.report })
                  }
                  onConsensus={() =>
                    setScreen({ type: 'consensus_map', report: screen.report })
                  }
                  onBack={() => setScreen({ type: 'dashboard' })}
                />
              )}

              {screen.type === 'finding_inspector' && (
                <FindingInspector
                  finding={screen.finding}
                  onBack={() => setScreen({ type: 'review_detail', report: screen.report })}
                />
              )}

              {screen.type === 'consensus_map' && (
                <ConsensusMap
                  report={screen.report}
                  onBack={() => setScreen({ type: 'review_detail', report: screen.report })}
                />
              )}

              {screen.type === 'expert_panel' && (
                <ExpertPanel
                  config={project.config}
                  onBack={() => setScreen({ type: 'dashboard' })}
                />
              )}

              {screen.type === 'history' && (
                <History
                  cwd={cwd}
                  onSelectReview={loadReport}
                  onBack={() => setScreen({ type: 'dashboard' })}
                />
              )}

              {screen.type === 'config' && (
                <Config
                  cwd={cwd}
                  config={project.config}
                  onBack={() => setScreen({ type: 'dashboard' })}
                />
              )}
            </>
          )}
        </Box>
      </Box>
    </ProjectContext.Provider>
  );
}
