"""Record the answer of every route the client package calls, for its tests.

Run from ``server/`` with ``uv run python scripts/record_answers.py``. It
builds the application, sends each route the fixed request listed in
:data:`RECORDINGS` through an in-process client, and writes each answer's
body, byte for byte, to ``app/packages/client/tests/data/<name>.answer.bin``,
or into the folder given as the one argument. The client's tests read
those files as the server's answers, and the server's tests run this script
into a temporary folder and compare its files with the ones committed, so
an answer that changes fails there until it is recorded again.

The requests:

- ``GET /api/health``;
- ``POST /api/measure-maps`` with the server tests' copy of TimeToShare's
  fixture ``groups/group_measure_map.minimal.yaml``;
- ``POST /api/flows`` with TimeToShare's fixture
  ``flow/sonata_exposition.minimal.yaml`` and its timeline ``score``, and
  once more with ``flow/ossia.minimal.yaml``, its timeline ``score`` and the
  convention ``default`` (the fixture with findings);
- ``POST /api/flows/flow-maps`` with ``flow/da_capo_al_fine.minimal.yaml``
  and its timeline ``score``;
- the four MatchClaim routes with TimeToShare's table fixture
  (``fixtures/tables/<version>/``: its ``manifest.yaml`` and
  ``match_claims.parquet``, both as they are): the columns; the provenance
  of ``claim_6``, ``claim_15``, ``claim_1``; A's belief ``false`` in
  ``claim_6`` on 2026-11-22; the events of ``claim_1``, ``claim_11``,
  ``claim_12``;
- the file routes below a root made for the run: the listing of
  ``sub dir/ä`` (a folder ``d`` and a file ``a.yaml``), the file ``a.yaml``
  holding ``x: 1``, and the write of ``y: ä`` into ``sub/new.tle.json``.

The routes of the MusicBrainz lookup are not the client's: the editor's
lookup tests replay the server's own MusicBrainz recordings.

The script is not part of the package; nothing runs it but a person
refreshing the recordings after an answer's form or a fixture changed.
"""

from __future__ import annotations

import json
import sys
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from timetoshare.tables import fixture_path
from timetoshare.validate import SCHEMA_VERSION, data_root

from tilie_server.app import create_app
from tilie_server.routers.match_claims import PREFIX
from tilie_server.settings import ServerSettings

SERVER = Path(__file__).parent.parent
RECORDINGS_FOLDER = SERVER.parent / "app" / "packages" / "client" / "tests" / "data"
"""Where the client package's tests read the recordings."""

HOST = "127.0.0.1"
PORT = 8765
TOKEN = "recording-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
OCTETS = {**AUTH, "Content-Type": "application/octet-stream"}

A = "https://orcid.org/0000-0002-1825-0097"
"""The actor of the recorded belief, one of the table fixture's two."""


def table_body() -> bytes:
    """The body of ``POST /api/match-claims`` for TimeToShare's table fixture,
    as the editor builds it."""
    manifest = fixture_path("manifest.yaml").read_bytes()
    table = fixture_path("match_claims.parquet").read_bytes()
    return PREFIX.pack(len(manifest)) + manifest + table


def with_parameters(parameters: dict[str, object]) -> bytes:
    """The parameters as compact JSON behind their length, then
    :func:`table_body`, as the client sends them."""
    text = json.dumps(parameters, separators=(",", ":")).encode("utf-8")
    return PREFIX.pack(len(text)) + text + table_body()


def flow_body(name: str, **parameters: str) -> bytes:
    """The body of a flow route for TimeToShare's fixture ``flow/<name>`` in
    the minimal form and its timeline ``score``, as the client sends it: the
    parameters as compact JSON behind their length, then the manifest."""
    fixtures = data_root() / "fixtures" / SCHEMA_VERSION / "flow"
    manifest = (fixtures / f"{name}.minimal.yaml").read_bytes()
    asked = {"timeline": "score", **parameters}
    text = json.dumps(asked, separators=(",", ":")).encode("utf-8")
    return PREFIX.pack(len(text)) + text + manifest


def made_root(root: Path) -> None:
    """The files below the root the file routes are recorded on."""
    (root / "sub dir" / "ä" / "d").mkdir(parents=True)
    (root / "sub dir" / "ä" / "a.yaml").write_text("x: 1\n", encoding="utf-8")
    (root / "a.yaml").write_text("x: 1\n", encoding="utf-8")
    (root / "sub").mkdir()


