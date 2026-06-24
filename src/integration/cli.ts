#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { parseRCFile } from '../config/rc-parser.js';
import { buildCodebaseIndex } from '../indexer/codebase-indexer.js';
import { AlgorithmRegistry, globalRegistry } from '../registry/index.js';
import { ScanEngine } from '../engine/scan-engine.js';
import { Finding, ScanMode } from '../types/index.js';
import { installPlugin } from './install-plugin.js';

// Register all built-in algorithms by importing them (side effects)
import '../algorithms/jaccard.js';
import '../algorithms/cosine.js';
import '../algorithms/semgrep.js';

const DEFAULT_SKILLS_DIR = '~/.claude/skills';

function renderHumanOutput(findings: Finding[], stream: NodeJS.WritableStream): void {
  if (findings.length === 0) {
    stream.write('smart-review: No issues found.\n');
    return;
  }

  stream.write(`\nsmart-review: Found ${findings.length} issue(s)\n`);
  stream.write('─'.repeat(60) + '\n');

  for (const f of findings) {
    stream.write(`\n[${f.algorithmName}] ${f.filePath}:${f.lineNumber}\n`);
    stream.write(`  ${f.description}\n`);
    if (f.reference.filePath && f.reference.filePath !== f.filePath) {
      stream.write(`  Reference: ${f.reference.filePath}:${f.reference.lineNumber}\n`);
    }
    stream.write(`  Detected: ${f.detectedAt}\n`);
  }

  stream.write('\n' + '─'.repeat(60) + '\n');
}

export async function runCli(
  argv: string[],
  registry: AlgorithmRegistry = globalRegistry
): Promise<number> {
  const program = new Command();

  program
    .name('smart-review')
    .description('Deterministic code drift detection for AI-generated code');

  // Default command: run a review scan
  program
    .command('scan', { isDefault: true })
    .description('Scan the codebase for code drift (default command)')
    .option('--mode <full|diff>', 'Scan mode: full codebase or diff from base branch', 'diff')
    .option('--base-branch <branch>', 'Override base branch from RC file')
    .option('--config <path>', 'Path to RC file', '.smartreviewrc.yaml')
    .option('--format <json|human>', 'Output format', 'json')
    .action(async (opts: { mode: string; baseBranch?: string; config: string; format: string }) => {
      let config;
      try {
        config = parseRCFile(path.resolve(opts.config));
      } catch (err) {
        process.stderr.write(`smart-review error: ${(err as Error).message}\n`);
        process.exitCode = 2;
        return;
      }

      if (opts.baseBranch) {
        config = { ...config, baseBranch: opts.baseBranch };
      }

      const mode = (opts.mode === 'full' ? 'full' : 'diff') as ScanMode;

      let index;
      try {
        index = await buildCodebaseIndex(process.cwd());
      } catch (err) {
        process.stderr.write(
          `smart-review error: Failed to index codebase: ${(err as Error).message}\n`
        );
        process.exitCode = 2;
        return;
      }

      const engine = new ScanEngine(registry);
      let result;
      try {
        result = await engine.scan(mode, config, index);
      } catch (err) {
        process.stderr.write(`smart-review error: Scan failed: ${(err as Error).message}\n`);
        process.exitCode = 2;
        return;
      }

      const { findings } = result;

      if (opts.format === 'human') {
        renderHumanOutput(findings, process.stdout);
      } else {
        process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
        renderHumanOutput(findings, process.stderr);
      }

      process.exitCode = findings.length > 0 ? 1 : 0;
    });

  // Plugin install command
  program
    .command('install-plugin')
    .description(
      'Install the smart-review binary (if not already present) and agent skills in one step. ' +
      'Safe to run via npx: npx github:sristiraj/smart-code-reviewer install-plugin'
    )
    .option(
      '--from <git-url>',
      'Git repository URL to clone the plugin from (omit to install from the local package)'
    )
    .option(
      '--target <dir>',
      'Target skills directory',
      DEFAULT_SKILLS_DIR
    )
    .option(
      '--no-binary',
      'Skip binary install — copy skills only (use when the binary is already managed externally)'
    )
    .action(async (opts: { from?: string; target: string; binary: boolean }) => {
      try {
        await installPlugin({
          from: opts.from,
          target: opts.target,
          installBinary: opts.binary,
        });
      } catch (err) {
        process.stderr.write(`smart-review error: ${(err as Error).message}\n`);
        process.exitCode = 2;
      }
    });

  await program.parseAsync(argv);
  return (process.exitCode as number | undefined) ?? 0;
}

// Entry point when run as CLI binary
if (require.main === module) {
  runCli(process.argv)
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `smart-review fatal: ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(2);
    });
}
