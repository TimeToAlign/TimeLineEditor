"""The MatchClaims' provenance and beliefs; the expected values are derived in
``README.md`` ("MatchClaim provenance and beliefs") from the TimeToShare table
fixture's rows, written out by hand."""

from __future__ import annotations

import json
import struct
import sys
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
import timetoshare.tables as tables
from fastapi.testclient import TestClient
from timetoshare import FORMAT_CONTEXT, dumps, loads
from timetoshare.tables import fixture_path

from tilie_server.app import create_app
from tilie_server.manifests import Refusal
from tilie_server.routers.claim_provenance import succeeding
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}
PROVENANCE = "/api/match-claims/provenance"
BELIEF = "/api/match-claims/belief"

A = "https://orcid.org/0000-0002-1825-0097"
B = "https://orcid.org/0000-0001-5109-3700"
SERVICE = "https://example.org/aligner"
DAY = "2026-11-22"


@pytest.fixture
def server(tmp_path: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, tmp_path))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


def fixture_manifest() -> bytes:
    return fixture_path("manifest.yaml").read_bytes()


def fixture_table() -> pa.Table:
    return pq.read_table(fixture_path("match_claims.parquet"))


def parquet(table: pa.Table) -> bytes:
    sink = pa.BufferOutputStream()
    pq.write_table(table, sink)
    return sink.getvalue().to_pybytes()


def table_body(table: bytes, manifest: bytes | None = None) -> bytes:
    """The body of ``POST /api/match-claims``."""
    text = fixture_manifest() if manifest is None else manifest
    return struct.pack("<I", len(text)) + text + table


def body(parameters: Any, table: pa.Table | None = None, **rest: Any) -> bytes:
    """A request: the parameters behind their length, then the table route's body."""
    text = json.dumps(parameters).encode("utf-8")
    posted = parquet(fixture_table() if table is None else table)
    return struct.pack("<I", len(text)) + text + table_body(posted, **rest)


def post(server: TestClient, route: str, content: bytes) -> Any:
    headers = {**AUTH, "Content-Type": "application/octet-stream"}
    return server.post(route, headers=headers, content=content)


def belief(claim: str, actor: str, word: str, date: str = DAY) -> dict[str, Any]:
    return {"claim": claim, "actor": actor, "belief": word, "date": date}


