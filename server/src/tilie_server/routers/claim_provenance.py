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

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from tilie_server.manifests import PostedBody, Refusal, read_manifest
from tilie_server.routers.match_claims import (
    PREFIX,
    PostedTableBounds,
    TableBounds,
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


def provenance_model() -> tuple[Any, Callable[[str, Any], str], Callable[[Any], Any]]:
    """Return timetoalign's ``Provenance``, ``actor_iri`` and ``belief_context``.

    Raises:
        Refusal: 501, if the installed timetoalign lacks them.
    """
    try:
        from timetoalign.alignment.filters import belief_context
        from timetoalign.core.provenance import Provenance, actor_iri
    except ImportError as error:
        message = (
            f"the installed timetoalign {version('timetoalign')} cannot record "
            "provenance"
        )
        raise Refusal([], message, status_code=501) from error
    return Provenance, actor_iri, belief_context


def split_parameters(
    body: bytes, names: tuple[str, ...], optional: tuple[str, ...] = ()
) -> tuple[dict[str, Any], bytes]:
    """Split a request into its parameters and what follows them.

    Args:
        body: The request's body: the parameters' length in bytes (a
            little-endian 32-bit integer), the parameters as a JSON object
            in UTF-8, then the rest of the request (for the MatchClaim
            routes the body ``POST /api/match-claims`` takes).
        names: The parameters the route requires.
        optional: The parameters the route takes besides, each of which a
            request may leave out.

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
        if name not in names and name not in optional:
            raise Refusal([name], f"'{name}' is no parameter of this route")
    for name in names:
        if name not in parameters:
            raise Refusal([name], f"the parameter '{name}' is missing")
    return parameters, body[PREFIX.size + length :]


def read_request(
    body: bytes, names: tuple[str, ...], bounds: TableBounds
) -> tuple[dict[str, Any], Any, Mapping[str, Any], Any, Any, Any]:
    """The parameters, the posted table (read within ``bounds``), the
    manifest (file form), ``timetoshare.tables``, timetoalign's
    ``MatchClaimField`` and the table as timetoalign gives it back, once the
    table's checks accept the table.

    Raises:
        Refusal: As :func:`split_parameters`, and as the table route for the
            rest of the body.
    """
    read, tables, field_class, _ = table_reader(bounds)
    parameters, rest = split_parameters(body, names)
    manifest_data, table_data = split_body(rest)
    manifest, _ = read_manifest(manifest_data, "the manifest")
    table = read(table_data)
    checked = checked_table(tables, field_class, table, manifest)
    return parameters, table, manifest, tables, field_class, checked


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


def provenance_answer(body: bytes, bounds: TableBounds) -> dict[str, Any]:
    """The provenance of the MatchClaims a request names, its table read
    within ``bounds``.

    Returns:
        ``{"claims": [{"id", "provenance"}]}`` in the order the request names
        them, ``provenance`` the entry the MatchClaim is read with (its row's
        own, else the file's), its absent members left out, or ``None`` for
        a MatchClaim stated without one. Each belief's actor is the IRI
        timetoalign compares it as, expanded under the manifest's
        ``@context``, as the MatchClaims route answers actors.

    Raises:
        Refusal: As :func:`read_request`; 422 if ``claims`` is no list, or
            names a MatchClaim the table lacks (at ``["claims", index]``);
            as :func:`tilie_server.claim_columns.manifest_bundle`.
    """
    from tilie_server.claim_columns import manifest_bundle

    Provenance, actor_iri, belief_context = provenance_model()
    parameters, table, manifest, tables, _, _ = read_request(
        body, PROVENANCE_PARAMETERS, bounds
    )
    claims = parameters["claims"]
    if not isinstance(claims, list):
        raise Refusal(["claims"], "the parameter 'claims' is no list of MatchClaim IDs")
    rows = claim_rows(table)
    found = [row_of(rows, claim, ["claims", at]) for at, claim in enumerate(claims)]
    context = belief_context(manifest_bundle(manifest))
    cells = tables.row_provenance(table)

    def entry(cell: Any) -> dict[str, Any] | None:
        if cell is None:
            return None
        described = Provenance.from_row(cell).to_dict()
        for belief in described.get("beliefs", ()):
            belief["actor"] = actor_iri(belief["actor"], context)
        return described

    return {
        "claims": [
            {"id": claim, "provenance": entry(cells[row])}
            for claim, row in zip(claims, found, strict=True)
        ]
    }


def checked_belief(
    parameters: Mapping[str, Any], rows: Mapping[str, int]
) -> tuple[str, str, str, str]:
    """The believed MatchClaim's ID, the actor, the belief and its date.

    Raises:
        Refusal: 422 at the parameter at fault: a MatchClaim the table
            lacks, an actor that is no non-empty string, a belief that is
            none of TimeToShare's three words, a date that is no calendar
            date written ``YYYY-MM-DD``.
    """
    from timetoshare import BELIEFS
    from timetoshare.statements import calendar_date

    claim = parameters["claim"]
    row_of(rows, claim, ["claim"])
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
    return claim, actor, belief, date


def believed_table(table: Any, believed: Any) -> Any:
    """The posted table with the provenance of the table timetoalign wrote.

    ``believed`` is the posted table's MatchClaims as timetoalign holds them
    after recording a belief: the same rows in the same order, the columns
    the table type declares. Its provenance column replaces the posted
    one, and the file's provenance for every row is the one ``believed``
    states, if any (timetoalign keeps a shared entry only while it is every
    row's). Every other column, the columns the table type does not declare
    included, and the file's other metadata are kept.
    """
    from timetoshare.tables import PROVENANCE_METADATA_KEY

    key = PROVENANCE_METADATA_KEY.encode()
    index = table.schema.get_field_index("provenance")
    field = table.schema.field(index)
    column = believed.column("provenance").cast(field.type)
    metadata = {
        name: value
        for name, value in (table.schema.metadata or {}).items()
        if name != key
    }
    shared = (believed.schema.metadata or {}).get(key)
    if shared is not None:
        metadata[key] = shared
    new = table.set_column(index, field, column)
    return new.replace_schema_metadata(metadata or None)


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


def belief_answer(body: bytes, bounds: TableBounds) -> bytes:
    """The Parquet file of the posted table with the posted belief recorded,
    the table read within ``bounds``.

    timetoalign records the belief: the manifest is read as an
    ``AlignmentBundle``, the table's MatchClaims are added to it, and its
    ``add_match_claim_belief`` replaces the actor's earlier belief in the
    MatchClaim, actors compared as IRIs under every prefix the manifest's
    ``@context`` declares. The new table is checked against the manifest
    as a posted one is, and against the posted table by the succession
    rule, before it is written.

    Raises:
        Refusal: As :func:`read_request`, :func:`checked_belief` and
            :func:`tilie_server.claim_columns.manifest_bundle`; 422 with
            timetoalign's message if it refuses the MatchClaims or the
            belief, with the problems if the new table fails its checks or
            the succession rule.
    """
    import pyarrow as pa
    import pyarrow.parquet as parquet

    from tilie_server.claim_columns import manifest_bundle

    provenance_model()  # 501 before the body is split
    parameters, table, manifest, tables, field_class, checked = read_request(
        body, BELIEF_PARAMETERS, bounds
    )
    claim, actor, belief, date = checked_belief(parameters, claim_rows(table))
    bundle = manifest_bundle(manifest)
    try:
        bundle.add_match_claim_field(field_class.from_package_table(checked))
        bundle.add_match_claim_belief(claim, actor=actor, belief=belief, date=date)
    except (KeyError, ValueError) as error:
        raise Refusal([], str(error.args[0] if error.args else error)) from error
    new = believed_table(table, bundle.match_claim_table.package_table)
    checked_table(tables, field_class, new, manifest)
    succeeding(tables, table, new)
    sink = pa.BufferOutputStream()
    parquet.write_table(new, sink)
    return sink.getvalue().to_pybytes()


@router.post(f"{API_PREFIX}match-claims/provenance")
def match_claim_provenance(body: PostedBody, bounds: PostedTableBounds) -> Response:
    """Answer the provenance of the MatchClaims named, of the posted table.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"claims": [<MatchClaim ID>, …]}`` as JSON,
    then the body ``POST /api/match-claims`` takes. The answer is JSON
    ``{"claims": [{"id", "provenance"}]}``. Refusals answer as that route's,
    the parameters' at their name.
    """
    try:
        answer = provenance_answer(body, bounds)
    except Refusal as refusal:
        return refusal.response()
    return JSONResponse(answer)


@router.post(f"{API_PREFIX}match-claims/belief")
def match_claim_belief(body: PostedBody, bounds: PostedTableBounds) -> Response:
    """Answer the posted table with an actor's belief in one MatchClaim.

    The body is the parameters' length in bytes (a little-endian 32-bit
    integer), the parameters ``{"claim", "actor", "belief", "date"}`` as
    JSON, then the body ``POST /api/match-claims`` takes. The answer is the
    new ``match_claims.parquet``; nothing is written on the server.
    Refusals answer as that route's, the parameters' at their name.
    """
    try:
        answer = belief_answer(body, bounds)
    except Refusal as refusal:
        return refusal.response()
    return Response(answer, media_type=PARQUET_MEDIA_TYPE)
