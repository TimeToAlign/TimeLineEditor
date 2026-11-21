/** The dialog asking for a manifest's tables; the cases are derived in `README.md`, item 9b. */

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TableChoice, TableRequest } from "../src/matchClaims.svelte.ts";
import TablesDialog from "../src/TablesDialog.svelte";
import { stubEditor } from "./dom.ts";

const REQUEST: TableRequest = { manifest: "Tables", table: { url: "match_claims.parquet" } };

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
    expect(shown().querySelector("h2")?.textContent).toBe("Load the tables of Tables");
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

  it("offers the manifest's folder only where folders are handed over and a place is named", async () => {
    void ask();
    expect(() => button("Choose the manifest's folder…")).toThrow();
    button("Cancel").click();

    const folder = { kind: "directory", name: "pkg" } as unknown as FileSystemDirectoryHandle;
    const picker = vi.fn(async (): Promise<FileSystemDirectoryHandle> => {
      throw new DOMException("cancelled", "AbortError");
    });
    vi.stubGlobal("showDirectoryPicker", picker);
    if (dialog === undefined) throw new Error("not mounted");
    const unnamed = dialog.ask({ manifest: "Bare", table: { url: null } });
    flushSync();
    expect(() => button("Choose the manifest's folder…")).toThrow();
    button("Cancel").click();
    expect(await unnamed).toBe(null);

    const answer = ask();
    flushSync();
    button("Choose the manifest's folder…").click();
    await vi.waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown().open).toBe(true);
    picker.mockImplementation(async () => folder);
    button("Choose the manifest's folder…").click();
    expect(await answer).toEqual({ folder });
    expect(shown().open).toBe(false);
  });
});
