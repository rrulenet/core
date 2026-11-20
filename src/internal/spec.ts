import { Temporal } from 'temporal-polyfill';
import type { TextMergeDescriptor, ToTextOptions } from './text.ts';
import type { CandidateBudget } from './SearchLimitError.ts';

/**
 * Supported recurrence frequencies in the low-level rule engine.
 */
export type RuleFrequency =
  | 'YEARLY'
  | 'MONTHLY'
  | 'WEEKLY'
  | 'DAILY'
  | 'HOURLY'
  | 'MINUTELY'
  | 'SECONDLY';

/**
 * Normalized weekday selector used by the low-level rule specification.
 */
export interface ByWeekdaySpec {
  weekday: number;
  ordinal?: number;
}

/**
 * Normalized month selector used by the low-level rule specification.
 */
export type ByMonthSpec = number | string;

/**
 * Engine-ready normalized recurrence rule specification.
 */
export interface RuleSpec {
  freq: RuleFrequency;
  dtstart: Temporal.ZonedDateTime;
  tzid: string;
  interval: number;
  count?: number;
  until?: Temporal.ZonedDateTime;
  wkst: number;
  bysetpos?: number[];
  bymonth?: ByMonthSpec[];
  bymonthday?: number[];
  byyearday?: number[];
  byweekno?: number[];
  byweekday?: ByWeekdaySpec[];
  byeaster?: number;
  byhour?: number[];
  byminute?: number[];
  bysecond?: number[];
  rscale?: string;
  skip?: 'OMIT' | 'BACKWARD' | 'FORWARD';
}

/** A lower boundary and optional upper boundary for ordered traversal. */
export interface QueryWindow {
  after: Temporal.Instant;
  before?: Temporal.Instant;
  inc: boolean;
}

/**
 * Query interface implemented by concrete recurrence sources.
 */
export interface SourceQuery {
  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime[];
  after(after: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null;
  before(before: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null;
  occursAt?(instant: Temporal.Instant, budget?: CandidateBudget): boolean;
  all(budget?: CandidateBudget): Temporal.ZonedDateTime[];
  iterate?(budget?: CandidateBudget): IterableIterator<Temporal.ZonedDateTime>;
  iterateWindow?(window: QueryWindow, budget?: CandidateBudget): IterableIterator<Temporal.ZonedDateTime>;
  toTextDescription?(options?: ToTextOptions): string;
  isFullyConvertibleToText?(options?: ToTextOptions): boolean;
  textMergeDescriptor?(options?: ToTextOptions): TextMergeDescriptor | null;
  isDateSource?(): boolean;
  dateCount?(): number;
}
