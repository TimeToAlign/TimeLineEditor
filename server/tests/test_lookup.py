from __future__ import annotations

import asyncio
import json
import socket
import sys
import threading
import urllib.error
from collections.abc import Callable, Iterator, Mapping
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tilie_server.app import create_app
from tilie_server.musicbrainz import (
    MusicBrainz,
    lookup_url,
    search_url,
    urllib_fetch,
)
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}
ENDPOINT = "/api/reconcile/musicbrainz"
SUGGEST = f"{ENDPOINT}/suggest/entity"
PROPERTIES = f"{ENDPOINT}/properties"
DATA = Path(__file__).parent / "data" / "musicbrainz"
WS = "https://musicbrainz.org/ws/2/"

CLAIR_URL = f"{WS}work?query=Clair+de+lune&limit=5&offset=0&fmt=json"
PIRES_URL = f"{WS}artist?query=Maria+Jo%C3%A3o+Pires&limit=5&offset=0&fmt=json"
SUGGEST_URL = f"{WS}artist?query=Pires&limit=10&offset=0&fmt=json"
WORK_ID = "work/8d331505-4d88-39ae-81c7-bec5da77af96"
WORK_URL = f"{WS}{WORK_ID}?inc=url-rels&fmt=json"

USER_AGENT = (
    f"tilie-server/{version('tilie-server')} "
    "( https://github.com/TimeToAlign/TimeLineEditor )"
)
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json"}

WORK = [{"id": "work", "name": "work"}]
ARTIST = [{"id": "artist", "name": "artist"}]

MANIFEST = {
    "versions": ["0.2"],
    "name": "MusicBrainz through tilie-server",
    "identifierSpace": "http://musicbrainz.org/",
    "schemaSpace": "http://schema.org/",
    "defaultTypes": [
        {"id": "work", "name": "work"},
        {"id": "artist", "name": "artist"},
        {"id": "recording", "name": "recording"},
        {"id": "release-group", "name": "release group"},
    ],
    "view": {"url": "https://musicbrainz.org/{{id}}"},
    "suggest": {
        "entity": {
            "service_url": "/api/reconcile/musicbrainz",
            "service_path": "/suggest/entity",
        }
    },
    "extend": {
        "propose_properties": {
            "service_url": "/api/reconcile/musicbrainz",
            "service_path": "/properties",
        },
        "property_settings": [],
    },
}

# Written out by hand from work-clair-de-lune.json.
CLAIR_DE_LUNE = [
    {
        "id": "work/199ec7b6-ce07-34e9-85ca-fcf89fe808c9",
        "name": "Clair de Lune",
        "score": 100,
        "match": True,
        "type": WORK,
    },
    {
        "id": "work/a5c964fc-933f-40c9-a5c0-721ae34fc37a",
        "name": "Clair de Lune",
        "description": "Song",
        "score": 99,
        "match": False,
        "type": WORK,
    },
    {
        "id": "work/5439be51-bc87-4fcd-bf6e-7e34377b7030",
        "name": "Clair de lune",
        "description": "Song",
        "score": 99,
        "match": False,
        "type": WORK,
    },
    {
        "id": "work/bbb4b91e-2428-40bb-9cba-6cfe4fc7365d",
        "name": "Clair de lune",
        "description": "for organ, Anna Lapwood",
        "score": 98,
        "match": False,
        "type": WORK,
    },
    {
        "id": "work/e1b30463-ad42-3865-be02-5231871dd53a",
        "name": "Clair de lune",
        "description": "Song",
        "score": 98,
        "match": False,
        "type": WORK,
    },
]

# Written out by hand from artist-maria-joao-pires.json.
MARIA_JOAO_PIRES = [
    {
        "id": "artist/64cf3646-fde3-4f5e-8741-8b4d21917785",
        "name": "Maria João Pires",
        "description": "Person · pianist · Portugal",
        "score": 100,
        "match": True,
        "type": ARTIST,
    },
    {
        "id": "artist/8c61e29b-a092-4b2b-ab1b-873b52b7f42b",
        "name": "João Pires",
        "description": "Person · Portugal",
        "score": 50,
        "match": False,
        "type": ARTIST,
    },
    {
        "id": "artist/a9fd4d49-cffc-40d5-bd17-0ba6dc0f811a",
        "name": "Maria João",
        "description": "Person · Portugal",
        "score": 48,
        "match": False,
        "type": ARTIST,
    },
    {
        "id": "artist/f6c0e15e-4717-40ee-8af0-642b76bedb4a",
        "name": "Adson João Pires",
        "description": "Person · brazilian composer · Brazil",
        "score": 44,
        "match": False,
        "type": ARTIST,
    },
    {
        "id": "artist/30948531-6f92-4786-8fba-db6b12044af1",
        "name": "Maria Cándida Pires",
        "score": 41,
        "match": False,
        "type": ARTIST,
    },
]

