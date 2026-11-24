/** The Metadata tab mounted; the expected values are derived in `README.md` ("The Metadata tab"). */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Command, CommandEntry, Store } from "@timetoalign/tilie-core";
import { TILIE_AGENT } from "@timetoalign/tilie-core";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import { TIE_NOTE } from "../src/inspector/metadata/edits.ts";
import type { Candidate, Lookup } from "../src/lookup/index.ts";
import UserDialog from "../src/UserDialog.svelte";
import type { UserContext } from "../src/user.svelte.ts";
import { UserState } from "../src/user.svelte.ts";
import { stubEditor } from "./dom.ts";
import { holder } from "./holder.svelte.ts";
import { fixture, posting, providing, storeOf, userContext } from "./support.ts";

const A = "0000000000";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const PIRES_WD = "http://www.wikidata.org/entity/Q235650";
const PIRES_GND = "https://d-nb.info/gnd/124927521";
const PIRES_IMAGE = "https://example.org/pires.jpg";
const YOUTUBE = "https://www.youtube.com/watch?v=Ch2mrPm1JnM";
const MB_WORK = "http://musicbrainz.org/work/8d331505-4d88-39ae-81c7-bec5da77af96";
const MBID = "mbid:8d331505-4d88-39ae-81c7-bec5da77af96";
/** The "same as" "＋ Add vocabulary" ties a GND value to Wikidata's Pires with, by TiLiE. */
const TIE = {
  basis: [PIRES_WD],
  date: "2026-11-20",
  method: "inferred",
  note: TIE_NOTE,
  property: "schema:sameAs",
  stated_by: [TILIE_AGENT],
  value: { id: "wd:Q235650" },
};

/** The stub lookup's answers: Maria João Pires in Wikidata, with her GND record as a cross-reference. */
const WIKIDATA_PIRES: Candidate = {
  system: "wikidata",
  iri: PIRES_WD,
  label: "Maria João Pires",
  description: "Portuguese pianist",
  image: null,
  crossReferences: [
    { system: "viaf", iri: "http://viaf.org/viaf/113931950" },
    { system: "gnd", iri: PIRES_GND },
  ],
  service: WIKIDATA_API,
  match: false,
};
const GND_PIRES: Candidate = {
  system: "gnd",
  iri: PIRES_GND,
  label: "Pires, Maria João",
  description: null,
  image: null,
  crossReferences: [],
  service: "https://lobid.org/gnd/search",
  match: false,
};

/** Resolves the two answers, searches nothing. */
const LOOKUP: Lookup = {
  searchable: () => false,
  resolvable: (system) => system === "wikidata" || system === "gnd",
  search: async () => [],
  resolve: async (_system, iri) =>
    iri === PIRES_WD ? WIKIDATA_PIRES : iri === PIRES_GND ? GND_PIRES : null,
  reconcile: async (_system, _kind, texts) => texts.map(() => null),
};

let apps: ReturnType<typeof mount>[] = [];

beforeEach(() => {
  stubEditor();
  Element.prototype.scrollIntoView = () => undefined;
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
});

afterEach(() => {
  for (const app of apps) unmount(app);
  apps = [];
  document.body.innerHTML = "";
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The store of the LayerIt recording, block `A`. */
const layerit = (): Store => storeOf(fixture("statements/layerit_recording"));

/**
 * Mount the inspector over `store`, `addresses` selected, the Metadata tab
 * chosen; the information and the warnings it posts are kept apart.
 */
function show(
  store: Store,
  addresses: Address[],
  user: UserContext = userContext(),
  lookup: Lookup = LOOKUP,
) {
  const selection = holder<Selection>(selectionOf(addresses));
  const informed: string[] = [];
  const warned: string[] = [];
  const failed: string[] = [];
  const target = document.createElement("div");
  document.body.append(target);
  apps.push(
    mount(providing(Inspector, user, lookup), {
      target,
      context: posting(informed, warned, failed),
      props: {
        live: liveStore(store),
        get selection() {
          return selection.value;
        },
      },
    }),
  );
  flushSync();
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === "Metadata",
  );
  tab?.click();
  flushSync();
  return { selection, informed, warned, failed };
}

/** Let the lookup's promises and the focus moves after `tick` run, then the DOM follow. */
async function settle(): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await Promise.resolve();
    await tick();
  }
  flushSync();
}

