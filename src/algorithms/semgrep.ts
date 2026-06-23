import { execFile } from 'child_process';
import { promisify } from 'util';
import { Algorithm, CodebaseIndex, Finding, RCConfig } from '../types/index.js';
import { globalRegistry } from '../registry/index.js';

const execFileAsync = promisify(execFile);

export type Executor = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultExecutor: Executor = async (cmd, args) => {
  const r = await execFileAsync(cmd, args, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' });
  return { stdout: r.stdout as string, stderr: r.stderr as string };
};

interface SemgrepMatch {
  path: string;
  start: { line: number };
  extra: { message: string };
}

interface SemgrepOutput {
  results: SemgrepMatch[];
  errors?: Array<{ message: string }>;
}

function makeErrorFinding(description: string, filePath: string, now: string): Finding {
  return {
    filePath,
    lineNumber: 0,
    description,
    reference: { filePath, lineNumber: 0 },
    detectedAt: now,
    algorithmName: 'semgrep',
    algorithmMethodology: 'rule-based static analysis',
  };
}

export class SemgrepAlgorithm implements Algorithm {
  readonly name = 'semgrep';
  readonly methodology = 'rule-based static analysis';
  private available: boolean | null = null;
  private readonly exec: Executor;

  constructor(executor: Executor = defaultExecutor) {
    this.exec = executor;
  }

  async run(targets: string[], _index: CodebaseIndex, _config: RCConfig): Promise<Finding[]> {
    if (this.available === null) {
      try {
        await this.exec('which', ['semgrep']);
        this.available = true;
      } catch {
        this.available = false;
      }
    }

    if (!this.available) {
      process.stderr.write('[smart-review] semgrep not found in PATH — skipping semgrep checks\n');
      return [];
    }

    if (targets.length === 0) return [];

    const now = new Date().toISOString();
    const findings: Finding[] = [];

    let stdout: string;
    try {
      ({ stdout } = await this.exec('semgrep', ['--json', '--config', 'auto', ...targets]));
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      // semgrep exits 1 when findings exist — stdout may still be valid JSON
      if (error.stdout) {
        stdout = error.stdout;
      } else {
        const msg = error.stderr ?? error.message ?? String(error);
        return [makeErrorFinding(`Semgrep error: ${msg}`, targets[0], now)];
      }
    }

    let parsed: SemgrepOutput;
    try {
      parsed = JSON.parse(stdout) as SemgrepOutput;
    } catch {
      return [makeErrorFinding('Failed to parse semgrep JSON output', targets[0], now)];
    }

    for (const match of parsed.results ?? []) {
      findings.push({
        filePath: match.path,
        lineNumber: match.start.line,
        description: match.extra.message,
        reference: { filePath: match.path, lineNumber: match.start.line },
        detectedAt: now,
        algorithmName: this.name,
        algorithmMethodology: this.methodology,
      });
    }

    for (const ruleError of parsed.errors ?? []) {
      findings.push(makeErrorFinding(`Semgrep rule error: ${ruleError.message}`, targets[0], now));
    }

    return findings;
  }
}

export const semgrepAlgorithm = new SemgrepAlgorithm();
globalRegistry.register(semgrepAlgorithm);
