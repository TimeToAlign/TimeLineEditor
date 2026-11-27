/** Adding flow control; the expected values are derived in `README.md` ("Adding flow control"). */

import type { Address, Store } from "@timetoalign/tilie-core";
import { findTimeline } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { FlowInput } from "../src/inspector/flowControl.ts";
import {
  addFlowElements,
  flowControlOf,
  flowPlan,
  PICK_NEW,
  PICK_NONE,
  pickOf,
  slotOptions,
} from "../src/inspector/flowControl.ts";
import { blockId, storeMints, storeOf } from "./support.ts";

const A = blockId(0);

/** A store of `fixture` with the flow-control editor of its root `root` open. */
function flowStore(fixture: string, root: string): Store {
  const store = storeOf(fixture);
  expect(store.open({ block: A, id: root }, "flow")).toBeNull();
  return store;
}

/** What the tab shows of `store`'s innermost editor. */
function shownOf(store: Store) {
  const shown = flowControlOf(store.view, store.editing.at(-1));
  if (shown === null) throw new Error("no flow-control editor is open");
  return shown;
}

/** The flow-control elements of `timeline`, in the manifest's order. */
function flowOf(store: Store, timeline: string) {
  const manifest = store.view.blocks[A]?.manifest;
  if (manifest === undefined) throw new Error("no block");
  return findTimeline(manifest, timeline)?.flow_control ?? [];
}

/** The outcome of adding `input` in `store`: the elements added, by ID, the addresses selected and the new entries. */
function add(store: Store, input: FlowInput) {
  const before = flowOf(store, input.timeline).map(({ id }) => id);
  const entries = store.entries.length;
  const plan = flowPlan(shownOf(store), input);
  if (!plan.ok) throw new Error(plan.problems[0]?.message);
  const result = addFlowElements(store, A, plan.value);
  if (!result.ok) throw new Error(result.problems[0]?.message);
  const added = flowOf(store, input.timeline).filter(({ id }) => !before.includes(id));
  return {
    elements: [...added].sort((left, right) => (left.id < right.id ? -1 : 1)),
    selected: result.value,
    entries: store.entries.length - entries,
  };
}

/** The refusal of adding `input` in `store`, before dispatch or by the store. */
function refusal(store: Store, input: FlowInput): string | undefined {
  const plan = flowPlan(shownOf(store), input);
  if (!plan.ok) return plan.problems[0]?.message;
  const result = addFlowElements(store, A, plan.value);
  return result.ok ? undefined : result.problems[0]?.message;
}

/** A flow-control element in its complete form. */
function element(id: string, role: string, coordinate: unknown, members: object = {}) {
  return { id, role, coordinate, name: null, label: null, meta: {}, ...members };
}

/** A destination of a jump in its complete form. */
function destination(members: object) {
  return { determined: true, reset: true, label: null, ...members };
}

/** `elements` in the order `add` returns them, by ID. */
function byId<T extends { readonly id: string }>(...elements: T[]): T[] {
  return elements.sort((left, right) => (left.id < right.id ? -1 : 1));
}

/** The addresses of `ids` in block `A`. */
function addresses(...ids: string[]): Address[] {
  return ids.map((id) => ({ block: A, id }));
}

const q = (value: number) => [value, 1];

describe("a sign or a plain element", () => {
  const cases: [string, string, object][] = [
    ["repeat_start", "jump_target", { manifestation: "repeat_start" }],
    ["volta", "jump_target", { manifestation: "volta" }],
    ["segno", "jump_target", { manifestation: "segno" }],
    ["coda", "jump_target", { manifestation: "coda" }],
    ["ossia", "jump_target", { manifestation: "ossia" }],
    ["volta_break", "break", { manifestation: "volta" }],
    ["fine", "break", { manifestation: "fine", ends: { passes: { from: 2 } } }],
    ["section_break", "section_break", {}],
    ["double_barline", "barline", { manifestation: "double_barline" }],
    ["final_barline", "barline", { manifestation: "final_barline" }],
    ["jump", "jump", { targets: [destination({ repeat_count: 1 })] }],
    ["jump_target", "jump_target", {}],
    ["break", "break", {}],
    ["barline", "barline", {}],
  ];
  it.each(cases)("%s writes one %s", (kind, role, members) => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [id = ""] = storeMints(role);
    const added = add(store, { kind, timeline: "allegro", text: "100" });
    expect(added.elements).toEqual([element(id, role, q(100), members)]);
    expect(added.selected).toEqual(addresses(id));
    expect(added.entries).toBe(1);
  });
});

