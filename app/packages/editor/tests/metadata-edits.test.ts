/** The Metadata tab's commands; the expected values are derived in `README.md` ("The Metadata tab"). */

import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { View } from "@timetoalign/tilie-core";
import { DEFAULT_USER, TILIE_AGENT } from "@timetoalign/tilie-core";
import { defaultCatalogue, fontMetrics, isJsonObject } from "@timetoalign/timetoshare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  added,
  believed,
  commandOf,
  dayOf,
  removed,
  stated,
  TIE_NOTE,
  tied,
} from "../src/inspector/metadata/edits.ts";
import type { Frame, Pair } from "../src/inspector/metadata/frame.ts";
import { candidatesOf, rectanglesOf, shownOf } from "../src/inspector/metadata/frame.ts";
import { beliefOf } from "../src/inspector/provenance.ts";
import { fixture, storeOf } from "./support.ts";

const A = "0000000000";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const P = "https://example.org/people/editor";
const YOUTUBE: Pair = ["schema:sameAs", { id: "https://www.youtube.com/watch?v=Ch2mrPm1JnM" }];
/** The shipped catalogue: what the tab offers without type profiles. */
const CATALOGUE = defaultCatalogue();

const view: View = storeOf(fixture("statements/layerit_recording")).view;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function frame(id: string): Frame {
  const subjects = resolveSelection(view, selectionOf([{ block: A, id }]), null, fontMetrics);
  const found = shownOf(view, subjects, null);
  if (found.kind === "none") throw new Error(found.hint);
  return found;
}

/** A member of an element of the frame's manifest as the store holds it. */
function member(at: Frame, name: "statements" | "provenance"): unknown {
  let value: unknown = at.skeleton;
  for (const step of at.path) {
    value = Array.isArray(value) ? value[step as number] : (value as Record<string, unknown>)[step];
  }
  return isJsonObject(value) ? value[name] : undefined;
}

const today = () => dayOf(new Date());

describe("stating and believing a candidate", () => {
  it("states cpt_1's candidate, its entry kept as made, with the user's belief true", () => {
    const at = frame("cpt_1");
    const [row] = candidatesOf(at, CATALOGUE, DEFAULT_USER).offered;
    if (row === undefined) throw new Error("no candidate");
    const before = member(at, "provenance") as unknown[];
    const statements = member(at, "statements") as Record<string, unknown>;
    expect(commandOf(at, stated(at, row, G, today()))).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_1" },
          values: {
            statements: { ...statements, "wdt:P2550": [{ id: "wd:Q29117946" }] },
            provenance: [
              ...before.slice(0, 3),
              {
                basis: ["#clt_6", "#dpt_1"],
                beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
                date: "2026-11-18",
                method: "inferred",
                note: "from the encoding's work and the WAV's source; whether the video holds the whole movement is unchecked",
                property: "wdt:P2550",
                stated_by: ["https://example.org/agents/tilie"],
                value: { id: "wd:Q29117946" },
              },
            ],
          },
        },
      ],
    });
  });

  it("believes dpt_1's candidate false in its entry alone, and sets it apart", () => {
    const at = frame("dpt_1");
    const [row] = candidatesOf(at, CATALOGUE, DEFAULT_USER).offered;
    if (row === undefined) throw new Error("no candidate");
    const after = believed(at, row.subject, row.pair, G, "false", today());
    expect(commandOf(at, after)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "dpt_1" },
          values: {
            provenance: [
              {
                beliefs: [{ actor: G, belief: "false", date: "2026-11-20" }],
                date: "2026-11-18",
                method: "inferred",
                note: "assumed ripped from the video's sound and cut",
                property: "dcterms:source",
                stated_by: [P],
                value: { id: "#cpt_1" },
              },
            ],
          },
        },
      ],
    });
    const found = candidatesOf({ ...at, skeleton: after }, CATALOGUE, DEFAULT_USER);
    expect(found.offered).toEqual([]);
    expect(
      found.dismissed.map((item) => [
        item.heading,
        item.line.beliefs.map((held) => [held.actor, held.belief, held.date]),
        beliefOf(item.line, DEFAULT_USER),
      ]),
    ).toEqual([["is derived from, is based on", [[G, "false", "2026-11-20"]], "false"]]);
  });
});

