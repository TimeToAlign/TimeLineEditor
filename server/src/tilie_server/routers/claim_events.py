"""The MatchClaims' events: what each side of given MatchClaims names.

The editor holds a package's MatchClaim table for its session only. To show
a MatchClaim it asks the server for the events on its two sides
(``POST /api/match-claims/events``): each side's timeline, event ID and
event name as the MatchClaim table states them, the MatchClaim's certainty
and whether it states synchrony. The repository's
``decisions/0032-match-claim-events.md`` fixes the route.

The request is the parameters behind their length, as the provenance
routes take them (``{"claims": [<MatchClaim ID>, …]}``), then the body of
``POST /api/match-claims`` unchanged. The table is checked against the
manifest by TimeToShare's table checks; timetoalign reads it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from tilie_server.manifests import Refusal, read_manifest
from tilie_server.routers.claim_provenance import claim_rows, row_of, split_parameters
from tilie_server.routers.match_claims import checked_table, split_body, table_reader
from tilie_server.settings import API_PREFIX

router = APIRouter()

EVENTS_PARAMETERS = ("claims",)
"""The parameters of the events route."""

SIDE_COLUMNS = ("timeline_{}_id", "event_{}_id", "event_{}_name")
"""The MatchClaim table's columns of one side, ``{}`` the side's letter."""

ANSWERED_COLUMNS = (
    "id",
    *(column.format(side) for side in "ab" for column in SIDE_COLUMNS),
    "certainty",
    "is_synchronous",
)
"""The members of an answered MatchClaim, in the order answered."""


def events_answer(body: bytes) -> dict[str, Any]:
    """The events of the MatchClaims a request names.

    Returns:
        ``{"claims": [...]}`` in the order the request names them, each
        ``{"id", "timeline_a_id", "event_a_id", "event_a_name",
        "timeline_b_id", "event_b_id", "event_b_name", "certainty",
        "is_synchronous"}``, the values as timetoalign reads the MatchClaim
        table (``None`` where a cell is null: a side without an event, an
        event without a name).

    Raises:
        Refusal: As :func:`split_parameters` and the table route for the
            rest of the body; 422 if ``claims`` is no list, or names a
            MatchClaim the table lacks (at ``["claims", index]``).
    """
    read, tables, field_class, _ = table_reader()
    parameters, rest = split_parameters(body, EVENTS_PARAMETERS)
    manifest_data, table_data = split_body(rest)
    manifest, _ = read_manifest(manifest_data, "the manifest")
    claimed = checked_table(tables, field_class, read(table_data), manifest)
    claims = parameters["claims"]
    if not isinstance(claims, list):
        raise Refusal(["claims"], "the parameter 'claims' is no list of MatchClaim IDs")
    rows = claim_rows(claimed)
    found = [row_of(rows, claim, ["claims", at]) for at, claim in enumerate(claims)]
    import pyarrow as pa

    taken = pa.array(found, pa.int64())
    return {"claims": claimed.select(list(ANSWERED_COLUMNS)).take(taken).to_pylist()}


@router.post(f"{API_PREFIX}match-claims/events")
async def match_claim_events(request: Request) -> Response:
    """Answer the events of the MatchClaims named, of the posted table.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"claims": [<MatchClaim ID>, …]}`` as JSON,
    then the body ``POST /api/match-claims`` takes. The answer is
    JSON ``{"claims": [...]}`` (:func:`events_answer`). Refusals answer as
    that route's, the parameters' at their name.
    """
    try:
        answer = events_answer(await request.body())
    except Refusal as refusal:
        return refusal.response()
    return JSONResponse(answer)
