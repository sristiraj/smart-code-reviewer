import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installPlugin } from '../../src/integration/install-plugin';

// Mock both async execFile and sync execFileSync
jest.mock('child_process', () => ({
  execFile: jest.fn(),
  execFileSync: jest.fn(),
}));

import * as childProcess from 'child_process';
const mockedExecFile = childProcess.execFile as jest.MockedFunction<typeof childProcess.execFile>;
const mockedExecFileSync = childProcess.execFileSync as jest.MockedFunction<typeof childProcess.execFileSync>;

function makeTargetDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smart-review-target-'));
}

function mockGitCloneWithSkills(skillContent = '# skill') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
    const cloneArgs = args[1] as string[];
    // git clone --depth=1 <url> <dest>  →  dest is index 3
    if (cloneArgs[0] === 'clone') {
      const cloneDest = cloneArgs[3];
      const skillDir = path.join(cloneDest, 'skills', 'smart-review');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);
    }
    cb(null, { stdout: '', stderr: '' });
  });
}

function mockBinaryAbsent() {
  mockedExecFileSync.mockImplementation(() => { throw new Error('not found'); });
}

function mockBinaryPresent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedExecFileSync.mockReturnValue('' as any);
}

describe('installPlugin', () => {
  let outCapture: string;
  let out: NodeJS.WritableStream;

  beforeEach(() => {
    outCapture = '';
    out = { write: (c: unknown) => { outCapture += String(c); return true; } } as NodeJS.WritableStream;
    jest.clearAllMocks();
  });

  describe('binary install behaviour', () => {
    it('runs npm install -g when binary is not in PATH', async () => {
      mockBinaryAbsent();
      mockGitCloneWithSkills();

      const targetDir = makeTargetDir();
      await installPlugin({ from: 'https://github.com/example/smart-drift-detector', target: targetDir, out });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls = (mockedExecFile as any).mock.calls as unknown[][];;
      const npmCall = calls.find((c) => (c[0] as string) === 'npm');
      expect(npmCall).toBeDefined();
      expect(npmCall![1]).toEqual(['install', '-g', 'github:sristiraj/smart-code-reviewer']);
      expect(outCapture).toContain('Installing smart-review binary globally');
    });

    it('skips npm install when binary is already in PATH', async () => {
      mockBinaryPresent();
      mockGitCloneWithSkills();

      const targetDir = makeTargetDir();
      await installPlugin({ from: 'https://github.com/example/smart-drift-detector', target: targetDir, out });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls = (mockedExecFile as any).mock.calls as unknown[][];
      const npmCall = calls.find((c) => (c[0] as string) === 'npm');
      expect(npmCall).toBeUndefined();
      expect(outCapture).toContain('already available in PATH');
    });

    it('skips binary install entirely when installBinary is false', async () => {
      mockGitCloneWithSkills();

      const targetDir = makeTargetDir();
      await installPlugin({
        from: 'https://github.com/example/smart-drift-detector',
        target: targetDir,
        installBinary: false,
        out,
      });

      expect(mockedExecFileSync).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calls = (mockedExecFile as any).mock.calls as unknown[][];
      const npmCall = calls.find((c) => (c[0] as string) === 'npm');
      expect(npmCall).toBeUndefined();
    });
  });

  describe('skills copy behaviour', () => {
    it('copies skills/ from cloned repo to target', async () => {
      mockBinaryPresent();
      mockGitCloneWithSkills('# Smart Review Skill\n');

      const targetDir = makeTargetDir();
      await installPlugin({ from: 'https://github.com/example/smart-drift-detector', target: targetDir, out });

      const installedSkill = path.join(targetDir, 'smart-review', 'SKILL.md');
      expect(fs.existsSync(installedSkill)).toBe(true);
      expect(fs.readFileSync(installedSkill, 'utf-8')).toContain('Smart Review Skill');
    });

    it('logs each installed skill name and success message', async () => {
      mockBinaryPresent();
      mockGitCloneWithSkills();

      const targetDir = makeTargetDir();
      await installPlugin({ from: 'https://github.com/example/smart-drift-detector', target: targetDir, out });

      expect(outCapture).toContain('smart-review');
      expect(outCapture).toContain('installed successfully');
    });

    it('throws when git clone fails', async () => {
      mockBinaryPresent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: Error) => void;
        const cloneArgs = args[1] as string[];
        if (cloneArgs[0] === 'clone') cb(new Error('repository not found'));
        else cb(null as unknown as Error);
      });

      const targetDir = makeTargetDir();
      await expect(
        installPlugin({ from: 'https://github.com/bad/repo', target: targetDir, out })
      ).rejects.toThrow(/Failed to clone plugin repo/);
    });

    it('throws when cloned repo has no skills/ directory', async () => {
      mockBinaryPresent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
        const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
        const cloneArgs = args[1] as string[];
        if (cloneArgs[0] === 'clone') {
          const cloneDest = cloneArgs[3];
          fs.mkdirSync(cloneDest, { recursive: true });
          // no skills/ dir
        }
        cb(null, { stdout: '', stderr: '' });
      });

      const targetDir = makeTargetDir();
      await expect(
        installPlugin({ from: 'https://github.com/example/no-skills', target: targetDir, out })
      ).rejects.toThrow(/No skills\/ directory found/);
    });

    it('expands ~ in target path', async () => {
      mockBinaryPresent();
      mockGitCloneWithSkills();

      const tmpTarget = fs.mkdtempSync(path.join(os.homedir(), '.smart-review-test-'));
      try {
        const homeRelative = '~' + tmpTarget.slice(os.homedir().length);
        await installPlugin({ from: 'https://github.com/example/smart-drift-detector', target: homeRelative, out });
        expect(fs.existsSync(path.join(tmpTarget, 'smart-review', 'SKILL.md'))).toBe(true);
      } finally {
        fs.rmSync(tmpTarget, { recursive: true, force: true });
      }
    });
  });
});
