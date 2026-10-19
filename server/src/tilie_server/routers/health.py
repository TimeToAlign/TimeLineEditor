"""The server health route."""

from __future__ import annotations

from importlib.metadata import version

from fastapi import APIRouter

from tilie_server import __version__
from tilie_server.settings import API_PREFIX, PACKAGE_NAME

router = APIRouter()


@router.get(f"{API_PREFIX}health")
def health() -> dict[str, str]:
    """Report the installed server and timetoalign versions."""
    return {
        "name": PACKAGE_NAME,
        "version": __version__,
        "timetoalign": version("timetoalign"),
    }
