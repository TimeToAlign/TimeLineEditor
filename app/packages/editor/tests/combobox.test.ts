/** The combobox in jsdom; the expected values are stated in `README.md` ("The combobox"). */

import type { ComponentProps } from "svelte";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Log, Performer } from "./ComboboxHarness.svelte";
import Harness from "./ComboboxHarness.svelte";
import { holder } from "./holder.svelte.ts";

const PERFORMERS: readonly Performer[] = [
  { key: "c1", label: "Clara Schumann" },
  { key: "c2", label: "Clara Wieck" },
  { key: "c3", label: "Clara Haskil" },
];

/** The ids `scrollIntoView` was called on, with its argument. */
let scrolled: (readonly [string, unknown])[] = [];
/** The keys that reached the page above the combobox. */
let seen: string[] = [];
const see = (event: KeyboardEvent) => seen.push(event.key);
let mounted: ReturnType<typeof mount> | undefined;

beforeEach(() => {
  scrolled = [];
  seen = [];
  Element.prototype.scrollIntoView = function (this: Element, options?: unknown) {
    scrolled.push([this.id, options]);
  };
  document.body.addEventListener("keydown", see);
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.removeEventListener("keydown", see);
  document.body.innerHTML = "";
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

type Extra = Omit<ComponentProps<typeof Harness>, "options" | "loading" | "log">;

/** Mount the harness with the three performers, focused on the field. */
function setup(extra: Extra = {}, performers: readonly Performer[] = PERFORMERS) {
  const target = document.createElement("div");
  document.body.append(target);
  const options = holder(performers);
  const loading = holder(false);
  const log: Log = { texts: [], picks: [], enters: [], pastes: [] };
  const harness = mount(Harness, { target, props: { options, loading, log, ...extra } });
  mounted = harness;
  flushSync();
  const input = one<HTMLInputElement>(target, "input");
  const listbox = one<HTMLUListElement>(target, "[role=listbox]");
  const status = one<HTMLElement>(target, "[role=status]");
  input.focus();
  return { target, options, loading, log, harness, input, listbox, status };
}

function one<E extends Element>(within: ParentNode, selector: string): E {
  const found = within.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
}

function optionsOf(listbox: HTMLElement): HTMLLIElement[] {
  return [...listbox.querySelectorAll<HTMLLIElement>("[role=option]")];
}

/** Press `key` on the field; the event, to read whether it was consumed. */
function press(input: HTMLInputElement, key: string, alt = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, altKey: alt, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  flushSync();
  return event;
}

/** Type: the field's value becomes `value`. */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

/** The field's and the listbox's state, as the assertions read it. */
function shown(input: HTMLInputElement, listbox: HTMLElement) {
  return {
    expanded: input.getAttribute("aria-expanded"),
    hidden: listbox.hidden,
    activedescendant: input.getAttribute("aria-activedescendant"),
    selected: optionsOf(listbox).map((option) => option.getAttribute("aria-selected")),
    marked: optionsOf(listbox).map((option) =>
      option.querySelector("[data-active]")?.getAttribute("data-active"),
    ),
  };
}

function pointer(element: Element, type: string, button: number): MouseEvent {
  const event = new MouseEvent(type, { button, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

describe("the combobox", () => {
  it("states its role, name, list and active option after each key", () => {
    const { input, listbox, log } = setup();
    const prefix = input.id.slice(0, -"-input".length);
    expect([
      input.id,
      input.getAttribute("role"),
      input.getAttribute("aria-autocomplete"),
      input.getAttribute("aria-controls"),
      input.getAttribute("aria-label"),
      listbox.id,
      listbox.getAttribute("aria-label"),
      listbox.getAttribute("aria-busy"),
      optionsOf(listbox).map((option) => option.id),
    ]).toEqual([
      `${prefix}-input`,
      "combobox",
      "list",
      `${prefix}-listbox`,
      "Performer",
      `${prefix}-listbox`,
      "Performer",
      "false",
      [`${prefix}-option-0`, `${prefix}-option-1`, `${prefix}-option-2`],
    ]);
    const closed = {
      expanded: "false",
      hidden: true,
      activedescendant: null,
      selected: ["false", "false", "false"],
      marked: ["false", "false", "false"],
    };
    expect(shown(input, listbox)).toEqual(closed);

    type(input, "Clara");
    expect(log.texts).toEqual(["Clara"]);
    expect(shown(input, listbox)).toEqual({ ...closed, expanded: "true", hidden: false });

    const at = (index: number) => ({
      expanded: "true",
      hidden: false,
      activedescendant: `${prefix}-option-${index}`,
      selected: [0, 1, 2].map((i) => String(i === index)),
      marked: [0, 1, 2].map((i) => String(i === index)),
    });
    const consumed: boolean[] = [];
    for (const [key, index] of [
      ["ArrowDown", 0],
      ["ArrowDown", 1],
      ["ArrowDown", 2],
      ["ArrowDown", 0],
      ["ArrowUp", 2],
    ] as const) {
      consumed.push(press(input, key).defaultPrevented);
      expect([key, shown(input, listbox)]).toEqual([key, at(index)]);
      expect(document.activeElement).toBe(input);
    }
    expect(consumed).toEqual([true, true, true, true, true]);
    expect(scrolled).toEqual([
      [`${prefix}-option-0`, { block: "nearest" }],
      [`${prefix}-option-1`, { block: "nearest" }],
      [`${prefix}-option-2`, { block: "nearest" }],
      [`${prefix}-option-0`, { block: "nearest" }],
      [`${prefix}-option-2`, { block: "nearest" }],
    ]);

    const left = press(input, "ArrowLeft");
    expect([left.defaultPrevented, shown(input, listbox)]).toEqual([
      false,
      { ...closed, expanded: "true", hidden: false },
    ]);
    expect(seen).toEqual(["ArrowLeft"]);
    expect(document.activeElement).toBe(input);
  });

  it("picks the active option on Enter, and enters the text without one", () => {
    const { input, listbox, log } = setup();
    type(input, "Clara");
    press(input, "ArrowDown");
    press(input, "ArrowDown");
    const picked = press(input, "Enter");
    expect([
      picked.defaultPrevented,
      log.picks,
      log.enters,
      shown(input, listbox).expanded,
    ]).toEqual([true, ["Clara Wieck"], [], "false"]);
    expect(listbox.hidden).toBe(true);

    type(input, "Cl");
    expect(shown(input, listbox).expanded).toBe("true");
    press(input, "Enter");
    expect([log.picks, log.enters, shown(input, listbox).expanded]).toEqual([
      ["Clara Wieck"],
      ["Cl"],
      "false",
    ]);
    expect(seen).toEqual([]);
    expect(document.activeElement).toBe(input);
  });

  it("closes on the first Escape, clears the text on the second, and lets a third pass", () => {
    const { input, listbox, log } = setup();
    type(input, "Clara");
    press(input, "ArrowDown");
    const first = press(input, "Escape");
    expect([first.defaultPrevented, shown(input, listbox).expanded, log.texts]).toEqual([
      true,
      "false",
      ["Clara"],
    ]);
    expect(input.value).toBe("Clara");
    const second = press(input, "Escape");
    expect([second.defaultPrevented, log.texts, input.value]).toEqual([true, ["Clara", ""], ""]);
    expect(seen).toEqual([]);
    const third = press(input, "Escape");
    expect([third.defaultPrevented, log.texts, seen]).toEqual([false, ["Clara", ""], ["Escape"]]);
    expect(document.activeElement).toBe(input);
  });

  it("keeps the focus on a press in the list and picks on the primary button's release", () => {
    const { input, listbox, log } = setup();
    type(input, "Clara");
    const [, , third] = optionsOf(listbox);
    if (third === undefined) throw new Error("no third option");
    expect(pointer(third, "pointerdown", 0).defaultPrevented).toBe(true);
    expect(pointer(third, "mousedown", 0).defaultPrevented).toBe(true);
    pointer(third, "pointerup", 2);
    expect([log.picks, shown(input, listbox).expanded]).toEqual([[], "true"]);
    pointer(third, "pointerup", 0);
    expect([log.picks, shown(input, listbox).expanded]).toEqual([["Clara Haskil"], "false"]);
    expect(document.activeElement).toBe(input);
  });

  it("closes when the focus leaves it, not when it moves within", () => {
    const { target, input, listbox } = setup();
    type(input, "Clara");
    const [first] = optionsOf(listbox);
    input.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: first ?? null }),
    );
    flushSync();
    expect(shown(input, listbox).expanded).toBe("true");
    one<HTMLButtonElement>(target, "button").focus();
    flushSync();
    expect([shown(input, listbox).expanded, listbox.hidden]).toEqual(["false", true]);
  });

  it("shows the list with options, a running search or the empty snippet, and keeps the focus on it", () => {
    const bare = setup({}, []);
    type(bare.input, "Clr");
    expect([
      shown(bare.input, bare.listbox).expanded,
      bare.listbox.hidden,
      bare.status.textContent,
    ]).toEqual(["false", true, ""]);
    const escaped = press(bare.input, "Escape");
    expect([escaped.defaultPrevented, bare.log.texts, bare.input.value, seen]).toEqual([
      true,
      ["Clr", ""],
      "",
      [],
    ]);
    unmount(bare.harness);
    document.body.innerHTML = "";

    const { target, input, listbox, loading, status } = setup({ withEmpty: true }, []);
    type(input, "Clr");
    const empty = one<HTMLElement>(target, ".empty");
    expect([
      shown(input, listbox).expanded,
      listbox.hidden,
      empty.textContent?.trim(),
      listbox.contains(empty),
      status.textContent,
    ]).toEqual(["true", false, "Nothing for 'Clr'", false, "No results"]);
    expect([
      pointer(empty, "pointerdown", 0).defaultPrevented,
      pointer(empty, "mousedown", 0).defaultPrevented,
    ]).toEqual([true, true]);
    expect(document.activeElement).toBe(input);

    loading.value = true;
    flushSync();
    expect([
      shown(input, listbox).expanded,
      listbox.getAttribute("aria-busy"),
      target.querySelector(".empty"),
      status.textContent,
    ]).toEqual(["true", "true", null, "Searching…"]);

    loading.value = false;
    type(input, "");
    expect([
      shown(input, listbox).expanded,
      listbox.hidden,
      target.querySelector(".empty"),
    ]).toEqual(["false", true, null]);
  });

  it("stays closed while disabled", () => {
    const { input, listbox } = setup({ disabled: true });
    press(input, "ArrowDown");
    expect([input.disabled, shown(input, listbox).expanded, listbox.hidden]).toEqual([
      true,
      "false",
      true,
    ]);
  });

  it("announces what the list holds while open with text", () => {
    const { input, options, status } = setup();
    expect(status.textContent).toBe("");
    press(input, "ArrowDown");
    expect(status.textContent).toBe("");
    type(input, "Clara");
    expect(status.textContent).toBe("3 results");
    options.value = PERFORMERS.slice(0, 1);
    flushSync();
    expect(status.textContent).toBe("1 result");
    press(input, "Escape");
    expect(status.textContent).toBe("");
  });

  it("takes the words of a given announcement", () => {
    const { input, status } = setup({ announce: (count) => `${count} performers` });
    type(input, "Clara");
    expect(status.textContent).toBe("3 performers");
  });

  it("is named by labelledby and described by describedby", () => {
    const { input, listbox } = setup({ labelledby: "heading", describedby: "hint" });
    expect([
      input.getAttribute("aria-labelledby"),
      input.getAttribute("aria-label"),
      input.getAttribute("aria-describedby"),
      listbox.getAttribute("aria-labelledby"),
      listbox.getAttribute("aria-label"),
    ]).toEqual(["heading", null, "hint", "heading", null]);
  });

  it("hands a paste to its handler, consumed or not", () => {
    const paste = (input: HTMLInputElement) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { getData: (format: string) => (format === "text" ? "https://orcid.org/x" : "") },
      });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const [consumes, prevented] of [
      [true, true],
      [false, false],
      [undefined, false],
    ] as const) {
      const { input, log } = setup(consumes === undefined ? {} : { consumes });
      expect([consumes, paste(input), log.pastes]).toEqual([
        consumes,
        prevented,
        consumes === undefined ? [] : ["https://orcid.org/x"],
      ]);
      if (mounted !== undefined) unmount(mounted);
      mounted = undefined;
      document.body.innerHTML = "";
    }
  });

  it("focuses its field on focus()", () => {
    const { input, harness } = setup();
    input.blur();
    expect(document.activeElement).not.toBe(input);
    harness.focus();
    expect(document.activeElement).toBe(input);
  });
});
