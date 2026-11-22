// @vitest-environment jsdom
/**
 * The handles of a selected strip on the canvas (README, "Elisions on the
 * canvas"): one extent handle per edge a piece shows, one width grip per
 * piece, none without a selected strip.
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

/** The handles shown on `fixture` with `address` selected, by test ID, in document order. */
async function handlesOn(fixture: string, address: Address | null): Promise<string[]> {
  const store = storeOf(viewOf({ id: A, fixture }));
  const instance = mount(Harness, { target: document.body, props: { store, metrics } });
  mounted = instance;
  // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
  const harness = instance as Mounted;
  await settle();
  harness.select(address === null ? selectionOf([]) : selectionOf([address]));
  await settle();
  return [...document.querySelectorAll("[data-testid^='strip-handle-']")].map(
    (handle) => handle.getAttribute("data-testid") ?? "",
  );
}

describe("the handles of a selected strip", () => {
  it("shows each edge a piece moves and its width grip", async () => {
    expect(
      await handlesOn("bundles/bundle_elisions_stored", inBlock(A, idAddress("elision_5"))),
    ).toEqual(["strip-handle-start", "strip-handle-end", "strip-handle-width"]);
  });

  it("shows only the edge a clipped piece reaches", async () => {
    expect(
      await handlesOn("bundles/bundle_elisions_stored", inBlock(A, idAddress("elision_4"))),
    ).toEqual(["strip-handle-start", "strip-handle-width"]);
  });

  it("shows a default strip's handles, and none without a strip selected", async () => {
    const movement = inBlock(A, partAddress(idAddress("movement"), "elision"));
    expect(await handlesOn("groups/group_grandchild", movement)).toEqual([
      "strip-handle-start",
      "strip-handle-end",
      "strip-handle-width",
    ]);
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
    expect(await handlesOn("groups/group_grandchild", inBlock(A, idAddress("score")))).toEqual([]);
  });
});
