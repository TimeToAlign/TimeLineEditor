/** Key-compatible fractional indexing with the base-62 4.0.0 format. */

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const HEADS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0] as string;

function digit(character: string): number {
  return DIGITS.indexOf(character);
}

function integerLength(head: string): number {
  const index = HEADS.indexOf(head);
  if (index < 0) throw new RangeError(`invalid index head ${head}`);
  const half = HEADS.length / 2;
  return index < half ? half - index + 1 : index - half + 2;
}

function integerPart(key: string): string {
  if (key.length === 0) throw new RangeError("an index cannot be empty");
  const length = integerLength(key[0] as string);
  if (length > key.length) throw new RangeError(`invalid index ${key}`);
  return key.slice(0, length);
}

function validateInteger(value: string): void {
  if (integerPart(value) !== value) throw new RangeError(`invalid integer part ${value}`);
  for (const character of value.slice(1)) {
    if (digit(character) < 0) throw new RangeError(`invalid index digit ${character}`);
  }
}

function smallestInteger(value: string): boolean {
  return value === `${HEADS[0]}${ZERO.repeat(HEADS.length / 2)}`;
}

function validateIndex(value: string): void {
  const integer = integerPart(value);
  validateInteger(integer);
  const fraction = value.slice(integer.length);
  for (const character of fraction) {
    if (digit(character) < 0) throw new RangeError(`invalid index digit ${character}`);
  }
  if (smallestInteger(integer) || fraction.endsWith(ZERO)) {
    throw new RangeError(`invalid index ${value}`);
  }
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new RangeError(`${a} is not below ${b}`);
  if (a.endsWith(ZERO) || b?.endsWith(ZERO)) throw new RangeError("fractional zero suffix");
  if (b !== null) {
    let common = 0;
    while ((a[common] ?? ZERO) === b[common]) common += 1;
    if (common > 0) return b.slice(0, common) + midpoint(a.slice(common), b.slice(common));
  }
  const left = a.length === 0 ? 0 : digit(a[0] as string);
  const right = b === null ? DIGITS.length : digit(b[0] as string);
  if (left < 0 || right < 0) throw new RangeError("invalid fractional digit");
  if (right - left > 1) return DIGITS[Math.round((left + right) / 2)] as string;
  if (b !== null && b.length > 1) return b[0] as string;
  return (DIGITS[left] as string) + midpoint(a.slice(1), null);
}

function increment(value: string): string | null {
  validateInteger(value);
  const head = value[0] as string;
  let trailing = "";
  for (let index = value.length - 1; index >= 1; index -= 1) {
    const next = digit(value[index] as string) + 1;
    if (next === DIGITS.length) trailing = ZERO + trailing;
    else return head + value.slice(1, index) + DIGITS[next] + trailing;
  }
  const headIndex = HEADS.indexOf(head);
  if (headIndex === HEADS.length - 1) return null;
  const nextHead = HEADS[headIndex + 1] as string;
  const delta = integerLength(nextHead) - integerLength(head);
  return nextHead + (delta > 0 ? trailing + ZERO : delta < 0 ? trailing.slice(1) : trailing);
}

function decrement(value: string): string | null {
  validateInteger(value);
  const head = value[0] as string;
  const last = DIGITS[DIGITS.length - 1] as string;
  let trailing = "";
  for (let index = value.length - 1; index >= 1; index -= 1) {
    const next = digit(value[index] as string) - 1;
    if (next < 0) trailing = last + trailing;
    else return head + value.slice(1, index) + DIGITS[next] + trailing;
  }
  const headIndex = HEADS.indexOf(head);
  if (headIndex === 0) return null;
  const nextHead = HEADS[headIndex - 1] as string;
  const delta = integerLength(nextHead) - integerLength(head);
  return nextHead + (delta > 0 ? trailing + last : delta < 0 ? trailing.slice(1) : trailing);
}

export function isIndex(text: string): boolean {
  try {
    validateIndex(text);
    return true;
  } catch {
    return false;
  }
}

export function indexBetween(a: string | null, b: string | null): string {
  if (a !== null) validateIndex(a);
  if (b !== null) validateIndex(b);
  if (a !== null && b !== null && a >= b)
    throw new RangeError("lower index must be below upper index");
  if (a === null) {
    if (b === null) return "a0";
    const integer = integerPart(b);
    const fraction = b.slice(integer.length);
    if (smallestInteger(integer)) return integer + midpoint("", fraction);
    if (integer < b) return integer;
    const prior = decrement(integer);
    if (prior === null) throw new RangeError("no index exists below the bound");
    return prior;
  }
  if (b === null) {
    const integer = integerPart(a);
    const fraction = a.slice(integer.length);
    return increment(integer) ?? integer + midpoint(fraction, null);
  }
  const leftInteger = integerPart(a);
  const leftFraction = a.slice(leftInteger.length);
  const rightInteger = integerPart(b);
  const rightFraction = b.slice(rightInteger.length);
  if (leftInteger === rightInteger) return leftInteger + midpoint(leftFraction, rightFraction);
  const next = increment(leftInteger);
  if (next !== null && next < b) return next;
  return leftInteger + midpoint(leftFraction, null);
}

export function indicesBetween(a: string | null, b: string | null, n: number): string[] {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError("index count must be a non-negative safe integer");
  if (n === 0) return [];
  if (n === 1) return [indexBetween(a, b)];
  if (b === null) {
    const result: string[] = [];
    let current = a;
    for (let index = 0; index < n; index += 1) {
      current = indexBetween(current, null);
      result.push(current);
    }
    return result;
  }
  if (a === null) {
    const result: string[] = [];
    let current = b;
    for (let index = 0; index < n; index += 1) {
      current = indexBetween(null, current);
      result.push(current);
    }
    return result.reverse();
  }
  const middle = Math.floor(n / 2);
  const current = indexBetween(a, b);
  return [
    ...indicesBetween(a, current, middle),
    current,
    ...indicesBetween(current, b, n - middle - 1),
  ];
}
