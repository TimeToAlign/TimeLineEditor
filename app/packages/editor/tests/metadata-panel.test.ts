/** The Metadata tab mounted; the expected values are derived in `README.md` ("The Metadata tab"). */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, CommandEntry, Manifest, Store } from "@timetoalign/tilie-core";
import { isLoadError, loadManifest, writeWorkspace } from "@timetoalign/tilie-core";
import type { CompleteLink } from "@timetoalign/timetoshare";
import {
  ABSENCE_REASONS,
  dumps,
  LEVELS,
  linkFromUrls,
  withAssertion,
  withLabel,
  withParts,
  withUri,
} from "@timetoalign/timetoshare";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import Inspector from "../src/inspector/Inspector.svelte";
import { Identity } from "../src/inspector/identity.svelte.ts";
import { describedOf } from "../src/inspector/metadata.ts";
import { stubEditor } from "./dom.ts";
import { holder } from "./holder.svelte.ts";
import { LABEL, NAME, OP106, URIS, WORK, WORK_PAGE } from "./op106.ts";
import { flushAutosaves, hook, informing, pickFile, storeOf } from "./support.ts";

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

const A = "0000000000";
const I = "https://orcid.org/0000-0002-1825-0097";
const KEY = "test.identity";
const WIKIDATA = "https://www.wikidata.org/wiki/Q146730";
/** The assertion of a link the viewer `I` creates under the fixed clock. */
const ASSERTED = { asserted_by: [I], asserted_on: "2026-11-17", method: "manual" };

let app: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  stubEditor();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 17, 12, 0));
});

