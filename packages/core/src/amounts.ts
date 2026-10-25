import { add } from './decimal.js';
import type { Amount } from './index.js';

export type DecimalMark = '.' | ',';
export interface CommodityFormat {
  decimalMark: DecimalMark;
}
export interface AmountContext {
  decimalMark?: DecimalMark;
  commodityFormats?: ReadonlyMap<string, CommodityFormat>;
}
const commodity = '[\\p{L}][\\p{L}\\p{N}._-]*|[$€£]';
const symbol = new RegExp(`^(?:${commodity})$`, 'u');
const number = '[+-]?\\d(?:[\\d.,]*\\d)?';
const symbolPrefix = new RegExp(`^([+-]?)\\s*([$€£])\\s*(${number})$`);
const namedPrefix = new RegExp(`^(${commodity})\\s+(${number})$`, 'u');
const suffix = new RegExp(`^(${number})(?:\\s+(${commodity}))?$`, 'u');

function tokens(text: string): { quantity: string; commodity: string } | null {
  const prefix = text.match(symbolPrefix);
  if (prefix) {
    if (prefix[1] && /^[+-]/.test(prefix[3]!)) return null;
    return { quantity: `${prefix[1]}${prefix[3]}`, commodity: prefix[2]! };
  }
  const named = text.match(namedPrefix);
  if (named) return { commodity: named[1]!, quantity: named[2]! };
  const end = text.match(suffix);
  return end ? { quantity: end[1]!, commodity: end[2] ?? '' } : null;
}

/** Normalize text with exact string operations, never a floating-point conversion. */
function normalize(quantity: string, decimalMark?: DecimalMark): string | null {
  if (!decimalMark)
    return /^[+-]?\d+(?:\.\d+)?$/.test(quantity) ? add('0', quantity) : null;
  const sign = /^[+-]/.test(quantity) ? quantity[0]! : '';
  const unsigned = sign ? quantity.slice(1) : quantity;
  const parts = unsigned.split(decimalMark);
  if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]!)))
    return null;
  const integer = parts[0]!;
  const group = decimalMark === '.' ? ',' : '.';
  if (integer.includes(group)) {
    const pattern =
      group === ',' ? /^\d{1,3}(?:,\d{3})+$/ : /^\d{1,3}(?:\.\d{3})+$/;
    if (!pattern.test(integer)) return null;
  } else if (!/^\d+$/.test(integer)) return null;
  return add(
    '0',
    `${sign}${integer.split(group).join('')}${parts.length === 2 ? `.${parts[1]}` : ''}`,
  );
}

/** Undeclared amounts remain strict dot decimals; explicit context permits three-digit grouping. */
export function parseAmount(
  text: string,
  context: AmountContext = {},
): Amount | null {
  const amount = tokens(text);
  if (!amount) return null;
  const mark =
    context.decimalMark ??
    context.commodityFormats?.get(amount.commodity)?.decimalMark;
  const quantity = normalize(amount.quantity, mark);
  return quantity === null ? null : { commodity: amount.commodity, quantity };
}

/** A bare commodity resets its parsing style; a numeric example declares an explicit mark. */
export function parseCommodityFormat(
  text: string,
  decimalMark?: DecimalMark,
): { commodity: string; format?: CommodityFormat } | null {
  if (symbol.test(text)) return { commodity: text };
  const sample = tokens(text);
  if (!sample?.commodity || /^[+-]/.test(sample.quantity)) return null;
  const dot = sample.quantity.lastIndexOf('.'),
    comma = sample.quantity.lastIndexOf(',');
  if (dot < 0 && comma < 0) return null;
  const mark: DecimalMark = dot > comma ? '.' : ',';
  // Do not guess when a global mark and the format example disagree.
  if (decimalMark && decimalMark !== mark) return null;
  if (normalize(sample.quantity, mark) === null) return null;
  return { commodity: sample.commodity, format: { decimalMark: mark } };
}
