"""The MatchClaims' events; the expected values are derived in ``README.md``
("MatchClaim events") from the TimeToShare table fixture's rows, written out by
hand."""

from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Any

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


def table_body(manifest: bytes | None = None) -> bytes:
    """The table route's body: the manifest behind its length, the table."""
    table = fixture_path("match_claims.parquet").read_bytes()
    posted = fixture_manifest() if manifest is None else manifest
    return prefixed(posted) + table


def body(parameters: Any, manifest: bytes | None = None) -> bytes:
    """A request: the parameters behind their length, the table route's body."""
    return prefixed(json.dumps(parameters).encode("utf-8")) + table_body(manifest)


def post(server: TestClient, content: bytes) -> Any:
    headers = {**AUTH, "Content-Type": "application/octet-stream"}
    return server.post(EVENTS, headers=headers, content=content)


def claim(
    claim_id: str,
    a: tuple[str, str, str | None],
    b: tuple[str, str, str | None],
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

CHUNK = "CHUNK_SENTINEL"
NOMATCH = "NOMATCH_SENTINEL"
"""The table's reserved strings, written as the strings they are."""

CLAIM_11 = claim("claim_11", ("dpt_1", CHUNK, None), ("cpt_1", CHUNK, None))
CLAIM_12 = claim(
    "claim_12", ("clt_1", "note_10", "E5"), ("dpt_1", NOMATCH, None), synchronous=False
)
CLAIM_16 = claim("claim_16", ("cpt_1", CHUNK, None), ("clt_1", "note_2", "D4"))
CLAIM_18 = claim(
    "claim_18",
    ("dpt_1", "inserted_1", None),
    ("clt_1", NOMATCH, None),
    synchronous=False,
)

ANSWERED = [
    claim("claim_1", ("clt_1", "note_1", "C4"), ("dpt_1", "projection_1", None)),
    claim("claim_4", ("dpt_1", "projection_4", None), ("clt_1", "note_4", "G4")),
    claim("claim_7", ("clt_1", "note_6", "A4"), ("cpt_1", "onset_2", None)),
    CLAIM_11,
    CLAIM_12,
    claim("claim_15", ("clt_2", "note_13", "A5"), ("dpt_1", "projection_9", None)),
]
"""The answer to :data:`ASKED`, written from the README's table."""


def test_the_events_of_the_claims_asked_for_in_their_order(server: TestClient) -> None:
    response = post(server, body({"claims": ASKED}))
    assert response.status_code == 200
    answer = response.json()
    assert answer == {"claims": ANSWERED}
    assert [list(item) for item in answer["claims"]] == [list(ANSWERED[0])] * 6


def test_a_sentinel_side_is_answered_as_its_reserved_string(server: TestClient) -> None:
    asked = ["claim_16", "claim_11", "claim_12", "claim_18"]
    response = post(server, body({"claims": asked}))
    assert response.status_code == 200
    assert response.json() == {"claims": [CLAIM_16, CLAIM_11, CLAIM_12, CLAIM_18]}


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
