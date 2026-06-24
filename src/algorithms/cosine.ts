import { Algorithm, CodebaseIndex, Finding, RCConfig } from '../types/index.js';
import { globalRegistry } from '../registry/index.js';

function tokenize(text: string): string[] {
  return text.split(/[\s\W]+/).filter((t) => t.length > 1);
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

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  const total = tokens.length;
  for (const [term, count] of tf) {
    tf.set(term, count / total);
  }
  return tf;
}

function buildTfIdfVectors(
  documents: string[][],
  vocab: string[]
): number[][] {
  const n = documents.length;
  const idf = new Map<string, number>();
  for (const term of vocab) {
    const docCount = documents.filter((d) => d.includes(term)).length;
    idf.set(term, docCount === 0 ? 0 : Math.log(n / docCount));
  }

  return documents.map((tokens) => {
    const tf = termFrequency(tokens);
    return vocab.map((term) => (tf.get(term) ?? 0) * (idf.get(term) ?? 0));
  });
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class CosineAlgorithm implements Algorithm {
  readonly name = 'cosine-tfidf';
  readonly methodology = 'TF-IDF cosine similarity';

  async run(targets: string[], index: CodebaseIndex, config: RCConfig): Promise<Finding[]> {
    const threshold = config.cosineThreshold;
    const findings: Finding[] = [];
    const now = new Date().toISOString();

    const allBlocks: Array<{ filePath: string; startLine: number; tokens: string[] }> = [];
    for (const [filePath, content] of index) {
      for (const block of splitBlocks(content)) {
        const tokens = tokenize(block.text);
        if (tokens.length > 2) {
          allBlocks.push({ filePath, startLine: block.startLine, tokens });
        }
      }
    }

    if (allBlocks.length < 2) return findings;

    const vocab = Array.from(new Set(allBlocks.flatMap((b) => b.tokens)));
    const vectors = buildTfIdfVectors(allBlocks.map((b) => b.tokens), vocab);

    for (const targetPath of targets) {
      const content = index.get(targetPath);
      if (!content) continue;

      for (const targetBlock of splitBlocks(content)) {
        const targetTokens = tokenize(targetBlock.text);
        if (targetTokens.length <= 2) continue;

        const targetIdx = allBlocks.findIndex(
          (b) => b.filePath === targetPath && b.startLine === targetBlock.startLine
        );
        if (targetIdx === -1) continue;

        let bestScore = 0;
        let bestRef: { filePath: string; startLine: number } | null = null;

        for (let i = 0; i < allBlocks.length; i++) {
          if (i === targetIdx) continue;
          const score = cosineSimilarity(vectors[targetIdx], vectors[i]);
          if (score > bestScore) {
            bestScore = score;
            bestRef = { filePath: allBlocks[i].filePath, startLine: allBlocks[i].startLine };
          }
        }

        if (bestScore >= threshold && bestRef) {
          findings.push({
            filePath: targetPath,
            lineNumber: targetBlock.startLine,
            description: `Semantically similar code detected (TF-IDF cosine: ${(bestScore * 100).toFixed(1)}%)`,
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

export const cosineAlgorithm = new CosineAlgorithm();
globalRegistry.register(cosineAlgorithm);