const all = <E extends Element>(selector: string, within: ParentNode = document) => [
  ...within.querySelectorAll<E>(selector),
];

function one<E extends Element>(selector: string, within: ParentNode = document): E {
  const found = within.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

const CPT_1_SENTENCE =
  "C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical is a video.";
const P = "https://example.org/people/editor";

const words = (element: Element) => element.textContent?.replace(/\s+/gu, " ").trim() ?? "";
const rectangles = () => all<HTMLElement>('[data-testid="metadata-rectangle"]');
/** The tiles' headings: the first tile's sentence, every other one's verb and label. */
const headings = () =>
  rectangles().map((rectangle) => words(one('[data-testid="metadata-heading"]', rectangle)));
/** The tile whose heading is `heading`, or begins with it followed by a space. */
const rectangle = (heading: string) => {
  const found = rectangles().find((item) => {
    const text = words(one('[data-testid="metadata-heading"]', item));
    return text === heading || text.startsWith(`${heading} `);
  });
  if (found === undefined) throw new Error(`no rectangle ${heading}`);
  return found;
};

/** Expand the tile, once. */
function expand(tile: HTMLElement): void {
  const toggle = one<HTMLButtonElement>('[data-testid="metadata-expand"]', tile);
  if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
  flushSync();
}

/** Open the provenance of the pair or candidate whose Provenance button is named `name`. */
function provenance(name: string): HTMLElement {
  const found = all<HTMLButtonElement>("button").find(
    (item) => item.getAttribute("aria-label") === `Provenance of ${name}`,
  );
  if (found === undefined) throw new Error(`no provenance of ${name}`);
  if (found.getAttribute("aria-expanded") !== "true") found.click();
  flushSync();
  return one(`#${CSS.escape(found.getAttribute("aria-controls") ?? "")}`);
}

/** The pressed belief buttons of a details region. */
const pressed = (region: HTMLElement) =>
  all<HTMLButtonElement>('[aria-pressed="true"]', region).map(words);

function button(name: string, within: ParentNode = document): HTMLButtonElement {
  const found = all<HTMLButtonElement>("button", within).find(
    (item) => item.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

const summaries = () => all<HTMLElement>("details summary").map((item) => item.textContent?.trim());

/** A composer field (a combobox) by its label. */
function field(name: string): HTMLInputElement {
  const label = all<HTMLElement>('[data-testid="metadata-composer"] .field > span').find(
    (item) => item.textContent === name,
  );
  if (label === undefined) throw new Error(`no field ${name}`);
  return one<HTMLInputElement>(`input[aria-labelledby="${label.id}"]`);
}

/** The options a combobox's listbox lists. */
const options = (input: HTMLInputElement) =>
  all<HTMLElement>('[role="option"]', one(`#${input.getAttribute("aria-controls")}`)).map((item) =>
    item.textContent?.replace(/\s+/gu, " ").trim(),
  );

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function press(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  flushSync();
}

/** Type `text` and pick the first option that offers. */
function choose(input: HTMLInputElement, text: string): void {
  input.focus();
  type(input, text);
  press(input, "ArrowDown");
  press(input, "Enter");
}

function paste(input: HTMLInputElement, text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  input.dispatchEvent(event);
  flushSync();
}

/** The commands journalled after the first `from` entries. */
const commandsAfter = (store: Store, from: number): Command[] =>
  store.journal.slice(from).map((entry) => (entry as CommandEntry).command);

describe("tiles and candidates", () => {
  it("shows cpt_1's three tiles collapsed, the user line and the candidates", () => {
    show(layerit(), [{ block: A, id: "cpt_1" }]);
    expect(words(one('[data-testid="metadata-user"]'))).toBe("You state as Gerhardt. Change…");
    const list = one('ol[aria-label^="Statements of "]');
    expect(list.getAttribute("aria-label")).toBe(
      "Statements of timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical'",
    );
    expect(list.children).toHaveLength(3);
    expect(headings()).toEqual([CPT_1_SENTENCE, "performed by Maria João Pires", "same as"]);
    expect(
      rectangles().map((tile) => [
        one('[data-testid="metadata-expand"]', tile).getAttribute("aria-expanded"),
        one<HTMLElement>('[data-testid="metadata-vocabulary"]', tile).parentElement?.hidden,
      ]),
    ).toEqual([
      ["false", true],
      ["false", true],
      ["false", true],
    ]);
    expect(document.body.textContent).not.toContain("Status");
    expect(all<HTMLButtonElement>("button").filter((item) => words(item) === "Reject")).toEqual([]);
    expect(summaries()).toEqual(["Candidates (1)", "Believed false by you (0)"]);
    expect(all('[data-testid="metadata-candidate-row"] .what').map(words)).toEqual([
      "is a recording of Clair de lune",
    ]);
  });

  it("offers the bundle's empty is a in a sentence", () => {
    show(layerit(), [{ block: A }]);
    const empty = rectangles()[0];
    if (empty === undefined) throw new Error("no rectangle");
    expect(words(one('[data-testid="metadata-heading"]', empty))).toBe(
      "Nothing states yet what LayerIt, Clair de lune mm. 1–6 (Pires) is.",
    );
    expect(button("State what it is", empty)).toBeDefined();
  });

  it("shows a tile's pairs, each with its Provenance, on one click", () => {
    show(layerit(), [{ block: A, id: "cpt_1" }]);
    const performed = rectangle("performed by");
    expand(performed);
    expect(one('[data-testid="metadata-expand"]', performed).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(all('[data-testid="metadata-vocabulary"] > li > .pair', performed).map(words)).toEqual([
      "rel:prf viaf:113931950 ↗",
      "wdt:P175 wd:Q235650 ↗",
    ]);
    expect(
      all<HTMLAnchorElement>("a", performed).map((anchor) => [
        anchor.textContent,
        anchor.href,
        anchor.rel,
        anchor.target,
      ]),
    ).toEqual([
      ["viaf:113931950 ↗", "http://viaf.org/viaf/113931950", "noreferrer", "_blank"],
      ["wd:Q235650 ↗", PIRES_WD, "noreferrer", "_blank"],
    ]);
    expect(all<HTMLAnchorElement>("a", performed).map((anchor) => anchor.title)).toEqual([
      "http://viaf.org/viaf/113931950",
      PIRES_WD,
    ]);
    expect(
      all<HTMLButtonElement>("button", performed).map((item) => [
        item.getAttribute("aria-label"),
        item.getAttribute("aria-expanded"),
      ]),
    ).toEqual([
      [null, "true"],
      ["Provenance of rel:prf viaf:113931950", "false"],
      ["Provenance of wdt:P175 wd:Q235650", "false"],
      [null, null],
    ]);
    expect(all('[data-testid="metadata-vocabulary"] > li > button', performed).map(words)).toEqual([
      "Provenance",
      "Provenance",
    ]);
    expect(words(one('[data-testid="metadata-add-vocabulary"]', performed))).toBe(
      "＋ Add vocabulary",
    );
    const same = rectangle("same as");
    expand(same);
    expect(all('[data-testid="metadata-vocabulary"] > li > .pair', same).map(words)).toEqual([
      "schema:sameAs youtube:Ch2mrPm1JnM ↗",
    ]);
    expect(all<HTMLAnchorElement>("a", same).map((anchor) => [anchor.href, anchor.title])).toEqual([
      [YOUTUBE, YOUTUBE],
    ]);
  });

  it("shows the image of the first of a tile's things that has one", async () => {
    const resolved: [string, string][] = [];
    const lookupWith = (image: string | null): Lookup => ({
      ...LOOKUP,
      resolve: async (system, iri) => {
        resolved.push([system, iri]);
        return iri === PIRES_WD
          ? WIKIDATA_PIRES
          : iri === PIRES_GND
            ? { ...GND_PIRES, image }
            : null;
      },
    });
    show(layerit(), [{ block: A, id: "cpt_1" }], userContext(), lookupWith(PIRES_IMAGE));
    await settle();
    const thumbnail = one(".thumbnail", rectangle("performed by"));
    expect(
      all<HTMLImageElement>("img", thumbnail).map((image) => image.getAttribute("src")),
    ).toEqual([PIRES_IMAGE]);
    expect(resolved).toEqual([
      ["wikidata", "http://www.wikidata.org/entity/Q98069877"],
      ["wikidata", PIRES_WD],
      ["gnd", PIRES_GND],
    ]);
    for (const app of apps) unmount(app);
    apps = [];
    document.body.innerHTML = "";
    show(layerit(), [{ block: A, id: "cpt_1" }], userContext(), lookupWith(null));
    await settle();
    expect(all("img", one(".thumbnail", rectangle("performed by")))).toEqual([]);
  });

  it("shows a MusicBrainz work as an MBID, its IRI on hover", () => {
    show(layerit(), [{ block: A, id: "clt_6" }]);
    const version = rectangle("is a version or edition of");
    expand(version);
    expect(all('[data-testid="metadata-vocabulary"] > li > .pair', version).map(words)).toEqual([
      `schema:exampleOfWork ${MBID} ↗`,
      "wdt:P629 wd:Q29117946 ↗",
    ]);
    expect(all<HTMLAnchorElement>("a", version)[0]?.title).toBe(MB_WORK);
    const basis = all("dt", provenance(`wdt:P629 wd:Q29117946`)).find(
      (term) => words(term) === "basis",
    )?.nextElementSibling;
    if (!(basis instanceof HTMLElement)) throw new Error("no basis");
    expect([words(basis), one<HTMLElement>("span", basis).title]).toEqual([MBID, MB_WORK]);
  });
});

describe("the details of a pair", () => {
  it("shows the paradata, the beliefs and the actions", () => {
    show(layerit(), [{ block: A, id: "cpt_1" }]);
    expand(rectangle("performed by"));
    const wikidata = provenance("wdt:P175 wd:Q235650");
    expect(
      all("dt", wikidata).map((term) => [words(term), words(term.nextElementSibling as Element)]),
    ).toEqual([
      ["stated by", P],
      ["method", "reconciled"],
      ["service", WIKIDATA_API],
      ["note", "Portuguese pianist; the video's title names her"],
      ["date", "2026-11-18"],
    ]);
    expect(all('[data-testid="metadata-beliefs"] li', wikidata).map(words)).toEqual([
      `${P} believes it true (2026-11-18)`,
    ]);
    expect(all("button", wikidata).map(words)).toEqual(["True", "Unlikely", "False", "Remove"]);
    expect(pressed(wikidata)).toEqual([]);
    expect(
      words(one('[data-testid="metadata-beliefs"]', provenance("rel:prf viaf:113931950"))),
    ).toBe("No one has stated a belief.");
    expand(rectangles()[0] as HTMLElement);
    expect(words(one("p", provenance("type schema:VideoObject")))).toBe(
      "No provenance entry: the manifest states it.",
    );
  });

  it("records the user's belief in a stated pair and leaves it stated", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "cpt_1" }]);
    expand(rectangle("performed by"));
    button("False", provenance("wdt:P175 wd:Q235650")).click();
    await settle();
    expect(store.journal).toHaveLength(2);
    const [command] = commandsAfter(store, 1);
    const values = command?.type === "set" ? command.changes[0]?.values : undefined;
    if (values === undefined) throw new Error("no set");
    expect(Object.keys(values)).toEqual(["provenance"]);
    expect((values.provenance as { beliefs?: unknown }[])[1]?.beliefs).toEqual([
      { actor: P, belief: "true", date: "2026-11-18" },
      { actor: G, belief: "false", date: "2026-11-20" },
    ]);
    expect(headings()).toEqual([CPT_1_SENTENCE, "performed by Maria João Pires", "same as"]);
    const region = provenance("wdt:P175 wd:Q235650");
    expect(pressed(region)).toEqual(["False"]);
    expect(all('[data-testid="metadata-beliefs"] li', region)).toHaveLength(2);
    button("Unlikely", region).click();
    await settle();
    expect(store.journal).toHaveLength(3);
    const again = provenance("wdt:P175 wd:Q235650");
    expect(pressed(again)).toEqual(["Unlikely"]);
    expect(all('[data-testid="metadata-beliefs"] li', again)).toHaveLength(2);
  });

  it("removes a pair, the focus on its tile, else on Add statement", async () => {
    const store = layerit();
    const { selection } = show(store, [{ block: A, id: "cpt_1" }]);
    expand(rectangle("performed by"));
    button("Remove", provenance("rel:prf viaf:113931950")).click();
    await settle();
    expect(headings()).toEqual([CPT_1_SENTENCE, "same as", "performed by Maria João Pires"]);
    expect(document.activeElement).toBe(rectangle("performed by"));
    selection.value = selectionOf([{ block: A, id: "dpt_1" }]);
    flushSync();
    for (const pair of ["type schema:AudioObject", "type melod:Manifestation"]) {
      expand(rectangles()[0] as HTMLElement);
      button("Remove", provenance(pair)).click();
      await settle();
    }
    expect(rectangles().map((item) => item.dataset.key)).toEqual(["is_a"]);
    expect(document.activeElement).toBe(button("＋ Add statement"));
  });
});

