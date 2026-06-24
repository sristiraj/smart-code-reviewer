import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseRCFile } from '../../src/config/rc-parser';

function writeTempRC(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-review-test-'));
  const filePath = path.join(dir, '.smartreviewrc.yaml');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('parseRCFile', () => {
  it('parses valid YAML with enable list', () => {
    const p = writeTempRC(`enable:\n  - semgrep\n`);
    const config = parseRCFile(p);
    expect(config.enable).toEqual(['semgrep']);
    expect(config.disable).toBeUndefined();
  });

  it('parses valid YAML with disable list', () => {
    const p = writeTempRC(`disable:\n  - jaccard\n`);
    const config = parseRCFile(p);
    expect(config.disable).toEqual(['jaccard']);
    expect(config.enable).toBeUndefined();
  });

  it('throws when both enable and disable are present', () => {
    const p = writeTempRC(`enable:\n  - semgrep\ndisable:\n  - jaccard\n`);
    expect(() => parseRCFile(p)).toThrow(/enable.*disable|disable.*enable/i);
  });

  it('returns all-enabled state when neither enable nor disable is set', () => {
    const p = writeTempRC(`base_branch: main\n`);
    const config = parseRCFile(p);
    expect(config.enable).toBeUndefined();
    expect(config.disable).toBeUndefined();
  });

  it('defaults base_branch to main when absent', () => {
    const p = writeTempRC(`enable:\n  - jaccard\n`);
    const config = parseRCFile(p);
    expect(config.baseBranch).toBe('main');
  });

  it('parses custom base_branch', () => {
    const p = writeTempRC(`base_branch: develop\n`);
    const config = parseRCFile(p);
    expect(config.baseBranch).toBe('develop');
  });

  it('parses external checker definitions', () => {
    const p = writeTempRC(
      `external_checkers:\n  - name: eslint\n    command: "eslint --format json ."\n`
    );
    const config = parseRCFile(p);
    expect(config.externalCheckers).toEqual([
      { name: 'eslint', command: 'eslint --format json .' },
    ]);
  });

  it('throws on invalid YAML syntax', () => {
    const p = writeTempRC(`enable: [\n`);
    expect(() => parseRCFile(p)).toThrow();
  });

  it('returns default config when RC file is absent', () => {
    const config = parseRCFile('/nonexistent/.smartreviewrc.yaml');
    expect(config.baseBranch).toBe('main');
    expect(config.enable).toBeUndefined();
    expect(config.disable).toBeUndefined();
    expect(config.externalCheckers).toEqual([]);
  });
});
