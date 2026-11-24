"""The MatchClaims route: a package's MatchClaim table as the editor's columns.

The editor has no Parquet reader. It posts the manifest file's text together
with the picked ``match_claims.parquet``; the route reads the table with
timetoalign, checks it against the manifest with TimeToShare's table checks
and answers with the columns the editor's anchor index takes, as raw
little-endian arrays behind a small header, which the browser views where
they lie. The repository's ``decisions/0029-match-claim-columns.md`` fixes
the arrays and their encoding, ``decisions/0030-match-claims-answer.md`` the
bytes of the request and of the answer.

Besides the columns the answer holds every row's beliefs, from which the
editor computes the belief filter's row mask; the route filters nothing.

A server may bound the tables it reads (:class:`TableBounds`): a public
server does, since a small Parquet file can decode to a table many times its
size. Every route that reads a posted table reads it through the reader
:func:`table_reader` returns, which keeps to the server's bounds.

pyarrow, TimeToShare's table checks and timetoalign's MatchClaim table are
imported when a request needs them, so a server whose installed timetoalign
or timetoshare lacks them still starts and answers every other route; this
route then answers 501.
"""

from __future__ import annotations

import json
import struct
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from importlib.metadata import version
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from tilie_server.manifests import PostedBody, Refusal, read_manifest
from tilie_server.settings import API_PREFIX, size_named

router = APIRouter()

FORMAT = "tilie-match-claims"
"""The answer's ``format``."""

FORMAT_VERSION = 1
"""The answer's ``version``, the layout of ADR 0030."""

MEDIA_TYPE = "application/octet-stream"
"""The media type of the request and of the answer."""

ALIGNMENT = 8
"""Every array starts at a multiple of eight bytes from the answer's start."""

PREFIX = struct.Struct("<I")
"""The little-endian 32-bit length opening the request and the answer."""

BATCH_ROWS = 1024
"""The rows of a bounded table decoded at a time, each batch counted before
the next is decoded."""

TOO_LARGE = 413
"""The status of a table beyond the server's bounds."""


@dataclass(frozen=True)
class TableBounds:
    """The most rows, and the most bytes uncompressed, of a posted table the
    server reads; ``None`` for no bound.

    Attributes:
        rows: The most rows.
        size: The most bytes, as the file's footer states its row groups'
            uncompressed size and as the decoded table's Arrow buffers hold.
    """

    rows: int | None = None
    size: int | None = None

    def check_rows(self, rows: int) -> None:
        """Refuse ``rows`` rows beyond the bound.

        Raises:
            Refusal: 413, ``table of more than <n> rows``.
        """
        if self.rows is not None and rows > self.rows:
            plural = "" if self.rows == 1 else "s"
            message = f"table of more than {self.rows:,} row{plural}"
            raise Refusal([], message, status_code=TOO_LARGE)

    def check_size(self, size: int) -> None:
        """Refuse ``size`` bytes beyond the bound.

        Raises:
            Refusal: 413, ``table larger than <size> uncompressed``.
        """
        if self.size is not None and size > self.size:
            message = f"table larger than {size_named(self.size)} uncompressed"
            raise Refusal([], message, status_code=TOO_LARGE)


async def table_bounds(request: Request) -> TableBounds:
    """The server's bounds of a posted table: the dependency through which a
    route reading one takes them."""
    bounds: TableBounds = request.app.state.table_bounds
    return bounds


PostedTableBounds = Annotated[TableBounds, Depends(table_bounds)]
"""A route's parameter taking the server's bounds of a posted table."""


def bounded_table(parquet: Any, pyarrow: Any, data: bytes, bounds: TableBounds) -> Any:
    """Read Parquet bytes into an Arrow table, within ``bounds``.

    Without bounds the file is read whole. With them, the footer is checked
    first, before any row is decoded: its rows (the file's count, or the sum
    of its row groups' where that is larger, since the reader follows the
    row groups) and its row groups' summed ``total_byte_size``. The footer
    is the sender's statement and measures encoded pages, so the table is
    then decoded :data:`BATCH_ROWS` rows at a time and the bytes of the
    decoded batches are summed; the read stops at the batch that passes the
    size bound. One batch is thus decoded before it is counted.

    Raises:
        Refusal: 413 as :meth:`TableBounds.check_rows` and
            :meth:`TableBounds.check_size`.
    """
    source = pyarrow.BufferReader(data)
    if bounds.rows is None and bounds.size is None:
        return parquet.read_table(source)
    file = parquet.ParquetFile(source)
    footer = file.metadata
    groups = [footer.row_group(index) for index in range(footer.num_row_groups)]
    bounds.check_rows(max(footer.num_rows, sum(group.num_rows for group in groups)))
    bounds.check_size(sum(group.total_byte_size for group in groups))
    batches = []
    size = 0
    for batch in file.iter_batches(batch_size=BATCH_ROWS):
        size += batch.get_total_buffer_size()
        bounds.check_size(size)
        batches.append(batch)
    return pyarrow.Table.from_batches(batches, schema=file.schema_arrow)


