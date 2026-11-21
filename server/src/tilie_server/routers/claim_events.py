"""The MatchClaims' events: what each side of given MatchClaims names.

The editor holds a package's MatchClaim table and, where the manifest names
one, its Projections table, for its session only. To show a MatchClaim it
asks the server for the events on its two sides
(``POST /api/match-claims/events``): each side's timeline, event ID and
event name as the MatchClaim table states them, the MatchClaim's certainty
and whether it states synchrony, and, where a side's event is a Projection
of the posted Projections table, the event that Projection stands for. The
repository's ``decisions/0032-match-claim-events.md`` fixes the route.

The request is the parameters behind their length, as the provenance
routes take them (``{"claims": [<MatchClaim ID>, …]}``), then the
Projections table behind its length (zero bytes for none), then the body of
``POST /api/match-claims`` unchanged. Both tables are checked against the
manifest by TimeToShare's table checks; timetoalign reads them.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from importlib.metadata import version
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from tilie_server.manifests import Refusal, read_manifest
from tilie_server.routers.claim_provenance import claim_rows, row_of, split_parameters
from tilie_server.routers.match_claims import (
    PREFIX,
    checked_table,
    split_body,
    table_reader,
)
from tilie_server.settings import API_PREFIX

router = APIRouter()

EVENTS_PARAMETERS = ("claims",)
"""The parameters of the events route."""

SIDE_COLUMNS = ("timeline_{}_id", "event_{}_id", "event_{}_name")
"""The MatchClaim table's columns of one side, ``{}`` the side's letter."""


def projection_model() -> Callable[[Mapping[str, Any] | None], Any]:
    """Return timetoalign's reader of the event a Projection stands for
    (``EventReference.from_row``, the reader of a Projections table's
    ``projection_of`` cell).

    The route answers that event alone, so it reads no Projection's
    position: the table's checks have accepted every position.

    Raises:
        Refusal: 501, if the installed timetoalign has no EventReference.
    """
    try:
        from timetoalign.core import EventReference
    except ImportError as error:
        message = (
            f"the installed timetoalign {version('timetoalign')} cannot read "
            "Projections"
        )
        raise Refusal([], message, status_code=501) from error
    return EventReference.from_row


def split_projections(body: bytes) -> tuple[bytes | None, bytes]:
    """Split the Projections table's bytes off the front of ``body``.

    Args:
        body: The Projections table's length in bytes (a little-endian
            32-bit integer, 0 for none), the table, then the body
            ``POST /api/match-claims`` takes.

    Returns:
        The Projections table's bytes (``None`` for a length of 0) and the
        rest.

    Raises:
        Refusal: 422, if the body is shorter than its prefix or than the
            length it states.
    """
    if len(body) < PREFIX.size:
        raise Refusal([], "the body does not state the Projections table's length")
    (length,) = PREFIX.unpack_from(body)
    rest = len(body) - PREFIX.size
    if length > rest:
        raise Refusal(
            [],
            f"the body states a Projections table of {length} bytes and holds {rest}",
        )
    data = body[PREFIX.size : PREFIX.size + length]
    return (data or None), body[PREFIX.size + length :]


def checked_projections(tables: Any, data: bytes, manifest: Mapping[str, Any]) -> Any:
    """The Projections table ``data``, once TimeToShare's checks accept it.

    Raises:
        Refusal: 422 if ``data`` is no Parquet file, or with every problem
            the checks find against ``manifest``, ``message`` the first
            one's.
    """
    import pyarrow
    import pyarrow.parquet as parquet

    try:
        table = parquet.read_table(pyarrow.BufferReader(data))
    except (pyarrow.ArrowException, OSError, ValueError) as error:
        raise Refusal([], "the Projections table is no Parquet file") from error
    problems = tables.projection_problems(table, manifest)
    if problems:
        listed = [
            {
                "code": problem.code,
                "row": problem.row,
                "column": list(problem.column),
                "message": problem.message,
            }
            for problem in problems
        ]
        raise Refusal([], problems[0].message, problems=listed)
    return table.select(list(tables.PROJECTION_COLUMNS))


def projections_of(
    table: Any, wanted: set[tuple[str, str]], from_row: Callable[[Any], Any]
) -> dict[tuple[str, str], dict[str, str] | None]:
    """The event each wanted Projection stands for, by its timeline and ID.

    Args:
        table: A checked Projections table.
        wanted: The ``(timeline ID, event ID)`` of the events asked about.
        from_row: timetoalign's ``EventReference.from_row``.

    Returns:
        For every wanted event that is a Projection of ``table``, the event
        it stands for as ``{"timeline_id", "event_id"}``, or ``None`` for a
        Projection standing for no event; events that are no Projection of
        the table are absent.
    """
    import pyarrow as pa
    import pyarrow.compute as pc

    ids = pa.array(sorted({event for _, event in wanted}), pa.string())
    rows = table.filter(pc.is_in(table.column("id"), value_set=ids)).to_pylist()
    found: dict[tuple[str, str], dict[str, str] | None] = {}
    for row in rows:
        key = (row["timeline_id"], row["id"])
        if key not in wanted:
            continue
        reference = from_row(row["projection_of"])
        found[key] = (
            None
            if reference is None
            else {"timeline_id": reference.timeline_id, "event_id": reference.event_id}
        )
    return found


def events_answer(body: bytes) -> dict[str, Any]:
    """The events of the MatchClaims a request names.

    Returns:
        ``{"claims": [...]}`` in the order the request names them, each
        ``{"id", "timeline_a_id", "event_a_id", "event_a_name",
        "event_a_projection", "timeline_b_id", "event_b_id", "event_b_name",
        "event_b_projection", "certainty", "is_synchronous"}``, the values
        as timetoalign reads the MatchClaim table (``None`` where a cell is
        null: a side without an event, an event without a name); a side's
        ``event_*_projection`` is ``{"projection_of": …}`` where its event is
        a Projection of the posted Projections table (``projection_of`` the
        event it stands for, ``{"timeline_id", "event_id"}``, or ``None``),
        else ``None``: no Projection, or no Projections table posted.

    Raises:
        Refusal: As :func:`split_parameters`, :func:`split_projections`,
            :func:`checked_projections` and the table route for the rest of
            the body; 422 if ``claims`` is no list, or names a MatchClaim
            the table lacks (at ``["claims", index]``); 501 as
            :func:`projection_model`.
    """
    read, tables, field_class, _ = table_reader()
    from_row = projection_model()
    parameters, rest = split_parameters(body, EVENTS_PARAMETERS)
    projection_data, rest = split_projections(rest)
    manifest_data, table_data = split_body(rest)
    manifest, _ = read_manifest(manifest_data, "the manifest")
    claimed = checked_table(tables, field_class, read(table_data), manifest)
    projections = (
        None
        if projection_data is None
        else checked_projections(tables, projection_data, manifest)
    )
    claims = parameters["claims"]
    if not isinstance(claims, list):
        raise Refusal(["claims"], "the parameter 'claims' is no list of MatchClaim IDs")
    rows = claim_rows(claimed)
    found = [row_of(rows, claim, ["claims", at]) for at, claim in enumerate(claims)]
    names = [
        "id",
        *(column.format(side) for side in "ab" for column in SIDE_COLUMNS),
        "certainty",
        "is_synchronous",
    ]
    import pyarrow as pa

    taken = pa.array(found, pa.int64())
    read_rows = claimed.select(names).take(taken).to_pylist()
    wanted = {
        (row[f"timeline_{side}_id"], row[f"event_{side}_id"])
        for row in read_rows
        for side in "ab"
        if row[f"event_{side}_id"] is not None
    }
    projected = (
        {} if projections is None else projections_of(projections, wanted, from_row)
    )

    def side(row: Mapping[str, Any], letter: str) -> dict[str, Any]:
        timeline, event = row[f"timeline_{letter}_id"], row[f"event_{letter}_id"]
        key = (timeline, event)
        return {
            f"timeline_{letter}_id": timeline,
            f"event_{letter}_id": event,
            f"event_{letter}_name": row[f"event_{letter}_name"],
            f"event_{letter}_projection": (
                {"projection_of": projected[key]} if key in projected else None
            ),
        }

    return {
        "claims": [
            {
                "id": row["id"],
                **side(row, "a"),
                **side(row, "b"),
                "certainty": row["certainty"],
                "is_synchronous": row["is_synchronous"],
            }
            for row in read_rows
        ]
    }


@router.post(f"{API_PREFIX}match-claims/events")
async def match_claim_events(request: Request) -> Response:
    """Answer the events of the MatchClaims named, of the posted tables.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"claims": [<MatchClaim ID>, …]}`` as JSON,
    the Projections table's length in bytes (0 for none), the Projections
    table, then the body ``POST /api/match-claims`` takes. The answer is
    JSON ``{"claims": [...]}`` (:func:`events_answer`). Refusals answer as
    that route's, the parameters' at their name.
    """
    try:
        answer = events_answer(await request.body())
    except Refusal as refusal:
        return refusal.response()
    return JSONResponse(answer)
