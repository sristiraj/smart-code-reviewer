import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCodebaseIndex } from '../../src/indexer/codebase-indexer';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smart-review-indexer-'));
}

describe('buildCodebaseIndex', () => {
  it('indexes all text files in a directory', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'a.ts'), 'const a = 1;');
    fs.writeFileSync(path.join(dir, 'b.ts'), 'const b = 2;');
    fs.writeFileSync(path.join(dir, 'c.txt'), 'hello');

    const index = await buildCodebaseIndex(dir);
    expect(index.size).toBe(3);
    expect(index.get('a.ts')).toBe('const a = 1;');
    expect(index.get('b.ts')).toBe('const b = 2;');
    expect(index.get('c.txt')).toBe('hello');
  });

  it('excludes .git directory', async () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');
    fs.writeFileSync(path.join(dir, 'src.ts'), 'code');

    const index = await buildCodebaseIndex(dir);
    expect(Array.from(index.keys()).some((k) => k.startsWith('.git'))).toBe(false);
    expect(index.get('src.ts')).toBe('code');
  });

  it('excludes node_modules directory', async () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'pkg.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(dir, 'index.ts'), 'export {}');

    const index = await buildCodebaseIndex(dir);
    expect(Array.from(index.keys()).some((k) => k.startsWith('node_modules'))).toBe(false);
    expect(index.get('index.ts')).toBe('export {}');
  });

  it('excludes binary file extensions', async () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(dir, 'font.woff'), Buffer.from([0x77, 0x4f, 0x46, 0x46]));
    fs.writeFileSync(path.join(dir, 'code.ts'), 'export {}');

    const index = await buildCodebaseIndex(dir);
    expect(index.has('image.png')).toBe(false);
    expect(index.has('font.woff')).toBe(false);
    expect(index.get('code.ts')).toBe('export {}');
  });

  it('returns empty index for empty directory', async () => {
    const dir = makeTempDir();
    const index = await buildCodebaseIndex(dir);
    expect(index.size).toBe(0);
  });

  it('uses repo-relative paths as keys', async () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.ts'), 'export {}');

    const index = await buildCodebaseIndex(dir);
    expect(index.has(path.join('src', 'main.ts'))).toBe(true);
    expect(Array.from(index.keys()).every((k) => !path.isAbsolute(k))).toBe(true);
  });
});
