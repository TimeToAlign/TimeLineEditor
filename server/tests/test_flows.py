"""The flow routes; the cases are derived in ``README.md``, "Flows"."""

from __future__ import annotations

import copy
import datetime
import importlib
import json
import struct
import sys
from importlib.metadata import version
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from refusals import assert_refused_in_timetoshares_words
from timetoshare import dumps, loads, validate
from timetoshare.validate import SCHEMA_VERSION, data_root

import tilie_server.app
import tilie_server.routers.flows
from tilie_server.app import create_app
from tilie_server.settings import ServerSettings

TOKEN = "test-token-0123456789"
HOST = "127.0.0.1"
PORT = 8765
AUTH = {"Authorization": f"Bearer {TOKEN}"}
FLOWS = "/api/flows"
FLOW_MAPS = "/api/flows/flow-maps"
ENGINE = "timetoalign.timelines.flow.engine"

FIXTURES = data_root() / "fixtures"
EXPECTED = FIXTURES / "flows" / SCHEMA_VERSION
"""TimeToShare's expected-flows files, each beside the trace it is derived by."""

NAMES = [
    "da_capo_al_fine",
    "dal_segno_al_coda",
    "loop",
    "ossia",
    "repairs",
    "repeat_end_and_dal_segno",
    "sections",
    "sonata_exposition",
    "virtual_cards",
    "volta_passes",
]
"""The expected-flows files."""

WRITTEN = [name for name in NAMES if name != "virtual_cards"]
"""The expected-flows files whose fixture holds no FlowMap of its own, so
that writing the flows gives exactly the expected ones."""

NUMBER_TYPES = {"loop": "float"}
"""The number type a file spells its values in where it is not ``fraction``."""

CONVENTIONS = ["default", "single", "printed"]

EDITOR = "https://example.org/people/editor"
OTHER = "https://example.org/people/other"

ATOMIC = {
    "statements": {"type": ["tts:AtomicSection"]},
    "provenance": [
        {
            "property": "rdf:type",
            "value": {"id": "tts:AtomicSection"},
            "method": "inferred",
        }
    ],
}
"""What a Region states beside its name and interval to be an atomic section."""

SAMPLES = {
    "timetoshare": SCHEMA_VERSION,
    "timelines": [
        {
            "id": "#take",
            "unit": "samples",
            "length": 100,
            "flow_control": [
                {
                    "id": "#jump_1",
                    "role": "jump",
                    "coordinate": 60,
                    "targets": [{"repeat_count": 1}],
                }
            ],
        }
    ],
}
"""A timeline on an integer axis whose one jump goes back to the start once."""


@pytest.fixture
def server(tmp_path: Path) -> TestClient:
    app = create_app(ServerSettings(HOST, PORT, TOKEN, tmp_path))
    return TestClient(app, base_url=f"http://{HOST}:{PORT}")


def expected(name: str) -> Any:
    """The expected-flows file ``name``."""
    return loads((EXPECTED / f"{name}.yaml").read_text(encoding="utf-8"))


def fixture(name: str, form: str = ".minimal") -> bytes:
    """A manifest fixture as it lies in the format's package: canonical YAML."""
    return (FIXTURES / SCHEMA_VERSION / f"{name}{form}.yaml").read_bytes()


def read(name: str, form: str = ".minimal") -> Any:
    return loads(fixture(name, form).decode("utf-8"))


def body(parameters: Any, manifest: bytes | Any) -> bytes:
    """The parameters as JSON behind their length, then the manifest's text."""
    text = json.dumps(parameters).encode("utf-8")
    if not isinstance(manifest, bytes):
        manifest = dumps(manifest).encode("utf-8")
    return struct.pack("<I", len(text)) + text + manifest


def post(server: TestClient, route: str, content: bytes, **headers: str) -> Any:
    return server.post(route, headers={**AUTH, **headers}, content=content)


def ask(
    server: TestClient,
    manifest: bytes | Any,
    timeline: str,
    route: str = FLOWS,
    **parameters: Any,
) -> Any:
    return post(server, route, body({"timeline": timeline, **parameters}, manifest))


def spelled(value: Any) -> str:
    """A JSON value with the kind of every number: ``0.0`` is not ``0``."""
    return json.dumps(value, sort_keys=True)


