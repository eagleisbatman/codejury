import { useState, useEffect } from 'react';
import { join } from 'node:path';
import { ReviewRepository, PROJECT_DIR, type ReviewSession, type Severity } from '@codejury/core';

interface HistoryState {
  sessions: ReviewSession[];
  totalCost: number;
  loading: boolean;
}

export function useHistory(
  cwd: string,
  filters?: { since?: Date; branch?: string; severity?: Severity },
) {
  const [state, setState] = useState<HistoryState>({
    sessions: [],
    totalCost: 0,
    loading: true,
  });

  useEffect(() => {
    try {
      const db = new ReviewRepository(join(cwd, PROJECT_DIR, 'reviews.db'));
      const sessions = db.listSessions({
        limit: 50,
        since: filters?.since,
        branch: filters?.branch,
      });
      const totalCost = db.getTotalCost();
      db.close();
      setState({ sessions, totalCost, loading: false });
    } catch {
      setState({ sessions: [], totalCost: 0, loading: false });
    }
  }, [cwd, filters?.since?.getTime(), filters?.branch]);

  return state;
}
