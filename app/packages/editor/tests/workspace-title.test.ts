/** The workspace's title; the expected values are stated in `README.md` ("The workspace's title"). */

import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import WorkspaceTitle from "../src/WorkspaceTitle.svelte";

const mounted: Record<string, unknown>[] = [];

afterEach(() => {
  for (const component of mounted.splice(0)) void unmount(component);
  document.body.innerHTML = "";
});

const REFUSAL = "the workspace's name is never empty";

/** Mount the title in a fresh element; `calls` records every `onrename` as "rename <name>". */
function mountTitle(
  name: string,
  fileName: string,
  dirty: boolean,
  options: {
    readonly refuse?: boolean;
    readonly target?: HTMLElement;
    readonly calls?: string[];
  } = {},
): { readonly target: HTMLElement; readonly calls: string[] } {
  const target = options.target ?? document.body.appendChild(document.createElement("div"));
  const calls = options.calls ?? [];
  const onrename = (renamed: string): string | null => {
    calls.push(`rename ${renamed}`);
    return options.refuse === true ? REFUSAL : null;
  };
  mounted.push(mount(WorkspaceTitle, { target, props: { name, fileName, dirty, onrename } }));
  flushSync();
  return { target, calls };
}

function button(target: HTMLElement): HTMLButtonElement {
  const found = target.querySelector("button");
  if (found === null) throw new Error("no button");
  return found;
}

function field(target: HTMLElement): HTMLInputElement {
  const found = target.querySelector("input");
  if (found === null) throw new Error("no field");
  return found;
}

/** Replace the field's text by `text`, as typing does. */
function type(input: HTMLInputElement, text: string): HTMLInputElement {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  return input;
}

/** Click the button and type `text` into the field it opens. */
function rename(target: HTMLElement, text: string): HTMLInputElement {
  button(target).click();
  flushSync();
  return type(field(target), text);
}

function press(element: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

describe("the title", () => {
  it("shows the dirty name alone when the file is the one the name gives", () => {
    const { target } = mountTitle("untitled", "untitled.tle.json", true);
    expect(target.textContent).toBe("• untitled");
    expect(target.querySelectorAll("button").length).toBe(1);
    expect(button(target).getAttribute("aria-label")).toBe(
      "Workspace name untitled, click to rename",
    );
    expect(target.querySelector(".file")).toBeNull();
  });

  it("shows the file's name after a name that does not give it", () => {
    const { target } = mountTitle("LayerIt", "untitled.tle.json", false);
    expect(target.textContent).toBe("LayerIt — untitled.tle.json");
  });
});

describe("renaming", () => {
  it("opens a focused, selected field and commits on Enter", () => {
    const { target, calls } = mountTitle("untitled", "untitled.tle.json", false);
    button(target).click();
    flushSync();
    const input = field(target);
    expect([
      input.getAttribute("aria-label"),
      input.value,
      document.activeElement === input,
      input.selectionStart,
      input.selectionEnd,
      target.querySelector("button"),
    ]).toEqual(["Workspace name", "untitled", true, 0, 8, null]);
    press(type(input, "LayerIt"), "Enter");
    expect(calls).toEqual(["rename LayerIt"]);
    expect([target.querySelector("input"), document.activeElement === button(target)]).toEqual([
      null,
      true,
    ]);
  });

  it("opens the field on F2", () => {
    const { target } = mountTitle("untitled", "untitled.tle.json", false);
    press(button(target), "F2");
    expect(field(target).value).toBe("untitled");
  });

  it("commits the trimmed text when the field is left", () => {
    const { target, calls } = mountTitle("untitled", "untitled.tle.json", false);
    rename(target, "  Op. 35 ").dispatchEvent(new FocusEvent("blur"));
    flushSync();
    expect([calls, target.querySelector("input")]).toEqual([["rename Op. 35"], null]);
  });

  it("cancels on Escape without a call", () => {
    const { target, calls } = mountTitle("untitled", "untitled.tle.json", false);
    press(rename(target, "LayerIt"), "Escape");
    expect(calls).toEqual([]);
    expect([target.querySelector("input"), document.activeElement === button(target)]).toEqual([
      null,
      true,
    ]);
    expect(target.textContent).toBe("untitled");
  });

  it("keeps the field and shows a refusal", () => {
    const { target, calls } = mountTitle("untitled", "untitled.tle.json", false, { refuse: true });
    const input = rename(target, "");
    press(input, "Enter");
    expect(calls).toEqual(["rename "]);
    expect(field(target)).toBe(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby");
    expect(described === null ? null : document.getElementById(described)?.textContent).toBe(
      REFUSAL,
    );
    expect(target.textContent).toBe(REFUSAL);
    type(input, "L");
    expect([input.getAttribute("aria-invalid"), input.getAttribute("aria-describedby")]).toEqual([
      "false",
      null,
    ]);
  });

  it("commits on Ctrl+S before a listener above it, leaving the event to it", () => {
    const target = document.body.appendChild(document.createElement("div"));
    const order: string[] = [];
    let prevented: boolean | null = null;
    target.addEventListener("keydown", (event) => {
      order.push("parent");
      prevented = event.defaultPrevented;
    });
    mountTitle("untitled", "untitled.tle.json", false, { target, calls: order });
    const input = rename(target, "LayerIt");
    press(input, "s", { ctrlKey: true });
    expect([order, prevented]).toEqual([["rename LayerIt", "parent"], false]);
  });
});
