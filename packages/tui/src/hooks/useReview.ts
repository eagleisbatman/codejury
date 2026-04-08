import { useState, useCallback } from 'react';
import {
  runReview,
  type GitScope,
  type ProjectConfig,
  type ReviewEvent,
  type SynthesizedReport,
} from '@codejury/core';

interface ReviewState {
  running: boolean;
  events: ReviewEvent[];
  report: SynthesizedReport | null;
  error?: string;
}

export function useReview(cwd: string, config: ProjectConfig) {
  const [state, setState] = useState<ReviewState>({
    running: false,
    events: [],
    report: null,
  });

  const startReview = useCallback(
    async (scope: GitScope) => {
      setState({ running: true, events: [], report: null });

      try {
        const gen = runReview(cwd, scope, config);
        let result = await gen.next();

        while (!result.done) {
          const event = result.value;
          setState((prev) => ({
            ...prev,
            events: [...prev.events, event],
          }));
          result = await gen.next();
        }

        setState((prev) => ({
          ...prev,
          running: false,
          report: result.value,
        }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          running: false,
          error: e instanceof Error ? e.message : String(e),
        }));
      }
    },
    [cwd, config],
  );

  return { ...state, startReview };
}
