#!/usr/bin/env node
// PreToolUse hook for the `spec-creator` subagent (wired in its frontmatter):
// makes its write scope mechanical instead of prompt-only.
//
//   Write / Edit -> only `specs/spec-NNNN-<slug>.md` and
//                   `specs/images/spec-NNNN/<frame>.png`; never specs/README.md.
//   Bash         -> read-only (reuses readonly-bash.mjs `evaluate`), plus
//                   exactly two write forms for saving design frames:
//                   `mkdir -p specs/images/spec-NNNN` and
//                   `cp <file> specs/images/spec-NNNN/<frame>.png`.
//
//   stdin = Claude Code PreToolUse JSON; prints a deny decision or nothing.

import { isAbsolute, relative, resolve } from 'node:path';
import { evaluate } from './readonly-bash.mjs';

const SPEC = /^specs\/spec-\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const FRAME = /^specs\/images\/spec-\d{4}\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
const MKDIR = /^mkdir -p (\S+)$/;
const CP = /^cp (\S+) (\S+)$/;

function repoRelative(path, root) {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  return relative(root, abs);
}

export function checkWrite(filePath, root) {
  const rel = repoRelative(filePath ?? '', root);
  if (SPEC.test(rel) || FRAME.test(rel)) return null;
  return `spec-creator may only write specs/spec-NNNN-<slug>.md and specs/images/spec-NNNN/<frame>.png — "${rel}" is outside that scope. Stop and report it.`;
}

export function checkBash(command, root) {
  const cmd = (command ?? '').trim();
  const mkdir = MKDIR.exec(cmd);
  if (mkdir) {
    return /^specs\/images\/spec-\d{4}$/.test(repoRelative(mkdir[1], root))
      ? null
      : 'spec-creator may only `mkdir -p specs/images/spec-NNNN`. Stop and report it.';
  }
  const cp = CP.exec(cmd);
  if (cp) {
    return FRAME.test(repoRelative(cp[2], root))
      ? null
      : 'spec-creator may only `cp <screenshot> specs/images/spec-NNNN/<frame>.png`. Stop and report it.';
  }
  return evaluate(cmd);
}

function main(input) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tool = input.tool_name;
  let reason = null;
  if (tool === 'Write' || tool === 'Edit') reason = checkWrite(input.tool_input?.file_path, root);
  else if (tool === 'Bash') reason = checkBash(input.tool_input?.command, root);
  if (!reason) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw);
    } catch {}
    main(input);
  });
}
