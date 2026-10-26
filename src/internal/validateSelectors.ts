import type { Options } from './options.ts';

function values<T>(value: T | T[] | null | undefined): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function validateIntegers(
  field: string,
  input: number | number[] | null | undefined,
  min: number,
  max: number,
  excludeZero = false,
) {
  for (const value of values(input)) {
    if (!Number.isInteger(value) || value < min || value > max || (excludeZero && value === 0)) {
      throw new RangeError(`Invalid ${field} value ${String(value)}: expected an integer from ${min} to ${max}${excludeZero ? ', excluding 0' : ''}`);
    }
  }
}

/** Validate supported selectors before normalization can discard a constraint. */
export function validateRuleSelectors(input: Partial<Options>): void {
  validateIntegers('BYHOUR', input.byhour, 0, 23);
  validateIntegers('BYMINUTE', input.byminute, 0, 59);
  validateIntegers('BYSECOND', input.bysecond, 0, 60);
  validateIntegers('BYMONTHDAY', input.bymonthday, -31, 31, true);
  validateIntegers('BYNMONTHDAY', input.bynmonthday, -31, 31, true);

  for (const value of values(input.bymonth)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12) continue;
    // Supported RSCALE calendars use base month codes 1..12 and leap suffixes.
    const leap = typeof value === 'string' && /^(\d{1,2})L$/i.exec(value.trim());
    if (input.rscale && leap && Number(leap[1]) >= 1 && Number(leap[1]) <= 12) continue;
    throw new RangeError(`Invalid BYMONTH value ${String(value)}: expected an integer from 1 to 12${input.rscale ? ' or a supported leap-month token' : ' (leap-month tokens require RSCALE)'}`);
  }
}