afterEach(async () => {
  if (app !== undefined) unmount(app);
  app = undefined;
  await flushAutosaves();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** The Op. 106 bundle as core reads it. */
function op106(): Manifest {
  const read = loadManifest(dumps(OP106));
  if (isLoadError(read)) throw new Error(read.problems[0]?.message);
  return read;
}

/** Mount the inspector over `store` with `addresses` selected and the Metadata tab chosen. */
function show(
  store: Store,
  addresses: Address[],
  identity = new Identity(KEY),
  informed: string[] = [],
): { selection: { value: Selection }; informed: string[]; identity: Identity } {
  const selection = holder<Selection>(selectionOf(addresses));
  app = mount(Inspector, {
    target: document.body,
    context: informing(informed),
    props: {
      live: liveStore(store),
      get selection() {
        return selection.value;
      },
      identity,
    },
  });
  flushSync();
  tab("Metadata").click();
  flushSync();
  return { selection, informed, identity };
}

function tab(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
}

/** The shown panel. */
function panel(): HTMLElement {
  const shown = document.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');
  if (shown === null) throw new Error("no panel shown");
  return shown;
}

/** The own text of a label: its text without that of the control it wraps. */
function ownText(label: HTMLLabelElement): string {
  return [...label.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
}

/** The control labelled `label` in the shown panel, or in the card `card` (from 0). */
function labelled<E extends HTMLInputElement | HTMLSelectElement>(label: string, card?: number): E {
  const scope = card === undefined ? panel() : cards()[card];
  const found = [...(scope?.querySelectorAll<E>("input, select") ?? [])].find((item) =>
    [...(item.labels ?? [])].some((text) => ownText(text) === label),
  );
  if (found === undefined) throw new Error(`no control ${label}`);
  return found;
}

function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

const cards = () => [...panel().querySelectorAll<HTMLElement>('ol[aria-label="Links"] > li')];
const owner = () => panel().querySelector('[data-testid="metadata-owner"]')?.textContent?.trim();
const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");

/** Paste `text` into the paste field. */
function paste(text: string): void {
  const field = labelled<HTMLInputElement>("Paste a URL");
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  field.dispatchEvent(event);
  flushSync();
}

/** Type `text` into `field` and press `key` there. */
function typeAndPress(field: HTMLInputElement, text: string, key = "Enter"): void {
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  flushSync();
}

/** Answer the identity dialog with `text` and `label` (Save, No identity, Cancel). */
async function answerIdentity(text: string, label: string): Promise<void> {
  const open = dialog();
  if (open === null) throw new Error("no dialog");
  const field = open.querySelector<HTMLInputElement>("input");
  if (field !== null) {
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (label === "Save") {
    open
      .querySelector("form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  } else {
    button(label, open).click();
  }
  flushSync();
  await settle();
}

/** Let a pending answer reach the panel. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) await tick();
  flushSync();
}

/** The links of block A's manifest, or of its element `id`. */
function linksOf(store: Store, id: string | null = null): readonly CompleteLink[] {
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  const described = describedOf(block.manifest).complete;
  if (id === null) return described.links;
  const visit = (timelines: typeof described.timelines): readonly CompleteLink[] | undefined => {
    for (const timeline of timelines) {
      if (timeline.id === id) return timeline.links;
      const region = timeline.regions.find((item) => item.id === id);
      if (region !== undefined) return region.links;
      const found = visit(timeline.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(described.timelines) ?? [];
}

/** The last journalled command. */
function lastCommand(store: Store): unknown {
  return (store.journal.at(-1) as CommandEntry | undefined)?.command;
}

describe("the Op. 106 bundle imported (item 1)", () => {
  it("shows its one link through the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ name: "tilie-server", version: "0.1.0", timetoalign: "1.2.0" }),
      ),
    );
    app = mount(App, { target: document.body });
    flushSync();
    document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click();
    flushSync();
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((item) => item.querySelector("span")?.textContent === "Import manifest…")
      ?.click();
    flushSync();
    await vi.waitFor(() => pickFile("manifest.json", dumps(OP106)));
    await vi.waitFor(() => expect(hook().store().journal.length).toBe(1));
    const [id] = Object.keys(hook().store().view.blocks);
    expect([hook().store().view.blocks[id ?? ""]?.manifest.timelines, hook().selection()]).toEqual([
      [],
      [{ block: id }],
    ]);
    document.querySelector<HTMLButtonElement>('button[aria-label="Open inspector"]')?.click();
    flushSync();
    tab("Metadata").click();
    flushSync();
    expect(owner()).toBe(`Links of bundle '${NAME}'`);
    const [card, ...others] = cards();
    expect(others).toHaveLength(0);
    if (card === undefined) throw new Error("no card");
    expect(card.querySelector(".heading")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      `work pertains_to ${LABEL}`,
    );
    expect(
      [...card.querySelectorAll('ul[aria-label="URIs"] li')].map((item) => {
        const link = item.querySelector("a");
        return [
          link?.getAttribute("href"),
          link?.getAttribute("target"),
          link?.getAttribute("rel"),
          item.querySelector(".preferred")?.textContent ?? null,
        ];
      }),
    ).toEqual(
      URIS.map((uri, index) => [
        uri,
        "_blank",
        "noopener noreferrer",
        index === 0 ? "preferred" : null,
      ]),
    );
    expect(
      [...card.querySelectorAll('ul[aria-label="Identifiers"] li')].map((item) =>
        item.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual([
      "IMSLP ID Piano_Sonata_No.29,_Op.106_(Beethoven,_Ludwig_van)",
      "Works of Ludwig van Beethoven by opus number op. 106",
    ]);
    const slots = [...card.querySelectorAll('ol[aria-label="Part slots"] > li')];
    expect(
      slots.map((slot) => {
        const select = slot.querySelector("select");
        return [
          slot.querySelector(".slot-label")?.textContent,
          select?.value,
          [...(select?.options ?? [])].map((option) => option.value),
        ];
      }),
    ).toEqual(
      [
        "I. Allegro",
        "II. Scherzo. Assai vivace",
        "III. Adagio sostenuto",
        "IV. Introduzione. Largo – Allegro risoluto",
      ].map((label) => [label, "not_represented", [...ABSENCE_REASONS]]),
    );
    expect(card.querySelector(".assertion span")?.textContent).toBe(
      "asserted by https://example.org/people/editor · on 2026-11-17 · method manual · status confirmed",
    );
    expect(card.querySelector('ul[aria-label="Warnings"]')).toBe(null);
  });
});

describe("pasting", () => {
  it("asks for the identity once, then adds a recognised URL's link (item 2)", async () => {
    const store = storeOf("bare");
    show(store, [{ block: A }]);
    expect(owner()).toBe("Links of the anonymous bundle");
    paste(WORK_PAGE);
    expect(dialog()?.querySelector("h2")?.textContent).toBe("Who asserts your links?");
    await answerIdentity("orcid 0000", "Save");
    expect([
      dialog() !== null,
      dialog()?.querySelector('[role="alert"]')?.textContent?.trim(),
    ]).toEqual([
      true,
      "An identity is an absolute URI, such as https://orcid.org/0000-0002-1825-0097.",
    ]);
    await answerIdentity(I, "Save");
    expect([dialog(), localStorage.getItem(KEY), store.journal.length]).toEqual([null, I, 2]);
    const link = linkFromUrls([WORK_PAGE], { assertion: ASSERTED });
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { links: [link] } }],
    });
    expect([labelled<HTMLInputElement>("Paste a URL").value, cards().length]).toEqual(["", 1]);
    // The workspace file holds the identity in the link's assertion only: in the block's manifest
    // and in the journalled command that set it.
    const file = writeWorkspace(store.snapshot());
    expect(file.split(I).length - 1).toBe(2);
    expect(file.split(`"asserted_by": [`).length - 1).toBe(2);
    paste("https://musicbrainz.org/release/814c53fd-0732-4819-9753-4578f5ab992c");
    await settle();
    expect([dialog(), store.journal.length, cards().length]).toEqual([null, 3, 2]);
    store.undo();
    store.undo();
    flushSync();
    expect(cards()).toHaveLength(0);
  });

  it("asks for a level where the registry tells none (item 3)", async () => {
    const store = storeOf("bare");
    const identity = new Identity(null);
    identity.give(I);
    show(store, [{ block: A }], identity);
    paste(WIKIDATA);
    await settle();
    const question = panel().querySelector('[role="group"]');
    expect(question?.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      `The registry tells no level for ${WIKIDATA}. What does it name?`,
    );
    const level = labelled<HTMLSelectElement>("Level");
    expect([...level.options].map((option) => option.value)).toEqual([...LEVELS]);
    button("Cancel", panel()).click();
    flushSync();
    expect([panel().querySelector('[role="group"]'), store.journal.length]).toEqual([null, 1]);
    paste(WIKIDATA);
    await settle();
    labelled<HTMLSelectElement>("Level").value = "work";
    labelled<HTMLSelectElement>("Level").dispatchEvent(new Event("change", { bubbles: true }));
    button("Add link", panel()).click();
    flushSync();
    expect([store.journal.length, linksOf(store)]).toEqual([
      2,
      [linkFromUrls([WIKIDATA], { level: "work", assertion: ASSERTED })],
    ]);
    expect(panel().querySelector('[role="group"]')).toBe(null);
  });

  it("posts why a text gives no link (item 4)", async () => {
    const store = storeOf("bare");
    const identity = new Identity(null);
    identity.give(I);
    const { informed } = show(store, [{ block: A }], identity);
    typeAndPress(labelled<HTMLInputElement>("Paste a URL"), "Hammerklavier");
    await settle();
    expect([informed, store.journal.length]).toEqual([
      ["The pasted text gives no link: 'Hammerklavier' is no absolute URI."],
      1,
    ]);
  });

  it("works without storage, and Cancel or No identity decide the paste (item 5)", async () => {
    const throwing = () => {
      throw new Error("no storage");
    };
    vi.stubGlobal("localStorage", { getItem: throwing, setItem: throwing, removeItem: throwing });
    const store = storeOf("bare");
    show(store, [{ block: A }]);
    paste(WORK_PAGE);
    await answerIdentity("", "Cancel");
    expect([dialog(), store.journal.length]).toEqual([null, 1]);
    paste(WORK_PAGE);
    await answerIdentity("", "No identity");
    expect(linksOf(store)).toEqual([
      linkFromUrls([WORK_PAGE], { assertion: { asserted_on: "2026-11-17", method: "manual" } }),
    ]);
    expect(linksOf(store)[0]?.assertion?.asserted_by).toEqual([]);
    paste(WIKIDATA);
    await settle();
    expect(dialog()).toBe(null);
    button("Change identity").click();
    flushSync();
    await answerIdentity(I, "Save");
    expect(panel().querySelector('[data-testid="metadata-identity"] a')?.textContent).toBe(I);
  });
});

describe("the card's edits (item 6)", () => {
  it("are each one set of the bundle's links", async () => {
    const store = storeOf(op106());
    const identity = new Identity(null);
    show(store, [{ block: A }], identity);
    const [link] = linksOf(store);
    if (link === undefined) throw new Error("no link");
    const commands: unknown[] = [];
    const expected: CompleteLink[][] = [];

    const label = labelled<HTMLInputElement>("Label", 0);
    label.value = "Hammerklavier";
    label.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expected.push([withLabel(link, "Hammerklavier")]);
    commands.push(lastCommand(store));

    button("Add URL", cards()[0]).click();
    flushSync();
    typeAndPress(
      labelled<HTMLInputElement>("URL to add", 0),
      "https://www.wikidata.org/wiki/Q146731",
    );
    const relabelled = expected.at(-1)?.[0] as CompleteLink;
    expected.push([withUri(relabelled, ["https://www.wikidata.org/wiki/Q146731"])]);
    commands.push(lastCommand(store));

    const slots = [
      ...(cards()[0]?.querySelectorAll<HTMLSelectElement>('ol[aria-label="Part slots"] select') ??
        []),
    ];
    const third = slots[2];
    if (third === undefined) throw new Error("no third slot");
    third.value = "lost";
    third.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    const extended = expected.at(-1)?.[0] as CompleteLink;
    expected.push([
      withParts(
        extended,
        "has_part",
        extended.parts.map((slot, index) => (index === 2 ? { ...slot, absent: "lost" } : slot)),
      ),
    ]);
    commands.push(lastCommand(store));

    const status = labelled<HTMLSelectElement>("Status", 0);
    status.value = "unconfirmed";
    status.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    const lost = expected.at(-1)?.[0] as CompleteLink;
    expected.push([withAssertion(lost, { ...lost.assertion, status: "unconfirmed" })]);
    commands.push(lastCommand(store));

    button("Remove link", cards()[0]).click();
    flushSync();
    expected.push([]);
    commands.push(lastCommand(store));

    expect(store.journal).toHaveLength(6);
    expect(commands).toEqual(
      expected.map((links) => ({
        type: "set",
        changes: [{ target: { block: A }, values: { links } }],
      })),
    );
    expect(linksOf(store)).toEqual([]);
    expect([WORK, identity.uri]).toEqual([URIS[0], null]);
  });
});

describe("where the links are (item 7)", () => {
  it("adds to the selected timeline or region; a group shows its hint", async () => {
    const store = storeOf("bundles/bundle_mixed");
    const identity = new Identity(null);
    identity.give(I);
    const { selection } = show(store, [{ block: A, id: "score", part: ["card"] }], identity);
    expect(owner()).toBe("Links of timeline 'Score'");
    paste(WORK_PAGE);
    await settle();
    const link = linkFromUrls([WORK_PAGE], { assertion: ASSERTED });
    expect([linksOf(store, "score"), linksOf(store), linksOf(store, "region_1")]).toEqual([
      [link],
      [],
      [],
    ]);
    selection.value = selectionOf([{ block: A, id: "region_1" }]);
    flushSync();
    expect(owner()).toBe("Links of region 'Verse'");
    paste(WORK_PAGE);
    await settle();
    expect(linksOf(store, "region_1")).toEqual([link]);
    selection.value = selectionOf([{ block: A, id: "group_1" }]);
    flushSync();
    expect([panel().querySelector(".hint")?.textContent, owner()]).toEqual([
      "Group 'Performance' holds no links: a bundle, a timeline or a region does. Select its block, a timeline or a region.",
      undefined,
    ]);
    expect(() => labelled("Paste a URL")).toThrow("no control Paste a URL");
  });
});
