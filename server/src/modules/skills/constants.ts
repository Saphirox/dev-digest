/** A new skill starts at version 1, like an agent. */
export const INITIAL_SKILL_VERSION = 1;

/**
 * Import limits. The request itself is capped by Fastify's 1 MB body limit
 * (`app.ts`); these bound what a (possibly hostile) archive can make us inflate.
 */
export const IMPORT_MAX_FILE_BYTES = 700 * 1024;
export const IMPORT_MAX_MARKDOWN_BYTES = 512 * 1024;
export const IMPORT_MAX_ARCHIVE_MEMBERS = 200;
export const IMPORT_MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024;

/** Archive member names preferred as the skill's core, in priority order. */
export const SKILL_CORE_NAMES = ['skill.md'];

/** Extensions that look executable; importing never runs them, but we say so. */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.pl',
  '.bat', '.cmd', '.ps1', '.exe', '.bin', '.jar',
];

/** Frontmatter keys an imported markdown file may set. */
export const FRONTMATTER_KEYS = ['name', 'description', 'type'] as const;
