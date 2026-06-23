#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { parseRCFile } from '../config/rc-parser.js';
import { buildCodebaseIndex } from '../indexer/codebase-indexer.js';
import { AlgorithmRegistry, globalRegistry } from '../registry/index.js';
import { ScanEngine } from '../engine/scan-engine.js';
import { Finding, ScanMode } from '../types/index.js';

// Register all built-in algorithms by importing them (side effects)
import '../algorithms/jaccard.js';
import '../algorithms/cosine.js';
import '../algorithms/semgrep.js';

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
    .description('Deterministic code drift detection for AI-generated code')
    .option('--mode <full|diff>', 'Scan mode: full codebase or diff from base branch', 'diff')
    .option('--base-branch <branch>', 'Override base branch from RC file')
    .option('--config <path>', 'Path to RC file', '.smartreviewrc.yaml')
    .option('--format <json|human>', 'Output format', 'json')
    .allowUnknownOption(false);

  program.parse(argv);
  const opts = program.opts<{
    mode: string;
    baseBranch?: string;
    config: string;
    format: string;
  }>();

  let config;
  try {
    config = parseRCFile(path.resolve(opts.config));
  } catch (err) {
    process.stderr.write(`smart-review error: ${(err as Error).message}\n`);
    return 2;
  }

  if (opts.baseBranch) {
    config = { ...config, baseBranch: opts.baseBranch };
  }

  const mode = (opts.mode === 'full' ? 'full' : 'diff') as ScanMode;

  let index;
  try {
    index = await buildCodebaseIndex(process.cwd());
  } catch (err) {
    process.stderr.write(`smart-review error: Failed to index codebase: ${(err as Error).message}\n`);
    return 2;
  }

  const engine = new ScanEngine(registry);
  let result;
  try {
    result = await engine.scan(mode, config, index);
  } catch (err) {
    process.stderr.write(`smart-review error: Scan failed: ${(err as Error).message}\n`);
    return 2;
  }

  const { findings } = result;

  if (opts.format === 'human') {
    renderHumanOutput(findings, process.stdout);
  } else {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
    renderHumanOutput(findings, process.stderr);
  }

  return findings.length > 0 ? 1 : 0;
}

// Entry point when run as CLI binary
if (require.main === module) {
  runCli(process.argv).then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`smart-review fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
}
