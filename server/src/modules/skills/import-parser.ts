import { unzipSync, strFromU8 } from 'fflate';
import { SkillType, type SkillImportPreview } from '@devdigest/shared';
import {
  EXECUTABLE_EXTENSIONS,
  FRONTMATTER_KEYS,
  IMPORT_MAX_ARCHIVE_MEMBERS,
  IMPORT_MAX_MARKDOWN_BYTES,
  IMPORT_MAX_UNCOMPRESSED_BYTES,
  SKILL_CORE_NAMES,
} from './constants.js';

/**
 * Skill import parsing. Pure: bytes in, preview out. Archives are read in
 * memory only. No member is written to disk, resolved against a directory, or
 * executed. Everything except the chosen markdown file is reported as ignored.
 */

export type ParseResult =
  | { ok: true; preview: SkillImportPreview }
  | { ok: false; reason: string; details?: unknown };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function parseSkillUpload(filename: string, bytes: Uint8Array): ParseResult {
  if (isZip(filename, bytes)) return parseArchive(filename, bytes);
  if (!/\.(md|markdown)$/i.test(filename)) {
    return { ok: false, reason: 'Unsupported file type: upload a .md file or a .zip archive.' };
  }
  if (bytes.byteLength > IMPORT_MAX_MARKDOWN_BYTES) {
    return { ok: false, reason: 'The markdown file is larger than 512 KB.' };
  }
  return fromMarkdown(strFromU8(bytes), stem(filename), [], []);
}

function isZip(filename: string, bytes: Uint8Array): boolean {
  if (/\.zip$/i.test(filename)) return true;
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

function parseArchive(filename: string, bytes: Uint8Array): ParseResult {
  const members: string[] = [];
  let declaredBytes = 0;
  let files: Record<string, Uint8Array>;
  try {
    // `filter` sees every member's header BEFORE it is inflated: count and size
    // are enforced there, and only markdown candidates are inflated at all.
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        members.push(f.name);
        declaredBytes += f.originalSize;
        if (members.length > IMPORT_MAX_ARCHIVE_MEMBERS) throw new Error('too many members');
        if (declaredBytes > IMPORT_MAX_UNCOMPRESSED_BYTES) throw new Error('too large');
        return isMarkdownCandidate(f.name) && f.originalSize <= IMPORT_MAX_MARKDOWN_BYTES;
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'too many members') {
      return { ok: false, reason: `The archive has more than ${IMPORT_MAX_ARCHIVE_MEMBERS} files.` };
    }
    if (msg === 'too large') {
      return { ok: false, reason: 'The archive expands to more than 2 MB.' };
    }
    return { ok: false, reason: 'The file is not a readable .zip archive.' };
  }

  const core = pickSkillCore(Object.keys(files));
  if (!core) {
    return {
      ok: false,
      reason: 'The archive contains no markdown file to import.',
      details: { members },
    };
  }
  const ignored = members.filter((m) => m !== core.name);
  const warnings = [...core.warnings, ...executableWarnings(ignored)];
  return fromMarkdown(strFromU8(files[core.name]!), stem(filename), ignored, warnings);
}

function isMarkdownCandidate(name: string): boolean {
  const base = basename(name);
  return /\.(md|markdown)$/i.test(base) && !base.startsWith('.') && !name.startsWith('__MACOSX/');
}

/**
 * Choose the skill's core file: a `SKILL.md` wins, then any non-README markdown,
 * then a README. Shallowest path first; ties break alphabetically, with a
 * warning so the user knows which file became the skill.
 */
export function pickSkillCore(names: string[]): { name: string; warnings: string[] } | undefined {
  const candidates = names.filter(isMarkdownCandidate);
  if (candidates.length === 0) return undefined;
  const rank = (n: string) => {
    const base = basename(n).toLowerCase();
    if (SKILL_CORE_NAMES.includes(base)) return 0;
    return base.startsWith('readme') ? 2 : 1;
  };
  const sorted = [...candidates].sort(
    (a, b) => rank(a) - rank(b) || depth(a) - depth(b) || a.localeCompare(b),
  );
  const chosen = sorted[0]!;
  const rivals = sorted.filter(
    (n) => n !== chosen && rank(n) === rank(chosen) && depth(n) === depth(chosen),
  );
  const warnings = rivals.length
    ? [`Several markdown files could be the skill; imported "${chosen}".`]
    : [];
  return { name: chosen, warnings };
}

export function executableWarnings(ignored: string[]): string[] {
  const exec = ignored.filter((n) =>
    EXECUTABLE_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)),
  );
  return exec.length
    ? [`Ignored ${exec.length} executable-looking file(s), never run: ${exec.join(', ')}`]
    : [];
}

function fromMarkdown(
  raw: string,
  fallbackName: string,
  ignored: string[],
  warnings: string[],
): ParseResult {
  const { meta, body } = parseFrontmatter(raw.replace(/^﻿/, ''));
  const text = body.trim();
  if (!text) return { ok: false, reason: 'The skill body is empty.' };
  const type = SkillType.safeParse(meta.type);
  return {
    ok: true,
    preview: {
      name: (meta.name || firstHeading(text) || fallbackName).slice(0, 120),
      description: (meta.description || firstParagraph(text)).slice(0, 1000),
      type: type.success ? type.data : 'custom',
      body: text,
      source: 'imported_url',
      ignored_entries: ignored,
      warnings,
    },
  };
}

/** Flat `key: value` frontmatter between `---` fences. No YAML dependency. */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.toLowerCase();
    if ((FRONTMATTER_KEYS as readonly string[]).includes(key)) {
      meta[key] = kv[2]!.trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { meta, body: raw.slice(m[0].length) };
}

function firstHeading(text: string): string {
  return /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '';
}

function firstParagraph(text: string): string {
  const para = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'));
  return para?.replace(/\s+/g, ' ') ?? '';
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function depth(path: string): number {
  return path.split('/').length;
}

function stem(filename: string): string {
  return basename(filename).replace(/\.[^.]+$/, '');
}
