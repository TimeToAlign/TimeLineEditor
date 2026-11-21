/**
 * The autosave of one editor: while the editor holds its slot's Web Lock it
 * keeps the slot in step with the open workspace and where its file lies
 * (`autosave.ts` writes it),
 * writes a pending snapshot at once when the page is hidden, and offers
 * what an earlier session left in the slot when it starts.
 */

import type { Problem } from "@timetoalign/tilie-core";
import {
  emptyWorkspace,
  isLoadError,
  readWorkspace,
  writeWorkspace,
} from "@timetoalign/tilie-core";
import type { Snapshot } from "./autosave.ts";
import { AutosaveError, createAutosave, recoverWorkspace } from "./autosave.ts";
import { lastChanged } from "./files.ts";
import { messageOf } from "./messages.svelte.ts";
import type { WorkspaceSession } from "./workspaceSession.svelte.ts";

export interface AutosavingOptions {
  /** The slot's name; the Web Lock is `tilie-autosave/<slot>`. */
  readonly slot: string;
  /** How long a change waits for a later one before it is written. */
  readonly delayMs: number;
  /** Show a warning, kept until dismissed. */
  readonly warn: (text: string, problems?: readonly Problem[]) => void;
  /** Ask `question` with `answers`, the focus on `focused`: the answer chosen, `null` when dismissed. */
  readonly ask: <const A extends string>(
    question: string,
    answers: readonly A[],
    focused: NoInfer<A>,
  ) => Promise<A | null>;
}

/** A running autosave. */
export interface Autosaving {
  /** Write the pending snapshot now and wait for every write; a failure is shown, never thrown. */
  flush(): Promise<void>;
  /** Write the pending snapshot, give back the lock and follow the workspace no more. */
  stop(): void;
}

/** The Web Lock an editor holds on a slot while it autosaves into it. */
export function autosaveLock(slot: string): string {
  return `tilie-autosave/${slot}`;
}

/** Start autosaving `session` into `options.slot`. */
export function startAutosave(session: WorkspaceSession, options: AutosavingOptions): Autosaving {
  const { slot, delayMs, warn, ask } = options;
  let failed = false;

  /** Show the first autosave failure; later ones would only repeat it. */
  function failure(error: unknown): void {
    if (failed) return;
    failed = true;
    const reason = error instanceof AutosaveError ? error.message : messageOf(error);
    warn(`Autosave is not working, so unsaved changes cannot be recovered: ${reason}`);
  }

  const autosave = createAutosave({ key: slot, delayMs, onError: failure });
  /**
   * Whether this editor autosaves: it holds the slot's lock, or the browser
   * has no Web Locks. False until that is known, so nothing is written before.
   */
  let autosaving = false;
  /** Set once stopped: an autosave still starting then writes nothing. */
  let stopped = false;
  let releaseLock: (() => void) | undefined;

  /**
   * Keep the slot in step with the open workspace: while it is unsaved, its
   * text, written once the delay has passed; once it is saved (opened, new,
   * saved, or undone back to the saved view), nothing.
   */
  function track(): void {
    if (!autosaving || stopped) return;
    const current = session.store;
    if (current.view === session.savedView) {
      autosave.discard();
      return;
    }
    const { fileName: name, handle, path } = session;
    autosave.schedule(() => ({
      text: writeWorkspace(current.snapshot()),
      name,
      ...(path === null ? {} : { path }),
      ...(handle === null ? {} : { handle }),
    }));
  }

  /** Hold the slot's lock until stopped; `false` when another editor holds it. */
  function claim(): Promise<boolean> {
    if (!("locks" in navigator) || navigator.locks === undefined) return Promise.resolve(true);
    return new Promise((resolve) => {
      void navigator.locks.request(autosaveLock(slot), { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise<void>((release) => {
          releaseLock = release;
        });
      });
    });
  }

  /** Offer the autosaved workspace when it holds more than an empty new one. */
  async function offerRecovery(): Promise<void> {
    let snapshot: Snapshot | null;
    try {
      snapshot = await recoverWorkspace(slot);
    } catch (error) {
      failure(error);
      return;
    }
    if (stopped || snapshot === null || snapshot.text === writeWorkspace(emptyWorkspace())) {
      return;
    }
    const workspace = readWorkspace(snapshot.text);
    if (isLoadError(workspace)) {
      warn("The autosaved workspace cannot be restored.", workspace.problems);
      return;
    }
    const when = lastChanged(workspace.journal);
    const answer = await ask(
      `Restore the unsaved workspace${when === null ? "" : ` from ${when}`}?`,
      ["Restore", "Discard"],
      "Restore",
    );
    if (stopped) return;
    if (answer === "Discard") autosave.discard();
    if (answer !== "Restore") return;
    // A restored workspace has its file's name and its path on the server or, where the
    // browser kept it, its handle: Save writes back into that file, and asks where only without one.
    const refusal = session.replace(
      workspace,
      snapshot.name,
      snapshot.handle ?? null,
      false,
      snapshot.path ?? null,
    );
    if (refusal !== null) warn("The autosaved workspace cannot be restored.", refusal.problems);
  }

  async function start(): Promise<void> {
    const claimed = await claim();
    if (stopped) {
      // A lock granted after the stop was not released with it.
      releaseLock?.();
      return;
    }
    if (!claimed) {
      warn("Autosave of this workspace is active elsewhere, so changes here are not autosaved.");
      return;
    }
    autosaving = true;
    await offerRecovery();
    if (stopped) return;
    // Changes made meanwhile; a saved workspace leaves an unanswered slot alone.
    if (session.store.view !== session.savedView) track();
  }

  function onvisibilitychange(): void {
    if (document.visibilityState === "hidden") autosave.flush().catch(failure);
  }

  const unlisten = session.listen(track);
  document.addEventListener("visibilitychange", onvisibilitychange);
  void start();

  return {
    flush: () => autosave.flush().catch(failure),
    stop() {
      if (stopped) return;
      stopped = true;
      unlisten();
      document.removeEventListener("visibilitychange", onvisibilitychange);
      releaseLock?.();
      // Nothing is shown any more, so a failure here has nowhere to go.
      autosave.flush().catch(() => {});
    },
  };
}