describe("candidates", () => {
  it("states a candidate believed true into a tile that takes the focus", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "cpt_1" }]);
    button("True", provenance("is a recording of Clair de lune")).click();
    await settle();
    expect(store.journal).toHaveLength(2);
    expect(headings()).toEqual([
      CPT_1_SENTENCE,
      "performed by Maria João Pires",
      "same as",
      "is a recording of",
    ]);
    expect(document.activeElement).toBe(rectangle("is a recording of"));
    expect(summaries()).toEqual(["Candidates (0)", "Believed false by you (0)"]);
  });

  it("sets a candidate believed false apart, and offers it again once unlikely", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "dpt_1" }]);
    const name =
      "is derived from, is based on C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical";
    button("False", provenance(name)).click();
    await settle();
    expect(store.journal).toHaveLength(2);
    expect(summaries()).toEqual(["Candidates (0)", "Believed false by you (1)"]);
    expect(document.activeElement).toBe(one('[data-testid="metadata-candidates"] summary'));
    button("Unlikely", provenance(name)).click();
    await settle();
    expect(store.journal).toHaveLength(3);
    expect(summaries()).toEqual(["Candidates (1)", "Believed false by you (0)"]);
    expect(document.activeElement).toBe(one('[data-testid="metadata-dismissed"] summary'));
  });
});

