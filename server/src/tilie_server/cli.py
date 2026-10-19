"""The ``tilie`` command: start the local server and open the editor."""

from __future__ import annotations

import argparse
import json
import secrets
import signal
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from collections.abc import Callable, Sequence
from pathlib import Path
from queue import Empty, Queue

import uvicorn

from tilie_server.app import create_app
from tilie_server.settings import ServerSettings

HOST = "127.0.0.1"
HEALTH_KEYS = frozenset({"name", "version", "timetoalign"})
STARTUP_TIMEOUT = 15.0


def free_port() -> int:
    """A port that was free on the loopback interface a moment ago."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="tilie",
        description="Start the TimeLineEditor server on 127.0.0.1 and open the editor.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="port to listen on (default: a free port)",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="print the URL instead of opening a browser",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify health and the editor, then stop; exit 1 on failure",
    )
    parser.add_argument(
        "--static-dir",
        type=Path,
        default=None,
        help="serve this directory instead of the bundled app (development)",
    )
    return parser.parse_args(argv)


def wait_until_started(server: uvicorn.Server) -> bool:
    """Wait until ``server`` listens, requesting shutdown on a timeout."""
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        if server.started:
            return True
        if server.should_exit:
            return False
        time.sleep(0.02)
    server.should_exit = True
    return False


def run_server(server: uvicorn.Server, on_started: Callable[[], None]) -> bool:
    """Run uvicorn in the main thread and perform ``on_started`` alongside it.

    Uvicorn can install its SIGINT and SIGTERM handlers only in the main
    thread. The short-lived observer does no server work; it waits for startup
    and then prints or verifies the URL.
    """

    def observe_startup() -> None:
        if wait_until_started(server):
            on_started()

    observer = threading.Thread(
        target=observe_startup, name="tilie-startup", daemon=True
    )
    observer.start()
    previous_sigterm = signal.signal(signal.SIGTERM, signal.default_int_handler)
    try:
        try:
            server.run()
        except (KeyboardInterrupt, SystemExit):
            # Uvicorn gracefully handles the signal before restoring and
            # replaying it. Both intentional shutdown signals are successful.
            pass
    finally:
        signal.signal(signal.SIGTERM, previous_sigterm)
    return server.started


def fetch(url: str, token: str) -> tuple[int, bytes]:
    """GET ``url`` with the bearer token and return status and body."""
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=STARTUP_TIMEOUT) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


class CheckFailed(Exception):
    """A ``--check`` verification step did not pass."""


def verify(base_url: str, token: str) -> dict[str, str]:
    """Verify the health endpoint and the editor; return the health document."""
    status, body = fetch(f"{base_url}/api/health", token)
    if status != 200:
        raise CheckFailed(
            f"GET /api/health answered {status}: {body.decode(errors='replace')}"
        )
    health = json.loads(body)
    if not isinstance(health, dict) or set(health) != HEALTH_KEYS:
        raise CheckFailed(
            f"GET /api/health must contain exactly {sorted(HEALTH_KEYS)}: {health}"
        )
    status, body = fetch(f"{base_url}/", token)
    if status != 200:
        raise CheckFailed(f"GET / answered {status}: {body.decode(errors='replace')}")
    return health


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    port = free_port() if args.port is None else args.port
    token = secrets.token_urlsafe(32)
    settings = ServerSettings(
        host=HOST,
        port=port,
        token=token,
        static_dir=args.static_dir,
    )
    app = create_app(settings)
    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="error" if args.check else "info",
        access_log=not args.check,
    )
    server = uvicorn.Server(config)
    base_url = f"http://{HOST}:{port}"

    if args.check:
        result: Queue[dict[str, str] | Exception] = Queue(maxsize=1)

        def check_started_server() -> None:
            try:
                result.put(verify(base_url, token))
            except (CheckFailed, OSError, ValueError) as error:
                result.put(error)
            finally:
                server.should_exit = True

        started = run_server(server, check_started_server)
        if not started:
            print(
                f"tilie: could not start the server on {HOST}:{port}", file=sys.stderr
            )
            return 1
        # The observer runs once the server has started; should it be passed over
        # at the startup deadline, nothing is put, so the wait is bounded too.
        try:
            outcome = result.get(timeout=STARTUP_TIMEOUT)
        except Empty:
            print(
                "tilie --check failed: the server started but was not checked",
                file=sys.stderr,
            )
            return 1
        if isinstance(outcome, Exception):
            print(f"tilie --check failed: {outcome}", file=sys.stderr)
            return 1
        print(json.dumps(outcome))
        return 0

    # The token rides in the fragment, which the browser never sends to the
    # server, so it stays out of the access log; the editor reads it from
    # there and removes it from the address bar and the history entry.
    url = f"{base_url}/#token={token}"

    def announce_started_server() -> None:
        print(url, flush=True)
        if not args.no_browser:
            webbrowser.open(url)

    if not run_server(server, announce_started_server):
        print(f"tilie: could not start the server on {HOST}:{port}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
