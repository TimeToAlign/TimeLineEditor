"""MusicBrainz through a Reconciliation Service API 0.2 endpoint.

The editor looks values up in MusicBrainz through this server, which keeps
MusicBrainz's rules of use for all its requests (see
:mod:`tilie_server.musicbrainz`). The endpoint speaks the W3C Entity
Reconciliation Community Group's Reconciliation Service API, version 0.2,
so the editor reaches it with the same generic client as any conforming
service:

* ``GET /api/reconcile/musicbrainz``, the service manifest;
* ``queries=<JSON>`` (``GET`` or a ``POST`` form), reconciliation queries;
* ``extend=<JSON>`` (``POST`` form, or ``GET``), data extension with the
  properties ``name`` and ``sameAs``;
* ``GET …/suggest/entity``, entity suggestions;
* ``GET …/properties``, the properties a type can be extended with.

An identifier is ``<type>/<mbid>``, so the identifier space
``http://musicbrainz.org/`` followed by it is the entity's IRI
(``http://musicbrainz.org/work/<mbid>``). ``sameAs`` lists the IRIs that
timetoshare's catalogue recognises in an entity's URL relationships; the
catalogue is imported when a request needs it, so a server whose
timetoshare lacks it answers every other request.

Form bodies are read with the standard library, and refusals are answered
422 with ``{"detail": <message>}``; a failure of MusicBrainz itself 502.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping
from typing import Any
from urllib.parse import parse_qs

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from tilie_server.musicbrainz import (
    ENTITY_TYPES,
    MusicBrainz,
    UpstreamError,
    lookup_url,
    search_url,
)
from tilie_server.settings import API_PREFIX

router = APIRouter()

ENDPOINT = f"{API_PREFIX}reconcile/musicbrainz"
"""The service's endpoint, root-relative."""

TYPE_NAMES: Mapping[str, str] = {
    "work": "work",
    "artist": "artist",
    "recording": "recording",
    "release-group": "release group",
}
"""The service's types, in the manifest's order, with their names."""

DEFAULT_TYPE = "work"
"""The type of a query, a suggestion or a property proposal naming none."""

PROPERTIES: Mapping[str, str] = {"name": "name", "sameAs": "same as"}
"""The properties of data extension, with their names."""

QUERY_LIMIT = 5
"""Candidates per query when it names no ``limit``."""

MAX_LIMIT = 25
"""The largest ``limit`` of a query."""

SUGGEST_LIMIT = 10
"""Suggestions per request."""

SEPARATOR = " · "
"""Joins the parts of a candidate's description."""

MBID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
"""A MusicBrainz identifier as MusicBrainz writes it."""

MANIFEST: dict[str, Any] = {
    "versions": ["0.2"],
    "name": "MusicBrainz through tilie-server",
    "identifierSpace": "http://musicbrainz.org/",
    "schemaSpace": "http://schema.org/",
    "defaultTypes": [{"id": key, "name": name} for key, name in TYPE_NAMES.items()],
    "view": {"url": "https://musicbrainz.org/{{id}}"},
    "suggest": {"entity": {"service_url": ENDPOINT, "service_path": "/suggest/entity"}},
    "extend": {
        "propose_properties": {"service_url": ENDPOINT, "service_path": "/properties"},
        "property_settings": [],
    },
}
"""The service manifest."""


class Refusal(Exception):
    """A request the service cannot answer, with the status and the detail."""

    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# Reading requests -----------------------------------------------------------


async def parameters(request: Request) -> dict[str, str]:
    """The request's parameters: its query string, then a form body's.

    A parameter given twice takes its first value; one in the body takes
    the place of the same parameter in the query string.
    """
    given = dict(request.query_params)
    if request.method == "POST":
        body = (await request.body()).decode("utf-8", errors="replace")
        form = parse_qs(body, keep_blank_values=True)
        given.update({key: values[0] for key, values in form.items()})
    return given


def json_text(value: Any) -> str:
    """A value as the JSON text a refusal quotes it with, a string bare."""
    return value if isinstance(value, str) else json.dumps(value)


def entity_type(value: Any) -> str:
    """Read a type of this service.

    Raises:
        Refusal: If ``value`` is none of the service's types.
    """
    if isinstance(value, str) and value in TYPE_NAMES:
        return value
    types = list(TYPE_NAMES)
    listed = f"{', '.join(types[:-1])} and {types[-1]}"
    raise Refusal(
        f"'{json_text(value)}' is no type of this service; the types are {listed}"
    )


