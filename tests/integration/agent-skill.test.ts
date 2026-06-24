import { AgentSkill } from '../../src/integration/agent-skill';
import { Finding } from '../../src/types/index';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

import * as childProcess from 'child_process';
const mockedExecFile = childProcess.execFile as jest.MockedFunction<typeof childProcess.execFile>;

function stubExecFile(
  exitCode: 0 | 1 | 2,
  stdout: string,
  stderr = ''
) {
  if (exitCode === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      cb(null, { stdout, stderr });
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error & { code: number; stdout: string; stderr: string }) => void;
      const err = Object.assign(new Error(`exit ${exitCode}`), { code: exitCode, stdout, stderr });
      cb(err);
    });
  }
}

function makeFinding(): Finding {
  return {
    filePath: 'src/app.ts',
    lineNumber: 10,
    description: 'Duplicate detected',
    reference: { filePath: 'src/utils.ts', lineNumber: 5 },
    detectedAt: new Date().toISOString(),
    algorithmName: 'jaccard',
    algorithmMethodology: 'token-set similarity',
  };
}

describe('AgentSkill', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns { passed: false, findings } when CLI exits 1', async () => {
    const finding = makeFinding();
    stubExecFile(1, JSON.stringify([finding]));

    const skill = new AgentSkill();
    const result = await skill.check({ cliBinary: 'smart-review' });

    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].filePath).toBe('src/app.ts');
  });

  it('returns { passed: true, findings: [] } when CLI exits 0', async () => {
    stubExecFile(0, '[]');

    const skill = new AgentSkill();
    const result = await skill.check({ cliBinary: 'smart-review' });

    expect(result.passed).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('throws when CLI exits 2', async () => {
    stubExecFile(2, '', 'Config error: both enable and disable specified');

    const skill = new AgentSkill();
    await expect(skill.check({ cliBinary: 'smart-review' })).rejects.toThrow(
      /smart-review exited with error/
    );
  });

  it('passes correct flags to CLI binary', async () => {
    stubExecFile(0, '[]');

    const skill = new AgentSkill();
    await skill.check({
      cliBinary: 'smart-review',
      mode: 'full',
      baseBranch: 'develop',
      configPath: '/repo/.smartreviewrc.yaml',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (mockedExecFile as any).mock.calls[0];
    const cliArgs: string[] = callArgs[1];
    expect(cliArgs).toContain('--mode');
    expect(cliArgs).toContain('full');
    expect(cliArgs).toContain('--base-branch');
    expect(cliArgs).toContain('develop');
    expect(cliArgs).toContain('--config');
    expect(cliArgs).toContain('/repo/.smartreviewrc.yaml');
  });
});
