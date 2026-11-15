/** Timestamps; the expected values are derived in `README.md` ("Timestamps"). */

import type { TimeUnit } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { isCommandError } from "../src/errors.ts";
import type { ConversionMap } from "../src/manifest/types.ts";
import type {
  KnotsAbsence,
  Pin,
  PinRow,
  Timestamp,
  TimestampSegment,
  TimestampSpec,
  TimestampTimeline,
} from "../src/maps/timestamp.ts";
import {
  measureText,
  missingValueText,
  pinAt,
  positionFor,
  timestampAt,
  timestampPlace,
} from "../src/maps/timestamp.ts";
import { Rational } from "../src/number/rational.ts";
import type { Granularity } from "../src/workspace/view.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

type Parameter = readonly [number, number] | number;

/** A LinearMap in the complete form, `scalar·x + offset` from `source` onto `target`. */
function linear(
  id: string,
  name: string | null,
  scalar: Parameter,
  offset: Parameter,
  target: TimeUnit,
  source: TimeUnit = "quarters",
): ConversionMap {
  return {
    type: "LinearMap",
    id,
    name,
    source_unit: source,
    target_unit: target,
    scalar,
    offset,
  };
}

function segment(
  timeline: string,
  offset: number,
  length: number,
  maps: readonly ConversionMap[],
): TimestampSegment {
  return {
    timeline,
    name: timeline,
    unit: "quarters",
    numberType: "fraction",
    maps,
    offset: q(offset),
    length: q(length),
  };
}

const GRANULARITY: Granularity = { denominator: 2520, decimals: 3 };
const A = segment("A", 0, 8, [
  linear("A_tempo", "Tempo", [1, 2], 0, "seconds"),
  linear("A_samples", "Samples", 22050, 0, "samples"),
]);
const B = segment("B", 8, 12, [
  linear("B_samples", "Samples", [55125, 2], 176400, "samples"),
  linear("B_tempo", "Tempo", [5, 8], 4, "seconds"),
  linear("B_ticks", "Ticks", 480, 0, "ticks"),
]);
const C = segment("C", 20, 12, [
  linear("C_samples", "Samples", [165375, 8], 507150, "samples"),
  linear("C_tempo", "Tempo", [15, 32], [23, 2], "seconds"),
  linear("C_bars", "Bars", [1, 4], 0, "whole_notes"),
]);
const FORM: TimestampSpec = {
  block: "0000000000",
  granularity: GRANULARITY,
  line: {
    timeline: "form",
    name: "Form",
    unit: "quarters",
    numberType: "fraction",
    length: q(32),
    maps: [linear("form_ticks", "Ticks", 480, 0, "ticks")],
  },
  segments: [A, B, C],
};

/** A timestamp's parts as [timeline, segment, position, [map id, value]…], values in their kinds. */
function readout(timestamp: Timestamp): unknown[] {
  return timestamp.parts.map((part) => [
    part.timeline,
    part.segment,
    part.position,
    part.maps.map((map) => [
      map.id,
      map.value !== null && typeof map.value === "object" && "value" in map.value
        ? map.value.value
        : map.value,
    ]),
  ]);
}

