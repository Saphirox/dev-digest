// Deterministic checks — the repo's hard rules (CLAUDE.md "Do not touch",
// naming conventions) plus `arch:check`. No LLM: each result is either proven
// by git/the filesystem or it isn't reported. Every check reports only what
// THIS diff introduced; pre-existing state is at most a warning.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { git, readTarget, repoRoot } from './lib.mjs';

const LARGE_DIFF_LINES = 1500;

const SECRET_PATTERNS = [
  ['OpenAI/OpenRouter/Anthropic key', /\bsk-(?:or-v1-|ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
];

const d = (rule, severity, file, line, title, failure_scenario, extra = {}) => ({
  source: 'deterministic',
  skill: 'repo-rules',
  rule,
  severity,
  file,
  line,
  title,
  evidence: extra.evidence ?? '',
  failure_scenario,
  ...extra,
});

function existsAt(sha, path) {
  try {
    git(['cat-file', '-e', `${sha}:${path}`], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

function contentAt(sha, path) {
  try {
    return git(['show', `${sha}:${path}`], { quiet: true });
  } catch {
    return null;
  }
}

// Working tree normally; the index in staged mode (lib.readTarget).
const readWorking = (path, base) => readTarget(path, base)?.toString('utf8') ?? null;

function migrations(files, base) {
  // "Merged" means present in main — in staged mode HEAD may hold unmerged ones.
  base = base.mergeBase ?? base;
  return files
    .filter(
      (f) =>
        ['M', 'D', 'R'].includes(f.status) &&
        /^server\/src\/db\/migrations\/(?:[^/]+\.sql|meta\/\d+_snapshot\.json)$/.test(f.oldPath ?? f.path) &&
        existsAt(base.sha, f.oldPath ?? f.path),
    )
    .map((f) =>
      d(
        'migration-immutable',
        'critical',
        f.oldPath ?? f.path,
        f.added[0] ?? 1,
        'Merged migration edited, renamed or deleted',
        'Every database that already applied this migration keeps the old version; drizzle tracks it by hash/tag, so the change never runs there (or the journal breaks) and schemas diverge. Add a new migration instead (CLAUDE.md "Do not touch").',
      ),
    );
}

function lockfiles(files) {
  const out = [];
  const changed = new Set(files.map((f) => f.path));
  for (const f of files) {
    const name = basename(f.path);
    const dir = dirname(f.path);
    const competing =
      f.status === 'A' &&
      ((name === 'pnpm-lock.yaml' && /^(reviewer-core|e2e)$/.test(dir)) ||
        (name === 'package-lock.json' && /^(server|client)$/.test(dir)) ||
        name === 'pnpm-workspace.yaml');
    if (competing) {
      out.push(
        d(
          'competing-lockfile',
          'critical',
          f.path,
          1,
          `Stray ${name} — wrong package manager for ${dir}`,
          'server/client are pnpm, reviewer-core/e2e are npm; a second lockfile makes installs non-deterministic and CI resolves different versions than local. Delete the file (CLAUDE.md "Do not touch").',
        ),
      );
    } else if (
      ['pnpm-lock.yaml', 'package-lock.json'].includes(name) &&
      f.status === 'M' &&
      !changed.has(join(dir, 'package.json'))
    ) {
      out.push(
        d(
          'lockfile-without-manifest',
          'warning',
          f.path,
          1,
          'Lockfile changed but its package.json did not',
          'Usually a hand-edit or an accidental reinstall with a different tool version; the diff churns without a dependency change. Revert it unless the update was intended.',
        ),
      );
    }
  }
  return out;
}

function sharedContracts(files, base) {
  const out = [];
  const seen = new Set();
  for (const f of files) {
    const m = /^(server|client)\/src\/vendor\/shared\/(.+)$/.exec(f.path);
    if (!m || seen.has(m[2])) continue;
    seen.add(m[2]);
    const server = `server/src/vendor/shared/${m[2]}`;
    const client = `client/src/vendor/shared/${m[2]}`;
    if (readWorking(server, base) === readWorking(client, base)) continue;
    const driftedBefore = contentAt(base.sha, server) !== contentAt(base.sha, client);
    out.push(
      d(
        'shared-contract-drift',
        driftedBefore ? 'warning' : 'critical',
        f.path,
        f.added[0] ?? 1,
        driftedBefore
          ? 'vendor/shared copies already differed before this change'
          : 'Contract changed on one side only (server vs client vendor/shared)',
        `The API serializes with server/${'src/vendor/shared'} while the web app parses with its own copy; a field added/renamed on one side fails zod parsing or is silently dropped on the other. Mirror the change into ${f.path.startsWith('server') ? client : server}.`,
        { preExisting: driftedBefore },
      ),
    );
  }
  return out;
}

function e2eSpecs(files) {
  return files
    .filter((f) => /^e2e\/specs\/[^/]+\.flow\.json$/.test(f.path))
    .map((f) =>
      d(
        'e2e-spec-changed',
        'warning',
        f.path,
        f.added[0] ?? 1,
        'e2e flow spec changed',
        'Flow specs are the deterministic contract of the e2e suite; read e2e/AGENTS.md and confirm the change is intentional, not a re-recording that hides a regression.',
      ),
    );
}

function secrets(files) {
  const out = [];
  for (const f of files) {
    const name = basename(f.path);
    if (f.status !== 'D' && (/^\.env(\..+)?$/.test(name) && !/example|sample|template/.test(name) || name === 'secrets.json')) {
      out.push(
        d(
          'secret-file',
          'critical',
          f.path,
          1,
          `${name} is part of the change`,
          'Secrets belong in ~/.devdigest/secrets.json (mode 0600), never in git — once pushed, the value must be treated as leaked and rotated.',
        ),
      );
    }
    f.addedText.forEach((text, i) => {
      for (const [label, re] of SECRET_PATTERNS) {
        const hit = re.exec(text);
        if (hit) {
          out.push(
            d(
              'secret-in-diff',
              'critical',
              f.path,
              f.added[i],
              `Looks like a ${label}`,
              'A credential committed to git is readable by everyone with repo access and stays in history after deletion; rotate it and load it from ~/.devdigest/secrets.json.',
              { evidence: `${hit[0].slice(0, 8)}…` },
            ),
          );
        }
      }
    });
  }
  return out;
}

function dbTestNaming(files, base) {
  return files
    .filter(
      (f) =>
        ['A', 'R'].includes(f.status) &&
        /^server\/test\/.+\.test\.ts$/.test(f.path) &&
        !f.path.endsWith('.it.test.ts') &&
        /helpers\/pg|testcontainers/.test(readWorking(f.path, base) ?? ''),
    )
    .map((f) =>
      d(
        'db-test-naming',
        'critical',
        f.path,
        1,
        'DB-backed server test is not named *.it.test.ts',
        'The unit run (server-unit CI) picks it up and fails without Docker/Postgres, or the integration run never executes it (CLAUDE.md naming conventions).',
      ),
    );
}

/**
 * Runs dependency-cruiser and keeps only violations this diff introduced:
 * the importing file is new, or the offending import specifier is on an
 * added line. Known debt stays out of the verdict — the config itself says
 * "new code must not add to it", so a NEW edge of a `warn` rule still blocks.
 */
function archCheck(files) {
  const touched = files.filter(
    (f) => f.status !== 'D' && /^(server\/src|reviewer-core\/src)\/.+\.ts$/.test(f.path),
  );
  if (!touched.length) return { findings: [], status: 'not-needed' };
  const serverDir = join(repoRoot(), 'server');
  const bin = join(serverDir, 'node_modules', '.bin', 'depcruise');
  const config = join(serverDir, '.dependency-cruiser.cjs');
  if (!existsSync(bin) || !existsSync(config)) {
    return { findings: [], status: `skipped: ${!existsSync(bin) ? 'server deps not installed' : 'no .dependency-cruiser.cjs'}` };
  }
  let result;
  try {
    const out = execFileSync(bin, ['src', '../reviewer-core/src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'], {
      cwd: serverDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    result = JSON.parse(out);
  } catch (err) {
    // depcruise exits non-zero when `error` rules fire but still prints JSON.
    try {
      result = JSON.parse(err.stdout);
    } catch {
      return {
        findings: [d('arch-check-failed', 'warning', 'server/.dependency-cruiser.cjs', 1, 'arch:check could not run', String(err.stderr || err.message).slice(0, 400))],
        status: 'failed',
      };
    }
  }
  const byPath = new Map(touched.map((f) => [f.path, f]));
  const toRepo = (p) => (p.startsWith('../') ? p.slice(3) : `server/${p}`);
  const findings = [];
  let preExisting = 0;
  for (const v of result.summary?.violations ?? []) {
    const file = byPath.get(toRepo(v.from));
    const spec = v.unresolvedTo ?? v.to;
    const idx = file ? file.addedText.findIndex((t) => t.includes(`'${spec}'`) || t.includes(`"${spec}"`)) : -1;
    const isNew = file && (file.status === 'A' || idx !== -1);
    if (!isNew) {
      preExisting++;
      continue;
    }
    findings.push(
      d(
        `arch:${v.rule.name}`,
        'critical',
        file.path,
        idx === -1 ? 1 : file.added[idx],
        `New ${v.rule.name} violation: imports ${toRepo(v.to ?? spec)}`,
        `This import breaks the onion dependency rule (${v.rule.name}, ${v.rule.severity} in server/.dependency-cruiser.cjs); new code must not add to it. See .claude/skills/onion-architecture.`,
        { evidence: spec },
      ),
    );
  }
  return { findings, status: `ran: ${findings.length} new, ${preExisting} pre-existing ignored` };
}

function diffSize(files) {
  const lines = files.reduce((n, f) => n + f.added.length, 0);
  return lines > LARGE_DIFF_LINES
    ? [
        d(
          'diff-too-large',
          'warning',
          '(whole diff)',
          0,
          `${lines} added lines — consider splitting the PR`,
          'Review quality (human and LLM) drops sharply on large diffs; findings get missed.',
        ),
      ]
    : [];
}

export function runChecks(files, base) {
  if (!files.length) return { findings: [], status: {} };
  const arch = archCheck(files);
  return {
    findings: [
      ...migrations(files, base),
      ...lockfiles(files),
      ...sharedContracts(files, base),
      ...secrets(files),
      ...dbTestNaming(files, base),
      ...arch.findings,
      ...e2eSpecs(files),
      ...diffSize(files),
    ],
    status: { archCheck: arch.status },
  };
}
