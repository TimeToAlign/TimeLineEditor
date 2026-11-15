from __future__ import annotations

import importlib
import json
import sys
from fractions import Fraction
from importlib.metadata import version
from importlib.util import find_spec
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import tilie_server.app
import tilie_server.routers.measure_maps
from tilie_server.app import create_app
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}
ROUTE = "/api/measure-maps"
DATA = Path(__file__).parent / "data"
EXPANSION = "timetoalign.timelines.structure"

needs_expansion = pytest.mark.skipif(
    find_spec(EXPANSION) is None,
    reason="the installed timetoalign cannot expand measure maps",
)


@pytest.fixture
def server(tmp_path: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, tmp_path))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


def read(name: str) -> Any:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def row(**members: Any) -> dict[str, Any]:
    """An expanded row with the defaults of a plain measure, in the answer's order."""
    plain: dict[str, Any] = {
        "ID": None,
        "count": None,
        "qstamp": None,
        "number": None,
        "name": None,
        "time_signature": None,
        "nominal_length": None,
        "actual_length": None,
        "start_repeat": False,
        "end_repeat": False,
        "next": [],
        "volta": None,
        "offset_within_measure": [0, 1],
    }
    return {**plain, **members}


@needs_expansion
def test_the_fixture_answers_its_hand_expanded_rows(server: TestClient) -> None:
    response = server.post(ROUTE, headers=AUTH, json=read("group_measure_map.json"))
    assert response.status_code == 200
    assert response.json() == read("group_measure_map.answer.json")
    assert list(response.json()["measure_maps"][0]["rows"][0]) == list(row())


@needs_expansion
def test_the_answer_is_the_library_expansion(server: TestClient) -> None:
    from timetoalign.timelines.structure import MeasureMap

    manifest = read("group_measure_map.json")
    response = server.post(ROUTE, headers=AUTH, json=manifest)
    expanded = MeasureMap.expand_rows(
        manifest["measure_maps"][0]["rows"], keep_unknown_keys=True
    )
    quarters = ("qstamp", "nominal_length", "actual_length", "offset_within_measure")
    library = [
        {
            key: ([value.numerator, value.denominator] if key in quarters else value)
            for key, value in entry.items()
        }
        for entry in expanded
    ]
    exact = [isinstance(entry[key], Fraction) for entry in expanded for key in quarters]
    assert exact == [True] * 16
    assert response.json()["measure_maps"][0]["rows"] == library


@needs_expansion
def test_floats_volta_and_unknown_keys(server: TestClient) -> None:
    manifest = {
        "measure_maps": [
            {
                "id": "bars",
                "rows": [
                    {
                        "count": 1,
                        "time_signature": "3/4",
                        "actual_length": 0.5,
                        "offset_within_measure": 2.5,
                    },
                    {"count": 2, "volta": 1, "extra": True},
                ],
            }
        ]
    }
    response = server.post(ROUTE, headers=AUTH, json=manifest)
    assert response.status_code == 200
    assert response.json() == {
        "measure_maps": [
            {
                "id": "bars",
                "rows": [
                    row(
                        ID="1",
                        count=1,
                        qstamp=[0, 1],
                        number=0,
                        name="0",
                        time_signature="3/4",
                        nominal_length=[3, 1],
                        actual_length=[1, 2],
                        next=[2],
                        offset_within_measure=[5, 2],
                    ),
                    row(
                        ID="2",
                        count=2,
                        qstamp=[1, 2],
                        number=2,
                        name="2",
                        time_signature="3/4",
                        nominal_length=[3, 1],
                        actual_length=[3, 1],
                        volta=1,
                    ),
                ],
            }
        ]
    }


@needs_expansion
@pytest.mark.parametrize("manifest", [{"timetoshare": "0.2.0"}, {"measure_maps": []}])
def test_a_manifest_without_measure_maps_answers_none(
    server: TestClient, manifest: dict[str, Any]
) -> None:
    response = server.post(ROUTE, headers=AUTH, json=manifest)
    assert response.status_code == 200
    assert response.json() == {"measure_maps": []}


@needs_expansion
def test_two_requests_answer_the_same(server: TestClient) -> None:
    manifest = read("group_measure_map.json")
    first = server.post(ROUTE, headers=AUTH, json=manifest)
    second = server.post(ROUTE, headers=AUTH, json=manifest)
    assert first.content == second.content


@needs_expansion
@pytest.mark.parametrize(
    ("body", "path", "message"),
    [
        (b"{not json", [], "the body is not JSON"),
        (b"[]", [], "the body is not a JSON object"),
        (b'{"measure_maps": {}}', ["measure_maps"], "measure_maps is not a list"),
    ],
)
def test_a_body_of_another_form_is_refused(
    server: TestClient, body: bytes, path: list[Any], message: str
) -> None:
    headers = {**AUTH, "Content-Type": "application/json"}
    response = server.post(ROUTE, headers=headers, content=body)
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


@needs_expansion
def test_a_map_the_library_refuses_is_named_by_its_path(server: TestClient) -> None:
    manifest = read("group_measure_map.json")
    manifest["measure_maps"].append(
        {"id": "broken", "rows": [{"count": 2}, {"count": 1}]}
    )
    response = server.post(ROUTE, headers=AUTH, json=manifest)
    assert response.status_code == 422
    assert response.json() == {
        "detail": {
            "path": ["measure_maps", 1],
            "message": "Measure Map count 1 does not increase after count 2",
        }
    }


def test_the_route_needs_the_token(server: TestClient) -> None:
    response = server.post(ROUTE, json=read("group_measure_map.json"))
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


@pytest.mark.parametrize(
    "body",
    [b'{"measure_maps": []}', b"{not json", b"[]"],
    ids=["empty", "no JSON", "list"],
)
def test_without_the_expansion_the_server_starts_and_the_route_says_so(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, body: bytes
) -> None:
    # A None entry makes every import of the module raise ImportError.
    monkeypatch.setitem(sys.modules, EXPANSION, None)
    importlib.reload(tilie_server.routers.measure_maps)
    app = importlib.reload(tilie_server.app).create_app(
        ServerSettings(HOST, PORT, TOKEN, tmp_path)
    )
    server = TestClient(app, base_url=f"http://{HOST}:{PORT}")

    health = server.get("/api/health", headers=AUTH)
    assert health.status_code == 200
    assert health.json() == {
        "name": "tilie-server",
        "version": version("tilie-server"),
        "timetoalign": version("timetoalign"),
    }
    headers = {**AUTH, "Content-Type": "application/json"}
    response = server.post(ROUTE, headers=headers, content=body)
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": f"the installed timetoalign {version('timetoalign')} "
            "cannot expand measure maps",
        }
    }
