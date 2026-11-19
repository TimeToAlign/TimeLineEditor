/** The Metadata tab mounted; the expected values are derived in `README.md` ("The Metadata tab"). */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Command, CommandEntry, Store } from "@timetoalign/tilie-core";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import type { Candidate, Lookup } from "../src/lookup/index.ts";
import { informContext } from "../src/messages.svelte.ts";
import UserDialog from "../src/UserDialog.svelte";
import type { UserContext } from "../src/user.svelte.ts";
import { UserState } from "../src/user.svelte.ts";
import { stubEditor } from "./dom.ts";
import { holder } from "./holder.svelte.ts";
import { fixture, providing, storeOf, userContext } from "./support.ts";

const A = "0000000000";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const PIRES_WD = "http://www.wikidata.org/entity/Q235650";
const PIRES_GND = "https://d-nb.info/gnd/124927521";

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
  const target = document.createElement("div");
  document.body.append(target);
  apps.push(
    mount(providing(Inspector, user, lookup), {
      target,
      context: informContext(
        (text) => {
          informed.push(text);
        },
        (text) => {
          warned.push(text);
        },
      ),
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
  return { selection, informed, warned };
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

const rectangles = () => all<HTMLElement>('[data-testid="metadata-rectangle"]');
const headings = () =>
  rectangles().map((rectangle) => one(".verb", rectangle).textContent?.trim() ?? "");
const rectangle = (heading: string) => {
  const found = rectangles().find((item) => one(".verb", item).textContent?.trim() === heading);
  if (found === undefined) throw new Error(`no rectangle ${heading}`);
  return found;
};

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

describe("rectangles and drawers", () => {
  it("shows cpt_1's three rectangles, the user line and the drawers", () => {
    show(layerit(), [{ block: A, id: "cpt_1" }]);
    expect(one("p.subject").textContent).toBe(
      "This timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical'.",
    );
    expect(one('[data-testid="metadata-user"]').textContent?.replace(/\s+/gu, " ").trim()).toBe(
      "You state as Gerhardt. Change…",
    );
    expect(one('ol[aria-label="Statements"]').children).toHaveLength(3);
    expect(headings()).toEqual(["is a", "performed by", "same as"]);
    const performed = rectangle("performed by");
    expect(performed.getAttribute("role")).toBe("group");
    expect(one('[data-testid="metadata-label"]', performed).textContent).toBe("Maria João Pires");
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
    expect(one('[data-testid="metadata-provenance"]', performed).textContent).toBe(
      "reconciled · https://example.org/agents/tilie · 2026-11-18",
    );
    expect(all('[data-testid="metadata-add-vocabulary"]', performed)).toHaveLength(1);
    expect(summaries()).toEqual(["Stated higher up (2)", "Proposed (1)", "Rejected (0)"]);
    expect(
      all('[data-testid="metadata-proposed-row"] .what').map((row) =>
        row.textContent?.replace(/\s+/gu, " ").trim(),
      ),
    ).toEqual(["is a recording of Clair de lune"]);
  });

  it("offers the bundle's empty is a", () => {
    show(layerit(), [{ block: A }]);
    const empty = rectangles()[0];
    if (empty === undefined) throw new Error("no rectangle");
    expect(one("p.empty", empty).textContent).toBe("Not stated yet.");
    expect(button("State what it is", empty)).toBeDefined();
  });
});

describe("drawer actions", () => {
  it("confirms a proposal into a rectangle that takes the focus", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "cpt_1" }]);
    button("Confirm").click();
    await settle();
    expect(store.journal).toHaveLength(2);
    expect(headings()).toEqual(["is a", "performed by", "same as", "is a recording of"]);
    expect(document.activeElement).toBe(rectangle("is a recording of"));
  });

  it("rejects a proposal, the focus on the drawer's summary", async () => {
    const store = layerit();
    show(store, [{ block: A, id: "dpt_1" }]);
    button("Reject", one('[data-testid="metadata-drawer-proposed"]')).click();
    await settle();
    expect(store.journal).toHaveLength(2);
    expect(summaries().slice(1)).toEqual(["Proposed (0)", "Rejected (1)"]);
    expect(document.activeElement).toBe(one('[data-testid="metadata-drawer-proposed"] summary'));
  });
});

describe("removing", () => {
  it("gives the focus to the next rectangle, else to Add statement", async () => {
    const store = layerit();
    const { selection } = show(store, [{ block: A, id: "cpt_1" }]);
    button("Remove", rectangle("performed by")).click();
    await settle();
    expect(headings()).toEqual(["is a", "same as"]);
    expect(document.activeElement).toBe(rectangle("same as"));
    selection.value = selectionOf([{ block: A, id: "dpt_1" }]);
    flushSync();
    button("Remove", rectangle("is a")).click();
    await settle();
    expect(rectangles().map((item) => item.dataset.key)).toEqual(["is_a"]);
    expect(document.activeElement).toBe(button("＋ Add statement"));
  });
});

