"""The flow routes: a timeline's flow control played, and its flows written.

A manifest states where the flow of a timeline jumps and breaks (its flow
control); in which order its stretches are then played is computed, and the
computation is timetoalign's alone. The editor asks for the flows of one
timeline (``POST /api/flows``): its atomic sections, and for each convention
the runs played, the sections they cover and what playing found, each
finding with its cause where timetoalign names one. When its user wants
those flows in the manifest, it asks for the manifest with them written
(``POST /api/flows/flow-maps``): the atomic sections as Regions of the
timeline and the computed FlowMaps. A manifest that holds flows written
before is written again: a Region whose stretch is an atomic section no
longer stays and is rejected as one, which needs the actor who asks. The
server stores nothing; what is done with either answer is the editor's.

Both requests are a JSON object of parameters behind its length, as the
MatchClaim provenance routes take them, followed by the manifest file's
text, in any serialization timetoshare reads, to the end of the body. The
manifest is read whole by timetoalign, which checks it as a manifest reader
does, before the timeline is looked for.

timetoalign's engine and what reads a posted manifest for it are imported
when a request needs them, so a server whose installed timetoalign cannot
play flow control still starts and answers every other route; these routes
then answer 501.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from importlib.metadata import version
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from tilie_server.manifests import PostedBody, Refusal, read_manifest
from tilie_server.routers.claim_provenance import (
    checked_actor,
    checked_date,
    split_parameters,
)
from tilie_server.settings import API_PREFIX

router = APIRouter()

REQUIRED_PARAMETERS = ("timeline",)
"""The parameter both routes require."""

FLOWS_PARAMETERS = ("convention", "believer", "beliefs")
"""The parameters the computing route takes besides, each optional."""

WRITING_PARAMETERS = ("believer", "beliefs", "actor", "date")
"""The parameters the writing route takes besides, each optional."""

MANIFEST_MEDIA_TYPE = "application/json"
"""The media type of the writing route's answer, a manifest file in JSON."""


def flow_engine() -> tuple[Callable[..., Any], Callable[..., Any]]:
    """Return timetoalign's ``play`` and ``atomic_sections``.

    Raises:
        Refusal: 501, if the installed timetoalign has no flow engine.
    """
    try:
        from timetoalign.timelines.flow.engine import atomic_sections, play
    except ImportError as error:
        message = (
            f"the installed timetoalign {version('timetoalign')} cannot play "
            "flow control"
        )
        raise Refusal([], message, status_code=501) from error
    return play, atomic_sections


def asked_reading(parameters: Mapping[str, Any]) -> dict[str, Any]:
    """Whose beliefs decide which elements are read, where a request says so.

    ``believer`` is an actor, compared as timetoalign's engine compares it
    with the actors of the elements' beliefs as the manifest writes them;
    ``beliefs`` the belief states read for it (``true``, ``undecided``,
    ``unlikely``, ``false``), every state but ``false`` without it. An
    element is read when the believer's state in it, ``undecided`` where
    they hold no belief, is one of them; without a believer, when no actor
    rejects it.

    Returns:
        The keyword arguments of timetoalign's ``play``,
        ``atomic_sections`` and ``create_flow_maps_from_flow_control`` that
        say so: none without a believer.

    Raises:
        Refusal: 422 at ``["believer"]`` if the believer is no string; at
            ``["beliefs"]`` if the states are no list of belief states, or
            are given without a believer.
    """
    from timetoshare import BELIEF_STATES

    reading: dict[str, Any] = {}
    if "believer" in parameters:
        believer = parameters["believer"]
        if not isinstance(believer, str):
            raise Refusal(["believer"], "the parameter 'believer' is no actor")
        reading["believer"] = believer
    if "beliefs" in parameters:
        if "believer" not in reading:
            raise Refusal(["beliefs"], "the parameter 'beliefs' needs a 'believer'")
        beliefs = parameters["beliefs"]
        if not isinstance(beliefs, list) or not all(
            isinstance(state, str) and state in BELIEF_STATES for state in beliefs
        ):
            raise Refusal(
                ["beliefs"], "the parameter 'beliefs' is no list of belief states"
            )
        reading["beliefs"] = frozenset(beliefs)
    return reading


