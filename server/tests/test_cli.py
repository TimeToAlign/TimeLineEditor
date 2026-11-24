from __future__ import annotations

import json
import os
import re
import shlex
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from subprocess import Popen

import pytest

from tilie_server.cli import (
    DEFAULT_PORT,
    HOST,
    choose_port,
    free_port,
    parse_args,
    public_notice,
    settings_for,
)
from tilie_server.settings import ServerSettings

SHUTDOWN_TIMEOUT = 5
NOTICE = (
    "tilie: port {default} is in use, so the server runs on port {port}; "
    "the browser remembers the editor's settings, your identity among them, "
    "for each port apart"
)
# Windows cannot send SIGINT to another process nor start one with SIGINT
# ignored, and ends one at SIGTERM without a graceful shutdown.
posix_signals = pytest.mark.skipif(
    sys.platform == "win32", reason="the shutdown signals are POSIX signals"
)


def run_tilie(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(Path(sys.executable).with_name("tilie")), "--no-browser", *args],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_check_succeeds_with_a_built_app(
    tmp_path: Path, installed_health: dict[str, str | bool | None]
) -> None:
    (tmp_path / "index.html").write_text("<!doctype html><title>TimeLineEditor</title>")
    port = free_port()
    result = run_tilie("--check", "--port", str(port), "--static-dir", str(tmp_path))
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == installed_health
    assert result.stderr == ""


def test_check_fails_without_a_built_app(tmp_path: Path) -> None:
    port = free_port()
    result = run_tilie("--check", "--port", str(port), "--static-dir", str(tmp_path))
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == (
        'tilie --check failed: GET / answered 503: {"detail":"app not built"}\n'
    )


