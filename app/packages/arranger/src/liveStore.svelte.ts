/**
 * The store as Svelte state: each getter reads the store and registers the
 * reading effect or template with the store's subscription, so a component
 * re-reads after every change of the view, a level's entries or undo state,
 * or `editing`, and mirrors none of it.
 */

import type {
  Entry,
  ListedEntry,
  OpenEditor,
  Store,
  View,
  Workspace,
} from "@timetoalign/tilie-core";
import { createSubscriber } from "svelte/reactivity";

export interface LiveStore {
  readonly store: Store;
  readonly view: View;
  readonly editing: readonly OpenEditor[];
  readonly entries: readonly Entry[];
  readonly listed: readonly ListedEntry[];
  readonly journal: readonly Entry[];
  readonly sessions: Workspace["sessions"];
  readonly changes: number;
}

export function liveStore(store: Store): LiveStore {
  const subscribe = createSubscriber((update) => store.subscribe(update));
  /** `read` of the store, tracked when read inside an effect or a template. */
  const tracked = <T>(read: (store: Store) => T): T => {
    subscribe();
    return read(store);
  };
  return {
    store,
    get view() {
      return tracked((s) => s.view);
    },
    get editing() {
      return tracked((s) => s.editing);
    },
    get entries() {
      return tracked((s) => s.entries);
    },
    get listed() {
      return tracked((s) => s.listed);
    },
    get journal() {
      return tracked((s) => s.journal);
    },
    get sessions() {
      return tracked((s) => s.sessions);
    },
    get changes() {
      return tracked((s) => s.changes);
    },
  };
}
