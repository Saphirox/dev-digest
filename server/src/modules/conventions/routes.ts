import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionSkillDraft,
} from '@devdigest/shared';
import { ConventionPatch } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import { EXTRACTION_SCHEMA_NAME, ExtractionSchema, buildMessages } from './prompt.js';
import type { ExtractorModel, RepoSource } from './ports.js';

/**
 * Conventions module. Transport + wiring of the service's ports to the
 * container (repo-intel ranking, git clone, ripgrep, the `conventions`
 * feature model).
 *   GET    /repos/:id/conventions          → candidates + last-scan meta
 *   POST   /repos/:id/conventions/extract  → scan the repo, store grounded candidates
 *   POST   /repos/:id/conventions/skill    → accepted ones as a skill DRAFT (save via POST /skills)
 *   PATCH  /conventions/:id                → edit rule / category / status
 *   DELETE /conventions/:id                → remove
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const source: RepoSource = {
    topFiles: (repoId, n) => container.repoIntel.getConventionSamples(repoId, n),
    readFile: (repo, path) => container.git.readFile(repo, path),
    countFiles: async (repo, pattern) => {
      try {
        const matches = await container.codeIndex.grep(repo, pattern);
        return new Set(matches.map((m) => m.path)).size;
      } catch {
        return null; // invalid regex or ripgrep unavailable: frequency unknown
      }
    },
  };

  const model: ExtractorModel = {
    extract: async (workspaceId, { repoName, sample }) => {
      const choice = await resolveFeatureModel(container, workspaceId, 'conventions');
      const llm = await container.llm(choice.provider);
      const res = await llm.completeStructured({
        model: choice.model,
        schema: ExtractionSchema,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: buildMessages(repoName, sample),
        temperature: 0.1,
      });
      return { candidates: res.data.candidates, model: res.model, costUsd: res.costUsd };
    },
  };

  const service = new ConventionsService({ store: new ConventionsRepository(container.db), source, model });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req): Promise<ConventionList> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req): Promise<ConventionExtractResult> => {
      const { workspaceId } = await getContext(container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams } },
    async (req): Promise<ConventionSkillDraft> => {
      const { workspaceId } = await getContext(container, req);
      return service.skillDraft(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionPatch } },
    async (req): Promise<ConventionCandidate> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });
}
