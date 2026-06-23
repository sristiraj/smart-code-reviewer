import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface InstallPluginOptions {
  from?: string;
  target: string;
  out?: NodeJS.WritableStream;
  errOut?: NodeJS.WritableStream;
}

function log(msg: string, out: NodeJS.WritableStream): void {
  out.write(`[smart-review] ${msg}\n`);
}

async function cloneRepo(url: string, destDir: string): Promise<void> {
  await execFileAsync('git', ['clone', '--depth=1', url, destDir]);
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export async function installPlugin(options: InstallPluginOptions): Promise<void> {
  const out = options.out ?? process.stdout;
  const errOut = options.errOut ?? process.stderr;

  let sourceRoot: string;
  let tmpDir: string | null = null;

  if (options.from) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-review-plugin-'));
    log(`Cloning plugin from ${options.from} ...`, out);
    try {
      await cloneRepo(options.from, tmpDir);
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(`Failed to clone plugin repo: ${(err as Error).message}`);
    }
    sourceRoot = tmpDir;
  } else {
    // Use the local package — skills/ is co-located with the installed binary
    // Walk up from this file's location to find skills/
    sourceRoot = findPackageRoot(__dirname);
  }

  const skillsSrc = path.join(sourceRoot, 'skills');
  if (!fs.existsSync(skillsSrc)) {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`No skills/ directory found in plugin source at ${sourceRoot}`);
  }

  const target = path.resolve(options.target.replace(/^~/, os.homedir()));
  log(`Installing skills to ${target} ...`, out);

  for (const skillName of fs.readdirSync(skillsSrc)) {
    const skillSrc = path.join(skillsSrc, skillName);
    if (!fs.statSync(skillSrc).isDirectory()) continue;

    const skillDest = path.join(target, skillName);
    copyDir(skillSrc, skillDest);
    log(`  Installed skill: ${skillName}  →  ${skillDest}`, out);
  }

  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  log('Plugin installed successfully.', out);
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'plugin.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}
