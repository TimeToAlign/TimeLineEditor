/// <reference types="node" />
/** The Metadata tab's model; the expected values are derived in `README.md` ("The Metadata tab"). */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Editing } from "@timetoalign/tilie-arranger";
import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Manifest, View } from "@timetoalign/tilie-core";
import { isLoadError, linkHolder, loadManifest } from "@timetoalign/tilie-core";
import type { Assertion, CompleteLink } from "@timetoalign/timetoshare";
import {
  ABSENCE_REASONS,
  fontMetrics,
  isJsonObject,
  linkFromUrls,
  loads,
  SCHEMA_VERSION,
  withAssertion,
  withBareIds,
  withLabel,
  withParts,
  withUri,
} from "@timetoalign/timetoshare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Identity, NO_IDENTITY } from "../src/inspector/identity.svelte.ts";
import type { Held, Shown } from "../src/inspector/metadata.ts";
import {
  absenceChoices,
  dayOf,
  describedOf,
  extended,
  inspectedOf,
  isUri,
  isWebAddress,
  linkCard,
  pasted,
  relabelled,
  SELECT_HINT,
  statusChange,
  viewerAssertion,
  withAbsence,
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
  VIEWER,
  WHOLE,
  WORK,
  WORK_PAGE,
} from "./op106.ts";
import { fileText, storeOf } from "./support.ts";

const A = "0000000000";
const B = "0000000001";
const I = VIEWER;
const E = EDITOR.asserted_by[0];
const DAY = "2026-11-17";
const ASSERTION = { asserted_by: [I], asserted_on: DAY, method: "manual" };
const RELATOR = "http://id.loc.gov/vocabulary/relators/prf";

/** A manifest from a value, failing loudly if it is refused. */
function manifestOf(value: unknown): Manifest {
  const read = loadManifest(fileText(value));
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

/** The bundle's own links of a manifest value, as the tab reads them. */
function bundleLinks(value: unknown): { described: ReturnType<typeof describedOf>; held: Held } {
  const described = describedOf(manifestOf(value));
  const held = linkHolder(described.complete, null);
  if (held === undefined) throw new Error("no links");
  return { described, held };
}

/** The Op. 106 link in its complete form. */
function op106Link(): CompleteLink {
  const [link] = bundleLinks(OP106).held.links;
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
    const { described, held } = bundleLinks(OP106);
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
          assertion: null,
        })),
      },
      partOf: [],
      assertion: `asserted by ${E} · on 2026-11-17 · method manual · status confirmed`,
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
    const { described, held } = bundleLinks({ ...OP106, links: [first, second] });
    const cards = held.links.map((_, index) => linkCard(described, held, index));
    expect(
      cards.map((card) => [card.parts?.slots.map((slot) => slot.label), card.assertion]),
    ).toEqual([
      [
        MOVEMENTS.map(([, label]) => label),
        `asserted by ${E} · on 2026-11-17 · method manual · status confirmed`,
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
    const value = loads(
      readFileSync(path.join(directory, "description_absent_unregistered.yaml"), "utf8"),
    );
    if (!isJsonObject(value)) throw new Error("no case");
    const { described, held } = bundleLinks(withBareIds(value.manifest));
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

  it("shows the whole description (item 4)", () => {
    const { described, held } = bundleLinks(WHOLE);
    const card = linkCard(described, held, 0);
    expect([
      card.records,
      card.assertion,
      card.parts?.slots.slice(0, 2).map(({ uris, identifiers, assertion }) => ({
        uris,
        identifiers,
        assertion,
      })),
      card.partOf,
    ]).toEqual([
      [
        "https://example.org/records/op106.jsonld (application/ld+json, 2048 bytes, sha256-AAAA)",
        "https://example.org/records/plain",
      ],
      `asserted by ${E} · on 2026-11-17 · method manual · service https://example.org/reconcile · based on https://example.org/sources/a, https://example.org/sources/b · status confirmed`,
      [
        {
          uris: [`${MB}${MOVEMENTS[0]?.[0]}`, "https://example.org/movements/1"],
          identifiers: [{ scheme: SCHEME_NAME, value: "op. 106 no. 1" }],
          assertion: `asserted by ${I} · on 2026-11-18 · method inferred`,
        },
        { uris: [`${MB}${MOVEMENTS[1]?.[0]}`], identifiers: [], assertion: null },
      ],
      [
        {
          text: "part of Hammerklavier sonatas (has_part), position 1",
          assertion: `asserted by ${I}`,
        },
        { text: "part of https://example.org/collections/late (aggregates)", assertion: null },
      ],
    ]);
  });
});

describe("a pasted URL (item 5)", () => {
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
    const levels = [
      pasted(wikidata, ASSERTION, "work"),
      pasted(unknown, ASSERTION, "expression"),
      pasted(unknown, ASSERTION, "agent", ` ${RELATOR} `),
    ];
    expect(
      levels.map((item) =>
        item.kind === "link" ? [item.link.level, item.link.relation, item.link.uri] : item,
      ),
    ).toEqual([
      ["work", "pertains_to", ["http://www.wikidata.org/entity/Q146730"]],
      ["expression", "pertains_to", [unknown]],
      ["agent", RELATOR, [unknown]],
    ]);
    expect(pasted(unknown, ASSERTION, "agent")).toEqual({
      kind: "refused",
      message:
        "The pasted text gives no link: an agent link states its relation, the agent's role.",
    });
  });

  it("refuses a text that is no absolute URI", () => {
    expect(pasted("Hammerklavier", ASSERTION)).toEqual({
      kind: "refused",
      message: "The pasted text gives no link: 'Hammerklavier' is no absolute URI.",
    });
  });
});

