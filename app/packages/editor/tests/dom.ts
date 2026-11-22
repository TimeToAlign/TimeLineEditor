import { readFileSync } from "node:fs";
import path from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { parse } from "svelte/compiler";
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

/**
 * Add the stylesheet of the component `file` (a path under the package's
 * `src/`) to the document as its
 * source writes it, unscoped, and return the `<style>` element for the
 * test to remove: Vitest leaves components' styles out of jsdom, so a test
 * reading what a component's own rules give an element
 * (`getComputedStyle`) adds them itself. The rules match the classes the
 * component's elements carry; jsdom resolves the cascade, not layout.
 */
export function addStylesOf(file: string): HTMLStyleElement {
  const source = readFileSync(path.join(import.meta.dirname, "..", "src", file), "utf8");
  const styles = parse(source, { modern: true }).css?.content.styles ?? "";
  const element = document.createElement("style");
  element.textContent = styles;
  document.head.append(element);
  return element;
}

/**
 * Each computed `opacity` below 1 of `element` and of its ancestors,
 * innermost first: the fading that applies to its text, none when empty.
 */
export function fadingsOf(element: Element): string[] {
  const found: string[] = [];
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    const opacity = getComputedStyle(at).opacity;
    if (opacity !== "" && Number(opacity) < 1) found.push(opacity);
  }
  return found;
}
