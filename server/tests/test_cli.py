from __future__ import annotations

import json
import socket
import subprocess
import sys
from importlib.metadata import version
from pathlib import Path

from tilie_server.cli import HOST, free_port


def run_tilie(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(Path(sys.executable).with_name("tilie")), "--no-browser", *args],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_check_succeeds_with_a_built_app(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><title>TimeLineEditor</title>")
    port = free_port()
    result = run_tilie("--check", "--port", str(port), "--static-dir", str(tmp_path))
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {
        "name": "tilie-server",
        "version": version("tilie-server"),
        "timetoalign": version("timetoalign"),
    }
    assert result.stderr == ""


def test_check_fails_without_a_built_app(tmp_path: Path) -> None:
    port = free_port()
    result = run_tilie("--check", "--port", str(port), "--static-dir", str(tmp_path))
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == (
        'tilie --check failed: GET / answered 503: {"detail":"app not built"}\n'
    )


def test_check_fails_when_the_port_is_taken(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        sock.listen()
        port = sock.getsockname()[1]
        result = run_tilie(
            "--check", "--port", str(port), "--static-dir", str(tmp_path)
        )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr.endswith(
        f"tilie: could not start the server on {HOST}:{port}\n"
    )
