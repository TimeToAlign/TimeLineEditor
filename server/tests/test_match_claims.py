from __future__ import annotations

import importlib
import json
import math
import struct
import subprocess
import sys
from fractions import Fraction
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from timetoshare import FORMAT_CONTEXT, dumps, loads
from timetoshare.tables import MATCH_CLAIM_SCHEMA, fixture_path

import tilie_server.app
import tilie_server.routers.match_claims
from tilie_server.app import create_app
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}
ROUTE = "/api/match-claims"
SCRIPT = Path(__file__).parent.parent / "scripts" / "record_match_claims.py"

A = "https://orcid.org/0000-0002-1825-0097"
B = "https://orcid.org/0000-0001-5109-3700"

ARRAYS = [
    ("claim_ids", "B"),
    ("a.timeline", "I"),
    ("b.timeline", "I"),
    *(
        (f"{side}.{anchor}.{part}", kind)
        for anchor in ("start", "end")
        for side in ("a", "b")
        for part, kind in (("position", "d"), ("numerator", "q"), ("denominator", "q"))
    ),
    ("start_present", "B"),
    ("end_present", "B"),
    ("belief_offsets", "I"),
    ("belief_actors", "I"),
    ("belief_words", "B"),
]
"""Decision 0030's arrays in their order, each with its struct format."""


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


def body(manifest: bytes, table: bytes) -> bytes:
    return struct.pack("<I", len(manifest)) + manifest + table


def post(server: TestClient, content: bytes) -> Any:
    headers = {**AUTH, "Content-Type": "application/octet-stream"}
    return server.post(ROUTE, headers=headers, content=content)