describe("a timestamp on a segment line", () => {
  it("reads the line, then the segment under the position counted from its start", () => {
    const timestamp = timestampAt(FORM, q(27, 2));
    expect([timestamp.block, timestamp.timeline, timestamp.granularity]).toEqual([
      "0000000000",
      "form",
      GRANULARITY,
    ]);
    expect(timestamp.granularity).toBe(GRANULARITY);
    expect(readout(timestamp)).toEqual([
      ["form", false, q(27, 2), [["form_ticks", 6480n]]],
      [
        "B",
        true,
        q(11, 2),
        [
          ["B_samples", 327994n],
          ["B_tempo", 7.4375],
          ["B_ticks", 2640n],
        ],
      ],
    ]);
  });

  it("writes each part's axis and each map's target unit and number type", () => {
    const [line, part] = timestampAt(FORM, q(27, 2)).parts;
    expect([line?.name, line?.unit, line?.numberType, part?.name]).toEqual([
      "Form",
      "quarters",
      "fraction",
      "B",
    ]);
    expect(part?.maps).toEqual([
      {
        id: "B_samples",
        name: "Samples",
        targetUnit: "samples",
        missingKnots: null,
        value: { unit: "samples", numberType: "int", value: 327994n },
      },
      {
        id: "B_tempo",
        name: "Tempo",
        targetUnit: "seconds",
        missingKnots: null,
        value: { unit: "seconds", numberType: "float", value: 7.4375 },
      },
      {
        id: "B_ticks",
        name: "Ticks",
        targetUnit: "ticks",
        missingKnots: null,
        value: { unit: "ticks", numberType: "int", value: 2640n },
      },
    ]);
  });

  it("gives a shared boundary to the later segment and the line's end to the last", () => {
    expect(readout(timestampAt(FORM, q(8))).at(1)).toEqual([
      "B",
      true,
      q(0),
      [
        ["B_samples", 176400n],
        ["B_tempo", 4],
        ["B_ticks", 0n],
      ],
    ]);
    expect(readout(timestampAt(FORM, q(0))).at(1)).toEqual([
      "A",
      true,
      q(0),
      [
        ["A_tempo", 0],
        ["A_samples", 0n],
      ],
    ]);
    expect(readout(timestampAt(FORM, q(32))).at(1)).toEqual([
      "C",
      true,
      q(12),
      [
        ["C_samples", 755212n],
        ["C_tempo", 17.125],
        ["C_bars", q(3)],
      ],
    ]);
  });

  it("has the line's part alone where no segment holds the position", () => {
    const parts = timestampAt({ ...FORM, segments: [A] }, q(10)).parts;
    expect(parts.map((part) => [part.timeline, part.position])).toEqual([["form", q(10)]]);
  });
});

describe("a timestamp on a line without segments", () => {
  it("shows a child's own maps only, in the order given", () => {
    const timestamp = timestampAt(
      {
        block: "0000000001",
        granularity: GRANULARITY,
        line: {
          timeline: "cons",
          name: "Consequent",
          unit: "quarters",
          numberType: "fraction",
          length: q(8),
          maps: [
            linear("cons_tempo", "Tempo", [3, 5], [-2, 5], "seconds"),
            linear("cons_ticks", "Ticks", 480, 0, "ticks"),
          ],
        },
        segments: [],
      },
      q(2),
    );
    expect(readout(timestamp)).toEqual([
      [
        "cons",
        false,
        q(2),
        [
          ["cons_tempo", 0.8],
          ["cons_ticks", 960n],
        ],
      ],
    ]);
  });

  it("writes the position in the line's number type", () => {
    const float = timestampAt(
      {
        block: "0000000000",
        granularity: GRANULARITY,
        line: {
          timeline: "recording",
          name: "Recording",
          unit: "seconds",
          numberType: "float",
          length: q(10),
          maps: [linear("recording_samples", null, 44100, 0, "samples", "seconds")],
        },
        segments: [],
      },
      q(1, 10),
    );
    const int = timestampAt(
      {
        block: "0000000000",
        granularity: GRANULARITY,
        line: {
          timeline: "video",
          name: "Video",
          unit: "frames",
          numberType: "int",
          length: q(100),
          maps: [linear("video_seconds", null, [1, 25], 0, "seconds", "frames")],
        },
        segments: [],
      },
      q(50),
    );
    expect([...readout(float), ...readout(int)]).toEqual([
      ["recording", false, 0.1, [["recording_samples", 4410n]]],
      ["video", false, 50n, [["video_seconds", 2]]],
    ]);
    expect(float.parts[0]?.maps[0]?.name).toBe(null);
  });

  it("gives no value outside a map's domain or without the rows a measure view reads", () => {
    const pieces: ConversionMap = {
      type: "PiecewiseMap",
      id: "pieces",
      name: "Tempo",
      source_unit: "quarters",
      target_unit: "seconds",
      breaks: [0, 4, 16],
      maps: [
        linear("first", null, [1, 2], 0, "seconds"),
        linear("second", null, [3, 5], [-2, 5], "seconds"),
      ],
    };
    const bars: ConversionMap = {
      type: "MeasureNumberMap",
      id: "bars",
      name: null,
      source_unit: "quarters",
      target_unit: null,
      measure_map: "measures",
    };
    const ticks = linear("ticks", null, 480, 0, "ticks");
    const spec: TimestampSpec = {
      block: "0000000000",
      granularity: GRANULARITY,
      line: {
        timeline: "score",
        name: "score",
        unit: "quarters",
        numberType: "fraction",
        length: q(16),
        maps: [pieces, bars, ticks],
      },
      segments: [],
    };
    const [part] = timestampAt(spec, q(16)).parts;
    expect(part?.maps.map((map) => [map.id, map.targetUnit, map.missingKnots, map.value])).toEqual([
      ["pieces", "seconds", null, null],
      ["bars", null, "no_server", null],
      ["ticks", "ticks", null, { unit: "ticks", numberType: "int", value: 7680n }],
    ]);
    const missing = (knots: Parameters<typeof timestampAt>[2]) =>
      timestampAt(spec, q(16), knots).parts[0]?.maps.map((map) => map.missingKnots);
    const reasons: KnotsAbsence[] = ["unsupported", "pending", "failed"];
    expect(reasons.map(missing)).toEqual(reasons.map((reason) => [null, reason, null]));
    expect(missing([{ id: "other", rows: [] }])).toEqual([null, "failed", null]);
  });
});