def read_queries(text: str) -> dict[str, tuple[str, str, int]]:
    """Read ``queries`` into ``(type, text, limit)`` per key, all or none.

    Raises:
        Refusal: At the first query the service cannot answer.
    """
    try:
        queries = json.loads(text)
    except ValueError:
        queries = None
    if not isinstance(queries, dict) or not all(
        isinstance(query, dict) for query in queries.values()
    ):
        raise Refusal("queries is no JSON object of queries")
    read = {}
    for key, query in queries.items():
        searched = query.get("query")
        if not isinstance(searched, str) or not searched.strip():
            raise Refusal(f"query '{key}' has no text")
        kind = entity_type(query.get("type", DEFAULT_TYPE))
        limit = query.get("limit", QUERY_LIMIT)
        if type(limit) is not int or not 1 <= limit <= MAX_LIMIT:
            raise Refusal(f"limit is an integer from 1 to {MAX_LIMIT}")
        read[key] = (kind, searched, limit)
    return read


def read_extend(text: str) -> tuple[list[str], list[str]]:
    """Read ``extend`` into its identifiers and properties.

    Raises:
        Refusal: If it is no object with a list of identifier strings and a
            list of property objects, or names an unknown property or an
            identifier outside the service.
    """
    try:
        extend = json.loads(text)
    except ValueError:
        extend = None
    ids = extend.get("ids") if isinstance(extend, dict) else None
    properties = extend.get("properties") if isinstance(extend, dict) else None
    if (
        not isinstance(ids, list)
        or not isinstance(properties, list)
        or not all(isinstance(identifier, str) for identifier in ids)
        or not all(isinstance(p, dict) and "id" in p for p in properties)
    ):
        raise Refusal("extend is no JSON object with ids and properties")
    asked = []
    for entry in properties:
        name = entry["id"]
        if not isinstance(name, str) or name not in PROPERTIES:
            listed = " and ".join(PROPERTIES)
            raise Refusal(
                f"'{json_text(name)}' is no property of this service; "
                f"the properties are {listed}"
            )
        if name not in asked:
            asked.append(name)
    for identifier in ids:
        split_identifier(identifier)
    return list(dict.fromkeys(ids)), asked


def split_identifier(identifier: str) -> tuple[str, str]:
    """Split ``<type>/<mbid>``.

    Raises:
        Refusal: If ``identifier`` is not of that form.
    """
    kind, _, mbid = identifier.partition("/")
    if kind not in TYPE_NAMES or MBID.fullmatch(mbid) is None:
        raise Refusal(f"'{identifier}' is no identifier of this service")
    return kind, mbid


def cursor_of(value: str | None) -> int:
    """Read a suggestion's ``cursor``, 0 when absent.

    Raises:
        Refusal: If it is not written as an integer of 0 or more.
    """
    if value is None:
        return 0
    if not value.isascii() or not value.isdigit():
        raise Refusal("cursor is an integer from 0")
    return int(value)


# Answering ------------------------------------------------------------------


def credited(entity: Mapping[str, Any]) -> str:
    """The artist credit of a recording or a release group, as displayed."""
    return "".join(
        f"{credit.get('name', '')}{credit.get('joinphrase', '')}"
        for credit in entity.get("artist-credit", ())
    )


DESCRIPTIONS: Mapping[str, Callable[[Mapping[str, Any]], list[Any]]] = {
    "work": lambda e: [e.get("type"), e.get("disambiguation")],
    "artist": lambda e: [
        e.get("type"),
        e.get("disambiguation"),
        (e.get("area") or {}).get("name"),
    ],
    "recording": lambda e: [credited(e), e.get("disambiguation")],
    "release-group": lambda e: [e.get("primary-type"), credited(e)],
}
"""The parts of a candidate's description, per type, before the empty go."""


def named(kind: str, entity: Mapping[str, Any]) -> dict[str, Any]:
    """An entity's identifier, name and, where it has one, description."""
    entry: dict[str, Any] = {
        "id": f"{kind}/{entity['id']}",
        "name": entity["name"] if kind == "artist" else entity["title"],
    }
    parts = [part for part in DESCRIPTIONS[kind](entity) if part]
    if parts:
        entry["description"] = SEPARATOR.join(parts)
    return entry


def candidates(kind: str, answer: Mapping[str, Any]) -> list[dict[str, Any]]:
    """The reconciliation candidates of one MusicBrainz search.

    A candidate is a match when it scores 100 and no other candidate does:
    MusicBrainz lists them by score, so it is the first, and the next one
    scores below 100.
    """
    found = answer[ENTITY_TYPES[kind]]
    perfect = sum(1 for entity in found if entity["score"] == 100)
    return [
        {
            **named(kind, entity),
            "score": entity["score"],
            "match": entity["score"] == 100 and perfect == 1,
            "type": [{"id": kind, "name": TYPE_NAMES[kind]}],
        }
        for entity in found
    ]


def catalogue_recognizer() -> Callable[[str], str | None]:
    """Answer the IRI timetoshare's catalogue recognises in a URL, if any.

    Raises:
        Refusal: 501, if the installed timetoshare has no catalogue.
    """
    try:
        from timetoshare.catalogue import load_catalogue, recognize
    except ImportError as error:
        raise Refusal(
            "the installed timetoshare has no catalogue", status_code=501
        ) from error
    catalogue = load_catalogue()

    def recognized(url: str) -> str | None:
        """The IRI the catalogue recognises in ``url``, or ``None``."""
        recognition = recognize(catalogue, url)
        return None if recognition is None else recognition.iri

    return recognized


