/** The editor's one user, kept in the browser; the expected values are derived in `README.md` ("The Metadata tab"). */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserState } from "../src/user.svelte.ts";

const K = "test.user";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const ORCID = "0000-0002-1825-0097";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const read = (state: UserState) => [state.name, state.orcid, state.statedBy];

describe("the user kept under a key", () => {
  it("is Gerhardt without an iD when nothing is stored", () => {
    expect(read(new UserState(K))).toEqual(["Gerhardt", null, G]);
  });

  it("stores the user set and reads it back", () => {
    new UserState(K).set({ name: "Clara Wieck", orcid: ORCID });
    expect(localStorage.getItem(K)).toBe('{"name":"Clara Wieck","orcid":"0000-0002-1825-0097"}');
    expect(read(new UserState(K))).toEqual([
      "Clara Wieck",
      ORCID,
      "https://orcid.org/0000-0002-1825-0097",
    ]);
  });

  it("reads a stored text that is no user as the default", () => {
    for (const text of [
      "not json",
      "[]",
      '{"name": ""}',
      '{"name": "A", "orcid": "0000-0002-1825-0098"}',
      '{"name": "A", "orcid": 7}',
    ]) {
      localStorage.setItem(K, text);
      expect(read(new UserState(K))).toEqual(["Gerhardt", null, G]);
    }
  });
});

describe("without a key or storage", () => {
  it("holds the user in memory without a key", () => {
    const state = new UserState(null);
    state.set({ name: "Clara Wieck", orcid: null });
    expect(read(state)).toEqual([
      "Clara Wieck",
      null,
      "tag:timetoalign.github.io,2026:tilie:user:Clara%20Wieck",
    ]);
    expect(localStorage.length).toBe(0);
  });

  it("reads the default and holds the user when every access throws", () => {
    const refuse = () => {
      throw new DOMException("refused", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(refuse);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(refuse);
    const state = new UserState(K);
    expect(read(state)).toEqual(["Gerhardt", null, G]);
    expect(() => state.set({ name: "Clara Wieck", orcid: ORCID })).not.toThrow();
    expect(read(state)).toEqual(["Clara Wieck", ORCID, "https://orcid.org/0000-0002-1825-0097"]);
  });
});
