/** The Metadata tab's commands; the expected values are derived in `README.md` ("The Metadata tab"). */

import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { View } from "@timetoalign/tilie-core";
import { DEFAULT_USER } from "@timetoalign/tilie-core";
import { fontMetrics, isJsonObject } from "@timetoalign/timetoshare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOGUE } from "../src/inspector/metadata/catalogue.ts";
import {
  added,
  commandOf,
  confirmed,
  dayOf,
  rejected,
  rejectedRectangle,
  removedRectangle,
  tied,
} from "../src/inspector/metadata/edits.ts";
import type { Frame } from "../src/inspector/metadata/frame.ts";
import { drawersOf, rectanglesOf, shownOf } from "../src/inspector/metadata/frame.ts";
import { fixture, storeOf } from "./support.ts";

const A = "0000000000";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";

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

describe("confirming and rejecting a proposal", () => {
  it("states cpt_1's proposed pair and confirms its annotation in place", () => {
    const at = frame("cpt_1");
    const [row] = drawersOf(view, at, CATALOGUE, DEFAULT_USER).proposed;
    if (row === undefined) throw new Error("no proposal");
    const before = member(at, "provenance") as unknown[];
    const statements = member(at, "statements") as Record<string, unknown>;
    expect(commandOf(at, confirmed(at, row, DEFAULT_USER, today()))).toEqual({
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
                date: "2026-11-20",
                method: "inferred",
                note: "from the encoding's work and the WAV's source; whether the video holds the whole movement is unchecked",
                property: "wdt:P2550",
                stated_by: [G],
                status: "confirmed",
                value: { id: "wd:Q29117946" },
              },
            ],
          },
        },
      ],
    });
  });

  it("rejects dpt_1's proposal in its annotation alone", () => {
    const at = frame("dpt_1");
    const [row] = drawersOf(view, at, CATALOGUE, DEFAULT_USER).proposed;
    if (row === undefined) throw new Error("no proposal");
    expect(commandOf(at, rejected(at, row, DEFAULT_USER, today()))).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "dpt_1" },
          values: {
            provenance: [
              {
                date: "2026-11-20",
                method: "inferred",
                note: "assumed ripped from the video's sound and cut",
                property: "dcterms:source",
                stated_by: [G],
                status: "rejected",
                value: { id: "#cpt_1" },
              },
            ],
          },
        },
      ],
    });
  });
});

describe("removing and rejecting a rectangle", () => {
  it("removes cpt_1's same as with its annotation, or keeps it rejected", () => {
    const at = frame("cpt_1");
    const same = rectanglesOf(at, CATALOGUE, DEFAULT_USER)[2];
    if (same === undefined) throw new Error("no same as");
    const { "schema:sameAs": _, ...statements } = member(at, "statements") as Record<
      string,
      unknown
    >;
    const [first, ...others] = member(at, "provenance") as Record<string, unknown>[];
    expect(commandOf(at, removedRectangle(at, same))).toEqual({
      type: "set",
      changes: [{ target: { block: A, id: "cpt_1" }, values: { statements, provenance: others } }],
    });
    expect(commandOf(at, rejectedRectangle(at, same, DEFAULT_USER, today()))).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_1" },
          values: {
            statements,
            provenance: [
              { ...first, status: "rejected", stated_by: [G], date: "2026-11-20" },
              ...others,
            ],
          },
        },
      ],
    });
  });
});

describe("adding and tying", () => {
  it("states a pair on cpt_2 with one confirmed annotation", () => {
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
                date: "2026-11-20",
                method: "manual",
                property: "wdt:P175",
                stated_by: [G],
                status: "confirmed",
                value: { id: "wd:Q235650" },
              },
            ],
          },
        },
      ],
    });
  });

  it("ties a value node to the first thing by same as, and leaves the thing itself", () => {
    const thing = { system: "wikidata", iri: "http://www.wikidata.org/entity/Q235650" };
    expect(tied([["rel:prf", { id: "gnd:124927521" }]], thing, CATALOGUE.prefixes)).toEqual([
      ["rel:prf", { id: "gnd:124927521", "schema:sameAs": [{ id: "wd:Q235650" }] }],
    ]);
    expect(tied([["wdt:P175", { id: "wd:Q235650" }]], thing, CATALOGUE.prefixes)).toEqual([
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
    const same = rectanglesOf(frame("cpt_1"), CATALOGUE, DEFAULT_USER)[2];
    if (same === undefined) throw new Error("no same as");
    expect(() => removedRectangle(at, same)).toThrow(
      new Error("'schema:sameAs' does not have this value"),
    );
  });
});
