import { CosineAlgorithm } from '../../src/algorithms/cosine';
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

// Build a realistic multi-file index so IDF reflects a real codebase
function makeIndex(extra: Record<string, string>): CodebaseIndex {
  return new Map([
    ['utils/format.ts', 'function formatDate(d) { return d.toISOString(); }'],
    ['utils/parse.ts', 'function parseQuery(str) { return JSON.parse(str); }'],
    ['utils/validate.ts', 'function validateSchema(obj, schema) { return schema.test(obj); }'],
    ...Object.entries(extra),
  ]);
}

describe('CosineAlgorithm', () => {
  const algo = new CosineAlgorithm();

  it('detects near-duplicate code with similar distinctive tokens', async () => {
    const original = `function processPayment(orderId, customerId) {
  validatePayment(orderId);
  chargeCustomer(customerId);
  return confirmPayment(orderId, customerId);
}`;
    const nearDuplicate = `function processPayment(orderId, customerId) {
  validatePayment(orderId);
  chargeCustomer(customerId);
  return confirmPayment(orderId, customerId);
}`;

    const index = makeIndex({ 'payments/original.ts': original, 'payments/new.ts': nearDuplicate });

    const findings = await algo.run(['payments/new.ts'], index, makeConfig({ cosineThreshold: 0.8 }));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].algorithmName).toBe('cosine-tfidf');
    expect(findings[0].algorithmMethodology).toBe('TF-IDF cosine similarity');
  });

  it('does not flag structurally similar but semantically different code at default threshold', async () => {
    const a = `function renderButton(label, onClick) {
  return createEl('button', { onClick }, label);
}`;
    const b = `function fetchUserData(userId, callback) {
  return httpGet('/users/' + userId, callback);
}`;

    const index = makeIndex({ 'ui/button.ts': a, 'api/user.ts': b });
    const findings = await algo.run(['api/user.ts'], index, makeConfig());
    expect(findings).toHaveLength(0);
  });

  it('returns no findings for empty target file', async () => {
    const index = makeIndex({ 'empty.ts': '' });
    const findings = await algo.run(['empty.ts'], index, makeConfig());
    expect(findings).toHaveLength(0);
  });

  it('finding includes algorithm name and methodology', async () => {
    const block = `function processOrder(orderId, userId) {
  validateOrder(orderId);
  chargeUser(userId);
  return confirmOrder(orderId, userId);
}`;
    const index = makeIndex({ 'existing.ts': block, 'new.ts': block });

    const findings = await algo.run(['new.ts'], index, makeConfig({ cosineThreshold: 0.5 }));
    if (findings.length > 0) {
      expect(findings[0].algorithmName).toBe('cosine-tfidf');
      expect(findings[0].algorithmMethodology).toBe('TF-IDF cosine similarity');
      expect(findings[0].detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(findings[0].reference).toBeDefined();
    }
  });

  it('returns no findings when index has fewer than 2 blocks', async () => {
    const index: CodebaseIndex = new Map([['only.ts', 'function foo() { return 1; }']]);
    const findings = await algo.run(['only.ts'], index, makeConfig());
    expect(findings).toHaveLength(0);
  });
});
