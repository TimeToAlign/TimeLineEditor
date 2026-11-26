/**
 * The coordinate flag's flow parts (README, "Virtual cards, ribbons, the
 * flow flag and the flow switch"): on a virtual card the written position
 * with its occurrence, on a root's card its played positions on every
 * virtual card the block draws, in the block's order.
 */

import type { Pin, View } from "@timetoalign/tilie-core";
import { prettyText, timestampAt } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { describe, expect, it } from "vitest";
import { crossSectionSpec, flowFlagParts, namedPin, virtualCards } from "../src/coordinates.ts";
import { A, blockIn, viewOf } from "./support.ts";
import {
  BY_HAND,
  DEFAULT,
  drawingIn,
  lineOf,
  placedVirtual,
  ROOT,
  virtualView,
} from "./virtualCards.ts";

const VIEW = virtualView();
const DECIMALS = VIEW.settings.granularity.decimals;

/** The pin of the position `n / d` on the one line of `timeline` in block A of `view`. */
function pinOn(view: View, timeline: string, n: bigint, d = 1n): Pin {
  const block = blockIn(view, A);
  const drawing = drawingIn(view);
  const [key] = lineOf(drawing, timeline);
  const spec = crossSectionSpec(block.manifest, A, drawing, key, view.settings.granularity);
  const timestamp = timestampAt(spec, Rational.fromParts(n, d), "no_server");
  return { spec, knots: "no_server", timestamp, named: null };
}

/** The flow parts of the pin on `timeline` at `n / d`. */
function partsAt(view: View, timeline: string, n: bigint, d = 1n) {
  const block = blockIn(view, A);
  return flowFlagParts(block.manifest, block.places, pinOn(view, timeline, n, d), DECIMALS);
}

/** Quarters as the flag writes them. */
const q = (n: bigint, d = 1n) =>
  prettyText(Rational.fromParts(n, d), "fraction", "quarters", DECIMALS);

describe("the flag's flow parts", () => {
  it("lists the virtual cards in the block's order", () => {
    const block = blockIn(VIEW, A);
    expect(virtualCards(block.manifest, block.places)).toEqual([
      { timeline: BY_HAND, group: null },
      { timeline: DEFAULT, group: null },
    ]);
    const member = blockIn(viewOf({ id: A, fixture: "groups/virtual_member" }), A);
    expect(virtualCards(member.manifest, member.places)).toEqual([
      { timeline: DEFAULT, group: "performance" },
    ]);
  });

  it("adds the written position and its occurrence on a virtual card", () => {
    expect(partsAt(VIEW, DEFAULT, 600n)).toEqual([
      {
        key: `written ${DEFAULT}`,
        name: "Allegro",
        rows: [
          { key: "coordinate", name: "coordinate", value: q(100n) },
          { key: "occurrence", name: "occurrence", value: "2 of 2" },
        ],
      },
    ]);
    expect(partsAt(VIEW, DEFAULT, 1000n)[0]?.rows).toEqual([
      { key: "coordinate", name: "coordinate", value: q(1047n, 2n) },
      { key: "occurrence", name: "occurrence", value: "1 of 1" },
    ]);
  });

  it("says a gap is in a gap", () => {
    expect(partsAt(VIEW, BY_HAND, 1907n)[0]?.rows).toEqual([
      { key: "coordinate", name: "coordinate", value: "in a gap" },
    ]);
  });

  it("lists the played positions on every virtual card on the root's card", () => {
    expect(partsAt(VIEW, ROOT, 100n)).toEqual([
      {
        key: `played ${ROOT}`,
        name: "Allegro played",
        rows: [
          {
            key: `${BY_HAND} `,
            name: "Allegro, practice",
            value: [q(100n), q(1153n, 2n), q(1053n), q(3059n, 2n)].join(", "),
          },
          { key: `${DEFAULT} `, name: "Allegro, default", value: [q(100n), q(600n)].join(", ") },
        ],
      },
    ]);
    expect(partsAt(VIEW, ROOT, 600n)[0]?.rows.map((row) => row.value)).toEqual([
      q(2010n),
      q(2153n, 2n),
    ]);
  });

  it("names a member card by its frame", () => {
    const view = viewOf({ id: A, fixture: "groups/virtual_member" });
    expect(partsAt(view, ROOT, 100n)[0]?.rows).toEqual([
      {
        key: `${DEFAULT} performance`,
        name: "Allegro, default in Performance",
        value: [q(100n), q(600n)].join(", "),
      },
    ]);
  });

  it("adds nothing where the block draws no virtual card", () => {
    const view = viewOf({ id: A, fixture: "flow/virtual_cards" });
    expect(partsAt(view, ROOT, 100n)).toEqual([]);
    expect(partsAt(placedVirtual(view, DEFAULT, 0, 200), ROOT, 100n)).toHaveLength(1);
  });

  it("pins a named timestamp of a virtual timeline, read as a root", () => {
    const view = viewOf({ id: A, fixture: "groups/virtual_member" });
    const block = blockIn(view, A);
    const pin = namedPin(
      block.manifest,
      A,
      drawingIn(view),
      "timestamp_4",
      view.settings.granularity,
      "no_server",
      null,
      null,
    );
    const anchor = pin?.timestamp.parts[0];
    expect([anchor?.timeline, anchor?.name, String(anchor?.position)]).toEqual([
      DEFAULT,
      "Allegro, default",
      "4241/2",
    ]);
  });
});
