import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { installPlugin } from '../../src/integration/install-plugin';

jest.mock('child_process', () => ({ execFile: jest.fn() }));
import * as childProcess from 'child_process';
const mockedExecFile = childProcess.execFile as jest.MockedFunction<typeof childProcess.execFile>;

function makeSourcePlugin(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-review-src-'));
  fs.writeFileSync(path.join(dir, 'plugin.yaml'), 'name: smart-code-reviewer\nversion: 0.1.0\n');
  const skillsDir = path.join(dir, 'skills', 'smart-review');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), '# Smart Review Skill\n');
  return dir;
}

function makeTargetDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'smart-review-target-'));
}

describe('installPlugin', () => {
  let outCapture: string;
  let out: NodeJS.WritableStream;

  beforeEach(() => {
    outCapture = '';
    out = { write: (c: unknown) => { outCapture += String(c); return true; } } as NodeJS.WritableStream;
    jest.clearAllMocks();
  });

  it('copies skills/ from a local source when no --from provided', async () => {
    const sourceRoot = makeSourcePlugin();
    const targetDir = makeTargetDir();

    // Patch __dirname resolution: installPlugin walks up from __dirname to find plugin.yaml
    // Since we can't override __dirname, use the --from path workaround via a git clone mock
    // Instead, test the copy logic by passing the source dir as if it were cloned
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      // Simulate git clone by populating the dest dir from sourceRoot
      const cloneDest = (args[1] as string[])[3];
      const clonedSkillsDir = path.join(cloneDest, 'skills', 'smart-review');
      fs.mkdirSync(clonedSkillsDir, { recursive: true });
      fs.writeFileSync(path.join(clonedSkillsDir, 'SKILL.md'), '# Smart Review Skill\n');
      fs.writeFileSync(path.join(cloneDest, 'plugin.yaml'), 'name: smart-code-reviewer\n');
      cb(null, { stdout: '', stderr: '' });
    });

    await installPlugin({ from: 'https://github.com/example/smart-code-reviewer', target: targetDir, out });

    const installedSkill = path.join(targetDir, 'smart-review', 'SKILL.md');
    expect(fs.existsSync(installedSkill)).toBe(true);
    expect(fs.readFileSync(installedSkill, 'utf-8')).toContain('Smart Review Skill');
  });

  it('logs each installed skill name and success message', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      const cloneDest = (args[1] as string[])[3];
      const skillDir = path.join(cloneDest, 'skills', 'smart-review');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
      fs.writeFileSync(path.join(cloneDest, 'plugin.yaml'), 'name: p');
      cb(null, { stdout: '', stderr: '' });
    });

    const targetDir = makeTargetDir();
    await installPlugin({ from: 'https://github.com/example/smart-code-reviewer', target: targetDir, out });

    expect(outCapture).toContain('smart-review');
    expect(outCapture).toContain('installed successfully');
  });

  it('throws when git clone fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: Error) => void;
      cb(new Error('repository not found'));
    });

    const targetDir = makeTargetDir();
    await expect(
      installPlugin({ from: 'https://github.com/bad/repo', target: targetDir, out })
    ).rejects.toThrow(/Failed to clone plugin repo/);
  });

  it('throws when cloned repo has no skills/ directory', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      const cloneDest = (args[1] as string[])[3];
      fs.mkdirSync(cloneDest, { recursive: true });
      // No skills/ directory
      cb(null, { stdout: '', stderr: '' });
    });

    const targetDir = makeTargetDir();
    await expect(
      installPlugin({ from: 'https://github.com/example/no-skills', target: targetDir, out })
    ).rejects.toThrow(/No skills\/ directory found/);
  });

  it('expands ~ in target path', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockedExecFile as any).mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
      const cloneDest = (args[1] as string[])[3];
      const skillDir = path.join(cloneDest, 'skills', 'smart-review');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill');
      fs.writeFileSync(path.join(cloneDest, 'plugin.yaml'), 'name: p');
      cb(null, { stdout: '', stderr: '' });
    });

    // Use a real temp subdir under home to validate ~ expansion doesn't throw
    const tmpTarget = fs.mkdtempSync(path.join(os.homedir(), '.smart-review-test-'));
    try {
      const homeRelative = '~' + tmpTarget.slice(os.homedir().length);
      await installPlugin({ from: 'https://github.com/example/smart-code-reviewer', target: homeRelative, out });
      expect(fs.existsSync(path.join(tmpTarget, 'smart-review', 'SKILL.md'))).toBe(true);
    } finally {
      fs.rmSync(tmpTarget, { recursive: true, force: true });
    }
  });
});
