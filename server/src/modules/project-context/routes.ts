import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProjectContextList, SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const FileQuery = z.object({ path: z.string().min(1).max(1024) });

/**
 * project-context module.
 *   GET /repos/:id/context        → the repo's markdown docs (type, tokens), read
 *                                   from the clone on every call; `cloned:false`
 *                                   when there is no clone
 *   GET /repos/:id/context/file   → one listed doc with its content (404 otherwise)
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectContextList } } },
    async (req): Promise<ProjectContextList> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: SpecFile } } },
    async (req): Promise<SpecFile> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.readFile(workspaceId, req.params.id, req.query.path);
    },
  );
}
