import { runCli } from '../../src/integration/cli';
import { AlgorithmRegistry } from '../../src/registry/index';
import { Algorithm, CodebaseIndex, RCConfig, Finding } from '../../src/types/index';

// Mock the codebase indexer and scan engine
jest.mock('../../src/indexer/codebase-indexer', () => ({
  buildCodebaseIndex: jest.fn().mockResolvedValue(new Map([['test.ts', 'const x = 1;']])),
}));

jest.mock('../../src/engine/scan-engine', () => ({
  ScanEngine: jest.fn().mockImplementation(() => ({
    scan: mockScan,
  })),
}));

jest.mock('child_process', () => ({ execFile: jest.fn() }));

let mockScan = jest.fn();

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

function makeFinding(): Finding {
  return {
    filePath: 'src/app.ts',
    lineNumber: 10,
    description: 'Duplicate code detected',
    reference: { filePath: 'src/utils.ts', lineNumber: 5 },
    detectedAt: new Date().toISOString(),
    algorithmName: 'jaccard',
    algorithmMethodology: 'token-set similarity',
  };
}

let stdoutCapture: string;
let stderrCapture: string;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  stdoutCapture = '';
  stderrCapture = '';
  mockScan = jest.fn();

  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdoutCapture += String(chunk);
    return true;
  });
  jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderrCapture += String(chunk);
    return true;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CLI', () => {
  it('exits 1 when findings are present, outputs JSON to stdout', async () => {
    const finding = makeFinding();
    mockScan.mockResolvedValue({ findings: [finding], scannedFiles: ['src/app.ts'], mode: 'diff', timestamp: new Date().toISOString() });

    const registry = new AlgorithmRegistry();
    const code = await runCli(['node', 'smart-review', '--mode', 'diff', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

    expect(code).toBe(1);
    const parsed = JSON.parse(stdoutCapture);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].filePath).toBe('src/app.ts');
  });

  it('exits 0 when no findings, outputs empty JSON array', async () => {
    mockScan.mockResolvedValue({ findings: [], scannedFiles: [], mode: 'diff', timestamp: new Date().toISOString() });

    const registry = new AlgorithmRegistry();
    const code = await runCli(['node', 'smart-review', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

    expect(code).toBe(0);
    expect(stdoutCapture.trim()).toBe('[]');
  });

  it('--format human outputs to stdout, not JSON', async () => {
    const finding = makeFinding();
    mockScan.mockResolvedValue({ findings: [finding], scannedFiles: ['src/app.ts'], mode: 'diff', timestamp: new Date().toISOString() });

    const registry = new AlgorithmRegistry();
    const code = await runCli(['node', 'smart-review', '--format', 'human', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

    expect(code).toBe(1);
    expect(stdoutCapture).toContain('jaccard');
    expect(stdoutCapture).not.toContain('"filePath"');
  });

  it('exits 2 on config error', async () => {
    // Point to a file with invalid content
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    const badConfig = path.join(tmpDir, '.smartreviewrc.yaml');
    fs.writeFileSync(badConfig, 'enable:\n  - a\ndisable:\n  - b\n');

    const registry = new AlgorithmRegistry();
    const code = await runCli(['node', 'smart-review', '--config', badConfig], registry);

    expect(code).toBe(2);
    expect(stderrCapture).toContain('smart-review error');
  });

  it('JSON output per finding has all 7 required fields', async () => {
    const finding = makeFinding();
    mockScan.mockResolvedValue({ findings: [finding], scannedFiles: ['src/app.ts'], mode: 'diff', timestamp: new Date().toISOString() });

    const registry = new AlgorithmRegistry();
    await runCli(['node', 'smart-review', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

    const parsed = JSON.parse(stdoutCapture);
    const f = parsed[0];
    expect(f.filePath).toBeDefined();
    expect(f.lineNumber).toBeDefined();
    expect(f.description).toBeDefined();
    expect(f.reference).toBeDefined();
    expect(f.detectedAt).toBeDefined();
    expect(f.algorithmName).toBeDefined();
    expect(f.algorithmMethodology).toBeDefined();
  });
});
