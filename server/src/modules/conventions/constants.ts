/**
 * Config and guide files sampled on every scan (missing ones are skipped).
 * They state conventions outright, which top-ranked source files only imply.
 */
export const CONFIG_FILES = [
  'package.json',
  'tsconfig.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  'biome.json',
  '.editorconfig',
  'CONTRIBUTING.md',
  'AGENTS.md',
  'CLAUDE.md',
];

/** Top-ranked source files added to the sample (repo-intel's file rank). */
export const SAMPLE_TOP_FILES = 12;

/** Caps keep one cheap model call cheap. */
export const MAX_LINES_PER_FILE = 220;
export const MAX_CHARS_PER_FILE = 12_000;
export const MAX_TOTAL_CHARS = 90_000;

/** At most this many candidates per scan. */
export const MAX_CANDIDATES = 12;

/** Evidence shorter than this (non-space chars) proves nothing. */
export const MIN_SNIPPET_CHARS = 8;

/** Evidence longer than this is trimmed to the first lines. */
export const MAX_SNIPPET_LINES = 12;

/** Patterns longer than this aren't grepped (the model rambled). */
export const MAX_PATTERN_LENGTH = 200;

/**
 * A rule whose pattern matches only the evidence file is a one-off, not a
 * convention: its confidence is multiplied by this.
 */
export const SINGLE_FILE_PENALTY = 0.7;

/** Settings key holding a repo's last-scan metadata (sampled files, time). */
export const scanSettingsKey = (repoId: string) => `conventions.scan.${repoId}`;

/** Default name of the skill built from accepted conventions (editable in the modal). */
export const CONVENTIONS_SKILL_NAME = 'repo-conventions';
