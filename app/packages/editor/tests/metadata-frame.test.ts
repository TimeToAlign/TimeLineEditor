/** The Metadata tab's view model; the expected values are derived in `README.md` ("The Metadata tab"). */

import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, View } from "@timetoalign/tilie-core";
import { canonicalText, DEFAULT_USER } from "@timetoalign/tilie-core";
import { defaultCatalogue, fontMetrics } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  compactIri,
  systemChoices,
  typesOf,
  verbChoices,
} from "../src/inspector/metadata/catalogue.ts";
import type { Frame, RectangleView } from "../src/inspector/metadata/frame.ts";
import {
  drawersOf,
  rectanglesOf,
  rectangleWords,
  SELECT_HINT,
  shownOf,
  whoOf,
} from "../src/inspector/metadata/frame.ts";
import { fixture, storeOf } from "./support.ts";

const A = "0000000000";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
/** The shipped catalogue: what the tab offers without type profiles. */
const CATALOGUE = defaultCatalogue();

const T = "https://example.org/agents/tilie";
const P = "https://example.org/people/editor";
const CPT_1 = "timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical'";
const BUNDLE = "bundle 'LayerIt, Clair de lune mm. 1–6 (Pires)'";
const SEE_ALSO =
  "https://github.com/FernandoAze/LayerIt/tree/c88ca33065d49f622fca7225b784240df34a0fe8/src/input_files/ClairDeLune";
const MB_WORK = "http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96";

const view: View = storeOf(fixture("statements/layerit_recording")).view;

/** What the tab shows with `addresses` selected (none: nothing selected). */
function shown(...addresses: Address[]) {
  return shownOf(view, resolveSelection(view, selectionOf(addresses), null, fontMetrics), null);
}

/** The frame of the timeline `id`, or of the bundle for `null`. */
function frame(id: string | null): Frame {
  const found = shown(id === null ? { block: A } : { block: A, id });
  if (found.kind === "none") throw new Error(found.hint);
  return found;
}

const rectangles = (id: string | null) => rectanglesOf(frame(id), CATALOGUE, DEFAULT_USER);
const headings = (list: readonly RectangleView[]) => list.map((rectangle) => rectangle.heading);
const rows = (rectangle: RectangleView | undefined) =>
  rectangle?.rows.map((row) => [row.property, row.value, row.href]);
const lines = (rectangle: RectangleView | undefined) =>
  rectangle?.entries.map((line) =>
    line === null ? null : [line.method, line.who, line.date, line.service, line.basis, line.match],
  );

describe("what the tab shows", () => {
  it("frames a timeline by its target, words, path and key", () => {
    const cpt1 = frame("cpt_1");
    expect([cpt1.kind, cpt1.target, cpt1.id, cpt1.words, cpt1.path, cpt1.key]).toEqual([
      "timeline",
      { block: A, id: "cpt_1" },
      "cpt_1",
      CPT_1,
      ["timelines", 1],
      '{"block":"0000000000","id":"cpt_1"}',
    ]);
  });

  it("frames the bundle when its block is selected, or nothing among one block", () => {
    for (const found of [shown({ block: A }), shown()]) {
      if (found.kind === "none") throw new Error(found.hint);
      expect([found.kind, found.target, found.id, found.words, found.path]).toEqual([
        "bundle",
        { block: A },
        null,
        BUNDLE,
        [],
      ]);
    }
  });

  it("names what has no statements, and asks for one subject among several", () => {
    expect(shown({ block: A, id: "group_1" })).toEqual({
      kind: "none",
      hint: "Group 'recording' has no statements: a bundle, a timeline or a region has. Select its block, a timeline or a region.",
    });
    expect(shown({ block: A, id: "cpt_1" }, { block: A, id: "dpt_1" })).toEqual({
      kind: "none",
      hint: SELECT_HINT,
    });
  });
});

