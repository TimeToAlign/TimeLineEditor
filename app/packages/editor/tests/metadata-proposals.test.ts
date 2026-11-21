/**
 * Proposed matches for names stated without an identifier, and picking an
 * element on the canvas; the expected values are derived in `README.md`
 * ("Proposed matches and picking on the canvas").
 */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Command, CommandEntry, Store, View } from "@timetoalign/tilie-core";
import { DEFAULT_USER, TILIE_AGENT } from "@timetoalign/tilie-core";
import { defaultCatalogue, fontMetrics, isJsonObject } from "@timetoalign/timetoshare";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import { believed, commandOf, dayOf } from "../src/inspector/metadata/edits.ts";
import type { Frame } from "../src/inspector/metadata/frame.ts";
import { candidatesOf, framePrefixes, shownOf } from "../src/inspector/metadata/frame.ts";
import type { Answers } from "../src/inspector/metadata/proposals.ts";
import {
  answerKey,
  answersTo,
  frameIn,
  proposed,
  proposedText,
  questionsOf,
  statedForName,
  unreconciledOf,
} from "../src/inspector/metadata/proposals.ts";
import type { Candidate, Lookup } from "../src/lookup/index.ts";
import { createLookup, NO_LOOKUP } from "../src/lookup/index.ts";
import { informContext } from "../src/messages.svelte.ts";
import { Picking, providePicking } from "../src/pick.svelte.ts";
import { stubEditor } from "./dom.ts";
import { holder } from "./holder.svelte.ts";
import { RECORDED_SERVER, replay } from "./lookup-replay.ts";
import { fixture, providing, storeOf, userContext } from "./support.ts";

const A = "0000000000";
const G = "tag:timetoalign.github.io,2026:tilie:user:Gerhardt";
/** The shipped catalogue: what the tab offers without type profiles. */
const CATALOGUE = defaultCatalogue();

const CPT_2 = ["timelines", 1, "children", 0];
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const PIRES = "Maria João Pires";
const CLAIR = "Clair de lune";

/** The names of `N`: one without a verb, a performer and a recorded work. */
const N = {
  "dcterms:subject": [{ label: "Nocturne" }],
  "rel:prf": [{ label: PIRES }],
  "wdt:P2550": [{ label: CLAIR }],
};

/** The LayerIt store as imported. */
const plain = (): Store => storeOf(fixture("statements/layerit_recording"));

/** The LayerIt store with `cpt_2` stating `statements`, the `set` accepted. */
function layerit(statements: object = N): Store {
  const store = storeOf(fixture("statements/layerit_recording"));
  const refusal = store.dispatch({
    type: "set",
    changes: [{ target: { block: A, id: "cpt_2" }, values: { statements } }],
  });
  if (refusal !== null) throw new Error(refusal.message);
  return store;
}

function frame(view: View, id: string | null): Frame {
  const address: Address = id === null ? { block: A } : { block: A, id };
  const subjects = resolveSelection(view, selectionOf([address]), null, fontMetrics);
  const found = shownOf(view, subjects, null);
  if (found.kind === "none") throw new Error(found.hint);
  return found;
}

/** A lookup over the recorded answers; MusicBrainz only with `server`. */
const recorded = (server = false): Lookup =>
  createLookup({ fetch: replay().fetch, server: server ? RECORDED_SERVER : null });

/** The member `name` of the element at `path` of a skeleton or manifest. */
function member(value: unknown, path: readonly (string | number)[], name: string): unknown {
  let found: unknown = value;
  for (const step of path) {
    found = Array.isArray(found)
      ? found[step as number]
      : isJsonObject(found)
        ? found[step as string]
        : undefined;
  }
  return isJsonObject(found) ? found[name] : undefined;
}

