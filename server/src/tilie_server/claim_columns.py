"""The columns of a checked MatchClaim table, in the editor's encoding.

The repository's ``decisions/0029-match-claim-columns.md`` fixes the arrays
and the encoding of a value; ``decisions/0030-match-claims-answer.md`` names
the arrays of the answer. Every array is little-endian. The module needs
numpy, pyarrow and timetoshare, which timetoalign brings in; the route
imports it only when a request needs it.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
from timetoalign.alignment import AlignmentBundle
from timetoalign.alignment.filters import belief_context
from timetoalign.core.provenance import actor_iri
from timetoshare import BELIEFS, number_type_of, with_file_ids
from timetoshare.tables import PROVENANCE_METADATA_KEY
from timetoshare.validation.diagnostics import timelines_by_id

from tilie_server.manifests import Refusal

SAFE = 2**53
"""Below this magnitude an int64 is a double exactly, so the IEEE quotient of
two of them is the correctly rounded quotient."""

Arrays = list[tuple[str, bytes, int]]
"""Named arrays in the answer's order: name, bytes, number of entries."""


def axis_timelines(
    table: pa.Table, manifest: Mapping[str, Any]
) -> tuple[list[dict[str, str]], np.ndarray, np.ndarray]:
    """The timelines the table names, sorted by ID, and each side's numbers.

    Args:
        table: A MatchClaim table the checks accept against ``manifest``.
        manifest: The manifest, IDs bare.

    Returns:
        ``[{"id", "number_type"}]``, the number type of the manifest's
        timeline (the checks hold every cell to it), and per row the index
        of side A's and of side B's timeline in that list.
    """
    sides = [table.column(f"timeline_{side}_id").combine_chunks() for side in "ab"]
    ids = sorted({value for side in sides for value in side.to_pylist()})
    known = timelines_by_id(manifest)
    timelines = [{"id": i, "number_type": number_type_of(known[i])} for i in ids]
    value_set = pa.array(ids, pa.string())
    a, b = (
        pc.index_in(side, value_set=value_set)
        .to_numpy(zero_copy_only=False)
        .astype("<u4")
        for side in sides
    )
    return timelines, a, b


