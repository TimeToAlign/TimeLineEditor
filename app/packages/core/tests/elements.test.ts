import { JsonFloat, type Selector, schema } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { ElementAddress, Facet, Part } from "../src/manifest/address.ts";
import { addressKey, FACETS } from "../src/manifest/address.ts";
import type { CardStamps, ElementKey } from "../src/manifest/elements.ts";
import {
  cardStamps,
  manifestElements,
  selectorMatches,
  timelineAncestry,
  timelineClass,
  unitDomain,
} from "../src/manifest/elements.ts";
import { memberDrawings } from "../src/manifest/files.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { Rational } from "../src/number/rational.ts";
import type { Real } from "../src/number/real.ts";
import { allFixtures, fileText, load, loadText, manifestValue } from "./support.ts";

const CLT = "ContinuousLogicalTimeline";

/** The address of the element `value`, with the part words `part`. */
const id = (value: string, ...part: Part[]): ElementAddress =>
  part.length === 0 ? { id: value } : { id: value, part };

/** The address of the band drawing the facet `facet` of the timeline `timeline`. */
const band = (timeline: string, facet: Facet): ElementAddress => ({ id: timeline, facet });

/** The addresses of a timeline's five bands, in the order of `FACETS`. */
const bandsOf = (timeline: string) => FACETS.map((facet) => band(timeline, facet));

/** The five bands of the child `phrase` of `map.yaml`. */
const PHRASE_BANDS = bandsOf("phrase");

/** The addresses of the keys a selector matches, in enumeration order. */
function matcher(keys: readonly ElementKey[], ancestry: ReadonlyMap<string, readonly string[]>) {
  return (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);
}