# Written out by hand from artist-pires-suggest.json.
PIRES_SUGGESTED = [
    {
        "id": "artist/7f3a2f7e-6277-4d72-b673-f3a8128a6aa0",
        "name": "Alexandre Pires",
        "description": "Person · Brazil",
    },
    {
        "id": "artist/988d39d6-eafd-4ae7-8cab-50a6448a9216",
        "name": "PIRES",
        "description": "Person · Portuguese house DJ and producer",
    },
    {
        "id": "artist/64cf3646-fde3-4f5e-8741-8b4d21917785",
        "name": "Maria João Pires",
        "description": "Person · pianist · Portugal",
    },
    {
        "id": "artist/8d9c00a1-7da4-4fcd-a521-bc116dde80b9",
        "name": "Les Pires",
        "description": "Group · France",
    },
    {
        "id": "artist/e6e5fdb0-2f22-48a8-bf0c-ee1743940a20",
        "name": "Sandra Pires",
        "description": "Person · Austria",
    },
    {"id": "artist/2d7a72cf-bf06-4234-8d1a-59d0d1241c13", "name": "Djalma Pires"},
    {
        "id": "artist/29b8a697-236e-4bd9-a36d-bcd0646d07be",
        "name": "Telmo Pires",
        "description": "Person · portugees fado · Portugal",
    },
    {
        "id": "artist/9012df03-d8f6-4888-89ff-44a7062961ea",
        "name": "Carla Pires",
        "description": "Person · fado singer · Portugal",
    },
    {
        "id": "artist/c9cfc7f4-da2a-44d7-95d9-3f3a5e117a2d",
        "name": "David Pires",
        "description": "Person · Portuguese Music Artist from Luxembourg",
    },
    {
        "id": "artist/07b1a6b0-07a3-45c3-96af-e655e9e3d1de",
        "name": "Barbara Pires",
        "description": "Person · Gospel singer · New Bedford",
    },
]

NAME_META = {"id": "name", "name": "name"}
SAME_AS_META = {"id": "sameAs", "name": "same as"}
WORK_NAME = [{"str": "Suite bergamasque, L. 75, CD 82 : III. Clair de lune"}]
WORK_SAME_AS = [{"str": "http://www.wikidata.org/entity/Q29117946"}]


class Replay:
    """Serve recorded answers by URL, recording every call; fail any other URL."""

    def __init__(self, extra: Mapping[str, tuple[int, bytes]] | None = None) -> None:
        index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
        self.answers = {
            url: (200, (DATA / name).read_bytes()) for url, name in index.items()
        }
        self.answers.update(extra or {})
        self.calls: list[tuple[str, dict[str, str]]] = []

    def __call__(self, url: str, headers: Mapping[str, str]) -> tuple[int, bytes]:
        self.calls.append((url, dict(headers)))
        if url not in self.answers:
            raise AssertionError(f"no recorded answer for {url}")
        return self.answers[url]

    @property
    def urls(self) -> list[str]:
        return [url for url, _ in self.calls]


class Clock:
    """A clock that only the injected sleep moves."""

    def __init__(self) -> None:
        self.now = 0.0
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def client_for(musicbrainz: MusicBrainz, tmp_path: Path) -> TestClient:
    settings = ServerSettings(HOST, PORT, TOKEN, tmp_path)
    app = create_app(settings, musicbrainz=musicbrainz)
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def replay() -> Replay:
    return Replay()


@pytest.fixture
def server(replay: Replay, clock: Clock, tmp_path: Path) -> TestClient:
    return client_for(MusicBrainz(replay, clock=clock, sleep=clock.sleep), tmp_path)


def queries(**given: Any) -> str:
    return json.dumps(given)


def post(server: TestClient, **form: str) -> Any:
    return server.post(ENDPOINT, headers=AUTH, data=form)


def test_the_recordings_are_exactly_the_tested_urls() -> None:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    assert sorted(index) == sorted([CLAIR_URL, PIRES_URL, SUGGEST_URL, WORK_URL])


