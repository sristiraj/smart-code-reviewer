import { Algorithm, CodebaseIndex, Finding, RCConfig } from '../types/index.js';
import { globalRegistry } from '../registry/index.js';

function tokenize(text: string): Set<string> {
  return new Set(text.split(/[\s\W]+/).filter((t) => t.length > 1));
}

function jaccardCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  for (const t of a) {
    if (b.has(t)) intersect++;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function splitBlocks(content: string): Array<{ text: string; startLine: number }> {
  const blocks: Array<{ text: string; startLine: number }> = [];
  let current: string[] = [];
  let startLine = 1;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      if (current.length > 0) {
        blocks.push({ text: current.join('\n'), startLine });
        current = [];
      }
      startLine = i + 2;
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push({ text: current.join('\n'), startLine });
  }
  return blocks;
}

export class JaccardAlgorithm implements Algorithm {
  readonly name = 'jaccard';
  readonly methodology = 'token-set similarity';

  async run(targets: string[], index: CodebaseIndex, config: RCConfig): Promise<Finding[]> {
    const threshold = config.jaccardThreshold;
    const findings: Finding[] = [];
    const now = new Date().toISOString();

    const allBlocks: Array<{ filePath: string; startLine: number; tokens: Set<string> }> = [];
    for (const [filePath, content] of index) {
      for (const block of splitBlocks(content)) {
        const tokens = tokenize(block.text);
        if (tokens.size > 2) {
          allBlocks.push({ filePath, startLine: block.startLine, tokens });
        }
      }
    }

    for (const targetPath of targets) {
      const content = index.get(targetPath);
      if (!content) continue;

      for (const targetBlock of splitBlocks(content)) {
        const targetTokens = tokenize(targetBlock.text);
        if (targetTokens.size <= 2) continue;

        let bestScore = 0;
        let bestRef: { filePath: string; startLine: number } | null = null;

        for (const indexedBlock of allBlocks) {
          if (indexedBlock.filePath === targetPath && indexedBlock.startLine === targetBlock.startLine) {
            continue;
          }
          const score = jaccardCoefficient(targetTokens, indexedBlock.tokens);
          if (score > bestScore) {
            bestScore = score;
            bestRef = { filePath: indexedBlock.filePath, startLine: indexedBlock.startLine };
          }
        }

        if (bestScore >= threshold && bestRef) {
          findings.push({
            filePath: targetPath,
            lineNumber: targetBlock.startLine,
            description: `Duplicate code block detected (Jaccard similarity: ${(bestScore * 100).toFixed(1)}%)`,
            reference: { filePath: bestRef.filePath, lineNumber: bestRef.startLine },
            detectedAt: now,
            algorithmName: this.name,
            algorithmMethodology: this.methodology,
          });
        }
      }
    }

    return findings;
  }
}

export const jaccardAlgorithm = new JaccardAlgorithm();
globalRegistry.register(jaccardAlgorithm);
