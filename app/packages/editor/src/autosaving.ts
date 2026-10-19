/**
 * The autosave of one editor: while the editor holds its slot's Web Lock it
 * keeps the slot in step with the open workspace (`autosave.ts` writes it),
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
import { messageOf } from "./messages.ts";
import type { WorkspaceSession } from "./workspaceSession.svelte.ts";

export interface AutosavingOptions {
  /** The slot's name; the Web Lock is `tilie-autosave/<slot>`. */
  readonly slot: string;
  /** How long a change waits for a later one before it is written. */
  readonly delayMs: number;
  /** Show a dismissible message. */
  readonly say: (text: string, problems?: readonly Problem[]) => void;
  /** Ask a question with two answers: `true` for the first, `false` for the second, `null` dismissed. */
  readonly ask: (
    question: string,
    first: string,
    second: string,
    focused: "first" | "second",
  ) => Promise<boolean | null>;
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
  const { slot, delayMs, say, ask } = options;
  let failed = false;

  /** Show the first autosave failure; later ones would only repeat it. */
  function failure(error: unknown): void {
    if (failed) return;
    failed = true;
    const reason = error instanceof AutosaveError ? error.message : messageOf(error);
    say(`Autosave is not working, so unsaved changes cannot be recovered: ${reason}`);
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
    const name = session.fileName;
    autosave.schedule(() => ({ text: writeWorkspace(current.snapshot()), name }));
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
      say("The autosaved workspace cannot be restored.", workspace.problems);
      return;
    }
    const when = lastChanged(workspace.journal);
    const answer = await ask(
      `Restore the unsaved workspace${when === null ? "" : ` from ${when}`}?`,
      "Restore",
      "Discard",
      "first",
    );
    if (stopped) return;
    if (answer === false) autosave.discard();
    if (answer !== true) return;
    // A restored workspace has its file's name but no handle: its first Save asks where.
    const refusal = session.replace(workspace, snapshot.name, null, false);
    if (refusal !== null) say("The autosaved workspace cannot be restored.", refusal.problems);
  }

  async function start(): Promise<void> {
    const claimed = await claim();
    if (stopped) {
      // A lock granted after the stop was not released with it.
      releaseLock?.();
      return;
    }
    if (!claimed) {
      say("Autosave of this workspace is active elsewhere, so changes here are not autosaved.");
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
