/** The editor's own file dialog; the cases are derived in `README.md` ("The editor's file dialog"). */

import type { FolderListing } from "@timetoalign/tilie-client";
import { ServerError } from "@timetoalign/tilie-client";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import FileDialog from "../src/FileDialog.svelte";
import { MANIFEST_FILE, WORKSPACE_FILE } from "../src/files.ts";
import { stubEditor } from "./dom.ts";

const FOLDERS: { readonly [path: string]: FolderListing["entries"] } = {
  "": [
    { name: "archive.tle.json", kind: "folder" },
    { name: "story", kind: "folder" },
    { name: "work", kind: "folder" },
    { name: "a.tle.json", kind: "file" },
    { name: "b.yaml", kind: "file" },
    { name: "c.parquet", kind: "file" },
    { name: "d.json", kind: "file" },
  ],
  story: [{ name: "step1.yaml", kind: "file" }],
  work: [],
  "archive.tle.json": [],
};

let dialog: ReturnType<typeof FileDialog> | undefined;
let listed: string[] = [];

beforeEach(() => {
  stubEditor();
  // jsdom lays nothing out, so it has no scrolling into view.
  Element.prototype.scrollIntoView = () => undefined;
  listed = [];
  const target = document.createElement("div");
  document.body.append(target);
  dialog = mount(FileDialog, {
    target,
    props: {
      server: {
        async listFolder(path) {
          listed.push(path);
          const entries = FOLDERS[path];
          if (entries === undefined) throw new ServerError("status", 404, "no such folder");
          return { path, entries };
        },
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  if (dialog !== undefined) unmount(dialog);
  document.body.innerHTML = "";
});

function mounted(): ReturnType<typeof FileDialog> {
  if (dialog === undefined) throw new Error("not mounted");
  return dialog;
}

/** The file dialog: the first `<dialog>`, the replace question's coming after it. */
function shown(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("no dialog");
  return found;
}

function list(): HTMLElement {
  const found = shown().querySelector<HTMLElement>('[role="listbox"]');
  if (found === null) throw new Error("no list box");
  return found;
}

function options(): string[] {
  return [...list().querySelectorAll('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? "",
  );
}

function crumbs(): [string, string | null][] {
  return [...shown().querySelectorAll("nav button")].map((button) => [
    button.textContent ?? "",
    button.getAttribute("aria-current"),
  ]);
}

function button(name: string, within: ParentNode = shown()): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

function press(key: string): void {
  list().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  flushSync();
}

/** Wait until the list shows `names`. */
async function showing(names: readonly string[]): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
  expect(options()).toEqual(names);
}

function nameField(): HTMLInputElement {
  const found = shown().querySelector<HTMLInputElement>("input[type=text]");
  if (found === null) throw new Error("no name field");
  return found;
}

function type(text: string): void {
  nameField().value = text;
  nameField().dispatchEvent(new Event("input"));
  flushSync();
}

function submit(): void {
  shown().querySelector("form")?.requestSubmit();
  flushSync();
}

const MANIFESTS = ["archive.tle.json/", "story/", "work/", "b.yaml", "d.json"];

describe("opening", () => {
  it("lists folders and the files of the kinds asked for, and walks them by keys", async () => {
    const answer = mounted().open([MANIFEST_FILE], "");
    flushSync();
    expect(shown().querySelector("h2")?.textContent).toBe("Open");
    expect(list().getAttribute("aria-label")).toBe("Contents of the root folder");
    await showing(MANIFESTS);
    expect(listed).toEqual([""]);
    expect(crumbs()).toEqual([["Root", "location"]]);
    expect(document.activeElement).toBe(list());

    press("ArrowDown");
    press("ArrowDown");
    const chosen = list().querySelector('[aria-selected="true"]');
    expect(chosen?.textContent?.trim()).toBe("story/");
    expect(list().getAttribute("aria-activedescendant")).toBe(chosen?.id);
    press("Enter");
    await showing(["step1.yaml"]);
    expect(listed).toEqual(["", "story"]);
    expect(crumbs()).toEqual([
      ["Root", null],
      ["story", "location"],
    ]);
    press("Backspace");
    await showing(MANIFESTS);
    expect(crumbs()).toEqual([["Root", "location"]]);
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    await showing(["step1.yaml"]);
    button("Root").click();
    await showing(MANIFESTS);
    press("ArrowDown");
    press("ArrowDown");
    press("Enter");
    await showing(["step1.yaml"]);
    press("ArrowDown");
    press("Enter");
    expect(await answer).toBe("story/step1.yaml");
    expect(shown().open).toBe(false);
  });

  it("takes a double-clicked file, and nothing when cancelled", async () => {
    const answer = mounted().open([MANIFEST_FILE], "");
    flushSync();
    await showing(MANIFESTS);
    const option = [...list().querySelectorAll('[role="option"]')].find(
      (each) => each.textContent?.trim() === "b.yaml",
    );
    option?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(await answer).toBe("b.yaml");

    const cancelled = mounted().open([MANIFEST_FILE], "");
    flushSync();
    button("Cancel").click();
    expect(await cancelled).toBe(null);
  });

  it("shows the root where the folder it starts in is gone", async () => {
    void mounted().open([MANIFEST_FILE], "gone");
    flushSync();
    await showing(MANIFESTS);
    expect(listed).toEqual(["gone", ""]);
    expect(shown().querySelector(".problem")?.textContent).toBe(
      "The folder gone could not be shown: no such folder",
    );
  });
});

describe("saving", () => {
  const WORKSPACES = ["archive.tle.json/", "story/", "work/", "a.tle.json"];

  it("offers the suggested name and takes it", async () => {
    const answer = mounted().save(WORKSPACE_FILE, "", "untitled.tle.json");
    flushSync();
    expect(shown().querySelector("h2")?.textContent).toBe("Save as");
    await showing(WORKSPACES);
    const label = nameField().closest("label")?.querySelector("span")?.textContent;
    expect([label, nameField().value]).toEqual(["File name", "untitled.tle.json"]);
    submit();
    expect(await answer).toBe("untitled.tle.json");
  });

  it("adds the kind's extension to a name lacking it", async () => {
    const answer = mounted().save(WORKSPACE_FILE, "", "untitled.tle.json");
    flushSync();
    await showing(WORKSPACES);
    type("layerit");
    submit();
    expect(await answer).toBe("layerit.tle.json");
  });

  it("asks before it replaces a file, and fills the name from the list", async () => {
    const answer = mounted().save(WORKSPACE_FILE, "", "untitled.tle.json");
    flushSync();
    await showing(WORKSPACES);
    const file = [...list().querySelectorAll('[role="option"]')].find(
      (each) => each.textContent?.trim() === "a.tle.json",
    );
    file?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flushSync();
    expect(nameField().value).toBe("a.tle.json");
    submit();
    const question = () => document.querySelectorAll("dialog")[1];
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
    expect(question()?.querySelector("p")?.textContent).toBe("Replace a.tle.json?");
    expect(document.activeElement?.textContent).toBe("Cancel");
    const replier = question();
    if (replier === undefined) throw new Error("no question");
    button("Cancel", replier).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown().open).toBe(true);
    submit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
    button("Replace", replier).click();
    expect(await answer).toBe("a.tle.json");
  });

  it("refuses a folder's name and a name holding a slash", async () => {
    void mounted().save(WORKSPACE_FILE, "", "untitled.tle.json");
    flushSync();
    await showing(WORKSPACES);
    type("archive");
    submit();
    expect(shown().querySelector(".problem")?.textContent).toBe("archive.tle.json is a folder.");
    type("a/b");
    submit();
    expect(shown().querySelector(".problem")?.textContent).toBe("A file name holds no /.");
    expect(shown().open).toBe(true);
  });
});