describe("the rectangles and drawers of the LayerIt recording", () => {
  it("reads cpt_1 as is a, performed by, same as", () => {
    const [isA, performed, same, ...rest] = rectangles("cpt_1");
    expect(rest).toEqual([]);
    expect(headings(rectangles("cpt_1"))).toEqual(["is a", "performed by", "same as"]);
    expect([isA?.key, isA?.label]).toEqual(['["type","schema:VideoObject"]', null]);
    expect(rows(isA)).toEqual([
      ["type", "schema:VideoObject", "http://schema.org/VideoObject"],
      ["type", "melod:Manifestation", "https://lod.academy/melod/vocab/ontology#Manifestation"],
      ["wdt:P31", "wd:Q98069877", "http://www.wikidata.org/entity/Q98069877"],
    ]);
    expect(lines(isA)).toEqual([null, null, null]);

    expect(performed?.label).toBe("Maria João Pires");
    expect(rows(performed)).toEqual([
      ["rel:prf", "viaf:113931950", "http://viaf.org/viaf/113931950"],
      ["wdt:P175", "wd:Q235650", "http://www.wikidata.org/entity/Q235650"],
    ]);
    expect(performed?.things).toEqual([
      { system: "viaf", iri: "http://viaf.org/viaf/113931950" },
      { system: "wikidata", iri: "http://www.wikidata.org/entity/Q235650" },
      { system: "gnd", iri: "https://d-nb.info/gnd/124927521" },
    ]);
    expect(lines(performed)).toEqual([
      [
        "reconciled",
        T,
        "2026-11-18",
        null,
        ["http://www.wikidata.org/entity/Q235650", "https://d-nb.info/gnd/124927521"],
        null,
      ],
      ["reconciled", P, "2026-11-18", "https://www.wikidata.org/w/api.php", [], null],
    ]);
    expect(performed?.addable).toEqual(["musicbrainz", "gnd", "melody"]);

    expect(same?.label).toBe(null);
    expect(rows(same)).toEqual([
      [
        "schema:sameAs",
        "https://www.youtube.com/watch?v=Ch2mrPm1JnM",
        "https://www.youtube.com/watch?v=Ch2mrPm1JnM",
      ],
    ]);
    expect(lines(same)).toEqual([["manual", P, "2026-11-18", null, [], null]]);
  });

  it("puts the bundle higher up and cpt_1's one proposal in the drawers", () => {
    const drawers = drawersOf(view, frame("cpt_1"), CATALOGUE, DEFAULT_USER);
    expect(
      drawers.higher.map((group) => [
        group.words,
        group.rectangles.map((r) => [r.heading, rows(r)]),
      ]),
    ).toEqual([
      [
        BUNDLE,
        [
          ["rdfs:seeAlso", [["rdfs:seeAlso", SEE_ALSO, SEE_ALSO]]],
          [
            "schema:about",
            [["schema:about", "wd:Q29117946", "http://www.wikidata.org/entity/Q29117946"]],
          ],
        ],
      ],
    ]);
    expect(
      drawers.proposed.map((row) => [
        row.key,
        row.subject,
        row.heading,
        row.label,
        row.line.method,
        row.line.who,
        row.line.basis,
        row.line.status,
      ]),
    ).toEqual([
      [
        canonicalText([["timelines", 1], "wdt:P2550", { id: "wd:Q29117946" }]),
        ["timelines", 1],
        "is a recording of",
        "Clair de lune",
        "inferred",
        T,
        ["#clt_6", "#dpt_1"],
        "proposed",
      ],
    ]);
    expect(drawers.rejected).toEqual([]);
  });

  it("reads clt_6 with a literal and a rejected candidate", () => {
    const list = rectangles("clt_6");
    expect(headings(list)).toEqual(["is a", "dcterms:created", "is a version or edition of"]);
    const [, created, version] = list;
    expect([created?.label, lines(created)?.[0]?.[0]]).toEqual(["2025-12-05", "imported"]);
    expect(version?.label).toBe("Clair de lune");
    expect(rows(version)).toEqual([
      ["schema:exampleOfWork", MB_WORK, MB_WORK],
      ["wdt:P629", "wd:Q29117946", "http://www.wikidata.org/entity/Q29117946"],
    ]);
    expect(lines(version)).toEqual([
      ["manual", P, "2026-11-18", null, [], "broad"],
      ["reconciled", T, "2026-11-18", "https://www.wikidata.org/w/api.php", [MB_WORK], "broad"],
    ]);
    const drawers = drawersOf(view, frame("clt_6"), CATALOGUE, DEFAULT_USER);
    expect(drawers.proposed).toEqual([]);
    expect(
      drawers.rejected.map((row) => [row.heading, row.label, row.line.method, row.line.note]),
    ).toEqual([
      [
        "is a version or edition of",
        "gnd:1156628156",
        "reconciled",
        "GND 'Clair de lune' is Debussy's song L 32 on Verlaine (voice and piano, 1882), not the piano piece",
      ],
    ]);
  });

  it("reads dpt_1 as is a with a proposal naming an element", () => {
    expect(headings(rectangles("dpt_1"))).toEqual(["is a"]);
    const drawers = drawersOf(view, frame("dpt_1"), CATALOGUE, DEFAULT_USER);
    expect(drawers.proposed.map((row) => [row.heading, row.label])).toEqual([
      [
        "is derived from, is based on",
        "C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical",
      ],
    ]);
  });

  it("shows cpt_2 the empty is a, the bundle and cpt_1 higher up", () => {
    const [empty, ...rest] = rectangles("cpt_2");
    expect(rest).toEqual([]);
    expect([empty?.key, empty?.heading, empty?.rows, empty?.pairs]).toEqual([
      "is_a",
      "is a",
      [],
      [],
    ]);
    const drawers = drawersOf(view, frame("cpt_2"), CATALOGUE, DEFAULT_USER);
    expect(
      drawers.higher.map((group) => [group.key, group.words, headings(group.rectangles)]),
    ).toEqual([
      ['{"block":"0000000000"}', BUNDLE, ["rdfs:seeAlso", "schema:about"]],
      ['{"block":"0000000000","id":"cpt_1"}', CPT_1, ["is a", "performed by", "same as"]],
    ]);
    expect(empty === undefined ? null : rectangleWords(empty)).toBe("is a");
  });

  it("words a rectangle by its verb and its label, else its first value", () => {
    expect(rectangles("cpt_1").map(rectangleWords)).toEqual([
      "is a schema:VideoObject",
      "performed by Maria João Pires",
      "same as https://www.youtube.com/watch?v=Ch2mrPm1JnM",
    ]);
  });

  it("shows the bundle the empty is a and its own two pairs, nothing higher up", () => {
    expect(rectangles(null).map((rectangle) => [rectangle.key, rectangle.heading])).toEqual([
      ["is_a", "is a"],
      [canonicalText(["rdfs:seeAlso", { id: SEE_ALSO }]), "rdfs:seeAlso"],
      [
        canonicalText(["schema:about", { id: "wd:Q29117946", label: "Clair de lune" }]),
        "schema:about",
      ],
    ]);
    expect(drawersOf(view, frame(null), CATALOGUE, DEFAULT_USER).higher).toEqual([]);
  });
});

