/** The Metadata tab mounted; the expected values are derived in `README.md` ("The Metadata tab"). */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, CommandEntry, Manifest, Store } from "@timetoalign/tilie-core";
import { isLoadError, linkHolder, loadManifest, writeWorkspace } from "@timetoalign/tilie-core";
import type { CompleteLink } from "@timetoalign/timetoshare";
import {
  ABSENCE_REASONS,
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
import { Identity, NO_IDENTITY } from "../src/inspector/identity.svelte.ts";
import { describedOf } from "../src/inspector/metadata.ts";
import { stubEditor } from "./dom.ts";
import { holder } from "./holder.svelte.ts";
import {
  EDITOR,
  LABEL,
  MB,
  MOVEMENTS,
  NAME,
  OP106,
  URIS,
  VIEWER,
  WHOLE,
  WORK,
  WORK_PAGE,
} from "./op106.ts";
import { fileText, flushAutosaves, hook, informing, pickFile, storeOf } from "./support.ts";

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

const A = "0000000000";
const I = VIEWER;
const E = EDITOR.asserted_by[0];
const KEY = "test.identity";
const WIKIDATA = "https://www.wikidata.org/wiki/Q146730";
const UNKNOWN = "https://example.org/works/op106";
const RELATOR = "http://id.loc.gov/vocabulary/relators/prf";
/** The assertion of what the viewer `I` states under the fixed clock. */
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

/** A manifest value as core reads it. */
function read(value: unknown): Manifest {
  const manifest = loadManifest(fileText(value));
  if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
  return manifest;
}

/** A bundle without timelines holding `links`. */
const holding = (...links: unknown[]): Manifest =>
  read({ timetoshare: "0.2.0", timelines: [], links });

/** The identity `I`, given. */
function given(uri: string = I): Identity {
  const identity = new Identity(null);
  identity.give(uri);
  return identity;
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
const group = (index: number) => cards()[index]?.querySelector<HTMLElement>('[role="group"]');
/** The level question: the group named by the question it asks; `null` while none is asked. */
const question = () =>
  [...panel().querySelectorAll('[role="group"]')].find((item) =>
    textOf(document.getElementById(item.getAttribute("aria-labelledby") ?? ""))?.startsWith(
      "The registry tells no level",
    ),
  ) ?? null;
const owner = () => panel().querySelector('[data-testid="metadata-owner"]')?.textContent?.trim();
const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
/** The text of an element, white space collapsed. */
const textOf = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim();

/** Paste `text` into the paste field. */
function paste(text: string): void {
  const field = labelled<HTMLInputElement>("Paste a URL");
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  field.dispatchEvent(event);
  flushSync();
}

/** Type `text` into `field`. */
function type(field: HTMLInputElement, text: string): void {
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

/** Type `text` into `field` and press `key` there. */
function typeAndPress(field: HTMLInputElement, text: string, key = "Enter"): void {
  type(field, text);
  field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  flushSync();
}

/** Choose `value` in `select`. */
function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
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

/** Let a pending answer, and a focus moved after it, reach the panel. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) await tick();
  flushSync();
}

/** The links of block A's manifest, or of its element `id`. */
function linksOf(store: Store, id: string | null = null): readonly CompleteLink[] {
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  return linkHolder(describedOf(block.manifest).complete, id)?.links ?? [];
}

/** The last journalled command. */
function lastCommand(store: Store): unknown {
  return (store.journal.at(-1) as CommandEntry | undefined)?.command;
}

/** The command setting the bundle's links to `links`. */
const bundleSet = (links: readonly CompleteLink[]) => ({
  type: "set",
  changes: [{ target: { block: A }, values: { links } }],
});

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
    await vi.waitFor(() => pickFile("manifest.json", fileText(OP106)));
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
    const heading = card.querySelector(".heading");
    expect([
      textOf(heading),
      card.querySelector('[role="group"]')?.getAttribute("aria-labelledby"),
    ]).toEqual([`work pertains_to ${LABEL}`, heading?.id]);
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
      [...card.querySelectorAll('ul[aria-label="Identifiers"] li')].map((item) => textOf(item)),
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
          [...slot.querySelectorAll("ul.slot-uris a")].map((link) => link.getAttribute("href")),
          select?.value,
          [...(select?.options ?? [])].map((option) => option.value),
        ];
      }),
    ).toEqual(
      MOVEMENTS.map(([mbid, label]) => [
        label,
        [`${MB}${mbid}`],
        "not_represented",
        [...ABSENCE_REASONS],
      ]),
    );
    expect(card.querySelector(".assertion span")?.textContent).toBe(
      `asserted by ${E} · on 2026-11-17 · method manual · status confirmed`,
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
    expect(lastCommand(store)).toEqual(bundleSet([link]));
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

  it("asks for a level where the registry tells none, an agent's with its role (item 3)", async () => {
    const store = storeOf("bare");
    const { informed } = show(store, [{ block: A }], given());
    paste(WIKIDATA);
    await settle();
    expect(textOf(question()?.querySelector("p"))).toBe(
      `The registry tells no level for ${WIKIDATA}. What does it name?`,
    );
    const level = labelled<HTMLSelectElement>("Level");
    expect([[...level.options].map((option) => option.value), document.activeElement]).toEqual([
      [...LEVELS],
      level,
    ]);
    button("Cancel", panel()).click();
    flushSync();
    expect([question(), store.journal.length]).toEqual([null, 1]);
    paste(WIKIDATA);
    await settle();
    choose(labelled<HTMLSelectElement>("Level"), "work");
    button("Add link", panel()).click();
    flushSync();
    expect([store.journal.length, linksOf(store)]).toEqual([
      2,
      [linkFromUrls([WIKIDATA], { level: "work", assertion: ASSERTED })],
    ]);
    expect(question()).toBe(null);
    paste(UNKNOWN);
    await settle();
    expect(() => labelled("Role")).toThrow("no control Role");
    choose(labelled<HTMLSelectElement>("Level"), "agent");
    const role = labelled<HTMLInputElement>("Role");
    expect(
      role
        .getAttribute("aria-describedby")
        ?.split(" ")
        .map((id) => textOf(document.getElementById(id))),
    ).toEqual([
      `The agent's role in what the element holds, usually a MARC relator URI such as ${RELATOR} (performer).`,
    ]);
    button("Add link", panel()).click();
    flushSync();
    expect([informed, store.journal.length]).toEqual([
      ["The pasted text gives no link: an agent link states its relation, the agent's role."],
      2,
    ]);
    type(role, RELATOR);
    button("Add link", panel()).click();
    flushSync();
    expect(linksOf(store).at(-1)).toEqual(
      linkFromUrls([UNKNOWN], { level: "agent", relation: RELATOR, assertion: ASSERTED }),
    );
  });

  it("posts why a text gives no link (item 4)", async () => {
    const store = storeOf("bare");
    const { informed } = show(store, [{ block: A }], given());
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

  it("remembers the answer No identity (item 5)", async () => {
    const store = storeOf("bare");
    show(store, [{ block: A }]);
    paste(WORK_PAGE);
    await answerIdentity("", "No identity");
    expect([localStorage.getItem(KEY), new Identity(KEY).asks, store.journal.length]).toEqual([
      NO_IDENTITY,
      false,
      2,
    ]);
  });
});

describe("the card's edits (item 6)", () => {
  it("are each one set of the bundle's links", async () => {
    const store = storeOf(read(OP106));
    show(store, [{ block: A }], given());
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
    await settle();
    expect(document.activeElement).toBe(button("Add URL", cards()[0]));
    const relabelled = expected.at(-1)?.[0] as CompleteLink;
    expected.push([withUri(relabelled, ["https://www.wikidata.org/wiki/Q146731"])]);
    commands.push(lastCommand(store));

    const third = cards()[0]?.querySelectorAll<HTMLSelectElement>(
      'ol[aria-label="Part slots"] select',
    )[2];
    if (third === undefined) throw new Error("no third slot");
    choose(third, "lost");
    const extended = expected.at(-1)?.[0] as CompleteLink;
    expected.push([
      withParts(
        extended,
        "has_part",
        extended.parts.map((slot, index) => (index === 2 ? { ...slot, absent: "lost" } : slot)),
      ),
    ]);
    commands.push(lastCommand(store));

    button("Add URL", cards()[0]).click();
    flushSync();
    typeAndPress(labelled<HTMLInputElement>("URL to add", 0), "https://example.org/x", "Escape");
    await settle();
    expect([
      document.activeElement,
      store.journal.length,
      cards()[0]?.querySelector('input[type="url"]'),
    ]).toEqual([button("Add URL", cards()[0]), 4, null]);

    button("Remove link", cards()[0]).click();
    flushSync();
    await settle();
    expected.push([]);
    commands.push(lastCommand(store));
    expect(document.activeElement).toBe(labelled("Paste a URL"));

    expect(store.journal).toHaveLength(5);
    expect(commands).toEqual(expected.map(bundleSet));
    expect(linksOf(store)).toEqual([]);
    button("Change identity").click();
    flushSync();
    await answerIdentity("urn:isbn:0451450523", "Save");
    expect([WORK, textOf(panel().querySelector('[data-testid="metadata-identity"]'))]).toEqual([
      URIS[0],
      "Your links are asserted by urn:isbn:0451450523. Change identity",
    ]);
  });
});

describe("a status chosen (item 7)", () => {
  it("is the viewer's statement, in place on their own link", async () => {
    const bare = linkFromUrls([WORK_PAGE]);
    const store = storeOf(holding(bare));
    show(store, [{ block: A }]);
    const status = () => labelled<HTMLSelectElement>("Status", 0);
    choose(status(), "confirmed");
    await answerIdentity("", "Cancel");
    expect([status().value, store.journal.length]).toEqual(["", 1]);
    choose(status(), "confirmed");
    await answerIdentity(I, "Save");
    const confirmed = withAssertion(bare, { ...ASSERTED, status: "confirmed" });
    expect([lastCommand(store), cards().length, status().value]).toEqual([
      bundleSet([confirmed]),
      1,
      "confirmed",
    ]);
    expect(cards()[0]?.querySelector(".assertion span")?.textContent).toBe(
      `asserted by ${I} · on 2026-11-17 · method manual · status confirmed`,
    );
    choose(status(), "rejected");
    await settle();
    expect([dialog(), lastCommand(store), store.journal.length]).toEqual([
      null,
      bundleSet([withAssertion(bare, { ...ASSERTED, status: "rejected" })]),
      3,
    ]);
  });

  it("appends a link of the viewer's own where another agent asserted it", async () => {
    const store = storeOf(read(OP106));
    show(store, [{ block: A }], given());
    const [link] = linksOf(store);
    if (link === undefined) throw new Error("no link");
    choose(labelled<HTMLSelectElement>("Status", 0), "unconfirmed");
    await settle();
    const appended = withAssertion(link, { ...ASSERTED, status: "unconfirmed" });
    expect([store.journal.length, lastCommand(store), cards().length]).toEqual([
      2,
      bundleSet([link, appended]),
      2,
    ]);
    expect([
      labelled<HTMLSelectElement>("Status", 0).value,
      cards()[0]?.querySelector(".assertion span")?.textContent,
      cards()[1]?.querySelector(".assertion span")?.textContent,
    ]).toEqual([
      "confirmed",
      `asserted by ${E} · on 2026-11-17 · method manual · status confirmed`,
      `asserted by ${I} · on 2026-11-17 · method manual · status unconfirmed`,
    ]);
  });
});

describe("the state of the tab (item 8)", () => {
  it("belongs to the element shown and to its list of links", async () => {
    const store = storeOf("bundles/bundle_mixed");
    const score = [linkFromUrls([WORK_PAGE]), linkFromUrls([WIKIDATA], { level: "work" })];
    const verse = linkFromUrls(["https://example.org/verse"], { level: "work" });
    expect(
      store.dispatch({
        type: "set",
        changes: [
          { target: { block: A, id: "score" }, values: { links: score } },
          { target: { block: A, id: "region_1" }, values: { links: [verse] } },
        ],
      }),
    ).toBe(null);
    const { selection } = show(store, [{ block: A, id: "score" }], given());
    type(labelled<HTMLInputElement>("Paste a URL"), "https://example.org/typed");
    button("Add URL", cards()[1]).click();
    flushSync();
    type(labelled<HTMLInputElement>("URL to add", 1), "https://example.org/added");
    selection.value = selectionOf([{ block: A, id: "region_1" }]);
    flushSync();
    expect([
      owner(),
      cards().length,
      cards()[0]?.querySelector('input[type="url"]') ?? null,
      textOf(button("Add URL", cards()[0])),
      labelled<HTMLInputElement>("Paste a URL").value,
    ]).toEqual(["Links of region 'Verse'", 1, null, "Add URL", ""]);
    selection.value = selectionOf([{ block: A, id: "score" }]);
    flushSync();
    button("Remove link", cards()[0]).click();
    flushSync();
    await settle();
    expect([cards().length, panel().querySelector('[id$="-add"]'), document.activeElement]).toEqual(
      [1, null, group(0)],
    );
    button("Remove link", cards()[0]).click();
    flushSync();
    await settle();
    expect([cards().length, document.activeElement]).toEqual([0, labelled("Paste a URL")]);
  });
});

describe("what is followed (item 9)", () => {
  it("is a web address only", () => {
    const uris = ["https://example.org/w", "javascript:alert(1)", "data:text/html,hi"];
    const store = storeOf(holding({ relation: "pertains_to", level: "work", uri: uris }));
    show(store, [{ block: A }], given("urn:isbn:0451450523"));
    const list = cards()[0]?.querySelector('ul[aria-label="URIs"]');
    const identity = panel().querySelector('[data-testid="metadata-identity"]');
    expect([
      [...(list?.querySelectorAll("a") ?? [])].map((link) => link.getAttribute("href")),
      [...(list?.querySelectorAll("code") ?? [])].map((code) => code.textContent),
      identity?.querySelector("a"),
      identity?.querySelector("code")?.textContent,
    ]).toEqual([
      ["https://example.org/w"],
      ["javascript:alert(1)", "data:text/html,hi"],
      null,
      "urn:isbn:0451450523",
    ]);
  });
});

describe("the whole description (item 10)", () => {
  it("is shown on the card", () => {
    const store = storeOf(read(WHOLE));
    show(store, [{ block: A }], given());
    const card = cards()[0];
    const [first, second] = [...(card?.querySelectorAll('ol[aria-label="Part slots"] > li') ?? [])];
    expect([
      [...(card?.querySelectorAll('ul[aria-label="Records"] li') ?? [])].map(textOf),
      card?.querySelector(".assertion span")?.textContent,
      [...(first?.querySelectorAll('ul[aria-label="URIs of part 1"] a') ?? [])].map((link) =>
        link.getAttribute("href"),
      ),
      [...(first?.querySelectorAll('ul[aria-label="Identifiers of part 1"] li') ?? [])].map(textOf),
      first?.querySelector(".entry-assertion")?.textContent,
      second?.querySelector(".entry-assertion") ?? null,
      [...(card?.querySelectorAll('ul[aria-label="Part of"] > li') ?? [])].map(textOf),
    ]).toEqual([
      [
        "https://example.org/records/op106.jsonld (application/ld+json, 2048 bytes, sha256-AAAA)",
        "https://example.org/records/plain",
      ],
      `asserted by ${E} · on 2026-11-17 · method manual · service https://example.org/reconcile · based on https://example.org/sources/a, https://example.org/sources/b · status confirmed`,
      [`${MB}${MOVEMENTS[0]?.[0]}`, "https://example.org/movements/1"],
      ["Works of Ludwig van Beethoven by opus number op. 106 no. 1"],
      `asserted by ${I} · on 2026-11-18 · method inferred`,
      null,
      [
        `part of Hammerklavier sonatas (has_part), position 1 asserted by ${I}`,
        "part of https://example.org/collections/late (aggregates)",
      ],
    ]);
  });
});

describe("a refusal of the schema package (item 11)", () => {
  it("is posted, and the select shows the stored value", () => {
    const store = storeOf(
      holding({
        relation: "pertains_to",
        level: "expression",
        uri: ["https://example.org/recordings/op106"],
        parts_relation: "has_part",
        parts: [{ uri: [`${MB}${MOVEMENTS[0]?.[0]}`], absent: "lost" }],
      }),
    );
    const { informed } = show(store, [{ block: A }], given());
    const absent = labelled<HTMLSelectElement>("Absent", 0);
    choose(absent, "unknown");
    expect([informed, store.journal.length, absent.value]).toEqual([
      [
        "The link could not be changed: part slot 1 is recognised at the level 'work', the link's level is 'expression'.",
      ],
      1,
      "lost",
    ]);
  });
});

describe("where the links are (item 12)", () => {
  it("adds to the selected timeline or region; a group shows its hint", async () => {
    const store = storeOf("bundles/bundle_mixed");
    const { selection } = show(store, [{ block: A, id: "score", part: ["card"] }], given());
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
