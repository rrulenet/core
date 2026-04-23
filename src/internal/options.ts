import type { Weekday, WeekdayStr } from './weekday.ts';

/**
 * Classic query interface shared with the compat-style APIs.
 */
export interface QueryMethods {
  all(iterator?: (date: Date, index: number) => boolean): Date[];
  between(after: Date, before: Date, inc?: boolean, iterator?: (date: Date, index: number) => boolean): Date[];
  before(date: Date, inc?: boolean): Date | null;
  after(date: Date, inc?: boolean): Date | null;
}

/**
 * Classic frequency enum used by compat-style rule options.
 */
export enum Frequency {
  YEARLY = 0,
  MONTHLY = 1,
  WEEKLY = 2,
  DAILY = 3,
  HOURLY = 4,
  MINUTELY = 5,
  SECONDLY = 6,
}

/**
 * Weekday selector accepted by compat-style rule options.
 */
export type ByWeekday = WeekdayStr | number | Weekday;
/**
 * Month selector accepted by compat-style rule options.
 */
export type ByMonth = number | string;
/**
 * RFC 7529 skip behavior accepted by compat-style rule options.
 */
export type Skip = 'OMIT' | 'BACKWARD' | 'FORWARD';

/**
 * Compat-style rule option shape accepted by normalization helpers.
 */
export interface Options {
  freq: Frequency;
  dtstart: Date | null;
  interval: number;
  wkst: Weekday | number | null;
  count: number | null;
  until: Date | null;
  tzid: string | null;
  bysetpos: number | number[] | null;
  bymonth: ByMonth | ByMonth[] | null;
  bymonthday: number | number[] | null;
  bynmonthday: number[] | null;
  byyearday: number | number[] | null;
  byweekno: number | number[] | null;
  byweekday: ByWeekday | ByWeekday[] | null;
  bynweekday: number[][] | null;
  byhour: number | number[] | null;
  byminute: number | number[] | null;
  bysecond: number | number[] | null;
  byeaster: number | null;
  rscale: string | null;
  skip: Skip | null;
}