describe("the elements of a manifest", () => {
  it("enumerates map.yaml in tree order", () => {
    const melody = ["melody", "logical", "continuous", CLT] as const;
    const phrase = ["phrase", "logical", "continuous", CLT] as const;
    const line = ["block", "timeline"];
    const child = [...line, "band", "child"];
    const facet = (timeline: string, kind: Facet, inside: string[]) => [
      "band",
      band(timeline, kind),
      timeline,
      null,
      null,
      null,
      kind,
      inside,
    ];
    expect(
      manifestElements(load("map.yaml")).map((key) => [
        key.type,
        key.address,
        key.timeline,
        key.domain,
        key.modality,
        key.class,
        key.facet,
        key.inside,
      ]),
    ).toEqual([
      ["block", {}, null, null, null, null, null, []],
      ["card", id("melody", "card"), ...melody, null, ["block"]],
      ["timeline", id("melody"), ...melody, null, ["block"]],
      ["name", id("melody", "name"), ...melody, null, line],
      facet("melody", "children", line),
      ["child", id("phrase"), ...phrase, null, [...line, "band"]],
      ["name", id("phrase", "name"), ...phrase, null, child],
      facet("phrase", "children", child),
      facet("phrase", "conversion_maps", child),
      ["map", id("ticks"), "phrase", "logical", "discrete", "LinearMap", null, [...child, "band"]],
      facet("phrase", "markers", child),
      facet("phrase", "regions", child),
      facet("phrase", "flow_control", child),
      facet("melody", "conversion_maps", line),
      [
        "map",
        id("tempo"),
        "melody",
        "physical",
        "continuous",
        "LinearMap",
        null,
        [...line, "band"],
      ],
      facet("melody", "markers", line),
      ["wedge", id("timestamp_1"), ...melody, null, [...line, "band"]],
      ["label", id("timestamp_1", "coordinate"), ...melody, null, [...line, "band"]],
      ["wedge", id("timestamp_2"), ...melody, null, [...line, "band"]],
      ["label", id("timestamp_2", "coordinate"), ...melody, null, [...line, "band"]],
      facet("melody", "regions", line),
      facet("melody", "flow_control", line),
    ]);
  });

  it("lists what a named timestamp's display draws: wedge and labels in its band, its line on its line", () => {
    const root = ["block", "timeline"];
    const child = [...root, "band", "child"];
    // The wedge and labels `words` lists of a coordinate of `name` on `timeline`, primary or
    // secondary, in the markers band of the line `line`; a primary one's line held by the line.
    const stamp = (
      name: string,
      timeline: string,
      line: string[],
      words: readonly string[],
      coordinates: "primary" | "secondary",
    ) => [
      ...(words.includes("wedge")
        ? [["wedge", id(name), timeline, CLT, [...line, "band"], coordinates]]
        : []),
      ...(["name", "id", "coordinate"] as const)
        .filter((word) => words.includes(word))
        .map((word) => ["label", id(name, word), timeline, CLT, [...line, "band"], coordinates]),
      ...(words.includes("cross_section") && coordinates === "primary"
        ? [["cross_section", id(name, "line"), timeline, CLT, line, undefined]]
        : []),
    ];
    // clt_1 (8 quarters) holds clt_2 at 2 (4 quarters, spanning 2 to 6 on clt_1's axis):
    // timestamp_1 at 3/2 lies on clt_1 alone; timestamp_2 at 6 also on clt_2, at its end;
    // timestamp_3 at 1 on clt_2 lies at 2 + 1 = 3 on clt_1. Each band lists its timeline's own
    // timestamps, then the secondary coordinates on it, in the order of `timestamps`.
    expect(
      manifestElements(load("timestamps.yaml"))
        .filter((key) => key.address.id?.startsWith("timestamp_") === true)
        .map((key) => [
          key.type,
          key.address,
          key.timeline,
          key.class,
          key.inside,
          key.coordinates,
        ]),
    ).toEqual([
      ...stamp(
        "timestamp_3",
        "clt_2",
        child,
        ["wedge", "name", "id", "coordinate", "cross_section"],
        "primary",
      ),
      ...stamp("timestamp_2", "clt_2", child, ["wedge", "name"], "secondary"),
      ...stamp("timestamp_1", "clt_1", root, ["wedge", "name", "cross_section"], "primary"),
      ...stamp("timestamp_2", "clt_1", root, ["wedge", "name"], "primary"),
      ...stamp(
        "timestamp_3",
        "clt_1",
        root,
        ["wedge", "name", "id", "coordinate", "cross_section"],
        "secondary",
      ),
    ]);
  });

  it("gives regions, flow markers and jump origins their drawn addresses, each with a label", () => {
    const addresses = (name: string) =>
      manifestElements(load(name))
        .filter((key) => ["region", "flow_marker", "jump_from"].includes(key.type as string))
        .map((key) => key.address);
    expect(addresses("with_region.yaml")).toEqual([id("region_1")]);
    expect(
      manifestElements(load("with_region.yaml")).find((key) => key.type === "region")?.inside,
    ).toEqual(["block", "timeline", "band"]);
    const flow = "flow:quarters";
    expect(
      manifestElements(load("flow_control.yaml")).map((key) => [key.type, key.address]),
    ).toEqual([
      ["block", {}],
      ["card", id(flow, "card")],
      ["timeline", id(flow)],
      ["name", id(flow, "name")],
      ["band", band(flow, "children")],
      ["band", band(flow, "conversion_maps")],
      ["band", band(flow, "markers")],
      ["wedge", id("timestamp_1")],
      ["label", id("timestamp_1", "coordinate")],
      ["wedge", id("timestamp_2")],
      ["label", id("timestamp_2", "coordinate")],
      ["band", band(flow, "regions")],
      ["band", band(flow, "flow_control")],
      ["flow_marker", id("flow_marker_1")],
      ["label", id("flow_marker_1", "label")],
      ["jump_from", id("jump_from_1")],
      ["label", id("jump_from_1", "label")],
      ["jump_from", id("jump_from_2")],
      ["label", id("jump_from_2", "label")],
    ]);
  });

  it("enumerates every manifest fixture of one root with unique addresses on each timeline", () => {
    // A secondary coordinate's wedge and labels carry its timestamp's addresses on the timeline
    // they mark (section 2.2); a root's card draws each timeline once.
    for (const { name, text } of allFixtures.filter((item) => !item.name.includes("/"))) {
      const addresses = manifestElements(loadText(text)).map(
        (key) => `${key.timeline} ${addressKey(key.address)}`,
      );
      expect([name, new Set(addresses).size]).toEqual([name, addresses.length]);
    }
  });

  it("lists the title of a named manifest, addressed by the part name alone", () => {
    const title = { ...BLOCK_NAME };
    const top = (members: object) =>
      manifestElements(loadText(fileText({ ...manifestValue("bare.yaml"), ...members })))[1];
    expect(top({ name: "Piece" })).toEqual(title);
    expect(top({ id: "edition" })).toEqual(title);
    expect(top({})?.type).toBe("card");
  });

  it("lists every alignment anchor's line after the items, and its label where display names it", () => {
    const manifest = load("bundles/bundle_matchstamps.yaml");
    const keys = manifestElements(manifest);
    const unowned = (type: string, address: ElementAddress, inside: string[]) => ({
      type,
      address,
      timeline: null,
      domain: null,
      modality: null,
      class: null,
      facet: null,
      inside,
    });
    expect(keys.slice(-3)).toEqual([
      unowned("alignment_anchor", id("anchor_1"), ["block"]),
      unowned("label", id("anchor_1", "name"), ["block", "alignment_anchor"]),
      unowned("alignment_anchor", id("anchor_2"), ["block"]),
    ]);
    expect(keys.filter((key) => key.address.id?.startsWith("anchor_") === true)).toHaveLength(3);
    const matches = matcher(keys, timelineAncestry(manifest));
    expect(matches({ element: "alignment_anchor" })).toEqual([id("anchor_1"), id("anchor_2")]);
    expect(matches({ inside: "alignment_anchor" })).toEqual([id("anchor_1", "name")]);
    expect(
      matches({ within: "score" }).filter((address) => address.id?.startsWith("anchor_")),
    ).toEqual([]);
  });

  describe("the line of a groupstamp", () => {
    const LINE = id("timestamp_1", "line");
    const line = (timeline: string, inside: string[]) => ({
      type: "cross_section",
      address: LINE,
      timeline,
      domain: "logical",
      modality: "continuous",
      class: CLT,
      facet: null,
      inside,
    });
    const atLine = (keys: readonly ElementKey[]) =>
      keys.filter((key) => addressKey(key.address) === addressKey(LINE));
    const PRIMARY = ["block", "frame", "timeline"];
    const FRAME = ["block", "frame"];

    it("is listed again for every frame drawing it, held by the frame, after the members", () => {
      const cases = [
        ["groups/group_groupstamp.yaml", [line("score", PRIMARY), line("score", FRAME)]],
        [
          "groups/group_groupstamp_child_member.yaml",
          [
            line("second-half", ["block", "frame", "timeline", "band", "child"]),
            line("second-half", FRAME),
          ],
        ],
        [
          "bundles/bundle_groupstamp_shared_member.yaml",
          [line("t", PRIMARY), line("t", PRIMARY), line("t", FRAME), line("t", FRAME)],
        ],
      ] as const;
      for (const [name, expected] of cases) {
        const keys = manifestElements(load(name));
        expect([name, atLine(keys)]).toEqual([name, expected]);
        const frames = expected.filter((key) => key.inside.length === 2).length;
        expect([name, keys.slice(-frames)]).toEqual([name, expected.slice(-frames)]);
      }
    });

    it("is not listed again where the timestamp is no groupstamp or lists no line", () => {
      const manifest = load("groups/group_groupstamp.yaml");
      const edited = (change: object): Manifest => ({
        ...manifest,
        graphical: {
          ...manifest.graphical,
          timestamps: (manifest.graphical?.timestamps ?? []).map((timestamp) =>
            timestamp.id === "timestamp_1" ? { ...timestamp, ...change } : timestamp,
          ),
        },
      });
      expect(atLine(manifestElements(edited({ groupstamp: false })))).toEqual([
        line("score", PRIMARY),
      ]);
      expect(atLine(manifestElements(edited({ display: ["wedge", "name"] })))).toEqual([]);
    });

    it("is matched inside the frame at both of its keys", () => {
      const manifest = load("groups/group_groupstamp.yaml");
      const matches = matcher(manifestElements(manifest), timelineAncestry(manifest));
      expect(
        matches({ element: "cross_section", inside: "frame" }).filter(
          (address) => addressKey(address) === addressKey(LINE),
        ),
      ).toEqual([LINE, LINE]);
    });
  });
});

