/** The message system; the expected values are stated in `README.md` ("The message bar"). */

import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import MessageBar from "../src/MessageBar.svelte";
import { INFO_DURATION_MS, Messages } from "../src/messages.svelte.ts";
import { storeOf } from "./support.ts";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** The messages shown as [level, text]. */
const shown = (messages: Messages) => messages.shown.map(({ level, text }) => [level, text]);

/** Dismiss every message shown, one by one, by its id. */
function dismissAll(messages: Messages): void {
  for (const { id } of messages.shown) messages.dismiss(id);
}

describe("the messages", () => {
  it("list the three levels in the order posted, and only information leaves, after 3000 ms", () => {
    vi.useFakeTimers();
    const messages = new Messages();
    messages.post("warning", "Refused.");
    messages.post("info", "Copied 2.0.");
    messages.post("error", "Not saved.");
    expect(INFO_DURATION_MS).toBe(3000);
    const all = [
      ["warning", "Refused."],
      ["info", "Copied 2.0."],
      ["error", "Not saved."],
    ];
    expect(shown(messages)).toEqual(all);
    vi.advanceTimersByTime(2999);
    expect(shown(messages)).toEqual(all);
    vi.advanceTimersByTime(1);
    const staying = [
      ["warning", "Refused."],
      ["error", "Not saved."],
    ];
    expect(shown(messages)).toEqual(staying);
    vi.advanceTimersByTime(60_000);
    expect(shown(messages)).toEqual(staying);
    dismissAll(messages);
    expect(shown(messages)).toEqual([]);
  });

  it("show information of one text once, timed from its last posting; warnings and errors as often as posted", () => {
    vi.useFakeTimers();
    const messages = new Messages();
    messages.post("info", "Again.");
    vi.advanceTimersByTime(1000);
    messages.post("warning", "Again.");
    vi.advanceTimersByTime(1000);
    messages.post("info", "Again.");
    expect([shown(messages), vi.getTimerCount()]).toEqual([
      [
        ["warning", "Again."],
        ["info", "Again."],
      ],
      1,
    ]);
    vi.advanceTimersByTime(2999);
    expect(shown(messages)).toEqual([
      ["warning", "Again."],
      ["info", "Again."],
    ]);
    vi.advanceTimersByTime(1);
    expect(shown(messages)).toEqual([["warning", "Again."]]);
    messages.post("warning", "Again.");
    messages.post("error", "Twice.");
    messages.post("error", "Twice.");
    expect(shown(messages)).toEqual([
      ["warning", "Again."],
      ["warning", "Again."],
      ["error", "Twice."],
      ["error", "Twice."],
    ]);
  });

  it("clear the timer of information dismissed early or disposed", () => {
    vi.useFakeTimers();
    const messages = new Messages();
    messages.post("info", "First.");
    dismissAll(messages);
    expect([shown(messages), vi.getTimerCount()]).toEqual([[], 0]);
    messages.post("info", "Second.");
    messages.post("info", "Third.");
    expect(vi.getTimerCount()).toBe(2);
    messages.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the bar", () => {
  it("shows each message in its own card, with its level's word and role, and dismisses one on its button", () => {
    const messages = new Messages();
    const focused = document.createElement("button");
    document.body.append(focused);
    focused.focus();
    messages.post("warning", "Refused.");
    messages.post("info", "Copied.");
    messages.post("error", "Not saved.");
    const bar = mount(MessageBar, {
      target: document.body,
      props: {
        get messages() {
          return messages.shown;
        },
        ondismiss: (id: number) => messages.dismiss(id),
      },
    });
    flushSync();
    const cards = () =>
      [...document.querySelectorAll('[data-testid="message"]')].map((card) => [
        card.getAttribute("data-level"),
        card.getAttribute("role"),
        card.querySelector(".level")?.textContent,
        card.querySelector("p")?.textContent,
      ]);
    expect(cards()).toEqual([
      ["warning", "alert", "Warning", "Refused."],
      ["info", "status", "Info", "Copied."],
      ["error", "alert", "Error", "Not saved."],
    ]);
    const parents = new Set(
      [...document.querySelectorAll('[data-testid="message"]')].map((card) => card.parentElement),
    );
    expect(parents.size).toBe(1);
    expect(document.activeElement).toBe(focused);
    document.querySelectorAll<HTMLButtonElement>('[data-testid="message"] button')[1]?.click();
    flushSync();
    expect(cards()).toEqual([
      ["warning", "alert", "Warning", "Refused."],
      ["error", "alert", "Error", "Not saved."],
    ]);
    unmount(bar);
    messages.dispose();
  });

  it("is required by a component posting a message", () => {
    expect(() =>
      mount(PropertiesPanel, {
        target: document.body,
        props: {
          view: storeOf().view,
          store: storeOf(),
          block: null,
          subjects: [],
          editing: null,
          placement: null,
          drafts: new PropertyDrafts(),
        },
      }),
    ).toThrow("no component above this one provides post");
  });
});
