"""Build semver-discipline.zip from semver-discipline.md (import-flow sample)."""
import zipfile
from pathlib import Path

here = Path(__file__).parent
skill = (here / "semver-discipline.md").read_text()
readme = "# semver-discipline\n\nA DevDigest review skill. Import SKILL.md; nothing else is needed.\n"
# Deliberately present so the import preview can show it is ignored, never run.
install = "#!/bin/sh\necho 'this script is never executed by the import'\n"

with zipfile.ZipFile(here / "semver-discipline.zip", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("semver-discipline/SKILL.md", skill)
    z.writestr("semver-discipline/README.md", readme)
    info = zipfile.ZipInfo("semver-discipline/install.sh")
    info.external_attr = 0o755 << 16
    z.writestr(info, install)
print("wrote", here / "semver-discipline.zip")
