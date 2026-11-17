/// <reference types="node" />
/** The Metadata tab's model; the expected values are derived in `README.md` ("The Metadata tab"). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Editing } from "@timetoalign/tilie-arranger";
import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Manifest, View } from "@timetoalign/tilie-core";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import type { CompleteLink } from "@timetoalign/timetoshare";
import {
  ABSENCE_REASONS,
  dumps,
  fontMetrics,
  isJsonObject,
  linkFromUrls,
  parseJson,
  SCHEMA_VERSION,
  withAssertion,
  withLabel,
  withParts,
  withUri,
} from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Identity } from "../src/inspector/identity.svelte.ts";
import type { Shown } from "../src/inspector/metadata.ts";
import {
  absenceChoices,
  dayOf,
  describedOf,
  extended,
  heldBy,
  inspectedOf,
  isUri,
  linkCard,
  pasted,
  relabelled,
  SELECT_HINT,
  viewerAssertion,
  withAbsence,
  withStatus,
} from "../src/inspector/metadata.ts";
import {
  EDITOR,
  LABEL,
  MB,
  MOVEMENTS,
  OP_106,
  OP106,
  SCHEME_NAME,
  URIS,
  WORK,
  WORK_PAGE,
} from "./op106.ts";
import { storeOf } from "./support.ts";

const A = "0000000000";
const B = "0000000001";
const I = "https://orcid.org/0000-0002-1825-0097";
const ASSERTION = { asserted_by: [I], asserted_on: "2026-11-17", method: "manual" };

/** A manifest from a value, failing loudly if it is refused. */
function manifestOf(value: unknown): Manifest {
  const read = loadManifest(dumps(value));
  if (isLoadError(read)) throw new Error(read.problems[0]?.message);
  return read;
}

/** What the tab shows in `view` for the selected `addresses`, in `editing`. */
function shownFor(view: View, addresses: Address[], editing: Editing | null = null): Shown {
  return inspectedOf(
    view,
    resolveSelection(view, selectionOf(addresses), editing, fontMetrics),
    editing,
  );
}

/** The kind, target and words of what is shown, or its hint. */
function summary(shown: Shown): unknown {
  return shown.kind === "none" ? shown.hint : [shown.kind, shown.target, shown.words];
}

