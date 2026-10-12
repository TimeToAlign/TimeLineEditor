/**
 * The keyboard behaviour of a horizontal toolbar (WAI-ARIA Authoring
 * Practices, "Toolbar"): the toolbar is one tab stop, the button last
 * focused; Left and Right move focus to the previous and next enabled
 * button, wrapping around, and Home and End to the first and last.
 */

import type { Attachment } from "svelte/attachments";

const STEPS: { readonly [key: string]: (index: number, count: number) => number } = {
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowRight: (index, count) => (index + 1) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
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
    const step = STEPS[event.key];
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
