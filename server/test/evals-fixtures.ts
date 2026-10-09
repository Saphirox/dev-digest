import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Finding, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import type { PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/** Shared fixtures for the evals `.it` suites (not a test file: vitest only runs `*.test.ts`). */

type Db = PgFixture['handle']['db'];

export const CONFIG_PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
export const USERS_PATCH = '@@ -40,3 +40,4 @@\n   const rows = await db.select();\n+  const getUsers = rows.map(load);\n   return rows;';
export const OTHER_PATCH = '@@ -1,2 +1,3 @@\n import a;\n+import otherThing;\n export {};';

/** A unified diff with headers, for manual cases. */
export const diffFor = (path: string, patch: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${patch}`;

export const review = (findings: Pick<Finding, 'file' | 'start_line'>[] = []): Review => ({
  verdict: 'comment',
  summary: 's',
  score: 80,
  findings: findings.map((f, i) => ({
    id: `f-${i}`,
    severity: 'WARNING',
    category: 'bug',
    title: `Finding ${i}`,
    file: f.file,
    start_line: f.start_line,
    end_line: f.start_line,
    rationale: 'r',
    confidence: 0.9,
  })),
});

/**
 * Scripted provider: records every structured call, can be slow, and answers
 * from `respond(callNumber, promptText)` (a Review, or an Error to throw).
 */
export class ScriptedLLM extends MockLLMProvider {
  n = 0;
  delayMs = 0;
  /** Cost per call; `null` makes that call's cost unknown (EC-12). */
  cost: (n: number) => number | null = () => 0.01;
  prompts: string[] = [];
  respond: (n: number, prompt: string) => Review | Error = () => review();

  constructor(id: 'openai' | 'anthropic' | 'openrouter' = 'openai') {
    super(id);
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const n = ++this.n;
    const prompt = req.messages.map((m) => m.content).join('\n');
    this.prompts.push(prompt);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const out = this.respond(n, prompt);
    if (out instanceof Error) throw out;
    return {
      data: req.schema.parse(out),
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: this.cost(n),
      raw: '',
      attempts: 1,
    };
  }
}

export interface AppOptions {
  llm?: MockLLMProvider;
  nodeEnv?: 'test' | 'development';
}

export function makeApp(pg: PgFixture, opts: AppOptions = {}): Promise<FastifyInstance> {
  return buildApp({
    config: loadConfig({ ...process.env, NODE_ENV: opts.nodeEnv ?? 'test' } as NodeJS.ProcessEnv),
    db: pg.handle.db,
    overrides: {
      embedder: new MockEmbedder(),
      git: new MockGitClient(),
      github: new MockGitHubClient(),
      // Both providers: an un-overridden `openrouter` would build a LIVE paid provider.
      llm: { openai: opts.llm ?? new ScriptedLLM(), openrouter: new MockLLMProvider('openrouter') },
    },
  });
}

let seq = 0;

export async function defaultWorkspaceId(db: Db): Promise<string> {
  const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
  return ws!.id;
}

export async function createAgent(app: FastifyInstance, name?: string): Promise<{ id: string; version: number }> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: { name: name ?? `Eval agent ${seq++}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'ORIGINAL system prompt.' },
  });
  return res.json();
}

/** A repo + PR with the given stored file rows. */
export async function seedPr(db: Db, workspaceId: string, files: { path: string; patch: string | null }[]) {
  const name = `evals-${seq++}`;
  const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({ workspaceId, repoId: repo!.id, number: 1, title: 'PR', author: 'a', branch: 'b', base: 'main', headSha: 'sha', status: 'needs_review' })
    .returning();
  for (const f of files) await db.insert(t.prFiles).values({ prId: pr!.id, path: f.path, patch: f.patch });
  return pr!;
}

export async function seedReview(db: Db, workspaceId: string, prId: string, agentId: string | null) {
  const [row] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 80, model: 'm' })
    .returning();
  return row!;
}

export async function seedFinding(
  db: Db,
  reviewId: string,
  f: { file: string; start: number; end?: number; decision?: 'accepted' | 'dismissed'; title?: string },
) {
  const [row] = await db
    .insert(t.findings)
    .values({
      reviewId,
      file: f.file,
      startLine: f.start,
      endLine: f.end ?? f.start,
      severity: 'CRITICAL',
      category: 'security',
      title: f.title ?? `Finding at ${f.file}:${f.start}`,
      rationale: 'r',
      confidence: 0.9,
      acceptedAt: f.decision === 'accepted' ? new Date() : null,
      dismissedAt: f.decision === 'dismissed' ? new Date() : null,
    })
    .returning();
  return row!;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls `GET /eval-runs/:id` until the run leaves `running`. */
export async function waitForSuiteRun(app: FastifyInstance, runId: string, timeoutMs = 10_000) {
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
    const body = res.json();
    if (body.status !== 'running' || Date.now() - start > timeoutMs) return body;
    await sleep(25);
  }
}
