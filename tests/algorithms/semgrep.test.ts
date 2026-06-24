import { SemgrepAlgorithm } from '../../src/algorithms/semgrep';
import { CodebaseIndex, RCConfig } from '../../src/types/index';

function makeConfig(): RCConfig {
  return {
    baseBranch: 'main',
    enable: undefined,
    disable: undefined,
    externalCheckers: [],
    jaccardThreshold: 0.8,
    cosineThreshold: 0.75,
  };
}

const emptyIndex: CodebaseIndex = new Map();

function semgrepOutput(results: object[], errors: object[] = []): string {
  return JSON.stringify({ results, errors });
}

describe('SemgrepAlgorithm', () => {
  it('returns empty array when semgrep is not installed and logs warning', async () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const exec = jest.fn().mockRejectedValue(new Error('which: semgrep not found'));
    const algo = new SemgrepAlgorithm(exec);

    const findings = await algo.run(['file.ts'], emptyIndex, makeConfig());
    expect(findings).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('semgrep not found'));

    stderrSpy.mockRestore();
  });

  it('parses semgrep JSON output and emits Findings', async () => {
    const output = semgrepOutput([
      { path: 'src/app.ts', start: { line: 42 }, extra: { message: 'Hardcoded secret detected' } },
    ]);

    const exec = jest
      .fn()
      .mockResolvedValueOnce({ stdout: '/usr/bin/semgrep', stderr: '' }) // which
      .mockResolvedValueOnce({ stdout: output, stderr: '' });             // semgrep

    const algo = new SemgrepAlgorithm(exec);
    const findings = await algo.run(['src/app.ts'], emptyIndex, makeConfig());

    expect(findings).toHaveLength(1);
    expect(findings[0].filePath).toBe('src/app.ts');
    expect(findings[0].lineNumber).toBe(42);
    expect(findings[0].description).toBe('Hardcoded secret detected');
    expect(findings[0].algorithmName).toBe('semgrep');
    expect(findings[0].algorithmMethodology).toBe('rule-based static analysis');
  });

  it('emits multiple findings for multiple semgrep matches', async () => {
    const output = semgrepOutput([
      { path: 'a.ts', start: { line: 1 }, extra: { message: 'Issue A' } },
      { path: 'a.ts', start: { line: 5 }, extra: { message: 'Issue B' } },
    ]);

    const exec = jest
      .fn()
      .mockResolvedValueOnce({ stdout: '/usr/bin/semgrep', stderr: '' })
      .mockResolvedValueOnce({ stdout: output, stderr: '' });

    const algo = new SemgrepAlgorithm(exec);
    const findings = await algo.run(['a.ts'], emptyIndex, makeConfig());
    expect(findings).toHaveLength(2);
  });

  it('handles semgrep exit-1 with valid JSON stdout (findings path)', async () => {
    const output = semgrepOutput([
      { path: 'b.ts', start: { line: 10 }, extra: { message: 'Pattern match' } },
    ]);
    const exitError = Object.assign(new Error('exit 1'), { stdout: output, stderr: '' });

    const exec = jest
      .fn()
      .mockResolvedValueOnce({ stdout: '/usr/bin/semgrep', stderr: '' })
      .mockRejectedValueOnce(exitError);

    const algo = new SemgrepAlgorithm(exec);
    const findings = await algo.run(['b.ts'], emptyIndex, makeConfig());
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toBe('Pattern match');
  });

  it('returns empty findings when targets list is empty', async () => {
    const exec = jest
      .fn()
      .mockResolvedValueOnce({ stdout: '/usr/bin/semgrep', stderr: '' });

    const algo = new SemgrepAlgorithm(exec);
    const findings = await algo.run([], emptyIndex, makeConfig());

    expect(findings).toHaveLength(0);
    expect(exec).toHaveBeenCalledTimes(1); // only which, not semgrep
  });
});
