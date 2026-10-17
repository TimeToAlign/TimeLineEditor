// @vitest-environment jsdom
/**
 * `slide`, the `animate:` function of a drawing's elements: Svelte's screen
 * offset becomes drawing units through the element's screen CTM; and
 * `drawingMatrix`, the CTM a drag reads.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { Matrix } from "../src/motion.ts";
import { drawingMatrix, slide } from "../src/motion.ts";

const SVG = "http://www.w3.org/2000/svg";

function rect(matrix: Matrix | null): SVGRectElement {
  const element = document.createElementNS(SVG, "rect");
  Object.assign(element, { getScreenCTM: () => matrix });
  document.body.append(element);
  return element;
}

/** A screen rectangle as Svelte measures one (jsdom has no `DOMRect`). */
const at = (left: number, top: number) =>
  ({ left, top, width: 50, height: 10, x: left, y: top }) as DOMRect;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("slide", () => {
  const SCALED = { a: 2, b: 0, c: 0, d: 0.5, e: 100, f: 50 };

  it("converts the screen offset into drawing units", () => {
    const config = slide(rect(SCALED), { from: at(130, 80), to: at(100, 100) }, { duration: 200 });
    expect(config.duration).toBe(200);
    expect(config.delay).toBe(0);
    expect(config.css?.(0, 1)).toBe("transform: translate(15px, -40px);");
    expect(config.css?.(1, 0)).toBe("transform: translate(0px, 0px);");
  });

  it("inverts the whole linear part of the CTM", () => {
    const turned = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    const config = slide(rect(turned), { from: at(130, 80), to: at(100, 100) }, { duration: 200 });
    expect(config.css?.(0, 1)).toBe("transform: translate(-20px, -30px);");
  });

  it("keeps the element's own transform in front", () => {
    const element = rect(SCALED);
    element.style.transform = "translate(1px, 2px)";
    const config = slide(element, { from: at(130, 80), to: at(100, 100) }, { duration: 200 });
    expect(config.css?.(0, 1)).toBe("transform: translate(1px, 2px) translate(15px, -40px);");
  });

  it("lasts √d × 120 by default", () => {
    const config = slide(rect(SCALED), { from: at(100, 116), to: at(100, 100) });
    expect(config.duration).toBe(480);
    expect(config.css?.(0, 1)).toBe("transform: translate(0px, 32px);");
  });

  it("lasts no time when its caller passes a duration of 0", () => {
    const config = slide(rect(SCALED), { from: at(130, 80), to: at(100, 100) }, { duration: 0 });
    expect(config.duration).toBe(0);
    expect(config.css?.(0, 1)).toBe("transform: translate(15px, -40px);");
  });

  it("does not animate an element without an invertible CTM", () => {
    const singular = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    for (const matrix of [null, singular]) {
      const config = slide(rect(matrix), { from: at(130, 80), to: at(100, 100) });
      expect(config).toEqual({ delay: 0, duration: 0 });
    }
  });
});

describe("drawingMatrix", () => {
  it("is the CTM of the <svg> an element is drawn in", () => {
    const svg = document.createElementNS(SVG, "svg");
    const drawing = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
    Object.assign(svg, { getScreenCTM: () => drawing });
    const element = rect({ a: 1, b: 0, c: 0, d: 1, e: 0, f: -1000 });
    svg.append(element);
    document.body.append(svg);
    expect(drawingMatrix(element)).toBe(drawing);
    expect(drawingMatrix(svg)).toBe(drawing);
  });
});
