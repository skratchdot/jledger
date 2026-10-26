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
// No escaping or parser delimiters in this read-only quoted-name subset.
const quotedCommodity = '"[^"\\\\;=\\p{C}]+"';
const quotedSymbol = new RegExp(`^${quotedCommodity}$`, 'u');
const quotedPrefix = new RegExp(
  `^([+-]?)\\s*(${quotedCommodity})\\s*(${number})$`,
  'u',
);
const quotedSuffix = new RegExp(`^(${number})\\s*(${quotedCommodity})$`, 'u');
function quotedName(text: string): string | null {
  return quotedSymbol.test(text) && text.slice(1, -1).trim()
    ? text.slice(1, -1)
    : null;
}

/** Canonical display distinguishes literal names from amounts and syntax. */
export function formatCommodityName(text: string): string {
  return !text || symbol.test(text) ? text : JSON.stringify(text);
}

const symbolPrefix = new RegExp(`^([+-]?)\\s*([$€£])\\s*(${number})$`);
const namedPrefix = new RegExp(`^(${commodity})\\s+(${number})$`, 'u');
const suffix = new RegExp(`^(${number})(?:\\s+(${commodity}))?$`, 'u');

function tokens(text: string): { quantity: string; commodity: string } | null {
  const quoted = text.match(quotedPrefix);
  if (quoted) {
    if (quoted[1] && /^[+-]/.test(quoted[3]!)) return null;
    const name = quotedName(quoted[2]!);
    return name === null
      ? null
      : { commodity: name, quantity: `${quoted[1]}${quoted[3]}` };
  }
  const quotedEnd = text.match(quotedSuffix);
  if (quotedEnd) {
    const name = quotedName(quotedEnd[2]!);
    return name === null ? null : { commodity: name, quantity: quotedEnd[1]! };
  }
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
  const name = quotedName(text);
  if (name !== null) return { commodity: name };
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