def joined(runs: list[list[Any]]) -> list[list[Any]]:
    """Runs, each joined to the one before where it begins at that one's end."""
    merged: list[list[Any]] = []
    for start, end in runs:
        if merged and spelled(merged[-1][1]) == spelled(start):
            merged[-1] = [merged[-1][0], end]
        else:
            merged.append([start, end])
    return merged


def refused(response: Any, path: list[Any], message: str) -> None:
    assert response.status_code == 422
    assert response.json() == {"detail": {"path": path, "message": message}}


# ------------------------------------------------------------------ the flows


def test_the_expected_flows_are_the_ten() -> None:
    assert sorted(path.stem for path in EXPECTED.glob("*.yaml")) == NAMES


@pytest.mark.parametrize("form", [".minimal", ""], ids=["minimal", "complete"])
@pytest.mark.parametrize("name", NAMES)
def test_a_fixture_answers_its_expected_flows(
    server: TestClient, name: str, form: str
) -> None:
    case = expected(name)
    assert case["manifest"] == f"flow/{name}"
    response = ask(server, fixture(case["manifest"], form), case["timeline"])
    assert response.status_code == 200
    answer = response.json()
    assert list(answer) == ["timeline", "number_type", "atomic_sections", "conventions"]
    assert answer["timeline"] == case["timeline"]
    assert answer["number_type"] == NUMBER_TYPES.get(name, "fraction")
    assert spelled(answer["atomic_sections"]) == spelled(case["atomic_sections"])
    assert list(answer["conventions"]) == CONVENTIONS
    for convention in CONVENTIONS:
        flow = answer["conventions"][convention]
        stated = case["conventions"][convention]
        assert flow["sections"] == stated["sections"], convention
        assert spelled(flow["runs"]) == spelled(joined(stated["runs"])), convention
        assert sorted(flow) == sorted(stated), convention
    for convention in CONVENTIONS:
        findings = answer["conventions"][convention]["findings"]
        assert spelled(
            [
                {key: value for key, value in finding.items() if key != "message"}
                for finding in findings
            ]
        ) == spelled(case["conventions"][convention]["findings"]), convention


def test_findings_are_answered_whole(server: TestClient) -> None:
    response = ask(server, fixture("flow/ossia"), "score")
    undetermined, ends, never = response.json()["conventions"]["default"]["findings"]
    assert list(undetermined) == ["kind", "coordinate", "message"]
    assert (undetermined["kind"], undetermined["coordinate"]) == (
        "undetermined_target",
        [4, 1],
    )
    assert "'jump_1'" in undetermined["message"]
    assert list(ends) == ["kind", "coordinate", "message"]
    assert (ends["kind"], ends["coordinate"]) == ("flow_ends_at_break", [16, 1])
    assert "'break_1'" in ends["message"]
    assert list(never) == ["kind", "coordinate", "end", "message"]
    assert (never["kind"], never["coordinate"], never["end"]) == (
        "never_played",
        [16, 1],
        [24, 1],
    )
    assert "[16, 24)" in never["message"]


@pytest.mark.parametrize("convention", CONVENTIONS)
def test_one_convention_is_answered_alone(server: TestClient, convention: str) -> None:
    whole = ask(server, fixture("flow/ossia"), "score").json()
    response = ask(server, fixture("flow/ossia"), "score", convention=convention)
    assert response.status_code == 200
    assert spelled(response.json()) == spelled(
        {**whole, "conventions": {convention: whole["conventions"][convention]}}
    )


@pytest.mark.parametrize("serialization", ["yaml", "json", "jcs"])
def test_an_integer_axis_is_answered_in_integers(
    server: TestClient, serialization: str
) -> None:
    manifest = dumps(SAMPLES, serialization).encode("utf-8")
    response = ask(server, manifest, "take")
    assert response.status_code == 200
    assert spelled(response.json()) == spelled(
        {
            "timeline": "take",
            "number_type": "int",
            "atomic_sections": [
                {"name": "A", "start": 0, "end": 60},
                {"name": "B", "start": 60, "end": 100},
            ],
            "conventions": {
                "default": {
                    "runs": [[0, 60], [0, 100]],
                    "sections": ["A", "A", "B"],
                    "findings": [],
                },
                "single": {"runs": [[0, 100]], "sections": ["A", "B"], "findings": []},
                "printed": {"runs": [[0, 100]], "sections": ["A", "B"], "findings": []},
            },
        }
    )


