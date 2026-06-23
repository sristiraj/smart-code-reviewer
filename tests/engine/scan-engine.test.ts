import { ScanEngine } from '../../src/engine/scan-engine';
import { AlgorithmRegistry } from '../../src/registry/index';
import { Algorithm, CodebaseIndex, Finding, RCConfig, ScanMode } from '../../src/types/index';

// Mock git so tests don't depend on the actual repo state
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

import * as childProcess from 'child_process';
const mockedExecFile = childProcess.execFile as jest.MockedFunction<typeof childProcess.execFile>;

function gitDiffReturns(files: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (
      err: null,
      result: { stdout: string; stderr: string }
    ) => void;
    cb(null, { stdout: files, stderr: '' });
  });
}

function makeConfig(overrides?: Partial<RCConfig>): RCConfig {
  return {
    baseBranch: 'main',
    enable: undefined,
    disable: undefined,
    externalCheckers: [],
    jaccardThreshold: 0.8,
    cosineThreshold: 0.75,
    ...overrides,
  };
}

function makeAlgo(name: string, findings: Finding[] = []): Algorithm {
  return {
    name,
    methodology: 'test',
    run: jest.fn().mockResolvedValue(findings),
  };
}

function makeFinding(filePath = 'a.ts'): Finding {
  return {
    filePath,
    lineNumber: 1,
    description: 'test finding',
    reference: { filePath, lineNumber: 1 },
    detectedAt: new Date().toISOString(),
    algorithmName: 'test',
    algorithmMethodology: 'test',
  };
}

describe('ScanEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('full mode passes all indexed files as targets', async () => {
    const registry = new AlgorithmRegistry();
    const algo = makeAlgo('algo1');
    registry.register(algo);

    const index: CodebaseIndex = new Map([
      ['a.ts', 'code a'],
      ['b.ts', 'code b'],
    ]);

    const engine = new ScanEngine(registry);
    await engine.scan('full', makeConfig(), index);

    expect(algo.run).toHaveBeenCalledWith(
      expect.arrayContaining(['a.ts', 'b.ts']),
      index,
      expect.anything()
    );
  });

  it('diff mode passes only changed files as targets', async () => {
    gitDiffReturns('a.ts\n');

    const registry = new AlgorithmRegistry();
    const algo = makeAlgo('algo1');
    registry.register(algo);

    const index: CodebaseIndex = new Map([
      ['a.ts', 'code a'],
      ['b.ts', 'code b'],
    ]);

    const engine = new ScanEngine(registry);
    await engine.scan('diff', makeConfig(), index);

    expect(algo.run).toHaveBeenCalledWith(['a.ts'], index, expect.anything());
  });

  it('diff mode still passes full index for cross-file lookups', async () => {
    gitDiffReturns('a.ts\n');

    const registry = new AlgorithmRegistry();
    const algo = makeAlgo('algo1');
    registry.register(algo);

    const index: CodebaseIndex = new Map([
      ['a.ts', 'code a'],
      ['b.ts', 'code b'],
    ]);

    const engine = new ScanEngine(registry);
    await engine.scan('diff', makeConfig(), index);

    // The full index (not just targets) is passed as the second argument
    expect(algo.run).toHaveBeenCalledWith(expect.any(Array), index, expect.anything());
    expect((algo.run as jest.Mock).mock.calls[0][1].size).toBe(2);
  });

  it('applies enable filter — only enabled algorithms run', async () => {
    const registry = new AlgorithmRegistry();
    const jaccard = makeAlgo('jaccard');
    const semgrep = makeAlgo('semgrep');
    registry.register(jaccard);
    registry.register(semgrep);

    const index: CodebaseIndex = new Map([['a.ts', 'code']]);
    const engine = new ScanEngine(registry);
    await engine.scan('full', makeConfig({ enable: ['jaccard'] }), index);

    expect(jaccard.run).toHaveBeenCalled();
    expect(semgrep.run).not.toHaveBeenCalled();
  });

  it('applies disable filter — disabled algorithms do not run', async () => {
    const registry = new AlgorithmRegistry();
    const jaccard = makeAlgo('jaccard');
    const semgrep = makeAlgo('semgrep');
    registry.register(jaccard);
    registry.register(semgrep);

    const index: CodebaseIndex = new Map([['a.ts', 'code']]);
    const engine = new ScanEngine(registry);
    await engine.scan('full', makeConfig({ disable: ['semgrep'] }), index);

    expect(jaccard.run).toHaveBeenCalled();
    expect(semgrep.run).not.toHaveBeenCalled();
  });

  it('no enable/disable — all registered algorithms run', async () => {
    const registry = new AlgorithmRegistry();
    const a = makeAlgo('a');
    const b = makeAlgo('b');
    registry.register(a);
    registry.register(b);

    const index: CodebaseIndex = new Map([['f.ts', 'code']]);
    const engine = new ScanEngine(registry);
    await engine.scan('full', makeConfig(), index);

    expect(a.run).toHaveBeenCalled();
    expect(b.run).toHaveBeenCalled();
  });

  it('all algorithms return empty — ScanResult.findings is empty', async () => {
    const registry = new AlgorithmRegistry();
    registry.register(makeAlgo('a', []));

    const index: CodebaseIndex = new Map([['f.ts', 'code']]);
    const engine = new ScanEngine(registry);
    const result = await engine.scan('full', makeConfig(), index);

    expect(result.findings).toHaveLength(0);
  });

  it('one algorithm throws — error captured as Finding, others continue', async () => {
    const registry = new AlgorithmRegistry();
    const good = makeAlgo('good', [makeFinding()]);
    const bad: Algorithm = {
      name: 'bad',
      methodology: 'test',
      run: jest.fn().mockRejectedValue(new Error('algo exploded')),
    };
    registry.register(good);
    registry.register(bad);

    const index: CodebaseIndex = new Map([['f.ts', 'code']]);
    const engine = new ScanEngine(registry);
    const result = await engine.scan('full', makeConfig(), index);

    const errorFindings = result.findings.filter((f) => f.algorithmName === 'bad');
    const otherFindings = result.findings.filter((f) => f.algorithmName !== 'bad');

    expect(otherFindings).toHaveLength(1);
    expect(errorFindings).toHaveLength(1);
    expect(errorFindings[0].description).toContain('algo exploded');
  });
});
