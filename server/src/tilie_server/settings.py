"""Typed settings for one server run."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

PACKAGE_NAME = "tilie-server"
DEFAULT_STATIC_DIR = Path(__file__).parent / "static"
API_PREFIX = "/api/"
MIB = 1024 * 1024
PUBLIC_BODY_LIMIT = 16 * MIB
"""The largest request body, in bytes, a server in public mode accepts."""
PUBLIC_TABLE_ROWS = 1_000_000
"""The most rows of a posted table a server in public mode reads."""
PUBLIC_TABLE_BYTES = 128 * MIB
"""The largest posted table, in bytes uncompressed, a server in public mode reads."""


def size_named(size: int) -> str:
    """A number of bytes as a refusal names it.

    A whole number of MiB is named in MiB, any other number in bytes, with a
    comma between thousands.
    """
    if size > 0 and size % MIB == 0:
        return f"{size // MIB:,} MiB"
    return f"{size:,} byte{'' if size == 1 else 's'}"


@dataclass(frozen=True)
class ServerSettings:
    """The network, authorization, static-app and file settings for one run.

    A local run (the default) answers to its own loopback origin, checks the
    run's bearer token on every ``/api/`` path and serves the file routes
    below ``root``. A public run names the hosts it answers as in
    ``public_hosts``, checks no token, serves no files and bounds every
    request body and every posted table.

    Attributes:
        host: The address the server binds.
        port: The port the server listens on.
        token: The bearer token every ``/api/`` path requires; ``None`` for
            no token check.
        static_dir: The built editor to serve; the bundled one when ``None``.
        root: The folder whose files the file routes serve: the user's home
            folder unless another is given.
        public_hosts: The ``Host`` header values a public run answers to,
            exactly as given; empty for a local run.
        files: Whether the file routes are served.
        body_limit: The largest request body in bytes; ``None`` for no limit.
        table_rows: The most rows of a posted table; ``None`` for no bound.
        table_bytes: The largest posted table in bytes uncompressed;
            ``None`` for no bound.
    """

    host: str
    port: int
    token: str | None
    static_dir: Path | None = None
    root: Path = field(default_factory=Path.home)
    public_hosts: tuple[str, ...] = ()
    files: bool = True
    body_limit: int | None = None
    table_rows: int | None = None
    table_bytes: int | None = None

    def allowed_hosts(self) -> frozenset[str]:
        """Return the ``Host`` header values this server answers to."""
        if self.public_hosts:
            return frozenset(self.public_hosts)
        hosts = {f"{self.host}:{self.port}"}
        if self.host == "127.0.0.1":
            hosts.add(f"localhost:{self.port}")
        return frozenset(hosts)

    def allowed_origins(self) -> frozenset[str]:
        """Return the ``Origin`` header values this server accepts.

        A public host is reached through HTTPS in front of the server, or
        through HTTP on a trial run, so both schemes are accepted for it; a
        local run is reached through HTTP alone.
        """
        if self.public_hosts:
            return frozenset(
                f"{scheme}://{host}"
                for host in self.public_hosts
                for scheme in ("https", "http")
            )
        return frozenset(f"http://{host}" for host in self.allowed_hosts())