def cell(
    *,
    stated_by: list[str] | None = None,
    date: str | None = "2026-11-20",
    method: str | None = "imported",
    service: str | None = SERVICE,
    note: str | None = None,
    beliefs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """A provenance cell of the table, every member present."""
    return {
        "stated_by": stated_by,
        "date": date,
        "method": method,
        "service": service,
        "basis": None,
        "match": None,
        "note": note,
        "beliefs": beliefs,
    }


def held(actor: str, word: str, date: str, note: str | None = None) -> dict[str, Any]:
    """A belief as a cell holds it."""
    return {"actor": actor, "belief": word, "date": date, "note": note}


def manual(actor: str, day: str, note: str | None = None) -> dict[str, Any]:
    return cell(
        stated_by=[actor],
        method="manual",
        service=None,
        note=note,
        beliefs=[held(actor, "true", day)],
    )


FIXTURE_PROVENANCE: list[dict[str, Any] | None] = [
    manual(A, "2026-11-20"),
    cell(),
    cell(),
    cell(),
    cell(),
    cell(beliefs=[held(A, "unlikely", "2026-11-21", "the onset is blurred")]),
    cell(),
    cell(),
    cell(),
    cell(),
    manual(A, "2026-11-20"),
    cell(),
    cell(
        beliefs=[
            held(A, "false", "2026-11-21", "a grace note, played late"),
            held(B, "true", "2026-11-21"),
        ]
    ),
    cell(
        stated_by=[B],
        method="manual",
        service=None,
        note="the same gesture, not the same moment",
        beliefs=[held(B, "true", "2026-11-21")],
    ),
    None,
]
"""The fixture's provenance column, row by row (``README.md``)."""

SHARED = {
    "method": "imported",
    "date": "2026-11-20",
    "beliefs": [
        {"actor": A, "belief": "false", "date": "2026-11-21"},
        {"actor": B, "belief": "true", "date": "2026-11-21"},
    ],
}
"""The provenance a file states for every row."""


def shared_table() -> pa.Table:
    """The fixture's table, no row stating provenance, the file :data:`SHARED`."""
    table = fixture_table()
    index = table.schema.get_field_index("provenance")
    field = table.schema.field(index)
    table = table.set_column(index, field, pa.nulls(table.num_rows, field.type))
    return table.replace_schema_metadata({"timetoshare:provenance": json.dumps(SHARED)})


# --- Provenance ----------------------------------------------------------------


def test_the_provenance_of_the_claims_asked_for_in_their_order(
    server: TestClient,
) -> None:
    response = post(
        server, PROVENANCE, body({"claims": ["claim_6", "claim_15", "claim_1"]})
    )
    assert response.status_code == 200
    assert response.json() == {
        "claims": [
            {
                "id": "claim_6",
                "provenance": {
                    "date": "2026-11-20",
                    "method": "imported",
                    "service": SERVICE,
                    "beliefs": [
                        {
                            "actor": A,
                            "belief": "unlikely",
                            "date": "2026-11-21",
                            "note": "the onset is blurred",
                        }
                    ],
                },
            },
            {"id": "claim_15", "provenance": None},
            {
                "id": "claim_1",
                "provenance": {
                    "stated_by": [A],
                    "date": "2026-11-20",
                    "method": "manual",
                    "beliefs": [{"actor": A, "belief": "true", "date": "2026-11-20"}],
                },
            },
        ]
    }


def test_no_claims_asked_for_answer_none(server: TestClient) -> None:
    response = post(server, PROVENANCE, body({"claims": []}))
    assert response.status_code == 200
    assert response.json() == {"claims": []}


def test_the_files_provenance_is_every_rows(server: TestClient) -> None:
    response = post(server, PROVENANCE, body({"claims": ["claim_4"]}, shared_table()))
    assert response.status_code == 200
    assert response.json() == {"claims": [{"id": "claim_4", "provenance": SHARED}]}


@pytest.mark.parametrize(
    ("claims", "path", "message"),
    [
        (
            ["claim_1", "claim_99"],
            ["claims", 1],
            "the MatchClaim table has no MatchClaim 'claim_99'",
        ),
        ("claim_1", ["claims"], "the parameter 'claims' is no list of MatchClaim IDs"),
    ],
    ids=["unknown", "no list"],
)
def test_claims_the_table_lacks_are_refused(
    server: TestClient, claims: Any, path: list[Any], message: str
) -> None:
    response = post(server, PROVENANCE, body({"claims": claims}))
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


@pytest.mark.parametrize("route", [PROVENANCE, BELIEF])
def test_a_table_the_checks_refuse_is_refused(server: TestClient, route: str) -> None:
    manifest = loads(fixture_manifest().decode())
    del manifest["timelines"][0]["children"]
    parameters = (
        {"claims": ["claim_1"]} if route == PROVENANCE else belief("claim_1", A, "true")
    )
    response = post(server, route, body(parameters, manifest=dumps(manifest).encode()))
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


COMPACT_A = "orcid:0000-0002-1825-0097"
"""A written compactly under the prefix ``orcid``."""


def orcid_manifest() -> bytes:
    """The fixture's manifest with an ``@context`` declaring ``orcid``.

    No statement uses the prefix: it is declared for the actors of the
    MatchClaim table alone.
    """
    manifest = loads(fixture_manifest().decode())
    manifest["@context"] = {**FORMAT_CONTEXT, "orcid": "https://orcid.org/"}
    return dumps(manifest).encode()


def with_belief_actor(table: pa.Table, row: int, at: int, actor: str) -> pa.Table:
    """The table with the actor of row ``row``'s belief ``at`` replaced."""
    index = table.schema.get_field_index("provenance")
    field = table.schema.field(index)
    cells = table.column(index).to_pylist()
    cells[row]["beliefs"][at]["actor"] = actor
    return table.set_column(index, field, pa.array(cells, field.type))


CLAIM_13 = {
    "date": "2026-11-20",
    "method": "imported",
    "service": SERVICE,
}
"""``claim_13``'s paradata as the provenance route answers it."""


@pytest.mark.parametrize(
    ("manifest", "actor"),
    [(orcid_manifest, A), (fixture_manifest, COMPACT_A)],
    ids=["declared", "undeclared"],
)
def test_a_beliefs_actor_is_answered_as_it_compares(
    server: TestClient, manifest: Any, actor: str
) -> None:
    table = with_belief_actor(fixture_table(), 12, 0, COMPACT_A)
    content = body({"claims": ["claim_13"]}, table, manifest=manifest())
    response = post(server, PROVENANCE, content)
    assert response.status_code == 200
    assert response.json() == {
        "claims": [
            {
                "id": "claim_13",
                "provenance": {
                    **CLAIM_13,
                    "beliefs": [
                        {
                            "actor": actor,
                            "belief": "false",
                            "date": "2026-11-21",
                            "note": "a grace note, played late",
                        },
                        {"actor": B, "belief": "true", "date": "2026-11-21"},
                    ],
                },
            }
        ]
    }


# --- A belief -------------------------------------------------------------------


def believed(server: TestClient, content: bytes) -> pa.Table:
    response = post(server, BELIEF, content)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/vnd.apache.parquet"
    return pq.read_table(pa.BufferReader(response.content))


def without_provenance(table: pa.Table) -> list[dict[str, Any]]:
    return table.drop_columns(["provenance"]).to_pylist()


@pytest.mark.parametrize(
    ("stated", "row", "expected"),
    [
        (
            belief("claim_6", A, "false"),
            5,
            cell(beliefs=[held(A, "false", DAY)]),
        ),
        (
            belief("claim_13", B, "unlikely"),
            12,
            cell(
                beliefs=[
                    held(A, "false", "2026-11-21", "a grace note, played late"),
                    held(B, "unlikely", DAY),
                ]
            ),
        ),
        (
            belief("claim_2", A, "unlikely"),
            1,
            cell(beliefs=[held(A, "unlikely", DAY)]),
        ),
        (
            belief("claim_15", B, "true"),
            14,
            cell(date=None, method=None, service=None, beliefs=[held(B, "true", DAY)]),
        ),
    ],
    ids=["replaced", "beside another", "a first", "no provenance"],
)
def test_a_belief_is_recorded_in_its_row_alone(
    server: TestClient, stated: dict[str, Any], row: int, expected: dict[str, Any]
) -> None:
    table = believed(server, body(stated))
    assert table.column_names == fixture_table().column_names
    assert without_provenance(table) == without_provenance(fixture_table())
    provenance = list(FIXTURE_PROVENANCE)
    provenance[row] = expected
    assert table.column("provenance").to_pylist() == provenance
    assert table.schema.metadata is None or b"timetoshare:provenance" not in (
        table.schema.metadata
    )


@pytest.mark.parametrize(
    ("posted", "manifest", "stated", "expected"),
    [
        (
            fixture_table,
            orcid_manifest,
            belief("claim_6", COMPACT_A, "false"),
            [held(COMPACT_A, "false", DAY)],
        ),
        (
            lambda: with_belief_actor(fixture_table(), 5, 0, COMPACT_A),
            orcid_manifest,
            belief("claim_6", A, "false"),
            [held(A, "false", DAY)],
        ),
        (
            fixture_table,
            fixture_manifest,
            belief("claim_6", COMPACT_A, "false"),
            [
                held(A, "unlikely", "2026-11-21", "the onset is blurred"),
                held(COMPACT_A, "false", DAY),
            ],
        ),
    ],
    ids=["compact replaces full", "full replaces compact", "undeclared stands beside"],
)
def test_one_actor_in_two_spellings_is_one_actor(
    server: TestClient,
    posted: Any,
    manifest: Any,
    stated: dict[str, Any],
    expected: list[dict[str, Any]],
) -> None:
    before = posted()
    table = believed(server, body(stated, before, manifest=manifest()))
    assert table.column_names == before.column_names
    assert without_provenance(table) == without_provenance(fixture_table())
    provenance = list(FIXTURE_PROVENANCE)
    provenance[5] = cell(beliefs=expected)
    assert table.column("provenance").to_pylist() == provenance
    assert table.schema.metadata is None or b"timetoshare:provenance" not in (
        table.schema.metadata
    )


def test_the_files_provenance_becomes_every_rows(server: TestClient) -> None:
    table = believed(server, body(belief("claim_3", B, "false"), shared_table()))
    assert b"timetoshare:provenance" not in (table.schema.metadata or {})
    assert without_provenance(table) == without_provenance(fixture_table())
    beliefs = [held(A, "false", "2026-11-21"), held(B, "true", "2026-11-21")]
    common = cell(service=None, beliefs=beliefs)
    provenance = [common] * 15
    provenance[2] = cell(
        service=None,
        beliefs=[held(A, "false", "2026-11-21"), held(B, "false", DAY)],
    )
    assert table.column("provenance").to_pylist() == provenance


def test_a_column_the_type_does_not_declare_is_kept(server: TestClient) -> None:
    extra = fixture_table()
    notes = [f"n{row}" for row in range(extra.num_rows)]
    extra = extra.append_column("note", pa.array(notes))
    table = believed(server, body(belief("claim_6", A, "false"), extra))
    assert table.column("note").to_pylist() == notes


def test_the_answer_is_a_table_the_table_route_reads(server: TestClient) -> None:
    response = post(server, BELIEF, body(belief("claim_6", A, "false")))
    assert response.status_code == 200
    answer = post(server, "/api/match-claims", table_body(response.content))
    assert answer.status_code == 200
    (length,) = struct.unpack_from("<I", answer.content)
    header = json.loads(answer.content[4 : 4 + length])
    base = -(-(4 + length) // 8) * 8
    start, count = header["arrays"]["belief_words"]
    words = answer.content[base + start : base + start + count]
    assert list(words) == [0, 1, 0, 1, 0, 0]


@pytest.mark.parametrize(
    ("parameters", "path", "message"),
    [
        (
            belief("claim_99", A, "true"),
            ["claim"],
            "the MatchClaim table has no MatchClaim 'claim_99'",
        ),
        (
            belief("claim_1", "", "true"),
            ["actor"],
            "an actor is named by a non-empty string",
        ),
        (
            {**belief("claim_1", A, "true"), "actor": 3},
            ["actor"],
            "an actor is named by a non-empty string",
        ),
        (
            belief("claim_1", A, "maybe"),
            ["belief"],
            "a belief is one of the strings 'true', 'false', 'unlikely'",
        ),
        (
            {**belief("claim_1", A, "true"), "belief": True},
            ["belief"],
            "a belief is one of the strings 'true', 'false', 'unlikely'",
        ),
        (
            belief("claim_1", A, "true", "2026-02-30"),
            ["date"],
            "'2026-02-30' is no Gregorian calendar date written YYYY-MM-DD",
        ),
        (
            belief("claim_1", A, "true", "20261122"),
            ["date"],
            "'20261122' is no Gregorian calendar date written YYYY-MM-DD",
        ),
        (
            {**belief("claim_1", A, "true"), "date": 20261122},
            ["date"],
            "a date is a string written YYYY-MM-DD",
        ),
        (
            {**belief("claim_1", A, "true"), "note": "n"},
            ["note"],
            "'note' is no parameter of this route",
        ),
        (
            {"claim": "claim_1", "actor": A, "belief": "true"},
            ["date"],
            "the parameter 'date' is missing",
        ),
    ],
    ids=[
        "unknown claim",
        "empty actor",
        "numeric actor",
        "unknown belief",
        "boolean belief",
        "no day",
        "no date form",
        "numeric date",
        "unknown parameter",
        "missing parameter",
    ],
)
def test_a_belief_the_route_cannot_record_is_refused(
    server: TestClient, parameters: dict[str, Any], path: list[Any], message: str
) -> None:
    response = post(server, BELIEF, body(parameters))
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


def test_an_actor_that_is_no_iri_reference_makes_a_table_the_checks_refuse(
    server: TestClient,
) -> None:
    response = post(server, BELIEF, body(belief("claim_6", "not an iri", "true")))
    assert response.status_code == 422
    message = (
        "the provenance #/beliefs/1/actor: 'not an iri' should not be valid under "
        "{'anyOf': [{'pattern': '[\\\\u0000-\\\\u0020\\\\u007f-\\\\u00a0\\\\u1680"
        "\\\\u2000-\\\\u200a\\\\u2028\\\\u2029\\\\u202f\\\\u205f\\\\u3000\\\\ufeff]'}, "
        "{'pattern': '^_:'}, {'pattern': '^@'}]}"
    )
    assert response.json() == {
        "detail": {
            "path": [],
            "message": message,
            "problems": [
                {
                    "code": "invalid_provenance",
                    "row": 5,
                    "column": ["provenance"],
                    "message": message,
                }
            ],
        }
    }


# --- Both routes ----------------------------------------------------------------

ROUTES = [PROVENANCE, BELIEF]


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"\x01\x00", "the body does not start with the parameters' length"),
        (
            struct.pack("<I", 100) + bytes(10),
            "the body states parameters of 100 bytes and holds 10",
        ),
        (struct.pack("<I", 3) + b"[1]", "the parameters are no JSON object"),
        (struct.pack("<I", 1) + b"{", "the parameters are no JSON text"),
        (struct.pack("<I", 1) + b"\xff", "the parameters are no JSON text"),
    ],
    ids=["short", "long parameters", "a list", "no JSON", "no UTF-8"],
)
def test_parameters_that_cannot_be_read_are_refused(
    server: TestClient, route: str, content: bytes, message: str
) -> None:
    response = post(server, route, content)
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": [], "message": message}}


