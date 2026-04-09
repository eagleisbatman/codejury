import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { ReviewPattern } from './types.js';
import type { ReviewPayload } from '../types/provider.js';
import { LEARNING_SCHEMA } from './episodic-schema.js';

export class PatternLibrary {
  constructor(private db: Database.Database) {
    this.db.exec(LEARNING_SCHEMA);
  }

  addPattern(pattern: Omit<ReviewPattern, 'id' | 'createdAt' | 'lastUsed' | 'timesApplied' | 'timesAccepted' | 'active'>): ReviewPattern {
    const id = nanoid();
    this.db.prepare(
      `INSERT INTO review_patterns (id, name, description, prompt_fragment, trigger_conditions_json, success_rate, expert_source, examples_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, pattern.name, pattern.description, pattern.promptFragment, JSON.stringify(pattern.triggerConditions), pattern.successRate, pattern.expertSource, JSON.stringify(pattern.examples));
    return { ...pattern, id, createdAt: new Date(), lastUsed: new Date(), timesApplied: 0, timesAccepted: 0, active: true };
  }

  getActivePatterns(): ReviewPattern[] {
    return (this.db.prepare('SELECT * FROM review_patterns WHERE active = 1').all() as Array<Record<string, unknown>>).map(this.rowToPattern);
  }

  matchPatterns(payload: ReviewPayload): ReviewPattern[] {
    const patterns = this.getActivePatterns();
    const filePaths = payload.files.map((f) => f.path);
    const languages = new Set(payload.files.map((f) => f.language));

    return patterns.filter((p) => {
      for (const trigger of p.triggerConditions) {
        if (trigger.type === 'language' && languages.has(trigger.value)) return true;
        if (trigger.type === 'file_glob') {
          try {
            const escaped = trigger.value
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*\*/g, '<<GLOBSTAR>>')
              .replace(/\*/g, '[^/]*')
              .replace(/\?/g, '[^/]')
              .replace(/<<GLOBSTAR>>/g, '.*');
            const regex = new RegExp(`^${escaped}$`);
            if (filePaths.some((fp) => regex.test(fp))) return true;
          } catch {
            // Skip invalid glob patterns from DB
          }
        }
        if (trigger.type === 'category') return true;
      }
      return false;
    });
  }

  recordApplication(patternId: string): void {
    this.db.prepare("UPDATE review_patterns SET times_applied = times_applied + 1, last_used = datetime('now') WHERE id = ?").run(patternId);
  }

  recordOutcome(patternId: string, accepted: boolean): void {
    if (accepted) {
      // Note: SQLite evaluates SET expressions using pre-update values,
      // so times_accepted + 1 in the success_rate calc accounts for the increment
      this.db.prepare(
        `UPDATE review_patterns SET
           times_accepted = times_accepted + 1,
           success_rate = CASE WHEN times_applied > 0 THEN (times_accepted + 1.0) / times_applied ELSE 1.0 END
         WHERE id = ?`,
      ).run(patternId);
    } else {
      this.db.prepare(
        `UPDATE review_patterns SET
           success_rate = CASE WHEN times_applied > 0 THEN times_accepted * 1.0 / times_applied ELSE 0.0 END
         WHERE id = ?`,
      ).run(patternId);
    }
  }

  deactivateStalePatterns(minApplied: number = 10, minSuccessRate: number = 0.3): number {
    return this.db.prepare('UPDATE review_patterns SET active = 0 WHERE times_applied >= ? AND success_rate < ? AND active = 1').run(minApplied, minSuccessRate).changes;
  }

  private rowToPattern(r: Record<string, unknown>): ReviewPattern {
    return {
      id: r['id'] as string, name: r['name'] as string, description: r['description'] as string,
      promptFragment: r['prompt_fragment'] as string,
      triggerConditions: JSON.parse(r['trigger_conditions_json'] as string),
      successRate: r['success_rate'] as number, expertSource: r['expert_source'] as string,
      examples: JSON.parse(r['examples_json'] as string),
      createdAt: new Date(r['created_at'] as string),
      lastUsed: r['last_used'] ? new Date(r['last_used'] as string) : new Date(r['created_at'] as string),
      timesApplied: r['times_applied'] as number, timesAccepted: r['times_accepted'] as number,
      active: (r['active'] as number) === 1,
    };
  }
}