describe("changes of a link (item 6)", () => {
  it("label, URL and absence, each the schema package's", () => {
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
  });
});

describe("a status chosen (item 7)", () => {
  const bare = linkFromUrls([WORK_PAGE]);
  /** `link` asserted by `assertion`, as the schema package states it. */
  const asserted = (link: CompleteLink, assertion: Assertion | null) =>
    withAssertion(link, assertion);

  it("changes the viewer's own assertion in place, stamped", () => {
    const own = asserted(bare, {
      asserted_by: [I],
      asserted_on: "2026-11-01",
      method: "imported",
      match: "exact",
      status: "unconfirmed",
    });
    const nobody = asserted(bare, { asserted_on: "2026-11-01", method: "imported" });
    expect([
      statusChange(bare, "confirmed", I, DAY),
      statusChange(own, "rejected", I, DAY),
      statusChange(nobody, "confirmed", null, DAY),
    ]).toEqual([
      { kind: "replaced", link: asserted(bare, { ...ASSERTION, status: "confirmed" }) },
      {
        kind: "replaced",
        link: asserted(bare, { ...ASSERTION, match: "exact", status: "rejected" }),
      },
      {
        kind: "replaced",
        link: asserted(bare, {
          asserted_by: [],
          asserted_on: DAY,
          method: "manual",
          status: "confirmed",
        }),
      },
    ]);
  });

  it("appends a link of the viewer's own where another agent asserted it", () => {
    const link = op106Link();
    expect([
      statusChange(link, "rejected", I, DAY),
      statusChange(link, "rejected", null, DAY),
    ]).toEqual([
      { kind: "appended", link: asserted(link, { ...ASSERTION, status: "rejected" }) },
      {
        kind: "appended",
        link: asserted(link, {
          asserted_by: [],
          asserted_on: DAY,
          method: "manual",
          status: "rejected",
        }),
      },
    ]);
  });

  it("leaves no assertion where only a status was stated and none is chosen", () => {
    const only = asserted(bare, { status: "confirmed" });
    const own = asserted(bare, { ...ASSERTION, asserted_on: "2026-11-01", status: "confirmed" });
    expect([statusChange(only, null, I, DAY), statusChange(own, null, I, DAY)]).toEqual([
      { kind: "replaced", link: asserted(bare, null) },
      { kind: "replaced", link: asserted(bare, { ...ASSERTION, status: null }) },
    ]);
  });
});

describe("the day, the identity's form, the addresses followed (item 8)", () => {
  it("dates an assertion by the local calendar day", () => {
    expect(dayOf(new Date(2026, 10, 17, 23, 59))).toBe(DAY);
    expect(viewerAssertion(null, DAY)).toEqual({
      asserted_by: [],
      asserted_on: DAY,
      method: "manual",
    });
    expect(viewerAssertion(I, DAY)).toEqual(ASSERTION);
  });

  it("reads an identity as the schema reads a URI", () => {
    expect(
      [I, "urn:isbn:0451450523", "orcid 0000", "", "https://example.org/a b"].map(isUri),
    ).toEqual([true, true, false, false, false]);
  });

  it("follows only web addresses", () => {
    expect(
      [
        "https://example.org/w",
        "http://example.org/w",
        "javascript:alert(1)",
        "data:text/html,hi",
        "urn:isbn:0451450523",
        "mailto:a@example.org",
        "Hammerklavier",
      ].map(isWebAddress),
    ).toEqual([true, true, false, false, false, false, false]);
  });
});

describe("the identity", () => {
  const KEY = "test.identity";
  /** The identity, whether it is answered and whether it asks, made from what `KEY` holds. */
  const stateOf = (stored: string | null) => {
    if (stored === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, stored);
    const identity = new Identity(KEY);
    return [identity.uri, identity.answered, identity.asks];
  };

  it("is remembered in three states, and a text that is no URI asks again", () => {
    expect([null, I, NO_IDENTITY, "orcid 0000", ""].map((stored) => stateOf(stored))).toEqual([
      [null, false, true],
      [I, true, false],
      [null, true, false],
      [null, false, true],
      [null, false, true],
    ]);
  });

  it("writes what is given under its key, and holds it without a key or storage", () => {
    const keyed = new Identity(KEY);
    keyed.give(I);
    const written = localStorage.getItem(KEY);
    keyed.give(null);
    expect([written, localStorage.getItem(KEY), keyed.uri, keyed.answered]).toEqual([
      I,
      NO_IDENTITY,
      null,
      true,
    ]);
    localStorage.clear();
    const unkeyed = new Identity(null);
    unkeyed.give(I);
    expect([unkeyed.uri, unkeyed.answered, localStorage.length]).toEqual([I, true, 0]);
    const throwing = () => {
      throw new Error("no storage");
    };
    vi.stubGlobal("localStorage", { getItem: throwing, setItem: throwing, removeItem: throwing });
    const without = new Identity(KEY);
    expect([without.uri, without.asks]).toEqual([null, true]);
    without.give(I);
    expect([without.uri, without.asks]).toEqual([I, false]);
  });
});
