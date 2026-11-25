"""Write the parity table of core's conversion-map evaluators from timetoalign.

Every map of the table's manifest is read by timetoalign and called on each
of its inputs; the result, written on the map's target axis, is recorded with
its kind. The table needs a timetoalign whose TableMap interpolates exactly
on exact anchors, a release after 1.2.0 or a checkout put first on the path:

    PYTHONPATH=<timetoalign checkout> python emit_maps.py

then format the table with Biome (in ``app/``:
``pnpm exec biome format --write packages/core/tests/parity/maps.json``).
"""

from __future__ import annotations

import json
from fractions import Fraction
from pathlib import Path
from typing import Any

from timetoalign.maps.base import ConversionMap
from timetoalign.timelines.structure import MeasureMap

HERE = Path(__file__).parent
QUARTER_MEMBERS = ("qstamp", "nominal_length", "actual_length", "offset_within_measure")
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

BARS = {
    "id": "bars",
    "name": None,
    "meta": {},
    "rows": [
        {
            "count": 1,
            "time_signature": "3/4",
            "actual_length": [1, 2],
            "offset_within_measure": [5, 2],
        },
        {"count": 2},
        {"count": 3, "time_signature": "2/4"},
        {"count": 4},
    ],
}

SPLIT = {
    "id": "split",
    "name": None,
    "meta": {},
    "rows": [
        {
            "count": 1,
            "number": 1,
            "time_signature": "4/4",
            "actual_length": [23, 4],
            "next": [2],
        },
        {"count": 2, "number": 1, "actual_length": 3, "next": [3]},
        {"count": 3, "number": 2, "actual_length": [17, 8], "next": [4]},
        {
            "count": 4,
            "number": 2,
            "actual_length": [15, 8],
            "offset_within_measure": [17, 8],
            "next": [5],
        },
        {"count": 5, "number": 2, "actual_length": 6, "next": [6]},
        {"count": 6, "number": 3, "actual_length": 4},
    ],
}
"""The opening of Op. 106/IV: one measure number over two rows, then three."""

REPEAT = {
    "id": "repeat",
    "name": None,
    "meta": {},
    "rows": [
        {"count": 1, "number": 1, "time_signature": "6/8", "actual_length": 3},
        {
            "count": 2,
            "number": 2,
            "actual_length": [3, 2],
            "end_repeat": True,
            "next": [1],
        },
        {
            "count": 3,
            "number": 2,
            "actual_length": [3, 2],
            "start_repeat": True,
            "offset_within_measure": [3, 2],
        },
        {"count": 4, "number": 3, "actual_length": 3},
    ],
}
"""A 6/8 bar split at a repeat sign: its first part jumps back to count 1,
its second part states the offset where the first ends."""

METRE = {
    "id": "metre",
    "name": None,
    "meta": {},
    "rows": [
        {"count": 1, "number": 1, "time_signature": "2/4", "actual_length": 2},
        {"count": 2, "number": 2, "actual_length": 1},
        {
            "count": 3,
            "number": 2,
            "time_signature": "3/4",
            "actual_length": 2,
            "offset_within_measure": 1,
        },
        {"count": 4, "number": 3, "actual_length": 3},
    ],
}
"""A bar whose metre changes from 2/4 to 3/4 inside it: its first part names
its second in its (default) next, which joins them across the two nominal
lengths."""

MEASURE_MAPS = [BARS, SPLIT, REPEAT, METRE]


def base(kind: str, map_id: str, source: str | None, target: str | None) -> dict[str, Any]:
    """The members every map carries."""
    return {"type": kind, "id": map_id, "name": None, "source_unit": source, "target_unit": target}


def linear(map_id: str, source: str, target: str, scalar: Any, offset: Any = 0) -> dict[str, Any]:
    return {**base("LinearMap", map_id, source, target), "scalar": scalar, "offset": offset}


def table(
    map_id: str,
    source: str,
    target: str,
    xs: list[Any],
    ys: list[Any],
    kind: str = "linear",
    extrapolate: str = "none",
) -> dict[str, Any]:
    return {
        **base("TableMap", map_id, source, target),
        "x_values": xs,
        "y_values": ys,
        "kind": kind,
        "extrapolate": extrapolate,
    }


def view(kind: str, map_id: str, target: str | None, measure_map: str = "bars") -> dict[str, Any]:
    return {**base(kind, map_id, "quarters", target), "measure_map": measure_map}


