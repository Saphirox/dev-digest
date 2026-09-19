import { describe, it, expect } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type {
  NewSkill,
  SkillPatch,
  SkillRecord,
  SkillsStore,
} from '../src/modules/skills/ports.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';

/** In-memory SkillsStore: enough behaviour to pin the service's rules. */
function fakeStore() {
  const rows = new Map<string, SkillRecord & { ws: string }>();
  const versions: { skillId: string; version: number; body: string }[] = [];
  let seq = 0;
  const store: SkillsStore = {
    async list(ws) {
      return [...rows.values()].filter((r) => r.ws === ws).map((r) => ({ ...r, usedBy: 0 }));
    },
    async get(ws, id) {
      const r = rows.get(id);
      return r && r.ws === ws ? r : undefined;
    },
    async insert(ws, s: NewSkill) {
      const row = { ...s, id: `s${seq++}`, version: 1, evidenceFiles: null, ws };
      rows.set(row.id, row);
      versions.push({ skillId: row.id, version: 1, body: row.body });
      return row;
    },
    async update(ws, id, patch: SkillPatch, nextVersion) {
      const r = rows.get(id);
      if (!r || r.ws !== ws) return undefined;
      Object.assign(r, patch, nextVersion ? { version: nextVersion } : {});
      if (nextVersion) versions.push({ skillId: id, version: nextVersion, body: r.body });
      return r;
    },
    async delete(ws, id) {
      const r = rows.get(id);
      return !!r && r.ws === ws && rows.delete(id);
    },
    async usedBy() {
      return [];
    },
    async listVersions(skillId) {
      return versions
        .filter((v) => v.skillId === skillId)
        .map((v) => ({ ...v, createdAt: new Date(0) }))
        .reverse();
    },
  };
  return { store, versions };
}

const input = { name: ' rubric ', description: ' d ', type: 'rubric' as const, body: 'B' };

describe('SkillsService', () => {
  it('creates manual skills enabled and imported skills disabled by default', async () => {
    const svc = new SkillsService(fakeStore().store);
    const manual = await svc.create('w', input);
    expect(manual).toMatchObject({ name: 'rubric', description: 'd', source: 'manual', enabled: true });
    const imported = await svc.create('w', { ...input, source: 'imported_url' });
    expect(imported.enabled).toBe(false);
  });

  it('bumps the version and snapshots on a body edit, but not on an enabled toggle', async () => {
    const { store, versions } = fakeStore();
    const svc = new SkillsService(store);
    const s = await svc.create('w', input);
    expect((await svc.update('w', s.id, { enabled: false })).version).toBe(1);
    expect((await svc.update('w', s.id, { body: 'B2' })).version).toBe(2);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect((await svc.versions('w', s.id)).map((v) => v.body)).toEqual(['B2', 'B']);
  });

  it('hides skills from other workspaces behind a 404', async () => {
    const svc = new SkillsService(fakeStore().store);
    const s = await svc.create('w1', input);
    await expect(svc.get('w2', s.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.update('w2', s.id, { body: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.delete('w2', s.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('previews an import without persisting anything', async () => {
    const { store } = fakeStore();
    const svc = new SkillsService(store);
    const preview = svc.previewImport({
      filename: 'x.md',
      content_b64: Buffer.from('# X\n\nWhen reviewing tests.').toString('base64'),
    });
    expect(preview).toMatchObject({ name: 'X', description: 'When reviewing tests.' });
    expect(await store.list('w')).toHaveLength(0);
  });

  it('turns a parse failure into a validation error', () => {
    const svc = new SkillsService(fakeStore().store);
    expect(() =>
      svc.previewImport({ filename: 'x.exe', content_b64: Buffer.from('MZ').toString('base64') }),
    ).toThrow(ValidationError);
  });
});
