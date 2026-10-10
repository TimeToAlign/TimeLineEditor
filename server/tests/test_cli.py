from __future__ import annotations

import json
import re
import signal
import socket
import subprocess
import sys
import urllib.request
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


def test_the_token_never_reaches_the_access_log(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    port = free_port()
    process = subprocess.Popen(
        [
            str(Path(sys.executable).with_name("tilie")),
            "--no-browser",
            "--port",
            str(port),
            "--static-dir",
            str(tmp_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert process.stdout is not None
        url = process.stdout.readline().removesuffix("\n")
        match = re.fullmatch(
            rf"http://127\.0\.0\.1:{port}/#token=(?P<token>[A-Za-z0-9_-]{{43}})", url
        )
        assert match is not None, url
        token = match["token"]
        # Requested as printed: like a browser, urllib sends no fragment.
        with urllib.request.urlopen(url, timeout=60) as response:
            assert response.status == 200
        health = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/health",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(health, timeout=60) as response:
            assert response.status == 200
    finally:
        process.send_signal(signal.SIGINT)
        rest, stderr = process.communicate(timeout=60)
    assert process.returncode == 0, stderr
    output = url + "\n" + rest + stderr
    requests = re.findall(r'"([A-Z]+ \S+ HTTP/1\.1)" (\d{3})', output)
    assert requests == [
        ("GET / HTTP/1.1", "200"),
        ("GET /api/health HTTP/1.1", "200"),
    ]
    assert output.count(token) == 1
