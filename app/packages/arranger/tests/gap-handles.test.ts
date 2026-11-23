// @vitest-environment jsdom
/**
 * The handles of a selected stored elision on the canvas and its mode menu
 * (README, "Elisions on the canvas", the handles): one handle per edge a
 * gap reaches, at its timeline's line; the toggles Coordinates and Width,
 * never neither; nothing for a default or carried gap or a line.
 */

import type { Address } from "@timetoalign/tilie-core";
import { idAddress, inBlock, partAddress } from "@timetoalign/tilie-core";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Selection, selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { settle, stubCanvasGlobals } from "./dom.ts";
import { A, metrics, storeOf, viewOf } from "./support.ts";

interface Mounted {
  select(next: Selection): void;
}

const STORED = "bundles/bundle_elisions_stored";

let mounted: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  stubCanvasGlobals(() => true);
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/** Mount `fixture` with `address` selected. */
async function shown(fixture: string, address: Address): Promise<void> {
  if (mounted !== undefined) unmount(mounted);
  document.body.innerHTML = "";
  const store = storeOf(viewOf({ id: A, fixture }));
  const instance = mount(Harness, { target: document.body, props: { store, metrics } });
  mounted = instance;
  // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
  const harness = instance as Mounted;
  await settle();
  harness.select(selectionOf([address]));
  await settle();
}

/** The handles shown, by test ID, in document order. */
const handles = () =>
  [...document.querySelectorAll("[data-testid^='gap-handle-']")].map(
    (handle) => handle.getAttribute("data-testid") ?? "",
  );

/** Whether each gap mode button shows pressed, `null` without the menu. */
const modes = () =>
  ["coordinates", "width"].map(
    (mode) =>
      document.querySelector(`[data-testid="gap-mode-${mode}"]`)?.getAttribute("aria-pressed") ??
      null,
  );

async function pressMode(mode: string): Promise<void> {
  document
    .querySelector(`[data-testid="gap-mode-${mode}"]`)
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await settle();
}

describe("the handles of a selected elision", () => {
  it("shows each edge a gap reaches, and the mode menu, Coordinates pressed", async () => {
    await shown(STORED, inBlock(A, idAddress("elision_5")));
    expect([handles(), modes()]).toEqual([
      ["gap-handle-start", "gap-handle-end"],
      ["true", "false"],
    ]);
    await shown(STORED, inBlock(A, idAddress("elision_4")));
    expect(handles()).toEqual(["gap-handle-start"]);
    await shown(STORED, inBlock(A, idAddress("elision_3")));
    expect(handles()).toEqual(["gap-handle-start", "gap-handle-end"]);
  });

  it("toggles the modes, never neither", async () => {
    await shown(STORED, inBlock(A, idAddress("elision_5")));
    await pressMode("width");
    expect(modes()).toEqual(["true", "true"]);
    await pressMode("coordinates");
    expect(modes()).toEqual(["false", "true"]);
    await pressMode("width");
    expect(modes()).toEqual(["false", "true"]);
  });

  it("shows nothing for a default gap or a line", async () => {
    await shown(
      "groups/group_elided_inside",
      inBlock(A, partAddress(idAddress("first"), "elision")),
    );
    expect([handles(), modes()]).toEqual([[], [null, null]]);
    await shown(STORED, inBlock(A, idAddress("score")));
    expect([handles(), modes()]).toEqual([[], [null, null]]);
  });
});
