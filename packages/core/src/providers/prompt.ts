import type { ReviewPayload, ReviewOptions } from '../types/provider.js';
import type { Category } from '../types/finding.js';

const FINDING_SCHEMA_DESCRIPTION = `You MUST respond with a valid JSON array of finding objects. Each finding MUST have these fields:
{
  "id": "string (unique, e.g. F001)",
  "file_path": "string (relative path from repo root)",
  "line_start": number (first affected line),
  "line_end": number (last affected line),
  "severity": "critical" | "error" | "warning" | "info" | "style",
  "category": "security" | "correctness" | "performance" | "maintainability" | "style" | "test_coverage",
  "title": "string (max 120 chars, one-line summary)",
  "description": "string (detailed explanation with reasoning, markdown ok)",
  "suggested_fix": "string (concrete code fix) or null",
  "expert_id": "string (your expert ID, provided below)",
  "confidence": number (0.0 to 1.0, your confidence in this finding)
}

Respond ONLY with the JSON array. No markdown fences, no explanation outside the array.
If you find no issues, respond with an empty array: []`;

function formatFocusAreas(areas: Category[]): string {
  if (areas.length === 0) return '';
  return `\n\nFocus especially on: ${areas.join(', ')}. You may still report findings in other categories, but prioritize these areas.`;
}

function formatCustomRules(rules: string[]): string {
  if (rules.length === 0) return '';
  return `\n\nProject-specific review rules (MUST follow these):\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
}

export function buildSystemPrompt(expertId: string, options?: ReviewOptions): string {
  const focusAreas = options?.focusAreas ?? [];
  const customRules = options?.customRules ?? [];

  return `You are an expert code reviewer (ID: "${expertId}"). Your task is to review code changes and identify issues.

Review each code change carefully and produce findings for:
- Security vulnerabilities (SQL injection, XSS, auth issues, secrets exposure)
- Correctness bugs (race conditions, null references, off-by-one errors, logic errors)
- Performance issues (N+1 queries, unnecessary allocations, algorithmic complexity)
- Maintainability concerns (god functions, high coupling, missing abstractions)
- Style issues (naming, formatting, dead code)
- Test coverage gaps (untested code paths, missing edge case tests)

${FINDING_SCHEMA_DESCRIPTION}${formatFocusAreas(focusAreas)}${formatCustomRules(customRules)}`;
}

export function buildUserPrompt(payload: ReviewPayload): string {
  const fileSections = payload.files.map((file) => {
    const hunks = file.hunks
      .map((h) => {
        let section = `Lines ${h.startLine}-${h.endLine}:`;
        if (h.context.before) section += `\n[context before]\n${h.context.before}`;
        section += `\n[changes]\n${h.content}`;
        if (h.context.after) section += `\n[context after]\n${h.context.after}`;
        return section;
      })
      .join('\n\n');

    return `## ${file.path} (${file.language})\n+${file.additions} -${file.deletions}\n\n${hunks}`;
  });

  let prompt = `Review the following code changes in repository "${payload.repoName}" (branch: ${payload.branchName}).

${payload.totalAdditions} additions, ${payload.totalDeletions} deletions across ${payload.files.length} files.

${fileSections.join('\n\n---\n\n')}`;

  if (payload.directoryStructure) {
    prompt += `\n\n## Repository Structure\n${payload.directoryStructure}`;
  }

  return prompt;
}

export function buildAgenticSystemPrompt(expertId: string, options?: ReviewOptions): string {
  const focusAreas = options?.focusAreas ?? [];
  const customRules = options?.customRules ?? [];

  return `You are an expert code reviewer (ID: "${expertId}"). You have access to tools to explore the codebase.

Your workflow:
1. Read the diff to understand what changed
2. Use tools to explore surrounding code: read_file, grep, search_files, list_directory
3. Use git_blame and git_log to understand history of changed files
4. Use get_dependencies to trace imports when relevant
5. Call report_finding for EACH issue as you find it — do not batch findings
6. Read project memory (read_memory) to understand past patterns and codebase structure
7. Write observations (write_memory) about the codebase for future reviews
8. When done reviewing, stop calling tools

Review categories: security, correctness, performance, maintainability, style, test_coverage
Severity levels: critical, error, warning, info, style

Be thorough: follow imports, check related files, verify your findings against the actual code.
Be precise: include exact file paths, line numbers, and concrete suggested fixes.${formatFocusAreas(focusAreas)}${formatCustomRules(customRules)}`;
}

export function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English/code
  return Math.ceil(text.length / 4);
}
