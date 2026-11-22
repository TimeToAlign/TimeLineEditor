// @vitest-environment jsdom
/**
 * A transient command (README, "A transient command"): the canvas shows
 * the block as the store would after the command, and stores nothing.
 */

import type { Command, Store } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Harness from "./CanvasHarness.svelte";
import { settle, stubCanvasGlobals } from "./dom.ts";
import { A, changed, metrics, storeOf, viewOf } from "./support.ts";

const VIEW = viewOf({ id: A, fixture: "timestamp_wedge_rotation" });

/** The `style` turning the wedge of `timestamp_1` by `rotation` degrees in `block`. */
const turned = (rotation: number, block = A): Command => ({
  type: "style",
  select: { element: "wedge", addresses: [{ id: "timestamp_1" }] },
  set: { rotation },
  blocks: [block],
});

describe("a transient command", () => {
  const mounted: ReturnType<typeof mount>[] = [];

  afterEach(() => {
    for (const app of mounted.splice(0)) unmount(app);
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  /** A canvas on `store`, in its own element. */
  async function canvasOn(store: Store): Promise<{ app: ReturnType<typeof mount>; at: Element }> {
    const at = document.body.appendChild(document.createElement("div"));
    const app = mount(Harness, { target: at, props: { store, metrics } });
    mounted.push(app);
    await settle();
    return { app, at };
  }

  /** Block A's node in `at` as [the wedge's points, the node's width, its height]. */
  function shown(at: Element): [string | null, string, string] {
    const node = at.querySelector<HTMLElement>(`.svelte-flow__node[data-id="${A}"]`);
    if (node === null) throw new Error("no node A");
    const wedge = node.querySelector('polygon[data-id="timestamp_1"]');
    if (wedge === null) throw new Error("no wedge of timestamp_1");
    return [wedge.getAttribute("points"), node.style.width, node.style.height];
  }

  it("shows the block as the store would after it, and stores nothing", async () => {
    stubCanvasGlobals(() => true);
    const store = storeOf(VIEW);
    const at45 = (await canvasOn(storeOf(changed(VIEW, turned(45))))).at;
    const at46 = (await canvasOn(storeOf(changed(VIEW, turned(46))))).at;
    const { app, at } = await canvasOn(store);
    const stored = shown(at);
    const before = { view: store.view, entries: store.journal.length };

    app.showTransient({ block: A, command: turned(45) });
    flushSync();
    expect([shown(at), shown(at)[0] === stored[0]]).toEqual([shown(at45), false]);

    app.showTransient({ block: A, command: turned(46) });
    flushSync();
    expect(shown(at)).toEqual(shown(at46));
    expect([store.view === before.view, store.journal.length]).toEqual([true, before.entries]);

    app.showTransient(null);
    flushSync();
    expect(shown(at)).toEqual(stored);

    app.showTransient({ block: A, command: turned(45, "0000000009") });
    flushSync();
    expect(shown(at)).toEqual(stored);
  });
});