def table_reader(bounds: TableBounds) -> tuple[Callable[[bytes], Any], Any, Any, Any]:
    """Return what reads, checks and encodes a MatchClaim table.

    Args:
        bounds: The server's bounds of a posted table, which the reader keeps.

    Returns:
        A reader of Parquet bytes into an Arrow table (:func:`bounded_table`),
        the module ``timetoshare.tables``, timetoalign's ``MatchClaimField``
        and :func:`tilie_server.claim_columns.columns_of`.

    Raises:
        Refusal: 501, if timetoshare cannot check MatchClaim tables (it or
            pyarrow is missing), or timetoalign cannot read them.
    """
    try:
        import pyarrow
        import pyarrow.parquet as parquet
        import timetoshare.tables as tables
    except ImportError as error:
        message = (
            f"the installed timetoshare {version('timetoshare')} cannot check "
            "MatchClaim tables"
        )
        raise Refusal([], message, status_code=501) from error
    try:
        from timetoalign.alignment.claims import MatchClaimField

        from tilie_server.claim_columns import columns_of
    except ImportError as error:
        message = (
            f"the installed timetoalign {version('timetoalign')} cannot read "
            "MatchClaim tables"
        )
        raise Refusal([], message, status_code=501) from error

    def read(data: bytes) -> Any:
        try:
            return bounded_table(parquet, pyarrow, data, bounds)
        except (pyarrow.ArrowException, OSError, ValueError) as error:
            raise Refusal([], "the MatchClaim table is no Parquet file") from error

    return read, tables, MatchClaimField, columns_of


def split_body(body: bytes) -> tuple[bytes, bytes]:
    """Split a request into the manifest file's bytes and the table's.

    Raises:
        Refusal: 422, if the body is shorter than its prefix or than the
            manifest's length it states.
    """
    if len(body) < PREFIX.size:
        raise Refusal([], "the body does not start with the manifest's length")
    (length,) = PREFIX.unpack_from(body)
    rest = len(body) - PREFIX.size
    if length > rest:
        raise Refusal(
            [], f"the body states a manifest of {length} bytes and holds {rest}"
        )
    return body[PREFIX.size : PREFIX.size + length], body[PREFIX.size + length :]


def checked_table(
    tables: Any, field_class: Any, table: Any, manifest: Mapping[str, Any]
) -> Any:
    """The table as timetoalign reads it, once TimeToShare's checks accept it.

    The checks run on the file's table against the manifest; timetoalign
    then reads the columns the table type declares (a table may hold others,
    which are no part of a MatchClaim) in the package form, each coordinate
    cell's number written once as its ``number_type`` says, and gives back
    the same rows in that form.

    Raises:
        Refusal: 422 with every problem the checks find, or with
            timetoalign's message if it refuses a table the checks accept.
    """
    problems = tables.match_claim_problems(table, manifest)
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
    try:
        field = field_class.from_package_table(
            table.select(list(tables.MATCH_CLAIM_COLUMNS))
        )
    except ValueError as error:
        raise Refusal([], str(error)) from error
    return field.package_table


def answer_bytes(header: dict[str, Any], arrays: list[tuple[str, bytes, int]]) -> bytes:
    """Write the answer: the header's length, the header, then the arrays.

    The first array starts at the first multiple of :data:`ALIGNMENT` after
    the header; each array's offset from there is a multiple of it too, so
    every array starts at a multiple of eight bytes from the answer's start.
    The header names each array's offset and number of entries. Padding is
    zero bytes.
    """
    placed: dict[str, list[int]] = {}
    offset = 0
    for name, data, length in arrays:
        placed[name] = [offset, length]
        offset += -(-len(data) // ALIGNMENT) * ALIGNMENT
    text = json.dumps(
        {"format": FORMAT, "version": FORMAT_VERSION, **header, "arrays": placed},
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    base = -(-(PREFIX.size + len(text)) // ALIGNMENT) * ALIGNMENT
    out = bytearray(base + offset)
    PREFIX.pack_into(out, 0, len(text))
    out[PREFIX.size : PREFIX.size + len(text)] = text
    for name, data, _ in arrays:
        start = base + placed[name][0]
        out[start : start + len(data)] = data
    return bytes(out)


def match_claims_answer(body: bytes, bounds: TableBounds) -> bytes:
    """The answer to a request's body, its table read within ``bounds``.

    Raises:
        Refusal: As :func:`table_reader`, its reader, :func:`split_body`,
            :func:`tilie_server.manifests.read_manifest` and
            :func:`checked_table`.
    """
    read, tables, field_class, columns_of = table_reader(bounds)
    manifest_data, table_data = split_body(body)
    manifest, bare = read_manifest(manifest_data, "the manifest")
    table = checked_table(tables, field_class, read(table_data), manifest)
    return answer_bytes(*columns_of(table, bare))


@router.post(f"{API_PREFIX}match-claims")
def match_claims(body: PostedBody, bounds: PostedTableBounds) -> Response:
    """Answer the columns of the posted MatchClaim table, checked against the
    posted manifest.

    The body is the manifest file's length in bytes (a little-endian 32-bit
    integer), the manifest file's text in any serialization, then the
    Parquet file. A body that cannot be split or read, or a table the
    checks refuse, is answered 422 with ``{"detail": {"path", "message"}}``,
    a refused table with ``problems`` besides (each ``{code, row, column,
    message}``, the checks' own); a table beyond the server's bounds 413 in
    the same form; a server that cannot read or check MatchClaim tables, or
    read manifest files, 501.
    """
    try:
        answer = match_claims_answer(body, bounds)
    except Refusal as refusal:
        return refusal.response()
    return Response(answer, media_type=MEDIA_TYPE)
