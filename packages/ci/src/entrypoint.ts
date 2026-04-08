import { loadConfig, runReview, formatReport, type GitScope, type OutputFormat } from '@codejury/core';

export async function entrypoint(options: {
  cwd: string;
  scope: GitScope;
  format: OutputFormat;
  experts?: string[];
}): Promise<{ output: string; exitCode: number }> {
  const configResult = await loadConfig(options.cwd);
  if (!configResult.ok) {
    return { output: `Config error: ${configResult.error.message}`, exitCode: 2 };
  }

  try {
    const gen = runReview(options.cwd, options.scope, configResult.value, {
      experts: options.experts,
    });

    let result = await gen.next();
    while (!result.done) {
      result = await gen.next();
    }

    const report = result.value;
    const output = formatReport(report, options.format);
    const exitCode = report.summary.verdict === 'request_changes' ? 1 : 0;

    return { output, exitCode };
  } catch (e) {
    return {
      output: `Review failed: ${e instanceof Error ? e.message : String(e)}`,
      exitCode: 2,
    };
  }
}
