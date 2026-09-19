import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Skill, SkillImportPreview, SkillSummary, SkillVersion } from '@devdigest/shared';
import { SkillImportRequest, SkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';
import type { AgentRef } from './ports.js';

/**
 * Skills module. Transport only: validates, resolves the workspace, delegates.
 *   GET    /skills               → list with "used by N agents"
 *   GET    /skills/:id           → one skill
 *   POST   /skills               → create (201)
 *   PUT    /skills/:id           → update; a text change bumps the version
 *   DELETE /skills/:id           → delete (agent links + versions cascade)
 *   GET    /skills/:id/agents    → agents that link it (delete confirmation)
 *   GET    /skills/:id/versions  → body history, newest first
 *   POST   /skills/import        → parse an upload into a preview; persists nothing
 */
const SkillPatchBody = SkillInput.omit({ source: true }).partial();

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SkillsService(new SkillsRepository(container.db));

  app.get('/skills', async (req): Promise<SkillSummary[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req): Promise<Skill> => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: SkillInput } }, async (req, reply): Promise<Skill> => {
    const { workspaceId } = await getContext(container, req);
    reply.code(201);
    return service.create(workspaceId, req.body);
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: SkillPatchBody } },
    async (req): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get(
    '/skills/:id/agents',
    { schema: { params: IdParams } },
    async (req): Promise<AgentRef[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.agents(workspaceId, req.params.id);
    },
  );

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams } },
    async (req): Promise<SkillVersion[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.versions(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/import',
    { schema: { body: SkillImportRequest } },
    async (req): Promise<SkillImportPreview> => {
      await getContext(container, req);
      return service.previewImport(req.body);
    },
  );
}
