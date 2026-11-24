"""Public mode: no token, no file routes, a bounded body and bounded tables
(README, "Public mode")."""

from __future__ import annotations

import asyncio
import json
import struct
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from timetoshare.tables import fixture_path

import tilie_server.routers.measure_maps
from tilie_server.app import create_app
from tilie_server.manifests import Refusal
from tilie_server.routers.match_claims import TableBounds
from tilie_server.security import body_limit_message
from tilie_server.settings import ServerSettings

PUBLIC_HOSTS = ("tilie.example.org", "localhost:8000")
LIMIT = 8
TOKEN = "test-token-0123456789"
LOCAL_HOST = "127.0.0.1"
LOCAL_PORT = 8765
TOO_LONG = {"detail": "body larger than 8 bytes"}
SEEN = {"detail": {"path": [], "message": "seen"}}
MIB = 1024 * 1024


def public_settings(static_dir: Path, root: Path | None = None) -> ServerSettings:
    return ServerSettings(
        "0.0.0.0",
        8000,
        None,
        static_dir,
        root if root is not None else static_dir,
        public_hosts=PUBLIC_HOSTS,
        files=False,
        body_limit=LIMIT,
    )


def public_client(static_dir: Path, root: Path | None = None) -> TestClient:
    app = create_app(public_settings(static_dir, root))
    return TestClient(app, base_url=f"http://{PUBLIC_HOSTS[0]}")


def local_client(static_dir: Path, root: Path | None = None) -> TestClient:
    settings = ServerSettings(
        LOCAL_HOST,
        LOCAL_PORT,
        TOKEN,
        static_dir,
        root if root is not None else static_dir,
    )
    return TestClient(
        create_app(settings), base_url=f"http://{LOCAL_HOST}:{LOCAL_PORT}"
    )


def build_editor(folder: Path) -> Path:
    folder.mkdir()
    (folder / "index.html").write_text("<!doctype html>")
    return folder


@pytest.fixture
def unbuilt(tmp_path: Path) -> TestClient:
    return public_client(tmp_path)


# ---------------------------------------------------------------------- token


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Bearer wrong"}], ids=["none", "wrong"]
)
def test_health_answers_without_a_token(
    unbuilt: TestClient,
    installed_health: dict[str, str | bool | None],
    tmp_path: Path,
    headers: dict[str, str],
) -> None:
    response = unbuilt.get("/api/health", headers=headers)
    assert response.status_code == 200
    assert response.json() == {**installed_health, "files": False}
    control = local_client(tmp_path).get("/api/health", headers=headers)
    assert (control.status_code, control.json()) == (
        401,
        {"detail": "missing or invalid token"},
    )


# ---------------------------------------------------------------------- hosts


@pytest.mark.parametrize("host", PUBLIC_HOSTS)
def test_a_given_host_is_accepted(unbuilt: TestClient, host: str) -> None:
    response = unbuilt.get("/api/health", headers={"Host": host})
    assert response.status_code == 200


@pytest.mark.parametrize(
    "host",
    ["127.0.0.1:8000", "tilie.example.org:443", "localhost", "evil.example"],
)
def test_any_other_host_is_forbidden(unbuilt: TestClient, host: str) -> None:
    response = unbuilt.get("/api/health", headers={"Host": host})
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden host"}


def asgi_call(
    app: Any,
    path: str,
    headers: list[tuple[bytes, bytes]],
    chunks: list[bytes],
    *,
    method: str = "GET",
) -> tuple[int, Any, list[str]]:
    """Call ``app`` through the raw ASGI interface.

    The body is sent as ``chunks``, one ``http.request`` message each, the
    last one ending the body. Returns the status, the JSON body and the
    ``receive`` calls made, each named by the message it answered.
    """
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": headers,
        "server": ("127.0.0.1", 8000),
        "client": ("127.0.0.1", 50000),
    }
    pending = [
        {"type": "http.request", "body": chunk, "more_body": i < len(chunks) - 1}
        for i, chunk in enumerate(chunks)
    ]
    received: list[str] = []
    messages: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        message = pending.pop(0) if pending else {"type": "http.disconnect"}
        received.append(f"{message['type']} {message.get('body', b'')!r}")
        return message

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    body = b"".join(
        m.get("body", b"") for m in messages if m["type"] == "http.response.body"
    )
    return start["status"], json.loads(body), received


def test_a_missing_host_is_forbidden(tmp_path: Path) -> None:
    app = create_app(public_settings(tmp_path))
    status, body, _ = asgi_call(app, "/api/health", [], [b""])
    assert (status, body) == (403, {"detail": "forbidden host"})


