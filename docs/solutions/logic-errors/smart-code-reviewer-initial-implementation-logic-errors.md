---
title: "Smart Code Reviewer: Logic Errors Resolved During Initial TypeScript Implementation"
date: 2026-06-23
category: logic-errors
module: smart-code-reviewer
problem_type: logic_error
component: smart-code-reviewer
symptoms:
  - TF-IDF cosine similarity always returned 0 for near-duplicate file pairs
  - CLI binary presence check threw errors on valid installs
  - "install-plugin failed to locate package root at runtime"
  - "Git clone destination path was undefined in test assertions"
  - "TypeScript compile error: process.exitCode not assignable to number"
  - ESM incompatibility blocked entire test suite build
  - "/plugin marketplace add <user>/smart-code-reviewer returned Repository not found"
root_cause: incorrect_assumption
resolution_type: code_fix
severity: high
tags:
  - typescript
  - tfidf
  - esm-compatibility
  - commander
  - git-clone
  - plugin-distribution
  - test-fixtures
---

# Smart Code Reviewer: Logic Errors Resolved During Initial TypeScript Implementation

## Problem

During initial TypeScript implementation of the `smart-code-reviewer` npm package, seven discrete logic errors were encountered across detection algorithms, CLI binary management, plugin distribution, and test infrastructure. Each error blocked a different part of the system from functioning correctly.

## Symptoms

- TF-IDF cosine similarity scores always returned `0` when comparing near-duplicate file pairs
- `execFileSync('smart-review', ['--version'])` threw even on valid installs, failing the binary presence check
- `findPackageRoot` walked the full directory tree without finding a match, crashing `install-plugin` at runtime
- Test assertions on git clone destination path always received `undefined`
- TypeScript compile error: `process.exitCode` of type `string | number | undefined` not assignable to `number`
- Test suite build failed entirely: `SyntaxError: Cannot use import statement in module` from `afinn-165`
- Running `/plugin marketplace add sraj5gilead/smart-code-reviewer` returned "Repository not found"

## What Didn't Work

- Adding `afinn-165` to `transformIgnorePatterns` in `ts-jest` config — did not resolve the ESM import error across all Node/Jest version combinations; the transitive dep was too deep in the chain
- Using `execFileSync('smart-review', ['--version'])` for binary detection — Commander exits non-zero for `--version` in some configurations, producing false negatives
- Using `plugin.yaml` as the `findPackageRoot` marker — the file was removed during plugin structure refactoring, so the walker always failed after that point

## Solution

### 1. Drop `natural`, implement TF-IDF from scratch

Remove `natural` and `@types/natural` entirely. Implement term frequency, inverse document frequency, and cosine similarity inline in `src/algorithms/cosine.ts`:

```typescript
function termFrequency(term: string, tokens: string[]): number {
  return tokens.filter(t => t === term).length / tokens.length;
}

function buildTfIdfVectors(docs: string[][]): Map<string, number>[] {
  return docs.map(doc => {
    const vec = new Map<string, number>();
    for (const term of new Set(doc)) {
      const tf = termFrequency(term, doc);
      const df = docs.filter(d => d.includes(term)).length;
      vec.set(term, tf * Math.log(docs.length / df));
    }
    return vec;
  });
}
```

### 2. TF-IDF test index must include ≥3 documents

IDF for a term appearing in both of 2 documents = `log(2/2) = 0`, making every weight zero. Tests must seed the index with at least 3 background files so shared tokens receive non-zero IDF:

```typescript
// Wrong — 2 docs, cosine always 0
const index = new Map([['a.ts', contentA], ['b.ts', contentB]]);

// Correct — 3+ docs give shared tokens real IDF weight
const index = new Map([
  ['a.ts', contentA],
  ['b.ts', contentB],
  ['c.ts', unrelatedContent],
  ['d.ts', anotherFile],
]);
```

### 3. Use `--help` for binary presence detection

```typescript
function binaryInPath(): boolean {
  try {
    execFileSync('smart-review', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execFileSync('smart-review', ['--help'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4. Use `skills/` directory as `findPackageRoot` marker

Walk up from `__dirname` looking for the `skills/` directory — a stable structural artifact of the package — rather than a config file that may be renamed or removed:

```typescript
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
```

### 5. Fix git clone argv index

`git clone --depth=1 <url> <dest>` produces `args = ['clone', '--depth=1', url, dest]`. The destination is at index **3**, not 2:

```typescript
// Wrong
const cloneDest = cloneArgs[2]; // this is the URL

// Correct
const cloneDest = cloneArgs[3];
```

### 6. Cast `process.exitCode` for return type

```typescript
return (process.exitCode as number | undefined) ?? 0;
```

### 7. Audit GitHub username in all plugin manifests before committing

The placeholder git user `sraj5gilead` was propagated into 8 files. Fix with:

```bash
grep -rl "sraj5gilead" . --include="*.md" --include="*.json" | \
  xargs sed -i '' 's/sraj5gilead/sristiraj/g'
```

Affected files: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `.agents/plugins/marketplace.json`, `skills/smart-review/SKILL.md`, `skills/smart-review-init/SKILL.md`, `README.md`.

## Why This Works

- **ESM drop**: Self-contained TF-IDF eliminates the entire dependency chain that triggered the ESM/CJS boundary issue. No external NLP library, no `transformIgnorePatterns` wrestling.
- **IDF corpus size**: IDF = `log(N/df)`. With N=2 and df=2 (shared token), result is 0. With N≥3, shared tokens get weight > 0. Three background files is the minimum viable corpus.
- **`--help` over `--version`**: Commander's `--version` behavior is configurable and can exit non-zero. `--help` always exits 0 when the binary exists and is functional.
- **`skills/` marker**: Unlike config files, the `skills/` directory is structurally required — the entire value of the package depends on it being present. It's safe to use as a root marker.
- **argv index**: `git clone --depth=1 url dest` is a 4-element args array starting at index 0. The dest is the 4th element (index 3).
- **`process.exitCode` cast**: The type is `string | number | undefined` because it accepts strings for legacy reasons. Narrowing with `as number | undefined` and nullish-coalescing to `0` is the correct pattern.
- **Username audit**: Plugin marketplace lookups resolve against the actual GitHub repo URL. A mismatched username produces a 404 regardless of the package name.

## Prevention

- Before adding any npm NLP/ML library, check whether its transitive deps include ESM-only modules: `npm install <pkg> && grep -r '"type": "module"' node_modules/<pkg>/node_modules/`
- TF-IDF tests: always seed the index with at least 3 documents, including at least one clearly unrelated file
- Binary presence checks: prefer `--help` over `--version` for Commander-based CLIs
- `findPackageRoot` markers: use a directory that is structurally load-bearing (e.g., `skills/`, `dist/`, `src/`) rather than a config file
- When mocking `child_process` subprocess calls, print the full args array in the first failing test rather than guessing indices
- Before first push: `grep -r "$(git config user.name)" . --include="*.json" --include="*.md"` to catch any local git identity leaking into distributed files

## Related Issues

- Origin plan: `docs/plans/2026-06-22-001-feat-three-component-system-plan.md` — U6 originally specified `natural` TfIdf; U10 originally used `--version` for binary detection. Both decisions were superseded by the fixes above.