describe("who stated a pair", () => {
  it("names the user, an iD, a tagged name, TiLiE and anyone else", () => {
    expect([
      whoOf(G, DEFAULT_USER),
      whoOf("https://orcid.org/0000-0002-1825-0097", DEFAULT_USER),
      whoOf("tag:timetoalign.github.io,2026:tilie:user:Clara%20Wieck", DEFAULT_USER),
      whoOf("https://github.com/TimeToAlign/TimeLineEditor", DEFAULT_USER),
      whoOf(P, DEFAULT_USER),
    ]).toEqual(["Gerhardt", "0000-0002-1825-0097", "Clara Wieck", "TiLiE", P]);
  });
});

describe("the choices the composer offers", () => {
  it("offers performed by in its vocabularies and an element", () => {
    expect(
      systemChoices(CATALOGUE, { id: "performed_by", inverse: false, label: "" }).map(
        (choice) => choice.label,
      ),
    ).toEqual([
      "Wikidata",
      "MusicBrainz",
      "GND",
      "MeLODy / LRMoo",
      "Other vocabularies",
      "An element of this manifest",
    ]);
  });

  it("orders the verbs by the types an is a states, Other property last", () => {
    const cpt1 = frame("cpt_1");
    const types = typesOf(
      CATALOGUE,
      cpt1.skeleton["@context"],
      rectangles("cpt_1")[0]?.pairs ?? [],
    );
    expect(types[0]).toBe("video");
    const labels = verbChoices(CATALOGUE, types).map((choice) => choice.label);
    expect(labels.slice(0, 6)).toEqual([
      "is a",
      "same as",
      "is a recording of",
      "performed by",
      "recorded at, recorded on",
      "released on, published in",
    ]);
    expect(labels.at(-1)).toBe("Other property…");
    const wikidata = verbChoices(CATALOGUE, [], "wikidata").map((choice) => choice.label);
    expect(wikidata).not.toContain("has a version or edition");
    expect(wikidata).toContain("performed by");
  });

  it("writes IRIs compactly where a prefix holds them", () => {
    expect(compactIri(CATALOGUE.prefixes, "http://www.wikidata.org/entity/Q235650")).toBe(
      "wd:Q235650",
    );
    expect(compactIri(CATALOGUE.prefixes, MB_WORK)).toBe(MB_WORK);
  });
});
