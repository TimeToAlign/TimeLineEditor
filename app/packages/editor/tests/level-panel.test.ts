/** The level tab's settings; the expected values are derived in `README.md` ("The level tab's settings"). */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, NOTHING_SELECTED, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Store } from "@timetoalign/tilie-core";
import { findTimeline, manifestFileOf } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import LevelPanel from "../src/inspector/LevelPanel.svelte";
import { ManifestText } from "../src/inspector/manifestText.svelte.ts";
import { MIXED, mixedStore } from "./mixed.ts";
import { blockId, posting, storeMints, storeOf } from "./support.ts";

const A = blockId(0);

let app: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

function show(
  store: Store,
  manifest = new ManifestText(),
  context = posting(),
  locked = false,
  selection: Selection = NOTHING_SELECTED,
  onselect: (addresses: readonly Address[]) => void = () => {},
): void {
  app = mount(LevelPanel, {
    target: document.body,
    context,
    props: { live: liveStore(store), manifest, locked, selection, onselect },
  });
  flushSync();
}

/** Unmount the panel shown. */
function hide(): void {
  if (app !== undefined) unmount(app);
  app = undefined;
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

describe("the canvas lock", () => {
  /** The column buttons as [test ID, disabled]. */
  const columnButtons = () =>
    ["arrange-columns-fewer", "arrange-columns-more"].map((testid) => [
      testid,
      document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)?.disabled,
    ]);

  it("disables the arrangement while the canvas is locked, as on the canvas", () => {
    const store = storeOf("bare", "bundles/bundle_arranged_roots");
    expect(
      store.dispatch({
        type: "set",
        changes: [{ target: {}, values: { arrangement: { direction: "matrix" } } }],
      }),
    ).toBeNull();
    const journal = store.journal.length;
    show(store, new ManifestText(), posting(), true);
    expect(choices()).toEqual([
      ["Free", "false", true],
      ["Vertical", "false", true],
      ["Horizontal", "false", true],
      ["Matrix", "true", true],
    ]);
    expect(columnButtons()).toEqual([
      ["arrange-columns-fewer", true],
      ["arrange-columns-more", true],
    ]);
    press("arrange-vertical");
    expect([store.journal.length, store.view.arrangement]).toEqual([
      journal,
      { direction: "matrix" },
    ]);
    if (app !== undefined) unmount(app);
    document.body.innerHTML = "";
    show(store, new ManifestText(), posting(), false);
    expect(choices().map((choice) => (choice as unknown[])[2])).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(columnButtons()).toEqual([
      ["arrange-columns-fewer", false],
      ["arrange-columns-more", false],
    ]);
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
        props: {
          live: liveStore(storeOf("bare")),
          manifest: new ManifestText(),
          locked: false,
          selection: NOTHING_SELECTED,
        },
      }),
    ).toThrow("no component above this one provides post");
  });
});

describe("the Children tab", () => {
  it("lists the edited timeline's children, each row selecting its child", () => {
    const store = storeOf("nested");
    expect(store.open({ block: A, id: "clt_1" }, "children")).toBeNull();
    const pressed: (readonly Address[])[] = [];
    show(store, undefined, undefined, false, NOTHING_SELECTED, (next) => pressed.push(next));
    expect(contents()).toEqual(["level-title", "level-children"]);
    expect(text("level-title")).toBe("Children clt_1");
    const rows = [...document.querySelectorAll('[data-testid="child-row"]')];
    expect(rows.map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "clt_3 at 4 ♩, 8 ♩ long",
    ]);
    rows[0]?.querySelector("button")?.click();
    expect(pressed).toEqual([[{ block: A, id: "clt_3" }]]);
  });

  it("marks a selected child, and says when there is none", () => {
    const store = storeOf("nested");
    expect(store.open({ block: A, id: "clt_1" }, "children")).toBeNull();
    show(store, undefined, undefined, false, selectionOf([{ block: A, id: "clt_3" }]));
    expect(
      document.querySelector('[data-testid="child-row"] button')?.getAttribute("aria-pressed"),
    ).toBe("true");
    hide();
    store.done();
    expect(store.open({ block: A, id: "clt_2" }, "children")).toBeNull();
    show(store);
    expect(text("level-children")).toContain("No children.");
  });
});

