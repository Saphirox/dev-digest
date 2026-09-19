#!/usr/bin/env node
// PreToolUse gate (Claude Code hook on Bash) and git pre-push gate.
// Denies `gh pr create|ready|merge` and `git push` unless the CURRENT diff has
// a PASS verdict — a PASS for an earlier diff doesn't count.
//
//   hook:      stdin = Claude Code PreToolUse JSON; prints a deny decision or nothing
//   pre-push:  node gate.mjs --pre-push   (exit 1 = block the push)

import { join } from 'node:path';
import { diffHash, readJson, resolveBase, runDir } from './lib.mjs';

const GATED = /(?:^|[;&|(\s])(?:gh\s+pr\s+(?:create|ready|merge)\b|git\s+(?:-C\s+\S+\s+)?push\b)/;

function check() {
  const hash = diffHash(resolveBase());
  const report = readJson(join(runDir(hash), 'report.json'), null);
  if (!report) {
    return `No pr-self-review verdict for the current changes (diff ${hash}). Run /pr-self-review first; it reuses cached reviews for unchanged files.`;
  }
  if (report.verdict === 'PASS') return null;
  const crit = report.findings
    .filter((f) => report.blocking.includes(f.id))
    .map((f) => `  - ${f.title} (${f.file}:${f.line}, ${f.skill})`)
    .join('\n');
  return `pr-self-review verdict is ${report.verdict} for diff ${hash}.${crit ? `\nBlocking criticals:\n${crit}` : ''}\nFix them (or have the user explicitly override a false positive), then re-run /pr-self-review. Report: ${join(runDir(hash), 'report.md')}`;
}

if (process.argv.includes('--pre-push')) {
  const reason = check();
  if (reason) {
    console.error(reason);
    process.exit(1);
  }
  process.exit(0);
}

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  let command = '';
  try {
    command = JSON.parse(input).tool_input?.command ?? '';
  } catch {}
  // Quoted text is data, not a command: `grep "git push"` or a commit message
  // mentioning `gh pr create` must not trip the gate. (`bash -c "git push"`
  // slips through — this is a guardrail against accidents, not a sandbox.)
  const unquoted = command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''");
  if (!GATED.test(unquoted)) return;
  let reason;
  try {
    reason = check();
  } catch (err) {
    reason = `pr-self-review gate could not evaluate the diff: ${err.message}`;
  }
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
});
