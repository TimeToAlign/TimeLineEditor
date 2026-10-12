import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveError, clear, createAutosave, recoverWorkspace } from "../src/autosave.ts";

let puts: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  puts = vi.spyOn(IDBObjectStore.prototype, "put");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Create the autosave database at version 2, so that opening it at version 1 fails. */
function occupyDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tilie-autosave", 2);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/** The rejection of `promise`, which must reject. */
async function rejection(promise: Promise<unknown>): Promise<AutosaveError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AutosaveError);
    return error as AutosaveError;
  }
  throw new Error("the promise resolved");
}

/** A snapshot of `text` in the file `n.tle.json`. */
function snap(text: string) {
  return { text, name: "n.tle.json" };
}

function shape(error: AutosaveError) {
  return { code: error.code, key: error.key, cause: (error.cause as Error | undefined)?.name };
}

describe("createAutosave", () => {
  it("writes only the last text within the delay, and flush cancels the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const autosave = createAutosave({ key: "w", delayMs: 100 });

    await autosave.flush();
    expect(puts.mock.calls).toEqual([]);

    autosave.schedule(snap("a"));
    vi.advanceTimersByTime(50);
    autosave.schedule(snap("b"));
    vi.advanceTimersByTime(70);
    autosave.schedule(snap("c"));
    vi.advanceTimersByTime(99);
    vi.advanceTimersByTime(1);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([[snap("c"), "w"]]);

    autosave.schedule(snap("d"));
    vi.advanceTimersByTime(99);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([
      [snap("c"), "w"],
      [snap("d"), "w"],
    ]);

    vi.advanceTimersByTime(1000);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([
      [snap("c"), "w"],
      [snap("d"), "w"],
    ]);
  });
});

describe("text given by a function", () => {
  it("calls the function once, when the write is due, and writes what it returns", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    const first = vi.fn(() => snap("first"));
    const second = vi.fn(() => snap("second"));
    autosave.schedule(first);
    autosave.schedule(second);
    vi.advanceTimersByTime(99);
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 0]);

    vi.advanceTimersByTime(1);
    await autosave.flush();
    expect([first.mock.calls.length, second.mock.calls.length]).toEqual([0, 1]);
    expect(puts.mock.calls).toEqual([[snap("second"), "w"]]);
  });
});

describe("discard", () => {
  it("drops the pending snapshot and empties the slot after the writes already started", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule(snap("a"));
    await autosave.flush();
    autosave.schedule(snap("b"));
    autosave.discard();
    vi.advanceTimersByTime(1000);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([[snap("a"), "w"]]);
    expect(await recoverWorkspace("w")).toBe(null);

    autosave.schedule(snap("c"));
    void autosave.flush();
    autosave.discard();
    await autosave.flush();
    expect(await recoverWorkspace("w")).toBe(null);
  });

  it("recovers null from a slot that holds no snapshot", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("tilie-autosave", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
      request.onsuccess = () => {
        const transaction = request.result.transaction("workspaces", "readwrite");
        transaction.objectStore("workspaces").put("bare text", "w");
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
      request.onerror = () => reject(request.error);
    });
    expect(await recoverWorkspace("w")).toBe(null);
  });
});

describe("recoverWorkspace and clear", () => {
  it("recovers the last written text byte for byte", async () => {
    const text = 'C♯ 𝄞\r\n{"lone": "\uD800"}   ';
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule(snap("earlier"));
    await autosave.flush();
    autosave.schedule(snap(text));
    await autosave.flush();

    expect(await recoverWorkspace("w")).toEqual(snap(text));
    expect(await recoverWorkspace("never")).toBe(null);
  });

  it("keeps one slot per key", async () => {
    const first = createAutosave({ key: "w1", delayMs: 100 });
    const second = createAutosave({ key: "w2", delayMs: 100 });
    first.schedule(snap("one"));
    second.schedule(snap("two"));
    await first.flush();
    await second.flush();

    expect(await recoverWorkspace("w1")).toEqual(snap("one"));
    expect(await recoverWorkspace("w2")).toEqual(snap("two"));

    await clear("w1");
    expect(await recoverWorkspace("w1")).toBe(null);
    expect(await recoverWorkspace("w2")).toEqual(snap("two"));
  });
});

describe("failures", () => {
  const failed = { code: "indexeddb_failed", key: "w", cause: "VersionError" };

  it("rejects flush, recovery and clear when IndexedDB fails", async () => {
    await occupyDatabase();
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule(snap("x"));

    expect(shape(await rejection(autosave.flush()))).toEqual(failed);
    expect(shape(await rejection(recoverWorkspace("w")))).toEqual(failed);
    expect(shape(await rejection(clear("w")))).toEqual(failed);
  });

  it("reports a failed timer write once, at the next flush", async () => {
    await occupyDatabase();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule(snap("x"));
    vi.advanceTimersByTime(100);

    expect(shape(await rejection(autosave.flush()))).toEqual(failed);
    await expect(autosave.flush()).resolves.toBeUndefined();
  });

  it("tells onError of a failed timer write instead of holding it", async () => {
    await occupyDatabase();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const told: unknown[] = [];
    const autosave = createAutosave({
      key: "w",
      delayMs: 100,
      onError: (error) => told.push(error),
    });
    autosave.schedule(snap("x"));
    vi.advanceTimersByTime(100);

    await expect(autosave.flush()).resolves.toBeUndefined();
    expect(told.map((error) => shape(error as AutosaveError))).toEqual([failed]);

    autosave.schedule(snap("y"));
    expect(shape(await rejection(autosave.flush()))).toEqual(failed);
    expect(told.length).toBe(1);
  });

  it("rejects when IndexedDB is not available", async () => {
    vi.stubGlobal("indexedDB", undefined);

    expect(shape(await rejection(recoverWorkspace("w")))).toEqual({
      code: "indexeddb_unavailable",
      key: "w",
      cause: undefined,
    });
  });
});
