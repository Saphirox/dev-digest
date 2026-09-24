#!/usr/bin/env node
// Final step of a self-review run: merge deterministic + reviewer findings,
// apply the evidence / baseline / verification rules, fold duplicates, apply
// user overrides, write the report and the verdict the gate reads.
//
//   node .claude/skills/pr-self-review/scripts/verdict.mjs [<runDir>] [--staged]
//   node .claude/skills/pr-self-review/scripts/verdict.mjs [<runDir>] --override <findingId> --reason "<why it is a false positive>"
//
// Exit: 0 PASS · 2 BLOCK · 3 STALE (diff changed since prepare) · 4 INCOMPLETE (a reviewer produced no output)

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SKILL_DIR, cacheDir, diffHash, ensureDir, fingerprint, git, overridesPath, readJson,
  resolveBase, resolveStagedBase, runDir, stateDir,
} from './lib.mjs';

const SEVERITIES = ['critical', 'warning', 'suggestion'];
const rank = (s) => SEVERITIES.indexOf(s);

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const positional = args.find((a, i) => !a.startsWith('--') && !['--override', '--reason'].includes(args[i - 1]));

// The run's own meta decides the mode; --staged only picks the default runDir.
const currentHash = () => {
  const { base } = readJson(join(dir, 'meta.json'));
  return diffHash(base.staged ? resolveStagedBase(base.mergeBase.ref) : resolveBase(base.ref));
};
const dir = positional ?? runDir(diffHash(args.includes('--staged') ? resolveStagedBase() : resolveBase()));
if (!existsSync(join(dir, 'meta.json'))) {
  console.error(`No prepared run at ${dir} — run prepare.mjs first.`);
  process.exit(4);
}
const meta = readJson(join(dir, 'meta.json'));
const staged = !!meta.base.staged;
const label = staged ? 'Staged review' : 'Self-review';

if (currentHash() !== meta.diffHash) {
  const what = meta.base.staged ? 'the staged changes (or HEAD)' : 'the working tree';
  console.log(`STALE: ${what} changed after prepare (${meta.diffHash}). Re-run prepare.mjs; unchanged files come from cache.`);
  process.exit(3);
}

// ── Override: record the user's decision, then fall through to recompute ──
if (args.includes('--override')) {
  const id = flag('--override');
  const reason = (flag('--reason') ?? '').trim();
  const report = readJson(join(dir, 'report.json'), null);
  const target = report?.findings.find((f) => f.id === id);
  if (!target || reason.length < 10) {
    console.error(!target ? `No finding "${id}" in ${dir}/report.json` : 'An override needs a --reason of at least 10 characters.');
    process.exit(1);
  }
  const overrides = readJson(overridesPath(), []);
  overrides.push({
    fingerprint: target.fingerprint,
    skill: target.skill,
    rule: target.rule,
    file: target.file,
    title: target.title,
    reason,
    by: git(['config', 'user.name']).trim(),
    at: new Date().toISOString(),
  });
  ensureDir(stateDir());
  writeFileSync(overridesPath(), JSON.stringify(overrides, null, 2));
}

const files = new Map(readJson(join(dir, 'files.json')).map((f) => [f.path, f]));
const plan = readJson(join(dir, 'plan.json'));
const checks = readJson(join(dir, 'checks.json'));
const verification = readJson(join(dir, 'verification.json'), {});
const overrides = new Map(readJson(overridesPath(), []).map((o) => [o.fingerprint, o]));
const routing = readJson(join(SKILL_DIR, 'references', 'routing.json'));
const precedence = ['repo-rules', ...routing.skills.map((r) => r.skill)];

// ── Load reviewer output ──
const missing = [];
const raw = [...checks.findings];
const bySkill = new Map();
for (const unit of plan.units) {
  const out = readJson(unit.findingsFile, null);
  if (!out || !Array.isArray(out.findings)) {
    missing.push(unit.skill);
    continue;
  }
  out.findings.forEach((f, i) => {
    f.source = 'skill';
    f.skill = unit.skill;
    f.id ??= `${unit.skill}-${i + 1}`;
  });
  bySkill.set(unit.skill, out.findings);
  raw.push(...out.findings);
}
raw.push(...readJson(join(dir, 'findings', '_cached.json'), { findings: [] }).findings);

