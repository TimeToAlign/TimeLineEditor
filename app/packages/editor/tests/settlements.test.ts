/** What the holder of the MatchClaims list's reads keeps; derived in `README.md` ("How a read settled"). */

import { describe, expect, it } from "vitest";
import { Settlements } from "../src/inspector/stamps/settlements.svelte.ts";

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (failure: unknown) => void = () => undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Lets every settled promise's callbacks run. */
const settled = () => new Promise<void>((done) => setTimeout(done, 0));

describe("Settlements", () => {
  it("reads a promise as pending, then as fulfilled or rejected, the same object after", async () => {
    const reads = new Settlements<string>();
    const read = deferred<string>();
    expect(reads.of(read.promise)).toBeUndefined();
    read.resolve("events");
    await settled();
    const fulfilled = reads.of(read.promise);
    expect(fulfilled).toEqual({ fulfilled: true, value: "events" });
    expect(reads.of(read.promise)).toBe(fulfilled);

    const failing = deferred<string>();
    const failure = new Error("unreachable");
    expect(reads.of(failing.promise)).toBeUndefined();
    failing.reject(failure);
    await settled();
    expect(reads.of(failing.promise)).toEqual({ fulfilled: false, failure });
  });

  it("holds the promise asked for last and lets every other go", async () => {
    const reads = new Settlements<string>();
    const first = deferred<string>();
    const second = deferred<string>();
    expect(reads.of(first.promise)).toBeUndefined();
    expect(reads.of(second.promise)).toBeUndefined();
    first.resolve("first");
    await settled();
    expect(reads.of(second.promise)).toBeUndefined();
    second.resolve("second");
    await settled();
    expect(reads.of(second.promise)).toEqual({ fulfilled: true, value: "second" });

    expect(reads.of(first.promise)).toBeUndefined();
    await settled();
    expect(reads.of(first.promise)).toEqual({ fulfilled: true, value: "first" });
    expect(reads.of(second.promise)).toBeUndefined();
    await settled();
    expect(reads.of(second.promise)).toEqual({ fulfilled: true, value: "second" });
  });
});
