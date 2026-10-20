import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/python-sdk-signatures.json';
import {
  checkPerpPrice,
  checkSize,
  normalizeDecimal,
  parseTime,
  roundPerpPrice
} from './format';

describe('decimal wire format', () => {
  it('normalizes like the SDK float_to_wire', () => {
    expect(normalizeDecimal('82885.0', 'price')).toBe('82885');
    expect(normalizeDecimal('0.0010', 'size')).toBe('0.001');
    expect(normalizeDecimal('007.50', 'price')).toBe('7.5');
  });

  it('rejects non-decimals and zero', () => {
    expect(() => normalizeDecimal('1e-3', 'size')).toThrow(/decimal string/);
    expect(() => normalizeDecimal('-1', 'size')).toThrow(/decimal string/);
    expect(() => normalizeDecimal('0.000', 'size')).toThrow(/greater than zero/);
  });
});

describe('perp tick rules', () => {
  it('accepts prices on the grid', () => {
    expect(checkPerpPrice('82885', 5)).toBe('82885');
    expect(checkPerpPrice('123456', 5)).toBe('123456');
    expect(checkPerpPrice('3.1724', 1)).toBe('3.1724');
    expect(checkPerpPrice('0.012345', 0)).toBe('0.012345');
  });

  it('rejects too many significant figures or decimals with the nearest valid price', () => {
    expect(() => checkPerpPrice('82885.5', 5)).toThrow(/Nearest valid price: 82886/);
    expect(() => checkPerpPrice('3.17245', 1)).toThrow(
      /at most 5 significant figures and 5 decimals/
    );
    expect(() => checkPerpPrice('0.1234567', 0)).toThrow(/6 decimals/);
  });

  it('checks size steps', () => {
    expect(checkSize('0.001', 5)).toBe('0.001');
    expect(checkSize('10', 0)).toBe('10');
    expect(() => checkSize('0.5', 0)).toThrow(/more than 0 decimals/);
  });

  it('prices market orders like the SDK slippage helper', () => {
    for (let fixture of fixtures.slippagePrices) {
      let raw = fixture.mid * (fixture.isBuy ? 1 + fixture.slippage : 1 - fixture.slippage);
      expect(roundPerpPrice(raw, fixture.szDecimals)).toBe(fixture.price);
    }
  });
});

describe('time inputs', () => {
  it('accepts ISO 8601 and Unix milliseconds', () => {
    expect(parseTime('2026-10-01T00:00:00Z', 'startTime')).toBe(Date.UTC(2026, 9, 1));
    expect(parseTime('1792500000000', 'startTime')).toBe(1792500000000);
    expect(() => parseTime('yesterday', 'startTime')).toThrow(/ISO 8601/);
  });
});
