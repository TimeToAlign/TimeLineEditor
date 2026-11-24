"""The ``tilie`` command: start the server and open the editor, or serve it publicly."""

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
from fastapi import FastAPI

from tilie_server.app import create_app
from tilie_server.settings import (
    PUBLIC_BODY_LIMIT,
    PUBLIC_COMPUTATIONS,
    PUBLIC_CONNECTIONS,
    PUBLIC_TABLE_BYTES,
    PUBLIC_TABLE_ROWS,
    ServerSettings,
    size_named,
)

HOST = "127.0.0.1"
PUBLIC_BIND = "0.0.0.0"
"""The address a public run binds: every interface, so that a proxy or a
container's port mapping reaches it."""
HEALTH_KEYS = frozenset({"name", "version", "timetoalign", "timetoshare", "files"})
STARTUP_TIMEOUT = 15.0
# The port `tilie` listens on unless told otherwise. A browser keeps what a
# page stores (the identity that asserts the viewer's links, for one) for its
# address, port included, so a stable port keeps it from run to run.
DEFAULT_PORT = 8000


def free_port() -> int:
    """A port that was free on the loopback interface a moment ago."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def port_is_free(port: int) -> bool:
    """Whether ``port`` could be bound on the loopback interface a moment ago.

    The port is bound as the server binds it: with ``SO_REUSEADDR`` outside
    Windows, so that the connections of a run just stopped do not hold it.
    On Windows the option would let a second socket share a port in use.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if sys.platform != "win32":
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def choose_port(
    requested: int | None, default: int = DEFAULT_PORT
) -> tuple[int, str | None]:
    """The port to listen on, and the notice to print about it, if any.

    Args:
        requested: The port given with ``--port``, taken as it is; ``None``
            for none.
        default: The port taken without one, while it is free.

    Returns:
        The port and ``None``; or, when no port is requested and ``default``
        is in use, a free port and the notice saying so.
    """
    if requested is not None:
        return requested, None
    if port_is_free(default):
        return default, None
    port = free_port()
    return port, (
        f"tilie: port {default} is in use, so the server runs on port {port}; "
        "the browser remembers the editor's settings, your identity among them, "
        "for each port apart"
    )


def existing_folder(given: str) -> Path:
    """The folder ``--root`` names; refused unless it exists."""
    folder = Path(given)
    if not folder.is_dir():
        raise argparse.ArgumentTypeError(f"{given!r} is no existing folder")
    return folder


def public_host(given: str) -> str:
    """A host name ``--public-host`` gives; refused when empty, since an empty
    name would admit a request with an empty ``Host`` header."""
    if not given:
        raise argparse.ArgumentTypeError("a host name is not empty")
    return given


EXCLUDED_BY_PUBLIC_HOST = ("check", "root", "no_browser")
"""The options a public run refuses: it checks nothing, serves no files and
opens no browser."""


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="tilie",
        description="Start the TimeLineEditor server on 127.0.0.1 and open the "
        "editor, or serve the editor publicly with --public-host.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help=f"port to listen on (default: {DEFAULT_PORT}, or a free port while "
        f"{DEFAULT_PORT} is in use)",
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
    parser.add_argument(
        "--root",
        type=existing_folder,
        default=None,
        help="the folder whose files the editor may open and save (default: your "
        "home folder)",
    )
    parser.add_argument(
        "--public-host",
        type=public_host,
        action="append",
        default=None,
        metavar="HOST",
        help="serve the editor publicly as HOST, the Host header exactly as "
        "browsers send it (repeatable): bind 0.0.0.0, check no token, serve no "
        f"files, refuse request bodies over {size_named(PUBLIC_BODY_LIMIT)} and "
        f"tables of more than {PUBLIC_TABLE_ROWS:,} rows or "
        f"{size_named(PUBLIC_TABLE_BYTES)} uncompressed; excludes --check, --root "
        "and --no-browser",
    )
    args = parser.parse_args(argv)
    if args.public_host is not None:
        for name in EXCLUDED_BY_PUBLIC_HOST:
            if getattr(args, name) not in (None, False):
                option = "--" + name.replace("_", "-")
                parser.error(
                    f"argument {option}: not allowed with argument --public-host"
                )
    # Defaulted only now, so that the check above sees whether it was given.
    if args.root is None:
        args.root = Path.home()
    return args


def settings_for(args: argparse.Namespace, port: int) -> ServerSettings:
    """The settings of the run ``args`` asks for, on ``port``.

    A public run binds every interface, answers as the given hosts, checks
    no token, serves no files, bounds request bodies and posted tables, and
    limits its computations and connections; a local run binds
    the loopback interface with a new token and serves the files below its
    root.
    """
    if args.public_host is not None:
        return ServerSettings(
            host=PUBLIC_BIND,
            port=port,
            token=None,
            static_dir=args.static_dir,
            public_hosts=tuple(args.public_host),
            files=False,
            body_limit=PUBLIC_BODY_LIMIT,
            table_rows=PUBLIC_TABLE_ROWS,
            table_bytes=PUBLIC_TABLE_BYTES,
            computations=PUBLIC_COMPUTATIONS,
            connections=PUBLIC_CONNECTIONS,
        )
    return ServerSettings(
        host=HOST,
        port=port,
        token=secrets.token_urlsafe(32),
        static_dir=args.static_dir,
        root=args.root,
    )


def uvicorn_config(
    app: FastAPI, settings: ServerSettings, *, check: bool
) -> uvicorn.Config:
    """The uvicorn configuration of a run of ``app`` with ``settings``.

    Args:
        app: The application.
        settings: The run's settings, whose ``connections`` uvicorn keeps.
        check: Whether the run is a ``--check``, which logs only errors and
            no access lines.
    """
    return uvicorn.Config(
        app,
        host=settings.host,
        port=settings.port,
        log_level="error" if check else "info",
        access_log=not check,
        limit_concurrency=settings.connections,
    )


def public_notice(settings: ServerSettings) -> str:
    """The line a public run prints once it listens."""
    return (
        f"tilie: public mode on port {settings.port}, answering as "
        f"{', '.join(settings.public_hosts)}; no token, no file access"
    )


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


def verify(base_url: str, token: str) -> dict[str, str | bool | None]:
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
    port, notice = choose_port(args.port)
    if notice is not None:
        print(notice, file=sys.stderr, flush=True)
    settings = settings_for(args, port)
    app = create_app(settings)
    server = uvicorn.Server(uvicorn_config(app, settings, check=args.check))
    not_started = f"tilie: could not start the server on {settings.host}:{port}"

    if settings.token is None:
        # A public run: no token to hand to a page, no browser to open and no
        # check (the options are refused), only the line saying what it serves.

        def announce_public_server() -> None:
            print(public_notice(settings), file=sys.stderr, flush=True)

        if not run_server(server, announce_public_server):
            print(not_started, file=sys.stderr)
            return 1
        return 0

    token = settings.token
    base_url = f"http://{HOST}:{port}"

    if args.check:
        result: Queue[dict[str, str | bool | None] | Exception] = Queue(maxsize=1)

        def check_started_server() -> None:
            try:
                result.put(verify(base_url, token))
            except (CheckFailed, OSError, ValueError) as error:
                result.put(error)
            finally:
                server.should_exit = True

        started = run_server(server, check_started_server)
        if not started:
            print(not_started, file=sys.stderr)
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
        print(not_started, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