describe("the composer", () => {
  it("states a pasted Wikidata URL after its verb is chosen", async () => {
    const store = layerit();
    const { informed } = show(store, [{ block: A, id: "cpt_2" }]);
    button("＋ Add statement").click();
    flushSync();
    await settle();
    expect(document.activeElement).toBe(field("Verb"));
    paste(field("Value"), "https://www.wikidata.org/wiki/Q235650");
    await settle();
    expect(field("Vocabulary").value).toBe("Wikidata");
    expect(field("Value").value).toBe("Maria João Pires");
    expect(document.activeElement).toBe(field("Verb"));
    choose(field("Verb"), "perf");
    expect(field("Verb").value).toBe("performed by");
    button("Add").click();
    await settle();
    expect(commandsAfter(store, 1)).toEqual([
      {
        type: "set",
        changes: [
          {
            target: { block: A, id: "cpt_2" },
            values: {
              statements: { "wdt:P175": [{ id: "wd:Q235650", label: "Maria João Pires" }] },
              provenance: [
                {
                  beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
                  date: "2026-11-20",
                  method: "manual",
                  property: "wdt:P175",
                  stated_by: [G],
                  value: { id: "wd:Q235650" },
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(headings()).toEqual([
      "Nothing states yet what cpt_2 is.",
      "performed by Maria João Pires",
    ]);
    expect(document.activeElement).toBe(rectangle("performed by"));

    button("＋ Add statement").click();
    flushSync();
    paste(field("Value"), "https://example.org/x");
    expect(informed).toEqual([
      "The address is no identifier the catalogue knows; choose “Other property…” to state it.",
    ]);
  });

  it("states an element of the manifest", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "cpt_2" }]);
    button("＋ Add statement").click();
    flushSync();
    choose(field("Verb"), "derived from");
    choose(field("Vocabulary"), "element");
    field("Value").focus();
    type(field("Value"), "");
    press(field("Value"), "ArrowDown");
    expect(options(field("Value"))).toEqual([
      "#clt_6 Clair de lune, mm. 1–6 (MEI) (timeline)",
      "#cpt_1 C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical (timeline)",
      "#dpt_1 ClairDeLune_MariaJoaoPires_untilM6.wav (timeline)",
    ]);
    press(field("Value"), "Enter");
    button("Add").click();
    await settle();
    const [command] = commandsAfter(store, 1);
    expect(command?.type === "set" ? command.changes[0]?.values.statements : null).toEqual({
      "dcterms:source": [{ id: "#clt_6" }],
    });
  });

  it("states another property in a language, and says what is missing", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "cpt_2" }]);
    button("＋ Add statement").click();
    flushSync();
    choose(field("Verb"), "Other");
    const composer = one('[data-testid="metadata-composer"]');
    const text = (label: string) => {
      const found = all<HTMLLabelElement>("label", composer).find(
        (item) => item.textContent?.trim() === label,
      );
      return one<HTMLInputElement>(`#${found?.htmlFor}`);
    };
    type(text("Property"), "foo");
    expect(button("Add").disabled).toBe(true);
    expect(one(".missing", composer).textContent).toBe(
      "Write the property as a compact IRI with a known prefix or in full.",
    );
    type(text("Property"), "dcterms:subject");
    const language = all<HTMLInputElement>('input[type="radio"]', composer).find(
      (item) => item.value === "language",
    );
    language?.click();
    flushSync();
    type(text("Value"), "Nocturne");
    type(text("Language"), "fr");
    button("Add").click();
    await settle();
    const [command] = commandsAfter(store, 1);
    expect(command?.type === "set" ? command.changes[0]?.values.statements : null).toEqual({
      "dcterms:subject": [{ "@value": "Nocturne", "@language": "fr" }],
    });
  });

  it("states performed by in the GND from Wikidata's cross-reference, in the same rectangle", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "cpt_1" }]);
    expand(rectangle("performed by"));
    button("＋ Add vocabulary", rectangle("performed by")).click();
    flushSync();
    await settle();
    expect(field("Verb").disabled).toBe(true);
    expect(field("Verb").value).toBe("performed by");
    expect(document.activeElement).toBe(field("Vocabulary"));
    press(field("Vocabulary"), "ArrowDown");
    expect(options(field("Vocabulary"))).toEqual(["MusicBrainz", "GND", "MeLODy / LRMoo"]);
    choose(field("Vocabulary"), "GND");
    await settle();
    press(field("Value"), "ArrowDown");
    expect(options(field("Value"))?.[0]).toContain("Pires, Maria João");
    press(field("Value"), "Enter");
    button("Add").click();
    await settle();
    const [command] = commandsAfter(store, 1);
    const values = command?.type === "set" ? command.changes[0]?.values : undefined;
    if (values === undefined) throw new Error("no set");
    expect((values.statements as Record<string, unknown>)["rel:prf"]).toEqual([
      { id: "viaf:113931950" },
      {
        id: "gnd:124927521",
        label: "Pires, Maria João",
        "schema:sameAs": [{ id: "wd:Q235650" }],
        provenance: [TIE],
      },
    ]);
    expect((values.provenance as unknown[]).at(-1)).toEqual({
      basis: [PIRES_WD],
      beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
      date: "2026-11-20",
      match: "exact",
      method: "reconciled",
      property: "rel:prf",
      service: WIKIDATA_API,
      stated_by: [G],
      value: { id: "gnd:124927521" },
    });
    expect(headings()).toEqual([CPT_1_SENTENCE, "performed by Pires, Maria João", "same as"]);
  });

  it("states a GND value searched in another vocabulary as manual, tied to the same thing", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    // Wikidata names no GND record, so nothing is offered and the GND is searched.
    const searching: Lookup = {
      ...LOOKUP,
      searchable: (system) => system === "gnd",
      search: async (system) => (system === "gnd" ? [GND_PIRES] : []),
      resolve: async (_system, iri) =>
        iri === PIRES_WD
          ? { ...WIKIDATA_PIRES, crossReferences: [] }
          : iri === PIRES_GND
            ? GND_PIRES
            : null,
    };
    const store = layerit();
    show(store, [{ block: A, id: "cpt_1" }], userContext(), searching);
    expand(rectangle("performed by"));
    button("＋ Add vocabulary", rectangle("performed by")).click();
    flushSync();
    await settle();
    choose(field("Vocabulary"), "GND");
    await settle();
    field("Value").focus();
    type(field("Value"), "Pires");
    await vi.advanceTimersByTimeAsync(250);
    await settle();
    press(field("Value"), "ArrowDown");
    expect(options(field("Value"))).toHaveLength(1);
    expect(options(field("Value"))?.[0]).toContain("Pires, Maria João");
    press(field("Value"), "Enter");
    button("Add").click();
    await settle();
    const [command] = commandsAfter(store, 1);
    const values = command?.type === "set" ? command.changes[0]?.values : undefined;
    if (values === undefined) throw new Error("no set");
    expect((values.statements as Record<string, unknown>)["rel:prf"]).toEqual([
      { id: "viaf:113931950" },
      {
        id: "gnd:124927521",
        label: "Pires, Maria João",
        "schema:sameAs": [{ id: "wd:Q235650" }],
        provenance: [TIE],
      },
    ]);
    expect((values.provenance as unknown[]).at(-1)).toEqual({
      beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
      date: "2026-11-20",
      method: "manual",
      property: "rel:prf",
      stated_by: [G],
      value: { id: "gnd:124927521" },
    });
  });

  it("gives the focus back to the button that opened it on Cancel", async () => {
    show(layerit(), [{ block: A, id: "cpt_1" }]);
    expand(rectangle("same as"));
    const opener = one('[data-testid="metadata-add-vocabulary"]', rectangle("same as"));
    (opener as HTMLButtonElement).click();
    flushSync();
    button("Cancel").click();
    await settle();
    expect(all('[data-testid="metadata-composer"]')).toHaveLength(0);
    expect(document.activeElement).toBe(
      one('[data-testid="metadata-add-vocabulary"]', rectangle("same as")),
    );
  });

  it("belongs to the element it was opened on", () => {
    const { selection } = show(layerit(), [{ block: A, id: "cpt_2" }]);
    button("＋ Add statement").click();
    flushSync();
    expect(all('[data-testid="metadata-composer"]')).toHaveLength(1);
    selection.value = selectionOf([{ block: A, id: "cpt_1" }]);
    flushSync();
    expect(all('[data-testid="metadata-composer"]')).toHaveLength(0);
  });
});

