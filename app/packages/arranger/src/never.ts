/**
 * The end of a switch over a closed union: a member the switch leaves out
 * makes `value` no `never`, so the switch fails to compile; reached at run
 * time (a value outside its type), it throws.
 */
export function assertNever(value: never): never {
  throw new TypeError(`unexpected value ${JSON.stringify(value)}`);
}