def bindable(port: int) -> bool:
    """Whether the test can bind ``port`` on the loopback interface now."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def test_the_default_port_is_8000() -> None:
    assert DEFAULT_PORT == 8000


def test_a_free_default_port_is_chosen_as_it_is() -> None:
    port = free_port()
    assert choose_port(None, default=port) == (port, None)


def test_a_default_port_in_use_gives_a_free_port_and_a_notice() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        sock.listen()
        held = sock.getsockname()[1]
        port, notice = choose_port(None, default=held)
        assert notice == NOTICE.format(default=held, port=port)
        assert port != held
    assert bindable(port)


def test_a_requested_port_is_kept_even_while_it_is_in_use() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        sock.listen()
        held = sock.getsockname()[1]
        assert choose_port(held, default=free_port()) == (held, None)


def test_without_a_port_the_command_falls_back_while_8000_is_in_use(
    tmp_path: Path, installed_health: dict[str, str | bool | None]
) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, DEFAULT_PORT))
            sock.listen()
        except OSError:
            pass  # another process holds the port: it is in use either way
        result = run_tilie("--check", "--static-dir", str(tmp_path))
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == installed_health
    before, after = (re.escape(part) for part in NOTICE.split("{port}"))
    pattern = before.replace(re.escape("{default}"), str(DEFAULT_PORT))
    match = re.fullmatch(rf"{pattern}(?P<port>\d+){after}\n", result.stderr)
    assert match is not None, result.stderr
    assert int(match["port"]) != DEFAULT_PORT


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


def start_tilie(static_dir: Path, port: int, *, background: bool = False) -> Popen[str]:
    """Start the long-running command; as a background job, SIGINT is ignored.

    A non-interactive shell starts every background job with SIGINT ignored,
    and the job's children inherit that disposition.
    """

    def ignore_sigint() -> None:
        signal.signal(signal.SIGINT, signal.SIG_IGN)

    return subprocess.Popen(
        [
            str(Path(sys.executable).with_name("tilie")),
            "--no-browser",
            "--port",
            str(port),
            "--static-dir",
            str(static_dir),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        preexec_fn=ignore_sigint if background else None,
    )


def stop(process: Popen[str], shutdown_signal: signal.Signals) -> tuple[str, str]:
    """Send ``shutdown_signal`` and collect the remaining output.

    The process never outlives this call: one still running after
    ``SHUTDOWN_TIMEOUT`` seconds, or one the signal could not be sent to, is
    killed and the error re-raised, so a defective server can neither stall
    the suite nor stay running after it.
    """
    try:
        process.send_signal(shutdown_signal)
        return process.communicate(timeout=SHUTDOWN_TIMEOUT)
    finally:
        if process.poll() is None:
            process.kill()
            process.communicate()


@posix_signals
def test_the_token_never_reaches_the_access_log(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    port = free_port()
    process = start_tilie(tmp_path, port)
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
        rest, stderr = stop(process, signal.SIGINT)
    assert process.returncode == 0, stderr
    output = url + "\n" + rest + stderr
    requests = re.findall(r'"([A-Z]+ \S+ HTTP/1\.1)" (\d{3})', output)
    assert requests == [
        ("GET / HTTP/1.1", "200"),
        ("GET /api/health HTTP/1.1", "200"),
    ]
    assert output.count(token) == 1


@posix_signals
@pytest.mark.parametrize(
    ("shutdown_signal", "background"),
    [
        pytest.param(signal.SIGINT, False, id="SIGINT"),
        pytest.param(signal.SIGINT, True, id="SIGINT-to-a-background-job"),
        pytest.param(signal.SIGTERM, False, id="SIGTERM"),
    ],
)
def test_a_shutdown_signal_stops_the_server_gracefully(
    tmp_path: Path, shutdown_signal: signal.Signals, background: bool
) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    port = free_port()
    process = start_tilie(tmp_path, port, background=background)
    try:
        assert process.stdout is not None
        url = process.stdout.readline()
    finally:
        rest, stderr = stop(process, shutdown_signal)
    assert url.startswith(f"http://127.0.0.1:{port}/#token=")
    assert rest == ""
    assert process.returncode == 0, stderr
    pid = process.pid
    assert stderr == (
        f"INFO:     Started server process [{pid}]\n"
        "INFO:     Waiting for application startup.\n"
        "INFO:     Application startup complete.\n"
        f"INFO:     Uvicorn running on http://127.0.0.1:{port}"
        " (Press CTRL+C to quit)\n"
        "INFO:     Shutting down\n"
        "INFO:     Waiting for application shutdown.\n"
        "INFO:     Application shutdown complete.\n"
        f"INFO:     Finished server process [{pid}]\n"
    )


PUBLIC_REFUSAL = (
    "tilie: error: argument {option}: not allowed with argument --public-host\n"
)


@pytest.mark.parametrize("option", ["--check", "--root", "--no-browser"])
def test_public_mode_refuses_the_local_options(
    tmp_path: Path, option: str, capsys: pytest.CaptureFixture[str]
) -> None:
    given = [option, str(tmp_path)] if option == "--root" else [option]
    with pytest.raises(SystemExit) as stopped:
        parse_args(["--public-host", "tilie.example.org", *given])
    assert stopped.value.code == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err.endswith(PUBLIC_REFUSAL.format(option=option))


def test_an_empty_public_host_is_refused(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as stopped:
        parse_args(["--public-host", ""])
    assert stopped.value.code == 2
    assert capsys.readouterr().err.endswith(
        "tilie: error: argument --public-host: a host name is not empty\n"
    )


def test_a_public_command_line_builds_the_public_settings() -> None:
    args = parse_args(
        [
            "--public-host",
            "tilie.example.org",
            "--public-host",
            "localhost:8000",
            "--port",
            "8001",
        ]
    )
    settings = settings_for(args, 8001)
    assert settings == ServerSettings(
        host="0.0.0.0",
        port=8001,
        token=None,
        static_dir=None,
        root=Path.home(),
        public_hosts=("tilie.example.org", "localhost:8000"),
        files=False,
        body_limit=16 * 1024 * 1024,
        table_rows=1_000_000,
        table_bytes=128 * 1024 * 1024,
    )
    assert public_notice(settings) == (
        "tilie: public mode on port 8001, answering as "
        "tilie.example.org, localhost:8000; no token, no file access"
    )


def test_a_local_command_line_builds_the_local_settings() -> None:
    settings = settings_for(parse_args(["--port", "8001"]), 8001)
    assert settings.token is not None
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", settings.token)
    assert settings == ServerSettings(
        host="127.0.0.1",
        port=8001,
        token=settings.token,
        static_dir=None,
        root=Path.home(),
        public_hosts=(),
        files=True,
        body_limit=None,
        table_rows=None,
        table_bytes=None,
    )


OPENER_TIMEOUT = 60.0
"""A safety net only: how long the local control may take to open its
browser before the test gives up. No duration is measured."""


def browser_writing(marker: Path) -> dict[str, str]:
    """An environment whose ``BROWSER`` writes the URL it opens into ``marker``."""
    write = "import pathlib, sys; pathlib.Path(sys.argv[1]).write_text(sys.argv[2])"
    command = shlex.join([sys.executable, "-c", write, str(marker)]) + " %s"
    return {**os.environ, "BROWSER": command}


@posix_signals
def test_public_mode_serves_without_a_token_and_opens_no_browser(
    tmp_path: Path, installed_health: dict[str, str | bool | None]
) -> None:
    editor = tmp_path / "editor"
    editor.mkdir()
    (editor / "index.html").write_text("<!doctype html>")
    marker = tmp_path / "opened"
    port = free_port()
    host = f"localhost:{port}"
    notice = (
        f"tilie: public mode on port {port}, answering as {host}; "
        "no token, no file access\n"
    )
    process = subprocess.Popen(
        [
            str(Path(sys.executable).with_name("tilie")),
            "--public-host",
            host,
            "--port",
            str(port),
            "--static-dir",
            str(editor),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=browser_writing(marker),
    )
    try:
        assert process.stderr is not None
        startup = []
        while (line := process.stderr.readline()) not in (notice, ""):
            startup.append(line)
        assert line == notice, "".join(startup)
        health = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/health", headers={"Host": host}
        )
        with urllib.request.urlopen(health, timeout=60) as response:
            assert response.status == 200
            assert json.loads(response.read()) == {**installed_health, "files": False}
    finally:
        rest, stderr = stop(process, signal.SIGTERM)
    assert process.returncode == 0, stderr
    pid = process.pid
    assert "".join(startup) + line + stderr == (
        f"INFO:     Started server process [{pid}]\n"
        "INFO:     Waiting for application startup.\n"
        "INFO:     Application startup complete.\n"
        f"INFO:     Uvicorn running on http://0.0.0.0:{port}"
        " (Press CTRL+C to quit)\n"
        f"{notice}"
        "INFO:     Shutting down\n"
        "INFO:     Waiting for application shutdown.\n"
        "INFO:     Application shutdown complete.\n"
        f"INFO:     Finished server process [{pid}]\n"
    )
    requests = re.findall(r'"([A-Z]+ \S+ HTTP/1\.1)" (\d{3})', rest)
    assert requests == [("GET /api/health HTTP/1.1", "200")]
    assert len(rest.splitlines()) == 1
    assert not marker.exists()


@posix_signals
def test_a_local_run_opens_the_browser_the_environment_names(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    marker = tmp_path / "opened"
    port = free_port()
    process = subprocess.Popen(
        [
            str(Path(sys.executable).with_name("tilie")),
            "--port",
            str(port),
            "--static-dir",
            str(tmp_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=browser_writing(marker),
    )
    try:
        assert process.stdout is not None
        url = process.stdout.readline().removesuffix("\n")
        deadline = time.monotonic() + OPENER_TIMEOUT
        while time.monotonic() < deadline and (
            not marker.exists() or marker.read_text() != url
        ):
            time.sleep(0.02)
    finally:
        stop(process, signal.SIGTERM)
    assert url.startswith(f"http://127.0.0.1:{port}/#token=")
    assert marker.read_text() == url
