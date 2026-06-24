import { execFile } from 'child_process';
import { promisify } from 'util';
import { Finding } from '../types/index.js';

const execFileAsync = promisify(execFile);

export interface AgentSkillOptions {
  mode?: 'full' | 'diff';
  baseBranch?: string;
  configPath?: string;
  cliBinary?: string;
}

export interface AgentSkillResult {
  passed: boolean;
  findings: Finding[];
}

export class AgentSkill {
  async check(options: AgentSkillOptions = {}): Promise<AgentSkillResult> {
    const binary = options.cliBinary ?? 'smart-review';
    const args: string[] = ['--format', 'json'];

    if (options.mode) args.push('--mode', options.mode);
    if (options.baseBranch) args.push('--base-branch', options.baseBranch);
    if (options.configPath) args.push('--config', options.configPath);

    let stdout: string;
    let exitCode: number | null = null;

    try {
      const r = await execFileAsync(binary, args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
      stdout = r.stdout as string;
      exitCode = 0;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      exitCode = error.code ?? null;

      if (exitCode === 2) {
        throw new Error(
          `smart-review exited with error: ${error.stderr ?? error.message ?? 'unknown error'}`
        );
      }

      // Exit code 1 means findings present — stdout is still valid JSON
      stdout = error.stdout ?? '[]';
    }

    let findings: Finding[];
    try {
      findings = JSON.parse(stdout) as Finding[];
    } catch {
      throw new Error(`Failed to parse smart-review output as JSON: ${stdout.slice(0, 200)}`);
    }

    return {
      passed: findings.length === 0,
      findings,
    };
  }
}

export const agentSkill = new AgentSkill();
