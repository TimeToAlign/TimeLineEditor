<script lang="ts" module>
export interface Performer {
  readonly key: string;
  readonly label: string;
}

/** What the combobox gave its user, in order. */
export interface Log {
  readonly texts: string[];
  readonly picks: string[];
  readonly enters: string[];
  readonly pastes: string[];
}
</script>

<script lang="ts">
/*
 * The combobox with its snippets, which only a component can give: options
 * drawn with their label and the active flag, an optional `empty` snippet,
 * the text held through a function binding that records each text the
 * combobox writes, and every pick, Enter and paste recorded.
 */
import Combobox from "../src/combobox/Combobox.svelte";

interface Props {
  /** Holders, so that a test changes them after mounting. */
  options: { readonly value: readonly Performer[] };
  loading: { readonly value: boolean };
  log: Log;
  /** The paste handler's answer; without one, no handler. */
  consumes?: boolean;
  withEmpty?: boolean;
  labelledby?: string;
  describedby?: string;
  disabled?: boolean;
  announce?: (count: number, loading: boolean) => string;
}

let {
  options,
  loading,
  log,
  consumes,
  withEmpty = false,
  labelledby,
  describedby,
  disabled = false,
  announce,
}: Props = $props();

let text = $state("");
let combobox: ReturnType<typeof Combobox<Performer>> | undefined = $state();

/** Focus the combobox through its own `focus`. */
export function focus(): void {
  combobox?.focus();
}
</script>

{#snippet performer(item: Performer, active: boolean)}
  <span data-active={active}>{item.label}</span>
{/snippet}

{#snippet nothing(searched: string)}
  Nothing for '{searched}'
{/snippet}

<Combobox
  bind:this={combobox}
  label="Performer"
  {labelledby}
  {describedby}
  bind:text={
    () => text,
    (next) => {
      log.texts.push(next);
      text = next;
    }
  }
  options={options.value}
  keyOf={(item) => item.key}
  loading={loading.value}
  {disabled}
  option={performer}
  empty={withEmpty ? nothing : undefined}
  onpick={(item) => log.picks.push(item.label)}
  onenter={(entered) => log.enters.push(entered)}
  onpaste={consumes === undefined
    ? undefined
    : (pastedText) => {
        log.pastes.push(pastedText);
        return consumes;
      }}
  {announce}
/>
<button type="button">Elsewhere</button>
