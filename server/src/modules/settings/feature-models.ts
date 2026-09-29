import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
  type StructuredRequest,
  type StructuredResult,
} from '@devdigest/shared';
import type { LLMProvider } from '@devdigest/shared';
import type { SettingsStore } from './ports.js';
import { rowsToSettings } from './helpers.js';

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, we fall back to the
 * registry default in `FEATURE_MODELS` — which mirrors each module's old
 * constant, so behaviour is unchanged until a model is explicitly picked.
 */

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

export interface FeatureModelsDeps {
  store: Pick<SettingsStore, 'list'>;
  llm: (id: FeatureModelChoice['provider']) => Promise<LLMProvider>;
}

/**
 * Resolves a feature's provider+model once per call (never inside a per-call
 * catch — see the 2026-09-27 lazy-port INSIGHT) and wraps the structured LLM
 * call for callers that only need one round-trip (conventions extraction,
 * intent classification).
 */
export class FeatureModels {
  constructor(private deps: FeatureModelsDeps) {}

  /**
   * The workspace's override for `id`, or `undefined` when unset/invalid.
   * Callers that keep their own dynamic default (e.g. conventions) use this
   * directly so that default is preserved; callers with a static default use
   * `resolve` instead.
   */
  async override(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice | undefined> {
    const rows = await this.deps.store.list(workspaceId);
    const fm = (rowsToSettings(rows) as { feature_models?: Record<string, unknown> }).feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.[id]);
    return parsed.success ? parsed.data : undefined;
  }

  /** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
  async resolve(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return (await this.override(workspaceId, id)) ?? DEFAULTS[id];
  }

  /**
   * Resolve the feature's choice once, resolve its LLM provider once (no
   * catch), and run one `completeStructured` call.
   */
  async completeStructured<T>(
    workspaceId: string,
    id: FeatureModelId,
    req: Omit<StructuredRequest<T>, 'model'>,
  ): Promise<{ choice: FeatureModelChoice; result: StructuredResult<T> }> {
    const choice = await this.resolve(workspaceId, id);
    const llm = await this.deps.llm(choice.provider);
    const result = await llm.completeStructured<T>({ ...req, model: choice.model });
    return { choice, result };
  }
}
