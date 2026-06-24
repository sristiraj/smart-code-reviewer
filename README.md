# Smart Code Reviewer

Deterministic code drift detection for AI-generated code. Catches duplication, spec drift, and guideline violations before they reach the repo — giving AI coding agents structured findings they can act on to self-correct.

---

## Why

AI coding agents (Claude Code, Codex, Copilot) produce code that passes tests but silently drifts from product spec, duplicates existing functionality, or violates structural principles like DRY, KISS, and YAGNI. Standard linters and test suites don't catch this class of problem.

Smart Code Reviewer sits inside the generation loop — between code being written and code being committed — so findings reach the agent at the moment of generation, not after a human review cycle.

---

## How it works

Three components work together:

**Detection Engine** — runs registered algorithms against your codebase and produces structured findings. Algorithms include Jaccard token-set similarity, TF-IDF cosine similarity, Semgrep rule-based analysis, and any external checker you configure (eslint, tsc, etc.). New algorithms can be added without touching engine core.

**Rules & Configuration** — a per-repo `.smartreviewrc.yaml` file controls which algorithms run, what thresholds to use, the base branch for diff mode, and any external checkers. The engine validates the config at startup before running any checks.

**Integration Layer** — a `smart-review` CLI binary that pre-commit hooks and AI agents invoke. Outputs structured JSON findings to stdout (for agents and tooling) and a human-readable summary to stderr (for engineers). Exit codes follow Unix convention: `0` (clean), `1` (findings), `2` (error).

---

## Installation

### One command — no prior setup needed

```bash
npx smart-drift-detector install-plugin
```

This does everything in one step:
1. Installs the `smart-review` binary globally via npm (skipped if already present)
2. Copies the agent skills (`/smart-review`, `/smart-review-init`) into `~/.claude/skills`

No `npm install -g` first. No separate skill copy step. `npx` handles the bootstrap.

> **Why both are needed:** The agent skills (`/smart-review`, `/smart-review-init`) are instructions that tell your AI agent what to do. When the agent runs `/smart-review`, it shells out to `smart-review scan`. If the binary is not installed, that command fails. `install-plugin` installs both so they work together.

### Install for a different agent

```bash
# Cursor
npx smart-drift-detector install-plugin --target ~/.cursor/skills

# Any custom skills directory
npx smart-drift-detector install-plugin --target /path/to/agent/skills
```

### Install from the plugin marketplace

The marketplace command registers the plugin. You still need to install the binary and copy the skills separately — run `install-plugin` after:

**Claude Code**
```
/plugin marketplace add sristiraj/smart-code-reviewer
npx smart-drift-detector install-plugin
```

**Codex** — Register the marketplace source pointing to this repo, install `smart-drift-detector` from the plugin list, then run:
```bash
npx smart-drift-detector install-plugin
```

**Cursor** — Search for `smart-drift-detector` in the Cursor plugin marketplace, then run:
```bash
npx smart-drift-detector install-plugin --target ~/.cursor/skills
```

### Skills only (binary already managed separately)

If your team manages the binary via a company package registry or a shared tool install, you can copy the skills without touching the binary:

```bash
npx smart-drift-detector install-plugin --no-binary

# Or pull skills directly from the git repo
npx smart-drift-detector install-plugin --from https://github.com/sristiraj/smart-code-reviewer --no-binary
```

---

## Set up in your repo

Run the `/smart-review-init` skill inside your AI coding agent — it asks a handful of questions and writes `.smartreviewrc.yaml` for you:

```
/smart-review-init
```

The skill will ask about:
- Your base branch (`main`, `master`, or custom)
- Which algorithms to run (all, only some, or all except some)
- Whether semgrep is installed
- Any external checkers you want to include (eslint, tsc, rubocop, etc.)
- Similarity thresholds (or keep the defaults)

It then writes the config, confirms the content with you, and prints next steps for wiring up the pre-commit hook.

### Manual setup

