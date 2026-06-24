# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

---

## Detection

### Finding
A structured result emitted by a detection algorithm for one location in the codebase. Carries the file path, line number, human-readable description, a reference to a second location (for cross-file duplication findings), the algorithm that produced it, and the algorithm's methodology. Findings are the primary output of a scan.

### Algorithm
A detection strategy registered with the engine that operates on the Codebase Index and produces Findings. Algorithms are self-contained plugins — built-in variants (Jaccard, TF-IDF cosine, Semgrep) and external checker adapters all implement the same interface and are selected or excluded via RC Config.

### Codebase Index
An in-memory map of every readable source file in the repository, keyed by repo-relative path with file content as the value. Built once before a scan and shared across all Algorithms.

### Scan Mode
The scope of a scan: `full` processes every file in the Codebase Index; `diff` restricts target files to those changed relative to the base branch but still searches the full Codebase Index for cross-file references. Diff mode is the default for pre-commit use.

---

## Configuration

### RC Config
The per-repo configuration loaded from `.smartreviewrc.yaml` at scan time. Specifies the base branch, which Algorithms to enable or disable (mutually exclusive), external checker commands, and similarity thresholds. When no file is present, all Algorithms run with default thresholds against `main`.

---

## Distribution

### Skill
An agent instruction file (`SKILL.md`) distributed with the package that tells an AI coding agent (Claude Code, Codex, Cursor) how to invoke the tool. Distinct from the binary — the binary performs the scan, the Skill explains how to trigger it and interpret results within an agent session.
