import { JaccardAlgorithm } from '../../src/algorithms/jaccard';
import { CodebaseIndex, RCConfig } from '../../src/types/index';

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

describe('JaccardAlgorithm', () => {
  const algo = new JaccardAlgorithm();

  it('emits finding for identical code block in another file', async () => {
    const block = 'function add(a, b) {\n  return a + b;\n}';
    const index: CodebaseIndex = new Map([
      ['existing.ts', block],
      ['new.ts', block],
    ]);

    const findings = await algo.run(['new.ts'], index, makeConfig());
    expect(findings).toHaveLength(1);
    expect(findings[0].filePath).toBe('new.ts');
    expect(findings[0].reference.filePath).toBe('existing.ts');
    expect(findings[0].algorithmName).toBe('jaccard');
    expect(findings[0].algorithmMethodology).toBe('token-set similarity');
  });

  it('emits finding for slightly modified block above threshold', async () => {
    const original = 'function add(a, b) {\n  return a + b;\n}';
    const modified = 'function sum(x, y) {\n  return x + y;\n}';
    const index: CodebaseIndex = new Map([
      ['existing.ts', original],
      ['new.ts', modified],
    ]);

    const findings = await algo.run(['new.ts'], index, makeConfig({ jaccardThreshold: 0.5 }));
    expect(findings.length).toBeGreaterThan(0);
  });

  it('emits no finding for completely different blocks', async () => {
    const index: CodebaseIndex = new Map([
      ['existing.ts', 'function foo() { return 42; }'],
      ['new.ts', 'class HttpClient { async get(url) { return fetch(url); } }'],
    ]);

    const findings = await algo.run(['new.ts'], index, makeConfig());
    expect(findings).toHaveLength(0);
  });

  it('respects threshold=1.0 — only exact matches', async () => {
    const original = 'function add(a, b) { return a + b; }';
    const modified = 'function add(a, b) { return a + b; } // comment';
    const index: CodebaseIndex = new Map([
      ['existing.ts', original],
      ['new.ts', modified],
    ]);

    const findings = await algo.run(['new.ts'], index, makeConfig({ jaccardThreshold: 1.0 }));
    expect(findings).toHaveLength(0);
  });

  it('finding includes all required Finding fields', async () => {
    const block = 'function add(a, b) {\n  return a + b;\n}';
    const index: CodebaseIndex = new Map([
      ['existing.ts', block],
      ['new.ts', block],
    ]);

    const findings = await algo.run(['new.ts'], index, makeConfig());
    const f = findings[0];
    expect(f.filePath).toBeDefined();
    expect(f.lineNumber).toBeDefined();
    expect(f.description).toBeDefined();
    expect(f.reference).toBeDefined();
    expect(f.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(f.algorithmName).toBe('jaccard');
    expect(f.algorithmMethodology).toBeDefined();
  });
});