@pytest.mark.parametrize("route", ROUTES)
def test_the_routes_need_the_token(server: TestClient, route: str) -> None:
    response = server.post(route, content=body({"claims": []}))
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


@pytest.mark.parametrize("route", ROUTES)
def test_without_timetoalign_provenance_the_routes_say_so(
    monkeypatch: pytest.MonkeyPatch, server: TestClient, route: str
) -> None:
    # A None entry makes every import of the module raise ImportError.
    monkeypatch.setitem(sys.modules, "timetoalign.core.provenance", None)
    response = post(server, route, b"")
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": (
                f"the installed timetoalign {version('timetoalign')} cannot record "
                "provenance"
            ),
        }
    }


# --- The succession rule --------------------------------------------------------


def refusal_of(old: pa.Table, new: pa.Table) -> dict[str, Any] | None:
    try:
        succeeding(tables, old, new)
    except Refusal as refusal:
        return {
            "status": refusal.status_code,
            "path": refusal.path,
            "message": refusal.message,
            "problems": refusal.problems,
        }
    return None


def test_a_table_without_a_claim_does_not_succeed() -> None:
    old = fixture_table()
    message = "the MatchClaim 'claim_15' is missing"
    assert refusal_of(old, old.slice(0, 14)) == {
        "status": 422,
        "path": [],
        "message": message,
        "problems": [
            {
                "code": "succession_missing",
                "row": None,
                "column": ["id"],
                "message": message,
            }
        ],
    }


def test_a_table_changing_a_claim_does_not_succeed() -> None:
    old = fixture_table()
    index = old.schema.get_field_index("certainty")
    certainty = [0.5] + [1.0] * 14
    new = old.set_column(
        index, old.schema.field(index), pa.array(certainty, pa.float64())
    )
    message = "the MatchClaim 'claim_1' changed its 'certainty'"
    assert refusal_of(old, new) == {
        "status": 422,
        "path": [],
        "message": message,
        "problems": [
            {
                "code": "succession_changed",
                "row": 0,
                "column": ["certainty"],
                "message": message,
            }
        ],
    }


def test_a_believed_table_succeeds(server: TestClient) -> None:
    new = believed(server, body(belief("claim_6", A, "false")))
    assert refusal_of(fixture_table(), new) is None
