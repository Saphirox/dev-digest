/**
 * Onion layering for `mcp/`, mirroring `server/`'s module layout
 * (`.claude/skills/onion-architecture/references/mcp-package.md`). Enforced
 * by resolving every import to (module, file-kind) and checking it against a
 * per-kind allowlist, plus a `no-cross-module-internals` rule — no
 * dependency-cruiser here (mcp has its own tiny ring set; `server/`'s
 * `arch:check` does not reach this package). Imports are parsed with the
 * TypeScript compiler (already a devDependency), not a regex: it correctly
 * handles multi-line `import {...} from '...'`, `export type {...} from
 * '...'`, dynamic `import('...')` / `` import(`...`) `` (a
 * `NoSubstitutionTemplateLiteral` argument, not just a plain string literal),
 * and a type-position `import('...').Foo` (`ts.ImportTypeNode`) — without
 * being fooled by the word "from" appearing in a comment or string elsewhere
 * in the file. Each parsed specifier also records whether it is TYPE-only
 * (`import type ... from '...'`, an inline `type` named specifier, `export
 * type ... from '...'`, or an `ImportTypeNode`, which is always type
 * position) — this backs the "`platform/container` imports must be type-only"
 * check below; a dynamic `import(...)` value call is never type-only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..', 'src');

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'))
    .map((f) => join(dir, f).split('\\').join('/'));
}

interface ImportSpecifier {
  specifier: string;
  /** True when nothing but a TYPE is pulled in through this specifier (erased at build time). */
  typeOnly: boolean;
}

/** Whole `import ... from '...'` declaration → type-only iff every binding it introduces is a type. */
function importDeclarationIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return true; // side-effect import (`import '...'`) — no value binding either way
  if (clause.isTypeOnly) return true; // `import type { ... } from '...'` / `import type X from '...'`
  if (clause.name) return false; // a default import is always a value binding
  const bindings = clause.namedBindings;
  if (!bindings) return true; // no default, no named bindings
  if (ts.isNamespaceImport(bindings)) return false; // `import * as X from '...'` is a value binding
  if (bindings.elements.length === 0) return true;
  return bindings.elements.every((el) => el.isTypeOnly); // `import { type A, type B } from '...'`
}

/** Whole `export ... from '...'` declaration → type-only iff every binding it re-exports is a type. */
function exportDeclarationIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true; // `export type { ... } from '...'`
  const clause = node.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return false; // `export * from '...'` re-exports values
  if (clause.elements.length === 0) return true;
  return clause.elements.every((el) => el.isTypeOnly); // `export { type A, type B } from '...'`
}

/**
 * Every module specifier a file imports/re-exports/dynamically imports, via
 * the real TS parser. Covers three shapes:
 *  - `import/export ... from '...'` (value or `import type`/`export type`,
 *    or an inline `type` named specifier)
 *  - `import('...')` / `` import(`...`) `` as a value expression (dynamic
 *    import; the argument can be a plain string OR a template literal with no
 *    substitutions — `ts.isStringLiteralLike` covers both) — never type-only
 *  - `import('...').Foo` in TYPE position (`ts.ImportTypeNode`) — a
 *    same-file-avoiding way to reference another module's type without a
 *    top-level `import` statement, easy to miss with a naive scan — always
 *    type-only, by construction (it only ever appears where a type is expected)
 */