def decoded(answer: bytes) -> tuple[dict[str, Any], dict[str, Any]]:
    """The header and the arrays of an answer, read by decision 0030's layout.

    Asserts the layout on the way: the arrays in their order, each at the
    previous one's offset plus its byte length rounded up to eight, the
    first at the first multiple of eight after the header, zero bytes in
    every gap, nothing after the last array's padding.
    """
    (length,) = struct.unpack_from("<I", answer)
    header = json.loads(answer[4 : 4 + length].decode("utf-8"))
    base = -(-(4 + length) // 8) * 8
    assert answer[4 + length : base] == bytes(base - 4 - length)
    placed = header.pop("arrays")
    assert list(placed) == [name for name, _ in ARRAYS]
    arrays: dict[str, Any] = {}
    offset = 0
    for name, kind in ARRAYS:
        start, count = placed[name]
        assert start == offset
        size = count * struct.calcsize(kind)
        data = answer[base + start : base + start + size]
        assert len(data) == size
        arrays[name] = (
            data.decode("utf-8")
            if name == "claim_ids"
            else list(struct.unpack(f"<{count}{kind}", data))
        )
        offset = start + -(-size // 8) * 8
        assert answer[base + start + size : base + offset] == bytes(
            offset - start - size
        )
    assert len(answer) == base + offset
    return header, arrays


def values(arrays: dict[str, Any], column: str) -> list[tuple[float, int, int]]:
    """A value column's rows as (position, numerator, denominator)."""
    return list(
        zip(
            arrays[f"{column}.position"],
            arrays[f"{column}.numerator"],
            arrays[f"{column}.denominator"],
            strict=True,
        )
    )


def exact(n: int, d: int = 1) -> tuple[float, int, int]:
    return (n / d, n, d)


def real(value: float) -> tuple[float, int, int]:
    return (value, 0, 0)


NONE = (0.0, 0, 0)

FIXTURE_HEADER = {
    "format": "tilie-match-claims",
    "version": 1,
    "rows": 15,
    "timelines": [
        {"id": "clt_1", "number_type": "fraction"},
        {"id": "clt_2", "number_type": "fraction"},
        {"id": "cpt_1", "number_type": "float"},
        {"id": "dpt_1", "number_type": "int"},
    ],
    "actors": [B, A],
    "beliefs": ["true", "false", "unlikely"],
}

FIXTURE_ARRAYS: dict[str, Any] = {
    "claim_ids": "\n".join(f"claim_{row}" for row in range(1, 16)),
    "a.timeline": [0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 1],
    "b.timeline": [3, 3, 3, 0, 3, 2, 2, 2, 2, 2, 2, 3, 3, 2, 3],
    "start_present": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
    "end_present": [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    "belief_offsets": [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 5, 6, 6],
    "belief_actors": [1, 1, 1, 1, 0, 0],
    "belief_words": [0, 2, 0, 1, 0, 0],
}

FIXTURE_VALUES = {
    "a.start": [
        exact(0),
        exact(1),
        exact(3),
        exact(132300),
        exact(4),
        exact(176400),
        exact(5),
        exact(5),
        exact(6),
        exact(15, 2),
        exact(441000),
        NONE,
        exact(10),
        NONE,
        exact(1),
    ],
    "b.start": [
        exact(0),
        exact(44100),
        exact(132300),
        exact(3),
        exact(176400),
        real(4.0),
        real(5.0),
        real(5.25),
        real(6.0),
        real(7.5),
        real(10.0),
        NONE,
        exact(441000),
        NONE,
        exact(396900),
    ],
    "a.end": [NONE, exact(2), *[NONE] * 6, exact(8), *[NONE] * 6],
    "b.end": [NONE, exact(88200), *[NONE] * 6, real(8.0), *[NONE] * 6],
}


def fixture_answer(server: TestClient) -> bytes:
    response = post(server, body(fixture_manifest(), parquet(fixture_table())))
    assert response.status_code == 200
    return response.content


def test_the_fixture_answers_its_rows_written_out_by_hand(server: TestClient) -> None:
    response = post(
        server,
        body(fixture_manifest(), fixture_path("match_claims.parquet").read_bytes()),
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    header, arrays = decoded(response.content)
    assert header == FIXTURE_HEADER
    for name, expected in FIXTURE_ARRAYS.items():
        assert arrays[name] == expected, name
    for column, expected in FIXTURE_VALUES.items():
        assert values(arrays, column) == expected, column


def test_any_serialization_of_the_manifest_answers_alike(server: TestClient) -> None:
    pretty = dumps(loads(fixture_manifest().decode()), serialization="json")
    response = post(server, body(pretty.encode(), parquet(fixture_table())))
    assert response.status_code == 200
    assert response.content == fixture_answer(server)


def test_a_column_the_type_does_not_declare_changes_nothing(server: TestClient) -> None:
    table = fixture_table()
    table = table.append_column("note", pa.array(["n"] * table.num_rows))
    response = post(server, body(fixture_manifest(), parquet(table)))
    assert response.status_code == 200
    assert response.content == fixture_answer(server)


def scoped(table: pa.Table) -> pa.Table:
    """``table`` with a ``scope`` column: ``bundle_1`` in the even rows, ``bundle_2``
    in the odd ones."""
    scopes = [f"bundle_{row % 2 + 1}" for row in range(table.num_rows)]
    return table.append_column("scope", pa.array(scopes))


def test_a_scope_column_is_a_further_column(server: TestClient) -> None:
    response = post(server, body(fixture_manifest(), parquet(scoped(fixture_table()))))
    assert response.status_code == 200
    assert response.content == fixture_answer(server)


def test_a_scope_tells_no_two_ids_apart(server: TestClient) -> None:
    table = fixture_table()
    ids = table.column("id").to_pylist()
    assert ids[:2] == ["claim_1", "claim_2"]
    index = table.schema.get_field_index("id")
    table = table.set_column(
        index, table.schema.field(index), pa.array(["claim_1", "claim_1", *ids[2:]])
    )
    response = post(server, body(fixture_manifest(), parquet(scoped(table))))
    assert response.status_code == 422
    message = "the ID 'claim_1' is given twice"
    assert response.json() == {
        "detail": {
            "path": [],
            "message": message,
            "problems": [
                {"code": "duplicate_id", "row": 1, "column": ["id"], "message": message}
            ],
        }
    }


def test_the_files_provenance_gives_every_row_its_beliefs(server: TestClient) -> None:
    table = fixture_table()
    index = table.schema.get_field_index("provenance")
    table = table.set_column(
        index,
        table.schema.field(index),
        pa.nulls(table.num_rows, table.schema.field(index).type),
    )
    shared = {
        "method": "imported",
        "date": "2026-11-20",
        "beliefs": [
            {"actor": A, "belief": "false", "date": "2026-11-21"},
            {"actor": B, "belief": "true", "date": "2026-11-21"},
        ],
    }
    table = table.replace_schema_metadata(
        {"timetoshare:provenance": json.dumps(shared)}
    )
    response = post(server, body(fixture_manifest(), parquet(table)))
    assert response.status_code == 200
    header, arrays = decoded(response.content)
    assert header == FIXTURE_HEADER
    assert arrays["belief_offsets"] == list(range(0, 31, 2))
    assert arrays["belief_actors"] == [1, 0] * 15
    assert arrays["belief_words"] == [1, 0] * 15
    assert values(arrays, "a.start") == FIXTURE_VALUES["a.start"]


COMPACT_A = "orcid:0000-0002-1825-0097"
"""A written compactly under the prefix ``orcid``."""


def undeclared_manifest() -> bytes:
    """The fixture's manifest without the prefix ``orcid`` in its ``@context``.

    The fixture's manifest declares ``orcid`` for the actors of its
    MatchClaim table alone; no statement uses it.
    """
    manifest = loads(fixture_manifest().decode())
    manifest["@context"] = dict(FORMAT_CONTEXT)
    return dumps(manifest).encode()


def with_belief_actor(table: pa.Table, row: int, at: int, actor: str) -> pa.Table:
    """The table with the actor of row ``row``'s belief ``at`` replaced."""
    index = table.schema.get_field_index("provenance")
    field = table.schema.field(index)
    cells = table.column(index).to_pylist()
    cells[row]["beliefs"][at]["actor"] = actor
    return table.set_column(index, field, pa.array(cells, field.type))


def test_actors_are_answered_expanded_under_the_manifests_context(
    server: TestClient,
) -> None:
    table = parquet(with_belief_actor(fixture_table(), 0, 0, COMPACT_A))
    response = post(server, body(fixture_manifest(), table))
    assert response.status_code == 200
    assert response.content == fixture_answer(server)


def test_an_actor_whose_prefix_is_undeclared_is_answered_as_written(
    server: TestClient,
) -> None:
    table = parquet(with_belief_actor(fixture_table(), 0, 0, COMPACT_A))
    response = post(server, body(undeclared_manifest(), table))
    assert response.status_code == 200
    header, arrays = decoded(response.content)
    assert header == {**FIXTURE_HEADER, "actors": [B, A, COMPACT_A]}
    assert arrays["belief_actors"] == [2, 1, 1, 1, 0, 0]
    assert arrays["belief_words"] == FIXTURE_ARRAYS["belief_words"]


def claim(
    claim_id: str,
    a: tuple[str, str, dict[str, Any]],
    b: tuple[str, str, dict[str, Any]],
) -> dict[str, Any]:
    """A synchronous MatchClaim row of two events with one start anchor."""
    row: dict[str, Any] = dict.fromkeys(MATCH_CLAIM_SCHEMA.names)
    row.update(
        id=claim_id,
        is_synchronous=True,
        timeline_a_id=a[0],
        event_a_id=a[1],
        timeline_b_id=b[0],
        event_b_id=b[1],
        start_anchor={"coordinate_a": a[2], "coordinate_b": b[2]},
    )
    return row


def cell(
    unit: str, number_type: str, number: int | float, denominator: int = 1
) -> dict:
    """A coordinate cell in the package form: the number once, as its type says."""
    if number_type == "float":
        members = dict(numerator=None, denominator=None, value=float(number))
    elif number_type == "int":
        members = dict(numerator=number, denominator=None, value=None)
    else:
        members = dict(numerator=number, denominator=denominator, value=None)
    return dict(**members, unit=unit, number_type=number_type)


def test_values_keep_their_axis_exactly(server: TestClient) -> None:
    big = 2**53 + 1
    huge = 2**62 + 1
    negative_zero = cell("seconds", "float", -0.0)
    rows = [
        claim(
            "c1",
            ("dpt", "e1", cell("samples", "int", big)),
            ("clt", "e2", cell("quarters", "fraction", 2, 4)),
        ),
        claim(
            "c2",
            ("clt", "e3", cell("quarters", "fraction", huge, 3)),
            ("cpt", "e4", negative_zero),
        ),
    ]
    manifest = {
        "timetoshare": "0.2.0",
        "timelines": [
            {"id": "#clt", "unit": "quarters", "length": None},
            {"id": "#cpt", "unit": "seconds", "length": None},
            {"id": "#dpt", "unit": "samples", "length": None},
        ],
    }
    table = pa.Table.from_pylist(rows, schema=MATCH_CLAIM_SCHEMA)
    response = post(server, body(dumps(manifest).encode(), parquet(table)))
    assert response.status_code == 200
    header, arrays = decoded(response.content)
    assert header["timelines"] == [
        {"id": "clt", "number_type": "fraction"},
        {"id": "cpt", "number_type": "float"},
        {"id": "dpt", "number_type": "int"},
    ]
    assert arrays["a.timeline"] == [2, 0]
    assert arrays["b.timeline"] == [0, 1]
    assert values(arrays, "a.start") == [
        (9007199254740992.0, big, 1),
        (float(Fraction(huge, 3)), huge, 3),
    ]
    assert values(arrays, "b.start") == [(0.5, 1, 2), (0.0, 0, 0)]
    assert math.copysign(1.0, arrays["b.start.position"][1]) == 1.0
    assert header["actors"] == []
    assert arrays["belief_offsets"] == [0, 0, 0]


def test_a_table_the_checks_refuse_answers_every_problem(server: TestClient) -> None:
    manifest = loads(fixture_manifest().decode())
    del manifest["timelines"][0]["children"]
    from timetoshare.tables import match_claim_problems

    problem = {
        "code": "unknown_timeline",
        "row": 14,
        "column": ["timeline_a_id"],
        "message": "the manifest has no timeline 'clt_2'",
    }
    found = match_claim_problems(fixture_table(), manifest)
    assert [
        {"code": p.code, "row": p.row, "column": list(p.column), "message": p.message}
        for p in found
    ] == [problem]
    response = post(server, body(dumps(manifest).encode(), parquet(fixture_table())))
    assert response.status_code == 422
    assert response.json() == {
        "detail": {"path": [], "message": problem["message"], "problems": [problem]}
    }


def test_a_table_without_a_column_answers_the_schema_problem(
    server: TestClient,
) -> None:
    table = fixture_table().drop_columns(["certainty"])
    response = post(server, body(fixture_manifest(), parquet(table)))
    assert response.status_code == 422
    message = "the table has no column 'certainty'"
    assert response.json() == {
        "detail": {
            "path": [],
            "message": message,
            "problems": [
                {
                    "code": "schema_violation",
                    "row": None,
                    "column": ["certainty"],
                    "message": message,
                }
            ],
        }
    }


@pytest.mark.parametrize(
    ("content", "path", "message"),
    [
        (b"\x01\x00", [], "the body does not start with the manifest's length"),
        (
            struct.pack("<I", 100) + bytes(10),
            [],
            "the body states a manifest of 100 bytes and holds 10",
        ),
        (body(b"\xff", b""), [], "the manifest is not UTF-8 text"),
        (
            body(fixture_manifest().replace(b'"#clt_1"\n', b'"clt_1"\n'), b""),
            ["timelines", 0, "id"],
            "'clt_1' is not written as an ID: it does not start with '#'",
        ),
        (
            body(fixture_manifest(), b"not parquet"),
            [],
            "the MatchClaim table is no Parquet file",
        ),
        (body(fixture_manifest(), b""), [], "the MatchClaim table is no Parquet file"),
    ],
    ids=["short", "long manifest", "no UTF-8", "bare ID", "no Parquet", "no table"],
)
def test_a_body_that_cannot_be_read_is_refused(
    server: TestClient, content: bytes, path: list[Any], message: str
) -> None:
    response = post(server, content)
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


def test_the_route_needs_the_token(server: TestClient) -> None:
    content = body(fixture_manifest(), parquet(fixture_table()))
    response = server.post(ROUTE, content=content)
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


@pytest.mark.parametrize(
    ("module", "package", "message"),
    [
        ("timetoshare.tables", "timetoshare", "cannot check MatchClaim tables"),
        (
            "timetoalign.alignment.claims",
            "timetoalign",
            "cannot read MatchClaim tables",
        ),
    ],
)
@pytest.mark.parametrize("content", [b"", b"\x01\x00"], ids=["empty", "short"])
def test_without_the_table_modules_the_route_says_so(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    module: str,
    package: str,
    message: str,
    content: bytes,
) -> None:
    # A None entry makes every import of the module raise ImportError.
    monkeypatch.setitem(sys.modules, module, None)
    importlib.reload(tilie_server.routers.match_claims)
    app = importlib.reload(tilie_server.app).create_app(
        ServerSettings(HOST, PORT, TOKEN, tmp_path)
    )
    server = TestClient(app, base_url=f"http://{HOST}:{PORT}")
    assert server.get("/api/health", headers=AUTH).status_code == 200
    response = post(server, content)
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": f"the installed {package} {version(package)} {message}",
        }
    }


def test_the_recording_is_the_answer(server: TestClient, tmp_path: Path) -> None:
    target = tmp_path / "answer.bin"
    subprocess.run([sys.executable, str(SCRIPT), str(target)], check=True)
    assert target.read_bytes() == fixture_answer(server)
