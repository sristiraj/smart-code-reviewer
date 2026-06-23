---
name: Smart Code Reviewer
last_updated: 2026-06-22
---

# Smart Code Reviewer Strategy

## Target problem

Engineers using AI coding agents (Claude Code, Codex, Copilot) ship code that passes tests but silently drifts from product spec, duplicates existing functionality, and violates structural principles like DRY, KISS, and YAGNI. Existing review tools check whether code runs — not whether it's the right code.

## Our approach

We embed deterministic checks as a pre-commit hook and a callable skill for AI coding agents. When code fails review, the agent receives a structured error message describing the exact drift — enabling it to self-correct before the commit lands rather than after a human catches it.

## Who it's for

**Primary:** Software engineers using AI coding agents — they're hiring Smart Code Reviewer to catch what tests and linters miss (spec drift, duplication, guideline violations) before AI-generated code hits the repo.

## Key metrics

- **Drift catch rate** — % of AI commits that failed at least one check before passing; measured in the event DB per repo
- **Auto-correction rate** — % of failed reviews where the AI agent self-corrected and passed on retry; measured in the event DB
- **Bypass rate** — % of reviews engineers skip or override via RC file; measured in the event DB
- **Duplication density** — duplicate blocks detected per 100 AI commits, tracked over time; measured in the event DB

## Tracks

### Detection engine

Similarity checks (Jaccard, cosine, semantic) and semgrep rules that make every review deterministic and reproducible.

_Why it serves the approach:_ Deterministic checks are what makes the feedback loop trustworthy — agents and engineers get the same result every time.

### Integration layer

Pre-commit hook and AI agent skill interface that embeds the reviewer in both human-driven and AI-driven development workflows.

_Why it serves the approach:_ The review has to live inside the generation loop to enable self-correction; a standalone tool catches drift too late.

### Rules & configuration

Project-level standards, thresholds, and an RC file that lets engineers allow specific flagged checks to pass when intentional.

_Why it serves the approach:_ Without configurable rules the tool produces noise; the RC file makes it trustable rather than something engineers route around.