const BLOCK_NAME = {
  type: "name",
  address: { part: ["name"] },
  timeline: null,
  domain: null,
  modality: null,
  class: null,
  facet: null,
  inside: ["block"],
};

describe("timeline classes", () => {
  it("derive from the unit, each unit belonging to exactly one class", () => {
    const classes = {
      ContinuousLogicalTimeline: ["number", "floating_measures", "whole_notes", "quarters"],
      DiscreteLogicalTimeline: ["ticks"],
      ContinuousPhysicalTimeline: ["milliseconds", "seconds", "minutes"],
      DiscretePhysicalTimeline: ["samples", "frames"],
      ContinuousGraphicalTimeline: [
        "meters",
        "centimeters",
        "millimeters",
        "inches",
        "points",
        "css_pixels",
        "user_units",
      ],
      DiscreteGraphicalTimeline: ["pixels"],
    } as const;
    const units = Object.values(classes).flat();
    expect([...units].sort()).toEqual(
      schema.$defs.TimeUnit.oneOf.map((entry) => entry.const).sort(),
    );
    for (const [name, own] of Object.entries(classes)) {
      for (const unit of own) expect([unit, timelineClass(unit)]).toEqual([unit, name]);
    }
  });

  it("give a map the domain and modality of its target unit, number included", () => {
    expect(unitDomain("number")).toEqual(["logical", "continuous"]);
    expect(unitDomain("samples")).toEqual(["physical", "discrete"]);
    expect(unitDomain(null)).toBe(null);
  });
});

