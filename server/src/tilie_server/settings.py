"""Typed settings for one local server run."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PACKAGE_NAME = "tilie-server"
DEFAULT_STATIC_DIR = Path(__file__).parent / "static"
API_PREFIX = "/api/"


@dataclass(frozen=True)
class ServerSettings:
    """The network, authorization, and static-app settings for one run."""

    host: str
    port: int
    token: str
    static_dir: Path | None = None

    def allowed_hosts(self) -> frozenset[str]:
        """Return the ``Host`` header values this server answers to."""
        hosts = {f"{self.host}:{self.port}"}
        if self.host == "127.0.0.1":
            hosts.add(f"localhost:{self.port}")
        return frozenset(hosts)
