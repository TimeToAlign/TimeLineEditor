/**
 * The selection in the Manifest tab's text: where it lies, the lines of
 * each format holding it, and the marks and scrolling of the tab; the
 * expected values are derived in `README.md` ("The selection in the
 * manifest's text").
 */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Block, ElementAddress, Json, PathSegment } from "@timetoalign/tilie-core";
import { dumps, fontMetrics, minimal } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { Format } from "../src/inspector/formats.svelte.ts";
import { loadCodec, locateText } from "../src/inspector/formats.svelte.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import { manifestOf, manifestText } from "../src/inspector/manifestText.ts";
import { scrollTopFor, selectionPaths } from "../src/inspector/textPlace.ts";
import { holder } from "./holder.svelte.ts";
import { blockId, posting, providing, storeOf } from "./support.ts";

const A = blockId(0);
const SHOWN = { includeStyling: true, minimal: true } as const;
const SCORE: PathSegment[] = ["timelines", 0];
const FLOW: PathSegment[] = [...SCORE, "flow_control"];

beforeAll(async () => {
  await loadCodec("yaml");
  await loadCodec("toml");
});

/** Block A of a store holding `fixture`. */
function blockOf(fixture: string): Block {
  return storeOf(fixture).view.blocks[A] as Block;
}

/** The text the tab shows of `block` in `format`. */
function textOf(block: Block, format: Format): string {
  const written = manifestText(manifestOf(block), format, SHOWN);
  if (!written.ok) throw new Error(written.problems[0]?.message);
  return written.value.text;
}

/** The value the text shows at `path`, its numbers plain. */
function valueAt(block: Block, path: readonly PathSegment[]): unknown {
  const shown = JSON.parse(dumps(minimal(manifestOf(block)), { serialization: "json" })) as Json;
  return path.reduce<unknown>(
    (value, key) => (value as Record<string | number, unknown>)[key],
    shown,
  );
}

/** Lines `first` to `last` of `text`. */
function cut(text: string, first: number, last: number): string[] {
  return text.split("\n").slice(first - 1, last);
}

/** `lines` without their common indentation. */
function outdented(lines: readonly string[]): string {
  const indent = Math.min(
    ...lines.filter((line) => line.trim() !== "").map((line) => line.search(/\S/u)),
  );
  return lines.map((line) => line.slice(indent)).join("\n");
}

/** The paths of the selection of `elements` of block A of `block`'s store. */
function pathsOf(fixture: string, ...elements: ElementAddress[]): PathSegment[][] {
  const store = storeOf(fixture);
  const selection = selectionOf(elements.map((element) => ({ block: A, ...element })));
  return selectionPaths(resolveSelection(store.view, selection, null, fontMetrics));
}

describe("where the selection lies", () => {
  it("is each element's place, a destination at its place in the jump", () => {
    expect(pathsOf("flow/repairs", { id: "jump_1" })).toEqual([[...FLOW, 2]]);
    expect(pathsOf("flow/repairs", { id: "jump_1" }, { id: "jump_1", part: ["label"] })).toEqual([
      [...FLOW, 2],
    ]);
    expect(pathsOf("flow/repairs", { id: "score", facet: "flow_control" })).toEqual([FLOW]);
    expect(pathsOf("flow/repairs", { id: "jump_2" }, { id: "jump_target_1" })).toEqual([
      [...FLOW, 3, "targets", 0],
      [...FLOW, 1],
    ]);
    expect(pathsOf("flow/repairs", { id: "jump_1" }, { id: "barline_1" })).toEqual([
      [...FLOW, 2],
      [...FLOW, 0],
    ]);
    expect(pathsOf("flow/repairs")).toEqual([]);
  });
});

