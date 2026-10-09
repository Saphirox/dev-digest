import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalCase,
  EvalCaseFromFindingInput,
  EvalCaseFromFindingResult,
  EvalCaseInput,
  EvalCaseResult,
  EvalCaseUpdate,
  EvalDashboard,
  EvalOverview,
  EvalPeriod,
  EvalRunAccepted,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  type Provider,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DEFAULT_EVAL_PERIOD, EVAL_RUN_RATE_LIMIT } from './constants.js';
import { createEvalEngine } from './engine.js';
import { EvalsRepository } from './repository.js';
import { EvalsService } from './service.js';
import { EvalSuiteRunner } from './suite-runner.js';
import type { EvalAgentSource } from './ports.js';

const PeriodQuery = z.object({ period: EvalPeriod.default(DEFAULT_EVAL_PERIOD) });
const Ok = z.object({ ok: z.literal(true) });

/**
 * evals module (SPEC-0003).
 *   POST   /findings/:id/eval-case         → turn a finding into an eval case (201, or 200 if it already was one)
 *   GET    /agents/:id/eval-cases          → the agent's eval set, each with its latest result
 *   POST   /agents/:id/eval-cases          → create a case by hand
 *   PUT    /eval-cases/:id                 → edit name / expected output
 *   DELETE /eval-cases/:id                 → delete a case
 *   POST   /eval-cases/:id/run             → review one case now (rate-limited, spends a model call)
 *   POST   /agents/:id/eval-runs           → start a suite run in the background (202, rate-limited)
 *   GET    /agents/:id/eval-runs?period=   → suite runs, newest first
 *   GET    /eval-runs/:id                  → one run with its effective prompt and case results
 *   GET    /agents/:id/eval-dashboard?period= → tiles, deltas, trend, regression
 *   GET    /eval/overview                  → Eval Dashboard: agents with cases + recent runs
 */
export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const store = new EvalsRepository(container.db);

  const agents: EvalAgentSource = {
    getAgent: async (workspaceId, agentId) => {
      const row = await container.agentsRepo.getById(workspaceId, agentId);
      return row
        ? {
            id: row.id,
            name: row.name,
            version: row.version,
            provider: row.provider,
            model: row.model,
            strategy: row.strategy,
            systemPrompt: row.systemPrompt,
          }
        : undefined;
    },
    enabledSkills: (agentId) => container.agentsRepo.enabledSkillsForPrompt(agentId),
  };

  // The provider is resolved per review, so a missing key fails the run, not the plugin.
  const engine = createEvalEngine((provider) => container.llm(provider as Provider));
  const logger = app.log;
  const runner = new EvalSuiteRunner({ store, engine, logger });
  const service = new EvalsService({ store, agents, runner, logger });

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        body: EvalCaseFromFindingInput,
        response: { 200: EvalCaseFromFindingResult, 201: EvalCaseFromFindingResult },
      },
    },
    async (req, reply): Promise<EvalCaseFromFindingResult> => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.createFromFinding(workspaceId, req.params.id, req.body);
      reply.status(result.created ? 201 : 200);
      return result;
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCase) } } },
    async (req): Promise<EvalCase[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 201: EvalCase } } },
    async (req, reply): Promise<EvalCase> => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseUpdate, response: { 200: EvalCase } } },
    async (req): Promise<EvalCase> => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req): Promise<{ ok: true }> => {
      const { workspaceId } = await getContext(container, req);
      await service.deleteCase(workspaceId, req.params.id);
      return { ok: true };
    },
  );

  // Spends a model call: at least as tight as POST /pulls/:id/review (NFR-4).
  app.post(
    '/eval-cases/:id/run',
    {
      schema: { params: IdParams, response: { 200: EvalCaseResult } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req): Promise<EvalCaseResult> => {
      const { workspaceId } = await getContext(container, req);
      return service.runCase(workspaceId, req.params.id);
    },
  );

  // Spends one model call per case, in the background (NFR-4).
  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalRunAccepted } },
      config: { rateLimit: EVAL_RUN_RATE_LIMIT },
    },
    async (req, reply): Promise<EvalRunAccepted> => {
      const { workspaceId } = await getContext(container, req);
      const accepted = await service.startSuiteRun(workspaceId, req.params.id);
      reply.status(202);
      return accepted;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, querystring: PeriodQuery, response: { 200: z.array(EvalSuiteRun) } } },
    async (req): Promise<EvalSuiteRun[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id, req.query.period);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunDetail } } },
    async (req): Promise<EvalSuiteRunDetail> => {
      const { workspaceId } = await getContext(container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, querystring: PeriodQuery, response: { 200: EvalDashboard } } },
    async (req): Promise<EvalDashboard> => {
      const { workspaceId } = await getContext(container, req);
      return service.dashboard(workspaceId, req.params.id, req.query.period);
    },
  );

  app.get(
    '/eval/overview',
    { schema: { response: { 200: EvalOverview } } },
    async (req): Promise<EvalOverview> => {
      const { workspaceId } = await getContext(container, req);
      return service.overview(workspaceId);
    },
  );
}
