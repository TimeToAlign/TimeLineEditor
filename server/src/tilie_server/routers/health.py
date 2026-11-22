"""The server health route."""

from __future__ import annotations

from importlib.metadata import version

from fastapi import APIRouter

from tilie_server import __version__
from tilie_server.settings import API_PREFIX, PACKAGE_NAME

router = APIRouter()


def timetoshare_version() -> str | None:
    """The version of the timetoshare package the server imports.

    A TimeToShare version is the version of the schema it reads and writes,
    which the package states as ``SCHEMA_VERSION``; the installed metadata
    of an editable install keeps the version it was installed at, so the
    package itself is asked. ``None`` when timetoshare cannot be imported:
    the server starts without it (timetoalign requires it, the server does
    not).
    """
    try:
        from timetoshare import SCHEMA_VERSION
    except ImportError:
        return None
    return SCHEMA_VERSION


@router.get(f"{API_PREFIX}health")
def health() -> dict[str, str | None]:
    """Report the server's version, the installed timetoalign's and the
    imported timetoshare's (``None`` without one)."""
    return {
        "name": PACKAGE_NAME,
        "version": __version__,
        "timetoalign": version("timetoalign"),
        "timetoshare": timetoshare_version(),
    }
