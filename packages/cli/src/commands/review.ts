import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFile } from 'node:fs/promises';
import { loadConfig, runReview, formatReport, type GitScope, type OutputFormat } from '@codejury/core';

export const reviewCommand = new Command('review')
  .description('Run a code review (defaults to staged changes)')
  .option('--branch <name>', 'Review branch diff vs default branch')
  .option('--diff <range>', 'Review a commit range (e.g., HEAD~3..HEAD)')
  .option('--pr <url>', 'Review a pull request by URL')
  .option('--files <paths...>', 'Review specific files')
  .option('--experts <ids>', 'Comma-separated expert IDs to use')
  .option('-f, --format <format>', 'Output format: json, markdown, sarif, html, github', 'markdown')
  .option('-o, --output <file>', 'Write report to a file instead of stdout')
  .addHelpText('after', `
Exit codes:
  0   Review passed (verdict: approve)
  1   Review failed (verdict: request_changes)
  2   Runtime error (config, network, etc.)

Examples:
  $ cj review                          Review staged changes
  $ cj review --branch feature/auth    Review branch diff vs main
  $ cj review --pr https://github.com/org/repo/pull/42
  $ cj review --diff HEAD~3..HEAD --format html -o report.html`)
  .action(async (opts) => {
    const cwd = process.cwd();

    // Load config
    const configResult = await loadConfig(cwd);
    if (!configResult.ok) {
      console.error(chalk.red(`Config error: ${configResult.error.message}`));
      console.error(chalk.dim('Run `cj init` to set up a project, or `cj config edit` to fix your config.'));
      process.exit(2);
    }
    const config = configResult.value;

    // Resolve scope
    let scope: GitScope;
    if (opts.branch) {
      scope = { type: 'branch', name: opts.branch };
    } else if (opts.diff) {
      const [from, to] = opts.diff.split('..');
      if (!from || !to) {
        console.error(chalk.red('--diff requires format: FROM..TO (e.g., HEAD~3..HEAD)'));
        process.exit(2);
      }
      scope = { type: 'commit_range', from, to };
    } else if (opts.pr) {
      const url = opts.pr as string;
      const forge = url.includes('github.com') ? 'github' as const : 'gitlab' as const;
      scope = { type: 'pr', url, forge };
    } else if (opts.files) {
      scope = { type: 'files', paths: opts.files };
    } else {
      scope = { type: 'staged' };
    }

    const format = (opts.format as OutputFormat) ?? config.output.default_format;
    const expertIds = opts.experts ? (opts.experts as string).split(',') : undefined;

    // Use stderr for progress so stdout stays clean for piping
    const spinner = ora({ stream: process.stderr }).start('Starting review...');
    let hasRequestChanges = false;
    let findingsInProgress = 0;
    const startTime = Date.now();

    try {
      const gen = runReview(cwd, scope, config, { experts: expertIds });
      let result = await gen.next();

      while (!result.done) {
        const event = result.value;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        switch (event.type) {
          case 'review_started':
            spinner.text = `Dispatching to ${event.experts.length} experts: ${event.experts.join(', ')}`;
            break;
          case 'expert_started':
            spinner.text = `[${elapsed}s] ${event.expertId} reviewing...`;
            break;
          case 'expert_finding':
            findingsInProgress++;
            spinner.text = `[${elapsed}s] ${event.expertId} reviewing... (${findingsInProgress} findings so far)`;
            break;
          case 'expert_completed': {
            const duration = (event.meta.durationMs / 1000).toFixed(1);
            spinner.succeed(`${event.expertId}: ${event.meta.validFindings} findings in ${duration}s ($${event.meta.costUsd.toFixed(4)})`);
            spinner.start();
            break;
          }
          case 'expert_failed':
            spinner.warn(`${event.expertId}: failed -- ${event.error.message}`);
            spinner.start();
            break;
          case 'synthesis_started':
            spinner.text = `[${elapsed}s] Synthesizing findings...`;
            break;
          case 'synthesis_complete': {
            const sev = event.report.summary.bySeverity;
            const parts: string[] = [];
            if (sev.critical) parts.push(chalk.red(`${sev.critical} critical`));
            if (sev.error) parts.push(chalk.hex('#F97316')(`${sev.error} error`));
            if (sev.warning) parts.push(chalk.hex('#EAB308')(`${sev.warning} warning`));
            if (sev.info) parts.push(chalk.blue(`${sev.info} info`));
            if (sev.style) parts.push(chalk.gray(`${sev.style} style`));
            const cost = `$${event.report.costBreakdown.totalCostUsd.toFixed(4)}`;
            spinner.succeed(`Synthesis complete: ${event.report.summary.totalFindings} findings (${parts.join(', ')}) -- ${cost}`);
            hasRequestChanges = event.report.summary.verdict === 'request_changes';
            break;
          }
        }
        result = await gen.next();
      }

      const report = result.value;
      const output = formatReport(report, format);

      // Write to file or stdout
      if (opts.output) {
        await writeFile(opts.output as string, output);
        process.stderr.write(chalk.green(`\nReport written to ${opts.output}\n`));
      } else {
        console.log(output);
      }

      // Exit code: 0 = approve, 1 = request_changes
      process.exit(hasRequestChanges ? 1 : 0);
    } catch (e) {
      spinner.fail(e instanceof Error ? e.message : String(e));
      process.exit(2);
    }
  });
