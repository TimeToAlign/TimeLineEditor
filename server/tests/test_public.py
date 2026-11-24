"""Public mode: no token, no file routes, a bounded body (README, "Public mode")."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import tilie_server.routers.measure_maps
from tilie_server.app import create_app
from tilie_server.manifests import Refusal
from tilie_server.security import body_limit_message
from tilie_server.settings import ServerSettings

PUBLIC_HOSTS = ("tilie.example.org", "localhost:8000")
LIMIT = 8
TOKEN = "test-token-0123456789"
LOCAL_HOST = "127.0.0.1"
LOCAL_PORT = 8765
TOO_LONG = {"detail": "body larger than 8 bytes"}
SEEN = {"detail": {"path": [], "message": "seen"}}


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
