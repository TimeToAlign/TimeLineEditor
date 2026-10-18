// @vitest-environment jsdom
/// <reference types="node" />
/**
 * The block node renders a drawing's descriptors as the element tree the SVG
 * writer exports: every drawing fixture's `figure.svg`, element for element.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Block } from "@timetoalign/tilie-core";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import type { Drawing, Placement } from "@timetoalign/tilie-layout";
import { DEFAULT_LAYER, draw } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { toDescriptors } from "@timetoalign/tilie-writers";
import type { Graphical } from "@timetoalign/timeskeleton";
import {
  fontMetrics,
  isJsonFloat,
  isJsonObject,
  parseJson,
  SCHEMA_VERSION,
} from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { roving } from "../src/roving.ts";
import NodeHarness from "./NodeHarness.svelte";

const SVG = "http://www.w3.org/2000/svg";

const fixturesDirectory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);
const drawingsDirectory = path.join(fixturesDirectory, "drawings");
const cases = readdirSync(drawingsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

interface Inputs {
  readonly manifest: string;
  readonly placement: Placement;
  readonly scale: number;
  readonly layers: readonly Graphical[];
}

/** A value read by `parseJson` with every number as a plain number. */
function plainNumbers(value: unknown): unknown {
  if (isJsonFloat(value)) return value.value;
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(plainNumbers);
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plainNumbers(item)]),
    );
  }
  return value;
}

/** A drawing fixture drawn from its `inputs.json`, and its exported SVG text. */
function fixture(name: string) {
  const read = (file: string) => readFileSync(path.join(drawingsDirectory, name, file), "utf8");
  const inputs = plainNumbers(parseJson(read("inputs.json"))) as Inputs;
  const manifest = loadManifest(
    readFileSync(path.join(fixturesDirectory, inputs.manifest), "utf8"),
  );
  if (isLoadError(manifest)) throw new Error(`${name}: ${manifest.problems[0]?.message}`);
  const layers = [DEFAULT_LAYER, ...inputs.layers, manifest.graphical];
  const drawing = draw(manifest, inputs.placement, layers, fontMetrics);
  return { drawing, scale: inputs.scale, svg: read("figure.svg") };
}

interface Tree {
  readonly tag: string;
  readonly namespace: string | null;
  readonly attrs: readonly (readonly [string, string])[];
  readonly text: string | null;
}

/**
 * Elements as tag, namespace, attributes in document order, and text (null
 * when empty: Svelte keeps an empty text node in every element it renders).
 */
function trees(elements: Iterable<Element>, ignore: readonly string[] = []): Tree[] {
  return Array.from(elements, (element) => ({
    tag: element.localName,
    namespace: element.namespaceURI,
    attrs: Array.from(element.attributes)
      .filter((attribute) => !ignore.includes(attribute.name))
      .map((attribute) => [attribute.name, attribute.value] as const),
    text: element.textContent === "" ? null : element.textContent,
  }));
}

/** The drawn elements of an exported SVG: the children of its one group. */
function exported(svg: string): Tree[] {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  const groups = document.getElementsByTagNameNS(SVG, "g");
  expect(groups.length).toBe(1);
  return trees((groups[0] as Element).children);
}

let mounted: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

/**
 * The node mounted on `descriptors`, in a box of the given size and scale,
 * with the drawing's elements when given (they tell the node its boxes).
 */
function render(
  descriptors: readonly Descriptor[],
  box: {
    width: number;
    height: number;
    scale: number;
    elements?: Drawing["elements"];
    items?: Drawing["items"];
    cards?: Drawing["cards"];
  },
  selectedElements: ReadonlySet<string> = new Set(),
  affectedElements: ReadonlySet<string> = new Set(),
  movedElements: ReadonlySet<string> = new Set(),
): SVGSVGElement {
  const drawing = {
    width: box.width,
    height: box.height,
    elements: box.elements ?? [],
    items: box.items ?? [],
    cards: box.cards ?? [],
    unmapped: [],
  };
  const data = {
    block: { scale: box.scale } as Block,
    drawing,
    descriptors,
    selectedElements,
    affectedElements,
    movedElements,
    editing: null,
    // No editor is open: every drawn address lies inside.
    inside: new Set(drawing.elements.flatMap(({ address }) => (address === null ? [] : [address]))),
  };
  mounted = mount(NodeHarness, { target: document.body, props: { data: data as never } });
  flushSync();
  const svg = document.querySelector("svg");
  if (svg === null) throw new Error("the block node rendered no svg");
  return svg;
}

