import { nanoid } from 'nanoid';
import { findingSchema, type Finding } from '../../types/finding.js';
import type { ToolHandler } from '../types.js';

export function reportFindingTool(findings: Finding[], expertId: string): ToolHandler {
  return async (args) => {
    const raw = {
      id: nanoid(),
      file_path: args['file_path'],
      line_start: args['line_start'],
      line_end: args['line_end'],
      severity: args['severity'],
      category: args['category'],
      title: args['title'],
      description: args['description'],
      suggested_fix: args['suggested_fix'] ?? null,
      expert_id: expertId,
      confidence: args['confidence'],
    };

    const result = findingSchema.safeParse(raw);
    if (!result.success) {
      return `Validation error: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
    }

    findings.push(result.data);
    return `Finding reported: [${result.data.severity}] ${result.data.title} (${result.data.file_path}:${result.data.line_start})`;
  };
}