/** The Op. 106 link in its complete form. */
function op106Link(): CompleteLink {
  const [link] = describedOf(manifestOf(OP106)).complete.links;
  if (link === undefined) throw new Error("no link");
  return link;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("what is inspected (item 1)", () => {
  const view = storeOf("bundles/bundle_mixed", "bare").view;
  const at = (id: string, extra: object = {}): Address => ({ block: A, id, ...extra });

  it("is the bundle, a timeline or a region, by what is selected", () => {
    const selections: Address[][] = [
      [{ block: A }],
      [at("score", { part: ["card"] })],
      [at("score", { facet: "regions" })],
      [at("score", { part: ["name"] })],
      [at("region_1")],
      [at("region_1", { part: ["label"] })],
      [{ block: A, part: ["name"] }],
    ];
    expect(selections.map((addresses) => summary(shownFor(view, addresses)))).toEqual([
      ["bundle", { block: A }, "bundle 'Mixed'"],
      ["timeline", at("score"), "timeline 'Score' in bundle 'Mixed'"],
      ["timeline", at("score"), "timeline 'Score' in bundle 'Mixed'"],
      ["timeline", at("score"), "timeline 'Score' in bundle 'Mixed'"],
      ["region", at("region_1"), "region 'Verse' in bundle 'Mixed'"],
      ["region", at("region_1"), "region 'Verse' in bundle 'Mixed'"],
      ["bundle", { block: A }, "bundle 'Mixed'"],
    ]);
  });

  it("says how links are reached from what holds none, and from several or nothing", () => {
    const rest =
      " holds no links: a bundle, a timeline or a region does. Select its block, a timeline or a region.";
    expect(
      [[at("group_1")], [at("cmap_1")], [at("timestamp_1")], [{ block: A }, { block: B }], []].map(
        (addresses) => summary(shownFor(view, addresses)),
      ),
    ).toEqual([
      `Group 'Performance' in bundle 'Mixed'${rest}`,
      `Conversion map 'cmap_1' in bundle 'Mixed'${rest}`,
      `Timestamp 'origin' in bundle 'Mixed'${rest}`,
      SELECT_HINT,
      SELECT_HINT,
    ]);
  });

  it("is the edited element with nothing selected, the one bundle at the top level", () => {
    const one = storeOf("bundles/bundle_mixed").view;
    expect([
      summary(shownFor(view, [], { target: at("score"), kind: "timeline" })),
      summary(shownFor(view, [], { target: { block: A }, kind: "bundle" })),
      summary(shownFor(one, [])),
    ]).toEqual([
      ["timeline", at("score"), "timeline 'Score' in bundle 'Mixed'"],
      ["bundle", { block: A }, "bundle 'Mixed'"],
      ["bundle", { block: A }, "bundle 'Mixed'"],
    ]);
  });
});

describe("the card of a link", () => {
  it("shows every part of the Op. 106 link (item 2)", () => {
    const described = describedOf(manifestOf(OP106));
    const held = heldBy(described.complete, null);
    if (held === undefined) throw new Error("no links");
    expect(linkCard(described, held, 0)).toEqual({
      level: "work",
      relation: "pertains_to",
      label: LABEL,
      uris: URIS,
      identifiers: [
        { scheme: "IMSLP ID", value: OP_106 },
        { scheme: SCHEME_NAME, value: "op. 106" },
      ],
      records: [],
      parts: {
        relation: "has_part",
        ordered: true,
        slots: MOVEMENTS.map(([mbid, label], index) => ({
          position: index + 1,
          label,
          uris: [`${MB}${mbid}`],
          identifiers: [],
          representedBy: [],
          absent: "not_represented",
        })),
      },
      partOf: [],
      assertion:
        "asserted by https://example.org/people/editor · on 2026-11-17 · method manual · status confirmed",
      status: "confirmed",
      warnings: [],
    });
  });

  it("shows two readings of one work as two cards, in their order (item 2)", () => {
    const first = op106Link();
    const reordered = [0, 2, 1, 3].flatMap((index) => first.parts.slice(index, index + 1));
    const second = withAssertion(withParts(first, "has_part", reordered), {
      asserted_on: "2026-11-18",
      method: "imported",
    });
    const described = describedOf(manifestOf({ ...OP106, links: [first, second] }));
    const held = heldBy(described.complete, null);
    if (held === undefined) throw new Error("no links");
    const cards = held.links.map((_, index) => linkCard(described, held, index));
    expect(
      cards.map((card) => [card.parts?.slots.map((slot) => slot.label), card.assertion]),
    ).toEqual([
      [
        MOVEMENTS.map(([, label]) => label),
        "asserted by https://example.org/people/editor · on 2026-11-17 · method manual · status confirmed",
      ],
      [
        [0, 2, 1, 3].map((index) => (MOVEMENTS[index] as readonly [string, string])[1]),
        "on 2026-11-18 · method imported",
      ],
    ]);
  });

  it("names representing elements and warns of unregistered terms (item 3)", () => {
    const directory = path.join(
      path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
      "fixtures",
      "warnings",
      SCHEMA_VERSION,
    );
    const value = parseJson(
      readFileSync(path.join(directory, "description_absent_unregistered.json"), "utf8"),
    );
    if (!isJsonObject(value)) throw new Error("no case");
    const described = describedOf(manifestOf(value.manifest));
    const held = heldBy(described.complete, null);
    if (held === undefined) throw new Error("no links");
    const card = linkCard(described, held, 0);
    expect([
      card.parts?.slots.map((slot) => [slot.representedBy, slot.absent]),
      card.warnings,
      absenceChoices("destroyed"),
      absenceChoices("lost"),
    ]).toEqual([
      [
        [["intro"], null],
        [[], "destroyed"],
      ],
      ["'destroyed' is no registered word, at /parts/1/absent"],
      [...ABSENCE_REASONS, "destroyed"],
      [...ABSENCE_REASONS],
    ]);
  });
});

describe("a pasted URL (item 4)", () => {
  it("gives a link where the registry tells its level", () => {
    expect(pasted(` ${WORK_PAGE} `, ASSERTION)).toEqual({
      kind: "link",
      link: linkFromUrls([WORK_PAGE], { assertion: ASSERTION }),
    });
    const result = pasted(WORK_PAGE, ASSERTION);
    expect(result.kind === "link" ? [result.link.level, result.link.uri] : result).toEqual([
      "work",
      [WORK],
    ]);
  });

  it("waits for a level where the registry tells none, and takes the level given", () => {
    const wikidata = "https://www.wikidata.org/wiki/Q146730";
    const unknown = "https://example.org/works/op106";
    expect([pasted(wikidata, ASSERTION), pasted(unknown, ASSERTION)]).toEqual([
      { kind: "level", url: wikidata },
      { kind: "level", url: unknown },
    ]);
    const levels = [pasted(wikidata, ASSERTION, "work"), pasted(unknown, ASSERTION, "expression")];
    expect(
      levels.map((item) => (item.kind === "link" ? [item.link.level, item.link.uri] : item)),
    ).toEqual([
      ["work", ["http://www.wikidata.org/entity/Q146730"]],
      ["expression", [unknown]],
    ]);
  });

  it("refuses a text that is no absolute URI", () => {
    expect(pasted("Hammerklavier", ASSERTION)).toEqual({
      kind: "refused",
      message: "The pasted text gives no link: 'Hammerklavier' is no absolute URI.",
    });
  });
});

describe("changes of a link (item 5)", () => {
  it("label, URL, absence and status, each the schema package's", () => {
    const link = op106Link();
    const single = linkFromUrls([WORK_PAGE], { label: "Op. 106" });
    expect(relabelled(link, " Hammerklavier ")).toEqual(withLabel(link, "Hammerklavier"));
    expect(relabelled(link, "").label).toBe(null);
    expect(extended(single, "https://www.wikidata.org/wiki/Q146730")).toEqual({
      ok: true,
      link: withUri(single, ["https://www.wikidata.org/wiki/Q146730"]),
    });
    expect(
      (() => {
        const result = extended(single, "https://www.wikidata.org/wiki/Q146730");
        return result.ok ? result.link.uri : result;
      })(),
    ).toEqual([WORK, "http://www.wikidata.org/entity/Q146730"]);
    expect([extended(single, WORK_PAGE), extended(single, "Hammerklavier")]).toEqual([
      { ok: false, message: "The link holds that URL already." },
      { ok: false, message: "The URL cannot be added: 'Hammerklavier' is no absolute URI." },
    ]);
    const lost = withAbsence(link, 2, "lost");
    expect(lost.parts.map((slot) => slot.absent)).toEqual([
      "not_represented",
      "not_represented",
      "lost",
      "not_represented",
    ]);
    expect({ ...lost, parts: link.parts }).toEqual(link);
    expect(withStatus(link, "unconfirmed").assertion).toEqual({
      ...link.assertion,
      status: "unconfirmed",
    });
    expect(withStatus(link, null).assertion?.status).toBe(null);
    expect(withStatus(link, "unconfirmed")).toEqual(
      withAssertion(link, { ...EDITOR, status: "unconfirmed" }),
    );
  });
});

describe("the day and the identity (item 6)", () => {
  it("dates an assertion by the local calendar day", () => {
    expect(dayOf(new Date(2026, 10, 17, 23, 59))).toBe("2026-11-17");
    expect(viewerAssertion(null, "2026-11-17")).toEqual({
      asserted_by: [],
      asserted_on: "2026-11-17",
      method: "manual",
    });
    expect(viewerAssertion(I, "2026-11-17")).toEqual(ASSERTION);
  });

  it("reads an identity as the schema reads a URI", () => {
    expect(
      [I, "urn:isbn:0451450523", "orcid 0000", "", "https://example.org/a b"].map(isUri),
    ).toEqual([true, true, false, false, false]);
  });

  it("keeps the identity under its key, and without storage in memory", () => {
    localStorage.setItem("test.identity", I);
    const remembered = new Identity("test.identity");
    expect([remembered.uri, remembered.answered, remembered.asks]).toEqual([I, true, false]);
    localStorage.setItem("test.identity", "");
    const empty = new Identity("test.identity");
    expect([empty.uri, empty.answered, empty.asks]).toEqual([null, false, true]);
    const unkeyed = new Identity(null);
    unkeyed.give(I);
    expect([unkeyed.uri, unkeyed.answered, localStorage.length]).toEqual([I, true, 1]);
    empty.give(I);
    expect(localStorage.getItem("test.identity")).toBe(I);
    empty.give(null);
    expect([empty.uri, empty.answered, localStorage.getItem("test.identity")]).toEqual([
      null,
      true,
      null,
    ]);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("no storage");
      },
      setItem: () => {
        throw new Error("no storage");
      },
      removeItem: () => {
        throw new Error("no storage");
      },
    });
    const without = new Identity("test.identity");
    expect([without.uri, without.asks]).toEqual([null, true]);
    without.give(I);
    expect([without.uri, without.asks]).toEqual([I, false]);
  });
});
