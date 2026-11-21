/** The dialog asking for a manifest's tables; the cases are derived in `README.md`, item 9b. */

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableChoice, TableRequest } from "../src/matchClaims.svelte.ts";
import TablesDialog from "../src/TablesDialog.svelte";
import { stubEditor } from "./dom.ts";

const REQUEST: TableRequest = {
  manifest: "Tables",
  table: { url: "match_claims.parquet" },
  question: { kind: "file" },
};

let dialog: ReturnType<typeof TablesDialog> | undefined;

beforeEach(() => {
  stubEditor();
  const target = document.createElement("div");
  document.body.append(target);
  dialog = mount(TablesDialog, { target });
});

afterEach(() => {
  if (dialog !== undefined) unmount(dialog);
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function shown(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("no dialog");
  return found;
}

function button(name: string, within: ParentNode = shown()): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

function groups(): HTMLFieldSetElement[] {
  return [...shown().querySelectorAll("fieldset")];
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  flushSync();
}

function ask(): Promise<TableChoice | null> {
  if (dialog === undefined) throw new Error("not mounted");
  return dialog.ask(REQUEST);
}

/** Answer the pending fallback file input with `file`. */
function pick(file: File): void {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (input === null) throw new Error("no file input is waiting");
  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new Event("change"));
}

describe("the tables dialog", () => {
  it("shows one group, the MatchClaim table's, Load disabled until it has a file or a URL", () => {
    void ask();
    expect(shown().open).toBe(true);
    expect(shown().querySelector("h2")?.textContent).toBe("Load the MatchClaim table of Tables");
    expect(
      groups().map((group) =>
        group.querySelector("legend")?.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual(["MatchClaim table match_claims.parquet"]);
    expect(groups().map((group) => group.querySelector(".chosen")?.textContent)).toEqual([
      "No file chosen",
    ]);
    expect(
      [...shown().querySelectorAll("input")].map((input) => input.getAttribute("aria-label")),
    ).toEqual(["URL of the MatchClaim table"]);
    expect(button("Load").disabled).toBe(true);
  });

  it("resolves a chosen file", async () => {
    const answer = ask();
    const [claims] = groups();
    if (claims === undefined) throw new Error("no group");
    const file = new File(["PAR1"], "match_claims.parquet");
    button("Choose file…", claims).click();
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    pick(file);
    await vi.waitFor(() =>
      expect(claims.querySelector(".chosen")?.textContent).toBe("match_claims.parquet"),
    );
    expect(button("Load").disabled).toBe(false);
    shown().querySelector("form")?.requestSubmit();
    expect(await answer).toEqual({ file });
    expect(shown().open).toBe(false);
  });

  it("resolves a trimmed URL", async () => {
    const answer = ask();
    const url = groups()[0]?.querySelector("input");
    if (url === null || url === undefined) throw new Error("no URL field");
    type(url, " https://example.org/match_claims.parquet ");
    expect(button("Load").disabled).toBe(false);
    shown().querySelector("form")?.requestSubmit();
    expect(await answer).toEqual({ url: "https://example.org/match_claims.parquet" });
  });

  it("lets a URL entered after a file replace it", async () => {
    const answer = ask();
    const [claims] = groups();
    if (claims === undefined) throw new Error("no groups");
    button("Choose file…", claims).click();
    await vi.waitFor(() => expect(document.querySelector("input[type=file]")).not.toBe(null));
    pick(new File(["PAR1"], "a.parquet"));
    await vi.waitFor(() => expect(claims.querySelector(".chosen")?.textContent).toBe("a.parquet"));
    const url = claims.querySelector("input");
    if (url === null) throw new Error("no URL field");
    type(url, "https://example.org/m.parquet");
    expect(claims.querySelector(".chosen")?.textContent).toBe("No file chosen");
    shown().querySelector("form")?.requestSubmit();
    expect(await answer).toEqual({ url: "https://example.org/m.parquet" });
  });

  it("resolves null on Cancel and on Escape", async () => {
    const cancelled = ask();
    button("Cancel").click();
    expect(await cancelled).toBe(null);
    const escaped = ask();
    shown().close();
    expect(await escaped).toBe(null);
  });

  it("dismisses a question asked over it, and a late close event dismisses nothing", async () => {
    const first = ask();
    const second = ask();
    expect(await first).toBe(null);
    // The close event of the first question, which a browser fires a task later.
    shown().dispatchEvent(new Event("close"));
    expect(shown().open).toBe(true);
    const [claims] = groups();
    const url = claims?.querySelector("input");
    if (url === null || url === undefined) throw new Error("no URL field");
    type(url, "match_claims.parquet");
    button("Load").click();
    expect(await second).toEqual({ url: "match_claims.parquet" });
  });

  it("takes a relative URL as entered", async () => {
    const answer = ask();
    const [claims] = groups();
    const url = claims?.querySelector("input");
    if (url === null || url === undefined) throw new Error("no URL field");
    expect([url.type, url.getAttribute("inputmode")]).toEqual(["text", "url"]);
    type(url, "match_claims.parquet");
    expect(shown().querySelector("form")?.checkValidity()).toBe(true);
    shown().querySelector("form")?.requestSubmit();
    expect(await answer).toEqual({ url: "match_claims.parquet" });
  });

  it("locates the file asked for in the file dialog where the server's files are reached", async () => {
    if (dialog === undefined) throw new Error("not mounted");
    const answers: (string | null)[] = [null, "story/step1.yaml"];
    const locate = vi.fn(async () => answers.shift() ?? null);
    const titled = (question: TableRequest["question"]) => {
      void dialog?.ask({ ...REQUEST, question });
      flushSync();
      const title = shown().querySelector("h2")?.textContent;
      button("Cancel").click();
      return title;
    };
    expect(titled({ kind: "table", missing: "story/step1.yaml", locate })).toBe(
      "match_claims.parquet is not beside Tables, at story/step1.yaml",
    );
    expect(titled({ kind: "table", missing: null, locate })).toBe(
      "Load the MatchClaim table of Tables",
    );

    const answer = dialog.ask({ ...REQUEST, question: { kind: "manifest", locate } });
    flushSync();
    expect(shown().querySelector("h2")?.textContent).toBe("Where is Tables?");
    expect(() => button("Choose file…")).toThrow();
    expect(
      [...shown().querySelectorAll("input")].map((input) => input.getAttribute("aria-label")),
    ).toEqual(["URL of the MatchClaim table"]);
    button("Locate…").click();
    await vi.waitFor(() => expect(locate).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown().open).toBe(true);
    button("Locate…").click();
    expect(await answer).toEqual({ path: "story/step1.yaml" });
    expect(locate).toHaveBeenCalledTimes(2);
    expect(shown().open).toBe(false);

    const failing = dialog.ask({
      ...REQUEST,
      question: {
        kind: "table",
        missing: null,
        locate: async () => {
          throw new Error("no such folder");
        },
      },
    });
    flushSync();
    button("Locate…").click();
    await vi.waitFor(() =>
      expect(shown().querySelector(".problem")?.textContent).toBe(
        "The file could not be located: no such folder",
      ),
    );
    button("Cancel").click();
    expect(await failing).toBe(null);
  });
});
