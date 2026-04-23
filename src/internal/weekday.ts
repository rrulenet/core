/**
 * String token form for weekdays in classic RRULE notation.
 */
export type WeekdayStr = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const ORDER: WeekdayStr[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * Compat-style weekday helper supporting ordinal forms such as `+1MO`.
 */
export class Weekday {
  constructor(
    public readonly weekday: number,
    public readonly n?: number,
  ) {
    if (n === 0) throw new Error("Can't create weekday with n == 0");
  }

  /**
   * Build a weekday instance from a weekday token.
   */
  static fromStr(str: WeekdayStr): Weekday {
    return WEEKDAY_INSTANCES[ORDER.indexOf(str)]!;
  }

  /**
   * Return the ordinal form of this weekday.
   */
  nth(n: number): Weekday {
    return this.n === n ? this : new Weekday(this.weekday, n);
  }

  /**
   * Compare two weekday values.
   */
  equals(other: Weekday): boolean {
    return this.weekday === other.weekday && this.n === other.n;
  }

  /**
   * Convert to the JavaScript weekday convention where Sunday is `0`.
   */
  getJsWeekday(): number {
    return this.weekday === 6 ? 0 : this.weekday + 1;
  }

  toString(): string {
    const token = ORDER[this.weekday]!;
    if (this.n === undefined) return token;
    return `${this.n > 0 ? '+' : ''}${this.n}${token}`;
  }
}

/**
 * Ordered weekday token list from Monday to Sunday.
 */
export const ALL_WEEKDAYS = [...ORDER];
export const WEEKDAY_INSTANCES = ORDER.map((_, index) => new Weekday(index));
