import { z } from 'zod';

export const severityEnum = z.enum(['critical', 'error', 'warning', 'info', 'style']);
export type Severity = z.infer<typeof severityEnum>;

export const categoryEnum = z.enum([
  'security',
  'correctness',
  'performance',
  'maintainability',
  'style',
  'test_coverage',
]);
export type Category = z.infer<typeof categoryEnum>;

export const findingSchema = z.object({
  id: z.string(),
  file_path: z.string(),
  line_start: z.number().int().nonnegative(),
  line_end: z.number().int().nonnegative(),
  severity: severityEnum,
  category: categoryEnum,
  title: z.string().max(120),
  description: z.string(),
  suggested_fix: z.string().nullable().default(null),
  expert_id: z.string(),
  confidence: z.number().min(0).max(1),
});

export type Finding = z.infer<typeof findingSchema>;

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  info: 1,
  style: 0,
};

export const CATEGORY_PRIORITY: Record<Category, number> = {
  security: 5,
  correctness: 4,
  performance: 3,
  maintainability: 2,
  test_coverage: 1,
  style: 0,
};

export interface DissentingOpinion {
  expertId: string;
  severity: Severity;
  category: Category;
  reasoning: string;
}

export interface MergedFinding extends Finding {
  agreementScore: number;
  consensusStatus: 'unanimous' | 'majority' | 'split';
  contributingExperts: string[];
  severityVotes: Record<string, Severity>;
  categoryVotes: Record<string, Category>;
  dissentingOpinions: DissentingOpinion[];
}