def value_column(
    anchors: pa.StructArray, side: str, number_types: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """One value column: per row the position, numerator and denominator.

    An ``int`` value is its integer over 1, a ``fraction`` value its lowest
    terms, each with the double nearest it (ties to even, as Python's
    ``float``); a ``float`` value is its double, ``-0.0`` written ``0.0``,
    over ``0/0``. A row without the anchor holds zeros, which are not read.

    Args:
        anchors: The anchor column (null where a row has no such anchor).
        side: ``"a"`` or ``"b"``.
        number_types: Per row the number type of the side's timeline.
    """
    present = anchors.is_valid().to_numpy(zero_copy_only=False)
    cell = anchors.field(f"coordinate_{side}")
    value = cell.field("value").fill_null(0.0).to_numpy(zero_copy_only=False)
    numerator = cell.field("numerator").fill_null(0).to_numpy(zero_copy_only=False)
    denominator = cell.field("denominator").fill_null(1).to_numpy(zero_copy_only=False)
    floats = present & (number_types == "float")
    exact = present & ~floats
    divisor = np.where(exact, np.gcd(numerator, denominator), 1)
    numerator = np.where(exact, numerator // divisor, 0).astype("<i8")
    denominator = np.where(exact, denominator // divisor, 0).astype("<i8")
    safe = exact & (np.abs(numerator) < SAFE) & (denominator < SAFE)
    position = np.zeros(len(present), "<f8")
    position[floats] = value[floats] + 0.0
    position[safe] = numerator[safe].astype("<f8") / denominator[safe].astype("<f8")
    for row in np.flatnonzero(exact & ~safe):
        # Python divides two integers correctly rounded, however large.
        position[row] = int(numerator[row]) / int(denominator[row])
    return position, numerator, denominator


def manifest_bundle(manifest: Mapping[str, Any]) -> AlignmentBundle:
    """The manifest as timetoalign reads it, without MatchClaims.

    Args:
        manifest: The manifest as its file writes it (IDs ``#id``).

    Raises:
        Refusal: 422 with timetoalign's message if it refuses the manifest,
            at the path the refusal names (a rule of TimeToShare's validators
            names the place in the manifest it breaks), else at ``[]``.
    """
    try:
        return AlignmentBundle.from_dict(dict(manifest))
    except ValueError as error:
        raise Refusal(list(getattr(error, "path", ())), str(error)) from error


def actor_context(manifest: Mapping[str, Any]) -> dict[str, Any] | None:
    """The JSON-LD context under which timetoalign compares the actors of
    the manifest's MatchClaims (its ``belief_context``).

    Args:
        manifest: The manifest, IDs bare.

    Raises:
        Refusal: As :func:`manifest_bundle`.
    """
    return belief_context(manifest_bundle(with_file_ids(dict(manifest))))


def row_beliefs(
    table: pa.Table, context: Mapping[str, Any] | None
) -> tuple[list[str], Arrays]:
    """Every row's beliefs: its own, or the file's where the file states them
    (the checks refuse a table stating both).

    Args:
        table: A checked MatchClaim table.
        context: The context under which actors are compared
            (:func:`actor_context`).

    Returns:
        The actors, each the IRI timetoalign compares it as (two spellings
        of one IRI are one actor), sorted by code point, and three arrays:
        per row the offset of its first belief (``rows + 1`` entries, the
        last the number of beliefs), per belief its actor's index among the
        actors and its word's index in ``BELIEFS``, both in the row's order.
    """
    rows = table.num_rows
    shared = (table.schema.metadata or {}).get(PROVENANCE_METADATA_KEY.encode())
    if shared is not None:
        stated = json.loads(shared).get("beliefs") or []
        actors_of = [belief["actor"] for belief in stated] * rows
        words_of = [belief["belief"] for belief in stated] * rows
        counts = np.full(rows, len(stated), "<u4")
    else:
        provenance = table.column("provenance").combine_chunks()
        lists = provenance.flatten()[provenance.type.get_field_index("beliefs")]
        counts = pc.list_value_length(lists).fill_null(0).to_numpy()
        flat = pc.list_flatten(lists)
        actors_of = flat.field("actor").to_pylist()
        words_of = flat.field("belief").to_pylist()
    written = sorted(set(actors_of))
    iris = [actor_iri(actor, context) for actor in written]
    actors = sorted(set(iris))
    number = {iri: at for at, iri in enumerate(actors)}
    actor_of_written = np.array([number[iri] for iri in iris], "<u4")
    offsets = np.zeros(rows + 1, "<u4")
    np.cumsum(counts, out=offsets[1:])
    written_index, word = (
        pc.index_in(
            pa.array(values, pa.string()), value_set=pa.array(words, pa.string())
        )
        .to_numpy(zero_copy_only=False)
        .astype(kind)
        for values, words, kind in (
            (actors_of, written, "<u4"),
            (words_of, list(BELIEFS), "u1"),
        )
    )
    actor = actor_of_written[written_index]
    arrays = [
        ("belief_offsets", offsets.tobytes(), rows + 1),
        ("belief_actors", actor.tobytes(), len(actor)),
        ("belief_words", word.tobytes(), len(word)),
    ]
    return actors, arrays


def columns_of(
    table: pa.Table, manifest: Mapping[str, Any]
) -> tuple[dict[str, Any], Arrays]:
    """The header's members and the arrays of a checked MatchClaim table.

    Args:
        table: A MatchClaim table the checks accept against ``manifest``.
        manifest: The manifest, IDs bare.

    Returns:
        ``rows``, ``timelines``, ``actors`` (:func:`row_beliefs`) and
        ``beliefs`` (the belief words, a belief's index naming its word),
        and the arrays in the answer's order.

    Raises:
        Refusal: As :func:`actor_context`.
    """
    timelines, a_numbers, b_numbers = axis_timelines(table, manifest)
    number_types = np.array([t["number_type"] for t in timelines], "U8")
    rows = table.num_rows
    ids = "\n".join(table.column("id").to_pylist()).encode("utf-8")
    arrays: Arrays = [
        ("claim_ids", ids, len(ids)),
        ("a.timeline", a_numbers.tobytes(), rows),
        ("b.timeline", b_numbers.tobytes(), rows),
    ]
    anchors = {
        anchor: table.column(f"{anchor}_anchor").combine_chunks()
        for anchor in ("start", "end")
    }
    for anchor, column in anchors.items():
        for side, numbers in (("a", a_numbers), ("b", b_numbers)):
            cells = value_column(column, side, number_types[numbers])
            for part, values in zip(
                ("position", "numerator", "denominator"), cells, strict=True
            ):
                arrays.append((f"{side}.{anchor}.{part}", values.tobytes(), rows))
    for anchor, column in anchors.items():
        present = column.is_valid().to_numpy(zero_copy_only=False).astype("u1")
        arrays.append((f"{anchor}_present", present.tobytes(), rows))
    actors, beliefs = row_beliefs(table, actor_context(manifest))
    header = {
        "rows": rows,
        "timelines": timelines,
        "actors": actors,
        "beliefs": list(BELIEFS),
    }
    return header, arrays + beliefs