@pytest.mark.parametrize(
    ("timeline", "length"), [("set", [20, 1]), ("second", [12, 1])]
)
def test_a_timeline_without_flow_control_is_one_run(
    server: TestClient, timeline: str, length: list[int]
) -> None:
    response = ask(server, fixture("flow/flow_map_by_hand"), timeline)
    assert response.status_code == 200
    once = {"runs": [[[0, 1], length]], "sections": ["A"], "findings": []}
    assert spelled(response.json()) == spelled(
        {
            "timeline": timeline,
            "number_type": "fraction",
            "atomic_sections": [{"name": "A", "start": [0, 1], "end": length}],
            "conventions": {
                "default": once,
                "single": once,
                "printed": once,
            },
        }
    )


def test_a_child_is_played_on_its_own_axis(server: TestClient) -> None:
    response = ask(server, fixture("child_jumps"), "verse")
    assert response.status_code == 200
    once = {"runs": [[[0, 1], [8, 1]]], "sections": ["A", "B", "C"], "findings": []}
    assert spelled(response.json()) == spelled(
        {
            "timeline": "verse",
            "number_type": "fraction",
            "atomic_sections": [
                {"name": "A", "start": [0, 1], "end": [2, 1]},
                {"name": "B", "start": [2, 1], "end": [4, 1]},
                {"name": "C", "start": [4, 1], "end": [8, 1]},
            ],
            "conventions": {
                "default": {
                    "runs": [
                        [[0, 1], [4, 1]],
                        [[0, 1], [4, 1]],
                        [[0, 1], [8, 1]],
                        [[2, 1], [8, 1]],
                    ],
                    "sections": ["A", "B", "A", "B", "A", "B", "C", "B", "C"],
                    "findings": [],
                },
                "single": once,
                "printed": once,
            },
        }
    )


def test_a_believer_who_rejects_as_the_fixture_does_answers_its_flows(
    server: TestClient,
) -> None:
    plain = ask(server, fixture("flow/repairs"), "score")
    believed = ask(server, fixture("flow/repairs"), "score", believer=EDITOR)
    assert believed.status_code == 200
    assert believed.content == plain.content


def test_the_states_read_for_a_believer_decide_what_is_played(
    server: TestClient,
) -> None:
    plain = ask(server, fixture("flow/repairs"), "score")
    kept = ["true", "unlikely"]
    believed = ask(
        server, fixture("flow/repairs"), "score", believer=EDITOR, beliefs=kept
    )
    assert believed.status_code == 200
    assert believed.content == plain.content
    unread = ask(server, fixture("flow/repairs"), "score", believer=OTHER, beliefs=kept)
    assert unread.status_code == 200
    whole = {"runs": [[[0, 1], [16, 1]]], "sections": ["A"], "findings": []}
    assert unread.json() == {
        "timeline": "score",
        "number_type": "fraction",
        "atomic_sections": [{"name": "A", "start": [0, 1], "end": [16, 1]}],
        "conventions": {
            "default": whole,
            "single": whole,
            "printed": whole,
        },
    }


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
def test_a_believer_who_rejects_nothing_reads_two_jumps_at_one_place(
    server: TestClient, route: str
) -> None:
    response = ask(server, fixture("flow/repairs"), "score", route, believer=OTHER)
    assert_refused_in_timetoshares_words(
        response, ["timeline"], ["'jump_1'", "'jump_2'", "16"]
    )


def test_two_requests_answer_the_same(server: TestClient) -> None:
    for route in (FLOWS, FLOW_MAPS):
        first = ask(server, fixture("flow/volta_passes"), "score", route)
        second = ask(server, fixture("flow/volta_passes"), "score", route)
        assert first.status_code == 200
        assert first.content == second.content


# ------------------------------------------------------------------- refusals


