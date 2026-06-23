import { ExternalCheckerAlgorithm } from '../../src/algorithms/external-checker';
import { CodebaseIndex, RCConfig } from '../../src/types/index';

const emptyIndex: CodebaseIndex = new Map();

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

describe('ExternalCheckerAlgorithm', () => {
  it('normalizes eslint-format stdout to Finding', async () => {
    const eslintOutput = 'src/app.ts:10:5: Unexpected var. Use let or const instead.';
    const exec = jest.fn().mockResolvedValue({ stdout: eslintOutput, stderr: '' });

    const algo = new ExternalCheckerAlgorithm({ name: 'eslint', command: 'eslint --format unix .' }, exec);
    const findings = await algo.run([], emptyIndex, makeConfig());

    expect(findings).toHaveLength(1);
    expect(findings[0].filePath).toBe('src/app.ts');
    expect(findings[0].lineNumber).toBe(10);
    expect(findings[0].description).toBe('Unexpected var. Use let or const instead.');
    expect(findings[0].algorithmName).toBe('eslint');
    expect(findings[0].algorithmMethodology).toBe('external-lint');
  });

  it('returns error finding when command exits non-zero with stderr', async () => {
    const err = Object.assign(new Error('exit 1'), { stdout: '', stderr: 'Fatal error: config not found' });
    const exec = jest.fn().mockRejectedValue(err);

    const algo = new ExternalCheckerAlgorithm({ name: 'mylint', command: 'mylint .' }, exec);
    const findings = await algo.run([], emptyIndex, makeConfig());

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].description).toMatch(/exited with error/i);
    expect(findings[0].algorithmName).toBe('mylint');
  });

  it('returns error finding when command is not found (ENOENT)', async () => {
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
    const exec = jest.fn().mockRejectedValue(err);

    const algo = new ExternalCheckerAlgorithm({ name: 'missing-linter', command: 'missing-linter .' }, exec);
    const findings = await algo.run([], emptyIndex, makeConfig());

    expect(findings).toHaveLength(1);
    expect(findings[0].description).toMatch(/not found/i);
  });

  it('handles mixed matching and non-matching lines', async () => {
    const output = [
      'src/foo.ts:5: Missing semicolon',
      'Warning: some general message without line info',
      'src/bar.ts:12: Unused variable',
    ].join('\n');
    const exec = jest.fn().mockResolvedValue({ stdout: output, stderr: '' });

    const algo = new ExternalCheckerAlgorithm({ name: 'tslint', command: 'tslint .' }, exec);
    const findings = await algo.run([], emptyIndex, makeConfig());

    const lineFindings = findings.filter((f) => f.lineNumber > 0);
    const rawFindings = findings.filter((f) => f.lineNumber === 0);

    expect(lineFindings).toHaveLength(2);
    expect(rawFindings.length).toBeGreaterThan(0);
    expect(rawFindings[0].description).toContain('Warning: some general message');
  });

  it('algorithm name matches RC-configured checker name', async () => {
    const exec = jest.fn().mockResolvedValue({ stdout: 'file.ts:1: issue', stderr: '' });

    const algo = new ExternalCheckerAlgorithm({ name: 'custom-checker', command: 'custom-checker .' }, exec);
    const findings = await algo.run([], emptyIndex, makeConfig());

    expect(findings[0].algorithmName).toBe('custom-checker');
  });
});