F = Fraction
SPREAD = [F(0), F(1, 3), F(1, 2), 2, F(7, 2), 5, -1, 0.75, 100]
"""Inputs spread over the measures, before and after them, of every kind."""

QUARTERS = [
    (
        linear("q_samples", "quarters", "samples", [165375, 8], 507150),
        [F(1, 3), F(0), F(7, 2), F(-1, 3), 1, 0.1],
    ),
    (
        linear("q_half_samples", "quarters", "samples", [1, 2]),
        [5, 7, -5, 5.0, F(5), 3.0, -3.0],
    ),
    (linear("q_seconds_float", "quarters", "seconds", 0.5), [F(1, 3), 3, 0.1]),
    (linear("q_seconds_integral_float", "quarters", "seconds", 2.0, 1), [F(1, 3), 3]),
    (
        {
            **base("PiecewiseMap", "q_pieces", "quarters", "seconds"),
            "breaks": [0, 4, 16],
            "maps": [
                linear("q_piece_1", "quarters", "seconds", [1, 2]),
                linear("q_piece_2", "quarters", "seconds", [3, 5], [-2, 5]),
            ],
        },
        [6, F(31, 8), 16, F(-1, 2), 4, 0, 15.999, F(63, 4)],
    ),
    (
        table("q_table_exact", "quarters", "quarters", [0, 4], [0, 2], extrapolate="linear"),
        [F(1, 3), 5, -2, 4, 2.5, 6.0],
    ),
    (table("q_table_none", "quarters", "quarters", [0, 4], [0, 2]), [5, 4, F(1, 3), -1]),
    (
        table("q_table_constant", "quarters", "quarters", [0, 4], [0, 2], extrapolate="constant"),
        [5, -1, 2.0],
    ),
    (
        table(
            "q_table_previous", "quarters", "ticks", [0, [1, 3], 1], [10, 20, 30], kind="previous"
        ),
        [F(1, 3), 0.3333333333333333, F(1, 2), 1, 2, F(1, 4)],
    ),
    (
        table(
            "q_table_mixed", "quarters", "seconds", [0, [1, 3], 1], [0, 1, 2], extrapolate="linear"
        ),
        [0.3333333333333333, F(1, 6), 2, F(1, 3), 0.5],
    ),
    (
        table(
            "q_table_previous_outside",
            "quarters",
            "quarters",
            [0, 4],
            [0, 2],
            kind="previous",
            extrapolate="linear",
        ),
        [6, 2, -2],
    ),
    (
        table(
            "q_table_float_tie",
            "quarters",
            "quarters",
            [0, [6004799503160661, 18014398509481984], [1, 3]],
            [0, 1, 2],
        ),
        [F(1, 3), 0],
    ),
    (
        {
            **base("ChainMap", "q_chain_back", "quarters", "quarters"),
            "maps": [
                linear("q_chain_ticks", "quarters", "ticks", 480),
                linear("q_chain_quarters", "ticks", "quarters", [1, 480]),
            ],
        },
        [F(1, 960), F(3, 2), 0.25],
    ),
    (
        {
            **base("ChainMap", "q_chain_seconds", "quarters", "seconds"),
            "maps": [
                linear("q_chain_s_ticks", "quarters", "ticks", 480),
                linear("q_chain_s_seconds", "ticks", "seconds", 0.001),
            ],
        },
        [F(1, 3), 2],
    ),
    (
        {
            **base("CombinationMap", "q_combination", "quarters", None),
            "maps": {
                "seconds": linear("q_combination_seconds", "quarters", "seconds", 0.5),
                "file": {**base("ConstantMap", "q_combination_file", None, None), "value": "a.png"},
                "count": {**base("ConstantMap", "q_combination_count", None, None), "value": 3},
            },
        },
        [F(1, 3), 4],
    ),
    (
        {**base("ConstantMap", "q_constant_number", "quarters", "seconds"), "value": [3, 2]},
        [0, F(1, 3)],
    ),
    (
        {**base("ConstantMap", "q_constant_label", "quarters", None), "value": "intro"},
        [0],
    ),
    (
        {**base("ConstantMap", "q_constant_ticks", "quarters", "ticks"), "value": 2.5},
        [0],
    ),
    (view("MeasureRecordMap", "q_record", None), SPREAD),
    (view("MeasureNumberMap", "q_number", None), SPREAD),
    (view("MeasureBeatMap", "q_beat", None), SPREAD),
    (view("FloatingMeasureMap", "q_floating", "floating_measures"), [*SPREAD, F(1, 4)]),
    (
        view("FloatingMeasureMap", "q_floating_split", "floating_measures", "split"),
        [F(0), F(23, 4), F(35, 4), F(87, 8), F(51, 4), F(75, 4), F(91, 4), -1, 30, 10.875],
    ),
    (
        view("FloatingMeasureMap", "q_floating_repeat", "floating_measures", "repeat"),
        [F(0), F(3), F(9, 2), F(5), F(6), F(9)],
    ),
    (
        view("FloatingMeasureMap", "q_floating_metre", "floating_measures", "metre"),
        [F(0), F(2), F(3), F(4), F(5), F(8)],
    ),
]

