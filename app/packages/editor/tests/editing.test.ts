/** The shell while editing; the expected values are derived in `README.md` ("Editing"). */

import type { Address, Workspace } from "@timetoalign/tilie-core";
import { isLoadError, isSessionEntry, readWorkspace } from "@timetoalign/tilie-core";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { recoverWorkspace } from "../src/autosave.ts";
import { stubEditor } from "./dom.ts";
import { flushAutosaves, hook, interceptDownloads, workspaceOf } from "./support.ts";

const A = "0000000000";
const BLOCK: Address = { block: A };
const GROUP: Address = { block: A, id: "group_1" };
const SCORE: Address = { block: A, id: "score" };
const SCORE_CARD: Address = { block: A, id: "score", part: ["card"] };
const SCORE_START: Address = { block: A, id: "score", part: ["start"] };

let app: ReturnType<typeof mount> | undefined;

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  stubEditor();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ name: "tilie-server", version: "0", timetoalign: "0" })),
  );
  app = mount(App, { target: document.body });
  flushSync();
  hook().load(workspaceOf("bundles/bundle_mixed"));
  flushSync();
});

afterEach(async () => {
  if (app !== undefined) unmount(app);
  app = undefined;
  await flushAutosaves();
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function open(address: Address): void {
  const refusal = hook().open(address);
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

function rename(name: string): void {
  const refusal = hook()
    .store()
    .dispatch({ type: "set", changes: [{ target: SCORE, values: { name } }] });
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

function drawer(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-testid="inspector"]');
  if (element === null) throw new Error("the drawer is missing");
  return element;
}

function arranger(): Element | null {
  return document.querySelector('[role="application"][aria-label="Arranger"]');
}

function read(text: string): Workspace {
  const workspace = readWorkspace(text);
  if (isLoadError(workspace)) throw new Error("the written workspace is refused");
  return workspace;
}

/** The folded form of an open editor holding `count` entries, the last renaming the score to `name`. */
function expectFolded(workspace: Workspace, count: number, name: string): void {
  const [session] = hook()
    .editing()
    .map((editor) => editor.session);
  expect(workspace.journal.length).toBe(2);
  const [added, folded] = workspace.journal;
  expect(added !== undefined && !isSessionEntry(added) && added.command.type).toBe("add");
  expect(folded !== undefined && isSessionEntry(folded) && folded.session).toBe(session);
  expect(Object.keys(workspace.sessions)).toEqual([session]);
  const stored = workspace.sessions[session as string];
  expect(stored?.target).toEqual(SCORE);
  expect(stored?.entries.length).toBe(count);
  expect(stored?.entries.at(-1)).toMatchObject({
    command: { type: "set", changes: [{ target: SCORE, values: { name } }] },
  });
}

describe("the shell while editing", () => {
  it("opens the drawer when the first editor opens, and lets the viewer close it", async () => {
    expect(drawer().hidden).toBe(true);
    expect(document.activeElement).toBe(arranger());

    open(BLOCK);
    expect(drawer().hidden).toBe(false);
    expect(localStorage.getItem("tilie.inspector.open")).toBe("true");
    expect(document.activeElement).toBe(arranger());

    document.querySelector<HTMLButtonElement>('button[aria-label="Close inspector"]')?.click();
    flushSync();
    await tick();
    expect(drawer().hidden).toBe(true);
    expect(hook().editing().length).toBe(1);

    open(SCORE);
    expect(drawer().hidden).toBe(true);

    hook().done();
    hook().done();
    flushSync();
    open(BLOCK);
    expect(drawer().hidden).toBe(false);
  });

  it("saves and autosaves the open editor folded, leaving it open", async () => {
    const downloads = interceptDownloads();
    open(SCORE);
    rename("S");

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    flushSync();
    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(downloads.length).toBe(1));

    const [[name, text] = ["", ""]] = downloads;
    expect(name).toBe("untitled.tle.json");
    expectFolded(read(text), 1, "S");
    expect(hook().editing().length).toBe(1);
    expect(document.querySelector('[data-testid="file-name"]')?.textContent).toBe(
      "untitled.tle.json",
    );
    expectFolded(read(hook().text()), 1, "S");

    rename("T");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(async () => {
      const slot = await recoverWorkspace("current");
      expect(slot).not.toBeNull();
      expectFolded(read(slot?.text ?? ""), 2, "T");
    });
  });

  it("selects the edited element when an editor opens, and keeps the selection's rule when it closes", () => {
    hook().select([{ block: A, id: "page", part: ["card"] }]);
    open(BLOCK);
    expect(hook().selection()).toEqual([BLOCK]);
    open(GROUP);
    expect(hook().selection()).toEqual([GROUP]);
    open(SCORE);
    expect(hook().selection()).toEqual([SCORE_CARD]);
    hook().select([
      { block: A, id: "score", facet: "conversion_maps" },
      { block: A, id: "performance", facet: "conversion_maps" },
      SCORE_START,
    ]);
    flushSync();

    hook().done();
    flushSync();
    expect(hook().selection()).toEqual([SCORE_START]);
    open(SCORE);
    expect(hook().selection()).toEqual([SCORE_CARD]);
  });

  it("keeps after a change only what the innermost editor holds, by the same rule", () => {
    open(BLOCK);
    open(GROUP);
    open(SCORE);
    hook().select([SCORE_START, { block: A, id: "performance" }, SCORE]);
    flushSync();
    rename("S");
    expect(hook().selection()).toEqual([SCORE_START, SCORE]);
  });
});