@pytest.mark.parametrize(
    ("parameters", "path", "message"),
    [
        ({}, ["timeline"], "the parameter 'timeline' is missing"),
        (
            {"timeline": "score", "note": "x"},
            ["note"],
            "'note' is no parameter of this route",
        ),
        ({"timeline": 7}, ["timeline"], "the parameter 'timeline' is no timeline ID"),
        (
            {"timeline": "nothing"},
            ["timeline"],
            "the manifest has no timeline 'nothing'",
        ),
        ({"timeline": "#score"}, ["timeline"], "the manifest has no timeline '#score'"),
        (
            {"timeline": "virtual_1"},
            ["timeline"],
            "the manifest has no timeline 'virtual_1'",
        ),
        (
            {"timeline": "score", "convention": "twice"},
            ["convention"],
            "the parameter 'convention' is none of 'default', 'single', 'printed'",
        ),
        (
            {"timeline": "score", "convention": 7},
            ["convention"],
            "the parameter 'convention' is none of 'default', 'single', 'printed'",
        ),
        (
            {"timeline": "score", "believer": 7},
            ["believer"],
            "the parameter 'believer' is no actor",
        ),
        (
            {"timeline": "score", "beliefs": ["true"]},
            ["beliefs"],
            "the parameter 'beliefs' needs a 'believer'",
        ),
        (
            {"timeline": "score", "believer": "a:b", "beliefs": "true"},
            ["beliefs"],
            "the parameter 'beliefs' is no list of belief states",
        ),
        (
            {"timeline": "score", "believer": "a:b", "beliefs": ["maybe"]},
            ["beliefs"],
            "the parameter 'beliefs' is no list of belief states",
        ),
        (
            {"timeline": "score", "believer": "a:b", "beliefs": [1]},
            ["beliefs"],
            "the parameter 'beliefs' is no list of belief states",
        ),
    ],
    ids=[
        "no timeline",
        "unknown parameter",
        "timeline no string",
        "unknown timeline",
        "file-form ID",
        "virtual timeline",
        "unknown convention",
        "convention no string",
        "believer no string",
        "beliefs without believer",
        "beliefs a string",
        "beliefs unknown state",
        "beliefs no string",
    ],
)
def test_a_parameter_is_refused_at_its_name(
    server: TestClient, parameters: dict[str, Any], path: list[Any], message: str
) -> None:
    content = body(parameters, fixture("flow/sonata_exposition"))
    refused(post(server, FLOWS, content), path, message)


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"\x00\x00", "the body does not start with the parameters' length"),
        (
            struct.pack("<I", 100) + b"0123456789",
            "the body states parameters of 100 bytes and holds 10",
        ),
        (struct.pack("<I", 3) + b"[1]", "the parameters are no JSON object"),
        (struct.pack("<I", 1) + b"{", "the parameters are no JSON text"),
        (body({"timeline": "score"}, b"\xff"), "the manifest is not UTF-8 text"),
        (body({"timeline": "score"}, b"[]"), "the manifest is not an object"),
    ],
    ids=["two bytes", "short", "list", "no JSON", "no UTF-8", "manifest a list"],
)
def test_a_body_of_another_form_is_refused(
    server: TestClient, route: str, content: bytes, message: str
) -> None:
    refused(post(server, route, content), [], message)


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
def test_a_manifest_the_schema_refuses_is_refused_at_its_path(
    server: TestClient, route: str
) -> None:
    manifest = read("flow/volta_passes")
    del manifest["timelines"][0]["unit"]
    response = ask(server, manifest, "score", route)
    assert_refused_in_timetoshares_words(response, ["timelines", 0], ["unit"])


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
def test_a_destination_naming_nothing_is_refused_at_its_path(
    server: TestClient, route: str
) -> None:
    manifest = read("flow/volta_passes")
    flow_control = manifest["timelines"][0]["flow_control"]
    ((at, element, target),) = [
        (at, element, target)
        for at, element in enumerate(flow_control)
        for target, destination in enumerate(element.get("targets", []))
        if "to" in destination
    ][:1]
    element["targets"][target]["to"] = "#nothing"
    response = ask(server, manifest, "score", route)
    assert_refused_in_timetoshares_words(
        response,
        ["timelines", 0, "flow_control", at, "targets", target, "to"],
        ["'nothing'"],
    )


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
def test_an_unknown_length_is_refused(server: TestClient, route: str) -> None:
    manifest = read("flow/repairs")
    manifest["timelines"][0]["length"] = None
    response = ask(server, manifest, "score", route)
    assert_refused_in_timetoshares_words(response, ["timeline"], ["'score'", "unknown"])


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
def test_the_routes_need_the_token(server: TestClient, route: str) -> None:
    content = body({"timeline": "score"}, fixture("flow/repairs"))
    response = server.post(route, content=content)
    assert response.status_code == 401
    assert response.json() == {"detail": "missing or invalid token"}


