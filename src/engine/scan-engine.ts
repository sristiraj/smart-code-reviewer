import { execFile } from 'child_process';
import { promisify } from 'util';
import { Algorithm, CodebaseIndex, Finding, RCConfig, ScanMode, ScanResult } from '../types/index.js';
import { AlgorithmRegistry } from '../registry/index.js';
import { createExternalCheckers } from '../algorithms/external-checker.js';

const execFileAsync = promisify(execFile);

async function getChangedFiles(baseBranch: string): Promise<string[]> {
  try {
    const r = await execFileAsync('git', ['diff', '--name-only', `HEAD..${baseBranch}`], {
      encoding: 'utf-8',
    });
    const stdout = typeof r.stdout === 'string' ? r.stdout : (r.stdout as Buffer).toString();
    const files = stdout.trim().split('\n').filter(Boolean);
    if (files.length > 0) return files;

    // Also check staged changes vs HEAD
    const staged = await execFileAsync('git', ['diff', '--name-only', '--cached'], {
      encoding: 'utf-8',
    });
    const stagedStdout =
      typeof staged.stdout === 'string' ? staged.stdout : (staged.stdout as Buffer).toString();
    return stagedStdout.trim().split('\n').filter(Boolean);
  } catch {
    process.stderr.write('[smart-review] git not available or not a repo — falling back to full mode\n');
    return [];
  }
}

export class ScanEngine {
  private readonly registry: AlgorithmRegistry;

  constructor(registry: AlgorithmRegistry) {
    this.registry = registry;
  }

  async scan(mode: ScanMode, config: RCConfig, index: CodebaseIndex): Promise<ScanResult> {
    const now = new Date().toISOString();
    const allIndexedFiles = Array.from(index.keys());

    let targets: string[];
    if (mode === 'diff') {
      const changed = await getChangedFiles(config.baseBranch);
      if (changed.length === 0) {
        // Fallback: all files in index
        targets = allIndexedFiles;
      } else {
        // Only include files that exist in the index
        targets = changed.filter((f) => index.has(f));
      }
    } else {
      targets = allIndexedFiles;
    }

    const builtInAlgos = this.registry.filter(config.enable, config.disable);
    const externalAlgos = createExternalCheckers(config.externalCheckers);
    const allAlgos: Algorithm[] = [...builtInAlgos, ...externalAlgos];

    const results = await Promise.allSettled(
      allAlgos.map((algo) => algo.run(targets, index, config))
    );

    const findings: Finding[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        findings.push(...result.value);
      } else {
        const algo = allAlgos[i];
        findings.push({
          filePath: targets[0] ?? '',
          lineNumber: 0,
          description: `Algorithm '${algo.name}' failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
          reference: { filePath: '', lineNumber: 0 },
          detectedAt: now,
          algorithmName: algo.name,
          algorithmMethodology: algo.methodology,
        });
      }
    }

    return {
      findings,
      scannedFiles: targets,
      mode,
      timestamp: now,
    };
  }
}
