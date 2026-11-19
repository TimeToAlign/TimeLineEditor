/**
 * The message bar's messages: warnings, which stay until the viewer
 * dismisses them, and information, which dismisses itself after
 * `INFO_DURATION_MS`; the one way a component below the editor posts
 * information (`inform`) or a warning (`warn`), both from the component
 * context; and the text of a failure in a message.
 */

import type { Problem } from "@timetoalign/tilie-core";
import { getContext, setContext } from "svelte";

/** A warning stays until dismissed; information dismisses itself. */
export type MessageKind = "info" | "warning";

/** One message: its kind, its text, and the reader's problems when there are any. */
export interface Message {
  readonly id: number;
  readonly kind: MessageKind;
  readonly text: string;
  readonly problems: readonly Problem[];
}

/** How long a message of kind `info` is shown. */
export const INFO_DURATION_MS = 3000;

/** The messages shown, in the order posted. */
export class Messages {
  /** The messages shown. */
  shown: readonly Message[] = $state.raw([]);
  #count = 0;
  /** The pending self-dismissals of the information shown. */
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();

  #post(kind: MessageKind, text: string, problems: readonly Problem[]): number {
    this.#count += 1;
    const id = this.#count;
    this.shown = [...this.shown, { id, kind, text, problems }];
    return id;
  }

  /** Show a warning, kept until dismissed; editing goes on. */
  warn(text: string, problems: readonly Problem[] = []): void {
    this.#post("warning", text, problems);
  }

  /** Show information, dismissed after `INFO_DURATION_MS`. */
  inform(text: string): void {
    const id = this.#post("info", text, []);
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), INFO_DURATION_MS),
    );
  }

  /** Dismiss the message `id`. */
  dismiss(id: number): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.shown = this.shown.filter((message) => message.id !== id);
  }

  /** Cancel every pending self-dismissal; the messages are not used afterwards. */
  dispose(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}

/** Post one message: information, or a warning. */
export type Inform = (text: string) => void;

const INFORM = Symbol("inform");
const WARN = Symbol("warn");

/** Give the components below the calling one `inform`; called while the component is made. */
export function provideInform(inform: Inform): void {
  setContext(INFORM, inform);
}

/** Give the components below the calling one `warn`; called while the component is made. */
export function provideWarn(warn: Inform): void {
  setContext(WARN, warn);
}

/**
 * The `inform` a component above the calling one provides; called while the
 * component is made.
 *
 * @throws {Error} if none provides one.
 */
export function informOf(): Inform {
  const inform = getContext<Inform | undefined>(INFORM);
  if (inform === undefined) throw new Error("no component above this one provides inform");
  return inform;
}

/**
 * The `warn` a component above the calling one provides; called while the
 * component is made.
 *
 * @throws {Error} if none provides one.
 */
export function warnOf(): Inform {
  const warn = getContext<Inform | undefined>(WARN);
  if (warn === undefined) throw new Error("no component above this one provides warn");
  return warn;
}

/**
 * The component context that provides `inform` and `warn` (by default the
 * same function), for a component mounted on its own (`mount`'s `context`).
 */
export function informContext(inform: Inform, warn: Inform = inform): Map<symbol, Inform> {
  return new Map([
    [INFORM, inform],
    [WARN, warn],
  ]);
}

/** The text of a failure to show the viewer: an error's message, else the value as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