# --------------------------------------------------------- the manifest written


def written(
    server: TestClient, manifest: bytes | Any, timeline: str, **parameters: Any
) -> Any:
    """The answer of the writing route, read as a manifest file."""
    response = ask(server, manifest, timeline, FLOW_MAPS, **parameters)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    return loads(response.content.decode("utf-8"))


def named_chunks(manifest: Any, timeline: str) -> list[tuple[str, list[str]]]:
    """Each FlowMap's convention and its chunks as the names of their Regions."""
    (root,) = [root for root in manifest["timelines"] if root["id"] == f"#{timeline}"]
    names = {region["id"]: region["name"] for region in root["regions"]}
    return [
        (flow_map["convention"], [names[chunk] for chunk in flow_map["chunks"]])
        for flow_map in manifest["flow_maps"]
        if flow_map["timeline"] == root["id"]
    ]


def intervals(manifest: Any, timeline: str) -> list[dict[str, Any]]:
    """The Regions of a root timeline as atomic sections: name, start, end."""
    (root,) = [root for root in manifest["timelines"] if root["id"] == f"#{timeline}"]
    return [
        {"name": region["name"], "start": region["start"], "end": region["end"]}
        for region in root["regions"]
    ]


@pytest.mark.parametrize("name", WRITTEN)
def test_a_fixture_is_answered_with_its_expected_flows_written(
    server: TestClient, name: str
) -> None:
    case = expected(name)
    timeline = case["timeline"]
    posted = read(case["manifest"])
    answer = written(server, fixture(case["manifest"]), timeline)
    validate(answer)

    assert spelled(intervals(answer, timeline)) == spelled(case["atomic_sections"])
    (root,) = [root for root in answer["timelines"] if root["id"] == f"#{timeline}"]
    for region in root["regions"]:
        assert {key: region[key] for key in ATOMIC} == ATOMIC

    stated = case["conventions"]
    assert named_chunks(answer, timeline) == [
        (convention, stated[convention]["sections"])
        for convention in CONVENTIONS
        if convention == "default"
        or stated[convention]["sections"] != stated["default"]["sections"]
    ]
    assert len(answer["flow_maps"]) == len(named_chunks(answer, timeline))

    def without_flows(manifest: Any) -> tuple[Any, Any]:
        """A manifest's ``@context``, and the manifest without it, its
        FlowMaps and the timeline's Regions."""
        rest = copy.deepcopy(manifest)
        context = rest.pop("@context")
        rest.pop("flow_maps", None)
        for entry in rest["timelines"]:
            if entry["id"] == f"#{timeline}":
                entry.pop("regions", None)
        return context, rest

    context, rest = without_flows(answer)
    before, kept = without_flows(posted)
    assert spelled(rest) == spelled(kept)
    assert {key: context[key] for key in before} == before


def test_ossia_has_no_single_flow_map(server: TestClient) -> None:
    answer = written(server, fixture("flow/ossia"), "score")
    assert [flow_map["convention"] for flow_map in answer["flow_maps"]] == [
        "default",
        "printed",
    ]


def test_the_sonata_exposition_answers_itself(server: TestClient) -> None:
    whole = read("flow/sonata_exposition")
    answer = written(server, fixture("flow/sonata_exposition"), "score")
    assert spelled(answer) == spelled(whole)


def test_the_sonata_exposition_is_written_from_nothing_as_its_fixture_states_it(
    server: TestClient,
) -> None:
    whole = read("flow/sonata_exposition")
    emptied = copy.deepcopy(whole)
    del emptied["timelines"][0]["regions"]
    del emptied["flow_maps"]
    del emptied["virtual_timelines"]
    del whole["virtual_timelines"]
    answer = written(server, emptied, "score")
    assert spelled(answer) == spelled(whole)
    assert named_chunks(whole, "score") == [
        ("default", ["A", "B", "A", "C"]),
        ("single", ["A", "C"]),
        ("printed", ["A", "B", "C"]),
    ]