describe("the user", () => {
  it("is asked through the dialog and believes by the iD", async () => {
    const state = new UserState(null);
    const dialogTarget = document.createElement("div");
    document.body.append(dialogTarget);
    const dialog = mount(UserDialog, { target: dialogTarget });
    apps.push(dialog);
    const user: UserContext = {
      state,
      ask: async () => {
        const answer = await dialog.ask(state.user);
        if (answer !== null) state.set(answer);
      },
    };
    const store = layerit();
    show(store, [{ block: A, id: "cpt_1" }], user);
    button("Change…").click();
    flushSync();
    const form = one<HTMLDialogElement>("dialog");
    expect(form.open).toBe(true);
    expect(one("h2", form).textContent).toBe("Your name");
    const [name, orcid] = all<HTMLInputElement>("input", form);
    if (name === undefined || orcid === undefined) throw new Error("no fields");
    type(name, "");
    button("Save", form).click();
    flushSync();
    expect(one('[role="alert"]', form).textContent).toBe("A name is required.");
    type(name, "Clara Wieck");
    type(orcid, "https://orcid.org/0000-0002-1825-0097");
    button("Save", form).click();
    await settle();
    expect(one('[data-testid="metadata-user"]').textContent?.replace(/\s+/gu, " ").trim()).toBe(
      "You state as Clara Wieck (ORCID iD 0000-0002-1825-0097). Change…",
    );
    button("True", provenance("is a recording of Clair de lune")).click();
    await settle();
    const [command] = commandsAfter(store, 1);
    const entries = command?.type === "set" ? command.changes[0]?.values.provenance : [];
    expect((entries as { beliefs: unknown }[])[3]?.beliefs).toEqual([
      { actor: "https://orcid.org/0000-0002-1825-0097", belief: "true", date: "2026-11-20" },
    ]);
  });
});