describe("rejecting", () => {
  it("rejects by a named button, posts it, and moves the focus on, at last to the drawer", async () => {
    const store = layerit();
    const { informed } = show(store, [{ block: A, id: "cpt_1" }]);
    const performed = rectangle("performed by");
    expect([
      all("select", performed).length,
      one('[data-testid="metadata-status"]', performed).textContent,
      all<HTMLButtonElement>("button", performed).map((item) => [
        item.textContent?.trim(),
        item.getAttribute("aria-label"),
      ]),
    ]).toEqual([
      0,
      "Status: confirmed",
      [
        ["Reject", "Reject performed by Maria João Pires"],
        ["Details", null],
        ["Remove", null],
        ["＋ vocabulary", null],
      ],
    ]);
    button("Reject", performed).click();
    await settle();
    expect(store.journal).toHaveLength(2);
    expect(headings()).toEqual(["is a", "same as"]);
    expect(document.activeElement).toBe(rectangle("same as"));
    button("Reject", rectangle("same as")).click();
    await settle();
    expect(store.journal).toHaveLength(3);
    expect(headings()).toEqual(["is a"]);
    expect(summaries()).toEqual(["Stated higher up (2)", "Proposed (1)", "Rejected (3)"]);
    expect(document.activeElement).toBe(one('[data-testid="metadata-drawer-rejected"] summary'));
    expect(informed).toEqual([
      "Rejected “performed by Maria João Pires”: it is listed under Rejected.",
      "Rejected “same as https://www.youtube.com/watch?v=Ch2mrPm1JnM”: it is listed under Rejected.",
    ]);
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
                  date: "2026-11-20",
                  method: "manual",
                  property: "wdt:P175",
                  stated_by: [G],
                  status: "confirmed",
                  value: { id: "wd:Q235650" },
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(headings()).toEqual(["is a", "performed by"]);
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
    button("＋ vocabulary", rectangle("performed by")).click();
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
      },
    ]);
    expect((values.provenance as unknown[]).at(-1)).toEqual({
      basis: [PIRES_WD],
      date: "2026-11-20",
      match: "exact",
      method: "reconciled",
      property: "rel:prf",
      service: WIKIDATA_API,
      stated_by: [G],
      status: "confirmed",
      value: { id: "gnd:124927521" },
    });
    expect(headings()).toEqual(["is a", "performed by", "same as"]);
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
    button("＋ vocabulary", rectangle("performed by")).click();
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
      },
    ]);
    expect((values.provenance as unknown[]).at(-1)).toEqual({
      date: "2026-11-20",
      method: "manual",
      property: "rel:prf",
      stated_by: [G],
      status: "confirmed",
      value: { id: "gnd:124927521" },
    });
  });

  it("gives the focus back to the button that opened it on Cancel", async () => {
    show(layerit(), [{ block: A, id: "cpt_1" }]);
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

describe("stated higher up", () => {
  it("lists two ancestors of one name apart", () => {
    const store = layerit();
    const name = store.view.blocks[A]?.manifest.timelines[1]?.name ?? null;
    expect([
      store.dispatch({
        type: "set",
        changes: [
          {
            target: { block: A, id: "cpt_2" },
            values: { name, statements: { "schema:sameAs": [{ id: "https://example.org/take" }] } },
          },
        ],
      }),
      store.dispatch({
        type: "add",
        into: { block: A, id: "cpt_2" },
        region: { id: "region_1", start: 0.0, end: 10.0 },
      }),
    ]).toEqual([null, null]);
    show(store, [{ block: A, id: "region_1" }]);
    expect([
      summaries()[0],
      all('[data-testid="metadata-drawer-higher"] h4').map((heading) => heading.textContent),
    ]).toEqual([
      "Stated higher up (6)",
      [
        "bundle 'LayerIt, Clair de lune mm. 1–6 (Pires)'",
        "timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical'",
        "timeline 'C.Debussy - Clair de Lune, Maria João Pires live at Jardin Musical'",
      ],
    ]);
  });
});

describe("the user", () => {
  it("is asked through the dialog and states the confirmation by the iD", async () => {
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
    button("Confirm").click();
    await settle();
    const [command] = commandsAfter(store, 1);
    const provenance = command?.type === "set" ? command.changes[0]?.values.provenance : [];
    expect((provenance as { stated_by: unknown }[])[3]?.stated_by).toEqual([
      "https://orcid.org/0000-0002-1825-0097",
    ]);
  });
});

describe("refusals", () => {
  it("posts the store's refusal as a warning and journals nothing", () => {
    const store = layerit();
    const { informed, warned } = show(store, [{ block: A, id: "cpt_1" }]);
    vi.spyOn(store, "dispatch").mockReturnValueOnce({
      code: "schema_violation",
      message: "refused for the test",
      path: [],
    });
    button("Confirm").click();
    flushSync();
    expect([warned, informed]).toEqual([["refused for the test"], []]);
    expect(store.journal).toHaveLength(1);
  });

  it("posts a throw of the statement functions as a warning and journals nothing", () => {
    const store = layerit();
    const { informed, warned } = show(store, [{ block: A, id: "cpt_1" }]);
    const remove = button("Remove", rectangle("same as"));
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
    expect([warned, informed]).toEqual([
      ["The statement could not be changed: 'schema:sameAs' does not have this value"],
      [],
    ]);
    expect(store.journal).toHaveLength(2);
  });
});
