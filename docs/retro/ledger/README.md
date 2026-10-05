# Workflow retro ledger

One entry per `/workflow-retro` run (`.claude/skills/workflow-retro/`):
numbers, agent timeline, per-agent findings, candidate module insights and
proposals for the agent prompts, skills and pipeline. Written by the main
session when the user runs the skill — **never automatically**. Entries are
append-only; a later retro updates an earlier proposal's status only in this
index's *Open proposals* column, not by rewriting the entry.

Files: `NNNN-<workflow>-<slug>.md`, 4-digit sequential prefix, never
renumbered.

| # | Date | Workflow | Feature / task | Tokens | Agents | Rounds (arch / verify) | Open proposals | Entry |
|---|---|---|---|---|---|---|---|---|
| 0001 | 2026-10-03 | spec → plan → `/run-sdd` | Project Context (spec-0001, plan 0014) | 80.74M | 25 | 2 / 1 (+1 security) | P-0001-1…6 (6 open) | [0001-run-sdd-project-context.md](0001-run-sdd-project-context.md) |
| 0002 | 2026-10-03 | run-sdd | PR Brief (SPEC-0002, plan 0015) | 86.07M (agents 23.67M) | 18 | 2 / 1 | P-0002-1 … P-0002-6 (6 open) | [0002-run-sdd-pr-brief.md](0002-run-sdd-pr-brief.md) |
