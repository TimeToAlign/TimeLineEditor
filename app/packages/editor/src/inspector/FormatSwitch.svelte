<script lang="ts" generics="F extends string">
/**
 * The inspector's segmented format control: one radio group of formats,
 * each a segment of one bar, the chosen one filled. The Manifest and the
 * Timestamp tabs both choose their text's format with it.
 */
interface Props {
  /** The formats, in order, each with its word. */
  options: readonly { readonly value: F; readonly label: string }[];
  /** The chosen format. */
  value: F;
  /** The group's accessible name. */
  label: string;
  disabled?: boolean;
  /** The id of what describes the group (why it is disabled), if anything. */
  describedby?: string | undefined;
}

let { options, value = $bindable(), label, disabled = false, describedby }: Props = $props();

const uid = $props.id();
</script>

<div class="formats" role="radiogroup" aria-label={label} aria-describedby={describedby}>
  {#each options as option (option.value)}
    <label class={["segment", { checked: value === option.value }]}>
      <input type="radio" name="{uid}-format" value={option.value} bind:group={value} {disabled} />
      {option.label}
    </label>
  {/each}
</div>

<style>
  .formats {
    display: inline-flex;
    border: 1px solid #b0b0b0;
    border-radius: 4px;
    overflow: hidden;
  }

  .segment {
    position: relative;
    padding: 0.15rem 0.5rem;
    cursor: pointer;
  }

  .segment + .segment {
    border-left: 1px solid #b0b0b0;
  }

  .segment.checked {
    background: #1a1a1a;
    color: #fff;
  }

  /* The radio itself is invisible but stays focusable; the segment shows its state. */
  .segment input {
    position: absolute;
    opacity: 0;
    inset: 0;
    margin: 0;
    cursor: inherit;
  }

  .segment:has(input:focus-visible) {
    outline: 2px solid #0a84ff;
    outline-offset: -2px;
  }

  /* Disabled: greyed, the checked format still filled. */
  .formats:has(input:disabled),
  .formats:has(input:disabled) .segment + .segment {
    border-color: #d0d0d0;
  }

  .segment:has(input:disabled) {
    color: #595959;
    cursor: not-allowed;
  }

  .segment.checked:has(input:disabled) {
    background: #595959;
    color: #fff;
  }
</style>
