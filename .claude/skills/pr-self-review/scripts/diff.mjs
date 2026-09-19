// Collects every open change (committed on the branch + staged + unstaged +
// untracked) against the merge-base, with per-file patch and the exact set of
// added line numbers — the "baseline" the verdict uses to tell a new problem
// from one that already sits in main.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, repoRoot, untrackedFiles } from './lib.mjs';

export function packageOf(path) {
  if (path.startsWith('server/src/modules/repo-intel/')) return 'repo-intel';
  for (const pkg of ['client', 'server', 'reviewer-core', 'e2e']) {
    if (path.startsWith(`${pkg}/`)) return pkg;
  }
  return 'root';
}

/** Added-line numbers (new side) and their text, from a unified diff. */
export function parsePatch(patch) {
  const added = [];
  const addedText = [];
  let line = 0;
  let inHunk = false;
  for (const raw of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith('\\')) continue;
    if (raw.startsWith('+')) {
      added.push(line);
      addedText.push(raw.slice(1));
      line++;
    } else if (raw.startsWith(' ')) line++;
    else if (raw.startsWith('diff --git')) inHunk = false;
  }
  return { added, addedText };
}

function parseNameStatus(out) {
  const tokens = out.split('\0').filter(Boolean);
  const rows = [];
  for (let i = 0; i < tokens.length; ) {
    const status = tokens[i++];
    if (status[0] === 'R' || status[0] === 'C') {
      rows.push({ status: status[0], oldPath: tokens[i++], path: tokens[i++] });
    } else rows.push({ status: status[0], path: tokens[i++] });
  }
  return rows;
}

export function collectFiles(base) {
  const files = parseNameStatus(
    git(['diff', '--name-status', '-M', '-z', '--no-color', base.sha]),
  ).map((row) => {
    const paths = row.oldPath ? [row.oldPath, row.path] : [row.path];
    const patch = git(['diff', '-M', '-U3', '--no-color', '--no-ext-diff', base.sha, '--', ...paths]);
    const binary = /^Binary files /m.test(patch);
    return { ...row, binary, patch, ...(binary ? { added: [], addedText: [] } : parsePatch(patch)) };
  });

  for (const path of untrackedFiles()) {
    let content = '';
    try {
      content = readFileSync(join(repoRoot(), path), 'utf8');
    } catch {}
    const binary = content.includes('\0');
    const lines = binary ? [] : content.split('\n');
    if (lines.at(-1) === '') lines.pop();
    files.push({
      status: 'A',
      path,
      untracked: true,
      binary,
      patch: binary ? '' : lines.map((l) => `+${l}`).join('\n'),
      added: lines.map((_, i) => i + 1),
      addedText: lines,
    });
  }

  return files
    .map((f) => ({ ...f, package: packageOf(f.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