/** A candidate's entry as TiLiE writes it for `name`: no match stated, no belief. */
const proposal = (property: string, id: string, name: string, extra: object = {}) => ({
  property,
  value: { id },
  stated_by: [TILIE_AGENT],
  date: "2026-11-20",
  method: "reconciled",
  service: WIKIDATA_API,
  note: `found for the name “${name}”`,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("which names are unreconciled", () => {
  const { view } = layerit();

  it("finds cpt_2's two names with a verb, in key order, with the systems that search them", () => {
    const found = unreconciledOf(frame(view, "cpt_2"), CATALOGUE, recorded());
    expect(
      found.map(({ holder, subject, property, label, kind, systems }) => ({
        holder,
        subject,
        property,
        label,
        kind,
        systems,
      })),
    ).toEqual([
      {
        holder: "cpt_2",
        subject: CPT_2,
        property: "rel:prf",
        label: PIRES,
        kind: "agent",
        systems: ["wikidata", "gnd"],
      },
      {
        holder: "cpt_2",
        subject: CPT_2,
        property: "wdt:P2550",
        label: CLAIR,
        kind: "work",
        systems: ["wikidata", "gnd"],
      },
    ]);
    expect(found.map(({ node }) => node)).toEqual([{ label: PIRES }, { label: CLAIR }]);
    expect(
      unreconciledOf(frame(view, "cpt_2"), CATALOGUE, recorded(true)).map(({ systems }) => systems),
    ).toEqual([
      ["wikidata", "gnd", "musicbrainz"],
      ["wikidata", "gnd", "musicbrainz"],
    ]);
  });

  it("finds them below cpt_1 and the bundle, none in clt_6, none without a lookup", () => {
    const labels = (id: string | null, lookup = recorded()) =>
      unreconciledOf(frame(view, id), CATALOGUE, lookup).map(({ label }) => label);
    expect(labels("cpt_1")).toEqual([PIRES, CLAIR]);
    expect(labels(null)).toEqual([PIRES, CLAIR]);
    expect(labels("clt_6")).toEqual([]);
    expect(labels("cpt_2", NO_LOOKUP)).toEqual([]);
  });

  it("finds a name inside a value node at that node, and asks each name once", () => {
    const nested = layerit({
      "rel:prf": [{ label: PIRES }],
      "wdt:P2550": [{ id: "wd:Q29117946", "wdt:P175": [{ label: PIRES }] }],
    });
    const found = unreconciledOf(frame(nested.view, "cpt_2"), CATALOGUE, recorded());
    expect(found.map(({ holder, subject, property }) => [holder, subject, property])).toEqual([
      ["cpt_2", CPT_2, "rel:prf"],
      ["cpt_2", [...CPT_2, "statements", "wdt:P2550", 0], "wdt:P175"],
    ]);
    expect(questionsOf(found)).toEqual([
      { system: "wikidata", kind: "agent", texts: [PIRES] },
      { system: "gnd", kind: "agent", texts: [PIRES] },
    ]);
  });
});

describe("asking and proposing", () => {
  const store = layerit();
  const at = frame(store.view, "cpt_2");
  const found = unreconciledOf(at, CATALOGUE, recorded());

  it("asks once per system and kind, Wikidata first", () => {
    expect(questionsOf(found)).toEqual([
      { system: "wikidata", kind: "agent", texts: [PIRES] },
      { system: "wikidata", kind: "work", texts: [CLAIR] },
      { system: "gnd", kind: "agent", texts: [PIRES] },
      { system: "gnd", kind: "work", texts: [CLAIR] },
    ]);
  });

  it("keeps the answers of every system, none failing", async () => {
    const { answers, failures } = await answersTo(recorded(), questionsOf(found));
    const iri = (system: string, kind: "agent" | "work", text: string) =>
      answers.get(answerKey(system, kind, text))?.iri ?? null;
    expect(iri("wikidata", "agent", PIRES)).toBe("http://www.wikidata.org/entity/Q235650");
    expect(iri("wikidata", "work", CLAIR)).toBe("http://www.wikidata.org/entity/Q29117946");
    expect(iri("gnd", "work", CLAIR)).toBe("https://d-nb.info/gnd/1173441581");
    expect(iri("gnd", "agent", PIRES)).toBe("https://d-nb.info/gnd/1057057150");
    expect(failures).toEqual([]);
  });

  it("proposes Wikidata's candidates by TiLiE in one set of cpt_2's provenance", async () => {
    const { answers } = await answersTo(recorded(), questionsOf(found));
    const prefixes = framePrefixes(at, CATALOGUE);
    const result = proposed(at, found, answers, prefixes, dayOf(new Date()));
    expect(result.count).toBe(2);
    expect(result.placed).toEqual([{ holder: "cpt_2", count: 2 }]);
    expect(commandOf(at, result.skeleton)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_2" },
          values: {
            provenance: [
              proposal("rel:prf", "wd:Q235650", PIRES),
              proposal("wdt:P2550", "wd:Q29117946", CLAIR),
            ],
          },
        },
      ],
    });
  });

  it("proposes nothing again, nor what the user believes false", async () => {
    const { answers } = await answersTo(recorded(), questionsOf(found));
    const prefixes = framePrefixes(at, CATALOGUE);
    const again = layerit();
    const first = proposed(frame(again.view, "cpt_2"), found, answers, prefixes, "2026-11-20");
    expect(again.dispatch(commandOf(frame(again.view, "cpt_2"), first.skeleton))).toBeNull();
    const now = frame(again.view, "cpt_2");
    const twice = proposed(
      now,
      unreconciledOf(now, CATALOGUE, recorded()),
      answers,
      prefixes,
      "2026-11-20",
    );
    expect(twice.count).toBe(0);
    expect(commandOf(now, twice.skeleton)).toBeNull();
    const [row] = candidatesOf(now, CATALOGUE, DEFAULT_USER).offered;
    if (row === undefined) throw new Error("no candidate");
    expect(
      again.dispatch(
        commandOf(now, believed(now, row.subject, row.pair, G, "false", "2026-11-20")),
      ),
    ).toBeNull();
    const after = frame(again.view, "cpt_2");
    const thrice = proposed(
      after,
      unreconciledOf(after, CATALOGUE, recorded()),
      answers,
      prefixes,
      "2026-11-20",
    );
    expect(thrice.count).toBe(0);
  });

  it("proposes the GND's first candidate where Wikidata cannot be asked", async () => {
    const gnd = layerit({ "rel:prf": [{ label: "Pires, Maria João" }] });
    const here = frame(gnd.view, "cpt_2");
    const names = unreconciledOf(here, CATALOGUE, recorded());
    const { answers, failures } = await answersTo(recorded(), questionsOf(names));
    expect(failures.map(({ system }) => system)).toEqual(["wikidata"]);
    const result = proposed(here, names, answers, framePrefixes(here, CATALOGUE), "2026-11-20");
    expect(member(result.skeleton, CPT_2, "provenance")).toEqual([
      proposal("rel:prf", "gnd:1057057150", "Pires, Maria João", {
        service: "https://lobid.org/gnd/search",
      }),
    ]);
  });

  it("proposes a candidate its service matches as exact, its IRI kept absolute", () => {
    const iri = "http://musicbrainz.org/work/199ec7b6-ce07-34e9-85ca-fcf89fe808c9";
    const candidate: Candidate = {
      system: "musicbrainz",
      iri,
      label: "Clair de Lune",
      description: null,
      image: null,
      crossReferences: [],
      service: "https://musicbrainz.org/ws/2/",
      match: true,
    };
    const names = unreconciledOf(at, CATALOGUE, recorded(true)).filter(
      ({ property }) => property === "wdt:P2550",
    );
    const answers: Answers = new Map([[answerKey("musicbrainz", "work", CLAIR), candidate]]);
    const result = proposed(at, names, answers, framePrefixes(at, CATALOGUE), "2026-11-20");
    expect(member(result.skeleton, CPT_2, "provenance")).toEqual([
      proposal("wdt:P2550", iri, CLAIR, {
        service: "https://musicbrainz.org/ws/2/",
        match: "exact",
      }),
    ]);
  });
});

