"""The MatchClaims' events; the expected values are derived in ``README.md``
("MatchClaim events") from the TimeToShare table fixture's rows, written out by
hand."""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from refusals import assert_refused_in_timetoshares_words
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


def prefixed(data: bytes) -> bytes:
    return struct.pack("<I", len(data)) + data


def table_body(manifest: bytes | None = None, table: bytes | None = None) -> bytes:
    """The table route's body: the manifest behind its length, the table."""
    if table is None:
        table = fixture_path("match_claims.parquet").read_bytes()
    posted = fixture_manifest() if manifest is None else manifest
    return prefixed(posted) + table


def body(
    parameters: Any, manifest: bytes | None = None, table: bytes | None = None
) -> bytes:
    """A request: the parameters behind their length, the table route's body."""
    text = json.dumps(parameters).encode("utf-8")
    return prefixed(text) + table_body(manifest, table)


def with_event(claim_id: str, column: str, event: str) -> bytes:
    """The fixture's table, MatchClaim ``claim_id``'s ``column`` set to ``event``."""
    table = pq.read_table(fixture_path("match_claims.parquet"))
    ids = table.column("id").to_pylist()
    cells = table.column(column).to_pylist()
    cells[ids.index(claim_id)] = event
    index = table.schema.get_field_index(column)
    field = table.schema.field(index)
    sink = pa.BufferOutputStream()
    pq.write_table(table.set_column(index, field, pa.array(cells, field.type)), sink)
    return sink.getvalue().to_pybytes()


def post(server: TestClient, content: bytes) -> Any:
    headers = {**AUTH, "Content-Type": "application/octet-stream"}
    return server.post(EVENTS, headers=headers, content=content)


def claim(
    claim_id: str,
    a: tuple[str, str | None, str | None],
    b: tuple[str, str | None, str | None],
    synchronous: bool = True,
) -> dict[str, Any]:
    """An answered MatchClaim: each side's timeline, event and name."""
    return {
        "id": claim_id,
        "timeline_a_id": a[0],
        "event_a_id": a[1],
        "event_a_name": a[2],
        "timeline_b_id": b[0],
        "event_b_id": b[1],
        "event_b_name": b[2],
        "certainty": 1.0,
        "is_synchronous": synchronous,
    }


ASKED = ["claim_1", "claim_4", "claim_7", "claim_11", "claim_12", "claim_15"]
"""The MatchClaims of the README's table."""

ANSWERED = [
    claim("claim_1", ("clt_1", "note_1", "C4"), ("dpt_1", "projection_1", None)),
    claim("claim_4", ("dpt_1", "projection_4", None), ("clt_1", "note_4", "G4")),
    claim("claim_7", ("clt_1", "note_6", "A4"), ("cpt_1", "onset_2", None)),
    claim("claim_11", ("dpt_1", "projection_6", None), ("cpt_1", "projection_7", None)),
    claim(
        "claim_12",
        ("clt_1", "note_10", "E5"),
        ("dpt_1", "NOMATCH_SENTINEL", None),
        synchronous=False,
    ),
    claim("claim_15", ("clt_2", "note_13", "A5"), ("dpt_1", "projection_9", None)),
]
"""The answer to :data:`ASKED`, written from the README's table."""


def test_the_events_of_the_claims_asked_for_in_their_order(server: TestClient) -> None:
    response = post(server, body({"claims": ASKED}))
    assert response.status_code == 200
    answer = response.json()
    assert answer == {"claims": ANSWERED}
    assert [list(item) for item in answer["claims"]] == [list(ANSWERED[0])] * 6


def test_a_chunk_side_is_answered_as_its_reserved_string(server: TestClient) -> None:
    table = with_event("claim_11", "event_b_id", "CHUNK_SENTINEL")
    response = post(server, body({"claims": ["claim_11"]}, table=table))
    assert response.status_code == 200
    chunk = ("cpt_1", "CHUNK_SENTINEL", None)
    answered = claim("claim_11", ("dpt_1", "projection_6", None), chunk)
    assert response.json() == {"claims": [answered]}


def test_no_claims_asked_for_answer_none(server: TestClient) -> None:
    response = post(server, body({"claims": []}))
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
    response = post(server, body(parameters))
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


EMPTY_MANIFEST = "the manifest is not an object"
"""The table route's refusal of a manifest of length 0."""


def test_a_second_table_before_the_manifest_is_refused(server: TestClient) -> None:
    content = prefixed(b'{"claims": []}') + prefixed(b"") + table_body()
    response = post(server, content)
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": [], "message": EMPTY_MANIFEST}}


def test_a_match_claim_table_the_checks_refuse_is_refused(server: TestClient) -> None:
    manifest = loads(fixture_manifest().decode())
    del manifest["timelines"][0]["children"]
    response = post(
        server, body({"claims": ["claim_1"]}, manifest=dumps(manifest).encode())
    )
    assert_refused_in_timetoshares_words(
        response,
        [],
        ["'clt_2'"],
        [{"code": "unknown_timeline", "row": 14, "column": ["timeline_a_id"]}],
    )


def test_the_route_needs_the_token(server: TestClient) -> None:
    response = server.post(EVENTS, content=body({"claims": []}))
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}
