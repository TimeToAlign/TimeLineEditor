/** The message bar; the expected values are stated in `README.md` ("The message bar"). */

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

/** The messages shown as [kind, text]. */
const shown = (messages: Messages) => messages.shown.map(({ kind, text }) => [kind, text]);

describe("the messages", () => {
  it("keep a warning and dismiss information after 3000 ms", () => {
    vi.useFakeTimers();
    const messages = new Messages();
    messages.warn("Refused.");
    messages.inform("Copied 2.0.");
    expect(INFO_DURATION_MS).toBe(3000);
    vi.advanceTimersByTime(2999);
    expect(shown(messages)).toEqual([
      ["warning", "Refused."],
      ["info", "Copied 2.0."],
    ]);
    vi.advanceTimersByTime(1);
    expect(shown(messages)).toEqual([["warning", "Refused."]]);
    vi.advanceTimersByTime(60_000);
    expect(shown(messages)).toEqual([["warning", "Refused."]]);
    const [warning] = messages.shown;
    if (warning === undefined) throw new Error("no warning");
    messages.dismiss(warning.id);
    expect(shown(messages)).toEqual([]);
  });

  it("clear the timer of information dismissed early or disposed", () => {
    vi.useFakeTimers();
    const messages = new Messages();
    messages.inform("First.");
    const [first] = messages.shown;
    if (first === undefined) throw new Error("no message");
    messages.dismiss(first.id);
    expect([shown(messages), vi.getTimerCount()]).toEqual([[], 0]);
    messages.inform("Second.");
    messages.inform("Third.");
    expect(vi.getTimerCount()).toBe(2);
    messages.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the bar", () => {
  it("marks each message by its kind and dismisses it on its button", () => {
    const messages = new Messages();
    messages.warn("Refused.");
    messages.inform("Copied.");
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
        card.getAttribute("data-kind"),
        card.querySelector("p")?.textContent,
      ]);
    expect(cards()).toEqual([
      ["warning", "Refused."],
      ["info", "Copied."],
    ]);
    document.querySelector<HTMLButtonElement>('[data-testid="message"] button')?.click();
    flushSync();
    expect(cards()).toEqual([["info", "Copied."]]);
    unmount(bar);
    messages.dispose();
  });

  it("is required by a component posting information", () => {
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
    ).toThrow("no component above this one provides inform");
  });
});
