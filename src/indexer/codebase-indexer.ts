import * as fs from 'fs';
import * as path from 'path';
import { CodebaseIndex } from '../types/index.js';

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', '.compound-engineering']);
const EXCLUDED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.7z',
  '.mp3', '.mp4', '.avi', '.mov',
  '.bin', '.exe', '.dll', '.so', '.dylib',
  '.lock',
]);

function isExcluded(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return EXCLUDED_EXTENSIONS.has(ext);
}

async function walkDir(dir: string, rootDir: string, index: CodebaseIndex): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) return;
        await walkDir(fullPath, rootDir, index);
      } else if (entry.isFile()) {
        if (isExcluded(fullPath)) return;
        try {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const relativePath = path.relative(rootDir, fullPath);
          index.set(relativePath, content);
        } catch {
          // skip unreadable files (binary content that slips through extension check)
        }
      }
    })
  );
}

export async function buildCodebaseIndex(repoRoot: string): Promise<CodebaseIndex> {
  const index: CodebaseIndex = new Map();
  await walkDir(repoRoot, repoRoot, index);
  return index;
}
