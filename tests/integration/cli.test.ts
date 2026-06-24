import { runCli } from '../../src/integration/cli';
import { AlgorithmRegistry } from '../../src/registry/index';
import { Finding } from '../../src/types/index';

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

beforeEach(() => {
  stdoutCapture = '';
  stderrCapture = '';
  mockScan = jest.fn();
  delete process.exitCode;

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
  delete process.exitCode;
});

describe('CLI scan command', () => {
  it('exits 1 when findings are present, outputs JSON to stdout', async () => {
    const finding = makeFinding();
    mockScan.mockResolvedValue({
      findings: [finding],
      scannedFiles: ['src/app.ts'],
      mode: 'diff',
      timestamp: new Date().toISOString(),
    });

    const registry = new AlgorithmRegistry();
    await runCli(['node', 'smart-review', 'scan', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(stdoutCapture);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].filePath).toBe('src/app.ts');
  });

  it('exits 0 when no findings, outputs empty JSON array', async () => {
    mockScan.mockResolvedValue({
      findings: [],
      scannedFiles: [],
      mode: 'diff',
      timestamp: new Date().toISOString(),
    });

    const registry = new AlgorithmRegistry();
    await runCli(['node', 'smart-review', 'scan', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

    expect(process.exitCode ?? 0).toBe(0);
    expect(stdoutCapture.trim()).toBe('[]');
  });

  it('--format human outputs readable text to stdout', async () => {
    const finding = makeFinding();
    mockScan.mockResolvedValue({
      findings: [finding],
      scannedFiles: ['src/app.ts'],
      mode: 'diff',
      timestamp: new Date().toISOString(),
    });

    const registry = new AlgorithmRegistry();
    await runCli(
      ['node', 'smart-review', 'scan', '--format', 'human', '--config', '/nonexistent/.smartreviewrc.yaml'],
      registry
    );

    expect(process.exitCode).toBe(1);
    expect(stdoutCapture).toContain('jaccard');
    expect(stdoutCapture).not.toContain('"filePath"');
  });

  it('exits 2 on config error', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    const badConfig = path.join(tmpDir, '.smartreviewrc.yaml');
    fs.writeFileSync(badConfig, 'enable:\n  - a\ndisable:\n  - b\n');

    const registry = new AlgorithmRegistry();
    await runCli(['node', 'smart-review', 'scan', '--config', badConfig], registry);

    expect(process.exitCode).toBe(2);
    expect(stderrCapture).toContain('smart-review error');
  });

  it('JSON output per finding includes all 7 required fields', async () => {
    const finding = makeFinding();
    mockScan.mockResolvedValue({
      findings: [finding],
      scannedFiles: ['src/app.ts'],
      mode: 'diff',
      timestamp: new Date().toISOString(),
    });

    const registry = new AlgorithmRegistry();
    await runCli(['node', 'smart-review', 'scan', '--config', '/nonexistent/.smartreviewrc.yaml'], registry);

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

describe('CLI install-plugin command', () => {
  it('calls installPlugin and outputs success', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    // Provide a real source with skills/ so installPlugin can copy without cloning
    // We mock execFile (git clone) to populate the tmp dir
    const execFile = require('child_process').execFile;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (execFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      const cloneDest = (args[1] as string[])[3];
      if (cloneDest) {
        const skillDir = path.join(cloneDest, 'skills', 'smart-review');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
        fs.writeFileSync(path.join(cloneDest, 'plugin.yaml'), 'name: p');
      }
      cb(null, { stdout: '', stderr: '' });
    });

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-install-test-'));
    const registry = new AlgorithmRegistry();

    await runCli([
      'node', 'smart-review', 'install-plugin',
      '--from', 'https://github.com/example/smart-drift-detector',
      '--target', targetDir,
    ], registry);

    expect(process.exitCode ?? 0).toBe(0);
    expect(fs.existsSync(path.join(targetDir, 'smart-review', 'SKILL.md'))).toBe(true);
  });
});
