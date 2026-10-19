// @vitest-environment jsdom
/**
 * The store as Svelte state: the getters are the store's own values, an
 * effect runs again once per change of the store, and the store is
 * subscribed only while something reads reactively. The cases are in
 * `README.md` ("The store as Svelte state").
 */

import type { Store, View } from "@timetoalign/tilie-core";
import { flushSync, tick } from "svelte";
import { describe, expect, it } from "vitest";
import { liveStore } from "../src/liveStore.svelte.ts";
import { A, B, load, mixedView, storeOf } from "./support.ts";

function fresh(): Store {
  return storeOf(mixedView());
}

function addB(store: Store): void {
  const refusal = store.dispatch({
    type: "add",
    into: "workspace",
    block: { id: B, manifest: load("bare"), x: 1000, y: 0 },
  });
  if (refusal !== null) throw new Error(refusal.message);
}

describe("liveStore", () => {
  it("reads every value from the store when asked", () => {
    const store = fresh();
    const live = liveStore(store);
    const same = () => {
      expect(live.store).toBe(store);
      expect(live.view).toBe(store.view);
      expect(live.editing).toBe(store.editing);
      expect(live.entries).toBe(store.entries);
      expect(live.listed).toBe(store.listed);
      expect(live.journal).toBe(store.journal);
      expect(live.sessions).toBe(store.sessions);
      expect(live.changes).toBe(store.changes);
      expect(live.openings).toBe(store.openings);
    };
    same();
    const before = store.view;
    addB(store);
    same();
    expect(live.view).not.toBe(before);
  });

  it("runs a reading effect again once for each change of the store", () => {
    const store = fresh();
    const live = liveStore(store);
    const runs: [View, number, number, number][] = [];
    const destroy = $effect.root(() => {
      $effect(() => {
        runs.push([live.view, live.editing.length, live.changes, live.openings]);
      });
    });
    flushSync();
    expect(runs).toEqual([[store.view, 0, 0, 0]]);
    const first = store.view;
    addB(store);
    flushSync();
    expect(runs.length).toBe(2);
    expect(runs[0]?.[0]).toBe(first);
    expect(runs[1]?.[0]).toBe(store.view);
    expect(runs[1]?.slice(1)).toEqual([0, 0, 0]);
    expect(store.open(A)).toBeNull();
    flushSync();
    expect(runs.length).toBe(3);
    expect(runs[2]?.[0]).toBe(store.view);
    expect(runs[2]?.slice(1)).toEqual([1, 0, 1]);
    const refusal = store.dispatch({
      type: "add",
      into: `${A}/dlt_1`,
      region: { id: "region_1", name: "A", start: 0, end: 10 },
    });
    expect(refusal).toBeNull();
    flushSync();
    expect(runs.length).toBe(4);
    expect(runs[3]?.[0]).toBe(store.view);
    expect(runs[3]?.slice(1)).toEqual([1, 1, 1]);
    flushSync();
    expect(runs.length).toBe(4);
    destroy();
  });

  it("holds a subscription only while an effect reads it", async () => {
    const store = fresh();
    let listeners = 0;
    const subscribe = store.subscribe.bind(store);
    const counted: Store = Object.create(store, {
      subscribe: {
        value: (listener: (view: View) => void) => {
          listeners += 1;
          const stop = subscribe(listener);
          return () => {
            listeners -= 1;
            stop();
          };
        },
      },
    });
    const live = liveStore(counted);
    void live.view;
    expect(listeners).toBe(0);
    const destroy = $effect.root(() => {
      $effect(() => {
        void live.view;
      });
      $effect(() => {
        void live.editing;
      });
    });
    flushSync();
    expect(listeners).toBe(1);
    destroy();
    await tick();
    expect(listeners).toBe(0);
  });
});
