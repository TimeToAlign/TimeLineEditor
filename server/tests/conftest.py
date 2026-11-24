from __future__ import annotations

from importlib.metadata import version

import pytest
from timetoshare import load_schema


@pytest.fixture
def installed_health() -> dict[str, str | bool | None]:
    """The health answer of this installation.

    The server's and timetoalign's versions are their installed metadata;
    timetoshare's is the version marker its bundled schema demands of a
    manifest, which an editable install's stale metadata cannot hide.
    ``files`` is a local run's: the file routes are served.
    """
    manifest = load_schema()["$defs"]["Manifest"]
    return {
        "name": "tilie-server",
        "version": version("tilie-server"),
        "timetoalign": version("timetoalign"),
        "timetoshare": manifest["properties"]["timetoshare"]["const"],
        "files": True,
    }
