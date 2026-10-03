import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBrief } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';
import { BRIEF_SCHEMA_NAME, BriefModelOutput } from './prompt.js';
import type { BriefBlastIndex, BriefModel, IssueSource, SpecDocsSource } from './ports.js';

/**
 * brief module.
 *   GET  /pulls/:id/brief  → the stored PR Brief, or null (no model call)
 *   POST /pulls/:id/brief  → (re)generate it — ONE `risk_brief` model call
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const index: BriefBlastIndex = {
    getBlastRadius: (repoId, files) => container.repoIntel.getBlastRadius(repoId, files),
    getIndexedSha: async (repoId) => (await container.repoIntel.getIndexState(repoId)).lastIndexedSha || null,
  };

  // Resolved lazily so a missing GITHUB_TOKEN surfaces inside the service
  // (counted as an unfetchable issue) instead of failing plugin registration.
  const issues: IssueSource = { resolve: () => container.github() };

  // Documents attached to the workspace's enabled agents and their enabled
  // skills; the service decides which paths to merge, Project Context reads
  // them once under its own caps.
  const specs: SpecDocsSource = {
    listEnabledAgents: (workspaceId) => container.agentsRepo.listEnabled(workspaceId),
    skillPaths: (agentId) => container.agentsRepo.enabledSkillContextPaths(agentId),
    loadDocs: async (input) => (await container.projectContext.loadForRun(input))?.docs ?? [],
  };

  const model: BriefModel = {
    generate: async (workspaceId, messages) => {
      const { choice, result } = await container.featureModels.completeStructured(workspaceId, 'risk_brief', {
        schema: BriefModelOutput,
        schemaName: BRIEF_SCHEMA_NAME,
        messages,
        temperature: 0.1,
      });
      return {
        data: result.data,
        model: result.model,
        provider: choice.provider,
        costUsd: result.costUsd,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
      };
    },
  };

  // One service per plugin instance, so the in-flight map lives for the whole
  // process and concurrent generates share one model call.
  const service = new BriefService({ store: new BriefRepository(container.db), index, issues, specs, model });

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBrief.nullable() } } },
    async (req): Promise<PrBrief | null> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  // Spends money (one model call) — same rate-limit guard as POST /review.
  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBrief } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrBrief> => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
