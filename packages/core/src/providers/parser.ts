import { findingSchema, type Finding } from '../types/finding.js';

/**
 * Incrementally extracts complete JSON objects from an accumulating text stream.
 * Handles the common pattern of AI models returning a JSON array of findings.
 *
 * Strategy: find the outermost [...] array, then extract individual {...} objects
 * as they become complete (balanced braces).
 */
export function extractFindings(
  text: string,
  expertId: string,
): { findings: Finding[]; warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];

  // Strip markdown fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  cleaned = cleaned.trim();

  // Try to parse as a complete JSON array
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract array from within the text
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      if (cleaned.length > 0) {
        warnings.push('Could not find JSON array in response');
      }
      return { findings, warnings };
    }
    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      warnings.push('Found array-like structure but could not parse as JSON');
      return { findings, warnings };
    }
  }

  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? [parsed]
      : (() => { warnings.push('Response is not an array or object'); return null; })() ?? [];

  if (items.length === 0 && warnings.length > 0) {
    return { findings, warnings };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // Inject expert_id if missing
    if (item && typeof item === 'object' && !('expert_id' in item)) {
      (item as Record<string, unknown>).expert_id = expertId;
    }
    const result = findingSchema.safeParse(item);
    if (result.success) {
      findings.push(result.data);
    } else {
      const title = item && typeof item === 'object' && 'title' in item
        ? String((item as Record<string, unknown>).title)
        : `item ${i}`;
      warnings.push(`Skipped invalid finding "${title}": ${result.error.message}`);
    }
  }

  return { findings, warnings };
}
