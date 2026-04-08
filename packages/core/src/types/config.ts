import { z } from 'zod';
import { severityEnum, categoryEnum } from './finding.js';

const expertConfigSchema = z.object({
  model: z.string(),
  timeout: z.number().int().positive().default(120),
  max_tokens: z.number().int().positive().default(8192),
  focus: z.array(categoryEnum).default([]),
  enabled: z.boolean().default(true),
});

export type ExpertConfig = z.infer<typeof expertConfigSchema>;

const synthesisStrategyEnum = z.enum(['full_panel', 'routed', 'cascading']);
export type SynthesisStrategy = z.infer<typeof synthesisStrategyEnum>;

const outputFormatEnum = z.enum(['json', 'markdown', 'sarif', 'html', 'github']);
export type OutputFormat = z.infer<typeof outputFormatEnum>;

export const projectConfigSchema = z.object({
  project: z
    .object({
      name: z.string().default(''),
      default_branch: z.string().default('main'),
    })
    .default({}),

  experts: z
    .object({
      enabled: z.array(z.string()).default(['claude', 'gemini', 'ollama']),
      claude: expertConfigSchema
        .default({
          model: 'claude-sonnet-4-20250514',
          timeout: 120,
          max_tokens: 8192,
          focus: ['security', 'maintainability'],
          enabled: true,
        }),
      gemini: expertConfigSchema
        .default({
          model: 'gemini-2.5-pro',
          timeout: 90,
          max_tokens: 8192,
          focus: ['performance', 'correctness'],
          enabled: true,
        }),
      openai: expertConfigSchema
        .default({
          model: 'codex-mini',
          timeout: 90,
          max_tokens: 8192,
          focus: ['correctness', 'test_coverage'],
          enabled: true,
        }),
      ollama: expertConfigSchema
        .default({
          model: 'qwen2.5-coder:32b',
          timeout: 60,
          max_tokens: 4096,
          focus: ['correctness', 'style'],
          enabled: true,
        }),
    })
    .default({}),

  synthesis: z
    .object({
      strategy: synthesisStrategyEnum.default('full_panel'),
      synthesizer: z.string().default('claude'),
      dedup_threshold: z.number().min(0).max(1).default(0.75),
    })
    .default({}),

  output: z
    .object({
      default_format: outputFormatEnum.default('markdown'),
      severity_threshold: severityEnum.default('info'),
      auto_comment: z.boolean().default(false),
    })
    .default({}),

  cost: z
    .object({
      budget_per_review: z.number().nonnegative().default(0.5),
      budget_monthly: z.number().nonnegative().default(20),
      prefer_free_tier: z.boolean().default(true),
    })
    .default({}),

  rules: z
    .object({
      custom_rules: z.array(z.string()).default([]),
    })
    .default({}),

  ci: z
    .object({
      fail_on_severity: severityEnum.default('critical'),
      max_review_time_seconds: z.number().int().positive().default(300),
      github_token_env: z.string().default('GITHUB_TOKEN'),
    })
    .default({}),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const DEFAULT_CONFIG: ProjectConfig = projectConfigSchema.parse({});
