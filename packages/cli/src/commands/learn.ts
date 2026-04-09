import { Command } from 'commander';
import chalk from 'chalk';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  PROJECT_DIR,
  EpisodicStore,
  FeedbackStore,
  CalibrationEngine,
  PatternLibrary,
  shouldCompress,
  runCompression,
  DEFAULT_COMPRESSION_CONFIG,
} from '@codejury/core';
import { getProjectDir } from '../project-dir.js';

const learnStatusCommand = new Command('status')
  .description('Show learning system status')
  .action(async () => {
    const cwd = getProjectDir();
    const dbPath = join(cwd, PROJECT_DIR, 'reviews.db');

    let db: Database.Database;
    try {
      db = new Database(dbPath);
    } catch {
      console.log(chalk.dim('No review data yet. Run cj review first.'));
      return;
    }

    try {
      const episodic = new EpisodicStore(db);
      const feedback = new FeedbackStore(db);
      const calibration = new CalibrationEngine(db);
      const patterns = new PatternLibrary(db);

      const uncompressed = episodic.getUncompressedCount();
      const stats = feedback.getFeedbackStats();
      const entries = calibration.getAllEntries();
      const activePatterns = patterns.getActivePatterns();

      console.log(chalk.bold('\n  Learning System Status\n'));

      console.log(`  Episodes     ${uncompressed} uncompressed`);
      console.log(`  Feedback     ${stats.totalAccepted} accepted / ${stats.totalDismissed} dismissed / ${stats.totalIgnored} ignored`);
      console.log(`  Calibration  ${entries.length} entries tracked`);
      console.log(`  Patterns     ${activePatterns.length} active`);
      console.log(`  Compression  ${shouldCompress(db, DEFAULT_COMPRESSION_CONFIG.episodeThreshold) ? chalk.yellow('ready') : chalk.dim('not needed')}`);

      if (activePatterns.length > 0) {
        console.log(chalk.bold('\n  Active Patterns'));
        for (const p of activePatterns) {
          console.log(`    ${p.name.padEnd(30)} ${Math.round(p.successRate * 100)}% success  ${p.timesApplied} applied  by ${p.expertSource}`);
        }
      }

      if (entries.length > 0) {
        console.log(chalk.bold('\n  Calibration'));
        for (const e of entries.slice(0, 10)) {
          const bar = e.confidenceMultiplier > 1 ? chalk.green('↑') : e.confidenceMultiplier < 0.5 ? chalk.red('↓') : ' ';
          console.log(`    ${bar} ${e.expertId.padEnd(10)} ${e.category.padEnd(16)} ${e.severity.padEnd(10)} ${e.confidenceMultiplier.toFixed(2)} (${e.totalFindings} samples)`);
        }
      }

      console.log('');
    } finally {
      db.close();
    }
  });

const learnCompressCommand = new Command('compress')
  .description('Force compression of episodic data')
  .action(async () => {
    const cwd = getProjectDir();
    const dbPath = join(cwd, PROJECT_DIR, 'reviews.db');

    let db: Database.Database;
    try {
      db = new Database(dbPath);
    } catch {
      console.log(chalk.dim('No review data.'));
      return;
    }

    try {
      console.log(chalk.dim('  Running compression...'));
      const result = await runCompression(db);
      console.log(`  ${chalk.green('✓')} ${result.episodesCompressed} episodes compressed`);
      console.log(`  ${chalk.green('✓')} ${result.observationsCreated} observations extracted`);
      console.log(`  ${chalk.green('✓')} ${result.patternsDiscovered} patterns discovered`);
    } finally {
      db.close();
    }
  });

const learnResetCommand = new Command('reset')
  .description('Reset all learning data (keeps review history)')
  .action(async () => {
    const cwd = getProjectDir();
    const dbPath = join(cwd, PROJECT_DIR, 'reviews.db');

    let db: Database.Database;
    try {
      db = new Database(dbPath);
    } catch {
      console.log(chalk.dim('Nothing to reset.'));
      return;
    }

    try {
      db.prepare('DELETE FROM finding_feedback').run();
      db.prepare('DELETE FROM trajectories').run();
      db.prepare('DELETE FROM reflections').run();
      db.prepare('DELETE FROM review_patterns').run();
      db.prepare('DELETE FROM calibration_entries').run();
      db.prepare('DELETE FROM compressed_observations').run();
      console.log(chalk.green('  ✓ Learning data reset.'));
    } finally {
      db.close();
    }
  });

export const learnCommand = new Command('learn')
  .description('Manage the self-improving learning system')
  .addCommand(learnStatusCommand)
  .addCommand(learnCompressCommand)
  .addCommand(learnResetCommand)
  .action(async () => {
    // Default to running status subcommand
    await learnStatusCommand.parseAsync(['node', 'learn', 'status']);
  });