describe("believing and removing a stated pair", () => {
  it("records the belief beside P's and leaves the pair stated; a second one replaces it", () => {
    const at = frame("cpt_1");
    const [first, ...others] = member(at, "provenance") as Record<string, unknown>[];
    const p = { actor: P, belief: "true", date: "2026-11-18" };
    const once = believed(at, at.path, YOUTUBE, G, "false", today());
    expect(commandOf(at, once)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_1" },
          values: {
            provenance: [
              { ...first, beliefs: [p, { actor: G, belief: "false", date: "2026-11-20" }] },
              ...others,
            ],
          },
        },
      ],
    });
    const twice = believed({ ...at, skeleton: once }, at.path, YOUTUBE, G, "unlikely", today());
    expect(commandOf(at, twice)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_1" },
          values: {
            provenance: [
              { ...first, beliefs: [p, { actor: G, belief: "unlikely", date: "2026-11-20" }] },
              ...others,
            ],
          },
        },
      ],
    });
  });

  it("removes cpt_1's same as pair with its entry", () => {
    const at = frame("cpt_1");
    const { "schema:sameAs": _, ...statements } = member(at, "statements") as Record<
      string,
      unknown
    >;
    const [, ...others] = member(at, "provenance") as Record<string, unknown>[];
    expect(commandOf(at, removed(at, YOUTUBE))).toEqual({
      type: "set",
      changes: [{ target: { block: A, id: "cpt_1" }, values: { statements, provenance: others } }],
    });
  });
});

describe("adding and tying", () => {
  it("states a pair on cpt_2 with its paradata and the user's belief true", () => {
    const at = frame("cpt_2");
    const value = { id: "wd:Q235650", label: "Maria João Pires" };
    const after = added(at, [["wdt:P175", value]], {
      stated_by: [G],
      date: today(),
      method: "manual",
    });
    expect(commandOf(at, after)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_2" },
          values: {
            statements: { "wdt:P175": [value] },
            provenance: [
              {
                beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
                date: "2026-11-20",
                method: "manual",
                property: "wdt:P175",
                stated_by: [G],
                value: { id: "wd:Q235650" },
              },
            ],
          },
        },
      ],
    });
  });

  it("ties a value node to the first thing by same as, saying so, and leaves the thing itself", () => {
    const thing = { system: "wikidata", iri: "http://www.wikidata.org/entity/Q235650" };
    const day = today();
    expect(tied([["rel:prf", { id: "gnd:124927521" }]], thing, CATALOGUE.prefixes, day)).toEqual([
      [
        "rel:prf",
        {
          id: "gnd:124927521",
          "schema:sameAs": [{ id: "wd:Q235650" }],
          provenance: [
            {
              basis: ["http://www.wikidata.org/entity/Q235650"],
              date: "2026-11-20",
              method: "inferred",
              note: TIE_NOTE,
              property: "schema:sameAs",
              stated_by: [TILIE_AGENT],
              value: { id: "wd:Q235650" },
            },
          ],
        },
      ],
    ]);
    expect(tied([["wdt:P175", { id: "wd:Q235650" }]], thing, CATALOGUE.prefixes, day)).toEqual([
      ["wdt:P175", { id: "wd:Q235650" }],
    ]);
  });
});

describe("nothing changed, and a refusal", () => {
  it("gives no command for the frame's own skeleton", () => {
    const at = frame("cpt_1");
    expect(commandOf(at, at.skeleton)).toBe(null);
  });

  it("lets the statement functions' error reach the caller", () => {
    const at = frame("cpt_2");
    const [pair] = rectanglesOf(frame("cpt_1"), CATALOGUE, DEFAULT_USER)[2]?.pairs ?? [];
    if (pair === undefined) throw new Error("no same as");
    expect(() => removed(at, pair)).toThrow(new Error("'schema:sameAs' does not have this value"));
  });
});
