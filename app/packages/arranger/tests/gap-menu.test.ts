// @vitest-environment jsdom
/**
 * The menu that asks how to close the gap a deleted segment leaves: which
 * ways it offers, which it preselects, and its keys. The canvas does not
 * mount it while deleting a segment is not supported.
 */

import type { Gap, GapOption } from "@timetoalign/tilie-core";
import { segmentGaps } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { preferredGap } from "../src/commands.ts";
import GapMenu from "../src/GapMenu.svelte";
import { load, loadUnlocked } from "./support.ts";

let mounted: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

/** Core's options for `t2` of `segment_children` with `theme` unlocked in the file: all four. */
function themeOptions(): readonly GapOption[] {
  return segmentGaps(loadUnlocked("segment_children", "theme"), "t2") ?? [];
}

/** Core's options for `t2` of `segment_children` as it is, `theme` locked: only the extends. */
function lockedOptions(): readonly GapOption[] {
  return segmentGaps(load("segment_children"), "t2") ?? [];
}

/** Mount the menu, recording its calls. */
function render(options: readonly GapOption[]): (Gap | "cancel")[] {
  const calls: (Gap | "cancel")[] = [];
  const props = {
    segment: "t2",
    options,
    gap: preferredGap(options) as Gap,
    x: 100,
    y: 50,
    onconfirm: (gap: Gap) => calls.push(gap),
    oncancel: () => calls.push("cancel"),
  };
  mounted = mount(GapMenu, { target: document.body, props });
  flushSync();
  return calls;
}

function radio(option: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`[data-testid="gap-${option}"]`);
  if (found === null) throw new Error(`no radio ${option}`);
  return found;
}

const checked = () =>
  [...document.querySelectorAll<HTMLInputElement>("input:checked")].map((input) => input.value);

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  flushSync();
}

function choose(option: string): void {
  radio(option).click();
  flushSync();
}

const WAYS = ["left-extend", "right-extend", "left-shift", "right-shift"];

const titles = () => WAYS.map((way) => radio(way).closest("label")?.getAttribute("title") ?? null);

describe("the Delete menu of a segment", () => {
  it("offers the four ways in order, each named by the neighbour that moves", () => {
    render(themeOptions());
    expect(document.querySelector("form")?.getAttribute("aria-label")).toBe("Delete segment t2");
    expect([...document.querySelectorAll("legend")].map((legend) => legend.textContent)).toEqual([
      "Closes the gap",
    ]);
    const inputs = [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(inputs.map((input) => input.value)).toEqual(WAYS);
    const text = (ids: string | null) =>
      (ids ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? null)
        .join(" ");
    expect(inputs.map((input) => text(input.getAttribute("aria-labelledby")))).toEqual([
      "Left extends",
      "Right extends",
      "Left shifts",
      "Right shifts",
    ]);
    expect(inputs.map((input) => text(input.getAttribute("aria-describedby")))).toEqual([
      "The left neighbour grows into the gap.",
      "The right neighbour starts where the deleted segment started and grows into the gap.",
      "The left neighbour and everything before it move right into the gap.",
      "The right neighbour and everything after it move left into the gap.",
    ]);
  });

  it("disables a way that is not permitted, with its reason as its title", () => {
    render(lockedOptions());
    expect(WAYS.map((way) => radio(way).disabled)).toEqual([false, false, true, true]);
    expect(titles()).toEqual([
      null,
      null,
      "its segment line theme is locked",
      "its segment line theme is locked",
    ]);
  });

  it("enables every way that is permitted, without a title", () => {
    render(themeOptions());
    expect(WAYS.map((way) => radio(way).disabled)).toEqual([false, false, false, false]);
    expect(titles()).toEqual([null, null, null, null]);
  });

  it("preselects the first permitted way and takes the focus", () => {
    render(themeOptions());
    expect(checked()).toEqual(["left-extend"]);
    expect(document.activeElement).toBe(radio("left-extend"));
  });

  it("confirms with Enter and cancels with Escape", () => {
    const calls = render(themeOptions());
    choose("right-shift");
    expect(checked()).toEqual(["right-shift"]);
    press(radio("right-shift"), "Enter");
    expect(calls).toEqual([{ side: "right", verb: "shift" }]);
    press(radio("right-shift"), "Escape");
    expect(calls).toEqual([{ side: "right", verb: "shift" }, "cancel"]);
  });

  it("confirms with OK and cancels with Cancel", () => {
    const calls = render(themeOptions());
    document.querySelector<HTMLButtonElement>('[data-testid="gap-ok"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-testid="gap-cancel"]')?.click();
    flushSync();
    expect(calls).toEqual([{ side: "left", verb: "extend" }, "cancel"]);
  });

  it("chooses among the permitted ways only", () => {
    const options: GapOption[] = [
      { gap: { side: "left", verb: "extend" }, refused: null },
      { gap: { side: "right", verb: "extend" }, refused: "the following segment c is locked" },
      { gap: { side: "left", verb: "shift" }, refused: "its segment line is locked" },
      { gap: { side: "right", verb: "shift" }, refused: null },
    ];
    const calls = render(options);
    expect(WAYS.map((way) => radio(way).disabled)).toEqual([false, true, true, false]);
    expect(titles()).toEqual([
      null,
      "the following segment c is locked",
      "its segment line is locked",
      null,
    ]);
    expect(checked()).toEqual(["left-extend"]);
    choose("right-shift");
    expect(checked()).toEqual(["right-shift"]);
    press(radio("right-shift"), "Enter");
    choose("left-extend");
    expect(checked()).toEqual(["left-extend"]);
    press(radio("left-extend"), "Enter");
    expect(calls).toEqual([
      { side: "right", verb: "shift" },
      { side: "left", verb: "extend" },
    ]);
  });
});
