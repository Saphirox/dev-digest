# Subagent prompts

Two templates: one reviewer per skill unit, and one verifier for all
criticals. Fill each `{placeholder}` from the `prepare.mjs` summary.

## Reviewer (one per `units[]` entry)

```
You are reviewing local changes in the DevDigest repo ({repoRoot}) against ONE skill: {skill}.

1. Read {repoRoot}/.claude/skills/{skill}/SKILL.md and only the reference files it points to that apply to these changes.
2. Read the severity rubric: {repoRoot}/.claude/skills/pr-self-review/references/severity.md. It overrides the skill's own wording about severity.
3. Read the patch: {patch}. Open any changed file in full when you need context.
4. Report only problems that the ADDED or CHANGED lines introduce, and only within {skill}'s scope. Pre-existing code is out of scope. Do not re-report what the deterministic checks prove (listed in the rubric).

Files and their changed line ranges:
{filesWithRanges}

Write this JSON, and nothing else, to {findingsFile}. Write it even when there are no findings: {"skill":"{skill}","findings":[]}

{
  "skill": "{skill}",
  "findings": [
    {
      "id": "{skill}-1",
      "severity": "critical | warning | suggestion",
      "rule": "<skill file + section, e.g. SKILL.md#routes-stay-thin>",
      "file": "<repo-relative path>",
      "line": 42,
      "endLine": 45,
      "title": "<one line, the claim only>",
      "evidence": "<the offending code, quoted verbatim from an added line>",
      "failure_scenario": "<input/state -> wrong outcome>",
      "fix": "<the concrete change that resolves it>"
    }
  ]
}

Reply with one line: the number of findings per severity.
```

## Verifier (one for all criticals, when any exist)

Launch it only when at least one reviewer reported a `critical`. It must be
a fresh agent: its job is to disprove the finding, not to agree with it.

```
You are verifying critical findings from an automated review of local changes in {repoRoot}. A critical blocks the PR, so a false positive has a real cost. Try to DISPROVE each one.

For each finding below:
1. Open the file at the line and read enough surrounding code, including callers and the relevant types, to judge it.
2. Check that the code in `evidence` is really on a changed line: `git diff {baseSha} -- <file>`.
3. Decide:
   - "confirmed": the failure scenario really happens with this code.
   - "downgraded": the problem is real, but it is a convention issue with no demonstrated failure. It becomes a warning.
   - "rejected": the finding is wrong. The code does not do what the finding claims, the case is handled elsewhere, or the code is pre-existing.
   Use {repoRoot}/.claude/skills/pr-self-review/references/severity.md as the bar.

Findings:
{criticalsJson}

Write to {runDir}/verification.json:
{ "<finding id>": { "status": "confirmed|downgraded|rejected", "note": "<one sentence: why>" }, ... }

Reply with one line of counts.
```
