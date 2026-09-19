import type {
  Skill,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillSummary,
  SkillVersion,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { IMPORT_MAX_FILE_BYTES } from './constants.js';
import { isSkillConfigChange, toSkillDto, toSkillSummaryDto, toSkillVersionDto } from './helpers.js';
import { parseSkillUpload } from './import-parser.js';
import type { AgentRef, SkillPatch, SkillsStore } from './ports.js';

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
  constructor(private store: SkillsStore) {}

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

  async update(workspaceId: string, id: string, patch: SkillPatch): Promise<Skill> {
    const existing = await this.store.get(workspaceId, id);
    if (!existing) throw new NotFoundError('Skill not found');
    const clean: SkillPatch = {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
    };
    const nextVersion = isSkillConfigChange(existing, clean) ? existing.version + 1 : undefined;
    const row = await this.store.update(workspaceId, id, clean, nextVersion);
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
    const rows = await this.store.listVersions(id);
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
