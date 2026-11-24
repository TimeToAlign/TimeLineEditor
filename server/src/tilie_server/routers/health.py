"""The server health route."""

from __future__ import annotations

from importlib.metadata import version

from fastapi import APIRouter, Request

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
    # Deliberately broad, around the import alone: importing timetoshare
    # runs its package code (the schema and jsonschema), and a package that
    # fails there with any exception must not turn the health answer, which
    # a host reads to see that the server runs, into a server error.
    except Exception:
        return None
    return SCHEMA_VERSION


@router.get(f"{API_PREFIX}health")
def health(request: Request) -> dict[str, str | bool | None]:
    """Report the server's version, the installed timetoalign's, the
    imported timetoshare's (``None`` without one), and whether the server
    serves the file routes (``files``)."""
    return {
        "name": PACKAGE_NAME,
        "version": __version__,
        "timetoalign": version("timetoalign"),
        "timetoshare": timetoshare_version(),
        "files": request.app.state.files,
    }
