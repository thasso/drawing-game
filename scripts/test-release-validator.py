#!/usr/bin/env python3
"""Exercise the release gate against runtime files containing prohibited hosts."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

with tempfile.TemporaryDirectory(prefix="sketchbook-release-test-") as temporary:
    site = Path(temporary)
    (site / "scripts").mkdir()
    shutil.copy2(ROOT / "scripts/validate-release.py", site / "scripts")
    for name in ("index.html", "manifest.webmanifest", "sw.js", "app.js", "coloring.js", "style.css"):
        shutil.copy2(ROOT / name, site / name)
    shutil.copytree(ROOT / "icons", site / "icons")

    probes = [
        ("index.html", "http://localhost:8080/"),
        ("manifest.webmanifest", "http://127.0.0.1:8080/"),
        ("sw.js", "https://thasso.github.io/drawing-game/"),
        ("app.js", "http://127.0.0.1/"),
        ("coloring.js", "https://thasso.github.io/drawing-game/"),
        ("style.css", "//thasso.github.io/drawing-game/"),
        ("icons/sketchbook.svg", "https://THASSO.GITHUB.IO/drawing-game/"),
    ]
    for name, host in probes:
        target = site / name
        original = target.read_text()
        if name.endswith(".webmanifest"):
            manifest = json.loads(original)
            manifest["description"] = host
            modified = json.dumps(manifest)
        else:
            modified = original + f"\n/* {host} */\n"
        target.write_text(modified)
        result = subprocess.run(["python3", str(site / "scripts/validate-release.py")], capture_output=True, text=True)
        assert result.returncode != 0, f"Accepted {host} in {name}"
        assert f"Development/host-specific origin in {name}" in result.stderr, result.stderr
        target.write_text(original)
        print(f"PASS rejects {host} in {name}")

    result = subprocess.run(["python3", str(site / "scripts/validate-release.py")], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    print("PASS unchanged runtime passes")