describe("what the panel says after proposing", () => {
  const words = (id: string | null) => `timeline '${id}'`;

  it("lists them under Candidates when all are on the element shown", () => {
    expect(proposedText([{ holder: "cpt_2", count: 2 }], "cpt_2", words)).toBe(
      "Proposed 2 matches: they are listed under Candidates.",
    );
    expect(proposedText([{ holder: "cpt_2", count: 1 }], "cpt_2", words)).toBe(
      "Proposed 1 match: they are listed under Candidates.",
    );
  });

  it("counts those here and names the other elements", () => {
    const placed = [
      { holder: "cpt_1", count: 2 },
      { holder: "clt_6", count: 1 },
    ];
    expect(proposedText(placed, "cpt_1", words)).toBe(
      "Proposed 3 matches: 2 here, 1 on timeline 'clt_6'; each is listed under Candidates of the element it is proposed for.",
    );
    expect(proposedText([{ holder: "cpt_2", count: 1 }], null, words)).toBe(
      "Proposed 1 match: 0 here, 1 on timeline 'cpt_2'; each is listed under Candidates of the element it is proposed for.",
    );
  });
});

describe("stating a candidate found for a name", () => {
  async function withProposals(): Promise<Store> {
    const store = layerit();
    const at = frame(store.view, "cpt_2");
    const found = unreconciledOf(at, CATALOGUE, recorded());
    const { answers } = await answersTo(recorded(), questionsOf(found));
    const { skeleton } = proposed(at, found, answers, framePrefixes(at, CATALOGUE), "2026-11-20");
    expect(store.dispatch(commandOf(at, skeleton))).toBeNull();
    return store;
  }

  /** The candidate of `cpt_2` under `rel:prf`. */
  function performer(at: Frame) {
    const row = candidatesOf(at, CATALOGUE, DEFAULT_USER).offered.find(
      ({ pair }) => pair[0] === "rel:prf",
    );
    if (row === undefined) throw new Error("no candidate");
    return row;
  }

  it("states the thing in place of the name", async () => {
    const store = await withProposals();
    const at = frame(store.view, "cpt_2");
    const after = statedForName(at, performer(at), G, "2026-11-20");
    if (after === null) throw new Error("not stated for the name");
    expect(commandOf(at, after)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: A, id: "cpt_2" },
          values: {
            statements: {
              "dcterms:subject": [{ label: "Nocturne" }],
              "rel:prf": [{ id: "wd:Q235650", label: PIRES }],
              "wdt:P2550": [{ label: CLAIR }],
            },
            provenance: [
              proposal("rel:prf", "wd:Q235650", PIRES, {
                beliefs: [{ actor: G, belief: "true", date: "2026-11-20" }],
              }),
              proposal("wdt:P2550", "wd:Q29117946", CLAIR),
            ],
          },
        },
      ],
    });
  });

  it("is no such statement for cpt_1's own candidate, nor where two names could be the one", async () => {
    const store = await withProposals();
    const cpt1 = frame(store.view, "cpt_1");
    const [own] = candidatesOf(cpt1, CATALOGUE, DEFAULT_USER).offered;
    if (own === undefined) throw new Error("no candidate");
    expect(statedForName(cpt1, own, G, "2026-11-20")).toBeNull();
    const two = await withProposals();
    expect(
      two.dispatch({
        type: "set",
        changes: [
          {
            target: { block: A, id: "cpt_2" },
            values: {
              statements: { ...N, "rel:prf": [{ label: PIRES }, { label: "Clara Wieck" }] },
            },
          },
        ],
      }),
    ).toBeNull();
    const at = frame(two.view, "cpt_2");
    expect(statedForName(at, performer(at), G, "2026-11-20")).toBeNull();
  });

  it("reads the element as it stands, and nothing once it is gone", async () => {
    const store = await withProposals();
    const old = frame(layerit().view, "cpt_2");
    const now = frameIn(store.view, old);
    expect(now?.skeleton).toBe(frame(store.view, "cpt_2").skeleton);
    expect(now?.path).toEqual(CPT_2);
    expect(store.dispatch({ type: "remove", targets: [{ block: A, id: "cpt_2" }] })).toBeNull();
    expect(frameIn(store.view, old)).toBeNull();
  });
});

