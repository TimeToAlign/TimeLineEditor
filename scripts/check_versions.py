#!/usr/bin/env python3
"""Verify that a release tag matches the versions declared in the repository.

Usage: ``check_versions.py --tag vX.Y.Z``. Exits 0 when ``server/pyproject.toml``
and ``app/package.json`` both declare ``X.Y.Z``, 1 otherwise, printing one
line per mismatch.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tomllib
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parent.parent


def declared_versions() -> dict[str, str]:
    with (REPOSITORY / "server" / "pyproject.toml").open("rb") as file:
        server = tomllib.load(file)["project"]["version"]
    app = json.loads((REPOSITORY / "app" / "package.json").read_text())["version"]
    return {"server/pyproject.toml": server, "app/package.json": app}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    tag = parser.parse_args(argv[1:]).tag
    if re.fullmatch(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", tag) is None:
        print(f"invalid release tag: {tag}; expected vX.Y.Z", file=sys.stderr)
        return 1
    expected = tag[1:]
    mismatches = {
        path: declared
        for path, declared in declared_versions().items()
        if declared != expected
    }
    for path, declared in mismatches.items():
        print(f"{path} declares {declared}, tag {tag} expects {expected}")
    if mismatches:
        return 1
    print(f"{tag} matches server/pyproject.toml and app/package.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