// ── Rules ──
const inChangedLines = (f) => {
  const file = files.get(f.file);
  const [from, to] = [Number(f.line), Number(f.endLine ?? f.line)];
  return file?.changedLines.some(([a, b]) => from <= b && to >= a);
};
const downgrade = (f, why) => {
  f.severity = 'warning';
  f.downgradedFrom = 'critical';
  f.downgradeReason = why;
};

const rejected = [];
const findings = [];
for (const f of raw) {
  if (!SEVERITIES.includes(f.severity)) f.severity = 'warning';
  f.fingerprint = fingerprint(f);
  const v = f.verification ?? verification[f.id];
  if (v) f.verification = v;

  if (f.source === 'skill' && f.severity === 'critical') {
    if (!f.rule || !f.evidence || !f.failure_scenario || !f.file || !f.line) downgrade(f, 'missing rule/evidence/failure_scenario');
    else if (!files.has(f.file)) downgrade(f, 'file is not part of this diff');
    else if (!inChangedLines(f)) {
      f.preExisting = true;
      downgrade(f, 'not on a changed line — pre-existing in the base');
    } else if (v?.status === 'rejected') {
      rejected.push(f);
      continue;
    } else if (v?.status === 'downgraded') downgrade(f, `verifier: ${v.note ?? ''}`.trim());
    else if (v?.status !== 'confirmed') f.unverified = true;
  }
  const o = overrides.get(f.fingerprint);
  if (o && f.severity === 'critical') f.override = o;
  findings.push(f);
}

// ── Fold duplicates: overlapping lines in one file → one finding, owned by the higher-precedence skill ──
const owner = (f) => (precedence.indexOf(f.skill) + 1 || 99);
findings.sort((a, b) => rank(a.severity) - rank(b.severity) || owner(a) - owner(b));
const kept = [];
for (const f of findings) {
  const [from, to] = [Number(f.line), Number(f.endLine ?? f.line)];
  // A critical never folds into an overridden host: overriding one skill's
  // finding must not silently waive another skill's critical on the same line.
  const host = kept.find(
    (k) =>
      k.file === f.file &&
      k.skill !== f.skill &&
      !(f.severity === 'critical' && !f.override && k.override) &&
      from <= Number(k.endLine ?? k.line) &&
      to >= Number(k.line),
  );
  if (host) (host.alsoReportedBy ??= []).push({ skill: f.skill, severity: f.severity, title: f.title });
  else kept.push(f);
}

const blocking = kept.filter((f) => f.severity === 'critical' && !f.override);
const verdict = missing.length ? 'INCOMPLETE' : blocking.length ? 'BLOCK' : 'PASS';

// ── Cache: a (skill, file) review is reusable unless it holds an unverified critical ──
for (const unit of plan.units) {
  const out = bySkill.get(unit.skill);
  if (!out) continue;
  for (const file of unit.files) {
    const mine = out.filter((f) => f.file === file.path);
    if (mine.some((f) => f.unverified)) continue;
    const clean = mine.map(({ unverified, override, alsoReportedBy, fingerprint: _, ...f }) => f);
    ensureDir(join(cacheDir(), unit.skill));
    writeFileSync(join(cacheDir(), unit.skill, `${file.cacheKey}.json`), JSON.stringify({ findings: clean }, null, 2));
  }
}