describe("the texts of a timestamp", () => {
  it("names its place by the line's name and coordinate, a float in the granularity's places", () => {
    expect(timestampPlace(timestampAt(FORM, q(27, 2)))).toBe("Form at 13 1/2 ♩");
    const recording: TimestampSpec = {
      block: "0000000000",
      granularity: { denominator: 2520, decimals: 1 },
      line: line("recording", "Recording", "seconds", "float", 10, []),
      segments: [],
    };
    expect(timestampPlace(timestampAt(recording, q(1234, 10000)))).toBe("Recording at 0.1 s");
  });

  it("shows a measure by its name, else its number, else its count", () => {
    const measure = {
      ID: "m3",
      name: "m. 3",
      count: 9,
      number: 7,
      qstamp: null,
      nominal_length: null,
      actual_length: null,
      offset_within_measure: [0, 1] as const,
    };
    expect([
      measureText(measure),
      measureText({ ...measure, name: "" }),
      measureText({ ...measure, name: "", number: null }),
    ]).toEqual(["m. 3", "7", "9"]);
  });

  it("says why a map has no value", () => {
    const reasons: (KnotsAbsence | null)[] = [
      null,
      "no_server",
      "unsupported",
      "pending",
      "failed",
    ];
    expect(reasons.map((missingKnots) => missingValueText({ missingKnots }))).toEqual([
      "no value here",
      "needs a server to expand its measure map",
      "the server cannot expand measure maps",
      "waiting for the server",
      "the server did not expand its measure map",
    ]);
  });
});

function line(
  timeline: string,
  name: string,
  unit: TimeUnit,
  numberType: TimestampTimeline["numberType"],
  length: number,
  maps: readonly ConversionMap[],
): TimestampTimeline {
  return { timeline, name, unit, numberType, length: q(length), maps };
}

/** A pin of `spec` at `position`, read without a server, unnamed. */
function pinOf(spec: TimestampSpec, position: Rational): Pin {
  return { spec, knots: "no_server", timestamp: timestampAt(spec, position), named: null };
}

const LINE: PinRow = { part: "line", map: null };
const SEGMENT: PinRow = { part: "segment", map: null };

