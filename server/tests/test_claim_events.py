"""The MatchClaims' events; the expected values are derived in ``README.md``
("MatchClaim events") from the TimeToShare table fixture's rows, written out by
hand."""

from __future__ import annotations

import json
import struct
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import timetoalign.core
from fastapi.testclient import TestClient
from timetoshare import dumps, loads
from timetoshare.tables import fixture_path

from tilie_server.app import create_app
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}
EVENTS = "/api/match-claims/events"


@pytest.fixture
def server(tmp_path: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, tmp_path))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


def fixture_manifest() -> bytes:
    return fixture_path("manifest.yaml").read_bytes()


def fixture_projections() -> bytes:
    return fixture_path("projections.parquet").read_bytes()


def parquet(table: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    pq.write_table(table, sink)
    return sink.getvalue().to_pybytes()


def prefixed(data: bytes) -> bytes:
    return struct.pack("<I", len(data)) + data


def body(
    parameters: Any,
    projections: bytes | None = None,
    manifest: bytes | None = None,
) -> bytes:
    """A request: the parameters, the Projections table, the table route's body."""
    text = json.dumps(parameters).encode("utf-8")
    table = fixture_path("match_claims.parquet").read_bytes()
    posted = fixture_manifest() if manifest is None else manifest
    return (
        prefixed(text)
        + prefixed(b"" if projections is None else projections)
        + prefixed(posted)
        + table
    )


def post(server: TestClient, content: bytes) -> Any:
    headers = {**AUTH, "Content-Type": "application/octet-stream"}
    return server.post(EVENTS, headers=headers, content=content)


def of(timeline: str, event: str) -> dict[str, Any]:
    """A side's Projection standing for the event ``event`` of ``timeline``."""
    return {"projection_of": {"timeline_id": timeline, "event_id": event}}


NOTHING = {"projection_of": None}
"""A side's Projection standing for no event."""


def claim(
    claim_id: str,
    a: tuple[str, str | None, str | None, Any],
    b: tuple[str, str | None, str | None, Any],
    synchronous: bool = True,
) -> dict[str, Any]:
    """An answered MatchClaim: each side's timeline, event, name and Projection."""
    return {
        "id": claim_id,
        "timeline_a_id": a[0],
        "event_a_id": a[1],
        "event_a_name": a[2],
        "event_a_projection": a[3],
        "timeline_b_id": b[0],
        "event_b_id": b[1],
        "event_b_name": b[2],
        "event_b_projection": b[3],
        "certainty": 1.0,
        "is_synchronous": synchronous,
    }


ASKED = ["claim_1", "claim_4", "claim_7", "claim_11", "claim_12", "claim_15"]
"""The MatchClaims of the README's table."""

ANSWERED = [
    claim(
        "claim_1",
        ("clt_1", "note_1", "C4", None),
        ("dpt_1", "projection_1", None, of("clt_1", "note_1")),
    ),
    claim(
        "claim_4",
        ("dpt_1", "projection_4", None, of("clt_1", "note_4")),
        ("clt_1", "note_4", "G4", None),
    ),
    claim("claim_7", ("clt_1", "note_6", "A4", None), ("cpt_1", "onset_2", None, None)),
    claim(
        "claim_11",
        ("dpt_1", "projection_6", None, NOTHING),
        ("cpt_1", "projection_7", None, NOTHING),
    ),
    claim(
        "claim_12",
        ("clt_1", "note_10", "E5", None),
        ("dpt_1", None, None, None),
        synchronous=False,
    ),
    claim(
        "claim_15",
        ("clt_2", "note_13", "A5", None),
        ("dpt_1", "projection_9", None, of("clt_2", "note_13")),
    ),
]
"""The answer to :data:`ASKED`, written from the README's table."""


def test_the_events_of_the_claims_asked_for_in_their_order(server: TestClient) -> None:
    response = post(server, body({"claims": ASKED}, fixture_projections()))
    assert response.status_code == 200
    assert response.json() == {"claims": ANSWERED}


def test_without_a_projections_table_no_event_is_a_projection(
    server: TestClient,
) -> None:
    response = post(server, body({"claims": ["claim_1"]}))
    assert response.status_code == 200
    assert response.json() == {"claims": [{**ANSWERED[0], "event_b_projection": None}]}


def test_no_claims_asked_for_answer_none(server: TestClient) -> None:
    response = post(server, body({"claims": []}, fixture_projections()))
    assert response.status_code == 200
    assert response.json() == {"claims": []}


@pytest.mark.parametrize(
    ("parameters", "path", "message"),
    [
        (
            {"claims": ["claim_1", "claim_99"]},
            ["claims", 1],
            "the MatchClaim table has no MatchClaim 'claim_99'",
        ),
        (
            {"claims": "claim_1"},
            ["claims"],
            "the parameter 'claims' is no list of MatchClaim IDs",
        ),
        (
            {"claims": [], "note": "x"},
            ["note"],
            "'note' is no parameter of this route",
        ),
    ],
)
def test_parameters_are_refused_at_their_name(
    server: TestClient, parameters: Any, path: list[Any], message: str
) -> None:
    response = post(server, body(parameters, fixture_projections()))
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


PARAMETERS = prefixed(b'{"claims": []}')


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (
            PARAMETERS + b"\x00\x00",
            "the body does not state the Projections table's length",
        ),
        (
            PARAMETERS + struct.pack("<I", 100) + b"0123456789",
            "the body states a Projections table of 100 bytes and holds 10",
        ),
    ],
)
def test_a_projections_table_that_cannot_be_split_is_refused(
    server: TestClient, content: bytes, message: str
) -> None:
    response = post(server, content)
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": [], "message": message}}