def divided() -> Any:
    """``flow/sonata_exposition`` with a jump target at 4, which divides its
    first atomic section; the target stands first, where canonical order has it."""
    manifest = read("flow/sonata_exposition")
    manifest["timelines"][0]["flow_control"].insert(
        0, {"id": "#jump_target_2", "role": "jump_target", "coordinate": [4, 1]}
    )
    return manifest


def section(
    region: int, name: str, start: int, end: int, beliefs: list[Any] | None = None
) -> dict[str, Any]:
    """A Region as an atomic section is stated, with the beliefs in its type."""
    (entry,) = ATOMIC["provenance"]
    return {
        "id": f"#region_{region}",
        "name": name,
        "start": [start, 1],
        "end": [end, 1],
        "statements": ATOMIC["statements"],
        "provenance": [entry if beliefs is None else {**entry, "beliefs": beliefs}],
    }


def flow_map(number: int, convention: str, regions: list[int]) -> dict[str, Any]:
    """A computed FlowMap of ``score`` listing Regions by their numbers."""
    return {
        "id": f"#flow_map_{number}",
        "timeline": "#score",
        "convention": convention,
        "chunks": [f"#region_{region}" for region in regions],
        "provenance": [{"method": "inferred"}],
    }


def test_a_section_that_is_none_any_more_needs_the_actor(server: TestClient) -> None:
    response = ask(server, divided(), "score", FLOW_MAPS)
    assert_refused_in_timetoshares_words(
        response, ["timeline"], ["'score'", "region_1", "actor"]
    )


def test_flows_written_before_are_written_again(server: TestClient) -> None:
    posted = divided()
    answer = written(server, posted, "score", actor=EDITOR, date="2026-11-26")
    validate(answer)
    (root,) = answer["timelines"]
    rejecting = [{"actor": EDITOR, "belief": "false", "date": "2026-11-26"}]
    assert spelled(root["regions"]) == spelled(
        [
            section(4, "A", 0, 4),
            section(1, "A", 0, 12, rejecting),
            section(5, "B", 4, 12),
            section(2, "C", 12, 16),
            section(3, "D", 16, 24),
        ]
    )
    assert spelled(answer["flow_maps"]) == spelled(
        [
            flow_map(1, "default", [4, 5, 2, 4, 5, 3]),
            flow_map(2, "single", [4, 5, 3]),
            flow_map(3, "printed", [4, 5, 2, 3]),
        ]
    )
    assert answer["virtual_timelines"][0]["length"] == [36, 1]
    for manifest in (answer, posted):
        del manifest["flow_maps"]
        del manifest["timelines"][0]["regions"]
    assert spelled(answer) == spelled(posted)


def test_without_a_date_the_belief_is_of_the_servers_day(server: TestClient) -> None:
    before = datetime.date.today().isoformat()
    answer = written(server, divided(), "score", actor=EDITOR)
    after = datetime.date.today().isoformat()
    (entry,) = answer["timelines"][0]["regions"][1]["provenance"]
    (belief,) = entry["beliefs"]
    assert {key: belief[key] for key in ("actor", "belief")} == {
        "actor": EDITOR,
        "belief": "false",
    }
    assert belief["date"] in {before, after}


def test_where_no_section_is_rejected_no_belief_is_written(server: TestClient) -> None:
    answer = written(
        server,
        fixture("flow/sonata_exposition"),
        "score",
        actor=EDITOR,
        date="2026-11-26",
    )
    assert spelled(answer) == spelled(read("flow/sonata_exposition"))


@pytest.mark.parametrize(
    ("parameters", "path", "message"),
    [
        ({"actor": ""}, ["actor"], "an actor is named by a non-empty string"),
        ({"actor": 7}, ["actor"], "an actor is named by a non-empty string"),
        ({"date": 7}, ["date"], "a date is a string written YYYY-MM-DD"),
    ],
    ids=["empty actor", "actor no string", "date no string"],
)
def test_who_asks_and_when_are_refused_at_their_names(
    server: TestClient, parameters: dict[str, Any], path: list[Any], message: str
) -> None:
    refused(ask(server, divided(), "score", FLOW_MAPS, **parameters), path, message)