If you prefer to write the config yourself, create `.smartreviewrc.yaml` at your repo root and commit it so the whole team uses the same settings:

```bash
# 1. Create the config (see Configuration section below for all options)
touch .smartreviewrc.yaml

# 2. Run a full scan to verify the config is valid
smart-review scan --mode full --format human

# 3. Commit it
git add .smartreviewrc.yaml && git commit -m "chore: add smart-review config"
```

---

## Usage

### Run a review (diff mode — checks only changed files)

```bash
smart-review scan
```

### Run a full codebase review

```bash
smart-review scan --mode full
```

### Use inside a Claude Code session

Once the plugin is installed, two skills are available:

```
/smart-review-init        ← create or update .smartreviewrc.yaml interactively
/smart-review             ← run a review and get structured findings
```

### As a pre-commit hook (husky)

```bash
# .husky/pre-commit
smart-review scan --mode diff
```

### As a pre-commit hook (raw git hook)

```bash
# .git/hooks/pre-commit
#!/bin/sh
smart-review scan --mode diff
```

### As a pre-commit hook (Python pre-commit framework)

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/sristiraj/smart-code-reviewer
    rev: v0.1.0
    hooks:
      - id: smart-review
        language: node
        entry: smart-review scan --mode diff
```

---

## Configuration

> **Quickest path:** run `/smart-review-init` inside Claude Code, Codex, or Cursor — it generates the file for you interactively.

The full set of options for `.smartreviewrc.yaml`:

```yaml
base_branch: main

# Run only specific algorithms (XOR with disable — cannot use both)
# enable:
#   - jaccard
#   - cosine-tfidf
#   - semgrep

# Or exclude specific algorithms
# disable:
#   - semgrep

# External checkers — stdout must use file:line: message format
# external_checkers:
#   - name: eslint
#     command: "eslint --format unix ."
#   - name: tsc-check
#     command: "tsc --noEmit"

jaccard_threshold: 0.8    # 0.0–1.0, default 0.8
cosine_threshold: 0.75    # 0.0–1.0, default 0.75
```

When no RC file is present, all algorithms run with default thresholds against `main`.

---

## Finding schema

Every finding — from any built-in algorithm or external checker — has the same seven fields:

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

---

## CLI reference

```
smart-review scan [options]
  --mode <full|diff>       Scan mode (default: diff)
  --base-branch <branch>   Override base branch from RC file
  --config <path>          RC file path (default: .smartreviewrc.yaml)
  --format <json|human>    Output format (default: json)

smart-review install-plugin [options]
  --from <git-url>         Git repo to clone skills from
  --target <dir>           Skills directory to install into (default: ~/.claude/skills)
```

---

## Detection algorithms

| Algorithm | Name | Catches |
|-----------|------|---------|
| Jaccard similarity | `jaccard` | Copy-paste duplication (exact or near-exact token sets) |
| TF-IDF cosine | `cosine-tfidf` | Near-duplicate code with similar vocabulary |
| Semgrep | `semgrep` | Rule-based pattern violations (requires `semgrep` in PATH) |
| External checker | configured name | Any tool that writes `file:line: message` to stdout |

In diff mode, the engine checks only changed files but searches the full codebase for cross-file references — so a duplicate detected in a new file will point back to the existing copy in an unchanged file.

---

## Plugin structure

```
smart-drift-detector/
├── .agents/
│   └── plugins/
│       └── marketplace.json ← Unified cross-agent marketplace entry
├── .claude-plugin/
│   ├── plugin.json          ← Claude Code plugin registry metadata
│   └── marketplace.json     ← Claude marketplace entry
├── .codex-plugin/
│   └── plugin.json          ← Codex manifest (skills path + interface block)
├── .cursor-plugin/
│   └── plugin.json          ← Cursor plugin metadata
└── skills/
    ├── smart-review/
    │   └── SKILL.md         ← /smart-review — run a review scan
    └── smart-review-init/
        └── SKILL.md         ← /smart-review-init — create .smartreviewrc.yaml
```

---

## License

MIT