function extractSpecifiers(absPath: string, text: string): ImportSpecifier[] {
  const specifiers: ImportSpecifier[] = [];
  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({ specifier: node.moduleSpecifier.text, typeOnly: importDeclarationIsTypeOnly(node) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({ specifier: node.moduleSpecifier.text, typeOnly: exportDeclarationIsTypeOnly(node) });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push({ specifier: (node.arguments[0] as ts.StringLiteralLike).text, typeOnly: false });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      specifiers.push({ specifier: node.argument.literal.text, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

interface SourceFile {
  /** Relative to `mcp/src/`, forward-slash separated, e.g. `modules/reviews/service.ts`. */
  path: string;
  text: string;
  imports: ImportSpecifier[];
}

function loadSourceFiles(): SourceFile[] {
  return listTsFiles(SRC_ROOT).map((abs) => {
    const path = relative(SRC_ROOT, abs).split('\\').join('/');
    const text = readFileSync(abs, 'utf8');
    return { path, text, imports: extractSpecifiers(abs, text) };
  });
}

const files = loadSourceFiles();

// ---- Kind/module resolution -------------------------------------------

const MODULE_NAMES = ['agents', 'reviews', 'conventions', 'blast'] as const;

/** File kinds that belong to a named feature module (`modules/<name>/<kind>.ts`). */
type ModuleKind = 'tools' | 'service' | 'repository' | 'ports' | 'helpers' | 'constants' | 'render';
/** `modules/_shared/*` — used directly by every module, per the reference. */
type SharedKind = 'shared-ports' | 'shared-repository' | 'shared-resolver' | 'shared-schemas' | 'shared-messages';
type PlatformKind = 'platform-config' | 'platform-container' | 'platform-errors' | 'platform-log';
/**
 * `modules/index.ts` (the module registry), the top-level composition/adapter
 * files, and `lib/*` — pure cross-ring helpers with no I/O (precedent:
 * `server/src/lib/diff-lines.ts`).
 */
type OtherKind = 'adapter' | 'app' | 'server' | 'modules-index' | 'lib';
type Kind = ModuleKind | SharedKind | PlatformKind | OtherKind;

const MODULE_FILE_MAP: Record<string, ModuleKind> = {
  'tools.ts': 'tools',
  'service.ts': 'service',
  'repository.ts': 'repository',
  'ports.ts': 'ports',
  'helpers.ts': 'helpers',
  'constants.ts': 'constants',
  'render.ts': 'render',
};

const SHARED_FILE_MAP: Record<string, SharedKind> = {
  'ports.ts': 'shared-ports',
  'repository.ts': 'shared-repository',
  'resolver.ts': 'shared-resolver',
  'schemas.ts': 'shared-schemas',
  'messages.ts': 'shared-messages',
};

const PLATFORM_FILE_MAP: Record<string, PlatformKind> = {
  'config.ts': 'platform-config',
  'container.ts': 'platform-container',
  'errors.ts': 'platform-errors',
  'log.ts': 'platform-log',
};

const MODULE_KIND_SET = new Set<Kind>([
  'tools',
  'service',
  'repository',
  'ports',
  'helpers',
  'constants',
  'render',
]);

interface Resolved {
  /** The named module (`agents`/`reviews`/`conventions`/`blast`), `_shared`, or `null` for platform/adapter/composition/lib files. */
  module: string | null;
  kind: Kind;
}

function resolveFile(path: string): Resolved {
  for (const name of MODULE_NAMES) {
    const prefix = `modules/${name}/`;
    if (path.startsWith(prefix)) {
      const file = path.slice(prefix.length);
      const kind = MODULE_FILE_MAP[file];
      if (!kind) throw new Error(`architecture.test.ts: no mapping for src/modules/${name}/${file} — update MODULE_FILE_MAP()`);
      return { module: name, kind };
    }
  }
  if (path.startsWith('modules/_shared/')) {
    const file = path.slice('modules/_shared/'.length);
    const kind = SHARED_FILE_MAP[file];
    if (!kind) throw new Error(`architecture.test.ts: no mapping for src/modules/_shared/${file} — update SHARED_FILE_MAP()`);
    return { module: '_shared', kind };
  }
  if (path === 'modules/index.ts') return { module: null, kind: 'modules-index' };
  if (path.startsWith('platform/')) {
    const file = path.slice('platform/'.length);
    const kind = PLATFORM_FILE_MAP[file];
    if (!kind) throw new Error(`architecture.test.ts: no mapping for src/platform/${file} — update PLATFORM_FILE_MAP()`);
    return { module: null, kind };
  }
  if (path.startsWith('lib/')) return { module: null, kind: 'lib' };
  if (path === 'adapters/devdigest-api/client.ts') return { module: null, kind: 'adapter' };
  if (path === 'app.ts') return { module: null, kind: 'app' };
  if (path === 'server.ts') return { module: null, kind: 'server' };
  throw new Error(`architecture.test.ts: no ring mapping for src/${path} — update resolveFile()`);
}

const resolvedFiles = files.map((f) => ({ ...f, ...resolveFile(f.path) }));

/**
 * The true composition root — may import anything, both internal and bare.
 * `app.ts`, `modules/index.ts` and `platform/container.ts` are NOT exempt any
 * more (restructure, 2026-09-26): each now has a real, narrow allowlist below
 * (`app` → `modules-index` + the `platform-container` TYPE only;
 * `modules-index` → every module's `tools`; `platform-container` → adapters/
 * `_shared`/`platform-config` only, never a feature module — a module's
 * repository/service are built by that module's own `tools.ts`, not the
 * container).
 */
const COMPOSITION_KINDS = new Set<Kind>(['server']);

/**
 * `modules-index` is the sanctioned place a file crosses module boundaries
 * at the registration level (it imports every module's `tools.ts`) — like
 * `server/src/modules/index.ts` importing every module's `routes.ts`. Its
 * OWN allowlist below still restricts it to `tools` only.
 */
const CROSS_MODULE_EXEMPT_KINDS = new Set<Kind>(['modules-index']);

/**
 * Kind → the internal kinds (besides itself) it may import from, per
 * `mcp-package.md`'s "Import rules". Module-scoped kinds (`ModuleKind`) are
 * additionally restricted to the SAME module by `no-cross-module-internals`
 * below (except `modules-index`, see above) — this table alone does not
 * encode that.
 */
const ALLOWED_INTERNAL: Record<Exclude<Kind, 'server'>, Kind[]> = {
  tools: [
    'service',
    'render',
    'helpers',
    'constants',
    'ports',
    'repository',
    'shared-schemas',
    'shared-messages',
    'platform-errors',
    'platform-container',
  ],
  service: ['ports', 'helpers', 'constants', 'shared-ports', 'shared-resolver', 'platform-errors'],
  repository: ['ports', 'adapter', 'platform-errors', 'lib'],
  ports: [],
  helpers: ['ports', 'constants', 'lib'],
  constants: [],
  render: ['helpers', 'ports', 'constants', 'lib'],
  'shared-ports': ['lib'],
  'shared-repository': ['shared-ports', 'adapter', 'platform-errors', 'lib'],
  'shared-resolver': ['shared-ports', 'platform-errors', 'lib'],
  'shared-schemas': ['lib'],
  'shared-messages': ['platform-errors', 'lib'],
  'platform-config': [],
  'platform-errors': [],
  'platform-log': [],
  // Cross-cutting infra only (item A): the HTTP client, the shared `_shared`
  // repository/resolver, and config — never a feature module's repository or
  // service.
  'platform-container': ['platform-config', 'adapter', 'shared-repository', 'shared-resolver'],
  adapter: ['platform-errors', 'lib'],
  // Pure helpers with no I/O, shared across rings that otherwise couldn't
  // share a copy without widening this allowlist (item 4, 2026-09-26).
  lib: [],
  // `app.ts` builds the `McpServer` and hands the container to
  // `registerModules`; it never constructs a concrete repository/service
  // itself (checked separately below, "no concrete construction outside...").
  app: ['modules-index', 'platform-container'],
  'modules-index': ['tools', 'platform-container'],
};

/** Kind → predicate for the bare (non-relative) module specifiers it may import. Anything absent from this map gets none. */
const ALLOWED_EXTERNAL: Partial<Record<Kind, (specifier: string) => boolean>> = {
  tools: (s) => s.startsWith('@modelcontextprotocol') || s === 'zod',
  repository: (s) => s === 'zod',
  'shared-repository': (s) => s === 'zod',
  'shared-schemas': (s) => s === 'zod',
  'shared-messages': (s) => s.startsWith('@modelcontextprotocol'),
  adapter: (s) => s === 'zod',
  lib: (s) => s === 'zod',
  app: (s) => s.startsWith('@modelcontextprotocol'),
  'modules-index': (s) => s.startsWith('@modelcontextprotocol'),
};

function resolveRelative(fromPath: string, specifier: string): string {
  const fromDir = dirname(join(SRC_ROOT, fromPath));
  const resolved = join(fromDir, specifier).replace(/\.js$/, '.ts');
  return relative(SRC_ROOT, resolved).split('\\').join('/');
}

describe('mcp onion layering (src/**, kind-resolved allowlists, mirrors server/)', () => {
  it('found every module and every shared/platform/adapter/composition/lib file (sanity check the scan itself is not vacuous)', () => {
    for (const name of MODULE_NAMES) {
      expect(resolvedFiles.some((f) => f.module === name && f.kind === 'tools')).toBe(true);
    }
    for (const name of ['agents', 'reviews', 'conventions', 'blast']) {
      expect(resolvedFiles.some((f) => f.module === name && f.kind === 'service')).toBe(true);
      expect(resolvedFiles.some((f) => f.module === name && f.kind === 'repository')).toBe(true);
      expect(resolvedFiles.some((f) => f.module === name && f.kind === 'ports')).toBe(true);
    }
    for (const kind of ['shared-ports', 'shared-repository', 'shared-resolver', 'shared-schemas', 'shared-messages']) {
      expect(resolvedFiles.some((f) => f.kind === kind)).toBe(true);
    }
    for (const kind of ['platform-config', 'platform-container', 'platform-errors', 'platform-log']) {
      expect(resolvedFiles.some((f) => f.kind === kind)).toBe(true);
    }
    expect(resolvedFiles.some((f) => f.kind === 'adapter')).toBe(true);
    expect(resolvedFiles.some((f) => f.kind === 'app')).toBe(true);
    expect(resolvedFiles.some((f) => f.kind === 'server')).toBe(true);
    expect(resolvedFiles.some((f) => f.kind === 'modules-index')).toBe(true);
    expect(resolvedFiles.some((f) => f.kind === 'lib')).toBe(true);
  });

  it('every relative import stays inside its kind\'s allowed internal targets, and never crosses into another module\'s internals (no-cross-module-internals)', () => {
    const violations: string[] = [];
    for (const f of resolvedFiles) {
      if (COMPOSITION_KINDS.has(f.kind)) continue; // server.ts may import anything

      for (const imp of f.imports) {
        if (!imp.specifier.startsWith('.')) continue; // external, checked in the next test
        const targetPath = resolveRelative(f.path, imp.specifier);
        let target: Resolved;
        try {
          target = resolveFile(targetPath);
        } catch {
          violations.push(`${f.path}: relative import '${imp.specifier}' resolves to unmapped src/${targetPath}`);
          continue;
        }

        // no-cross-module-internals: a module-scoped target (tools/service/
        // repository/ports/helpers/constants/render) may only be imported by
        // the SAME module, or by a file whose kind is explicitly exempt
        // (`modules-index`, the sanctioned module registry). `_shared`/
        // platform/adapter/lib targets are exempt too — they are the
        // sanctioned sharing mechanism.
        if (
          MODULE_KIND_SET.has(target.kind) &&
          target.module !== f.module &&
          !CROSS_MODULE_EXEMPT_KINDS.has(f.kind)
        ) {
          violations.push(
            `${f.path} (module '${f.module}'): imports '${imp.specifier}' → src/${targetPath} (module '${target.module}', ${target.kind}) — no-cross-module-internals`,
          );
          continue;
        }

        if (target.kind === f.kind && target.module === f.module) continue; // same file's own kind (e.g. re-export) always fine

        const allowed = ALLOWED_INTERNAL[f.kind as Exclude<Kind, 'server'>] ?? [];
        if (!allowed.includes(target.kind)) {
          violations.push(
            `${f.path} (${f.kind}) imports '${imp.specifier}' → src/${targetPath} (${target.kind}), not in [${f.kind}, ${allowed.join(', ')}]`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('every bare (third-party/node) import is one its kind is allowed to use', () => {
    const violations: string[] = [];
    for (const f of resolvedFiles) {
      if (COMPOSITION_KINDS.has(f.kind)) continue; // server.ts may import anything

      for (const imp of f.imports) {
        if (imp.specifier.startsWith('.')) continue; // relative, checked above
        const allow = ALLOWED_EXTERNAL[f.kind];
        if (!allow || !allow(imp.specifier)) {
          violations.push(`${f.path} (${f.kind}) imports disallowed bare specifier '${imp.specifier}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it(
    'every import of platform/container.ts from a tools, app or modules-index file is type-only ' +
      '(the AppContainer type, never the concrete Container class)',
    () => {
      const CHECKED_KINDS = new Set<Kind>(['tools', 'app', 'modules-index']);
      const violations: string[] = [];
      for (const f of resolvedFiles) {
        if (!CHECKED_KINDS.has(f.kind)) continue;

        for (const imp of f.imports) {
          if (!imp.specifier.startsWith('.')) continue;
          const targetPath = resolveRelative(f.path, imp.specifier);
          let target: Resolved;
          try {
            target = resolveFile(targetPath);
          } catch {
            continue; // reported by the unmapped-target check above
          }
          if (target.kind !== 'platform-container') continue;
          if (!imp.typeOnly) {
            violations.push(
              `${f.path}: imports platform/container.js as a VALUE ('${imp.specifier}') — must be type-only (\`import type\` or an inline \`type\` specifier)`,
            );
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );

  it('no file imports @devdigest/shared (deviation: vendor/shared does not typecheck under zod 4, see platform/errors.ts and every module\'s ports.ts)', () => {
    const offenders = files.filter((f) => f.imports.some((imp) => imp.specifier.startsWith('@devdigest/shared')));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('only adapters/devdigest-api/client.ts calls fetch(', () => {
    const offenders = files.filter((f) => f.path !== 'adapters/devdigest-api/client.ts' && /\bfetch\(/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
    expect(/\bfetch\(/.test(files.find((f) => f.path === 'adapters/devdigest-api/client.ts')!.text)).toBe(true);
  });

  it('only platform/config.ts reads process.env', () => {
    const offenders = files.filter((f) => f.path !== 'platform/config.ts' && /\bprocess\.env\b/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('no file in src/** calls console.log (stdout is the JSON-RPC transport)', () => {
    const offenders = files.filter((f) => /\bconsole\.log\(/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("every tool inputSchema/outputSchema is a z.object(...), never a raw shape (registerTool's @deprecated overload)", () => {
    const offenders = resolvedFiles.filter((f) => f.kind === 'tools' && /(?:input|output)Schema:\s*\{/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('pure files (ports/helpers/constants/shared-ports/shared-schemas/platform-errors/lib) do no node:*/SDK I/O', () => {
    const pureKinds = new Set<Kind>([
      'ports',
      'helpers',
      'constants',
      'shared-ports',
      'shared-schemas',
      'platform-errors',
      'lib',
    ]);
    const offenders = resolvedFiles.filter(
      (f) =>
        pureKinds.has(f.kind) &&
        f.imports.some((imp) => imp.specifier.startsWith('node:') || imp.specifier.startsWith('@modelcontextprotocol')),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it(
    'no file other than platform/container.ts or a module\'s tools.ts constructs a concrete repository/service/client/resolver, ' +
      'and only server.ts constructs the Container (item D)',
    () => {
      // `\w*Repository`/`\w*Service` catch every `<Feature>ApiRepository`/
      // `<Feature>Service` class (and `LookupApiRepository`); `DevDigestApiClient`,
      // the bare `Resolver` and `Container` are named literally (only one of
      // each). A module's own `tools.ts` is the one place besides the
      // container allowed to build its repository + service (item A: "tools
      // own their repository/service", mirrors `routes.ts` building its
      // service from `container.db`). `Container` itself is narrower still:
      // only `server.ts` (the entry point) may construct it — every other
      // file, including `platform/container.ts`, receives an already-built
      // `AppContainer`.
      const REPO_SERVICE_RE = /\bnew\s+(?:\w*Repository|\w*Service|DevDigestApiClient|Resolver)\s*\(/g;
      const CONTAINER_RE = /\bnew\s+Container\s*\(/g;
      const violations: string[] = [];
      for (const f of resolvedFiles) {
        const isContainerFile = f.path === 'platform/container.ts';
        const isToolsFile = f.kind === 'tools';
        if (!isContainerFile && !isToolsFile) {
          const matches = f.text.match(REPO_SERVICE_RE);
          if (matches && matches.length > 0) {
            violations.push(`${f.path}: constructs ${matches.map((m) => m.trim()).join(', ')}`);
          }
        }
        if (f.path !== 'server.ts') {
          const containerMatches = f.text.match(CONTAINER_RE);
          if (containerMatches && containerMatches.length > 0) {
            violations.push(`${f.path}: constructs ${containerMatches.map((m) => m.trim()).join(', ')} — only server.ts may construct Container`);
          }
        }
      }
      expect(violations).toEqual([]);
    },
  );
});
