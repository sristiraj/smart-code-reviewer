---
name: smart-review
description: 'Run deterministic code drift detection on the current codebase. Use after generating or modifying code to check for duplication, spec drift, and guideline violations before committing. Invoke when the user says "check my code", "review before commit", or "run smart-review".'
argument-hint: "[--mode full|diff] [--base-branch <branch>] [--format json|human]"
---

# Smart Code Reviewer

Run `smart-review` to detect code drift in AI-generated code — including duplicate code blocks, spec drift, and structural violations.

## When to Use

Call this skill after generating or modifying code, before running `git commit`. If findings are returned, address them and re-run until no findings remain.

## Invocation

```bash
smart-review scan --mode diff --format json
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--mode <full\|diff>` | `diff` | `diff` checks only changed files; `full` checks the entire codebase |
| `--base-branch <branch>` | RC file or `main` | Base branch for diff comparison |
| `--config <path>` | `.smartreviewrc.yaml` | Path to the RC file |
| `--format <json\|human>` | `json` | `json` for structured output (machine); `human` for readable terminal output |

## Output

**stdout** — JSON array of findings. Each finding includes:

```json
{
  "filePath": "src/payments.ts",
  "lineNumber": 42,
  "description": "Duplicate code block detected (Jaccard similarity: 91.3%)",
  "reference": {
    "filePath": "src/utils/charge.ts",
    "lineNumber": 15
  },
  "detectedAt": "2026-06-22T14:00:00.000Z",
  "algorithmName": "jaccard",
  "algorithmMethodology": "token-set similarity"
}
```

**stderr** — Human-readable summary (always printed).

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No findings — code passes review |
| 1 | Findings present — address them and retry |
| 2 | Error — check stderr for details |

## Self-Correction Loop

When findings are returned, use them as context to revise the generated code:

1. Read each finding's `description` and `reference` to understand the violation
2. Revise the flagged code at `filePath:lineNumber`
3. Re-run `smart-review scan` until exit code is 0

## Installing the Plugin

Anyone working on a different project can install this skill into their AI coding agent:

```bash
# Install into Claude Code (default target: ~/.claude/skills)
smart-review install-plugin --from https://github.com/sraj5gilead/smart-code-reviewer

# Install into a custom skills directory
smart-review install-plugin --from https://github.com/sraj5gilead/smart-code-reviewer --target ~/.cursor/skills
```

## RC File

Configure per-repo behavior in `.smartreviewrc.yaml` at the repo root:

```yaml
base_branch: main

# Enable only specific algorithms (XOR with disable)
# enable:
#   - jaccard
#   - cosine-tfidf

# Or disable specific algorithms
# disable:
#   - semgrep

# External checkers
# external_checkers:
#   - name: eslint
#     command: "eslint --format unix ."

jaccard_threshold: 0.8
cosine_threshold: 0.75
```
