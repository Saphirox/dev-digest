import type {
  ConnTestRequest,
  ConnTestResult,
  GitHubClient,
  LLMProvider,
  SecretsProvider,
  SecretsStatus,
  Settings,
} from '@devdigest/shared';
import type { SettingsStore } from './ports.js';
import { rowsToSettings } from './helpers.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';

export interface SettingsServiceDeps {
  store: SettingsStore;
  secrets: SecretsProvider;
  /** Drop cached provider clients so the next resolve picks up a changed key. */
  invalidateSecretCaches: () => void;
  github: () => Promise<GitHubClient>;
  llm: (id: 'openai' | 'anthropic' | 'openrouter') => Promise<LLMProvider>;
}

/**
 * F1 — settings service.
 *   get                 → current non-secret prefs
 *   update               → upsert prefs (key/value rows), atomic
 *   secretsStatus        → which provider keys are configured (booleans only)
 *   testConnection       → test a provider key (OpenAI/Anthropic/OpenRouter/GitHub)
 *
 * Secrets are NOT stored here — only non-secret prefs. testConnection reads
 * the key via SecretsProvider and does a cheap live call (listModels / GET user).
 */
export class SettingsService {
  constructor(private deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    const rows = await this.deps.store.list(workspaceId);
    return rowsToSettings(rows);
  }

  async update(workspaceId: string, userId: string, body: Record<string, unknown>): Promise<Settings> {
    await this.deps.store.upsertMany(workspaceId, userId, Object.entries(body));
    return this.get(workspaceId);
  }

  // Which provider keys are configured (booleans only — the values are NEVER
  // returned). Drives the "Configured / Not set" badges in the API Keys panel.
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  async testConnection(req: ConnTestRequest): Promise<ConnTestResult> {
    const { provider, key } = req;
    try {
      // If the UI supplied a key, persist it (BYO key) before testing so the
      // test reflects — and the rest of the app can use — the new value.
      if (key) {
        if (!this.deps.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.deps.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.deps.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.deps.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const llm = await this.deps.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }
}