// ── Report ──
const loc = (f) => `${f.file}:${f.line}${f.endLine && f.endLine !== f.line ? `-${f.endLine}` : ''}`;
const item = (f) => {
  const lines = [`- **${f.title}** — \`${loc(f)}\` · ${f.skill} · \`${f.rule}\` · id \`${f.id}\``];
  if (f.failure_scenario) lines.push(`  - Failure: ${f.failure_scenario}`);
  if (f.evidence) lines.push(`  - Evidence: \`${String(f.evidence).replace(/`/g, "'").slice(0, 200)}\``);
  if (f.fix) lines.push(`  - Fix: ${f.fix}`);
  if (f.unverified) lines.push('  - ⚠ Not verified yet — run the verification step (SKILL.md step 4).');
  if (f.downgradeReason) lines.push(`  - Downgraded from critical: ${f.downgradeReason}`);
  if (f.override) lines.push(`  - Overridden by ${f.override.by}: ${f.override.reason}`);
  for (const o of f.alsoReportedBy ?? []) lines.push(`  - Also: ${o.skill} (${o.severity}) — ${o.title}`);
  return lines.join('\n');
};
const section = (title, list) => (list.length ? `## ${title} (${list.length})\n\n${list.map(item).join('\n')}\n` : '');
const bySev = (s) => kept.filter((f) => f.severity === s);
const overridden = kept.filter((f) => f.override);
const coverage = [
  ...plan.units.map((u) => `- ${u.skill}: ${u.files.map((f) => f.path).join(', ')}${missing.includes(u.skill) ? ' — **NO OUTPUT**' : ''}`),
  ...(plan.cachedUnits.length ? [`- from cache: ${plan.cachedUnits.map((c) => `${c.skill} → ${c.file}`).join(', ')}`] : []),
];

const md = [
  `# ${label}: ${verdict}`,
  '',
  `diff \`${meta.diffHash}\` · branch \`${meta.branch}\` · base ${meta.base.ref}@${meta.base.sha.slice(0, 9)} · ${files.size} files · ${meta.createdAt}`,
  '',
  missing.length ? `**Incomplete:** no reviewer output for ${missing.join(', ')}.\n` : '',
  section('Blocking criticals', blocking),
  section('Overridden criticals', overridden),
  section('Warnings', bySev('warning')),
  section('Suggestions', bySev('suggestion')),
  rejected.length ? `## Rejected by verifier (${rejected.length})\n\n${rejected.map((f) => `- ${f.title} — \`${loc(f)}\` · ${f.skill}: ${f.verification?.note ?? ''}`).join('\n')}\n` : '',
  `## Coverage\n\n${coverage.join('\n') || '- no files needed an LLM review'}\n- deterministic: ${Object.entries(checks.status).map(([k, v]) => `${k} ${v}`).join('; ') || 'ran'}\n`,
].join('\n');

const pr = [
  `### ${label}: ${verdict === 'PASS' ? 'PASS ✅' : verdict}`,
  '',
  `\`${staged ? 'staged-changes-review' : 'pr-self-review'}\` on diff \`${meta.diffHash}\` (${files.size} files). Skills: ${[...new Set([...plan.units.map((u) => u.skill), ...plan.cachedUnits.map((c) => c.skill)])].join(', ') || 'none needed'}; plus the repo-rule checks and arch:check (${checks.status.archCheck ?? 'n/a'}).`,
  overridden.length ? `\n**Criticals overridden as false positives (${overridden.length}):**\n${overridden.map((f) => `- ${f.title} — \`${loc(f)}\` (${f.skill}): ${f.override.reason}`).join('\n')}` : '',
  bySev('warning').length ? `\n**Open warnings (${bySev('warning').length}):**\n${bySev('warning').slice(0, 10).map((f) => `- ${f.title} — \`${loc(f)}\``).join('\n')}${bySev('warning').length > 10 ? '\n- …' : ''}` : '',
].join('\n');

const report = { verdict, meta, blocking: blocking.map((f) => f.id), missing, findings: kept, rejected };
writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
writeFileSync(join(dir, 'report.md'), md);
writeFileSync(join(dir, 'pr-section.md'), pr);
writeFileSync(
  join(stateDir(), staged ? 'latest-staged.json' : 'latest.json'),
  JSON.stringify({ diffHash: meta.diffHash, head: meta.head, verdict, runDir: dir, at: new Date().toISOString() }, null, 2),
);

console.log(
  JSON.stringify(
    {
      verdict,
      report: join(dir, 'report.md'),
      prSection: join(dir, 'pr-section.md'),
      blocking: blocking.map((f) => ({ id: f.id, title: f.title, at: loc(f), skill: f.skill, unverified: !!f.unverified })),
      counts: { critical: bySev('critical').length, warning: bySev('warning').length, suggestion: bySev('suggestion').length, overridden: overridden.length, rejected: rejected.length },
      missing,
    },
    null,
    2,
  ),
);
process.exit({ PASS: 0, BLOCK: 2, INCOMPLETE: 4 }[verdict]);
