"""The MatchClaims' provenance: read for given MatchClaims, and a belief written.

A MatchClaim's provenance is TimeToShare's provenance entry: how it was made
(paradata) and who believes it. The editor holds a MatchClaim table for its
session only and never writes it; it asks the server for the provenance of
the MatchClaims it shows (``POST /api/match-claims/provenance``) and, when
its user states a belief in one, for the table that records it
(``POST /api/match-claims/belief``), which the user saves in the place of
the old file. The repository's ``decisions/0031-match-claim-provenance.md``
fixes both routes.

Both requests are a JSON object of parameters behind its length, followed
by the request of ``POST /api/match-claims`` unchanged: the manifest file
and the Parquet file the editor holds. The table is checked against the
manifest as that route checks it.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from importlib.metadata import version
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from tilie_server.manifests import Refusal, read_manifest
from tilie_server.routers.match_claims import (
    PREFIX,
    checked_table,
    split_body,
    table_reader,
)
from tilie_server.settings import API_PREFIX

router = APIRouter()

PARQUET_MEDIA_TYPE = "application/vnd.apache.parquet"
"""The media type of the belief route's answer, a Parquet file."""

PROVENANCE_PARAMETERS = ("claims",)
"""The parameters of the provenance route."""

BELIEF_PARAMETERS = ("claim", "actor", "belief", "date")
"""The parameters of the belief route, in the order they are checked."""


def provenance_model() -> tuple[Any, Any, Callable[[list[Any]], Any]]:
    """Return timetoalign's ``Provenance``, ``Belief`` and ``provenance_array``.

    Raises:
        Refusal: 501, if the installed timetoalign lacks them.
    """
    try:
        from timetoalign.core.provenance import Belief, Provenance, provenance_array
    except ImportError as error:
        message = (
            f"the installed timetoalign {version('timetoalign')} cannot record "
            "provenance"
        )
        raise Refusal([], message, status_code=501) from error
    return Provenance, Belief, provenance_array


