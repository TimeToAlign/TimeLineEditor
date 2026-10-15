/** A reactive holder for one of the inspector's props, so a test can change it after mounting. */

export function holder<T>(initial: T): { value: T } {
  let value: T = $state.raw(initial);
  return {
    get value() {
      return value;
    },
    set value(next) {
      value = next;
    },
  };
}
