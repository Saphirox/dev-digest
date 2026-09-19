# Sample skills

Files here exist to exercise the **Skills → Add Skill → Import from file** flow.

- `semver-discipline.md`: a skill as a plain markdown file with frontmatter
  (`name`, `description`, `type`).
- `semver-discipline.zip`: the same skill packed the way skills are often shared,
  next to a `README.md` and an `install.sh`. The import preview shows the
  README and the script as **not imported**, with a warning for the script. They
  are listed only: never extracted, saved or run. Only `SKILL.md` becomes the
  skill, and it is saved **disabled** until you read and enable it.

Rebuild the archive after editing the markdown:

```sh
cd docs/skills && python3 build-sample-zip.py
```
