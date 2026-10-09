from __future__ import annotations

import asyncio
import json
from importlib.metadata import version
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tilie_server.app import create_app

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def client(static_dir: Path) -> TestClient:
    app = create_app(token=TOKEN, host=HOST, port=PORT, static_dir=static_dir)
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


@pytest.fixture
def unbuilt(tmp_path: Path) -> TestClient:
    return client(tmp_path)


@pytest.fixture
def built(tmp_path: Path) -> tuple[TestClient, str]:
    html = "<!doctype html><title>TimeLineEditor</title>"
    (tmp_path / "index.html").write_text(html)
    return client(tmp_path), html


def test_health_answers_the_three_installed_versions(unbuilt: TestClient) -> None:
    response = unbuilt.get("/api/health", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {
        "name": "tilie-server",
        "version": version("tilie-server"),
        "timetoalign": version("timetoalign"),
    }


def test_api_without_token_is_unauthorized(unbuilt: TestClient) -> None:
    response = unbuilt.get("/api/health")
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


def test_api_with_wrong_token_is_unauthorized(unbuilt: TestClient) -> None:
    wrong = {"Authorization": f"Bearer {TOKEN[:-1]}X"}
    response = unbuilt.get("/api/health", headers=wrong)
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


@pytest.mark.parametrize(
    "authorization",
    [f"Basic {TOKEN}", f"bearer {TOKEN}", f"Bearer  {TOKEN}", f"Bearer {TOKEN} "],
)
def test_authorization_must_match_exactly(
    unbuilt: TestClient, authorization: str
) -> None:
    response = unbuilt.get("/api/health", headers={"Authorization": authorization})
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


def test_unknown_api_route_without_token_is_unauthorized(unbuilt: TestClient) -> None:
    response = unbuilt.get("/api/does-not-exist")
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


def test_foreign_origin_is_forbidden(unbuilt: TestClient) -> None:
    response = unbuilt.get(
        "/api/health", headers={**AUTH, "Origin": "http://evil.example"}
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden origin"}


@pytest.mark.parametrize(
    "origin", [f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"]
)
def test_own_origin_is_accepted(unbuilt: TestClient, origin: str) -> None:
    response = unbuilt.get("/api/health", headers={**AUTH, "Origin": origin})
    assert response.status_code == 200


def test_foreign_host_is_forbidden(unbuilt: TestClient) -> None:
    response = unbuilt.get("/api/health", headers={**AUTH, "Host": "evil.example:80"})
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden host"}


def test_missing_host_is_forbidden(tmp_path: Path) -> None:
    # Starlette's TestClient always supplies a Host header, so the guard is
    # exercised through the raw ASGI interface with no Host header at all.
    app = create_app(token=TOKEN, host=HOST, port=PORT, static_dir=tmp_path)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/health",
        "raw_path": b"/api/health",
        "query_string": b"",
        "headers": [(b"authorization", f"Bearer {TOKEN}".encode())],
        "server": (HOST, PORT),
        "client": ("127.0.0.1", 50000),
    }
    messages: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    asyncio.run(app(scope, receive, send))
    start = next(m for m in messages if m["type"] == "http.response.start")
    body = b"".join(
        bytes(m.get("body", b""))  # type: ignore[arg-type]
        for m in messages
        if m["type"] == "http.response.body"
    )
    assert start["status"] == 403
    assert json.loads(body) == {"detail": "forbidden host"}


def test_localhost_alias_is_accepted(unbuilt: TestClient) -> None:
    response = unbuilt.get("/api/health", headers={**AUTH, "Host": f"localhost:{PORT}"})
    assert response.status_code == 200


def test_root_without_built_app_is_unavailable(unbuilt: TestClient) -> None:
    response = unbuilt.get("/")
    assert response.status_code == 503
    assert response.json() == {"detail": "app not built"}


def test_root_serves_the_built_app(built: tuple[TestClient, str]) -> None:
    test_client, html = built
    response = test_client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.text == html


def test_built_app_still_checks_the_host(built: tuple[TestClient, str]) -> None:
    test_client, _ = built
    response = test_client.get("/", headers={"Host": "evil.example:80"})
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden host"}


def test_built_app_still_checks_the_origin(built: tuple[TestClient, str]) -> None:
    test_client, _ = built
    response = test_client.get("/", headers={"Origin": "http://evil.example"})
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden origin"}


def test_static_assets_are_served(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<!doctype html>")
    (tmp_path / "assets").mkdir()
    source = b'console.log("TimeLineEditor");'
    (tmp_path / "assets/app.js").write_bytes(source)
    response = client(tmp_path).get("/assets/app.js")
    assert response.status_code == 200
    assert response.content == source
