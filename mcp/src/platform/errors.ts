/**
 * Domain error taxonomy, shared by every module (mirrors `server/src/platform/
 * errors.ts`'s `AppError` hierarchy): every error `mcp/` throws extends
 * `McpError`, which fixes a `code` discriminant per subclass and derives
 * `name` from the class name. No user-facing prose lives here — `Error#message`
 * is for logs/debugging only; `modules/_shared/messages.ts` (presentation
 * ring) turns one of these into the forward-leading text the model sees, via
 * an exhaustive switch on `code` (see `toToolResult`).
 */

export abstract class McpError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ApiUnreachable extends McpError {
  readonly code = 'ApiUnreachable' as const;
  constructor(readonly url: string) {
    super(`DevDigest API unreachable at ${url}`);
  }
}

export class ApiFailure extends McpError {
  readonly code = 'ApiFailure' as const;
  constructor(
    readonly status: number,
    readonly apiMessage: string,
  ) {
    super(`DevDigest API error ${status}: ${apiMessage}`);
  }
}

export class RateLimited extends McpError {
  readonly code = 'RateLimited' as const;
  constructor() {
    super('DevDigest API rate limit hit');
  }
}

export class RepoNotFound extends McpError {
  readonly code = 'RepoNotFound' as const;
  constructor(
    readonly repo: string,
    readonly known: string[],
  ) {
    super(`Repo not imported: ${repo}`);
  }
}

export class PrNotFound extends McpError {
  readonly code = 'PrNotFound' as const;
  constructor(
    readonly repo: string,
    readonly pr: number,
    readonly recent: number[],
  ) {
    super(`PR not found: ${repo}#${pr}`);
  }
}

export class AgentNotFound extends McpError {
  readonly code = 'AgentNotFound' as const;
  constructor(readonly agent: string) {
    super(`Agent not found: ${agent}`);
  }
}

export class AgentAmbiguous extends McpError {
  readonly code = 'AgentAmbiguous' as const;
  constructor(
    readonly agent: string,
    readonly names: string[],
  ) {
    super(`Agent name ambiguous: ${agent}`);
  }
}

export class RunNotFound extends McpError {
  readonly code = 'RunNotFound' as const;
  constructor(readonly runId: string) {
    super(`Run not found: ${runId}`);
  }
}

export class RunFailed extends McpError {
  readonly code = 'RunFailed' as const;
  constructor(
    readonly runId: string,
    readonly status: string,
    readonly error: string | null,
  ) {
    super(`Run ${runId} ${status}: ${error ?? 'no error detail'}`);
  }
}

/**
 * A repository's `parseArray`/`parseObject` couldn't validate the API's JSON
 * body against the local shape it expects. `endpoint` is a repository fact
 * (the HTTP path template it called, e.g. `GET /pulls/:id/runs`), never a
 * tool name — repositories must not know tool names (Onion layering:
 * infrastructure is driven by ports/domain only).
 */
export class MalformedResponse extends McpError {
  readonly code = 'MalformedResponse' as const;
  constructor(readonly endpoint: string) {
    super(`Malformed response from DevDigest API: ${endpoint}`);
  }
}

/** `POST /pulls/:id/review` returned zero runs for the review request. */
export class NoRunStarted extends McpError {
  readonly code = 'NoRunStarted' as const;
  constructor(readonly prId: string) {
    super(`DevDigest API started no run for PR ${prId}`);
  }
}

/** Union of every typed domain error `mcp` throws, discriminated by `code`. */
export type DomainError =
  | ApiUnreachable
  | ApiFailure
  | RateLimited
  | RepoNotFound
  | PrNotFound
  | AgentNotFound
  | AgentAmbiguous
  | RunNotFound
  | RunFailed
  | MalformedResponse
  | NoRunStarted;
