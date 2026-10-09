from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

REPOSITORY = Path(__file__).resolve().parents[2]
SCRIPT = REPOSITORY / "scripts" / "check_versions.py"


def declared_versions() -> tuple[str, str]:
    with (REPOSITORY / "server" / "pyproject.toml").open("rb") as file:
        server = tomllib.load(file)["project"]["version"]
    app = json.loads((REPOSITORY / "app" / "package.json").read_text())["version"]
    return server, app


def run_check(tag: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--tag", tag],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def test_matching_tag_passes() -> None:
    server, app = declared_versions()
    assert server == app
    result = run_check(f"v{server}")
    assert result.returncode == 0
    assert (
        result.stdout
        == f"v{server} matches server/pyproject.toml and app/package.json\n"
    )


def test_mismatching_tag_fails() -> None:
    server, app = declared_versions()
    result = run_check("v99.0.0")
    assert result.returncode == 1
    assert result.stdout == (
        f"server/pyproject.toml declares {server}, tag v99.0.0 expects 99.0.0\n"
        f"app/package.json declares {app}, tag v99.0.0 expects 99.0.0\n"
    )


@pytest.mark.parametrize("tag", ["0.1.0", "v00.1.0", "v0.1.0rc1", "v0.1"])
def test_invalid_tag_fails(tag: str) -> None:
    result = run_check(tag)
    assert result.returncode == 1
    assert result.stderr == f"invalid release tag: {tag}; expected vX.Y.Z\n"