def test_projections_that_are_no_parquet_file_are_refused(server: TestClient) -> None:
    response = post(server, body({"claims": []}, b"not parquet"))
    assert response.status_code == 422
    assert response.json() == {
        "detail": {"path": [], "message": "the Projections table is no Parquet file"}
    }


def test_a_projections_table_the_checks_refuse_is_refused(server: TestClient) -> None:
    table = pq.read_table(fixture_path("projections.parquet"))
    index = table.schema.get_field_index("projection_of")
    field = table.schema.field(index)
    cells = table.column(index).to_pylist()
    row = table.column("id").to_pylist().index("projection_1")
    cells[row] = {"timeline_id": "dpt_1", "event_id": "note_1"}
    broken = table.set_column(index, field, pa.array(cells, field.type))
    response = post(server, body({"claims": ["claim_1"]}, parquet(broken)))
    message = "a Projection stands for an event of another timeline than 'dpt_1'"
    problem = {
        "code": "invalid_projection_of",
        "row": 3,
        "column": ["projection_of", "timeline_id"],
        "message": message,
    }
    assert response.status_code == 422
    assert response.json() == {
        "detail": {"path": [], "message": message, "problems": [problem]}
    }


def test_a_match_claim_table_the_checks_refuse_is_refused(server: TestClient) -> None:
    manifest = loads(fixture_manifest().decode())
    del manifest["timelines"][0]["children"]
    response = post(
        server, body({"claims": ["claim_1"]}, manifest=dumps(manifest).encode())
    )
    problem = {
        "code": "unknown_timeline",
        "row": 14,
        "column": ["timeline_a_id"],
        "message": "the manifest has no timeline 'clt_2'",
    }
    assert response.status_code == 422
    assert response.json() == {
        "detail": {"path": [], "message": problem["message"], "problems": [problem]}
    }


def test_the_route_needs_the_token(server: TestClient) -> None:
    response = server.post(EVENTS, content=body({"claims": []}))
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


def test_without_timetoalign_projections_the_route_says_so(
    monkeypatch: pytest.MonkeyPatch, server: TestClient
) -> None:
    monkeypatch.delattr(timetoalign.core, "EventReference")
    response = post(server, b"")
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": (
                f"the installed timetoalign {version('timetoalign')} cannot read "
                "Projections"
            ),
        }
    }
