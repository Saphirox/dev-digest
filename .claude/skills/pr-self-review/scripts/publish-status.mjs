#!/usr/bin/env node
// Publishes the verdict as a GitHub commit status (context `pr-self-review`)
// on HEAD, so branch protection can require it before merge. Outward-facing:
// run only when the user asks. Refuses on a dirty tree — the status is pinned
// to a commit, so the reviewed diff must be exactly what HEAD contains.
//
//   node .claude/skills/pr-self-review/scripts/publish-status.mjs

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { diffHash, git, readJson, resolveBase, runDir } from './lib.mjs';

if (git(['status', '--porcelain']).trim()) {
  console.error('Working tree is not clean — commit (or drop) the changes first so the status matches HEAD.');
  process.exit(1);
}
const hash = diffHash(resolveBase());
const report = readJson(join(runDir(hash), 'report.json'), null);
if (!report) {
  console.error(`No verdict for diff ${hash}; run /pr-self-review first.`);
  process.exit(1);
}
const head = git(['rev-parse', 'HEAD']).trim();
const state = report.verdict === 'PASS' ? 'success' : 'failure';
const overridden = report.findings.filter((f) => f.override).length;
const description = `${report.verdict} · ${report.blocking.length} blocking · ${overridden} overridden · diff ${hash}`.slice(0, 140);
execFileSync(
  'gh',
  ['api', '-X', 'POST', `repos/{owner}/{repo}/statuses/${head}`, '-f', `state=${state}`, '-f', 'context=pr-self-review', '-f', `description=${description}`],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
console.log(`Posted pr-self-review=${state} on ${head.slice(0, 9)}: ${description}`);