describe("the lines of a place", () => {
  const block = blockOf("flow/repairs");
  const places: PathSegment[][] = [
    ["name"],
    SCORE,
    ...[0, 1, 2, 3].map((index) => [...FLOW, index]),
    FLOW,
    [...FLOW, 3, "targets", 0],
  ];

  it("read back in JSON as the value there", () => {
    const text = textOf(block, "json");
    for (const path of places) {
      const lines = locateText("json", text, path);
      if (lines === null) throw new Error(`no lines for ${JSON.stringify(path)}`);
      const held = cut(text, lines.first, lines.last).join("\n").trim().replace(/,$/u, "");
      const key = path.at(-1);
      const read = typeof key === "string" ? JSON.parse(`{${held}}`) : JSON.parse(held);
      const expected = valueAt(block, path);
      expect(read).toEqual(typeof key === "string" ? { [key]: expected } : expected);
    }
    expect(locateText("json", text, [...FLOW, 2])).toEqual({ first: 106, last: 129 });
    expect(locateText("json", text, [...FLOW, 3, "targets", 0])).toEqual({
      first: 149,
      last: 153,
    });
  });

  it("read back in YAML as the value there", () => {
    const text = textOf(block, "yaml");
    for (const path of places) {
      const lines = locateText("yaml", text, path);
      if (lines === null) throw new Error(`no lines for ${JSON.stringify(path)}`);
      const read = parse(outdented(cut(text, lines.first, lines.last)));
      const key = path.at(-1);
      const expected = valueAt(block, path);
      expect(read).toEqual(typeof key === "string" ? { [key]: expected } : [expected]);
    }
    expect(locateText("yaml", text, [...FLOW, 2])).toEqual({ first: 85, last: 101 });
    expect(locateText("yaml", text, [...FLOW, 3, "targets", 0])).toEqual({
      first: 117,
      last: 120,
    });
  });

  it("are in TOML a section, or the key whose value holds the place", () => {
    const text = textOf(block, "toml");
    const lines = text.split("\n");
    expect(lines[7]?.startsWith("flow_control = [ { ")).toBe(true);
    for (const index of [0, 1, 2, 3]) {
      expect(locateText("toml", text, [...FLOW, index])).toEqual({ first: 8, last: 8 });
    }
    expect(lines[6]).toBe("[[timelines]]");
    expect(locateText("toml", text, SCORE)).toEqual({ first: 7, last: 12 });

    const sonata = textOf(blockOf("flow/sonata_exposition"), "toml");
    const rows = sonata.split("\n");
    const found = locateText("toml", sonata, ["flow_maps", 1]);
    if (found === null) throw new Error("no lines for the second FlowMap");
    expect(rows[found.first - 1]).toBe("[[flow_maps]]");
    expect(rows.slice(0, found.first).filter((row) => row === "[[flow_maps]]").length).toBe(2);
    expect(cut(sonata, found.first, found.last)).toContain('id = "#flow_map_2"');
    expect(rows[found.last]).toBe("");
    expect(rows[found.last + 1]?.startsWith("[")).toBe(true);
  });

  it("follow TOML's sections and keys over several lines", () => {
    const text = [
      'name = "Typed"', // 1
      "", // 2
      "[[timelines]]", // 3
      'id = "#a"', // 4
      "", // 5
      "[[timelines.flow_control]]", // 6
      'id = "#first"', // 7
      "", // 8
      "[[timelines.flow_control]]", // 9
      'id = "#second"', // 10
      "", // 11
      "[[timelines.flow_control.targets]]", // 12
      "repeat_count = 1", // 13
      "", // 14
      "[[timelines]]", // 15
      'id = "#b"', // 16
      "length = [", // 17
      "  16,", // 18
      "  1 ]", // 19
      "", // 20
      "[[timelines.flow_control]]", // 21
      'id = "#third"', // 22
    ].join("\n");
    expect(locateText("toml", text, ["timelines", 0, "flow_control", 1])).toEqual({
      first: 9,
      last: 13,
    });
    expect(locateText("toml", text, ["timelines", 1, "flow_control", 0])).toEqual({
      first: 21,
      last: 22,
    });
    expect(locateText("toml", text, ["timelines", 1, "length"])).toEqual({ first: 17, last: 19 });
    expect(locateText("toml", text, ["timelines", 0])).toEqual({ first: 3, last: 13 });
  });

  it("are none for the whole text, a key the text lacks and a text not of its format", () => {
    const stylingLess = { includeStyling: false, minimal: true } as const;
    for (const format of ["json", "yaml", "toml"] as const) {
      const written = manifestText(manifestOf(block), format, stylingLess);
      if (!written.ok) throw new Error("not written");
      expect(locateText(format, written.value.text, [])).toBeNull();
      expect(locateText(format, written.value.text, ["graphical"])).toBeNull();
      expect(locateText(format, "{ [ : nothing", [...FLOW, 0])).toBeNull();
    }
  });
});

describe("the Manifest tab", () => {
  let app: ReturnType<typeof mount> | undefined;
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
    if (scrollHeight !== undefined) {
      Object.defineProperty(Element.prototype, "scrollHeight", scrollHeight);
    }
  });

  /** Rows of 20 px: the text's scroll height is 20 px a line. */
  function rowsOf20(): void {
    Object.defineProperty(Element.prototype, "scrollHeight", {
      configurable: true,
      get(this: Element) {
        return this instanceof HTMLTextAreaElement ? this.value.split("\n").length * 20 : 0;
      },
    });
  }

  const marks = () =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="text-mark"]')].map((mark) => [
      Number(mark.dataset.first),
      Number(mark.dataset.last),
    ]);
  const area = () => document.querySelector("textarea") as HTMLTextAreaElement;

  function openManifest(selection: Address[]): { value: Selection } {
    const store = storeOf("flow/repairs");
    const selected = holder<Selection>(selectionOf(selection));
    app = mount(providing(Inspector), {
      target: document.body,
      context: posting(),
      props: {
        live: liveStore(store),
        get selection() {
          return selected.value;
        },
        placement: null,
      },
    });
    flushSync();
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (item) => item.textContent?.trim() === "Manifest",
    );
    tab?.click();
    flushSync();
    return selected;
  }

  it("marks the selection's lines and scrolls to them", () => {
    rowsOf20();
    const selected = openManifest([{ block: A, id: "jump_1" }]);
    expect(marks()).toEqual([[85, 101]]);
    expect(area().scrollTop).toBe(1660);

    selected.value = selectionOf([{ block: A, id: "barline_1" }]);
    flushSync();
    expect(marks()).toEqual([[62, 69]]);
    expect(area().scrollTop).toBe(1200);

    (document.querySelector('input[value="json"]') as HTMLInputElement).click();
    flushSync();
    expect(marks()).toEqual([[75, 85]]);
    expect(area().scrollTop).toBe(1460);

    area().value = `${area().value} `;
    area().dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(marks()).toEqual([]);
  });

  it("never scrolls above the text's top", () => {
    expect([scrollTopFor(1, 20), scrollTopFor(2, 20), scrollTopFor(3, 20)]).toEqual([0, 0, 20]);
  });
});
