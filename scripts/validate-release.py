#!/usr/bin/env python3
"""Check the dependency-free static runtime and its local asset references."""
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RuntimeReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.urls.append(attrs["src"])
        if tag == "link" and attrs.get("href") and attrs.get("rel") in {"stylesheet", "manifest", "icon", "apple-touch-icon"}:
            self.urls.append(attrs["href"])


def local_path(url):
    if url.startswith(("http://", "https://", "//", "data:")):
        return None
    return url.split("?", 1)[0].split("#", 1)[0]


for script in ("app.js", "coloring.js", "sw.js"):
    subprocess.run(["node", "--check", str(ROOT / script)], check=True)

manifest = json.loads((ROOT / "manifest.webmanifest").read_text())
html = RuntimeReferences()
html.feed((ROOT / "index.html").read_text())
references = list(html.urls)
references.extend(icon["src"] for icon in manifest["icons"])

sw = (ROOT / "sw.js").read_text()
match = re.search(r"const appFiles = \[(.*?)\];", sw, re.S)
if not match:
    raise SystemExit("Could not find service-worker precache list")
precache = re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))
references.extend(precache)

for reference in references:
    path = local_path(reference)
    if path is None:
        raise SystemExit(f"Unexpected external runtime asset: {reference}")
    target = ROOT / path.removeprefix("./")
    if not target.exists() or (path not in {"", ".", "./"} and not target.is_file()):
        raise SystemExit(f"Missing referenced runtime asset: {reference}")

# A Pages project site is hosted below /drawing-game/, so runtime paths must be relative.
for path in ("index.html", "manifest.webmanifest", "sw.js"):
    text = (ROOT / path).read_text()
    if re.search(r"https?://(?:localhost|127\\.0\\.0\\.1|[^\"']*github\\.io)", text):
        raise SystemExit(f"Development/host-specific origin in {path}")

print(f"Validated JS syntax, manifest, {len(references)} local asset references, and project-subpath-safe runtime URLs.")
