/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Store } from "@timetoalign/tilie-core";
import {
  createStore,
  createView,
  isLoadError,
  readWorkspace,
  saveManifest,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { createAutosave, recoverWorkspace } from "../src/autosave.ts";
import { stubEditor } from "./dom.ts";
import { fixture, fixtureText, interceptDownloads, pickFile } from "./support.ts";

const A = "0000000000";
const B = "0000000001";
const health = { name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" };
const EMPTY_TEXT = writeWorkspace({ view: createView(), journal: [] });

let app: ReturnType<typeof mount> | undefined;

function start(response: () => Response = () => Response.json(health)): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  app = mount(App, { target: document.body });
  flushSync();
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  stubEditor();
});

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function hook() {
  const installed = window.__tilie;
  if (installed === undefined) throw new Error("window.__tilie is not installed");
  return installed;
}

/** Add the fixture `name` as block `id` through the open store. */
function addBlock(store: Store, id: string, name = "bare", x = 0): void {
  const refusal = store.dispatch({
    type: "add",
    into: "workspace",
    block: { id, manifest: fixture(name), x, y: 0 },
  });
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

function menuButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  if (button === null) throw new Error("no File menu");
  return button;
}

function item(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (entry) => entry.querySelector("span")?.textContent === label,
  );
  if (found === undefined) throw new Error(`no menu item ${label}`);
  return found;
}

function choose(label: string): void {
  menuButton().click();
  flushSync();
  item(label).click();
  flushSync();
}

function key(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  flushSync();
  return event;
}

function focusedLabel(): string | null | undefined {
  return document.activeElement?.querySelector("span")?.textContent;
}

function fileName(): string {
  return document.querySelector('[data-testid="file-name"]')?.textContent ?? "";
}

function messages(): string[] {
  return Array.from(
    document.querySelectorAll('[data-testid="message"]'),
    (message) => message.querySelector("p")?.textContent ?? "",
  );
}

/** The open modal dialog's question and answers. */
function openDialog(): { question: string; answers: string[] } | null {
  const dialog = [...document.querySelectorAll("dialog")].find((element) => element.open);
  if (dialog === undefined) return null;
  return {
    question: dialog.querySelector("p")?.textContent ?? "",
    answers: Array.from(dialog.querySelectorAll("button"), (button) => button.textContent ?? ""),
  };
}

function answer(label: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>("dialog[open] button")].find(
    (entry) => entry.textContent === label,
  );
  if (button === undefined) throw new Error(`no answer ${label}`);
  button.click();
  flushSync();
}

/** A written workspace holding `bare` as block A. */
function workspaceText(): string {
  const store = createStore({ view: createView(), journal: [] });
  addBlock(store, A);
  return writeWorkspace({ view: store.view, journal: store.journal });
}

describe("the File menu", () => {
  it("follows the menu button pattern", async () => {
    start();
    const button = menuButton();
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect([button.textContent, button.getAttribute("aria-expanded")]).toEqual(["File", "false"]);
    expect(menu?.hidden).toBe(true);
    expect(
      Array.from(document.querySelectorAll('[role="menuitem"]'), (entry) => [
        entry.querySelector("span")?.textContent,
        entry.querySelector("kbd")?.textContent ?? null,
      ]),
    ).toEqual([
      ["New workspace", null],
      ["Open…", "Ctrl+O"],
      ["Save", "Ctrl+S"],
      ["Save as…", "Ctrl+Shift+S"],
      ["Import manifest…", null],
      ["Export manifest…", null],
    ]);
    expect(item("Export manifest…").getAttribute("aria-disabled")).toBe("true");

    key(button, { key: "ArrowDown" });
    await vi.waitFor(() => expect(focusedLabel()).toBe("New workspace"));
    expect([button.getAttribute("aria-expanded"), menu?.hidden]).toEqual(["true", false]);
    key(document.activeElement as Element, { key: "ArrowUp" });
    expect(focusedLabel()).toBe("Export manifest…");
    key(document.activeElement as Element, { key: "ArrowDown" });
    expect(focusedLabel()).toBe("New workspace");
    key(document.activeElement as Element, { key: "End" });
    expect(focusedLabel()).toBe("Export manifest…");
    key(document.activeElement as Element, { key: "Home" });
    expect(focusedLabel()).toBe("New workspace");
    key(document.activeElement as Element, { key: "Escape" });
    expect([button.getAttribute("aria-expanded"), menu?.hidden]).toEqual(["false", true]);
    expect(document.activeElement).toBe(button);

    key(button, { key: "ArrowUp" });
    await vi.waitFor(() => expect(focusedLabel()).toBe("Export manifest…"));
  });
});