TICKS = [
    (
        table(
            "t_seconds",
            "ticks",
            "seconds",
            [0, 480, 960],
            [0.0, 0.5, 1.5],
            extrapolate="linear",
        ),
        [240, 720, 1000, -480, 960, 0, F(1, 3)],
    ),
    (linear("t_quarters", "ticks", "quarters", [1, 480]), [720, 1, 0.5]),
]

SECONDS = [
    (linear("s_samples", "seconds", "samples", 44100), [0.1, 1.5, 2.0000113378684807]),
    (linear("s_milliseconds", "seconds", "milliseconds", 1000), [0.1, 3]),
]


def typed(value: Any) -> dict[str, Any]:
    """A number as its kind and value, a Fraction as its pair."""
    if isinstance(value, bool):
        raise TypeError("a map never answers a boolean")
    if isinstance(value, int):
        return {"type": "int", "value": value}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, Fraction):
        return {"type": "fraction", "value": [value.numerator, value.denominator]}
    raise TypeError(f"not a number: {value!r}")


def result_of(value: Any) -> dict[str, Any]:
    """A map's result as the table records it."""
    if isinstance(value, (int, float, Fraction)):
        return typed(value)
    if isinstance(value, str):
        return {"type": "string", "value": value}
    if isinstance(value, dict):
        return {"type": "outputs", "value": {k: result_of(v) for k, v in value.items()}}
    return {"type": "record", "value": {"ID": value.id, "count": value.count}}


def answer(cmap: ConversionMap[Any] | None, value: Any) -> dict[str, Any] | None:
    if cmap is None:
        return None
    try:
        return result_of(cmap(value))
    except (ValueError, ArithmeticError, TypeError):
        return None


def pair(value: Any) -> list[int] | None:
    if value is None:
        return None
    exact = Fraction(value)
    return [exact.numerator, exact.denominator]


def knots() -> list[dict[str, Any]]:
    """The MeasureMaps' expanded rows as the server's measure-maps route answers them."""
    return [
        {
            "id": entry["id"],
            "rows": [
                {m: pair(row[m]) if m in QUARTER_MEMBERS else row[m] for m in ROW_MEMBERS}
                for row in MeasureMap.expand_rows(entry["rows"], keep_unknown_keys=True)
            ],
        }
        for entry in MEASURE_MAPS
    ]


def main() -> None:
    measure_maps = {entry["id"]: MeasureMap.from_dict(entry) for entry in MEASURE_MAPS}
    roots = [
        ("quarters_root", "quarters", QUARTERS),
        ("ticks_root", "ticks", TICKS),
        ("seconds_root", "seconds", SECONDS),
    ]
    timelines = []
    cases = []
    for timeline_id, unit, maps in roots:
        timelines.append(
            {
                "id": timeline_id,
                "unit": unit,
                "length": None,
                "conversion_maps": [form for form, _ in maps],
            }
        )
        for form, inputs in maps:
            try:
                cmap: ConversionMap[Any] | None = ConversionMap.from_dict(
                    form, measure_maps=measure_maps
                )
            except ValueError:
                cmap = None
            cases.append(
                {
                    "map": form["id"],
                    "points": [{"x": typed(x), "result": answer(cmap, x)} for x in inputs],
                }
            )
    table = {
        "manifest": {"timetoshare": "0.2.0", "timelines": timelines, "measure_maps": MEASURE_MAPS},
        "knots": knots(),
        "cases": cases,
    }
    text = json.dumps(table, indent=2, ensure_ascii=False, allow_nan=False)
    (HERE / "maps.json").write_text(text + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
