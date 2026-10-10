# 0017 — Eval CI on the Anthropic API key

**Status:** ready
**Execution mode:** single-agent
**Spec:** none — small infra change agreed in conversation
**Citations valid as of:** `269a2c6`

## Goal
Run the `@devdigest/evals` GitHub Actions workflow on an Anthropic API key only, with no
OpenRouter and no LiteLLM proxy. OpenRouter stays available as a local-only backend.

## Decisions
- New backend `EVAL_BACKEND=anthropic`: the Agent SDK calls api.anthropic.com with
  `ANTHROPIC_API_KEY`. CI sets it unconditionally — no priority/fallback logic.
- The local default stays `subscription`, which strips any API key, so a key exported in a shell
  never bills local runs by accident. Local use of the key is an explicit `EVAL_BACKEND=anthropic`.
- CI model defaults: test `claude-haiku-5-5`, judge `claude-sonnet-5-5` (a stronger family,
  independent of the test model), workflow tier = test model. Overridable by `workflow_dispatch`
  inputs, then repo Variables.
- `run-openrouter.ts`, `proxy/`, `scripts/litellm-proxy.sh` and the `openai` dependency stay for
  local cheap-model runs; removing them is a separate follow-up.
- The workflow tier stays advisory for now.

## Steps
1. `evals/src/runtime/env.ts` — add the `anthropic` branch to `subscriptionEnv()`: require
   `ANTHROPIC_API_KEY` (throw if missing), keep it, delete `ANTHROPIC_BASE_URL` and
   `ANTHROPIC_AUTH_TOKEN`. Update the header comment. Exported names unchanged.
2. `evals/src/runtime/dispatch.ts` — comment only (non-`openrouter` backends already use
   `runClaude`).
3. `evals/src/runtime/env.test.ts` — `subscriptionEnv()` cases: `anthropic` keeps the key and
   clears base URL / auth token; `anthropic` without a key throws; `subscription` strips the key.
   `BACKEND` is read at module load → `vi.resetModules()` + dynamic import per case.
4. `.github/workflows/evals.yml` — `EVAL_BACKEND: anthropic`; Anthropic model defaults; the
   `key` step checks `secrets.ANTHROPIC_API_KEY`; model jobs get `ANTHROPIC_API_KEY` and lose
   `OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL`; delete every proxy step (ephemeral key,
   `docker compose up`, `proxy:wait`, log dump, `down`); update header comment and input
   descriptions.
5. `evals/README.md` — `anthropic` row + example in "Runners"; rewrite the GitHub Actions
   section (secret, model defaults, no proxy); OpenRouter marked local-only.
   `evals/package.json` — `description`.
6. Root `INSIGHTS.md` — record the CI backend decision and why the key isn't auto-preferred
   locally.

## Verification
- `pnpm --dir evals typecheck`; `pnpm --dir evals vitest run src/ scripts/`.
- `actionlint .github/workflows/evals.yml` if installed, else a YAML parse.
- `grep -n OPENROUTER .github/workflows/evals.yml` → no matches.
- No real-model run by the implementer. End-to-end: add the `ANTHROPIC_API_KEY` repo secret,
  then Actions → evals → Run workflow with `target: skills/dependency-checker`.