describe("opening and saving", () => {
  it("leaves the open workspace when a file is refused", async () => {
    start();
    hook().load(workspaceText());
    const open = hook().store();
    choose("Open…");
    await vi.waitFor(() => pickFile("bad.tle.json", "{"));
    await vi.waitFor(() => expect(messages().length).toBe(1));
    const [message] = messages();
    expect(message?.startsWith("bad.tle.json is not a workspace file")).toBe(true);
    const problem = document.querySelector('[data-testid="message"] li')?.textContent ?? "";
    expect(problem.startsWith("invalid_json at the top level: ")).toBe(true);
    expect(hook().store()).toBe(open);

    document.querySelector<HTMLButtonElement>('[data-testid="message"] button')?.click();
    flushSync();
    expect(messages()).toEqual([]);
  });

  it("marks unsaved changes and asks before discarding them", async () => {
    start();
    expect(fileName()).toBe("untitled.tle.json");
    expect(document.title).toBe("untitled.tle.json – TimeLineEditor");
    addBlock(hook().store(), A);
    expect(fileName()).toBe("• untitled.tle.json");
    expect(document.title).toBe("• untitled.tle.json – TimeLineEditor");
    key(document.body, { key: "z", ctrlKey: true });
    expect(fileName()).toBe("untitled.tle.json");
    key(document.body, { key: "y", ctrlKey: true });
    expect(fileName()).toBe("• untitled.tle.json");

    const store = hook().store();
    choose("New workspace");
    await vi.waitFor(() =>
      expect(openDialog()).toEqual({
        question: "untitled.tle.json has unsaved changes. Discard them?",
        answers: ["Discard", "Cancel"],
      }),
    );
    answer("Cancel");
    await vi.waitFor(() => expect(openDialog()).toBe(null));
    expect(hook().store()).toBe(store);

    choose("New workspace");
    await vi.waitFor(() => expect(openDialog()).not.toBe(null));
    answer("Discard");
    await vi.waitFor(() => expect(hook().store()).not.toBe(store));
    expect(hook().store().view).toEqual(createView());
    expect(fileName()).toBe("untitled.tle.json");
  });

  it("saves writeWorkspace of the store and clears the mark", async () => {
    start();
    const downloads = interceptDownloads();
    addBlock(hook().store(), A);
    const event = key(document.body, { key: "s", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    const store = hook().store();
    await vi.waitFor(() =>
      expect(downloads).toEqual([
        ["untitled.tle.json", writeWorkspace({ view: store.view, journal: store.journal })],
      ]),
    );
    expect(fileName()).toBe("untitled.tle.json");
  });
});

describe("saving twice at once", () => {
  it("ignores a save requested while one is under way", async () => {
    start();
    let finish: (() => void) | undefined;
    const written: string[] = [];
    const handle = {
      name: "w.tle.json",
      createWritable: async () => ({
        write: async (data: string) => {
          written.push(data);
        },
        close: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      }),
    };
    const showSaveFilePicker = vi.fn(async () => handle);
    vi.stubGlobal("showSaveFilePicker", showSaveFilePicker);
    addBlock(hook().store(), A);
    key(document.body, { key: "s", ctrlKey: true });
    await vi.waitFor(() => expect(finish).toBeDefined());
    key(document.body, { key: "s", ctrlKey: true });
    key(document.body, { key: "S", ctrlKey: true, shiftKey: true });
    finish?.();
    await vi.waitFor(() => expect(fileName()).toBe("w.tle.json"));
    expect([showSaveFilePicker.mock.calls.length, written.length]).toEqual([1, 1]);
  });
});

describe("undo and redo keys", () => {
  it("leave a text input to the browser and drop selected addresses that are gone", () => {
    start();
    addBlock(hook().store(), A);
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();
    const ignored = key(textarea, { key: "z", ctrlKey: true });
    expect([hook().store().journal.length, ignored.defaultPrevented]).toEqual([1, false]);

    hook().select([A]);
    key(document.body, { key: "z", ctrlKey: true });
    expect([hook().store().journal.length, hook().selection()]).toEqual([0, []]);
    key(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(hook().store().journal.length).toBe(1);
  });
});

describe("manifests", () => {
  it("imports a manifest as one block at the centre of the view, selected", async () => {
    start();
    choose("Import manifest…");
    await vi.waitFor(() => pickFile("nested.json", fixtureText("nested")));
    await vi.waitFor(() => expect(hook().store().journal.length).toBe(1));
    const command = hook().store().journal[0]?.command as {
      type: string;
      into: string;
      block: { id: string; x: number; y: number };
    };
    const { id } = command.block;
    expect(/^[0-9a-z]{10}$/.test(id)).toBe(true);
    expect([command.type, command.into, command.block.x, command.block.y]).toEqual([
      "add",
      "workspace",
      0,
      0,
    ]);
    expect(hook().store().view.blocks[id]?.manifest).toEqual(fixture("nested"));
    expect(hook().selection()).toEqual([id]);

    choose("Import manifest…");
    await vi.waitFor(() => pickFile("bad.json", '{"meta": {}}'));
    await vi.waitFor(() => expect(messages().length).toBe(1));
    expect(messages()[0]?.startsWith("bad.json is not a manifest")).toBe(true);
    expect(hook().store().journal.length).toBe(1);
  });

  it("exports the manifest of the block the selection lies in", async () => {
    start();
    const downloads = interceptDownloads();
    addBlock(hook().store(), A, "nested");
    addBlock(hook().store(), B, "bare", 800);
    hook().select([`${A}/clt_3`, B]);
    flushSync();
    expect(item("Export manifest…").getAttribute("aria-disabled")).toBe("true");

    hook().select([`${A}/clt_3`]);
    flushSync();
    expect(item("Export manifest…").getAttribute("aria-disabled")).toBe(null);
    choose("Export manifest…");
    const manifest = hook().store().view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("block A is missing");
    await vi.waitFor(() => expect(downloads).toEqual([["clt_1.json", saveManifest(manifest)]]));
  });
});

describe("autosave and recovery", () => {
  /** A written workspace whose one entry is at 2026-10-12T09:05:07Z. */
  function recoverable(): string {
    const store = createStore(
      { view: createView(), journal: [] },
      { clock: () => new Date("2026-10-12T09:05:07.000Z") },
    );
    addBlock(store, A);
    return writeWorkspace({ view: store.view, journal: store.journal });
  }

  async function keep(text: string, name = "untitled.tle.json"): Promise<void> {
    const autosave = createAutosave({ key: "current", delayMs: 0 });
    autosave.schedule({ text, name });
    await autosave.flush();
  }

  /** Mount the editor and let it claim the slot and look for a recoverable workspace. */
  async function startSettled(): Promise<void> {
    start();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /** Unmount the editor, which writes its pending snapshot, and wait for the write. */
  async function leave(): Promise<void> {
    if (app !== undefined) unmount(app);
    app = undefined;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  function hide(): void {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  }

  function written(): string {
    return writeWorkspace({ view: hook().store().view, journal: hook().store().journal });
  }

  const question = {
    question: "Restore the unsaved workspace from 2026-10-12 09:05?",
    answers: ["Restore", "Discard"],
  };

  it("restores the autosaved workspace as unsaved, under its file's name", async () => {
    vi.stubEnv("TZ", "UTC");
    const text = recoverable();
    await keep(text, "score.tle.json");
    start();
    await vi.waitFor(() => expect(openDialog()).toEqual(question));
    answer("Restore");
    const expected = readWorkspace(text);
    if (isLoadError(expected)) throw new Error("refused");
    await vi.waitFor(() => expect(hook().store().view).toEqual(expected.view));
    expect(hook().store().journal).toEqual(expected.journal);
    expect(fileName()).toBe("• score.tle.json");

    const downloads = interceptDownloads();
    key(document.body, { key: "s", ctrlKey: true });
    await vi.waitFor(() => expect(downloads).toEqual([["score.tle.json", text]]));
  });

  it("discards the autosaved workspace and clears the slot", async () => {
    vi.stubEnv("TZ", "UTC");
    await keep(recoverable());
    start();
    await vi.waitFor(() => expect(openDialog()).toEqual(question));
    answer("Discard");
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toBe(null));
    expect(hook().store().view).toEqual(createView());
  });

  it("offers nothing for an empty workspace, and autosaves after a change", async () => {
    await keep(EMPTY_TEXT);
    start();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(openDialog()).toBe(null);
    addBlock(hook().store(), A);
    const snapshot = { text: written(), name: "untitled.tle.json" };
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toEqual(snapshot), {
      timeout: 3000,
    });
  });

  it("offers nothing for a workspace saved, then reopened", async () => {
    await startSettled();
    const downloads = interceptDownloads();
    addBlock(hook().store(), A);
    hide();
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).not.toBe(null));
    key(document.body, { key: "s", ctrlKey: true });
    await vi.waitFor(() => expect(downloads.length).toBe(1));
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toBe(null));
    await leave();
    expect(await recoverWorkspace("current")).toBe(null);
    await startSettled();
    expect(openDialog()).toBe(null);
  });

  it("offers nothing for a workspace opened, untouched, then reopened", async () => {
    await startSettled();
    addBlock(hook().store(), A);
    hide();
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).not.toBe(null));
    hook().load(workspaceText());
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toBe(null));
    await leave();
    expect(await recoverWorkspace("current")).toBe(null);
    await startSettled();
    expect(openDialog()).toBe(null);
  });

  it("empties the slot when undo returns to the saved view", async () => {
    await startSettled();
    addBlock(hook().store(), A);
    hide();
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).not.toBe(null));
    key(document.body, { key: "z", ctrlKey: true });
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toBe(null));
  });

  it("leaves autosave to the tab holding the slot's lock", async () => {
    const requests: string[] = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: navigator.userAgent,
      locks: {
        request: async (
          name: string,
          _options: object,
          callback: (lock: { name: string } | null) => unknown,
        ) => {
          requests.push(name);
          return callback(null);
        },
      },
    });
    await startSettled();
    expect(requests).toEqual(["tilie-autosave/current"]);
    expect(messages()).toEqual([
      "Autosave is active in another TimeLineEditor tab, so changes in this tab are not autosaved.",
    ]);
    addBlock(hook().store(), A);
    hide();
    await leave();
    expect(await recoverWorkspace("current")).toBe(null);
  });

  it("autosaves in the tab that holds the slot's lock", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: navigator.userAgent,
      locks: {
        request: async (
          name: string,
          _options: object,
          callback: (lock: { name: string } | null) => unknown,
        ) => callback({ name }),
      },
    });
    await startSettled();
    addBlock(hook().store(), A);
    hide();
    await vi.waitFor(async () =>
      expect(await recoverWorkspace("current")).toEqual({
        text: written(),
        name: "untitled.tle.json",
      }),
    );
    expect(messages()).toEqual([]);
  });

  it("writes the pending snapshot at once when the page is hidden and when the editor goes", async () => {
    await startSettled();
    addBlock(hook().store(), A);
    const first = { text: written(), name: "untitled.tle.json" };
    hide();
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toEqual(first), {
      timeout: 500,
    });

    addBlock(hook().store(), B, "bare", 800);
    const second = { text: written(), name: "untitled.tle.json" };
    if (app !== undefined) unmount(app);
    app = undefined;
    await vi.waitFor(async () => expect(await recoverWorkspace("current")).toEqual(second), {
      timeout: 500,
    });
  });

  it("shows an autosave failure once and keeps editing", async () => {
    vi.stubGlobal("indexedDB", undefined);
    start();
    await vi.waitFor(() => expect(messages().length).toBe(1));
    addBlock(hook().store(), A);
    addBlock(hook().store(), B, "bare", 800);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(messages().length).toBe(1);
    expect(messages()[0]?.startsWith("Autosave is not working")).toBe(true);
    expect(hook().store().journal.length).toBe(2);
  });
});

