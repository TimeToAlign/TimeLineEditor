"""The measure-maps route: a manifest's measure maps, expanded by timetoalign.

A manifest holds each measure map as the compressed rows of the Measure Map
standard. The editor reads measures (to evaluate the measure views) from
the expanded rows, and the expansion is timetoalign's alone: the editor
asks this route once for each version of a manifest.

The expansion is imported when a request needs it, so a server whose
installed timetoalign lacks it still starts and answers every other route;
this route then answers 501.
"""

from __future__ import annotations

import json
from fractions import Fraction
from importlib.metadata import version
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from tilie_server.settings import API_PREFIX

router = APIRouter()

ROW_MEMBERS = (
    "ID",
    "count",
    "qstamp",
    "number",
    "name",
    "time_signature",
    "nominal_length",
    "actual_length",
    "start_repeat",
    "end_repeat",
    "next",
    "volta",
    "offset_within_measure",
)
"""The members of an expanded row, in the order the answer writes them."""

QUARTER_MEMBERS = frozenset(
    {"qstamp", "nominal_length", "actual_length", "offset_within_measure"}
)
"""The members holding a position or a length in quarters."""


class Refusal(Exception):
    """A request the route cannot answer, with the path of what it refuses."""

    def __init__(
        self, path: list[str | int], message: str, status_code: int = 422
    ) -> None:
        super().__init__(message)
        self.path = path
        self.message = message
        self.status_code = status_code


def measure_map_class() -> Any:
    """Return timetoalign's ``MeasureMap``, which holds the expansion.

    Raises:
        Refusal: 501, if the installed timetoalign has no measure maps.
    """
    try:
        from timetoalign.timelines.structure import MeasureMap
    except ImportError as error:
        message = (
            f"the installed timetoalign {version('timetoalign')} cannot expand "
            "measure maps"
        )
        raise Refusal([], message, status_code=501) from error
    return MeasureMap


def fraction_pair(value: Fraction | int | None) -> list[int] | None:
    """Write an exact quarter-note value as a Fraction pair, ``None`` as null."""
    if value is None:
        return None
    exact = Fraction(value)
    return [exact.numerator, exact.denominator]


def answer_row(row: dict[str, Any]) -> dict[str, Any]:
    """Write one expanded row in the answer's form.

    The quarter-note values become Fraction pairs; the keys a row carries
    outside the row form are left out, as they are no member of a measure.
    """
    return {
        member: fraction_pair(row[member]) if member in QUARTER_MEMBERS else row[member]
        for member in ROW_MEMBERS
    }


def expanded_measure_maps(manifest: Any, measure_map: Any) -> list[dict[str, Any]]:
    """Expand every entry of a manifest's ``measure_maps``, in its order.

    Args:
        manifest: The manifest as read from JSON.
        measure_map: timetoalign's ``MeasureMap`` (:func:`measure_map_class`).

    Returns:
        One ``{"id", "rows"}`` object per entry.

    Raises:
        Refusal: If the manifest is no object, its ``measure_maps`` no list,
            or timetoalign refuses an entry.
    """
    if not isinstance(manifest, dict):
        raise Refusal([], "the body is not a JSON object")
    entries = manifest.get("measure_maps", [])
    if not isinstance(entries, list):
        raise Refusal(["measure_maps"], "measure_maps is not a list")
    answered = []
    for index, entry in enumerate(entries):
        try:
            # Reading the entry checks it as a manifest reader does.
            read = measure_map.from_dict(entry)
            rows = measure_map.expand_rows(entry["rows"], keep_unknown_keys=True)
        except (TypeError, ValueError) as error:
            raise Refusal(["measure_maps", index], str(error)) from error
        answered.append({"id": read.id, "rows": [answer_row(r) for r in rows]})
    return answered


@router.post(f"{API_PREFIX}measure-maps")
async def measure_maps(request: Request) -> JSONResponse:
    """Answer the expanded rows of every measure map of the posted manifest.

    A body that is no JSON, no manifest object, or holds a measure map that
    timetoalign refuses is answered 422 with ``{"detail": {"path",
    "message"}}``; a timetoalign that cannot expand measure maps, 501.
    """
    try:
        measure_map = measure_map_class()
        try:
            manifest = json.loads(await request.body())
        except ValueError as error:
            raise Refusal([], "the body is not JSON") from error
        answer = {"measure_maps": expanded_measure_maps(manifest, measure_map)}
    except Refusal as refusal:
        return JSONResponse(
            {"detail": {"path": refusal.path, "message": refusal.message}},
            status_code=refusal.status_code,
        )
    return JSONResponse(answer)