describe("selector matching", () => {
  const manifest = load("map.yaml");
  const keys = manifestElements(manifest);
  const matched = matcher(keys, timelineAncestry(manifest));

  it.each([
    [{ element: "map", domain: "physical" }, [id("tempo")]],
    [
      { within: "phrase" },
      [
        id("phrase"),
        id("phrase", "name"),
        ...PHRASE_BANDS.slice(0, 2),
        id("ticks"),
        ...PHRASE_BANDS.slice(2),
      ],
    ],
    [{ addresses: [{ id: "tempo" }] }, [id("tempo")]],
    [{ class: "LinearMap" }, [id("ticks"), id("tempo")]],
    [{ modality: "discrete" }, [id("ticks")]],
    [{ element: "card" }, [id("melody", "card")]],
    [{ element: "card", domain: "logical" }, [id("melody", "card")]],
    [
      { element: "band" },
      [
        band("melody", "children"),
        ...PHRASE_BANDS,
        band("melody", "conversion_maps"),
        band("melody", "markers"),
        band("melody", "regions"),
        band("melody", "flow_control"),
      ],
    ],
    [{ element: "band", facet: "regions" }, [band("phrase", "regions"), band("melody", "regions")]],
    [{ facet: "children" }, [band("melody", "children"), band("phrase", "children")]],
    [{ facet: "markers" }, [band("phrase", "markers"), band("melody", "markers")]],
    [{ class: "regions" }, []],
    [{ addresses: [{ id: "phrase", facet: "regions" }] }, [band("phrase", "regions")]],
    [
      { addresses: [{ id: "timestamp_2", part: ["coordinate"] }, { id: "ticks" }] },
      [id("ticks"), id("timestamp_2", "coordinate")],
    ],
    [{ addresses: [{ id: "timestamp_2", part: ["coordinate", "label"] }] }, []],
    [{ addresses: [{ id: "melody", part: ["card"] }] }, [id("melody", "card")]],
    [{ addresses: [{ part: ["name"] }] }, []],
    [{ element: "band", domain: "logical" }, []],
    [{ element: "band", modality: "continuous" }, []],
  ] as [Selector, ElementAddress[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches everything with the empty selector", () => {
    expect(matched({})).toEqual(keys.map((key) => key.address));
    expect(keys.length).toBe(22);
  });

  it("matches a free ID as a whole", () => {
    const free = load("bundles/bundle_free_ids.yaml");
    const rule = free.graphical?.rules?.[0];
    expect(rule?.select).toEqual({ addresses: [{ id: "take 2/intro" }] });
    const found = manifestElements(free).filter((key) =>
      selectorMatches(rule?.select ?? {}, key, timelineAncestry(free)),
    );
    expect(found.map((key) => [key.type, key.address, key.timeline])).toEqual([
      ["region", id("take 2/intro"), "perf/take 2"],
    ]);
  });
});

describe("the selector member inside", () => {
  const manifest = load("map.yaml");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = matcher(keys, ancestry);

  it.each([
    [
      { inside: "child" },
      [id("phrase", "name"), ...PHRASE_BANDS.slice(0, 2), id("ticks"), ...PHRASE_BANDS.slice(2)],
    ],
    [
      { inside: "band" },
      [
        id("phrase"),
        id("phrase", "name"),
        ...PHRASE_BANDS.slice(0, 2),
        id("ticks"),
        ...PHRASE_BANDS.slice(2),
        id("tempo"),
        id("timestamp_1"),
        id("timestamp_1", "coordinate"),
        id("timestamp_2"),
        id("timestamp_2", "coordinate"),
      ],
    ],
    [{ element: "band", inside: "band" }, PHRASE_BANDS],
    [{ inside: "wedge" }, []],
    [{ inside: "card" }, []],
    [{ inside: "map" }, []],
    [{ element: "name", inside: "child" }, [id("phrase", "name")]],
  ] as [Selector, ElementAddress[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches every key but the block inside the block, every key after the line inside it", () => {
    expect(matched({ inside: "block" })).toEqual(keys.slice(1).map((key) => key.address));
    expect(keys[2]?.address).toEqual(id("melody"));
    expect(matched({ inside: "timeline" })).toEqual(keys.slice(3).map((key) => key.address));
  });

  it("reads the holder chain and nothing else", () => {
    const mark: ElementKey = {
      type: "wedge",
      address: id("melody", "start"),
      timeline: "melody",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      facet: null,
      inside: ["block", "frame", "timeline", "ancestor"],
    };
    const test = (select: Selector) => selectorMatches(select, mark, ancestry);
    expect([
      test({ inside: "frame" }),
      test({ inside: "ancestor" }),
      test({ inside: "child" }),
    ]).toEqual([true, true, false]);
  });
});

describe("the elements of a segment line", () => {
  const manifest = load("segment_line.yaml");
  const keys = manifestElements(manifest);
  const matched = matcher(keys, timelineAncestry(manifest));
  const row = (facet: ElementAddress) => ["band", facet];
  /** The (type, address) pairs of a timeline's five bands. */
  const five = (timeline: string) => bandsOf(timeline).map(row);
  /** The last four of them: conversion maps, markers, regions, flow control. */
  const four = (timeline: string) => five(timeline).slice(1);
  const find = (address: ElementAddress) =>
    keys.find((key) => addressKey(key.address) === addressKey(address));

  it("enumerates segments in their children bands, boundaries and labels on their lines", () => {
    // The secondary coordinates of `timestamp_N` in a markers band: `origin` at 0 lies on `a`
    // (0 to 8) and its segment `a1`, `length` at 32 on `c` (20 to 32) and `c1`; `b` (8 to 20)
    // holds neither.
    const marked = (stamp: string) => [
      ["wedge", id(stamp)],
      ["label", id(stamp, "coordinate")],
    ];
    /** The rows of five bands with `held` after the markers band. */
    const withMarks = (timeline: string, held: unknown[][]) => {
      const rows = five(timeline);
      return [...rows.slice(0, 3), ...held, ...rows.slice(3)];
    };
    expect(keys.map((key) => [key.type, key.address])).toEqual([
      ["block", {}],
      ["card", id("form", "card")],
      ["timeline", id("form")],
      ["name", id("form", "name")],
      row(band("form", "children")),
      ["child", id("a")],
      ["label", id("a", "label")],
      row(band("a", "children")),
      [null, id("a1")],
      ["label", id("a1", "label")],
      ...withMarks("a1", marked("timestamp_1")),
      ...withMarks("a", marked("timestamp_1")).slice(1),
      ["child", id("b")],
      ["boundary", id("b", "start")],
      ["label", id("b", "label")],
      row(band("b", "children")),
      [null, id("b1")],
      ["label", id("b1", "label")],
      ...five("b1"),
      [null, id("b2")],
      ["boundary", id("b2", "start")],
      ["label", id("b2", "label")],
      ...five("b2"),
      ...four("b"),
      ["child", id("c")],
      ["boundary", id("c", "start")],
      ["label", id("c", "label")],
      row(band("c", "children")),
      [null, id("c1")],
      ["label", id("c1", "label")],
      ...withMarks("c1", marked("timestamp_2")),
      ...withMarks("c", marked("timestamp_2")).slice(1),
      row(band("form", "conversion_maps")),
      row(band("form", "markers")),
      ["wedge", id("timestamp_1")],
      ["label", id("timestamp_1", "coordinate")],
      ["wedge", id("timestamp_2")],
      ["label", id("timestamp_2", "coordinate")],
      row(band("form", "regions")),
      row(band("form", "flow_control")),
    ]);
    expect(find(id("b", "start"))).toEqual({
      type: "boundary",
      address: id("b", "start"),
      timeline: "b",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      facet: null,
      inside: ["block", "timeline"],
    });
    expect(find(id("b", "label"))?.inside).toEqual(["block", "timeline"]);
    for (const address of [id("b2", "start"), id("b2", "label")]) {
      expect([address, find(address)?.inside]).toEqual([
        address,
        ["block", "timeline", "band", "child"],
      ]);
    }
    for (const address of [id("a1"), ...bandsOf("a1")]) {
      expect([address, find(address)?.inside]).toEqual([
        address,
        ["block", "timeline", "band", "child", "band"],
      ]);
    }
  });

  it.each([
    [{ element: "boundary" }, [id("b", "start"), id("b2", "start"), id("c", "start")]],
    [{ element: "child" }, [id("a"), id("b"), id("c")]],
    [{ addresses: [{ id: "b" }] }, [id("b")]],
    [
      { within: "b" },
      [
        id("b"),
        id("b", "start"),
        id("b", "label"),
        band("b", "children"),
        id("b1"),
        id("b1", "label"),
        ...bandsOf("b1"),
        id("b2"),
        id("b2", "start"),
        id("b2", "label"),
        ...bandsOf("b2"),
        ...bandsOf("b").slice(1),
      ],
    ],
  ] as [Selector, ElementAddress[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  const regions = ["a1", "a", "b1", "b2", "b", "c1", "c"].map((timeline) =>
    band(timeline, "regions"),
  );

  it.each([
    [{ element: "band", facet: "regions" }, [...regions, band("form", "regions")]],
    [{ element: "band", facet: "regions", inside: "band" }, regions],
  ] as [Selector, ElementAddress[]][])(
    "matches the bands of a root, a child and a segment: %j",
    (select, expected) => {
      expect(matched(select)).toEqual(expected);
    },
  );

  it("holds in a band everything but the root's line, its bands and its segments' parts", () => {
    const outside = [
      {},
      id("form", "card"),
      id("form"),
      id("form", "name"),
      ...bandsOf("form"),
      id("a", "label"),
      id("b", "start"),
      id("b", "label"),
      id("c", "start"),
      id("c", "label"),
    ].map(addressKey);
    expect(matched({ inside: "band" })).toEqual(
      keys.map((key) => key.address).filter((address) => !outside.includes(addressKey(address))),
    );
    expect(keys.filter((key) => outside.includes(addressKey(key.address))).length).toBe(
      outside.length,
    );
  });
});

/** A value as the test writes it: an exact one as `n/d`, a float as the number, none as `null`. */
const shownValue = (value: Real | null): string | number | null =>
  value instanceof Rational ? `${value.numerator}/${value.denominator}` : value;

describe("the secondary coordinates of a card", () => {
  /** The card of `member` in the frame of `group`, or outside every frame. */
  const cardIn = (manifest: Manifest, member: string, group: string | null) => {
    const { frames } = memberDrawings(manifest);
    const frame = group === null ? null : frames.find((item) => item.group.id === group);
    const drawing = frames
      .flatMap((item) => item.members)
      .find((item) => item.timeline.id === member);
    if (frame === undefined || drawing === undefined) throw new Error(`no card of ${member}`);
    return cardStamps(manifest, drawing, frame);
  };
  /**
   * A card's stamps as `[timestamp, position, source]` and its secondaries by timeline as
   * `[timestamp, position, value]`.
   */
  const written = (card: CardStamps) => ({
    window: card.window.map(shownValue),
    stamps: card.stamps.map((stamp) => [
      stamp.timestamp.id,
      shownValue(stamp.position),
      stamp.source,
    ]),
    secondaries: [...card.secondaries].map(([timeline, stamps]) => [
      timeline,
      stamps.map((stamp) => [
        stamp.timestamp.id,
        shownValue(stamp.position),
        shownValue(stamp.value),
      ]),
    ]),
  });
  /** The secondary keys of an enumeration: type, address, timeline and chain. */
  const secondaryKeys = (manifest: Manifest) =>
    manifestElements(manifest)
      .filter((key) => key.coordinates === "secondary")
      .map((key) => [key.type, key.address, key.timeline, key.inside.join(" ")]);

  it("crosses another member's card at the same proportion of its drawn length", () => {
    const manifest = load("groups/group_groupstamp.yaml");
    // `timestamp_1` at 4 of `score`'s 8 quarters: a half, 2.0 of `performance`'s 4.0 seconds.
    expect(written(cardIn(manifest, "performance", "group_1"))).toEqual({
      window: [0, 4],
      stamps: [
        ["timestamp_2", 0, "member"],
        ["timestamp_3", 4, "member"],
        ["timestamp_1", 2, "frame"],
      ],
      secondaries: [["performance", [["timestamp_1", 2, 2]]]],
    });
    expect(written(cardIn(manifest, "score", "group_1"))).toEqual({
      window: ["0/1", "8/1"],
      stamps: [
        ["timestamp_4", "0/1", "member"],
        ["timestamp_1", "4/1", "member"],
        ["timestamp_5", "8/1", "member"],
      ],
      secondaries: [],
    });
    // Outside a frame no groupstamp of another member crosses the card.
    expect(written(cardIn(manifest, "performance", null)).secondaries).toEqual([]);
    expect(secondaryKeys(manifest)).toEqual([
      ["wedge", id("timestamp_1"), "performance", "block frame timeline band"],
      ["label", id("timestamp_1", "name"), "performance", "block frame timeline band"],
    ]);
  });

  it("reads a groupstamp on a child of a member on the member's drawn length", () => {
    const manifest = load("groups/group_groupstamp_child_member.yaml");
    // `timestamp_1` at 2 on `second-half`, 4 to 8 on `score` (8): at 6 on `score`, 6/8 of it,
    // and so at 6/8 × 4.0 = 3.0 on `performance`; `score`'s `length` (8) lies on `second-half`'s
    // end, its `origin` (0) before its start.
    expect(written(cardIn(manifest, "score", "group_1")).secondaries).toEqual([
      ["score", [["timestamp_1", "6/1", "6/1"]]],
      ["second-half", [["timestamp_5", "8/1", "4/1"]]],
    ]);
    expect(written(cardIn(manifest, "performance", "group_1")).secondaries).toEqual([
      ["performance", [["timestamp_1", 3, 3]]],
    ]);
    expect(secondaryKeys(manifest)).toEqual([
      // `score`'s children band, holding `second-half`, precedes its markers band.
      ["wedge", id("timestamp_5"), "second-half", "block frame timeline band child band"],
      [
        "label",
        id("timestamp_5", "coordinate"),
        "second-half",
        "block frame timeline band child band",
      ],
      ["wedge", id("timestamp_1"), "score", "block frame timeline band"],
      ["label", id("timestamp_1", "name"), "score", "block frame timeline band"],
      ["wedge", id("timestamp_1"), "performance", "block frame timeline band"],
      ["label", id("timestamp_1", "name"), "performance", "block frame timeline band"],
    ]);
  });

  it("crosses each member of a shared member's groups in its own frame only", () => {
    const manifest = load("bundles/bundle_groupstamp_shared_member.yaml");
    // `timestamp_1` at 4 of `t`'s 8: on `u` (4.0) at 2.0 in `g1`, on `v` (800) at 400 in `g2`.
    expect(written(cardIn(manifest, "u", "g1")).secondaries).toEqual([
      ["u", [["timestamp_1", 2, 2]]],
    ]);
    expect(written(cardIn(manifest, "v", "g2")).secondaries).toEqual([
      ["v", [["timestamp_1", "400/1", "400/1"]]],
    ]);
    for (const group of ["g1", "g2"]) {
      const card = cardIn(manifest, "t", group);
      expect(card.secondaries.size).toBe(0);
      expect(card.stamps.filter((stamp) => stamp.timestamp.id === "timestamp_1").length).toBe(1);
    }
    expect(secondaryKeys(manifest)).toEqual([
      ["wedge", id("timestamp_1"), "u", "block frame timeline band"],
      ["label", id("timestamp_1", "name"), "u", "block frame timeline band"],
      ["wedge", id("timestamp_1"), "v", "block frame timeline band"],
      ["label", id("timestamp_1", "name"), "v", "block frame timeline band"],
    ]);
  });

  it("reads a secondary coordinate exactly, written in its timeline's number type", () => {
    const value = manifestValue("bundles/bundle_groupstamp_shared_member.yaml");
    const graphical = value.graphical as { timestamps: object[] };
    const groupstamp = (id: string, timeline: string, coordinate: unknown) => ({
      coordinate,
      display: ["wedge", "coordinate"],
      groupstamp: true,
      id,
      matchstamp: false,
      name: id,
      timeline,
    });
    const manifest = loadText(
      fileText({
        ...value,
        graphical: {
          ...graphical,
          timestamps: [
            ...graphical.timestamps,
            groupstamp("a", "u", new JsonFloat(1)),
            groupstamp("b", "t", [1, 200]),
            groupstamp("c", "t", [1, 40]),
          ],
        },
      }),
    );
    // `a` at the float 1.0 of `u`'s 4.0: on `t` (fraction, 8) at the exact 2, not the float 2.0.
    expect(written(cardIn(manifest, "t", "g1")).secondaries).toEqual([
      ["t", [["a", "2/1", "2/1"]]],
    ]);
    // `b` and `c` at 1/200 and 1/40 of `t`'s 8: on `u` (float, 4.0) at 1/400 and 1/80, a float
    // member's positions and values the floats nearest them.
    expect(written(cardIn(manifest, "u", "g1")).secondaries).toEqual([
      [
        "u",
        [
          ["b", 0.0025, 0.0025],
          ["c", 0.0125, 0.0125],
          ["timestamp_1", 2, 2],
        ],
      ],
    ]);
    // On `v` (int, 800) at 1/2 and 5/2, rounded half to even: 0 and 2.
    expect(written(cardIn(manifest, "v", "g2")).secondaries).toEqual([
      [
        "v",
        [
          ["b", "1/2", "0/1"],
          ["c", "5/2", "2/1"],
          ["timestamp_1", "400/1", "400/1"],
        ],
      ],
    ]);
  });

  describe("where a length of the group is not known", () => {
    /**
     * `group_groupstamp.yaml` with `timestamp_1` listing its coordinate label and the timelines
     * `unknown` of unknown length.
     */
    const grouped = (...unknown: string[]) => {
      const value = manifestValue("groups/group_groupstamp.yaml");
      const graphical = value.graphical as { timestamps: { id: string }[] };
      const timelines = value.timelines as { id: string }[];
      return loadText(
        fileText({
          ...value,
          timelines: timelines.map((timeline) =>
            unknown.includes(timeline.id) ? { ...timeline, length: null } : timeline,
          ),
          graphical: {
            ...graphical,
            timestamps: graphical.timestamps.map((timestamp) =>
              timestamp.id === "timestamp_1"
                ? { ...timestamp, display: ["wedge", "name", "coordinate", "cross_section"] }
                : timestamp,
            ),
          },
        }),
      );
    };
    /** The secondary keys on `performance` but a coordinate label. */
    const WEDGE_AND_NAME = [
      ["wedge", id("timestamp_1"), "performance", "block frame timeline band"],
      ["label", id("timestamp_1", "name"), "performance", "block frame timeline band"],
    ];

    it("gives the coordinate a value and a label where both lengths are known", () => {
      const manifest = grouped();
      expect(written(cardIn(manifest, "performance", "group_1")).secondaries).toEqual([
        ["performance", [["timestamp_1", 2, 2]]],
      ]);
      expect(secondaryKeys(manifest)).toEqual([
        ...WEDGE_AND_NAME,
        ["label", id("timestamp_1", "coordinate"), "performance", "block frame timeline band"],
      ]);
    });

    it("gives no value on a member of unknown length, where its line is drawn", () => {
      // `performance`'s reach is its `length` timestamp's 4.0, so `timestamp_1` lies at 2.
      const manifest = grouped("performance");
      expect(written(cardIn(manifest, "performance", "group_1"))).toEqual({
        window: [0, 4],
        stamps: [
          ["timestamp_2", 0, "member"],
          ["timestamp_3", 4, "member"],
          ["timestamp_1", 2, "frame"],
        ],
        secondaries: [["performance", [["timestamp_1", 2, null]]]],
      });
      expect(secondaryKeys(manifest)).toEqual(WEDGE_AND_NAME);
    });

    it("gives the other members no value from a groupstamp on a member of unknown length", () => {
      // `score`'s reach is its `length` timestamp's exact 8, so `timestamp_1` at 4 is a half.
      const manifest = grouped("score");
      expect(written(cardIn(manifest, "score", "group_1")).window).toEqual(["0/1", "8/1"]);
      expect(written(cardIn(manifest, "performance", "group_1")).secondaries).toEqual([
        ["performance", [["timestamp_1", 2, null]]],
      ]);
      expect(secondaryKeys(manifest)).toEqual(WEDGE_AND_NAME);
    });
  });
});

describe("the selector member coordinates", () => {
  const LABELS = new Set(["name", "id", "coordinate"]);
  /** What a key marks, read off its address: the timestamp's coordinate it is, or nothing. */
  function marked(manifest: Manifest, key: ElementKey): "primary" | "secondary" | undefined {
    const stamp = (manifest.graphical?.timestamps ?? []).find((item) => item.id === key.address.id);
    if (stamp === undefined || key.address.facet !== undefined) return undefined;
    const { part } = key.address;
    const marks =
      (key.type === "wedge" && part === undefined) ||
      (key.type === "label" && part?.length === 1 && LABELS.has(part[0] ?? ""));
    if (!marks) return undefined;
    return key.timeline === stamp.timeline ? "primary" : "secondary";
  }

  it("matches the wedges and stack labels of named timestamps and nothing else", () => {
    const seen = new Set<string>();
    for (const { name, text } of allFixtures) {
      const manifest = loadText(text);
      const ancestry = timelineAncestry(manifest);
      for (const key of manifestElements(manifest)) {
        const expected = marked(manifest, key);
        if (expected !== undefined) seen.add(expected);
        expect([
          name,
          key.type,
          key.address,
          selectorMatches({ coordinates: "primary" }, key, ancestry),
          selectorMatches({ coordinates: "secondary" }, key, ancestry),
        ]).toEqual([name, key.type, key.address, expected === "primary", expected === "secondary"]);
      }
    }
    expect([...seen].sort()).toEqual(["primary", "secondary"]);
  });

  it("narrows an element type to one kind of coordinate", () => {
    const manifest = load("timestamps.yaml");
    const matched = matcher(manifestElements(manifest), timelineAncestry(manifest));
    expect(matched({ element: "label", coordinates: "secondary" })).toEqual([
      id("timestamp_2", "name"),
      id("timestamp_3", "name"),
      id("timestamp_3", "id"),
      id("timestamp_3", "coordinate"),
    ]);
  });
});
