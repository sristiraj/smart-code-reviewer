import { execFile } from 'child_process';
import { promisify } from 'util';
import { Algorithm, CodebaseIndex, Finding, RCConfig, ExternalCheckerConfig } from '../types/index.js';

const execFileAsync = promisify(execFile);

export type Executor = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultExecutor: Executor = async (cmd, args) => {
  const r = await execFileAsync(cmd, args, { maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8' });
  return { stdout: r.stdout as string, stderr: r.stderr as string };
};

// Matches: file.ts:10: message  or  file.ts:10:5: message
const LINT_LINE_RE = /^(.+?):(\d+)(?::\d+)?\s*:\s*(.+)$/;

function normalizeLine(
  line: string,
  now: string,
  checkerName: string
): Finding | null {
  const m = LINT_LINE_RE.exec(line.trim());
  if (!m) return null;
  const [, filePath, lineStr, description] = m;
  const lineNumber = parseInt(lineStr, 10);
  return {
    filePath: filePath.trim(),
    lineNumber,
    description: description.trim(),
    reference: { filePath: filePath.trim(), lineNumber },
    detectedAt: now,
    algorithmName: checkerName,
    algorithmMethodology: 'external-lint',
  };
}

export class ExternalCheckerAlgorithm implements Algorithm {
  readonly name: string;
  readonly methodology = 'external-lint';
  private readonly checkerConfig: ExternalCheckerConfig;
  private readonly exec: Executor;

  constructor(checkerConfig: ExternalCheckerConfig, executor: Executor = defaultExecutor) {
    this.name = checkerConfig.name;
    this.checkerConfig = checkerConfig;
    this.exec = executor;
  }

  async run(_targets: string[], _index: CodebaseIndex, _config: RCConfig): Promise<Finding[]> {
    const now = new Date().toISOString();
    const findings: Finding[] = [];

    const parts = this.checkerConfig.command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    let stdout: string;
    let exitError = false;

    try {
      ({ stdout } = await this.exec(cmd, args));
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string; code?: string };
      if (error.code === 'ENOENT') {
        return [
          {
            filePath: '',
            lineNumber: 0,
            description: `External checker '${this.checkerConfig.name}' command not found: ${cmd}`,
            reference: { filePath: '', lineNumber: 0 },
            detectedAt: now,
            algorithmName: this.name,
            algorithmMethodology: this.methodology,
          },
        ];
      }
      stdout = error.stdout ?? '';
      exitError = true;
      if (!stdout && error.stderr) {
        findings.push({
          filePath: '',
          lineNumber: 0,
          description: `External checker '${this.checkerConfig.name}' exited with error: ${error.message ?? ''}`,
          reference: { filePath: '', lineNumber: 0 },
          detectedAt: now,
          algorithmName: this.name,
          algorithmMethodology: this.methodology,
        });
      }
    }

    const rawLines: string[] = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const finding = normalizeLine(line, now, this.name);
      if (finding) {
        findings.push(finding);
      } else {
        rawLines.push(line);
      }
    }

    if (rawLines.length > 0 && !exitError) {
      findings.push({
        filePath: '',
        lineNumber: 0,
        description: rawLines.join('\n'),
        reference: { filePath: '', lineNumber: 0 },
        detectedAt: now,
        algorithmName: this.name,
        algorithmMethodology: this.methodology,
      });
    }

    return findings;
  }
}

export function createExternalCheckers(
  configs: ExternalCheckerConfig[],
  executor?: Executor
): ExternalCheckerAlgorithm[] {
  return configs.map((c) => new ExternalCheckerAlgorithm(c, executor));
}
