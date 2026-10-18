/** Files the export writes into the target repository. */
export const WORKFLOW_FILE = 'devdigest-review.yml';
export const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILE}`;
export const RUNNER_DIR = '.devdigest/runner';
export const AGENTS_DIR = '.devdigest/agents';
export const SKILLS_DIR = '.devdigest/skills';

/** Branch the export commits to; never the default branch. */
export const CI_BRANCH = 'devdigest/ci';

export const COMMIT_MESSAGE = 'Add DevDigest CI review';
export const PR_TITLE = 'Add DevDigest CI review';
export const PR_BODY = [
  'This PR adds the DevDigest review agent to GitHub Actions.',
  '',
  '- `.devdigest/agents/` and `.devdigest/skills/` hold the agent and its skills.',
  '- `.devdigest/runner/` holds the bundled runner (entry `index.js`).',
  `- \`${WORKFLOW_PATH}\` runs it on pull requests.`,
  '',
  'Add the `OPENROUTER_API_KEY` repository secret before merging.',
].join('\n');

/** The artifact the runner uploads, and the file inside it. */
export const ARTIFACT_NAME = 'devdigest-result';
/** NFR-2: an artifact (and the unzipped result) over this size is refused. */
export const MAX_ARTIFACT_BYTES = 1_048_576;
/** Latest completed runs read per repository per refresh. */
export const RUNS_PER_REFRESH = 20;

/** Build command named in the `runner_bundle_missing` error (EC-7). */
export const RUNNER_BUILD_HINT = 'cd agent-runner && pnpm install && pnpm build';
export const RUNNER_BUNDLE_REL = 'agent-runner/dist/index.js'; // entry; the whole dist/ is exported