Request = Callable[[TestClient], Any]

RECORDINGS: dict[str, tuple[str, str, Request]] = {
    "health": ("GET", "/api/health", lambda c: c.get("/api/health", headers=AUTH)),
    "measure-maps": (
        "POST",
        "/api/measure-maps",
        lambda c: c.post(
            "/api/measure-maps",
            headers=AUTH,
            content=(
                SERVER / "tests" / "data" / "group_measure_map.minimal.yaml"
            ).read_bytes(),
        ),
    ),
    "flows": (
        "POST",
        "/api/flows",
        lambda c: c.post(
            "/api/flows", headers=OCTETS, content=flow_body("sonata_exposition")
        ),
    ),
    "flows-findings": (
        "POST",
        "/api/flows",
        lambda c: c.post(
            "/api/flows",
            headers=OCTETS,
            content=flow_body("ossia", convention="default"),
        ),
    ),
    "flows-flow-maps": (
        "POST",
        "/api/flows/flow-maps",
        lambda c: c.post(
            "/api/flows/flow-maps",
            headers=OCTETS,
            content=flow_body("da_capo_al_fine"),
        ),
    ),
    "match-claims": (
        "POST",
        "/api/match-claims",
        lambda c: c.post("/api/match-claims", headers=OCTETS, content=table_body()),
    ),
    "match-claims-provenance": (
        "POST",
        "/api/match-claims/provenance",
        lambda c: c.post(
            "/api/match-claims/provenance",
            headers=OCTETS,
            content=with_parameters({"claims": ["claim_6", "claim_15", "claim_1"]}),
        ),
    ),
    "match-claims-belief": (
        "POST",
        "/api/match-claims/belief",
        lambda c: c.post(
            "/api/match-claims/belief",
            headers=OCTETS,
            content=with_parameters(
                {
                    "claim": "claim_6",
                    "actor": A,
                    "belief": "false",
                    "date": "2026-11-22",
                }
            ),
        ),
    ),
    "match-claims-events": (
        "POST",
        "/api/match-claims/events",
        lambda c: c.post(
            "/api/match-claims/events",
            headers=OCTETS,
            content=with_parameters({"claims": ["claim_1", "claim_11", "claim_12"]}),
        ),
    ),
    "folders": (
        "GET",
        "/api/folders",
        lambda c: c.get("/api/folders", params={"path": "sub dir/ä"}, headers=AUTH),
    ),
    "files-get": (
        "GET",
        "/api/files",
        lambda c: c.get("/api/files", params={"path": "a.yaml"}, headers=AUTH),
    ),
    "files-put": (
        "PUT",
        "/api/files",
        lambda c: c.put(
            "/api/files",
            params={"path": "sub/new.tle.json"},
            headers=OCTETS,
            content="y: ä\n".encode(),
        ),
    ),
}
"""Each recording's name, the method and path of its route, and its request."""


def recording_path(folder: Path, name: str) -> Path:
    """The file holding the recording ``name`` in ``folder``."""
    return folder / f"{name}.answer.bin"


def record(folder: Path) -> list[Path]:
    """Write every recording into ``folder``; return the files written.

    Raises:
        RuntimeError: If a route does not answer 200.
    """
    folder.mkdir(parents=True, exist_ok=True)
    written = []
    with tempfile.TemporaryDirectory() as made:
        root = Path(made)
        made_root(root)
        settings = ServerSettings(HOST, PORT, TOKEN, root / "no-editor", root)
        client = TestClient(create_app(settings), base_url=f"http://{HOST}:{PORT}")
        for name, (method, path, request) in RECORDINGS.items():
            response = request(client)
            if response.status_code != 200:
                raise RuntimeError(
                    f"{method} {path} answered {response.status_code}: {response.text}"
                )
            target = recording_path(folder, name)
            target.write_bytes(response.content)
            written.append(target)
    return written


def main(argv: list[str]) -> None:
    folder = Path(argv[0]) if argv else RECORDINGS_FOLDER
    for target in record(folder):
        print(f"wrote {target}")


if __name__ == "__main__":
    main(sys.argv[1:])
