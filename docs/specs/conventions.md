# Conventions extractor

Turns a repo's implicit house rules into a skill that review agents can use.
A scan proposes conventions, each backed by real evidence; the user accepts,
rejects or edits them; the accepted ones become one `convention` skill, which
is then attached to agents in **Agents → Skills**.

## Flow

1. **Sample (code only, no model).** A fixed list of config and guide files
   (`package.json`, `tsconfig.json`, eslint/prettier/biome configs,
   `.editorconfig`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`; missing ones
   skipped) plus the 12 top-ranked source files from
   `repoIntel.getConventionSamples()`. Caps: 220 lines / 12k chars per file,
   90k total. Each line is prefixed with its number so the model can cite
   `file:line`. Nothing readable → `422 clone and index the repo first`.
2. **One cheap model call.** `completeStructured` with the `ConventionExtraction`
   schema (≤ 12 candidates), model from the `conventions` feature model
   (default `openrouter / deepseek/deepseek-v4-flash`, overridable in
   Settings → Feature Models). The schema asks for the rule and its evidence
   first and for `category` / `confidence` last: with category first the model
   put almost everything in one bucket.
3. **Verify evidence in code** (`modules/conventions/helpers.ts`):
   - the path must be a sampled file (exact, `./`-prefixed, or a unique suffix);
   - the snippet needs ≥ 8 non-space characters;
   - the snippet must occur in that file, compared without whitespace and case;
     with several hits the one nearest the claimed line wins, so a wrong line
     number is corrected, not fatal;
   - the stored snippet is re-read from the file, never the model's copy.
   No evidence → the candidate is dropped (counted as `dropped_ungrounded`).
4. **Frequency check.** When the model gives a `pattern`, ripgrep counts the
   files that match (`occurrences`, shown as "seen in N files"). A pattern that
   matches only the evidence file marks a one-off, and its confidence is
   multiplied by 0.7. A pattern matching nothing is wrong, so the count is
   treated as unknown.
5. **Dedupe and store.** Duplicates of each other, and of rules already
   accepted or rejected, are dropped. A re-scan replaces only **pending** rows:
   accepted rules stay and rejected ones never come back.
6. **Review.** Accept / reject (clicking the active state returns it to
   pending), edit the rule inline, filter by category.
7. **Skill.** `POST /repos/:id/conventions/skill` builds a draft from the
   accepted rules (`<repo>-conventions`, one section per rule with its
   `Detected in file:line` snippet). The user edits it in the modal and saves it
   through `POST /skills` as an `extracted` skill.

## API

| Method | Path | |
|---|---|---|
| GET | `/repos/:id/conventions` | candidates + `sampled_files`, `last_scan_at` |
| POST | `/repos/:id/conventions/extract` | scan → proposed / dropped counts, model, cost |
| POST | `/repos/:id/conventions/skill` | skill draft from accepted ones (not saved) |
| PATCH | `/conventions/:id` | `rule`, `category`, `status` |
| DELETE | `/conventions/:id` | remove |

## Product improvements

Most raw candidates are noise; the goal is more findings that survive review.

**Built in this iteration**
- **Frequency check** (step 4): a rule seen in one file is a coincidence, not a
  convention. "Seen in N files" also tells the reviewer how much weight to give it.
- **Category filter** on the page, so a large scan can be reviewed one area at a time.

**Next, in order of expected value**
1. **Contradicting evidence.** Ask the model for a second pattern that would
   *violate* the rule, grep for it, and show "followed in 14 files, broken in 3".
   A rule broken as often as it's followed isn't a convention; one broken rarely
   is exactly what a reviewer should flag.
2. **Sample beyond the top-ranked files.** Rank favours central modules; tests,
   routes and components carry their own conventions. Add a second pass over one
   file per directory kind (tests, routes, UI, scripts), or stratify by extension.
3. **Learn from rejections.** Pass the last N rejected rules into the prompt as
   "not conventions here", so re-scans stop proposing the same kind of noise.
4. **Diff-aware re-scan.** Re-scan only files changed since `last_scan_at`, and
   mark accepted rules whose evidence no longer exists as *stale*.
5. **Confidence calibration.** Track the accept rate per category and per model
   and rescale confidence with it, so "80%" means something.
6. **Per-category skills.** One skill per category (`naming-conventions`, …) so
   agents link only what they need; a switch in the create-skill modal.
7. **Mine existing reviews.** Accepted review findings that repeat across PRs are
   conventions the team already enforces by hand.
