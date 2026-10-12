/**
 * The keyboard behaviour of a toolbar (WAI-ARIA Authoring Practices,
 * "Toolbar"): the toolbar is one tab stop, the button last focused; Left and
 * Right (Up and Down in a toolbar with `aria-orientation="vertical"`) move
 * focus to the previous and next enabled button, wrapping around, and Home
 * and End to the first and last.
 */

import type { Attachment } from "svelte/attachments";

type Step = (index: number, count: number) => number;

const previous: Step = (index, count) => (index - 1 + count) % count;
const next: Step = (index, count) => (index + 1) % count;
const first: Step = () => 0;
const last: Step = (_index, count) => count - 1;

const HORIZONTAL: { readonly [key: string]: Step } = {
  ArrowLeft: previous,
  ArrowRight: next,
  Home: first,
  End: last,
};

const VERTICAL: { readonly [key: string]: Step } = {
  ArrowUp: previous,
  ArrowDown: next,
  Home: first,
  End: last,
};

export const roving: Attachment<HTMLElement> = (toolbar) => {
  let current: HTMLButtonElement | null = null;

  const enabled = () =>
    Array.from(toolbar.querySelectorAll("button")).filter((button) => !button.disabled);

  /** Give the tab stop to the current button, or to the first when it is gone or disabled. */
  function sync(): void {
    const buttons = enabled();
    if (current === null || !buttons.includes(current)) current = buttons[0] ?? null;
    for (const button of buttons) button.tabIndex = button === current ? 0 : -1;
  }

  function onfocusin(event: FocusEvent): void {
    if (event.target instanceof HTMLButtonElement && enabled().includes(event.target)) {
      current = event.target;
      sync();
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    const steps = toolbar.getAttribute("aria-orientation") === "vertical" ? VERTICAL : HORIZONTAL;
    const step = steps[event.key];
    if (step === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = enabled();
    const index = current === null ? -1 : buttons.indexOf(current);
    if (index < 0 || buttons.length === 0) return;
    event.preventDefault();
    buttons[step(index, buttons.length)]?.focus();
  }

  sync();
  // Buttons are enabled, disabled, added and removed as the canvas changes.
  const observer = new MutationObserver(sync);
  observer.observe(toolbar, { subtree: true, childList: true, attributeFilter: ["disabled"] });
  toolbar.addEventListener("focusin", onfocusin);
  toolbar.addEventListener("keydown", onkeydown);
  return () => {
    observer.disconnect();
    toolbar.removeEventListener("focusin", onfocusin);
    toolbar.removeEventListener("keydown", onkeydown);
  };
};