describe("a repeat end", () => {
  it("goes back to the start of the section, a new repeat start or one there is", () => {
    const shown = shownOf(flowStore("flow/virtual_cards", "allegro"));
    expect(slotOptions(shown, "allegro", "repeat_start")).toEqual([
      { value: PICK_NONE, label: "Start of the section" },
      { value: PICK_NEW, label: "New repeat start" },
    ]);
    const alone = flowStore("flow/virtual_cards", "allegro");
    const [end = ""] = storeMints("jump");
    expect(add(alone, { kind: "repeat_end", timeline: "allegro", text: "1200" }).elements).toEqual([
      element(end, "jump", q(1200), {
        targets: [destination({ manifestation: "repeat_end", repeat_count: 1 })],
      }),
    ]);

    const store = flowStore("flow/virtual_cards", "allegro");
    const [start = "", jump = "", later = ""] = storeMints("jump_target", "jump", "jump");
    const added = add(store, {
      kind: "repeat_end",
      timeline: "allegro",
      text: "1200",
      slots: { repeat_start: { pick: PICK_NEW, text: "1100" } },
    });
    expect(added.elements).toEqual(
      byId(
        element(start, "jump_target", q(1100), { manifestation: "repeat_start" }),
        element(jump, "jump", q(1200), {
          targets: [destination({ to: start, manifestation: "repeat_end", repeat_count: 1 })],
        }),
      ),
    );
    expect(added.entries).toBe(1);
    expect(slotOptions(shownOf(store), "allegro", "repeat_start")).toEqual([
      { value: PICK_NONE, label: "Start of the section" },
      { value: pickOf(start), label: `${start} at 1100 ♩` },
      { value: PICK_NEW, label: "New repeat start" },
    ]);
    expect(add(store, { kind: "repeat_end", timeline: "allegro", text: "1300" }).elements).toEqual([
      element(later, "jump", q(1300), {
        targets: [destination({ to: start, manifestation: "repeat_end", repeat_count: 1 })],
      }),
    ]);
  });
});

describe("a first and a second ending", () => {
  it("writes the fork, the volta break, the repeat end and the second ending", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [second = "", fork = "", gap = "", end = ""] = storeMints(
      "jump_target",
      "jump",
      "break",
      "jump",
    );
    const added = add(store, {
      kind: "volta_set",
      timeline: "allegro",
      text: "1200",
      slots: { second_ending: { text: "1300" } },
    });
    expect(added.elements).toEqual(
      byId(
        element(second, "jump_target", q(1300), { manifestation: "volta" }),
        element(fork, "jump", q(1200), {
          targets: [
            destination({ by: [0, 1], manifestation: "volta", passes: [1] }),
            destination({ to: second, manifestation: "volta", passes: [2] }),
          ],
        }),
        element(gap, "break", q(1300), { manifestation: "volta" }),
        element(end, "jump", q(1300), {
          targets: [destination({ manifestation: "repeat_end", repeat_count: 1 })],
        }),
      ),
    );
    expect(added.selected).toEqual(
      addresses(...flowOf(store, "allegro").map(({ id }) => id)).filter((address) =>
        [second, fork, gap, end].includes(address.id ?? ""),
      ),
    );
    expect(added.entries).toBe(1);
  });
});