def asked_rejection(parameters: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """Who asks for the flows to be written, and on which day, where a request says so.

    Returns:
        The actor whose belief rejects the atomic sections that are none any
        more, and the day of that belief (``YYYY-MM-DD``); None for each the
        request leaves out.

    Raises:
        Refusal: 422 at ``["actor"]`` if the actor is no non-empty string, at
            ``["date"]`` if the date is no calendar date written
            ``YYYY-MM-DD``.
    """
    actor = checked_actor(parameters["actor"]) if "actor" in parameters else None
    date = checked_date(parameters["date"]) if "date" in parameters else None
    return actor, date


def asked_conventions(parameters: Mapping[str, Any]) -> list[Any]:
    """The conventions to answer: the one named, else all, in timetoalign's order.

    Raises:
        Refusal: 422 at ``["convention"]`` if the parameter names none.
    """
    from timetoalign.core import FlowConvention

    if "convention" not in parameters:
        return list(FlowConvention)
    named = parameters["convention"]
    known = [convention.value for convention in FlowConvention]
    if not isinstance(named, str) or named not in known:
        listed = ", ".join(f"'{name}'" for name in known)
        raise Refusal(["convention"], f"the parameter 'convention' is none of {listed}")
    return [FlowConvention(named)]


def read_request(
    body: bytes, optional: tuple[str, ...]
) -> tuple[dict[str, Any], Any, Any]:
    """The parameters of a request and its manifest, as its file writes it
    (IDs ``#id``) and with every ID made bare.

    Args:
        body: The parameters' length in bytes (a little-endian 32-bit
            integer), the parameters as a JSON object in UTF-8, then the
            manifest file's text.
        optional: The parameters the route takes besides ``timeline``.

    Raises:
        Refusal: As :func:`tilie_server.routers.claim_provenance.split_parameters`
            and :func:`tilie_server.manifests.read_manifest`.
    """
    parameters, rest = split_parameters(body, REQUIRED_PARAMETERS, optional)
    manifest, bare = read_manifest(rest, "the manifest")
    return parameters, manifest, bare


def asked_timeline(
    parameters: Mapping[str, Any], manifest: Mapping[str, Any], bare: Mapping[str, Any]
) -> tuple[Any, Any]:
    """The timeline a request names, as timetoalign reads it in its manifest.

    Args:
        parameters: The request's parameters; ``timeline`` is a bare ID.
        manifest: The manifest as its file writes it (IDs ``#id``).
        bare: The same manifest with every ID made bare.

    Returns:
        The bundle timetoalign reads the manifest into, and the timeline
        in it.

    Raises:
        Refusal: 422 at ``["timeline"]`` if the parameter is no string or
            names no timeline of the manifest, at any depth; as
            :func:`tilie_server.claim_columns.manifest_bundle` if
            timetoalign refuses the manifest.
    """
    from timetoshare.validation.diagnostics import timelines_by_id

    from tilie_server.claim_columns import manifest_bundle

    asked = parameters["timeline"]
    if not isinstance(asked, str):
        raise Refusal(["timeline"], "the parameter 'timeline' is no timeline ID")
    bundle = manifest_bundle(manifest)
    if asked not in timelines_by_id(bare):
        raise Refusal(["timeline"], f"the manifest has no timeline '{asked}'")
    return bundle, bundle.get_timeline(asked)


def flows_answer(body: bytes) -> dict[str, Any]:
    """The flows of the timeline a request names.

    Returns:
        ``{"timeline", "number_type", "atomic_sections", "conventions"}``,
        the timeline's bare ID and number type; its atomic sections in the
        order of the axis, each ``{"name", "start", "end"}``; and under each
        convention answered ``{"runs", "sections"}``, the runs played as
        ``[start, end]`` pairs (stretches played one after the other without
        a jump between them are one run) and the names of the atomic
        sections they cover, in the order played, and ``findings``, what
        playing found, each ``{"kind", "coordinate", "message"}`` with the
        ``end`` of a stretch never played and, where timetoalign names one,
        the ``cause`` (``single_playback``: a stretch the ``single`` flow
        leaves out that the ``default`` flow plays); ``printed`` finds
        nothing. Every value on the axis is
        written as a manifest writes a value on the timeline's own axis: an
        integer, a number or a ``[numerator, denominator]`` pair, as the
        number type says. A timeline without flow control answers one
        section and one run over its whole length.

    Raises:
        Refusal: 501 as :func:`flow_engine`; 422 as :func:`read_request`,
            :func:`asked_conventions`, :func:`asked_reading` and
            :func:`asked_timeline`; 422 at ``["timeline"]`` with timetoalign's
            message if the timeline's length is unknown or its flow control
            cannot be played.
    """
    play, atomic_sections = flow_engine()
    from timetoalign.core import number_to_json
    from timetoalign.timelines import UnknownLengthError

    parameters, manifest, bare = read_request(body, FLOWS_PARAMETERS)
    conventions = asked_conventions(parameters)
    reading = asked_reading(parameters)
    _, timeline = asked_timeline(parameters, manifest, bare)

    def on_axis(coordinate: Any) -> Any:
        """The JSON form of a coordinate's value on the timeline's axis."""
        return number_to_json(coordinate.value)

    try:
        if timeline.length is None:
            raise UnknownLengthError(timeline.id, "play its flow control")
        registry, length = timeline.flow_control, timeline.length
        sections = atomic_sections(registry, length, **reading)
        flows = {
            convention: play(registry, length, convention=convention, **reading)
            for convention in conventions
        }
    except ValueError as error:
        raise Refusal(["timeline"], str(error)) from error

    def answered(convention: Any) -> dict[str, Any]:
        """The answer for one convention: its runs, sections and findings."""
        flow = flows[convention]
        return {
            "runs": [[on_axis(run.start), on_axis(run.end)] for run in flow.runs],
            "sections": [
                section.name
                for run in flow.runs
                for section in sections
                if run.start <= section.start and section.end <= run.end
            ],
            "findings": [
                {
                    "kind": finding.kind.value,
                    "coordinate": on_axis(finding.coordinate),
                    **({} if finding.end is None else {"end": on_axis(finding.end)}),
                    **({} if finding.cause is None else {"cause": finding.cause.value}),
                    "message": finding.message,
                }
                for finding in flow.findings
            ],
        }

    return {
        "timeline": timeline.id,
        "number_type": timeline.number_type.name,
        "atomic_sections": [
            {
                "name": section.name,
                "start": on_axis(section.start),
                "end": on_axis(section.end),
            }
            for section in sections
        ],
        "conventions": {
            convention.value: answered(convention) for convention in conventions
        },
    }


def written_manifest(body: bytes) -> str:
    """The manifest of a request with the flows of the timeline it names written.

    Returns:
        A manifest file's text in timetoshare's JSON serialization, the
        manifest as timetoalign writes it, in the minimal form, after
        writing the timeline's atomic sections as Regions and its computed
        FlowMaps. A child timeline's Regions are written on the child and
        its FlowMaps on the root of its tree, which a FlowMap names. A
        timeline without flow control has nothing written. Where
        the manifest holds flows written before, an atomic section whose
        stretch is still one keeps its Region, a new stretch gets a new
        Region, and a Region whose stretch is none any more stays, with the
        belief ``false`` of the request's ``actor`` on the request's
        ``date`` (the server's day without one) in its type statement; the
        computed FlowMaps keep their IDs and list the sections standing now.
        The Regions and FlowMaps written anew get random IDs, minted in that
        order from one seed: ``seed_from`` of the manifest as timetoalign
        writes it before the call (its minimal JSON text), the timeline's
        ID, ``believer`` and ``beliefs`` (``None`` where not given), so one
        request is answered alike in either form of its manifest and on
        every asking.

    Raises:
        Refusal: 501 as :func:`flow_engine`; 422 as :func:`read_request`,
            :func:`asked_reading`, :func:`asked_rejection` and
            :func:`asked_timeline`; 422 at ``["timeline"]`` with
            timetoalign's message if it does not write the flows: the
            timeline's length is unknown, its flow control
            cannot be played, or it holds an atomic section that is none any
            more and the request names no ``actor`` to reject it.
    """
    flow_engine()
    from timetoalign.core.ids import seed_from
    from timetoshare import dumps

    parameters, manifest, bare = read_request(body, WRITING_PARAMETERS)
    reading = asked_reading(parameters)
    actor, date = asked_rejection(parameters)
    bundle, timeline = asked_timeline(parameters, manifest, bare)
    # The IDs written anew are seeded by what decides the flows: the manifest as
    # timetoalign reads it, the timeline and the reading. One request is answered
    # alike in either form of its manifest and whatever the process answered
    # before; another reading, which may cut other sections, mints other IDs.
    seed = seed_from(
        dumps(bundle.to_dict(), "json"),
        timeline.id,
        parameters.get("believer"),
        parameters.get("beliefs"),
    )
    try:
        timeline.create_flow_maps_from_flow_control(
            actor=actor, date=date, seed=seed, **reading
        )
    except ValueError as error:
        raise Refusal(["timeline"], str(error)) from error
    return dumps(bundle.to_dict(), "json")


@router.post(f"{API_PREFIX}flows")
def flows(body: PostedBody) -> Response:
    """Answer the flows of one timeline of the posted manifest.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"timeline": <bare ID>, "convention"?:
    "default" | "single" | "printed", "believer"?: <actor>, "beliefs"?:
    [<belief state>, …]}`` as JSON, then the manifest file's text: the
    elements read are those whose state for ``believer`` is one of
    ``beliefs`` (every state but ``false`` without it), or, without a
    believer, those no actor rejects. The answer is JSON (:func:`flows_answer`),
    with all three conventions where none is named. A request that cannot
    be answered is answered 422 with ``{"detail": {"path", "message"}}``, a
    parameter's at its name; a timetoalign that cannot play flow control,
    501.
    """
    try:
        answer = flows_answer(body)
    except Refusal as refusal:
        return refusal.response()
    return JSONResponse(answer)


@router.post(f"{API_PREFIX}flows/flow-maps")
def flow_maps(body: PostedBody) -> Response:
    """Answer the posted manifest with the flows of one timeline written.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"timeline": <bare ID>, "believer"?:
    <actor>, "beliefs"?: [<belief state>, …], "actor"?: <actor>, "date"?:
    "YYYY-MM-DD"}`` as JSON, then the manifest file's text; ``believer``
    and ``beliefs`` read the elements as the computing route does.
    ``actor`` is who asks: the one whose belief rejects an atomic section
    written before that is none any more, on ``date``. The answer is a
    manifest file in JSON (:func:`written_manifest`); nothing is stored.
    Refusals answer as the computing route's.
    """
    try:
        text = written_manifest(body)
    except Refusal as refusal:
        return refusal.response()
    return Response(text, media_type=MANIFEST_MEDIA_TYPE)
