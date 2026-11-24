/** The level tab's settings; the expected values are derived in `README.md` ("The level tab's settings"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { Store } from "@timetoalign/tilie-core";
import { manifestFileOf } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import LevelPanel from "../src/inspector/LevelPanel.svelte";
import { ManifestText } from "../src/inspector/manifestText.svelte.ts";
import { MIXED, mixedStore } from "./mixed.ts";
import { blockId, posting, storeOf } from "./support.ts";

const A = blockId(0);

let app: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

function show(store: Store, manifest = new ManifestText(), context = posting()): void {
  app = mount(LevelPanel, {
    target: document.body,
    context,
    props: { live: liveStore(store), manifest },
  });
  flushSync();
}

/** The panel's elements, each as its test ID or its tag. */
function contents(): string[] {
  return [...document.body.children]
    .filter((child) => child.tagName !== "STYLE")
    .map((child) => child.getAttribute("data-testid") ?? child.tagName.toLowerCase());
}

/** The arrangement toolbar's buttons as [label, pressed, disabled]. */
function choices(): unknown[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')].map(
    (button) => [button.textContent, button.getAttribute("aria-pressed"), button.disabled],
  );
}

function press(testid: string): void {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
  if (button === null) throw new Error(`no ${testid}`);
  button.click();
  flushSync();
}

function text(testid: string): string | null | undefined {
  return document.querySelector(`[data-testid="${testid}"]`)?.textContent;
}

function checkbox(testid: string): HTMLInputElement {
  const box = document.querySelector<HTMLInputElement>(`[data-testid="${testid}"]`);
  if (box === null) throw new Error(`no ${testid}`);
  return box;
}

describe("the Arranger tab", () => {
  it("holds the canvas's arrangement and stores each choice", () => {
    const store = storeOf("bare", "bundles/bundle_arranged_roots");
    show(store);
    expect(contents()).toEqual(["level-title", "level-arrangement"]);
    expect(document.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "Arrange the blocks",
    );
    expect(choices()).toEqual([
      ["Free", "true", false],
      ["Vertical", "false", false],
      ["Horizontal", "false", false],
      ["Matrix", "false", false],
    ]);
    expect([text("arrange-columns"), text("arrange-refused")]).toEqual([undefined, undefined]);

    const journal = store.journal.length;
    press("arrange-vertical");
    expect([store.view.arrangement, store.journal.length]).toEqual([
      { direction: "vertical" },
      journal + 1,
    ]);
    expect(choices()[1]).toEqual(["Vertical", "true", false]);

    press("arrange-matrix");
    expect([store.view.arrangement, text("arrange-columns")]).toEqual([
      { direction: "matrix", columns: 2 },
      "Columns 2",
    ]);
    press("arrange-columns-more");
    expect([store.view.arrangement, text("arrange-columns")]).toEqual([
      { direction: "matrix", columns: 3 },
      "Columns 3",
    ]);
    store.undo();
    flushSync();
    expect([text("arrange-columns"), choices()[3]]).toEqual([
      "Columns 2",
      ["Matrix", "true", false],
    ]);
    const before = store.journal.length;
    press("arrange-matrix");
    expect(store.journal.length).toBe(before);
    press("arrange-free");
    expect(store.view.arrangement).toBeUndefined();
  });
});

describe("the Bundle tab", () => {
  it("holds the items' arrangement and the manifest file's switches", () => {
    const store = storeOf("bundles/bundle_arranged_conflict");
    expect(store.open({ block: A })).toBeNull();
    const manifest = new ManifestText();
    show(store, manifest);
    expect(contents()).toEqual(["level-title", "level-arrangement", "level-manifest-file"]);
    expect(document.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
      "Arrange the items",
    );
    expect(choices()).toEqual([
      ["Free", "true", false],
      ["Vertical", "false", false],
      ["Horizontal", "false", true],
    ]);
    expect(text("arrange-refused")).toBe(
      'Horizontal: "Theme A" and "Theme B" overlap on "Score" (8–16 ♩)',
    );
    expect([
      checkbox("manifest-file-styling").checked,
      checkbox("manifest-file-minimal").checked,
    ]).toEqual([true, true]);

    const entries = store.entries.length;
    const journal = store.journal.length;
    press("arrange-vertical");
    expect([store.view.blocks[A]?.arrangement, store.entries.length]).toEqual([
      { direction: "vertical", order: ["group_1", "group_2"] },
      entries + 1,
    ]);
    expect(choices()[1]).toEqual(["Vertical", "true", false]);

    checkbox("manifest-file-minimal").click();
    flushSync();
    expect([
      manifestFileOf(store.view.settings, A),
      store.entries.length,
      store.journal.length,
    ]).toEqual([{ minimal: false, styling: true, serialization: "yaml" }, entries + 1, journal]);
    expect(checkbox("manifest-file-minimal").checked).toBe(false);

    expect(
      store.configure({
        manifests: { [A]: { minimal: true, styling: true, serialization: "yaml" } },
      }),
    ).toBeNull();
    flushSync();
    expect(checkbox("manifest-file-minimal").checked).toBe(true);

    manifest.text = "typed";
    flushSync();
    const boxes = [checkbox("manifest-file-styling"), checkbox("manifest-file-minimal")];
    expect(boxes.map((box) => box.disabled)).toEqual([true, true]);
    const hints = boxes.map(
      (box) => document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent,
    );
    expect(hints).toEqual([
      "Apply or Revert the Manifest tab's text to switch",
      "Apply or Revert the Manifest tab's text to switch",
    ]);
  });
});

describe("the Group and Timeline tabs", () => {
  it("hold the title line alone", () => {
    const store = mixedStore();
    expect(store.open({ block: MIXED.A, id: "group_1" })).toBeNull();
    show(store);
    expect(contents()).toEqual(["level-title"]);
    expect(store.open({ block: MIXED.A, id: "score" })).toBeNull();
    flushSync();
    expect(contents()).toEqual(["level-title"]);
  });
});

describe("a refused choice", () => {
  it("is posted as information, and the panel shows none of its own", () => {
    const store = storeOf("bare", "bundles/bundle_arranged_roots");
    vi.spyOn(store, "dispatch").mockReturnValue({
      code: "invalid_value",
      message: "Refused here.",
      path: [],
    });
    const [info, warning, error]: string[][] = [[], [], []];
    show(store, new ManifestText(), posting(info, warning, error));
    press("arrange-vertical");
    expect([info, warning, error]).toEqual([["Refused here."], [], []]);
    expect(document.querySelectorAll("[role=status]").length).toBe(0);
    expect(document.body.textContent).not.toContain("Refused here.");
    press("arrange-matrix");
    expect(info).toEqual(["Refused here.", "Refused here."]);
  });

  it("needs the message context", () => {
    expect(() =>
      mount(LevelPanel, {
        target: document.body,
        props: { live: liveStore(storeOf("bare")), manifest: new ManifestText() },
      }),
    ).toThrow("no component above this one provides post");
  });
});