describe("a da capo", () => {
  it("goes to its timeline, taken once without the repeats", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [jump = ""] = storeMints("jump");
    const capo = { to: "allegro", manifestation: "da_capo", repeat_count: 1, reset: false };
    expect(add(store, { kind: "da_capo", timeline: "allegro", text: "1000" }).elements).toEqual([
      element(jump, "jump", q(1000), { targets: [destination(capo)] }),
    ]);
  });

  it("al fine writes its Fine, or plays until the Fine there is", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [jump = "", fine = ""] = storeMints("jump", "break");
    const added = add(store, {
      kind: "da_capo_al_fine",
      timeline: "allegro",
      text: "1000",
      slots: { fine: { pick: PICK_NEW, text: "800" } },
    });
    const leap = {
      to: "allegro",
      manifestation: "da_capo_al_fine",
      repeat_count: 1,
      reset: false,
    };
    expect(added.elements).toEqual(
      byId(
        element(jump, "jump", q(1000), { targets: [destination(leap)] }),
        element(fine, "break", q(800), { manifestation: "fine", ends: { after: { jump } } }),
      ),
    );

    const fixture = flowStore("flow/da_capo_al_fine", "score");
    expect(slotOptions(shownOf(fixture), "score", "fine")).toEqual([
      { value: pickOf("break_1"), label: "Fine at 8 ♩" },
      { value: PICK_NEW, label: "New Fine" },
    ]);
    const [other = ""] = storeMints("jump");
    expect(add(fixture, { kind: "da_capo_al_fine", timeline: "score", text: "12" })).toEqual({
      elements: [
        element(other, "jump", q(12), { targets: [destination({ ...leap, to: "score" })] }),
      ],
      selected: addresses(other),
      entries: 1,
    });
  });

  it("al coda writes its To Coda and its coda", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [coda = "", jump = "", toCoda = ""] = storeMints("jump_target", "jump", "jump");
    const added = add(store, {
      kind: "da_capo_al_coda",
      timeline: "allegro",
      text: "1400",
      slots: { to_coda: { text: "1100" }, coda: { pick: PICK_NEW, text: "1500" } },
    });
    expect(added.elements).toEqual(
      byId(
        element(coda, "jump_target", q(1500), { manifestation: "coda" }),
        element(jump, "jump", q(1400), {
          targets: [
            destination({
              to: "allegro",
              manifestation: "da_capo_al_coda",
              repeat_count: 1,
              reset: false,
            }),
          ],
        }),
        element(toCoda, "jump", q(1100), {
          targets: [destination({ to: coda, manifestation: "to_coda", after: { jump } })],
        }),
      ),
    );
    expect(added.entries).toBe(1);
  });
});

describe("a dal segno", () => {
  it("goes to a new segno, or to the segno there is", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    expect(slotOptions(shownOf(store), "allegro", "segno")).toEqual([
      { value: PICK_NEW, label: "New segno" },
    ]);
    const [segno = "", jump = ""] = storeMints("jump_target", "jump");
    const added = add(store, {
      kind: "dal_segno",
      timeline: "allegro",
      text: "1000",
      slots: { segno: { text: "600" } },
    });
    const leap = { manifestation: "dal_segno", repeat_count: 1, reset: false };
    expect(added.elements).toEqual(
      byId(
        element(segno, "jump_target", q(600), { manifestation: "segno" }),
        element(jump, "jump", q(1000), { targets: [destination({ ...leap, to: segno })] }),
      ),
    );

    const fixture = flowStore("flow/dal_segno_al_coda", "score");
    expect(slotOptions(shownOf(fixture), "score", "segno")).toEqual([
      { value: pickOf("jump_target_1"), label: "jump_target_1 at 4 ♩" },
      { value: PICK_NEW, label: "New segno" },
    ]);
    const [other = ""] = storeMints("jump");
    expect(add(fixture, { kind: "dal_segno", timeline: "score", text: "28" }).elements).toEqual([
      element(other, "jump", q(28), { targets: [destination({ ...leap, to: "jump_target_1" })] }),
    ]);
  });

  it("al fine writes its segno and its Fine", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [segno = "", jump = "", fine = ""] = storeMints("jump_target", "jump", "break");
    const added = add(store, {
      kind: "dal_segno_al_fine",
      timeline: "allegro",
      text: "1100",
      slots: { segno: { pick: PICK_NEW, text: "600" }, fine: { pick: PICK_NEW, text: "1000" } },
    });
    expect(added.elements).toEqual(
      byId(
        element(segno, "jump_target", q(600), { manifestation: "segno" }),
        element(jump, "jump", q(1100), {
          targets: [
            destination({
              to: segno,
              manifestation: "dal_segno_al_fine",
              repeat_count: 1,
              reset: false,
            }),
          ],
        }),
        element(fine, "break", q(1000), { manifestation: "fine", ends: { after: { jump } } }),
      ),
    );
    expect(added.selected).toEqual(addresses(segno, fine, jump));
    expect(added.entries).toBe(1);
    store.undo();
    expect(flowOf(store, "allegro").map(({ id }) => id)).toEqual(
      flowOf(flowStore("flow/virtual_cards", "allegro"), "allegro").map(({ id }) => id),
    );
    expect(store.canUndo).toBe(false);
  });

  it("al coda writes its segno, its To Coda and its coda", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const [segno = "", coda = "", jump = "", toCoda = ""] = storeMints(
      "jump_target",
      "jump_target",
      "jump",
      "jump",
    );
    const added = add(store, {
      kind: "dal_segno_al_coda",
      timeline: "allegro",
      text: "1400",
      slots: {
        segno: { pick: PICK_NEW, text: "600" },
        to_coda: { text: "1100" },
        coda: { pick: PICK_NEW, text: "1500" },
      },
    });
    expect(added.elements).toEqual(
      byId(
        element(segno, "jump_target", q(600), { manifestation: "segno" }),
        element(coda, "jump_target", q(1500), { manifestation: "coda" }),
        element(jump, "jump", q(1400), {
          targets: [
            destination({
              to: segno,
              manifestation: "dal_segno_al_coda",
              repeat_count: 1,
              reset: false,
            }),
          ],
        }),
        element(toCoda, "jump", q(1100), {
          targets: [destination({ to: coda, manifestation: "to_coda", after: { jump } })],
        }),
      ),
    );
    expect(added.entries).toBe(1);
  });
});

