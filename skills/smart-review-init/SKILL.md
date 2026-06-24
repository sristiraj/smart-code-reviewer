---
name: smart-review-init
description: 'Interactively create or update a .smartreviewrc.yaml config file for the current repo. Use when the user says "set up smart review", "configure smart-review", "create the config file", or "initialise smart-review for this project".'
argument-hint: "[--force] to overwrite an existing config"
---

# Smart Review Init

Help the engineer create a `.smartreviewrc.yaml` configuration file for their repo by asking a small set of focused questions and writing the file.

## Workflow

### Step 0 — Ensure the binary is installed

Before doing anything else, check whether the `smart-review` binary is available:

```bash
which smart-review
```

**If found:** continue to Step 1.

**If not found:** tell the engineer:

> "The `smart-review` binary isn't installed yet. I'll install it now — this also copies the agent skills into `~/.claude/skills`."

Then run:

```bash
npx github:sristiraj/smart-code-reviewer install-plugin
```

This installs the binary globally via npm and copies the agent skills in one step. After it completes, confirm `smart-review` is now in PATH:

```bash
smart-review --help
```

If the install fails, tell the engineer to run it manually and show the exact command. Do not continue to config setup until the binary is confirmed present.

### Step 1 — Check for an existing config

Read `.smartreviewrc.yaml` in the current working directory.

- If it exists, tell the engineer: "A `.smartreviewrc.yaml` already exists. I'll show you what's in it and ask if you'd like to update it."
  - Show the current content.
  - Ask: "Would you like to update this config, or keep it as-is?"
  - If keep as-is: summarise what the current config does and stop.
- If it does not exist, say: "No config found. I'll ask a few questions and create one."

### Step 2 — Ask focused questions (one at a time)

Ask each question separately. Wait for the answer before moving to the next.

**Q1 — Base branch**

> What is the default base branch for this repo?
> - `main` (default)
> - `master`
> - Something else (ask them to type it)

**Q2 — Algorithm selection**

> Which detection algorithms would you like to run?
> - All of them (default — recommended for most projects)
> - Only specific ones (choose from: `jaccard`, `cosine-tfidf`, `semgrep`)
> - All except some (choose which to disable)

If they choose "only specific ones": ask which to enable.
If they choose "all except some": ask which to disable.
Remind them: enable and disable cannot both be set — the RC file takes one or the other.

**Q3 — Semgrep**

Only ask this if semgrep is in the enabled set (or all algorithms are enabled):

> Semgrep must be installed separately (`brew install semgrep` / `pip install semgrep`). If it's not installed, smart-review will skip it with a warning rather than failing. Is semgrep installed in this environment?
> - Yes — include it
> - No / not sure — disable it for now (I can re-enable it later)

If they say no or unsure: add `semgrep` to the disable list.

**Q4 — External checkers**

> Do you have any external linters or style checkers you'd like to include? (e.g. eslint, tsc, rubocop)
> - No external checkers (default)
> - Yes — I'll add them

If yes: ask for each checker's name and the shell command to run it. Remind them that the command's stdout must use `file:line: message` format (eslint unix format, tsc, rubocop default output all work). Repeat until they say they're done.

**Q5 — Thresholds**

> The duplication thresholds control how similar two code blocks must be before a finding is raised. The defaults work well for most codebases:
> - Jaccard threshold: `0.8` (80% token overlap)
> - Cosine threshold: `0.75` (75% TF-IDF similarity)
>
> Would you like to adjust these?
> - No, use the defaults
> - Yes — ask for each value

If yes: ask for the Jaccard threshold (0.0–1.0) then the cosine threshold (0.0–1.0). Higher values = fewer but more confident findings. Lower values = more findings, including weaker matches.

### Step 3 — Confirm and write

Show the engineer the complete YAML that will be written:

```yaml
# .smartreviewrc.yaml
# Smart Code Reviewer configuration
# Docs: https://github.com/sristiraj/smart-code-reviewer

base_branch: <value>

# Algorithm filter
<enable or disable block, or comment if all-enabled>

# External checkers
<external_checkers block, or comment if none>

jaccard_threshold: <value>
cosine_threshold: <value>
```

Ask: "Does this look right? I'll write it to `.smartreviewrc.yaml`."

If they want changes: go back to the relevant question.

If confirmed: write the file to `.smartreviewrc.yaml` in the current working directory.

### Step 4 — Next steps

After writing the file, tell the engineer:

1. **Run your first review** to confirm the config works:
   ```bash
   smart-review scan --mode full --format human
   ```
2. **Wire up the pre-commit hook** so every commit is checked automatically:
   ```bash
   # husky
   npx husky add .husky/pre-commit "smart-review scan --mode diff"

   # raw git hook
   echo 'smart-review scan --mode diff' >> .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit
   ```
3. **Commit the config** so the whole team uses the same settings:
   ```bash
   git add .smartreviewrc.yaml && git commit -m "chore: add smart-review config"
   ```
4. **Install the skill for teammates** — anyone on the team can get the `/smart-review` and `/smart-review-init` skills by running:
   ```bash
   smart-review install-plugin --from https://github.com/sristiraj/smart-code-reviewer
   ```

## Rules

- Write `.smartreviewrc.yaml` using the Write tool — do not print the file and ask the engineer to copy it manually.
- Always include comments in the generated YAML explaining each field, pointing to the README for full docs.
- Never set both `enable` and `disable` — the engine rejects that config at startup.
- If the engineer skips a question or says "default", use the documented default and do not ask again.
- Keep the questions short. The goal is a working config in under two minutes.