/** The drawing's elements as the node renders them: the children of `svg` but the boxes' marks. */
function drawn(svg: SVGSVGElement): Element[] {
  return Array.from(svg.children).filter((element) => !element.classList.contains("tilie-holding"));
}

/** The elements inside `svg` carrying `data-contains-selection`, as `<tag> <address>`. */
function containing(svg: SVGSVGElement): string[] {
  return Array.from(
    svg.querySelectorAll("[data-contains-selection]"),
    (element) => `${element.localName} ${element.getAttribute("data-address")}`,
  );
}

describe("BlockNode", () => {
  it.each(cases)("%s: renders the element tree of figure.svg", (name) => {
    const { drawing, scale, svg: text } = fixture(name);
    const svg = render(toDescriptors(drawing), { ...drawing, scale });

    expect(svg.namespaceURI).toBe(SVG);
    expect(svg.getAttribute("width")).toBe(String(drawing.width * scale));
    expect(svg.getAttribute("height")).toBe(String(drawing.height * scale));
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${drawing.width} ${drawing.height}`);
    expect(trees(svg.children)).toEqual(exported(text));
  });

  it("marks exactly the selected element's descriptors and the block holding them", () => {
    const { drawing, scale, svg: text } = fixture("styled__score");
    const descriptors = toDescriptors(drawing);
    const svg = render(descriptors, { ...drawing, scale }, new Set(["score/intro"]));

    const marked = Array.from(svg.querySelectorAll("[data-selected]"), (element) =>
      element.getAttribute("data-address"),
    );
    const expected = descriptors.filter(({ attrs }) =>
      attrs.some(([key, value]) => key === "data-address" && value === "score/intro"),
    );
    expect(expected.length).toBe(1);
    expect(marked).toEqual(["score/intro"]);
    // The mark is the only difference from the exported tree.
    expect(trees(drawn(svg), ["data-selected", "data-contains-selection"])).toEqual(exported(text));
    expect(containing(svg)).toEqual(["rect score/card"]);
    expect(
      Array.from(svg.querySelectorAll(".tilie-holding"), (mark) => mark.getAttribute("data-box")),
    ).toEqual(["block", "card"]);
    expect(document.querySelectorAll(".tilie-block[data-contains-selection]").length).toBe(1);
  });

  it("marks nothing without a selection", () => {
    const { drawing, scale } = fixture("styled__score");
    render(toDescriptors(drawing), { ...drawing, scale });

    expect(document.querySelectorAll("[data-selected]").length).toBe(0);
    expect(document.querySelectorAll("[data-affected]").length).toBe(0);
    expect(document.querySelectorAll("[data-contains-selection]").length).toBe(0);
    expect(document.querySelectorAll(".tilie-holding").length).toBe(0);
  });

  it("marks exactly the affected elements' descriptors, apart from the selected one", () => {
    const { drawing, scale, svg: text } = fixture("nested");
    const descriptors = toDescriptors(drawing);
    const svg = render(descriptors, { ...drawing, scale }, new Set(["clt_3"]), new Set(["clt_2"]));

    const addressed = (id: string) =>
      descriptors.filter(({ attrs }) =>
        attrs.some(([key, value]) => key === "data-address" && value === id),
      ).length;
    const marks = (attribute: string) =>
      Array.from(svg.querySelectorAll(`[${attribute}]`), (element) =>
        element.getAttribute("data-address"),
      );
    expect(marks("data-affected")).toEqual(Array(addressed("clt_2")).fill("clt_2"));
    expect(marks("data-selected")).toEqual(Array(addressed("clt_3")).fill("clt_3"));
    expect(addressed("clt_2")).toBe(3);
    expect(containing(svg)).toEqual(["rect clt_1/card"]);
    expect(
      trees(drawn(svg), ["data-selected", "data-affected", "data-contains-selection"]),
    ).toEqual(exported(text));
  });

  it("marks every descriptor carrying a selected address", () => {
    const { drawing, scale, svg: text } = fixture("bundle__bundle_shared_parent");
    const selected = new Set(["score", "exposition/start"]);
    const svg = render(toDescriptors(drawing), { ...drawing, scale }, selected);

    const marked = Array.from(svg.querySelectorAll("[data-selected]"), (element) =>
      element.getAttribute("data-address"),
    );
    const score = Array(4).fill("score");
    expect(marked).toEqual([...score, "exposition/start", "exposition/start", ...score]);
    expect(trees(drawn(svg), ["data-selected", "data-contains-selection"])).toEqual(exported(text));
    expect(containing(svg)).toEqual([
      "rect group_1",
      "rect exposition/card",
      "rect group_2",
      "rect recapitulation/card",
    ]);
    expect(document.querySelectorAll(".tilie-block[data-contains-selection]").length).toBe(1);
  });

  it("marks a selected card on its own rectangle, not on its shadow", () => {
    const { drawing, scale, svg: text } = fixture("group__group_child_member");
    const svg = render(toDescriptors(drawing), { ...drawing, scale }, new Set(["recording/card"]));

    const cards = Array.from(svg.querySelectorAll('rect[data-address="recording/card"]'));
    expect(cards.length).toBe(2);
    expect(Array.from(svg.querySelectorAll("[data-selected]"))).toEqual([cards[1]]);
    expect(trees(drawn(svg), ["data-selected", "data-contains-selection"])).toEqual(exported(text));
    expect(containing(svg)).toEqual(["rect group_1"]);
    expect(document.querySelectorAll(".tilie-block[data-contains-selection]").length).toBe(1);
  });

  it("renders text and attribute values as text, never as markup", () => {
    const name = '<b id="x">C♯ & D♭</b>';
    const svg = render(
      [
        {
          tag: "text",
          attrs: [
            ["data-address", 'a"<b>'],
            ["x", 1.5],
          ],
          text: name,
        },
      ],
      { width: 10, height: 10, scale: 1 },
    );

    expect(trees(svg.children)).toEqual([
      {
        tag: "text",
        namespace: SVG,
        attrs: [
          ["data-address", 'a"<b>'],
          ["x", "1.5"],
        ],
        text: name,
      },
    ]);
    expect(svg.querySelectorAll("b").length).toBe(0);
  });
});

describe("roving", () => {
  /** A toolbar of buttons `a`, `b` (disabled) and `c`, with `roving` attached. */
  function toolbar(orientation?: "vertical") {
    const element = document.createElement("div");
    element.setAttribute("role", "toolbar");
    if (orientation !== undefined) element.setAttribute("aria-orientation", orientation);
    for (const name of ["a", "b", "c"]) {
      const button = document.createElement("button");
      button.textContent = name;
      button.disabled = name === "b";
      element.append(button);
    }
    document.body.append(element);
    const [a, b, c] = Array.from(element.querySelectorAll("button"));
    if (a === undefined || b === undefined || c === undefined) throw new Error("no buttons");
    const detach = roving(element);
    return { element, a, b, c, detach };
  }

  function press(key: string): void {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  }

  it("is one tab stop and moves focus by arrows, Home and End over the enabled buttons", () => {
    const { a, b, c } = toolbar();
    // b is disabled: never focused, never the tab stop.
    expect([a.tabIndex, c.tabIndex]).toEqual([0, -1]);

    a.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(c);
    expect([a.tabIndex, c.tabIndex]).toEqual([-1, 0]);
    press("ArrowRight");
    expect(document.activeElement).toBe(a);
    press("ArrowLeft");
    expect(document.activeElement).toBe(c);
    press("Home");
    expect(document.activeElement).toBe(a);
    press("End");
    expect(document.activeElement).toBe(c);
    expect(document.activeElement).not.toBe(b);
  });

  it("moves by ArrowDown and ArrowUp in a vertical toolbar, not by ArrowRight and ArrowLeft", () => {
    const { a, c } = toolbar("vertical");
    a.focus();
    press("ArrowDown");
    expect(document.activeElement).toBe(c);
    press("ArrowDown");
    expect(document.activeElement).toBe(a);
    press("ArrowUp");
    expect(document.activeElement).toBe(c);
    press("ArrowRight");
    expect(document.activeElement).toBe(c);
    press("ArrowLeft");
    expect(document.activeElement).toBe(c);
  });

  it("hands the tab stop on when its button is disabled, and lets go when detached", async () => {
    const { a, c, detach } = toolbar();
    c.focus();
    expect([a.tabIndex, c.tabIndex]).toEqual([-1, 0]);
    c.disabled = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(a.tabIndex).toBe(0);

    detach?.();
    a.focus();
    press("ArrowRight");
    expect(document.activeElement).toBe(a);
  });
});