describe("the Flow control tab", () => {
  /** The flow-control editor of `allegro`, `flow/virtual_cards` in block `A`. */
  function flowStore(): Store {
    const store = storeOf("flow/virtual_cards");
    expect(store.open({ block: A, id: "allegro" }, "flow")).toBeNull();
    return store;
  }

  function rows(): (string | undefined)[] {
    return [...document.querySelectorAll('[data-testid="flow-control-row"]')].map((row) =>
      row.textContent?.replace(/\s+/g, " ").trim(),
    );
  }

  function position(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="flow-control-add"] input',
    );
    if (input === null) throw new Error("no position");
    return input;
  }

  function addAs(kind: string, at: string): void {
    const select = document.querySelector<HTMLSelectElement>(
      '[data-testid="flow-control-add"] select',
    );
    if (select === null) throw new Error("no element select");
    select.value = kind;
    select.dispatchEvent(new Event("change"));
    const input = position();
    input.value = at;
    input.dispatchEvent(new Event("input"));
    flushSync();
    document
      .querySelector<HTMLButtonElement>('[data-testid="flow-control-add"] button[type="submit"]')
      ?.click();
    flushSync();
  }

  function status(): string | null | undefined {
    return document.querySelector('[data-testid="flow-control-add"] [role="status"]')?.textContent;
  }

  function allegroFlow(store: Store) {
    const manifest = store.view.blocks[A]?.manifest;
    if (manifest === undefined) throw new Error("no block");
    return findTimeline(manifest, "allegro")?.flow_control ?? [];
  }

  it("offers the kinds and lists the tree's flow control", () => {
    show(flowStore());
    expect(contents()).toEqual(["level-title", "flow-control-add", "flow-control-elements"]);
    const options = [...document.querySelectorAll('[data-testid="flow-control-add"] option')];
    expect(options.map((option) => option.textContent)).toEqual([
      "Repeat start",
      "Repeat end",
      "Volta bracket start",
      "Segno",
      "Coda",
      "Da capo",
      "Fine",
      "Section break",
      "Double barline",
      "Final barline",
      "Jump",
      "Jump target",
      "Break",
      "Barline",
    ]);
    expect(document.querySelectorAll('[data-testid="flow-control-add"] select').length).toBe(1);
    expect(position().value).toBe("");
    expect(rows()).toEqual([
      "Jump (volta, volta) volta_jump 953/2 ♩",
      "Jump (repeat end) repeat_end 500 ♩",
      "Jump target (volta) second_ending 500 ♩",
      "Break (volta) volta_break 500 ♩",
    ]);
  });

  it("proposes the selected element's position", () => {
    const store = flowStore();
    show(store, undefined, undefined, false, selectionOf([{ block: A, id: "repeat_end" }]));
    expect(position().value).toBe("500");
    hide();
    show(store, undefined, undefined, false, selectionOf([{ block: A, id: "section_a" }]));
    expect(position().value).toBe("0");
  });

  it("adds an element of the chosen kind and selects it", () => {
    const store = flowStore();
    const pressed: (readonly Address[])[] = [];
    show(store, undefined, undefined, false, NOTHING_SELECTED, (next) => pressed.push(next));
    const before = allegroFlow(store).map(({ id }) => id);
    addAs("repeat_start", "100");
    const added = allegroFlow(store).filter(({ id }) => !before.includes(id));
    expect(
      added.map(({ role, coordinate, manifestation }) => ({ role, coordinate, manifestation })),
    ).toEqual([{ role: "jump_target", coordinate: [100, 1], manifestation: "repeat_start" }]);
    expect(pressed).toEqual([[{ block: A, id: added[0]?.id }]]);
    expect(status()).toBe("");
    const known = allegroFlow(store).map(({ id }) => id);
    addAs("da_capo", "1000");
    const capo = allegroFlow(store).filter(({ id }) => !known.includes(id));
    expect(capo.map(({ role, coordinate, targets }) => ({ role, coordinate, targets }))).toEqual([
      {
        role: "jump",
        coordinate: [1000, 1],
        targets: [
          {
            to: "allegro",
            manifestation: "da_capo",
            repeat_count: 1,
            determined: true,
            reset: true,
            label: null,
          },
        ],
      },
    ]);
    expect(rows()).toHaveLength(6);
  });

  it("refuses a position that is no value, and what the store refuses, storing nothing", () => {
    const store = flowStore();
    show(store);
    const entries = store.editing.length;
    const journal = JSON.stringify(store.snapshot());
    addAs("repeat_start", "");
    expect(status()).toBe("type the position of the new element");
    addAs("repeat_start", "x");
    expect(status()).toBe('"x" is no fraction value; write an integer, n/d, a b/c or a decimal');
    addAs("repeat_end", "500");
    const [refused] = storeMints("jump");
    expect(status()).toBe(
      `'repeat_end' is a second jump at coordinate [500, 1] of 'allegro', after '${refused}': several signs at one place are destinations of one jump`,
    );
    expect(JSON.stringify(store.snapshot())).toBe(journal);
    expect(store.editing.length).toBe(entries);
  });
});