describe("refusals", () => {
  it("posts the store's refusal as a warning and journals nothing", () => {
    const store = layerit();
    const { informed, warned, failed } = show(store, [{ block: A, id: "cpt_1" }]);
    const region = provenance("is a recording of Clair de lune");
    vi.spyOn(store, "dispatch").mockReturnValueOnce({
      code: "schema_violation",
      message: "refused for the test",
      path: [],
    });
    button("True", region).click();
    flushSync();
    expect([warned, informed, failed]).toEqual([["refused for the test"], [], []]);
    expect(store.journal).toHaveLength(1);
  });

  it("posts a throw of the statement functions as an error and journals nothing", () => {
    const store = layerit();
    const { informed, warned, failed } = show(store, [{ block: A, id: "cpt_1" }]);
    expand(rectangle("same as"));
    const remove = button("Remove", provenance("schema:sameAs youtube:Ch2mrPm1JnM"));
    const [same] = store.view.blocks[A]?.manifest.timelines[1]?.statements?.["schema:sameAs"] ?? [];
    // The store loses the pair while the rectangle still shows it.
    store.dispatch({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_1" },
          values: {
            statements: Object.fromEntries(
              Object.entries(store.view.blocks[A]?.manifest.timelines[1]?.statements ?? {}).filter(
                ([key]) => key !== "schema:sameAs",
              ),
            ),
            provenance: store.view.blocks[A]?.manifest.timelines[1]?.provenance?.slice(1) ?? null,
          },
        },
      ],
    });
    expect(same).toBeDefined();
    remove.click();
    expect([failed, warned, informed]).toEqual([
      ["The statement could not be changed: 'schema:sameAs' does not have this value"],
      [],
      [],
    ]);
    expect(store.journal).toHaveLength(2);
  });
});
