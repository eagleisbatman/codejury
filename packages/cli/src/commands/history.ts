import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { join } from 'node:path';
import { ReviewRepository, PROJECT_DIR, type Severity } from '@codejury/core';

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
  critical: chalk.red,
  error: chalk.hex('#F97316'),
  warning: chalk.hex('#EAB308'),
  info: chalk.blue,
  style: chalk.gray,
};

export const historyCommand = new Command('history')
  .description('List past review sessions')
  .option('--since <duration>', 'Filter by time (e.g., 7d, 24h, 30m)')
  .option('--branch <name>', 'Filter by branch name')
  .option('--limit <n>', 'Max number of results', '20')
  .addHelpText('after', `
Examples:
  $ cj history                     Show last 20 reviews
  $ cj history --since 7d          Reviews from the last week
  $ cj history --branch main       Reviews targeting main`)
  .action(async (opts) => {
    const cwd = process.cwd();
    const dbPath = join(cwd, PROJECT_DIR, 'reviews.db');

    let db: ReviewRepository;
    try {
      db = new ReviewRepository(dbPath);
    } catch {
      console.log(chalk.yellow('No review history found. Run `cj review` first.'));
      return;
    }

    let since: Date | undefined;
    if (opts.since) {
      const match = (opts.since as string).match(/^(\d+)(d|h|m)$/);
      if (match) {
        const amount = parseInt(match[1]!, 10);
        const unit = match[2]!;
        const ms = unit === 'd' ? amount * 86400000 : unit === 'h' ? amount * 3600000 : amount * 60000;
        since = new Date(Date.now() - ms);
      } else {
        console.error(chalk.red(`Invalid --since format: "${opts.since}". Use a number followed by d, h, or m (e.g., 7d, 24h, 30m).`));
        process.exit(2);
      }
    }

    const sessions = db.listSessions({
      since,
      branch: opts.branch as string | undefined,
      limit: parseInt(opts.limit as string, 10),
    });

    db.close();

    if (sessions.length === 0) {
      console.log(chalk.dim('No reviews found matching criteria.'));
      return;
    }

    const table = new Table({
      head: ['Date', 'Branch', 'Verdict', 'Crit', 'Err', 'Warn', 'Info', 'Style', 'Cost'],
      style: { head: ['cyan'] },
    });

    for (const s of sessions) {
      const date = s.startedAt.toISOString().slice(0, 16).replace('T', ' ');
      const verdictColor = s.verdict === 'approve' ? chalk.green : s.verdict === 'request_changes' ? chalk.red : chalk.yellow;

      const sevCell = (sev: Severity) =>
        s.findingCounts[sev] > 0 ? SEVERITY_COLORS[sev](String(s.findingCounts[sev])) : chalk.dim('0');

      table.push([
        chalk.dim(date),
        s.branch,
        verdictColor(s.verdict ?? 'unknown'),
        sevCell('critical'),
        sevCell('error'),
        sevCell('warning'),
        sevCell('info'),
        sevCell('style'),
        `$${s.totalCostUsd.toFixed(4)}`,
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim(`\n${sessions.length} review(s) · Total cost: $${sessions.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(4)}`));
  });