def same_as(
    entity: Mapping[str, Any], recognized: Callable[[str], str | None]
) -> list[dict[str, str]]:
    """The IRIs recognised in an entity's URL relationships, in order, once."""
    iris: list[str] = []
    for relation in entity.get("relations", ()):
        url = (relation.get("url") or {}).get("resource")
        iri = None if not isinstance(url, str) else recognized(url)
        if iri is not None and iri not in iris:
            iris.append(iri)
    return [{"str": iri} for iri in iris]


async def reconciled(musicbrainz: MusicBrainz, text: str) -> dict[str, Any]:
    """Answer reconciliation queries, one search per query."""
    answer = {}
    for key, (kind, searched, limit) in read_queries(text).items():
        found = await musicbrainz.get(search_url(kind, searched, limit, 0))
        answer[key] = {"result": candidates(kind, found)}
    return answer


async def extended(musicbrainz: MusicBrainz, text: str) -> dict[str, Any]:
    """Answer a data extension request, one lookup per identifier."""
    ids, asked = read_extend(text)
    recognized = catalogue_recognizer() if "sameAs" in asked else None
    rows = {}
    for identifier in ids:
        kind, mbid = split_identifier(identifier)
        entity = await musicbrainz.get(lookup_url(kind, mbid))
        values = {"name": [{"str": named(kind, entity)["name"]}]}
        if recognized is not None:
            values["sameAs"] = same_as(entity, recognized)
        rows[identifier] = {name: values[name] for name in asked}
    return {
        "meta": [{"id": name, "name": PROPERTIES[name]} for name in asked],
        "rows": rows,
    }


async def answered(
    request: Request, answer: Callable[[MusicBrainz, dict[str, str]], Any]
) -> JSONResponse:
    """Run ``answer`` and turn a refusal or an upstream failure into JSON."""
    musicbrainz: MusicBrainz = request.app.state.musicbrainz
    try:
        body = await answer(musicbrainz, await parameters(request))
    except Refusal as refusal:
        return JSONResponse(
            {"detail": refusal.message}, status_code=refusal.status_code
        )
    except UpstreamError as error:
        return JSONResponse({"detail": str(error)}, status_code=502)
    return JSONResponse(body)


async def service(musicbrainz: MusicBrainz, given: dict[str, str]) -> Any:
    """Answer ``queries``, else ``extend``, else return the service manifest."""
    if "queries" in given:
        return await reconciled(musicbrainz, given["queries"])
    if "extend" in given:
        return await extended(musicbrainz, given["extend"])
    return MANIFEST


async def suggestions(musicbrainz: MusicBrainz, given: dict[str, str]) -> Any:
    """Suggest the entities of a type whose name ``prefix`` finds, ten from ``cursor``.

    Raises:
        Refusal: If ``prefix`` is blank, ``type`` is none of the service's
            types, or ``cursor`` is no integer of 0 or more.
    """
    prefix = given.get("prefix", "")
    if not prefix.strip():
        raise Refusal("prefix is required")
    kind = entity_type(given.get("type", DEFAULT_TYPE))
    cursor = cursor_of(given.get("cursor"))
    found = await musicbrainz.get(search_url(kind, prefix, SUGGEST_LIMIT, cursor))
    return {"result": [named(kind, entity) for entity in found[ENTITY_TYPES[kind]]]}


async def proposed(musicbrainz: MusicBrainz, given: dict[str, str]) -> Any:
    """Propose the properties of data extension for a type.

    Raises:
        Refusal: If ``type`` is none of the service's types.
    """
    kind = entity_type(given.get("type", DEFAULT_TYPE))
    return {
        "type": kind,
        "properties": [{"id": key, "name": name} for key, name in PROPERTIES.items()],
    }


# Routes ---------------------------------------------------------------------


@router.get(ENDPOINT)
async def service_get(request: Request) -> JSONResponse:
    """The manifest, or the answer to ``queries`` or ``extend``."""
    return await answered(request, service)


@router.post(ENDPOINT)
async def service_post(request: Request) -> JSONResponse:
    """The answer to a form's ``queries`` or ``extend``."""

    async def posted(musicbrainz: MusicBrainz, given: dict[str, str]) -> Any:
        """Answer a form that holds ``queries`` or ``extend``; refuse any other."""
        if "queries" not in given and "extend" not in given:
            raise Refusal("queries is no JSON object of queries")
        return await service(musicbrainz, given)

    return await answered(request, posted)


@router.get(f"{ENDPOINT}/suggest/entity")
async def suggest(request: Request) -> JSONResponse:
    """Entities whose name the prefix finds, ten from ``cursor``."""
    return await answered(request, suggestions)


@router.get(f"{ENDPOINT}/properties")
async def properties(request: Request) -> JSONResponse:
    """The properties of data extension for a type."""
    return await answered(request, proposed)
