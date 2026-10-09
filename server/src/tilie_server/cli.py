"""The ``tilie`` command: start the local server and open the editor."""

from __future__ import annotations

import argparse
import json
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from collections.abc import Sequence
from pathlib import Path

import uvicorn

from tilie_server.app import create_app

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


def start_server(server: uvicorn.Server) -> threading.Thread | None:
    """Run the server in a daemon thread and return it once the server listens.

    Returns ``None`` when the server fails to start, for example because the
    port is already bound; uvicorn has logged the reason by then.
    """
    thread = threading.Thread(target=server.run, name="uvicorn", daemon=True)
    thread.start()
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        if server.started:
            return thread
        if not thread.is_alive():
            return None
        time.sleep(0.02)
    server.should_exit = True
    return None


def stop_server(server: uvicorn.Server, thread: threading.Thread) -> None:
    server.should_exit = True
    thread.join(timeout=STARTUP_TIMEOUT)


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
    app = create_app(token=token, host=HOST, port=port, static_dir=args.static_dir)
    config = uvicorn.Config(
        app,
        host=HOST,
        port=port,
        log_level="error" if args.check else "info",
        access_log=not args.check,
    )
    server = uvicorn.Server(config)
    thread = start_server(server)
    if thread is None:
        print(f"tilie: could not start the server on {HOST}:{port}", file=sys.stderr)
        return 1
    base_url = f"http://{HOST}:{port}"

    if args.check:
        try:
            health = verify(base_url, token)
        except (CheckFailed, OSError, ValueError) as error:
            print(f"tilie --check failed: {error}", file=sys.stderr)
            return 1
        finally:
            stop_server(server, thread)
        print(json.dumps(health))
        return 0

    url = f"{base_url}/?token={token}"
    print(url, flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        while thread.is_alive():
            thread.join(timeout=0.5)
    except KeyboardInterrupt:
        stop_server(server, thread)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
