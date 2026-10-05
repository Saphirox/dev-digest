/**
 * CI change detector for the harness evals (.github/workflows/evals.yml, job `detect`).
 *
 * Maps the PR's changed files (repo-relative, newline-separated in $CHANGED_FILES) onto the eval
 * suites that should run:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → evals/agents/<name>  (tool tier)
 *   root CLAUDE.md / AGENTS.md, .claude/settings.json, any agent, evals/workflow/**
 *                                                           → the workflow tier
 *   the eval engine itself (evals/src, deps, proxy, vitest config, this script, the workflow)
 *                                                           → everything that has evals
 *
 * CLAUDE.md is a symlink to AGENTS.md, so an edit to the instructions shows up in the diff as
 * AGENTS.md — both names must trigger the workflow tier.
 *
 * $EVAL_TARGET (workflow_dispatch) overrides detection: auto (default) | all | skills | agents |
 * workflow | skills/<name> | agents/<name>.
 *
 * A changed artifact with NO written evals is not a failure: it lands on `skipped_*` so the job
 * prints a visible "no evals" notice instead of going red.
 *
 * Emits GitHub Actions step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents)
 * to $GITHUB_OUTPUT. Pure filesystem + string work — no deps, runs on bare `node`.
 */

import { existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const ENGINE = [
  /^evals\/src\//,
  /^evals\/proxy\//,
  /^evals\/scripts\//,
  /^evals\/(package\.json|pnpm-lock\.yaml|vitest\.config\.ts|tsconfig\.json)$/,
  /^\.github\/workflows\/evals\.yml$/,
];

const WORKFLOW_TRIGGERS = [
  /^(CLAUDE|AGENTS)\.md$/,
  /^\.claude\/CLAUDE\.md$/,
  /^\.claude\/settings\.json$/,
  /^\.claude\/agents\/(?!README\.md$)[^/]+\.md$/,
  /^evals\/workflow\//,
];

/** Names under evals/<tier>/ whose folder holds at least one *.eval.ts. */
export function evalNames(tier, evalsDir = EVALS_DIR) {
  const dir = join(evalsDir, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && readdirSync(join(dir, d.name)).some((f) => f.endsWith(".eval.ts")))
    .map((d) => d.name)
    .sort();
}

function touched(changed, reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/**
 * Pure decision: which suites to run.
 * @param {string[]} changed  repo-relative changed paths
 * @param {string} target     EVAL_TARGET value
 * @param {{skills: string[], agents: string[]}} available  names that have evals
 */
export function detect(changed, target, available) {
  const all = { skills: available.skills, agents: available.agents, runWorkflow: true, skippedSkills: [], skippedAgents: [] };
  const none = { skills: [], agents: [], runWorkflow: false, skippedSkills: [], skippedAgents: [] };

  switch (target || "auto") {
    case "all":
      return all;
    case "skills":
      return { ...none, skills: available.skills };
    case "agents":
      return { ...none, agents: available.agents };
    case "workflow":
      return { ...none, runWorkflow: true };
    case "auto":
      break;
    default: {
      const m = /^(skills|agents)\/([^/]+)$/.exec(target);
      if (!m) throw new Error(`unknown EVAL_TARGET: ${target}`);
      if (!available[m[1]].includes(m[2])) throw new Error(`no evals for ${target}`);
      return { ...none, [m[1]]: [m[2]] };
    }
  }

  if (changed.some((f) => ENGINE.some((re) => re.test(f)))) return all;

  const skillNames = touched(changed, /^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
  const agentNames = touched(changed, /^\.claude\/agents\/(?!README\.md$)([^/]+)\.md$/, /^evals\/agents\/([^/]+)\//);

  return {
    skills: skillNames.filter((n) => available.skills.includes(n)),
    agents: agentNames.filter((n) => available.agents.includes(n)),
    runWorkflow: changed.some((f) => WORKFLOW_TRIGGERS.some((re) => re.test(f))),
    skippedSkills: skillNames.filter((n) => !available.skills.includes(n)),
    skippedAgents: agentNames.filter((n) => !available.agents.includes(n)),
  };
}

function main() {
  const changed = (process.env.CHANGED_FILES ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const r = detect(changed, process.env.EVAL_TARGET, { skills: evalNames("skills"), agents: evalNames("agents") });

  const out = process.env.GITHUB_OUTPUT;
  const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));
  write("skills", JSON.stringify(r.skills));
  write("agents", JSON.stringify(r.agents));
  write("run_workflow", String(r.runWorkflow));
  write("skipped_skills", r.skippedSkills.join(" "));
  write("skipped_agents", r.skippedAgents.join(" "));

  console.error("── eval change detection ──");
  console.error(`target        : ${process.env.EVAL_TARGET || "auto"}`);
  console.error(`changed files : ${changed.length}`);
  console.error(`skills → run  : ${r.skills.join(", ") || "(none)"}`);
  console.error(`agents → run  : ${r.agents.join(", ") || "(none)"}`);
  console.error(`workflow tier : ${r.runWorkflow ? "run" : "skip"}`);
  for (const n of r.skippedSkills) console.log(`::notice title=No evals::skill "${n}" changed but has no evals/skills/${n}/*.eval.ts`);
  for (const n of r.skippedAgents) console.log(`::notice title=No evals::agent "${n}" changed but has no evals/agents/${n}/*.eval.ts`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