describe("a To Coda", () => {
  it("follows the al coda of its timeline to its coda", () => {
    const store = flowStore("flow/dal_segno_al_coda", "score");
    const [jump = ""] = storeMints("jump");
    expect(add(store, { kind: "to_coda", timeline: "score", text: "16" }).elements).toEqual([
      element(jump, "jump", q(16), {
        targets: [
          destination({
            to: "jump_target_2",
            manifestation: "to_coda",
            after: { jump: "jump_2", to: "jump_target_1" },
          }),
        ],
      }),
    ]);
  });

  it("is refused in a timeline without an al coda", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const journal = JSON.stringify(store.snapshot());
    expect(refusal(store, { kind: "to_coda", timeline: "allegro", text: "1200" })).toBe(
      "'allegro' holds no da capo al coda or dal segno al coda for a To Coda to follow",
    );
    expect(JSON.stringify(store.snapshot())).toBe(journal);
  });
});

describe("an ossia fork", () => {
  it("goes on, or to the ossia chosen on a choice nobody can check", () => {
    const store = flowStore("flow/ossia", "score");
    expect(slotOptions(shownOf(store), "score", "ossia")).toEqual([
      { value: pickOf("jump_target_1"), label: "jump_target_1 at 12 ♩" },
      { value: pickOf("ossia"), label: "Ossia (timeline)" },
      { value: PICK_NEW, label: "New ossia sign" },
    ]);
    const [jump = ""] = storeMints("jump");
    const added = add(store, {
      kind: "ossia_jump",
      timeline: "score",
      text: "8",
      slots: { ossia: { pick: pickOf("ossia") } },
    });
    expect(added.elements).toEqual([
      element(jump, "jump", q(8), {
        targets: [
          destination({ by: [0, 1] }),
          destination({ to: "ossia", determined: false, manifestation: "ossia" }),
        ],
      }),
    ]);
  });
});

describe("a refusal", () => {
  it("leaves the store as it was", () => {
    const store = flowStore("flow/virtual_cards", "allegro");
    const journal = JSON.stringify(store.snapshot());
    expect(
      refusal(store, {
        kind: "dal_segno",
        timeline: "allegro",
        text: "1000",
        slots: { segno: { pick: PICK_NEW, text: " " } },
      }),
    ).toBe("type the position of the new segno");
    const [, jump] = storeMints("jump_target", "jump");
    expect(
      refusal(store, {
        kind: "dal_segno",
        timeline: "allegro",
        text: "500",
        slots: { segno: { pick: PICK_NEW, text: "600" } },
      }),
    ).toBe(
      `'repeat_end' is a second jump at coordinate [500, 1] of 'allegro', after '${jump}': several signs at one place are destinations of one jump`,
    );
    expect(JSON.stringify(store.snapshot())).toBe(journal);
    expect(store.entries).toHaveLength(0);
  });
});
