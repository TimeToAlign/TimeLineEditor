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

function shape(error: AutosaveError) {
  return { code: error.code, key: error.key, cause: (error.cause as Error | undefined)?.name };
}

describe("createAutosave", () => {
  it("writes only the last text within the delay, and flush cancels the timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const autosave = createAutosave({ key: "w", delayMs: 100 });

    await autosave.flush();
    expect(puts.mock.calls).toEqual([]);

    autosave.schedule("a");
    vi.advanceTimersByTime(50);
    autosave.schedule("b");
    vi.advanceTimersByTime(70);
    autosave.schedule("c");
    vi.advanceTimersByTime(99);
    vi.advanceTimersByTime(1);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([["c", "w"]]);

    autosave.schedule("d");
    vi.advanceTimersByTime(99);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([
      ["c", "w"],
      ["d", "w"],
    ]);

    vi.advanceTimersByTime(1000);
    await autosave.flush();
    expect(puts.mock.calls).toEqual([
      ["c", "w"],
      ["d", "w"],
    ]);
  });
});

describe("recoverWorkspace and clear", () => {
  it("recovers the last written text byte for byte", async () => {
    const text = 'C♯ 𝄞\r\n{"lone": "\uD800"}   ';
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule("earlier");
    await autosave.flush();
    autosave.schedule(text);
    await autosave.flush();

    expect(await recoverWorkspace("w")).toBe(text);
    expect(await recoverWorkspace("never")).toBe(null);
  });

  it("keeps one slot per key", async () => {
    const first = createAutosave({ key: "w1", delayMs: 100 });
    const second = createAutosave({ key: "w2", delayMs: 100 });
    first.schedule("one");
    second.schedule("two");
    await first.flush();
    await second.flush();

    expect(await recoverWorkspace("w1")).toBe("one");
    expect(await recoverWorkspace("w2")).toBe("two");

    await clear("w1");
    expect(await recoverWorkspace("w1")).toBe(null);
    expect(await recoverWorkspace("w2")).toBe("two");
  });
});

describe("failures", () => {
  const failed = { code: "indexeddb_failed", key: "w", cause: "VersionError" };

  it("rejects flush, recovery and clear when IndexedDB fails", async () => {
    await occupyDatabase();
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule("x");

    expect(shape(await rejection(autosave.flush()))).toEqual(failed);
    expect(shape(await rejection(recoverWorkspace("w")))).toEqual(failed);
    expect(shape(await rejection(clear("w")))).toEqual(failed);
  });

  it("reports a failed timer write once, at the next flush", async () => {
    await occupyDatabase();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const autosave = createAutosave({ key: "w", delayMs: 100 });
    autosave.schedule("x");
    vi.advanceTimersByTime(100);

    expect(shape(await rejection(autosave.flush()))).toEqual(failed);
    await expect(autosave.flush()).resolves.toBeUndefined();
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
