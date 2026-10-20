import { createApiServiceError } from 'slates';

// Hyperliquid perp tick rules: a price may have at most 5 significant figures (integers are
// always allowed) and at most 6 - szDecimals decimals; a size may have at most szDecimals decimals.
let PERP_MAX_DECIMALS = 6;
let MAX_SIGNIFICANT_FIGURES = 5;

let invalid = (message: string) =>
  createApiServiceError(message, { reason: 'hyperliquid_invalid_order' });

// Canonical decimal string as the exchange expects it on the wire: no exponent,
// no leading zeros on the integer part, no trailing fractional zeros ("82885.0" -> "82885").
export let normalizeDecimal = (value: string, field: string) => {
  let trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw invalid(
      `${field} must be a positive decimal string such as "0.01", got "${value}".`
    );
  }
  let [integer = '0', fraction = ''] = trimmed.split('.');
  integer = integer.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  let normalized = fraction ? `${integer}.${fraction}` : integer;
  if (/^0(\.0*)?$/.test(normalized)) {
    throw invalid(`${field} must be greater than zero.`);
  }
  return normalized;
};

let decimalsOf = (normalized: string) => normalized.split('.')[1]?.length ?? 0;

let significantFigures = (normalized: string) =>
  normalized.replace('.', '').replace(/^0+/, '').length;

let toPlainString = (value: number, decimals: number) =>
  normalizeDecimal(value.toFixed(Math.max(0, decimals)), 'price');

export let roundPerpPrice = (price: number, szDecimals: number) => {
  let maxDecimals = PERP_MAX_DECIMALS - szDecimals;
  let rounded = Number(price.toPrecision(MAX_SIGNIFICANT_FIGURES));
  return toPlainString(Number(rounded.toFixed(Math.max(0, maxDecimals))), maxDecimals);
};

export let checkPerpPrice = (price: string, szDecimals: number) => {
  let normalized = normalizeDecimal(price, 'price');
  let maxDecimals = PERP_MAX_DECIMALS - szDecimals;
  let isInteger = !normalized.includes('.');
  if (
    decimalsOf(normalized) > maxDecimals ||
    (!isInteger && significantFigures(normalized) > MAX_SIGNIFICANT_FIGURES)
  ) {
    throw invalid(
      `Price ${price} is not on this market's tick grid (at most 5 significant figures and ${maxDecimals} decimals). Nearest valid price: ${roundPerpPrice(Number(normalized), szDecimals)}.`
    );
  }
  return normalized;
};

export let checkSize = (size: string, szDecimals: number) => {
  let normalized = normalizeDecimal(size, 'size');
  if (decimalsOf(normalized) > szDecimals) {
    throw invalid(
      `Size ${size} has more than ${szDecimals} decimals, the size step for this market.`
    );
  }
  return normalized;
};

export let parseTime = (value: string, field: string) => {
  let trimmed = value.trim();
  let ms = /^\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw createApiServiceError(
      `${field} must be an ISO 8601 timestamp (e.g. 2026-10-01T00:00:00Z) or Unix milliseconds.`,
      { reason: 'hyperliquid_invalid_time' }
    );
  }
  return ms;
};

export let isoTime = (ms: number) => new Date(ms).toISOString();
