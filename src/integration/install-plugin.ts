import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface InstallPluginOptions {
  from?: string;
  target: string;
  installBinary?: boolean;
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

function binaryInPath(): boolean {
  try {
    execFileSync('smart-review', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    try {
      // commander exits non-zero for --version on some configs, check help instead
      execFileSync('smart-review', ['--help'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

async function installBinaryGlobally(out: NodeJS.WritableStream): Promise<void> {
  log('Installing smart-review binary globally via npm ...', out);
  await execFileAsync('npm', ['install', '-g', 'smart-drift-detector']);
  log('Binary installed. smart-review is now available in your PATH.', out);
}

export async function installPlugin(options: InstallPluginOptions): Promise<void> {
  const out = options.out ?? process.stdout;

  // --- Step 1: install binary if requested or if not already present ---
  if (options.installBinary !== false) {
    if (binaryInPath()) {
      log('smart-review binary already available in PATH — skipping binary install.', out);
    } else {
      await installBinaryGlobally(out);
    }
  }

  // --- Step 2: resolve skills source ---
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
    sourceRoot = findPackageRoot(__dirname);
  }

  // --- Step 3: copy skills ---
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
    if (fs.existsSync(path.join(dir, 'skills'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}