def test_the_manifest_is_exact(server: TestClient, replay: Replay) -> None:
    response = server.get(ENDPOINT, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == MANIFEST
    assert json.dumps(response.json()) == json.dumps(MANIFEST)
    assert replay.calls == []


def test_queries_for_a_work_and_an_artist(server: TestClient, replay: Replay) -> None:
    response = post(
        server,
        queries=queries(
            q0={"query": "Clair de lune", "type": "work"},
            q1={"query": "Maria João Pires", "type": "artist"},
        ),
    )
    assert response.status_code == 200
    assert response.json() == {
        "q0": {"result": CLAIR_DE_LUNE},
        "q1": {"result": MARIA_JOAO_PIRES},
    }
    assert [list(c) for c in response.json()["q1"]["result"][:1]] == [
        ["id", "name", "description", "score", "match", "type"]
    ]
    assert replay.urls == [CLAIR_URL, PIRES_URL]


def test_a_query_without_a_type_searches_works(
    server: TestClient, replay: Replay
) -> None:
    given = queries(q0={"query": "Clair de lune", "limit": 5})
    response = server.get(ENDPOINT, headers=AUTH, params={"queries": given})
    assert response.status_code == 200
    assert response.json() == {"q0": {"result": CLAIR_DE_LUNE}}
    assert replay.urls == [CLAIR_URL]


def test_suggest(server: TestClient, replay: Replay) -> None:
    response = server.get(
        SUGGEST, headers=AUTH, params={"prefix": "Pires", "type": "artist"}
    )
    assert response.status_code == 200
    assert response.json() == {"result": PIRES_SUGGESTED}
    assert replay.urls == [SUGGEST_URL]


@pytest.mark.parametrize(
    ("params", "kind"), [({"type": "artist"}, "artist"), ({}, "work")]
)
def test_property_proposals(
    server: TestClient, replay: Replay, params: dict[str, str], kind: str
) -> None:
    response = server.get(PROPERTIES, headers=AUTH, params=params)
    assert response.status_code == 200
    assert response.json() == {"type": kind, "properties": [NAME_META, SAME_AS_META]}
    assert replay.calls == []


def test_extend_answers_the_name_and_the_recognised_iris(
    server: TestClient, replay: Replay
) -> None:
    extend = {"ids": [WORK_ID], "properties": [{"id": "name"}, {"id": "sameAs"}]}
    response = post(server, extend=json.dumps(extend))
    assert response.status_code == 200
    assert response.json() == {
        "meta": [NAME_META, SAME_AS_META],
        "rows": {WORK_ID: {"name": WORK_NAME, "sameAs": WORK_SAME_AS}},
    }
    assert replay.urls == [WORK_URL]


def test_extend_answers_in_the_order_asked(server: TestClient) -> None:
    extend = {"ids": [WORK_ID], "properties": [{"id": "sameAs"}, {"id": "name"}]}
    answer = post(server, extend=json.dumps(extend)).json()
    assert answer == {
        "meta": [SAME_AS_META, NAME_META],
        "rows": {WORK_ID: {"sameAs": WORK_SAME_AS, "name": WORK_NAME}},
    }
    assert list(answer["rows"][WORK_ID]) == ["sameAs", "name"]


def search_answer(member: str, entities: list[dict[str, Any]]) -> bytes:
    return json.dumps({"count": len(entities), "offset": 0, member: entities}).encode()


RECORDING_URL = search_url("recording", "Clair de lune", 5, 0)
RELEASE_GROUP_URL = search_url("release-group", "Clair de lune", 5, 0)
WRITTEN = {
    RECORDING_URL: (
        200,
        search_answer(
            "recordings",
            [
                {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "score": 90,
                    "title": "Clair de lune",
                    "disambiguation": "live",
                    "artist-credit": [
                        {"name": "Maria João Pires", "joinphrase": " & "},
                        {"name": "Augustin Dumay", "joinphrase": ""},
                    ],
                },
                {
                    "id": "00000000-0000-0000-0000-000000000002",
                    "score": 80,
                    "title": "Clair de lune",
                },
            ],
        ),
    ),
    RELEASE_GROUP_URL: (
        200,
        search_answer(
            "release-groups",
            [
                {
                    "id": "00000000-0000-0000-0000-000000000003",
                    "score": 100,
                    "title": "Debussy",
                    "primary-type": "Album",
                    "artist-credit": [{"name": "Maria João Pires"}],
                },
                {
                    "id": "00000000-0000-0000-0000-000000000004",
                    "score": 100,
                    "title": "Clair de lune",
                },
            ],
        ),
    ),
}


def test_recording_and_release_group_candidates(clock: Clock, tmp_path: Path) -> None:
    replay = Replay(WRITTEN)
    musicbrainz = MusicBrainz(replay, clock=clock, sleep=clock.sleep)
    server = client_for(musicbrainz, tmp_path)
    recording = [{"id": "recording", "name": "recording"}]
    release_group = [{"id": "release-group", "name": "release group"}]
    response = post(
        server,
        queries=queries(
            r={"query": "Clair de lune", "type": "recording"},
            g={"query": "Clair de lune", "type": "release-group"},
        ),
    )
    assert response.status_code == 200
    assert response.json() == {
        "r": {
            "result": [
                {
                    "id": "recording/00000000-0000-0000-0000-000000000001",
                    "name": "Clair de lune",
                    "description": "Maria João Pires & Augustin Dumay · live",
                    "score": 90,
                    "match": False,
                    "type": recording,
                },
                {
                    "id": "recording/00000000-0000-0000-0000-000000000002",
                    "name": "Clair de lune",
                    "score": 80,
                    "match": False,
                    "type": recording,
                },
            ]
        },
        "g": {
            "result": [
                {
                    "id": "release-group/00000000-0000-0000-0000-000000000003",
                    "name": "Debussy",
                    "description": "Album · Maria João Pires",
                    "score": 100,
                    "match": False,
                    "type": release_group,
                },
                {
                    "id": "release-group/00000000-0000-0000-0000-000000000004",
                    "name": "Clair de lune",
                    "score": 100,
                    "match": False,
                    "type": release_group,
                },
            ]
        },
    }
    assert replay.urls == [RECORDING_URL, RELEASE_GROUP_URL]


def test_search_text_is_escaped() -> None:
    assert search_url("artist", 'AC/DC: "Live" (1+1)', 10, 20) == (
        f"{WS}artist?query=AC%5C%2FDC%5C%3A+%5C%22Live%5C%22+%5C%281%5C%2B1%5C%29"
        "&limit=10&offset=20&fmt=json"
    )
    assert lookup_url("work", "8d331505-4d88-39ae-81c7-bec5da77af96") == WORK_URL


# The rules of use -----------------------------------------------------------


def test_every_request_names_the_server(server: TestClient, replay: Replay) -> None:
    post(server, queries=queries(q0={"query": "Clair de lune"}))
    server.get(SUGGEST, headers=AUTH, params={"prefix": "Pires", "type": "artist"})
    assert [headers for _, headers in replay.calls] == [HEADERS, HEADERS]


def test_requests_are_a_second_apart(
    server: TestClient, replay: Replay, clock: Clock
) -> None:
    post(server, queries=queries(q0={"query": "Clair de lune"}))
    post(server, queries=queries(q0={"query": "Maria João Pires", "type": "artist"}))
    server.get(SUGGEST, headers=AUTH, params={"prefix": "Pires", "type": "artist"})
    assert clock.slept == [1.0, 1.0]
    assert replay.urls == [CLAIR_URL, PIRES_URL, SUGGEST_URL]


@pytest.mark.parametrize(("moved", "slept"), [(0.25, [0.75]), (1.0, [])])
def test_the_wait_counts_from_the_last_request(
    server: TestClient, clock: Clock, moved: float, slept: list[float]
) -> None:
    post(server, queries=queries(q0={"query": "Clair de lune"}))
    clock.now += moved
    post(server, queries=queries(q0={"query": "Maria João Pires", "type": "artist"}))
    assert clock.slept == slept


def test_equal_queries_ask_once(
    server: TestClient, replay: Replay, clock: Clock
) -> None:
    given = queries(q0={"query": "Clair de lune", "type": "work"})
    first = post(server, queries=given)
    second = server.get(ENDPOINT, headers=AUTH, params={"queries": given})
    assert first.json() == second.json() == {"q0": {"result": CLAIR_DE_LUNE}}
    assert replay.urls == [CLAIR_URL]
    assert clock.slept == []


def test_the_cache_drops_the_least_recently_used(clock: Clock) -> None:
    class Small(MusicBrainz):
        CACHE_SIZE = 2

    a, b, c = CLAIR_URL, PIRES_URL, SUGGEST_URL
    replay = Replay()
    musicbrainz = Small(replay, clock=clock, sleep=clock.sleep)

    async def ask(*urls: str) -> None:
        for url in urls:
            await musicbrainz.get(url)

    asyncio.run(ask(a, b, a, c))
    assert replay.urls == [a, b, c]
    asyncio.run(ask(a))
    assert replay.urls == [a, b, c]
    asyncio.run(ask(b))
    assert replay.urls == [a, b, c, b]


# Refusals and failures ------------------------------------------------------

TYPE_REFUSAL = (
    "'place' is no type of this service; "
    "the types are work, artist, recording and release-group"
)
UPPER = "work/8D331505-4D88-39AE-81C7-BEC5DA77AF96"


def refused(
    request: Callable[[TestClient], Any], server: TestClient, replay: Replay
) -> Any:
    response = request(server)
    assert response.status_code == 422
    assert replay.calls == []
    return response.json()


def queried(text: str) -> Callable[[TestClient], Any]:
    return lambda server: post(server, queries=text)


def extending(text: str) -> Callable[[TestClient], Any]:
    return lambda server: post(server, extend=text)


def suggesting(**params: str) -> Callable[[TestClient], Any]:
    return lambda server: server.get(SUGGEST, headers=AUTH, params=params)


NO_QUERIES = "queries is no JSON object of queries"
NO_EXTEND = "extend is no JSON object with ids and properties"
LIMIT = "limit is an integer from 1 to 25"


@pytest.mark.parametrize(
    ("request_", "message"),
    [
        (queried("{not json"), NO_QUERIES),
        (queried("[1]"), NO_QUERIES),
        (queried('{"q0": "Clair de lune"}'), NO_QUERIES),
        (lambda server: server.post(ENDPOINT, headers=AUTH, data={}), NO_QUERIES),
        (queried('{"q0": {"type": "work"}}'), "query 'q0' has no text"),
        (queried('{"q0": {"query": "  "}}'), "query 'q0' has no text"),
        (queried('{"q0": {"query": "Lune", "type": "place"}}'), TYPE_REFUSAL),
        (suggesting(prefix="Pires", type="place"), TYPE_REFUSAL),
        (
            lambda server: server.get(
                PROPERTIES, headers=AUTH, params={"type": "place"}
            ),
            TYPE_REFUSAL,
        ),
        (queried('{"q0": {"query": "Lune", "limit": 0}}'), LIMIT),
        (queried('{"q0": {"query": "Lune", "limit": 26}}'), LIMIT),
        (queried('{"q0": {"query": "Lune", "limit": "5"}}'), LIMIT),
        (queried('{"q0": {"query": "Lune", "limit": true}}'), LIMIT),
        (suggesting(type="artist"), "prefix is required"),
        (suggesting(prefix="", type="artist"), "prefix is required"),
        (suggesting(prefix="Pires", cursor="-1"), "cursor is an integer from 0"),
        (suggesting(prefix="Pires", cursor="x"), "cursor is an integer from 0"),
        (extending("{not json"), NO_EXTEND),
        (extending(json.dumps({"ids": [WORK_ID]})), NO_EXTEND),
        (
            extending(json.dumps({"ids": WORK_ID, "properties": [{"id": "name"}]})),
            NO_EXTEND,
        ),
        (
            extending(json.dumps({"ids": [1], "properties": [{"id": "name"}]})),
            NO_EXTEND,
        ),
        (
            extending(json.dumps({"ids": [WORK_ID], "properties": [{"id": "title"}]})),
            "'title' is no property of this service; "
            "the properties are name and sameAs",
        ),
        (
            extending(json.dumps({"ids": [UPPER], "properties": [{"id": "name"}]})),
            f"'{UPPER}' is no identifier of this service",
        ),
        (
            extending(
                json.dumps(
                    {
                        "ids": ["place/8d331505-4d88-39ae-81c7-bec5da77af96"],
                        "properties": [{"id": "name"}],
                    }
                )
            ),
            "'place/8d331505-4d88-39ae-81c7-bec5da77af96' "
            "is no identifier of this service",
        ),
        (
            extending(
                json.dumps(
                    {
                        "ids": ["8d331505-4d88-39ae-81c7-bec5da77af96"],
                        "properties": [{"id": "name"}],
                    }
                )
            ),
            "'8d331505-4d88-39ae-81c7-bec5da77af96' is no identifier of this service",
        ),
    ],
)
def test_refusals(
    server: TestClient,
    replay: Replay,
    request_: Callable[[TestClient], Any],
    message: str,
) -> None:
    assert refused(request_, server, replay) == {"detail": message}


def failing(error: OSError) -> Callable[[str, Mapping[str, str]], tuple[int, bytes]]:
    def fetch(url: str, headers: Mapping[str, str]) -> tuple[int, bytes]:
        raise error

    return fetch


@pytest.mark.parametrize(
    "error", [TimeoutError("timed out"), urllib.error.URLError("refused")]
)
def test_an_unreachable_musicbrainz(
    clock: Clock, tmp_path: Path, error: OSError
) -> None:
    musicbrainz = MusicBrainz(failing(error), clock=clock, sleep=clock.sleep)
    server = client_for(musicbrainz, tmp_path)
    response = post(server, queries=queries(q0={"query": "Clair de lune"}))
    assert response.status_code == 502
    assert response.json() == {"detail": "MusicBrainz could not be reached"}


def test_a_busy_musicbrainz_is_asked_again(clock: Clock, tmp_path: Path) -> None:
    replay = Replay({CLAIR_URL: (503, b"busy")})
    server = client_for(MusicBrainz(replay, clock=clock, sleep=clock.sleep), tmp_path)
    given = queries(q0={"query": "Clair de lune"})
    for _ in range(2):
        response = post(server, queries=given)
        assert response.status_code == 502
        assert response.json() == {"detail": "MusicBrainz answered 503"}
    assert replay.urls == [CLAIR_URL, CLAIR_URL]


def test_an_answer_that_is_no_json(clock: Clock, tmp_path: Path) -> None:
    replay = Replay({CLAIR_URL: (200, b"<html>")})
    server = client_for(MusicBrainz(replay, clock=clock, sleep=clock.sleep), tmp_path)
    response = post(server, queries=queries(q0={"query": "Clair de lune"}))
    assert response.status_code == 502
    assert response.json() == {"detail": "MusicBrainz answered no JSON"}


@pytest.fixture
def without_catalogue(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "timetoshare.catalogue", None)


@pytest.mark.usefixtures("without_catalogue")
def test_same_as_needs_the_catalogue(server: TestClient, replay: Replay) -> None:
    same_as = {"ids": [WORK_ID], "properties": [{"id": "sameAs"}]}
    response = post(server, extend=json.dumps(same_as))
    assert response.status_code == 501
    assert response.json() == {"detail": "the installed timetoshare has no catalogue"}
    assert replay.calls == []
    name = {"ids": [WORK_ID], "properties": [{"id": "name"}]}
    response = post(server, extend=json.dumps(name))
    assert response.status_code == 200
    assert response.json() == {
        "meta": [NAME_META],
        "rows": {WORK_ID: {"name": WORK_NAME}},
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", ENDPOINT), ("POST", ENDPOINT), ("GET", SUGGEST), ("GET", PROPERTIES)],
)
def test_every_route_needs_the_token(
    server: TestClient, replay: Replay, method: str, path: str
) -> None:
    response = server.request(method, path, params={"prefix": "Pires"})
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}
    assert replay.calls == []