# -------------------------------------------------------------------- origins

ORIGINS = [
    "https://tilie.example.org",
    "http://tilie.example.org",
    "https://localhost:8000",
    "http://localhost:8000",
]


@pytest.mark.parametrize("origin", ORIGINS)
def test_the_origins_of_the_given_hosts_are_accepted(
    unbuilt: TestClient, origin: str
) -> None:
    response = unbuilt.get("/api/health", headers={"Origin": origin})
    assert response.status_code == 200


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        "http://127.0.0.1:8000",
        "https://tilie.example.org:443",
        "null",
    ],
)
def test_any_other_origin_is_forbidden(unbuilt: TestClient, origin: str) -> None:
    response = unbuilt.get("/api/health", headers={"Origin": origin})
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden origin"}


def test_the_settings_state_the_hosts_and_origins(tmp_path: Path) -> None:
    public = public_settings(tmp_path)
    assert public.allowed_hosts() == frozenset(PUBLIC_HOSTS)
    assert public.allowed_origins() == frozenset(ORIGINS)
    local = ServerSettings(LOCAL_HOST, LOCAL_PORT, TOKEN)
    assert local.allowed_origins() == frozenset(
        {"http://127.0.0.1:8765", "http://localhost:8765"}
    )


# ---------------------------------------------------------------------- files

FILE_REQUESTS = [
    ("GET", "/api/folders?path="),
    ("GET", "/api/files?path=a.yaml"),
    ("PUT", "/api/files?path=b.tle.json"),
]


@pytest.fixture
def root(tmp_path: Path) -> Path:
    folder = tmp_path / "root"
    folder.mkdir()
    (folder / "a.yaml").write_text("x: 1\n")
    return folder


