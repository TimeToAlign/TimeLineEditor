/**
 * The test hook: `window.__tilie`, through which the end-to-end tests open
 * workspaces and read the editor's state. It exists only in development
 * builds and in builds made with `VITE_TILIE_TEST_HOOK=1`; a production build
 * contains none of it.
 */

import type { ResizeMode } from "@timetoalign/tilie-arranger";
import type { Problem, Store } from "@timetoalign/tilie-core";

export interface ViewportValue {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface TestHook {
  /** Open the workspace file `text` in place of the current workspace; throws when it is refused. */
  load(text: string): void;
  store(): Store;
  /** The selected addresses. */
  selection(): string[];
  select(addresses: string[]): void;
  viewport(): ViewportValue;
  setViewport(viewport: ViewportValue): void;
  locked(): boolean;
  mode(): ResizeMode;
}

declare global {
  interface Window {
    __tilie?: TestHook;
  }
}

/** A workspace file `load` refused, with the reader's problems. */
export class WorkspaceRefusedError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    const lines = problems.map(
      ({ code, message, path }) => `${code} at /${path.join("/")}: ${message}`,
    );
    super(`the workspace file is refused:\n${lines.join("\n")}`);
    this.name = "WorkspaceRefusedError";
    this.problems = problems;
  }
}

/** Whether this build carries the test hook. */
export const TEST_HOOK = import.meta.env.DEV || import.meta.env.VITE_TILIE_TEST_HOOK === "1";

/** Install `hook` as `window.__tilie`; returns its removal. */
export function installTestHook(hook: TestHook): () => void {
  window.__tilie = hook;
  return () => {
    if (window.__tilie === hook) delete window.__tilie;
  };
}
