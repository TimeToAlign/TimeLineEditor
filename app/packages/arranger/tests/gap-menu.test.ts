// @vitest-environment jsdom
/**
 * The menu Delete opens for a segment: which options it offers, which it
 * preselects, and its keys.
 */

import type { Gap, GapOption } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { preferredGap, removeCommand } from "../src/commands.ts";
import GapMenu from "../src/GapMenu.svelte";
import { A, changed, viewOf } from "./support.ts";

let mounted: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

/** The options `removeCommand` gives for `t2` of `segment_children` with `theme` unlocked. */
function themeOptions(): readonly GapOption[] {
  const view = changed(viewOf({ id: A, fixture: "segment_children" }), {
    type: "set",
    changes: [{ target: `${A}/theme`, values: { locked: false } }],
  });
  const asked = removeCommand(view, new Set([`${A}/t2`]));
  if (!("segment" in asked)) throw new Error("expected the segment's ways");
  return asked.options;
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

describe("the Delete menu of a segment", () => {
  it("disables what no permitted way takes, with the reasons as its title", () => {
    render(themeOptions());
    expect(["left", "right", "extend", "shift"].map((option) => radio(option).disabled)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(radio("extend").closest("label")?.title).toBe(
      "the preceding segment t1 is locked; the following segment t3 is locked",
    );
    expect(radio("shift").closest("label")?.hasAttribute("title")).toBe(false);
  });

  it("preselects the first permitted way and takes the focus", () => {
    render(themeOptions());
    expect(checked()).toEqual(["left", "shift"]);
    expect(document.activeElement).toBe(radio("left"));
  });

  it("confirms with Enter and cancels with Escape", () => {
    const calls = render(themeOptions());
    choose("right");
    expect(checked()).toEqual(["right", "shift"]);
    press(radio("right"), "Enter");
    expect(calls).toEqual([{ side: "right", verb: "shift" }]);
    press(radio("right"), "Escape");
    expect(calls).toEqual([{ side: "right", verb: "shift" }, "cancel"]);
  });

  it("confirms with OK and cancels with Cancel", () => {
    const calls = render(themeOptions());
    document.querySelector<HTMLButtonElement>('[data-testid="gap-ok"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-testid="gap-cancel"]')?.click();
    flushSync();
    expect(calls).toEqual([{ side: "left", verb: "shift" }, "cancel"]);
  });

  it("switches the other column to a permitted way", () => {
    const options: GapOption[] = [
      { gap: { side: "left", verb: "extend" }, refused: null },
      { gap: { side: "right", verb: "extend" }, refused: "the following segment c is locked" },
      { gap: { side: "left", verb: "shift" }, refused: "its segment line is locked" },
      { gap: { side: "right", verb: "shift" }, refused: null },
    ];
    const calls = render(options);
    expect(["left", "right", "extend", "shift"].map((option) => radio(option).disabled)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(checked()).toEqual(["left", "extend"]);
    choose("shift");
    expect(checked()).toEqual(["right", "shift"]);
    press(radio("shift"), "Enter");
    choose("left");
    expect(checked()).toEqual(["left", "extend"]);
    press(radio("left"), "Enter");
    expect(calls).toEqual([
      { side: "right", verb: "shift" },
      { side: "left", verb: "extend" },
    ]);
  });

  it("names itself and its columns", () => {
    render(themeOptions());
    expect(document.querySelector("form")?.getAttribute("aria-label")).toBe("Delete segment t2");
    expect([...document.querySelectorAll("legend")].map((legend) => legend.textContent)).toEqual([
      "Neighbour",
      "Closes the gap by",
    ]);
  });
});