def test_a_foreign_origin_is_forbidden(server: TestClient, replay: Replay) -> None:
    headers = {**AUTH, "Origin": "http://example.com"}
    given = queries(q0={"query": "Clair de lune"})
    response = server.post(ENDPOINT, headers=headers, data={"queries": given})
    assert response.status_code == 403
    assert response.json() == {"detail": "forbidden origin"}
    assert replay.calls == []


# The fetch ------------------------------------------------------------------


class Upstream(BaseHTTPRequestHandler):
    agents: list[str | None] = []

    def do_GET(self) -> None:  # noqa: N802 (the standard library's name)
        type(self).agents.append(self.headers.get("User-Agent"))
        status = 503 if self.path == "/busy" else 200
        body = b"busy" if status == 503 else b'{"ok": true}'
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        pass


@pytest.fixture
def upstream() -> Iterator[str]:
    Upstream.agents = []
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_address[1]}"
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join()


def test_the_fetch_returns_every_answer(upstream: str) -> None:
    assert urllib_fetch(f"{upstream}/ok", HEADERS) == (200, b'{"ok": true}')
    assert urllib_fetch(f"{upstream}/busy", HEADERS) == (503, b"busy")
    assert Upstream.agents == [USER_AGENT, USER_AGENT]


def test_the_fetch_raises_without_an_answer() -> None:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    with pytest.raises(OSError):
        urllib_fetch(f"http://127.0.0.1:{port}/", HEADERS)


def test_the_app_has_a_client_of_its_own(tmp_path: Path) -> None:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, tmp_path))
    assert type(app.state.musicbrainz) is MusicBrainz
