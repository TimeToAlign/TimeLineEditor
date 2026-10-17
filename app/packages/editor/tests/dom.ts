import { IDBFactory } from "fake-indexeddb";
import { vi } from "vitest";

/**
 * Stub what jsdom lacks and the canvas needs: `matchMedia` (Svelte Flow
 * follows the preferred colour scheme; no query matches) and
 * `ResizeObserver` (Svelte Flow watches its pane's size; jsdom lays nothing
 * out, so it never reports). Undone by `vi.unstubAllGlobals()`.
 */
export function stubLayout(): void {
  vi.stubGlobal("matchMedia", (media: string): MediaQueryList => {
    const list = {
      matches: false,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
    return list as MediaQueryList;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

/**
 * Stub what the editor needs besides the layout: a fresh IndexedDB (the
 * autosave's), a modal `<dialog>`, which jsdom lacks: `showModal` sets
 * `open`, `close` removes it and fires `close`, and `getAnimations`, which
 * the canvas's animated elements call when they leave the drawing (jsdom
 * has no Web Animations; none run, so none are listed). The prototype
 * methods are installed once; the IndexedDB is undone by
 * `vi.unstubAllGlobals()`.
 */
export function stubEditor(): void {
  stubLayout();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const dialog = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  dialog.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  dialog.close ??= function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  Element.prototype.getAnimations ??= () => [];
}