def split_parameters(
    body: bytes, names: tuple[str, ...]
) -> tuple[dict[str, Any], bytes]:
    """Split a request into its parameters and the request of the table route.

    Args:
        body: The request's body: the parameters' length in bytes (a
            little-endian 32-bit integer), the parameters as a JSON object
            in UTF-8, then the body ``POST /api/match-claims`` takes.
        names: The parameters the route takes, each required.

    Raises:
        Refusal: 422, if the body is shorter than its prefix or than the
            length it states, the parameters are no JSON object, or one is
            missing or unknown (at the parameter's name).
    """
    if len(body) < PREFIX.size:
        raise Refusal([], "the body does not start with the parameters' length")
    (length,) = PREFIX.unpack_from(body)
    rest = len(body) - PREFIX.size
    if length > rest:
        raise Refusal(
            [], f"the body states parameters of {length} bytes and holds {rest}"
        )
    text = body[PREFIX.size : PREFIX.size + length]
    try:
        parameters = json.loads(text.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise Refusal([], "the parameters are no JSON text") from error
    if not isinstance(parameters, dict):
        raise Refusal([], "the parameters are no JSON object")
    for name in sorted(parameters):
        if name not in names:
            raise Refusal([name], f"'{name}' is no parameter of this route")
    for name in names:
        if name not in parameters:
            raise Refusal([name], f"the parameter '{name}' is missing")
    return parameters, body[PREFIX.size + length :]


def read_request(
    body: bytes, names: tuple[str, ...]
) -> tuple[dict[str, Any], Any, Mapping[str, Any], Any, Any]:
    """The parameters, the posted table, the manifest (file form),
    ``timetoshare.tables`` and timetoalign's ``MatchClaimField``, once the
    table's checks accept the table.

    Raises:
        Refusal: As :func:`split_parameters`, and as the table route for the
            rest of the body.
    """
    read, tables, field_class, _ = table_reader()
    parameters, rest = split_parameters(body, names)
    manifest_data, table_data = split_body(rest)
    manifest, _ = read_manifest(manifest_data, "the manifest")
    table = read(table_data)
    checked_table(tables, field_class, table, manifest)
    return parameters, table, manifest, tables, field_class


def claim_rows(table: Any) -> dict[str, int]:
    """Each MatchClaim's row, by its ID (the checks hold every ID once)."""
    return {claim: row for row, claim in enumerate(table.column("id").to_pylist())}


def row_of(rows: Mapping[str, int], claim: Any, path: list[str | int]) -> int:
    """The row of the MatchClaim ``claim``.

    Raises:
        Refusal: 422 at ``path`` if ``claim`` is no ID of the table.
    """
    if not isinstance(claim, str) or claim not in rows:
        shown = claim if isinstance(claim, str) else json.dumps(claim)
        raise Refusal(path, f"the MatchClaim table has no MatchClaim '{shown}'")
    return rows[claim]


def provenance_answer(body: bytes) -> dict[str, Any]:
    """The provenance of the MatchClaims a request names.

    Returns:
        ``{"claims": [{"id", "provenance"}]}`` in the order the request names
        them, ``provenance`` the entry the MatchClaim is read with (its row's
        own, else the file's), its absent members left out, or ``None`` for
        a MatchClaim stated without one.

    Raises:
        Refusal: As :func:`read_request`; 422 if ``claims`` is no list, or
            names a MatchClaim the table lacks (at ``["claims", index]``).
    """
    Provenance, _, _ = provenance_model()
    parameters, table, _, tables, _ = read_request(body, PROVENANCE_PARAMETERS)
    claims = parameters["claims"]
    if not isinstance(claims, list):
        raise Refusal(["claims"], "the parameter 'claims' is no list of MatchClaim IDs")
    rows = claim_rows(table)
    found = [row_of(rows, claim, ["claims", at]) for at, claim in enumerate(claims)]
    cells = tables.row_provenance(table)
    return {
        "claims": [
            {
                "id": claim,
                "provenance": (
                    None
                    if cells[row] is None
                    else Provenance.from_row(cells[row]).to_dict()
                ),
            }
            for claim, row in zip(claims, found, strict=True)
        ]
    }


def checked_belief(
    parameters: Mapping[str, Any], rows: Mapping[str, int], belief_class: Any
) -> tuple[int, Any]:
    """The row of the believed MatchClaim and the belief the parameters state.

    Raises:
        Refusal: 422 at the parameter at fault: a MatchClaim the table
            lacks, an actor that is no non-empty string, a belief that is
            none of TimeToShare's three words, a date that is no calendar
            date written ``YYYY-MM-DD``.
    """
    from timetoshare import BELIEFS
    from timetoshare.statements import calendar_date

    row = row_of(rows, parameters["claim"], ["claim"])
    actor = parameters["actor"]
    if not isinstance(actor, str) or actor == "":
        raise Refusal(["actor"], "an actor is named by a non-empty string")
    belief = parameters["belief"]
    if not isinstance(belief, str) or belief not in BELIEFS:
        words = ", ".join(f"'{word}'" for word in BELIEFS)
        raise Refusal(["belief"], f"a belief is one of the strings {words}")
    date = parameters["date"]
    if not isinstance(date, str):
        raise Refusal(["date"], "a date is a string written YYYY-MM-DD")
    try:
        calendar_date(date)
    except ValueError as error:
        raise Refusal(["date"], str(error)) from error
    return row, belief_class(actor=actor, belief=belief, date=date)


def believed_table(
    table: Any,
    row: int,
    belief: Any,
    tables: Any,
    provenance_class: Any,
    provenance_array: Callable[[list[Any]], Any],
) -> Any:
    """The table with ``belief`` recorded in the provenance of row ``row``.

    The belief replaces its actor's earlier belief in that MatchClaim and
    leaves every other actor's standing (timetoalign's
    ``Provenance.with_belief``); a MatchClaim stated without provenance gets
    an entry holding the belief alone. Where the file states one provenance
    for every row, every row now states it as its own and the file no
    longer does, since one row's differs. Every other column, the columns
    the table type does not declare included, and every other row are kept.
    """
    import pyarrow as pa
    from timetoshare.tables import PROVENANCE_METADATA_KEY

    index = table.schema.get_field_index("provenance")
    field = table.schema.field(index)
    cells = tables.row_provenance(table)
    earlier = cells[row]
    entry = (
        provenance_class(beliefs=(belief,))
        if earlier is None
        else provenance_class.from_row(earlier).with_belief(belief)
    )
    key = PROVENANCE_METADATA_KEY.encode()
    metadata = dict(table.schema.metadata or {})
    shared = metadata.pop(key, None)
    column = table.column(index).combine_chunks()
    if shared is not None:
        common = provenance_array([provenance_class.from_dict(json.loads(shared))])
        column = common.take(pa.array([0] * table.num_rows, pa.int64()))
    column = pa.concat_arrays(
        [
            column.slice(0, row).cast(field.type),
            provenance_array([entry]).cast(field.type),
            column.slice(row + 1).cast(field.type),
        ]
    )
    believed = table.set_column(index, field, column)
    return believed.replace_schema_metadata(metadata or None)


def succeeding(tables: Any, old: Any, new: Any) -> None:
    """Refuse ``new`` unless it succeeds ``old``.

    Every MatchClaim of ``old`` is in ``new`` with the same timelines,
    events, anchors and every other value but its provenance (TimeToShare's
    ``succession_problems``).

    Raises:
        Refusal: 422 with every breach as the table problems, ``message``
            the first one's.
    """
    problems = tables.succession_problems(old, new)
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


def belief_answer(body: bytes) -> bytes:
    """The Parquet file of the posted table with the posted belief recorded.

    The new table is checked against the manifest as a posted one is, and
    against the posted table by the succession rule, before it is written.

    Raises:
        Refusal: As :func:`read_request` and :func:`checked_belief`; 422
            with the problems if the new table fails its checks or the
            succession rule.
    """
    import pyarrow as pa
    import pyarrow.parquet as parquet

    provenance_class, belief_class, provenance_array = provenance_model()
    parameters, table, manifest, tables, field_class = read_request(
        body, BELIEF_PARAMETERS
    )
    row, belief = checked_belief(parameters, claim_rows(table), belief_class)
    new = believed_table(table, row, belief, tables, provenance_class, provenance_array)
    checked_table(tables, field_class, new, manifest)
    succeeding(tables, table, new)
    sink = pa.BufferOutputStream()
    parquet.write_table(new, sink)
    return sink.getvalue().to_pybytes()


@router.post(f"{API_PREFIX}match-claims/provenance")
async def match_claim_provenance(request: Request) -> Response:
    """Answer the provenance of the MatchClaims named, of the posted table.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"claims": [<MatchClaim ID>, …]}`` as JSON,
    then the body ``POST /api/match-claims`` takes. The answer is JSON
    ``{"claims": [{"id", "provenance"}]}``. Refusals answer as that route's,
    the parameters' at their name.
    """
    try:
        answer = provenance_answer(await request.body())
    except Refusal as refusal:
        return refusal.response()
    return JSONResponse(answer)


@router.post(f"{API_PREFIX}match-claims/belief")
async def match_claim_belief(request: Request) -> Response:
    """Answer the posted table with an actor's belief in one MatchClaim.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"claim", "actor", "belief", "date"}`` as
    JSON, then the body ``POST /api/match-claims`` takes. The answer is the
    new ``match_claims.parquet``; nothing is written on the server.
    Refusals answer as that route's, the parameters' at their name.
    """
    try:
        answer = belief_answer(await request.body())
    except Refusal as refusal:
        return refusal.response()
    return Response(answer, media_type=PARQUET_MEDIA_TYPE)
