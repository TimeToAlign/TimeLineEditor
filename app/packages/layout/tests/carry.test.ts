/**
 * Stacks of labels at the thick end of their wedges (`stacks.ts`): their
 * tiers, where a turned wedge carries them, the gap a cross-section line
 * leaves where they and their wedge stand, and the cut; every number is
 * derived in tests/README.md ("Stacks carried by their wedges").
 */

import { sameAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { TextMeasure } from "../src/index.ts";
import { wedgeCorners } from "../src/rotation.ts";
import { carried, cut, gapOf, tiersOf } from "../src/stacks.ts";
import { at, drawFixture, metrics, SINE_45 } from "./support.ts";

const measure = new TextMeasure(metrics);
const h = measure.lineHeight(9);

describe("tiersOf", () => {
  it("places stacks by one first fit in order, a tier as many lines high as its highest stack", () => {
    // A at 0 (1 line, 10 wide) spans -6 to 6; B at 5 (3 lines) meets it and goes to tier 2; C at
    // 100 (2 lines) fits tier 1, which is 2 lines high, so B's first line is 3 and T = 5.
    expect(
      tiersOf([
        { x: 0, lines: 1, width: 10 },
        { x: 5, lines: 3, width: 10 },
        { x: 100, lines: 2, width: 10 },
      ]),
    ).toEqual({ first: [1, 3, 1], lines: 5 });
    expect(tiersOf([])).toEqual({ first: [], lines: 0 });
  });
});

describe("carried", () => {
  it("leaves an unturned stack at its place: line n at tip + 13 + 2 + (n − 1) × h", () => {
    expect(carried(0, 1.5, 2, 2, 30, h)).toEqual({
      vx: 0,
      starts: [1.5 + 13 + 2 + h, 1.5 + 13 + 2 + 2 * h],
      inwards: false,
      box: [1.5 + 13 + 2 + h, 1.5 + 13 + 2 + h + 2 * h],
    });
  });

  // The labels of the figure `timestamp_wedge_rotation`, each a stack of one label in tier 1, the
  // wedge's tip 1.5 out (`c` 0, `w` 3): `t` derived by section 6.6's formula, `t = D + W/2·|s| +
  // H/2·|k|`, with `D = 13 + 2` in tier 1, `H = h` and `s`, `k` the four-place sine and cosine,
  // summed in that order in binary64.
  const W45 = 19.19970703125; // "-45°"
  const W180 = 21.67822265625; // "180°"
  const W135 = measure.width("135°", 9);
  const tOf = (W: number, s: number, k: number) => 13 + 2 + (W / 2) * s + (h / 2) * k;
  const t45 = tOf(W45, SINE_45, SINE_45);
  const t180 = tOf(W180, 0, 1);
  const t135 = tOf(W135, SINE_45, SINE_45);

  it("measures the figure's labels as the metrics give them", () => {
    expect([measure.width("-45°", 9), measure.width("180°", 9)]).toEqual([W45, W180]);
    // `t` at 180 is dyadic: 15 + h / 2.
    expect(t180).toBe(20.23828125);
  });

  it("carries a stack round a wedge turned −45: across t × s, its box centred t × k out", () => {
    expect(carried(-45, 1.5, 1, 1, W45, h)).toEqual({
      vx: t45 * -SINE_45,
      starts: [1.5 + t45 * SINE_45 - h / 2],
      inwards: false,
      box: [1.5 + t45 * SINE_45 - h / 2, 1.5 + t45 * SINE_45 + h / 2],
    });
  });

  it("carries a stack past the tip at 180: its lines start inwards, 13.5 before the line", () => {
    const stack = carried(180, 1.5, 1, 1, W180, h);
    expect(stack).toEqual({
      vx: 0,
      starts: [-13.5],
      inwards: true,
      box: [1.5 - t180 - h / 2, -13.5],
    });
  });

  it("carries a stack at 135 by the same rule", () => {
    const stack = carried(135, 1.5, 1, 1, W135, h);
    expect([stack.vx, stack.starts, stack.inwards]).toEqual([
      t135 * SINE_45,
      [1.5 + t135 * -SINE_45 + h / 2],
      true,
    ]);
  });

  it("draws the figure's labels, to four decimals", () => {
    // `melody`'s line at 56.9765625, its band below: `-45°` at x 145.5112, baseline 79.6177;
    // `180°` at x 363.5366, baseline 41.354 (above the line, `d(9)` beyond); `135°` at x
    // 332.1817, baseline 42.9472, derived by section 6.6's formula, `t = D + W/2·|s| + H/2·|k|`.
    const drawing = drawFixture("timestamp_wedge_rotation");
    const label = (id: string) => {
      const found = drawing.elements.find((item) => sameAddress(item.address, at(id, "name")));
      if (found?.type !== "label") throw new Error(`no name of ${id}`);
      return [found.text, Math.round(found.x * 1e4) / 1e4, Math.round(found.baseline * 1e4) / 1e4];
    };
    expect(["timestamp_2", "timestamp_6", "timestamp_5"].map(label)).toEqual([
      ["-45°", 145.5112, 79.6177],
      ["180°", 363.5366, 41.354],
      ["135°", 332.1817, 42.9472],
    ]);
  });
});

describe("gapOf", () => {
  const stack = (rotation: number, width: number) => ({
    carried: carried(rotation, 1.5, 1, 1, width, h),
    width,
  });
  /** The wedge's tip and corners out from the line, its tip 1.5 out. */
  const wedgeSpan = (rotation: number) => {
    const outs = [1.5, ...wedgeCorners(rotation).map(({ out }) => 1.5 + out)];
    return [Math.min(...outs), Math.max(...outs)];
  };

  it("runs from the wedge's tip to the end of its stack's last line, unturned", () => {
    expect(gapOf(100, 0, 1.5, true, stack(0, 10))).toEqual([1.5, 1.5 + 13 + 2 + h]);
    expect(gapOf(100, 0, 1.5, true, null)).toEqual([1.5, 14.5]);
    expect(gapOf(100, 0, 1.5, false, stack(0, 10))).toEqual([1.5 + 13 + 2, 1.5 + 13 + 2 + h]);
    expect(gapOf(100, 0, 1.5, false, null)).toBe(null);
  });

  it("counts the wedge while the vertical meets its body: |r| up to 12 and from 168", () => {
    for (const rotation of [12, -12, 168, -168, 180]) {
      expect([rotation, gapOf(100, rotation, 1.5, true, null)]).toEqual([
        rotation,
        wedgeSpan(rotation),
      ]);
    }
    for (const rotation of [13, -13, 167, -167, 90]) {
      expect([rotation, gapOf(100, rotation, 1.5, true, null)]).toEqual([rotation, null]);
    }
  });

  it("counts a carried stack only while it lies across the tip's abscissa", () => {
    // At −45 a stack 19.2 wide (`-45°`) is carried `t45 × −0.7071 = −18.03` across: its right
    // edge lies 9.6 right of its centre, left of the tip, and the wedge's body leaves the vertical.
    expect(gapOf(100, -45, 1.5, true, stack(-45, 19.19970703125))).toBe(null);
    // At −20 (`s = −0.342`, `k = 0.9397`) a stack 40 wide is carried `(15 + 20 × 0.342 + h / 2
    // × 0.9397) × −0.342 = −9.15` across, less than its half width: it lies across the tip's
    // abscissa and gives the gap its box alone, the wedge's body being off the vertical.
    const wide = stack(-20, 40);
    expect(wide.carried.vx + 20 > 0).toBe(true);
    expect(gapOf(100, -20, 1.5, true, wide)).toEqual(wide.carried.box);
  });
});

describe("cut", () => {
  it("leaves up to two pieces of the span, from the top, none of no length", () => {
    expect(cut([0, 100], null)).toEqual([[0, 100]]);
    expect(cut([0, 100], [10, 20])).toEqual([
      [0, 10],
      [20, 100],
    ]);
    expect(cut([0, 100], [-5, 10])).toEqual([[10, 100]]);
    expect(cut([0, 100], [90, 120])).toEqual([[0, 90]]);
    expect(cut([0, 100], [0, 100])).toEqual([]);
    expect(cut([0, 100], [100, 120])).toEqual([[0, 100]]);
    expect(cut([0, 100], [-10, 0])).toEqual([[0, 100]]);
  });
});
