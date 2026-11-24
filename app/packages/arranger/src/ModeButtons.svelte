<script lang="ts" module>
/** One button: the value it presses, its label, its key and what it does. */
export interface ModeEntry<Value extends string> {
  readonly value: Value;
  readonly label: string;
  /** The key choosing it; none where no key does. */
  readonly key?: string;
  readonly hint: string;
  /** Why this one button takes no press; absent where it takes one. */
  readonly refused?: string;
}
</script>

<script lang="ts" generics="Value extends string">
/*
 * A toolbar of toggle buttons, one per mode: the body of every mode menu.
 * It reads nothing of the canvas, so it is drawn on the canvas (`ModeMenu`
 * places it there) and outside it alike (the Arrange menu in the
 * inspector). What a press does is its owner's.
 */
import "./menu.css";
import { roving } from "./roving.ts";

interface Props {
  /** The toolbar's accessible name. */
  label: string;
  /** The buttons, in order. */
  entries: readonly ModeEntry<Value>[];
  /** Whether a value's button shows pressed. */
  pressed: (value: Value) => boolean;
  /** While disabled no button takes a press. */
  disabled: boolean;
  /** The prefix of each button's test ID, followed by its value. */
  testid: string;
  onpress: (value: Value) => void;
}

let { label, entries, pressed, disabled, testid, onpress }: Props = $props();

/** A button's title: its label and what it does, with its key; a refused one says why instead. */
function titleOf(entry: ModeEntry<Value>): string {
  if (entry.refused !== undefined) return `${entry.label}: ${entry.refused}`;
  return `${entry.label}: ${entry.hint}${entry.key === undefined ? "" : ` (${entry.key})`}`;
}
</script>

<div class="tilie-menu" role="toolbar" aria-label={label} {@attach roving}>
  {#each entries as entry (entry.value)}
    <button
      type="button"
      class="tilie-menu-item"
      data-testid="{testid}-{entry.value}"
      aria-pressed={pressed(entry.value)}
      title={titleOf(entry)}
      disabled={disabled || entry.refused !== undefined}
      onclick={() => onpress(entry.value)}>{entry.label}</button
    >
  {/each}
</div>