describe("the About pane", () => {
  const appVersion = (
    JSON.parse(
      readFileSync(path.join(import.meta.dirname, "..", "..", "..", "package.json"), "utf8"),
    ) as { version: string }
  ).version;
  const timeskeletonVersion = (
    JSON.parse(
      readFileSync(
        path.join(
          import.meta.dirname,
          "..",
          "node_modules",
          "@timetoalign",
          "timeskeleton",
          "package.json",
        ),
        "utf8",
      ),
    ) as { version: string }
  ).version;

  function shown(id: string): string {
    return document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? "";
  }

  function openAbout(): HTMLDialogElement {
    const button = [...document.querySelectorAll<HTMLButtonElement>("header button")].find(
      (entry) => entry.textContent === "About",
    );
    button?.click();
    flushSync();
    const dialog = document.querySelector<HTMLDialogElement>("dialog.about");
    if (dialog === null) throw new Error("no About dialog");
    return dialog;
  }

  it("shows the versions, the server and the packages", async () => {
    start();
    await vi.waitFor(() => expect(hook().health()).toEqual(health));
    flushSync();
    const dialog = openAbout();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("About TimeLineEditor");
    expect(shown("about-editor")).toBe(`TimeLineEditor ${appVersion}`);
    expect(shown("about-server")).toBe("tilie-server 0.1.0 (timetoalign 1.2.0)");
    expect(shown("about-schema").replace(/\s+/g, " ")).toBe(
      `timeskeleton ${timeskeletonVersion}, schema version ${SCHEMA_VERSION}`,
    );
    expect(
      Array.from(
        document.querySelectorAll('[data-testid="about-packages"] li'),
        (entry) => entry.textContent,
      ),
    ).toEqual([
      "@timetoalign/tilie-core",
      "@timetoalign/tilie-layout",
      "@timetoalign/tilie-writers",
      "@timetoalign/tilie-arranger",
      "@timetoalign/tilie-client",
    ]);
    const notices = dialog.querySelector("a");
    expect([
      notices?.getAttribute("href"),
      notices?.getAttribute("target"),
      notices?.textContent,
    ]).toEqual(["THIRD_PARTY_NOTICES.txt", "_blank", "THIRD_PARTY_NOTICES.txt"]);
    [...dialog.querySelectorAll("button")].find((entry) => entry.textContent === "Close")?.click();
    flushSync();
    expect(dialog.open).toBe(false);
  });

  it("shows the server offline with the reason", async () => {
    start(() => new Response(null, { status: 502, statusText: "Bad Gateway" }));
    await vi.waitFor(() => expect(document.querySelectorAll("header .offline").length).toBe(1));
    openAbout();
    expect(shown("about-server")).toBe(
      "offline: The server did not answer the health check (502 Bad Gateway).",
    );
  });
});
