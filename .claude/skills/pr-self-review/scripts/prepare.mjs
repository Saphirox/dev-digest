#!/usr/bin/env node
// Step 1 of a self-review run: collect the diff, run the deterministic
// checks, route changed files to skills, and reuse cached reviews for
// (skill, file) pairs whose patch and skill haven't changed since the last run.
//
//   node .claude/skills/pr-self-review/scripts/prepare.mjs [--base <ref>]
//
// Writes .devdigest/self-review/runs/<diffHash>/ and prints a JSON summary
// whose `units` is the work left for the LLM reviewers.

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKILL_DIR, cacheDir, diffHash, ensureDir, git, hashDir, matchesAny, readJson,
  repoRoot, resolveBase, runDir, sha256,
} from './lib.mjs';
import { collectFiles } from './diff.mjs';
import { runChecks } from './checks.mjs';

const args = process.argv.slice(2);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined;

const toRanges = (lines) => {
  const ranges = [];
  for (const n of lines) {
    const last = ranges.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else ranges.push([n, n]);
  }
  return ranges;
};

function route(files, routing) {
  const units = new Map(routing.skills.map((r) => [r.skill, []]));
  const reviewable = files.filter((f) => f.status !== 'D' && !f.binary);
  const taken = new Set();
  for (const r of routing.skills.filter((r) => !r.fallback)) {
    for (const f of reviewable) {
      if (matchesAny(f.path, r.exclude)) continue;
      const byPath = matchesAny(f.path, r.include);
      const byTrigger = (r.triggers ?? []).some(
        (t) => matchesAny(f.path, t.scope) && f.addedText.some((line) => new RegExp(t.pattern, 'i').test(line)),
      );
      if (byPath || byTrigger) {
        units.get(r.skill).push(f);
        taken.add(f.path);
      }
    }
  }
  for (const r of routing.skills.filter((r) => r.fallback)) {
    for (const f of reviewable) {
      if (!taken.has(f.path) && matchesAny(f.path, r.include) && !matchesAny(f.path, r.exclude)) {
        units.get(r.skill).push(f);
      }
    }
  }
  return units;
}

function unroutedSkills(routing) {
  const known = new Set([...routing.skills.map((r) => r.skill), ...Object.keys(routing.excluded)]);
  const skillsRoot = join(repoRoot(), '.claude', 'skills');
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(skillsRoot, e.name, 'SKILL.md')) && !known.has(e.name))
    .map((e) => ({
      source: 'deterministic',
      skill: 'repo-rules',
      rule: 'unrouted-skill',
      severity: 'warning',
      file: `.claude/skills/${e.name}/SKILL.md`,
      line: 1,
      title: `Skill "${e.name}" is not in pr-self-review routing`,
      evidence: '',
      failure_scenario: `Changes in its area are never reviewed against it. Add it to .claude/skills/pr-self-review/references/routing.json (skills or excluded).`,
    }));
}

const base = resolveBase(baseArg);
const hash = diffHash(base);
const dir = runDir(hash);
rmSync(dir, { recursive: true, force: true });
ensureDir(join(dir, 'findings'));
ensureDir(join(dir, 'patches'));

const files = collectFiles(base);
const routing = readJson(join(SKILL_DIR, 'references', 'routing.json'));
const checks = runChecks(files, base);
checks.findings.push(...unroutedSkills(routing));

// Calibration docs are part of every cache key: changing the severity rubric
// or the reviewer prompt must re-review everything.
const calibration = sha256(
  ['severity.md', 'reviewer-prompt.md'].map((f) => readFileSync(join(SKILL_DIR, 'references', f), 'utf8')).join('\0'),
);
const skillHashes = {};
const units = [];
const cachedFindings = [];
const cachedUnits = [];

for (const [skill, routed] of route(files, routing)) {
  if (!routed.length) continue;
  skillHashes[skill] = hashDir(join(repoRoot(), '.claude', 'skills', skill));
  const todo = [];
  for (const f of routed) {
    const content = existsSync(join(repoRoot(), f.path)) ? readFileSync(join(repoRoot(), f.path)) : '';
    const cacheKey = sha256(`${skillHashes[skill]}|${calibration}|${f.path}|${f.patch}|${sha256(content)}`).slice(0, 24);
    const hit = readJson(join(cacheDir(), skill, `${cacheKey}.json`), null);
    if (hit) {
      cachedFindings.push(...hit.findings);
      cachedUnits.push({ skill, file: f.path });
    } else todo.push({ path: f.path, status: f.status, cacheKey, changedLines: toRanges(f.added) });
  }
  if (!todo.length) continue;
  const patchFile = join(dir, 'patches', `${skill}.diff`);
  writeFileSync(
    patchFile,
    routed
      .filter((f) => todo.some((t) => t.path === f.path))
      .map((f) => (f.untracked ? `+++ ${f.path} (new, untracked)\n${f.patch}` : f.patch))
      .join('\n'),
  );
  units.push({
    skill,
    skillFile: `.claude/skills/${skill}/SKILL.md`,
    patch: patchFile,
    findingsFile: join(dir, 'findings', `${skill}.json`),
    files: todo,
  });
}

cachedFindings.forEach((f, i) => (f.id = `cached-${i + 1}`));
writeFileSync(join(dir, 'findings', '_cached.json'), JSON.stringify({ skill: '(cache)', findings: cachedFindings }, null, 2));
checks.findings.forEach((f, i) => (f.id = `det-${i + 1}`));
writeFileSync(join(dir, 'checks.json'), JSON.stringify(checks, null, 2));
writeFileSync(
  join(dir, 'files.json'),
  JSON.stringify(files.map(({ path, oldPath, status, package: pkg, untracked, added }) => ({ path, oldPath, status, package: pkg, untracked, changedLines: toRanges(added) })), null, 2),
);
const meta = {
  diffHash: hash,
  base,
  head: git(['rev-parse', 'HEAD']).trim(),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
  createdAt: new Date().toISOString(),
  skillHashes,
  calibration,
};
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
writeFileSync(join(dir, 'plan.json'), JSON.stringify({ units, cachedUnits }, null, 2));

const count = (sev) => checks.findings.filter((f) => f.severity === sev).length;
console.log(
  JSON.stringify(
    {
      runDir: dir,
      diffHash: hash,
      base: `${base.ref} @ ${base.sha.slice(0, 9)}`,
      changedFiles: files.length,
      addedLines: files.reduce((n, f) => n + f.added.length, 0),
      deterministic: { critical: count('critical'), warning: count('warning'), ...checks.status },
      reusedFromCache: cachedUnits.length,
      units: units.map((u) => ({ skill: u.skill, files: u.files.map((f) => f.path), patch: u.patch, findingsFile: u.findingsFile })),
    },
    null,
    2,
  ),
);
