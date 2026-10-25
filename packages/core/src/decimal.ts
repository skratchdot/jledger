/** Exact decimal addition. Quantities cross JSON boundaries as strings, never floats. */
function parts(value: string): [bigint, number] {
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value))
    throw new Error(`Invalid decimal: ${value}`);
  const [whole = '0', fraction = ''] = value.replace(/^\+/, '').split('.');
  return [BigInt(whole + fraction), fraction.length];
}

export function add(a: string, b: string): string {
  const [left, ls] = parts(a);
  const [right, rs] = parts(b);
  const scale = Math.max(ls, rs);
  const sum =
    left * 10n ** BigInt(scale - ls) + right * 10n ** BigInt(scale - rs);
  const digits = (sum < 0n ? -sum : sum).toString().padStart(scale + 1, '0');
  const result = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
    : digits;
  return `${sum < 0n ? '-' : ''}${result}`;
}

export function negate(value: string): string {
  return add(
    '0',
    value.startsWith('-') ? value.slice(1) : `-${value.replace(/^\+/, '')}`,
  );
}
export function isZero(value: string): boolean {
  return parts(value)[0] === 0n;
}
