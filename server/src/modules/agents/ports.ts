import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Record shapes the agents helpers map from: structural subsets of the Drizzle
 * rows (db/rows.ts), declared here so helpers.ts stays pure (no db import) and
 * doesn't depend on the repository.
 */

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  systemPrompt: string;
  outputSchema: unknown;
  enabled: boolean;
  version: number;
  strategy: string;
  ciFailOn: string;
  repoIntel: boolean;
}

export interface AgentVersionRecord {
  agentId: string;
  version: number;
  configJson: unknown;
  createdAt: Date;
}

/** One of an agent's skill links, with the skill it points to. */
export interface LinkedSkillRecord {
  skill: {
    id: string;
    name: string;
    description: string;
    type: SkillType;
    source: SkillSource;
    body: string;
    enabled: boolean;
    version: number;
    evidenceFiles: string[] | null;
  };
  order: number;
  enabled: boolean;
}
