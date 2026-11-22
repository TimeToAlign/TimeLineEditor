from __future__ import annotations

import importlib
import sys
from fractions import Fraction
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from timetoshare import dumps, loads

import tilie_server.app
import tilie_server.manifests
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
FIXTURE = "group_measure_map.minimal.yaml"


@pytest.fixture
def server(tmp_path: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, tmp_path))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


def text(name: str) -> str:
    return (DATA / name).read_text(encoding="utf-8")


def read(name: str) -> Any:
    return loads(text(name))


def post(server: TestClient, body: str | bytes, **headers: str) -> Any:
    return server.post(ROUTE, headers={**AUTH, **headers}, content=body)


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


def test_the_fixture_answers_its_hand_expanded_rows(server: TestClient) -> None:
    assert read(FIXTURE)["measure_maps"][0]["id"] == "#measuremap_1"
    response = post(server, text(FIXTURE), **{"Content-Type": "application/yaml"})
    assert response.status_code == 200
    assert response.json() == read("group_measure_map.answer.json")
    assert list(response.json()["measure_maps"][0]["rows"][0]) == list(row())


def test_the_answer_is_the_library_expansion(server: TestClient) -> None:
    from timetoalign.timelines.structure import MeasureMap

    manifest = read(FIXTURE)
    response = post(server, text(FIXTURE))
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


@pytest.mark.parametrize("serialization", ["json", "yaml"])
def test_floats_volta_and_unknown_keys(server: TestClient, serialization: str) -> None:
    manifest = {
        "measure_maps": [
            {
                "id": "#bars",
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
    body = dumps(manifest, serialization)
    assert loads(body) == manifest
    response = post(server, body)
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


def test_rows_with_their_own_ids_read_by_a_measure_record_map(
    server: TestClient,
) -> None:
    def written(ID: str, count: int, qstamp: list[int], following: list[str]) -> dict:
        return {
            "ID": ID,
            "actual_length": [9, 2],
            "count": count,
            "end_repeat": False,
            "name": str(count),
            "next": following,
            "nominal_length": [9, 2],
            "number": count,
            "qstamp": qstamp,
            "start_repeat": False,
            "time_signature": "9/8",
        }

    manifest = {
        "measure_maps": [
            {
                "id": "#measuremap_1",
                "rows": [
                    written("qhghzyb", 1, [0, 1], ["t1ajik95"]),
                    written("t1ajik95", 2, [9, 2], ["l1lqnom3"]),
                    written("l1lqnom3", 3, [9, 1], []),
                ],
            }
        ],
        "timelines": [
            {
                "conversion_maps": [
                    {
                        "id": "#cmap_2",
                        "measure_map": "#measuremap_1",
                        "source_unit": "quarters",
                        "target_unit": None,
                        "type": "MeasureRecordMap",
                    }
                ],
                "id": "#clt_6",
                "length": [27, 2],
                "unit": "quarters",
            }
        ],
        "timetoshare": "0.2.0",
    }
    response = post(
        server, dumps(manifest, "yaml"), **{"Content-Type": "application/json"}
    )
    assert response.status_code == 200

    def expanded(ID: str, count: int, qstamp: list[int], following: list[int]) -> dict:
        return row(
            ID=ID,
            count=count,
            qstamp=qstamp,
            number=count,
            name=str(count),
            time_signature="9/8",
            nominal_length=[9, 2],
            actual_length=[9, 2],
            next=following,
        )

    assert response.json() == {
        "measure_maps": [
            {
                "id": "measuremap_1",
                "rows": [
                    expanded("qhghzyb", 1, [0, 1], [2]),
                    expanded("t1ajik95", 2, [9, 2], [3]),
                    expanded("l1lqnom3", 3, [9, 1], []),
                ],
            }
        ]
    }


@pytest.mark.parametrize("manifest", [{"timetoshare": "0.2.0"}, {"measure_maps": []}])
def test_a_manifest_without_measure_maps_answers_none(
    server: TestClient, manifest: dict[str, Any]
) -> None:
    response = server.post(ROUTE, headers=AUTH, json=manifest)
    assert response.status_code == 200
    assert response.json() == {"measure_maps": []}


def test_two_requests_answer_the_same(server: TestClient) -> None:
    first = post(server, text(FIXTURE))
    second = post(server, text(FIXTURE))
    assert first.content == second.content


@pytest.mark.parametrize(
    ("body", "path", "message"),
    [
        (b"\xff", [], "the body is not UTF-8 text"),
        (
            b"{not json",
            [],
            "the body is neither JSON nor YAML: expected a key at line 1, column 2",
        ),
        (b"[]", [], "the body is not an object"),
        (b"- 1\n", [], "the body is not an object"),
        (b'{"measure_maps": {}}', ["measure_maps"], "measure_maps is not a list"),
        (
            b'{"measure_maps": [{"id": "bars", "rows": [{"count": 1}]}]}',
            ["measure_maps", 0, "id"],
            "'bars' is not written as an ID: it does not start with '#'",
        ),
    ],
    ids=["no UTF-8", "unreadable", "JSON list", "YAML list", "maps", "bare ID"],
)
def test_a_body_of_another_form_is_refused(
    server: TestClient, body: bytes, path: list[Any], message: str
) -> None:
    headers = {**AUTH, "Content-Type": "application/json"}
    response = server.post(ROUTE, headers=headers, content=body)
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


def test_a_map_the_library_refuses_is_named_by_its_path(server: TestClient) -> None:
    manifest = read(FIXTURE)
    manifest["measure_maps"].append(
        {"id": "#broken", "rows": [{"count": 2}, {"count": 1}]}
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
    response = server.post(ROUTE, content=text(FIXTURE))
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


@pytest.mark.parametrize(
    "body",
    [b'{"measure_maps": []}', b"{not json", b"[]"],
    ids=["empty", "no JSON", "list"],
)
def test_without_the_expansion_the_server_starts_and_the_route_says_so(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    body: bytes,
    installed_health: dict[str, str | None],
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
    assert health.json() == installed_health
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


def without_the_reader(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    """The app built anew while timetoshare cannot be imported."""
    # A None entry makes every import of the package raise ImportError.
    monkeypatch.setitem(sys.modules, "timetoshare", None)
    importlib.reload(tilie_server.routers.measure_maps)
    app = importlib.reload(tilie_server.app).create_app(
        ServerSettings(HOST, PORT, TOKEN, tmp_path)
    )
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


@pytest.mark.parametrize(
    "body",
    [b'{"measure_maps": []}', b"{not json", b"[]"],
    ids=["empty", "no JSON", "list"],
)
def test_without_the_reader_the_server_starts_and_the_route_says_so(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    body: bytes,
    installed_health: dict[str, str | None],
) -> None:
    server = without_the_reader(monkeypatch, tmp_path)
    health = server.get("/api/health", headers=AUTH)
    assert health.status_code == 200
    assert health.json() == {**installed_health, "timetoshare": None}
    response = post(server, body)
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": f"the installed timetoshare {version('timetoshare')} "
            "cannot read manifest files",
        }
    }


def test_without_any_timetoshare_the_route_says_so(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    server = without_the_reader(monkeypatch, tmp_path)

    def missing(name: str) -> str:
        raise PackageNotFoundError(name)

    monkeypatch.setattr(tilie_server.manifests, "version", missing)
    response = post(server, text(FIXTURE))
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": "timetoshare is not installed, so manifest files cannot be read",
        }
    }
