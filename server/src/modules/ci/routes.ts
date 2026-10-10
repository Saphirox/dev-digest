import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRun,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiRepository } from './repository.js';
import { CiService } from './service.js';
import type { CiAgentSource, CiGitHubResolver, CiRepoSource } from './ports.js';

/**
 * ci module (Export-to-CI).
 *   POST /agents/:id/export-ci/preview → files the export would write
 *   POST /agents/:id/export-ci         → open a PR (JSON) or return a zip
 *   GET  /agents/:id/ci/installations  → repositories the agent is installed in
 *   GET  /ci/runs                      → ingested CI runs
 *   POST /ci/runs/refresh              → pull new runs from GitHub Actions artifacts
 * CI results are accepted ONLY through that artifact pull; no route takes them.
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const agents: CiAgentSource = {
    find: (workspaceId, agentId) => container.agentsRepo.getById(workspaceId, agentId),
    enabledSkills: (agentId) => container.agentsRepo.enabledSkillsForPrompt(agentId),
  };
  const repos: CiRepoSource = {
    exists: async (workspaceId, fullName) =>
      Boolean(await container.reposRepo.findByFullName(workspaceId, fullName)),
  };
  const github: CiGitHubResolver = { resolve: () => container.github() };

  const service = new CiService({
    store: new CiRepository(container.db),
    agents,
    repos,
    bundle: container.runnerBundle,
    github,
    warn: (msg) => app.log.warn(msg),
  });

  app.post(
    '/agents/:id/export-ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } } },
    async (req): Promise<CiPreview> => {
      const { workspaceId } = await getContext(container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    {
      // `open_pr` answers JSON (CiExport); `files` answers a zip, which Fastify
      // sends as-is (a Buffer bypasses the response serializer).
      schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const out = await service.export(workspaceId, req.params.id, req.body);
      if (out.kind === 'zip') {
        return reply
          .type('application/zip')
          .header('content-disposition', `attachment; filename="${out.filename}"`)
          // The 200 schema types `send` as CiExport; a Buffer skips the serializer.
          .send(Buffer.from(out.data) as never);
      }
      return out.result;
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req): Promise<CiInstallation[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listInstallations(workspaceId, req.params.id);
    },
  );

  app.get(
    '/ci/runs',
    { schema: { response: { 200: z.array(CiRun) } } },
    async (req): Promise<CiRun[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId);
    },
  );

  app.post(
    '/ci/runs/refresh',
    {
      schema: { response: { 200: CiRefreshResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<CiRefreshResult> => {
      const { workspaceId } = await getContext(container, req);
      return service.refresh(workspaceId);
    },
  );
}