describe("the tab", () => {
  /** Wikidata's candidates of the recordings, as a stub lookup answers them; nothing elsewhere. */
  const WIKIDATA: Readonly<Record<string, Candidate>> = {
    [PIRES]: {
      system: "wikidata",
      iri: "http://www.wikidata.org/entity/Q235650",
      label: PIRES,
      description: null,
      image: null,
      crossReferences: [],
      service: WIKIDATA_API,
      match: false,
    },
    [CLAIR]: {
      system: "wikidata",
      iri: "http://www.wikidata.org/entity/Q29117946",
      label: CLAIR,
      description: null,
      image: null,
      crossReferences: [],
      service: WIKIDATA_API,
      match: false,
    },
  };
  const LOOKUP: Lookup = {
    searchable: (system) => system === "wikidata" || system === "gnd",
    resolvable: () => false,
    search: async () => [],
    resolve: async () => null,
    reconcile: async (system, _kind, texts) =>
      texts.map((text) => (system === "wikidata" ? (WIKIDATA[text] ?? null) : null)),
  };

  let apps: ReturnType<typeof mount>[] = [];
  let informed: string[] = [];
  let picking: Picking;

  beforeEach(() => {
    stubEditor();
    Element.prototype.scrollIntoView = () => undefined;
    localStorage.clear();
    informed = [];
    picking = new Picking();
  });

  afterEach(() => {
    picking.cancel();
    for (const app of apps) unmount(app);
    apps = [];
    document.body.innerHTML = "";
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  /**
   * The inspector over `store` with `id` selected (`cpt_2` by default) and
   * the Metadata tab shown, with or without a picking; the selection, which
   * the test may change.
   */
  function show(
    store: Store,
    withPicking = true,
    id = "cpt_2",
    lookup: Lookup = LOOKUP,
  ): { value: Selection } {
    const selection = holder<Selection>(selectionOf([{ block: A, id }]));
    const inner = providing(Inspector, userContext(), lookup);
    const component: typeof Inspector = withPicking
      ? (...args) => {
          providePicking(picking);
          return inner(...args);
        }
      : inner;
    const target = document.createElement("div");
    document.body.append(target);
    apps.push(
      mount(component, {
        target,
        context: informContext((text) => {
          informed.push(text);
        }),
        props: {
          live: liveStore(store),
          get selection() {
            return selection.value;
          },
        },
      }),
    );
    flushSync();
    button("Metadata", '[role="tab"]').click();
    flushSync();
    return selection;
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await tick();
    }
    flushSync();
  }

  function one<E extends Element>(selector: string): E {
    const found = document.querySelector<E>(selector);
    if (found === null) throw new Error(`no ${selector}`);
    return found;
  }

  function button(name: string, selector = "button"): HTMLElement {
    const found = [...document.querySelectorAll<HTMLElement>(selector)].find(
      (item) => item.textContent?.trim() === name,
    );
    if (found === undefined) throw new Error(`no button ${name}`);
    return found;
  }

  const text = (selector: string) =>
    document.querySelector(selector)?.textContent?.replace(/\s+/gu, " ").trim() ?? null;

  const commandsAfter = (store: Store, from: number): Command[] =>
    store.journal.slice(from).map((entry) => (entry as CommandEntry).command);

  it("proposes matches, and believing one true states the thing for the name", async () => {
    const store = layerit();
    show(store);
    expect(text('[data-testid="metadata-candidates"] .count')).toBe(
      "2 names without an identifier here and below",
    );
    const before = store.journal.length;
    one<HTMLButtonElement>('[data-testid="metadata-propose"]').click();
    await settle();
    expect(store.journal.length).toBe(before + 1);
    expect(text('[data-testid="metadata-candidates"] summary')).toBe("Candidates (2)");
    expect(informed).toEqual(["Proposed 2 matches: they are listed under Candidates."]);
    one<HTMLButtonElement>('[data-testid="metadata-propose"]').click();
    await settle();
    expect(store.journal.length).toBe(before + 1);
    expect(informed.at(-1)).toBe("No new match was found for the 2 names.");
    const row = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="metadata-candidate-row"]'),
    ].find((item) => item.textContent?.includes(PIRES));
    row?.querySelector<HTMLButtonElement>("button")?.click();
    flushSync();
    const believe = [...(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (item) => item.textContent?.trim() === "True",
    );
    if (believe === undefined) throw new Error("no True");
    believe.click();
    await settle();
    expect(store.journal.length).toBe(before + 2);
    const [command] = commandsAfter(store, before + 1);
    expect(command?.type === "set" ? command.changes[0]?.values.statements : null).toEqual({
      "dcterms:subject": [{ label: "Nocturne" }],
      "rel:prf": [{ id: "wd:Q235650", label: PIRES }],
      "wdt:P2550": [{ label: CLAIR }],
    });
    expect(text('[data-testid="metadata-candidates"] summary')).toBe("Candidates (1)");
    expect(text('[data-testid="metadata-candidates"] .count')).toBe(
      "1 name without an identifier here and below",
    );
  });

  const count = () => text('[data-testid="metadata-candidates"] .count');
  const proposedSummary = () => text('[data-testid="metadata-candidates"] summary');
  const busy = () => one('[data-testid="metadata-propose"]').getAttribute("aria-busy");

  it("proposes the names below the element shown, and says where they went", async () => {
    const store = layerit();
    const selection = show(store, true, "cpt_1");
    expect(count()).toBe("2 names without an identifier here and below");
    expect(proposedSummary()).toBe("Candidates (1)");
    const before = store.journal.length;
    one<HTMLButtonElement>('[data-testid="metadata-propose"]').click();
    await settle();
    expect(store.journal.length).toBe(before + 1);
    expect(proposedSummary()).toBe("Candidates (1)");
    expect(informed).toEqual([
      "Proposed 2 matches: 0 here, 2 on timeline 'cpt_2'; each is listed under Candidates of the element it is proposed for.",
    ]);
    selection.value = selectionOf([{ block: A, id: "cpt_2" }]);
    flushSync();
    expect(proposedSummary()).toBe("Candidates (2)");
  });

  it("shows the lookup on the element it runs for only", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting: Lookup = {
      ...LOOKUP,
      reconcile: async (system, kind, texts, signal) => {
        await gate;
        return LOOKUP.reconcile(system, kind, texts, signal);
      },
    };
    const store = layerit();
    const selection = show(store, true, "cpt_2", waiting);
    one<HTMLButtonElement>('[data-testid="metadata-propose"]').click();
    flushSync();
    expect([count(), busy()]).toEqual(["Looking them up…", "true"]);
    selection.value = selectionOf([{ block: A, id: "cpt_1" }]);
    flushSync();
    expect([count(), busy()]).toEqual(["2 names without an identifier here and below", "false"]);
    selection.value = selectionOf([{ block: A, id: "cpt_2" }]);
    flushSync();
    expect([count(), busy()]).toEqual(["Looking them up…", "true"]);
    release();
    await settle();
    expect(proposedSummary()).toBe("Candidates (2)");
    expect([count(), busy()]).toEqual(["2 names without an identifier here and below", "false"]);
  });

  /** Choose `text`'s first option in the composer's combobox labelled `name`. */
  function choose(name: string, value: string): void {
    const input = field(name);
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    for (const key of ["ArrowDown", "Enter"]) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      flushSync();
    }
  }

  function field(name: string): HTMLInputElement {
    const label = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="metadata-composer"] .field > span'),
    ].find((item) => item.textContent === name);
    if (label === undefined) throw new Error(`no field ${name}`);
    return one<HTMLInputElement>(`input[aria-labelledby="${label.id}"]`);
  }

  const pickButton = () =>
    document.querySelector<HTMLButtonElement>('[data-testid="metadata-pick"]');
  const prompt = () => text('[data-testid="metadata-composer"] .prompt');

  /** On cpt_2: "＋ Add statement", "derived from" in an element of the manifest. */
  function composeElement(store: Store, withPicking = true): void {
    show(store, withPicking);
    button("＋ Add statement").click();
    flushSync();
    choose("Verb", "derived from");
    choose("Vocabulary", "element");
  }

  it("offers picking only for an element of the manifest, and only with a canvas", () => {
    show(plain());
    button("＋ Add statement").click();
    flushSync();
    choose("Verb", "performed by");
    choose("Vocabulary", "Wikidata");
    expect(pickButton()).toBeNull();
    for (const app of apps) unmount(app);
    apps = [];
    document.body.innerHTML = "";
    composeElement(plain(), false);
    expect(pickButton()).toBeNull();
  });

  it("takes the picked element as the value", async () => {
    const store = plain();
    composeElement(store);
    pickButton()?.click();
    flushSync();
    expect(picking.active).toBe(true);
    expect(pickButton()?.getAttribute("aria-pressed")).toBe("true");
    expect(prompt()).toBe("Pick a timeline or a region on the canvas; Escape cancels.");
    picking.take({ block: A, id: "clt_6" });
    await settle();
    expect(picking.active).toBe(false);
    expect(field("Value").value).toBe("Clair de lune, mm. 1–6 (MEI) (timeline)");
    expect(document.activeElement).toBe(field("Value"));
    expect(prompt()).toBe("");
    const before = store.journal.length;
    button("Add").click();
    await settle();
    const [command] = commandsAfter(store, before);
    expect(command?.type === "set" ? command.changes[0]?.values.statements : null).toEqual({
      "dcterms:source": [{ id: "#clt_6" }],
    });
  });

  it("ends picking on Escape with nothing chosen", async () => {
    composeElement(plain());
    pickButton()?.click();
    flushSync();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    await settle();
    expect(picking.active).toBe(false);
    expect(document.querySelector('[data-testid="metadata-composer"]')).not.toBeNull();
    expect(field("Value").value).toBe("");
    expect(document.activeElement).toBe(pickButton());
  });

  it("refuses an element of another block and the element shown", async () => {
    composeElement(plain());
    for (const address of [
      { block: "0000000001", id: "clt_6" },
      { block: A, id: "cpt_2" },
    ]) {
      pickButton()?.click();
      flushSync();
      picking.take(address);
      await settle();
    }
    expect(informed).toEqual([
      "That element lies in another block; pick a timeline or a region of this one.",
      "The element shown cannot be its own value; pick another timeline or region.",
    ]);
    expect(field("Value").value).toBe("");
  });

  it("ends picking when the composer closes", () => {
    composeElement(plain());
    pickButton()?.click();
    flushSync();
    button("Cancel").click();
    flushSync();
    expect(picking.active).toBe(false);
  });
});
