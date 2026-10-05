import { describe, expect, it } from "vitest";
import { detect, evalNames } from "./ci-detect.mjs";

const available = { skills: ["dependency-checker"], agents: ["architecture-reviewer"] };
const run = (changed, target) => detect(changed, target, available);

describe("ci-detect", () => {
  it("a changed skill with evals runs its suite only", () => {
    const r = run([".claude/skills/dependency-checker/SKILL.md"]);
    expect(r).toMatchObject({ skills: ["dependency-checker"], agents: [], runWorkflow: false });
  });

  it("a changed skill without evals is skipped, not failed", () => {
    const r = run([".claude/skills/zod/SKILL.md"]);
    expect(r).toMatchObject({ skills: [], skippedSkills: ["zod"], runWorkflow: false });
  });

  it("a changed agent runs its suite AND the workflow tier", () => {
    const r = run([".claude/agents/architecture-reviewer.md"]);
    expect(r).toMatchObject({ agents: ["architecture-reviewer"], runWorkflow: true });
  });

  it("an agent without evals is skipped but still triggers the workflow tier", () => {
    const r = run([".claude/agents/brainstorm.md"]);
    expect(r).toMatchObject({ agents: [], skippedAgents: ["brainstorm"], runWorkflow: true });
  });

  it("the agents README is not an agent", () => {
    const r = run([".claude/agents/README.md"]);
    expect(r).toMatchObject({ agents: [], skippedAgents: [], runWorkflow: false });
  });

  it("edited fixtures run the owning suite", () => {
    const r = run(["evals/agents/architecture-reviewer/fixtures/blast-layering.diff"]);
    expect(r.agents).toEqual(["architecture-reviewer"]);
  });

  it.each(["CLAUDE.md", "AGENTS.md", ".claude/settings.json", "evals/workflow/review-workflow.cases.ts"])(
    "%s triggers the workflow tier",
    (f) => expect(run([f]).runWorkflow).toBe(true),
  );

  it("a module AGENTS.md does not trigger the workflow tier", () => {
    expect(run(["server/AGENTS.md"]).runWorkflow).toBe(false);
  });

  it.each(["evals/src/config.ts", "evals/package.json", "evals/proxy/litellm.config.yaml", ".github/workflows/evals.yml"])(
    "engine change %s runs everything",
    (f) => expect(run([f])).toMatchObject({ ...available, runWorkflow: true }),
  );

  it("unrelated changes run nothing", () => {
    expect(run(["server/src/app.ts"])).toMatchObject({ skills: [], agents: [], runWorkflow: false });
  });

  it("EVAL_TARGET overrides detection", () => {
    expect(run([], "all")).toMatchObject({ ...available, runWorkflow: true });
    expect(run([], "workflow")).toMatchObject({ skills: [], agents: [], runWorkflow: true });
    expect(run([], "agents/architecture-reviewer")).toMatchObject({ agents: ["architecture-reviewer"], skills: [] });
    expect(() => run([], "skills/zod")).toThrow(/no evals/);
    expect(() => run([], "bogus")).toThrow(/unknown EVAL_TARGET/);
  });

  it("evalNames lists only folders holding an *.eval.ts", () => {
    expect(evalNames("agents")).toContain("architecture-reviewer");
    expect(evalNames("skills")).toContain("dependency-checker");
  });
});
