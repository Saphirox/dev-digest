import type {
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillSummary,
  SkillVersion,
} from '@devdigest/shared';
import { assertValidContextPaths, DEFAULT_CONTEXT_GLOB } from '../../lib/doc-glob.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { IMPORT_MAX_FILE_BYTES } from './constants.js';
import { isSkillConfigChange, toSkillDto, toSkillSummaryDto, toSkillVersionDto } from './helpers.js';
import { parseSkillUpload } from './import-parser.js';
import type { AgentRef, SkillPatch, SkillUpdateInput, SkillsStore } from './ports.js';

/**
 * Skills service. A skill is reusable review guidance (text + configuration
 * only) that agents link and whose enabled bodies are appended to the agent's
 * prompt. Editing what a skill says bumps its version and snapshots the body.
 *
 * Import is deliberately two-step: `previewImport` parses and persists NOTHING;
 * the user confirms by creating the skill. An imported skill is saved disabled
 * unless the caller says otherwise: its text becomes instructions in an agent's
 * prompt, so a person should read it first.
 */
export class SkillsService {
  constructor(
    private store: SkillsStore,
    /** Search glob a stored `context_paths` entry must match (`CONTEXT_GLOB`). */
    private contextGlob: string = DEFAULT_CONTEXT_GLOB,
  ) {}

  async list(workspaceId: string): Promise<SkillSummary[]> {
    const rows = await this.store.list(workspaceId);
    return rows.map(toSkillSummaryDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const row = await this.store.get(workspaceId, id);
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  async create(workspaceId: string, input: SkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    const row = await this.store.insert(workspaceId, {
      name: input.name.trim(),
      description: input.description.trim(),
      type: input.type,
      source,
      body: input.body,
      enabled: input.enabled ?? source === 'manual',
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, input: SkillUpdateInput): Promise<Skill> {
    const { context_paths, ...patch } = input;
    if (context_paths !== undefined) {
      // EC-3: reject BEFORE any write so a bad path stores nothing.
      assertValidContextPaths(context_paths, this.contextGlob);
    }
    const existing = await this.store.get(workspaceId, id);
    if (!existing) throw new NotFoundError('Skill not found');
    const clean: SkillPatch = {
      ...patch,
      ...(context_paths !== undefined ? { contextPaths: context_paths } : {}),
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    };
    const row = await this.store.update(workspaceId, id, clean, isSkillConfigChange(existing, clean));
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const deleted = await this.store.delete(workspaceId, id);
    if (!deleted) throw new NotFoundError('Skill not found');
  }

  async agents(workspaceId: string, id: string): Promise<AgentRef[]> {
    await this.get(workspaceId, id);
    return this.store.usedBy(workspaceId, id);
  }

  async versions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.get(workspaceId, id);
    const rows = await this.store.listVersions(workspaceId, id);
    return rows.map(toSkillVersionDto);
  }

  previewImport(req: SkillImportRequest): SkillImportPreview {
    const bytes = Buffer.from(req.content_b64, 'base64');
    if (bytes.byteLength === 0) throw new ValidationError('The uploaded file is empty.');
    if (bytes.byteLength > IMPORT_MAX_FILE_BYTES) {
      throw new ValidationError('The uploaded file is larger than 700 KB.');
    }
    const result = parseSkillUpload(req.filename, new Uint8Array(bytes));
    if (!result.ok) throw new ValidationError(result.reason, result.details);
    return result.preview;
  }
}
