import { AlgorithmRegistry } from '../../src/registry/index';
import { Algorithm, CodebaseIndex, RCConfig } from '../../src/types/index';

function makeAlgo(name: string): Algorithm {
  return {
    name,
    methodology: `${name}-method`,
    run: async () => [],
  };
}

describe('AlgorithmRegistry', () => {
  let registry: AlgorithmRegistry;

  beforeEach(() => {
    registry = new AlgorithmRegistry();
  });

  it('list() returns a registered algorithm', () => {
    registry.register(makeAlgo('jaccard'));
    expect(registry.list().map((a) => a.name)).toEqual(['jaccard']);
  });

  it('filter with enable list returns only named algorithm', () => {
    registry.register(makeAlgo('jaccard'));
    registry.register(makeAlgo('semgrep'));
    const result = registry.filter(['jaccard']);
    expect(result.map((a) => a.name)).toEqual(['jaccard']);
  });

  it('filter with disable list returns all except named', () => {
    registry.register(makeAlgo('jaccard'));
    registry.register(makeAlgo('semgrep'));
    const result = registry.filter(undefined, ['semgrep']);
    expect(result.map((a) => a.name)).toEqual(['jaccard']);
  });

  it('filter with no args returns all registered algorithms', () => {
    registry.register(makeAlgo('jaccard'));
    registry.register(makeAlgo('semgrep'));
    const result = registry.filter();
    expect(result).toHaveLength(2);
  });

  it('register replaces algorithm with same name', () => {
    registry.register(makeAlgo('jaccard'));
    registry.register(makeAlgo('jaccard'));
    expect(registry.list()).toHaveLength(1);
  });
});