@pytest.mark.parametrize("editor", ["unbuilt", "built"])
@pytest.mark.parametrize(("method", "path"), FILE_REQUESTS)
def test_the_file_routes_are_not_served(
    tmp_path: Path, root: Path, editor: str, method: str, path: str
) -> None:
    static_dir = tmp_path / "editor"
    if editor == "built":
        build_editor(static_dir)
    else:
        static_dir.mkdir()
    response = public_client(static_dir, root).request(method, path, content=b"{}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
    assert sorted(entry.name for entry in root.iterdir()) == ["a.yaml"]


@pytest.mark.parametrize(("method", "path"), FILE_REQUESTS[:2])
def test_a_local_app_serves_the_same_file_requests(
    tmp_path: Path, root: Path, method: str, path: str
) -> None:
    response = local_client(tmp_path, root).request(
        method, path, headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert response.status_code == 200


# ----------------------------------------------------------------- body limit


@pytest.mark.parametrize(
    ("limit", "message"),
    [
        (16 * 1024 * 1024, "body larger than 16 MiB"),
        (1024 * 1024, "body larger than 1 MiB"),
        (1234, "body larger than 1,234 bytes"),
        (8, "body larger than 8 bytes"),
        (1, "body larger than 1 byte"),
    ],
)
def test_the_message_names_the_limit(limit: int, message: str) -> None:
    assert body_limit_message(limit) == message


@pytest.fixture
def seen(monkeypatch: pytest.MonkeyPatch) -> list[bytes]:
    """The bodies the measure-maps route was given; each is refused as seen."""
    bodies: list[bytes] = []

    def reader(body: bytes, *_args: Any, **_kwargs: Any) -> Any:
        bodies.append(body)
        raise Refusal([], "seen")

    monkeypatch.setattr(tilie_server.routers.measure_maps, "read_manifest", reader)
    return bodies


def test_a_declared_length_over_the_limit_is_refused(
    unbuilt: TestClient, seen: list[bytes]
) -> None:
    response = unbuilt.post("/api/measure-maps", content=b"123456789")
    assert response.request.headers["content-length"] == "9"
    assert (response.status_code, response.json()) == (413, TOO_LONG)
    assert seen == []


def test_a_declared_length_is_refused_without_reading_the_body(
    tmp_path: Path, seen: list[bytes]
) -> None:
    app = create_app(public_settings(tmp_path))
    headers = [(b"host", PUBLIC_HOSTS[0].encode()), (b"content-length", b"9")]
    status, body, received = asgi_call(
        app, "/api/measure-maps", headers, [b"123456789"], method="POST"
    )
    assert (status, body) == (413, TOO_LONG)
    assert received == []
    assert seen == []


def chunked(*chunks: bytes) -> Iterator[bytes]:
    yield from chunks


def test_a_chunked_body_over_the_limit_is_refused(
    unbuilt: TestClient, seen: list[bytes]
) -> None:
    response = unbuilt.post("/api/measure-maps", content=chunked(b"1234", b"56789"))
    assert "content-length" not in response.request.headers
    assert response.request.headers["transfer-encoding"] == "chunked"
    assert (response.status_code, response.json()) == (413, TOO_LONG)
    assert seen == []


def test_chunks_are_refused_once_they_pass_the_limit(
    tmp_path: Path, seen: list[bytes]
) -> None:
    app = create_app(public_settings(tmp_path))
    headers = [(b"host", PUBLIC_HOSTS[0].encode())]
    status, body, received = asgi_call(
        app, "/api/measure-maps", headers, [b"1234", b"5678", b"9abc"], method="POST"
    )
    assert (status, body) == (413, TOO_LONG)
    assert received == [
        "http.request b'1234'",
        "http.request b'5678'",
        "http.request b'9abc'",
    ]
    assert seen == []


def test_a_body_at_the_limit_reaches_the_route(
    unbuilt: TestClient, seen: list[bytes]
) -> None:
    response = unbuilt.post("/api/measure-maps", content=b"12345678")
    assert (response.status_code, response.json()) == (422, SEEN)
    assert seen == [b"12345678"]


def test_chunks_at_the_limit_reach_the_route(tmp_path: Path, seen: list[bytes]) -> None:
    app = create_app(public_settings(tmp_path))
    headers = [(b"host", PUBLIC_HOSTS[0].encode())]
    status, body, _ = asgi_call(
        app, "/api/measure-maps", headers, [b"1234", b"5678"], method="POST"
    )
    assert (status, body) == (422, SEEN)
    assert seen == [b"12345678"]


def test_a_request_without_a_body_passes(unbuilt: TestClient) -> None:
    assert unbuilt.get("/api/health").status_code == 200


def test_a_local_app_has_no_body_limit(tmp_path: Path, seen: list[bytes]) -> None:
    response = local_client(tmp_path).post(
        "/api/measure-maps",
        content=b"123456789",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert (response.status_code, response.json()) == (422, SEEN)
    assert seen == [b"123456789"]


# ------------------------------------------------------------ referrer policy


def test_refusals_send_no_referrer(tmp_path: Path, seen: list[bytes]) -> None:
    client = public_client(build_editor(tmp_path / "built"))
    responses = {
        "foreign host": client.get("/", headers={"Host": "evil.example"}),
        "foreign origin": client.get("/", headers={"Origin": "https://evil.example"}),
        "file route": client.put("/api/files?path=b.tle.json", content=b"{}"),
        "body too long": client.post("/api/measure-maps", content=b"123456789"),
    }
    assert {kind: r.status_code for kind, r in responses.items()} == {
        "foreign host": 403,
        "foreign origin": 403,
        "file route": 404,
        "body too long": 413,
    }
    policies = {
        kind: r.headers.get_list("referrer-policy") for kind, r in responses.items()
    }
    assert policies == {kind: ["no-referrer"] for kind in responses}


# --------------------------------------------------------------- table bounds

ACTOR = "https://orcid.org/0000-0002-1825-0097"
TABLE_ROUTES: dict[str, dict[str, Any] | None] = {
    "/api/match-claims": None,
    "/api/match-claims/events": {"claims": ["claim_1"]},
    "/api/match-claims/provenance": {"claims": ["claim_1"]},
    "/api/match-claims/belief": {
        "claim": "claim_6",
        "actor": ACTOR,
        "belief": "false",
        "date": "2026-11-22",
    },
}
"""The four routes that read a posted table, each with parameters it answers
200 to on the fixture (``None`` for none)."""

BATCH_TEXT = 106_500
"""The decoded bytes of 1,024 strings of 100 ``a``: 102,400 bytes of text
and 1,025 four-byte offsets."""


def fixture_table() -> pa.Table:
    return pq.read_table(fixture_path("match_claims.parquet"))


def written(table: pa.Table, **options: Any) -> bytes:
    sink = pa.BufferOutputStream()
    pq.write_table(table, sink, **options)
    return sink.getvalue().to_pybytes()


def table_body(route: str, table: bytes) -> bytes:
    """The body of ``route`` posting ``table`` with the fixture's manifest."""
    manifest = fixture_path("manifest.yaml").read_bytes()
    posted = struct.pack("<I", len(manifest)) + manifest + table
    parameters = TABLE_ROUTES[route]
    if parameters is None:
        return posted
    text = json.dumps(parameters).encode()
    return struct.pack("<I", len(text)) + text + posted


def bounded_client(
    static_dir: Path, rows: int | None = None, size: int | None = None
) -> TestClient:
    """A public app with the table bounds given and no body limit."""
    settings = replace(
        public_settings(static_dir), body_limit=None, table_rows=rows, table_bytes=size
    )
    return TestClient(create_app(settings), base_url=f"http://{PUBLIC_HOSTS[0]}")


def footer_facts(data: bytes) -> tuple[int, int, int]:
    """The file's row count, its row groups' summed row count and their summed
    ``total_byte_size``, as the footer states them."""
    footer = pq.ParquetFile(pa.BufferReader(data)).metadata
    groups = [footer.row_group(index) for index in range(footer.num_row_groups)]
    return (
        footer.num_rows,
        sum(group.num_rows for group in groups),
        sum(group.total_byte_size for group in groups),
    )


def decoded_size(data: bytes) -> int:
    """The bytes of the Arrow buffers of the whole table read at once."""
    return pq.read_table(pa.BufferReader(data)).get_total_buffer_size()


def forbid_decoding(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make pyarrow's batch reader and whole-table reader fail the test."""

    def decoding(*_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("the table was decoded")

    monkeypatch.setattr(pq.ParquetFile, "iter_batches", decoding)
    monkeypatch.setattr(pq, "read_table", decoding)


def too_large(message: str) -> tuple[int, dict[str, Any]]:
    return 413, {"detail": {"path": [], "message": message}}


def answer(response: Any) -> tuple[int, Any]:
    return response.status_code, response.json()


def with_note(table: pa.Table) -> pa.Table:
    """The table with a column ``note`` of 100,000 ``a`` in every row."""
    return table.append_column("note", pa.array(["a" * 100_000] * table.num_rows))


@pytest.mark.parametrize("route", TABLE_ROUTES)
def test_a_table_within_the_bounds_answers_as_locally(
    tmp_path: Path, route: str
) -> None:
    data = written(fixture_table())
    rows, group_rows, footer_size = footer_facts(data)
    size = decoded_size(data)
    assert (rows, group_rows) == (15, 15)
    assert footer_size < size
    public = bounded_client(tmp_path, rows=15, size=size).post(
        route, content=table_body(route, data)
    )
    local = local_client(tmp_path).post(
        route,
        content=table_body(route, data),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert local.status_code == 200
    assert (public.status_code, public.content) == (200, local.content)


@pytest.mark.parametrize("route", TABLE_ROUTES)
def test_a_table_over_the_row_bound_is_refused_undecoded(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, route: str
) -> None:
    data = written(fixture_table())
    forbid_decoding(monkeypatch)
    response = bounded_client(tmp_path, rows=14).post(
        route, content=table_body(route, data)
    )
    assert answer(response) == too_large("table of more than 14 rows")


FILE_ROWS = b"\x16\x1e"
"""The footer's file-level row count of 15: the field header of an i64 one
field after the schema, then 15 as a zigzag varint."""


def with_file_rows_14(data: bytes) -> bytes:
    """``data`` with its footer's file-level row count rewritten to 14."""
    length = int.from_bytes(data[-8:-4], "little")
    footer = data[-8 - length : -8]
    footer = footer.replace(FILE_ROWS, b"\x16\x1c", 1)
    return data[: -8 - length] + footer + data[-8:]


def test_a_footer_stating_fewer_rows_for_the_file_is_refused_by_its_row_groups(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data = with_file_rows_14(written(fixture_table()))
    assert footer_facts(data)[:2] == (14, 15)
    forbid_decoding(monkeypatch)
    route = "/api/match-claims"
    response = bounded_client(tmp_path, rows=14).post(
        route, content=table_body(route, data)
    )
    assert answer(response) == too_large("table of more than 14 rows")


def test_a_table_over_the_size_bound_by_its_decoded_bytes_is_refused(
    tmp_path: Path,
) -> None:
    data = written(fixture_table())
    bound = decoded_size(data) - 1
    assert footer_facts(data)[2] <= bound
    route = "/api/match-claims"
    response = bounded_client(tmp_path, size=bound).post(
        route, content=table_body(route, data)
    )
    assert answer(response) == too_large(
        f"table larger than {bound:,} bytes uncompressed"
    )


def test_a_compressible_column_is_refused_from_its_footer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data = written(with_note(fixture_table()), use_dictionary=False, compression="zstd")
    assert len(data) < 16 * 1024
    assert footer_facts(data)[2] > MIB
    forbid_decoding(monkeypatch)
    route = "/api/match-claims"
    response = bounded_client(tmp_path, size=MIB).post(
        route, content=table_body(route, data)
    )
    assert answer(response) == too_large("table larger than 1 MiB uncompressed")


def test_a_repeated_value_is_refused_by_its_decoded_bytes(tmp_path: Path) -> None:
    data = written(with_note(fixture_table()), compression="zstd")
    assert footer_facts(data)[2] <= MIB < decoded_size(data)
    route = "/api/match-claims"
    response = bounded_client(tmp_path, size=MIB).post(
        route, content=table_body(route, data)
    )
    assert answer(response) == too_large("table larger than 1 MiB uncompressed")


def test_the_read_stops_at_the_batch_passing_the_size_bound(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    data = written(pa.table({"note": pa.array(["a" * 100] * 5000)}))
    rows, group_rows, footer_size = footer_facts(data)
    assert (rows, group_rows) == (5000, 5000)
    assert footer_size <= 150_000
    batches = pq.ParquetFile(pa.BufferReader(data)).iter_batches
    original = pq.ParquetFile.iter_batches
    yielded: list[int] = []

    def counting(self: pq.ParquetFile, *args: Any, **kwargs: Any) -> Iterator[Any]:
        for batch in original(self, *args, **kwargs):
            assert batch.get_total_buffer_size() == BATCH_TEXT
            yielded.append(batch.num_rows)
            yield batch

    assert [batch.num_rows for batch in batches(batch_size=1024)] == [
        1024,
        1024,
        1024,
        1024,
        904,
    ]
    monkeypatch.setattr(pq.ParquetFile, "iter_batches", counting)
    route = "/api/match-claims"
    response = bounded_client(tmp_path, size=150_000).post(
        route, content=table_body(route, data)
    )
    assert answer(response) == too_large("table larger than 150,000 bytes uncompressed")
    assert yielded == [1024, 1024]


LOCAL_TABLES = {
    "fixture": (lambda: written(fixture_table()), 200),
    "file rows rewritten": (lambda: with_file_rows_14(written(fixture_table())), 200),
    "plain note": (
        lambda: written(
            with_note(fixture_table()), use_dictionary=False, compression="zstd"
        ),
        200,
    ),
    "dictionary note": (
        lambda: written(with_note(fixture_table()), compression="zstd"),
        200,
    ),
    "one column": (
        lambda: written(pa.table({"note": pa.array(["a" * 100] * 5000)})),
        422,
    ),
}


@pytest.mark.parametrize("name", LOCAL_TABLES)
def test_a_local_app_reads_every_bounded_table(tmp_path: Path, name: str) -> None:
    make, status = LOCAL_TABLES[name]
    route = "/api/match-claims"
    client = local_client(tmp_path)
    auth = {"Authorization": f"Bearer {TOKEN}"}
    response = client.post(route, content=table_body(route, make()), headers=auth)
    assert response.status_code == status
    if status == 200:
        fixture = client.post(
            route, content=table_body(route, written(fixture_table())), headers=auth
        )
        assert response.content == fixture.content
    else:
        assert response.json()["detail"]["path"] == []


@pytest.mark.parametrize(
    ("bounds", "measure", "message"),
    [
        (TableBounds(rows=1_000_000), 1_000_001, "table of more than 1,000,000 rows"),
        (TableBounds(rows=1), 2, "table of more than 1 row"),
        (TableBounds(rows=1234), 1235, "table of more than 1,234 rows"),
        (
            TableBounds(size=128 * MIB),
            128 * MIB + 1,
            "table larger than 128 MiB uncompressed",
        ),
        (TableBounds(size=1234), 1235, "table larger than 1,234 bytes uncompressed"),
        (TableBounds(size=8), 9, "table larger than 8 bytes uncompressed"),
        (TableBounds(size=1), 2, "table larger than 1 byte uncompressed"),
    ],
)
def test_the_table_refusals_name_the_bound(
    bounds: TableBounds, measure: int, message: str
) -> None:
    check = bounds.check_rows if bounds.rows is not None else bounds.check_size
    check(measure - 1)
    with pytest.raises(Refusal) as refused:
        check(measure)
    assert (refused.value.status_code, refused.value.path, refused.value.message) == (
        413,
        [],
        message,
    )