describe("a pin", () => {
  const pin = pinOf(FORM, q(27, 2));

  it("moves to a position, its timestamp read anew", () => {
    const moved = pinAt(pin, q(8));
    expect([moved.spec, moved.knots, moved.named]).toEqual([FORM, "no_server", null]);
    expect(moved.spec).toBe(pin.spec);
    expect(moved.timestamp).toEqual(timestampAt(FORM, q(8)));
  });

  it("takes the line's and the segment's coordinate exactly", () => {
    expect([
      positionFor(pin, LINE, q(10)),
      positionFor(pin, LINE, q(1, 7)),
      positionFor(pin, SEGMENT, q(5, 2)),
    ]).toEqual([q(10), q(1, 7), q(21, 2)]);
  });

  it("inverts a map of the line and of the segment", () => {
    expect(positionFor(pin, { part: "line", map: "form_ticks" }, q(6480))).toEqual(q(27, 2));
    expect(positionFor(pin, { part: "segment", map: "B_tempo" }, q(119, 16))).toEqual(q(27, 2));
  });

  it("settles a float inverse on a fraction line, any inverse on an int line", () => {
    const fraction = pinOf(
      {
        block: "0000000000",
        granularity: GRANULARITY,
        line: line("f", "F", "quarters", "fraction", 32, [
          linear("f_seconds", null, 0.3, 0, "seconds"),
        ]),
        segments: [],
      },
      q(0),
    );
    expect(positionFor(fraction, { part: "line", map: "f_seconds" }, q(1))).toEqual(q(10, 3));
    const video = pinOf(
      {
        block: "0000000000",
        granularity: GRANULARITY,
        line: line("video", "Video", "frames", "int", 100, [
          linear("video_seconds", null, [1, 25], 0, "seconds", "frames"),
        ]),
        segments: [],
      },
      q(0),
    );
    expect(positionFor(video, { part: "line", map: "video_seconds" }, q(101, 50))).toEqual(q(51));
    const recording = pinOf(
      {
        block: "0000000000",
        granularity: GRANULARITY,
        line: line("recording", "Recording", "seconds", "float", 10, [
          linear("recording_samples", null, 44100, 0, "samples", "seconds"),
        ]),
        segments: [],
      },
      q(0),
    );
    expect(positionFor(recording, { part: "line", map: "recording_samples" }, q(4410))).toEqual(
      q(1, 10),
    );
  });

  it("refuses a value outside its part, a map it cannot invert and a row it does not show", () => {
    const fixed: ConversionMap = {
      type: "ConstantMap",
      id: "fixed",
      name: null,
      source_unit: "quarters",
      target_unit: "seconds",
      value: 3,
    };
    const withFixed = pinOf({ ...FORM, line: { ...FORM.line, maps: [fixed] } }, q(27, 2));
    const child = pinOf(
      {
        block: "0000000000",
        granularity: GRANULARITY,
        line: line("cons", "Consequent", "quarters", "fraction", 8, []),
        segments: [],
      },
      q(2),
    );
    const refusals = [
      positionFor(pin, LINE, q(33)),
      positionFor(pin, LINE, q(-1)),
      positionFor(pin, SEGMENT, q(13)),
      positionFor(pin, { part: "line", map: "form_ticks" }, q(19200)),
      positionFor(withFixed, { part: "line", map: "fixed" }, q(3)),
      positionFor(pin, { part: "line", map: "nope" }, q(3)),
      positionFor(child, SEGMENT, q(1)),
    ];
    expect(refusals.every((refusal) => isCommandError(refusal))).toBe(true);
    expect(refusals).toEqual(
      [
        "33 lies outside 'form' (0 to 32)",
        "-1 lies outside 'form' (0 to 32)",
        "13 lies outside 'B' (0 to 12)",
        "40 lies outside 'form' (0 to 32)",
        "no position on 'form' gives 3",
        "'form' shows no map 'nope'",
        "the timestamp shows no segment",
      ].map((message) => ({ code: "invalid_value", message, path: [] })),
    );
  });
});