def test_a_date_that_is_no_calendar_date_is_refused(server: TestClient) -> None:
    response = ask(
        server, divided(), "score", FLOW_MAPS, actor=EDITOR, date="2026-13-26"
    )
    assert_refused_in_timetoshares_words(response, ["date"], ["'2026-13-26'"])


def test_the_complete_form_answers_as_the_minimal_form(server: TestClient) -> None:
    minimal = ask(server, fixture("flow/da_capo_al_fine"), "score", FLOW_MAPS)
    complete = ask(server, fixture("flow/da_capo_al_fine", ""), "score", FLOW_MAPS)
    assert complete.status_code == 200
    assert complete.content == minimal.content


def test_a_timeline_without_flow_control_has_nothing_written(
    server: TestClient,
) -> None:
    answer = written(server, fixture("flow/flow_map_by_hand"), "set")
    assert spelled(answer) == spelled(read("flow/flow_map_by_hand"))


def test_a_childs_flows_are_written_on_the_child_and_its_root(
    server: TestClient,
) -> None:
    posted = read("child_jumps")
    answer = written(server, fixture("child_jumps"), "verse")
    validate(answer)
    (root,) = answer["timelines"]
    (child,) = root["children"]
    assert spelled(child["regions"]) == spelled(
        [section(1, "A", 0, 2), section(2, "B", 2, 4), section(3, "C", 4, 8)]
    )
    assert "regions" not in root
    assert spelled(answer["flow_maps"]) == spelled(
        [
            {
                **flow_map(number, convention, regions),
                "timeline": "#piece",
                "name": f"Verse, {convention}",
            }
            for number, convention, regions in [
                (1, "default", [1, 2, 1, 2, 1, 2, 3, 2, 3]),
                (2, "single", [1, 2, 3]),
                (3, "printed", [1, 2, 3]),
            ]
        ]
    )
    posted_context = posted.pop("@context")
    answer_context = answer.pop("@context")
    assert posted_context.items() <= answer_context.items()
    del answer["flow_maps"]
    del child["regions"]
    assert spelled(answer) == spelled(posted)


@pytest.mark.parametrize(
    ("parameters", "path", "message"),
    [
        (
            {"timeline": "score", "convention": "default"},
            ["convention"],
            "'convention' is no parameter of this route",
        ),
        (
            {"timeline": "nothing"},
            ["timeline"],
            "the manifest has no timeline 'nothing'",
        ),
    ],
    ids=["convention", "unknown timeline"],
)
def test_the_writing_route_refuses_a_parameter_at_its_name(
    server: TestClient, parameters: dict[str, Any], path: list[Any], message: str
) -> None:
    content = body(parameters, fixture("flow/volta_passes"))
    refused(post(server, FLOW_MAPS, content), path, message)


# ------------------------------------------------- a timetoalign without flows


@pytest.mark.parametrize("route", [FLOWS, FLOW_MAPS])
@pytest.mark.parametrize(
    "content",
    [body({"timeline": "score"}, fixture("flow/repairs")), b"", b"\x00"],
    ids=["fixture", "empty", "one byte"],
)
def test_without_the_engine_the_server_starts_and_the_routes_say_so(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    route: str,
    content: bytes,
    installed_health: dict[str, str | bool | None],
) -> None:
    # A None entry makes every import of the module raise ImportError.
    monkeypatch.setitem(sys.modules, ENGINE, None)
    importlib.reload(tilie_server.routers.flows)
    app = importlib.reload(tilie_server.app).create_app(
        ServerSettings(HOST, PORT, TOKEN, tmp_path)
    )
    server = TestClient(app, base_url=f"http://{HOST}:{PORT}")

    health = server.get("/api/health", headers=AUTH)
    assert health.status_code == 200
    assert health.json() == installed_health
    response = post(server, route, content)
    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "path": [],
            "message": f"the installed timetoalign {version('timetoalign')} "
            "cannot play flow control",
        }
    }
