import { Algorithm } from '../types/index.js';

export class AlgorithmRegistry {
  private readonly algorithms: Map<string, Algorithm> = new Map();

  register(algo: Algorithm): void {
    this.algorithms.set(algo.name, algo);
  }

  list(): Algorithm[] {
    return Array.from(this.algorithms.values());
  }

  filter(enable?: string[], disable?: string[]): Algorithm[] {
    const all = this.list();
    if (enable && enable.length > 0) {
      return all.filter((a) => enable.includes(a.name));
    }
    if (disable && disable.length > 0) {
      return all.filter((a) => !disable.includes(a.name));
    }
    return all;
  }
}

export const globalRegistry = new AlgorithmRegistry();
