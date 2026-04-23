import { Temporal } from 'temporal-polyfill';

import { isValidDate } from './dateutil.ts';
import { Frequency, type ByMonth, type ByWeekday, type Options } from './options.ts';
import { Weekday } from './weekday.ts';
import type { ByWeekdaySpec, RuleFrequency, RuleSpec } from './spec.ts';
import { dateToZdt } from './temporal.ts';

const FREQ_MAP: Record<Frequency, RuleFrequency> = {
  [Frequency.YEARLY]: 'YEARLY',
  [Frequency.MONTHLY]: 'MONTHLY',
  [Frequency.WEEKLY]: 'WEEKLY',
  [Frequency.DAILY]: 'DAILY',
  [Frequency.HOURLY]: 'HOURLY',
  [Frequency.MINUTELY]: 'MINUTELY',
  [Frequency.SECONDLY]: 'SECONDLY',
};

type WeekdayLike = {
  weekday: number;
  n?: number;
};

function isWeekdayLike(value: unknown): value is WeekdayLike {
  return typeof value === 'object'
    && value !== null
    && 'weekday' in value
    && Number.isInteger((value as { weekday?: unknown }).weekday);
}

function asArray<T>(value: T | T[] | null): T[] | undefined {
  if (value === null || value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function filterNumberList(
  value: number | number[] | null,
  predicate: (entry: number) => boolean,
): number[] | undefined {
  return asArray(value)?.filter((entry) => Number.isInteger(entry) && predicate(entry));
}

function normalizeByMonthList(value: ByMonth | ByMonth[] | null): ByMonth[] | undefined {
  const values = asArray(value);
  if (!values) return undefined;
  const out: ByMonth[] = [];
  for (const entry of values) {
    if (typeof entry === 'number') {
      if (Number.isInteger(entry) && entry >= 1 && entry <= 12) out.push(entry);
      continue;
    }

    const token = entry.trim().toUpperCase();
    if (!/^\d+L$/.test(token)) continue;
    const numeric = Number(token.slice(0, -1));
    if (numeric >= 1 && numeric <= 12) out.push(token);
  }
  return out;
}

function normalizeWeekday(value: ByWeekday): ByWeekdaySpec | null {
  if (value instanceof Weekday || isWeekdayLike(value)) {
    if (value.weekday < 0 || value.weekday > 6 || value.n === 0) return null;
    return value.n ? { weekday: value.weekday, ordinal: value.n } : { weekday: value.weekday };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 6) return null;
    return { weekday: value };
  }
  const token = value.replace(/^([+-]?\d+)?/, '');
  const ordinalPrefix = value.slice(0, value.length - token.length);
  const weekday = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(token as never);
  if (weekday < 0) return null;
  if (ordinalPrefix && Number(ordinalPrefix) === 0) return null;
  return ordinalPrefix ? { weekday, ordinal: Number(ordinalPrefix) } : { weekday };
}

function normalizeWkst(value: Weekday | number | null): number {
  if (value instanceof Weekday || isWeekdayLike(value)) return value.weekday;
  if (typeof value === 'number') return value;
  return 0;
}

function normalizeDateLike(date: Date | null, tzid: string): Temporal.ZonedDateTime | undefined {
  if (!date) return undefined;
  return dateToZdt(date, tzid);
}

/**
 * Optional Temporal values that can be supplied directly when building a
 * normalized rule specification.
 */
export type ResolvedTemporalOptions = {
  tzid?: string;
  dtstart?: Temporal.ZonedDateTime;
  until?: Temporal.ZonedDateTime;
};

function normalizeByEaster(value: number | null): number | undefined {
  if (value === null) return undefined;
  return Number.isInteger(value) ? value : undefined;
}

/**
 * Normalize compat-style rule options and apply engine defaults.
 */
export function normalizeOptions(input: Partial<Options>): Options {
  if (input.skip && !input.rscale) {
    throw new Error('SKIP MUST NOT be present unless RSCALE is present');
  }
  if (input.dtstart !== undefined && input.dtstart !== null && !isValidDate(input.dtstart)) {
    throw new Error('Invalid dtstart');
  }
  if (input.until !== undefined && input.until !== null && !isValidDate(input.until)) {
    throw new Error('Invalid until');
  }
  if (input.interval !== undefined && (!Number.isInteger(input.interval) || input.interval <= 0)) {
    throw new Error('interval must be greater than 0');
  }
  if (input.count !== undefined && input.count !== null && (!Number.isInteger(input.count) || input.count < 0)) {
    throw new Error('count must be greater than or equal to 0');
  }
  if (asArray(input.bysetpos)?.some((value) => !Number.isInteger(value) || value === 0)) {
    throw new Error('bySetPos may not contain 0');
  }

  return {
    freq: input.freq ?? Frequency.DAILY,
    dtstart: input.dtstart ?? null,
    interval: input.interval ?? 1,
    wkst: input.wkst ?? null,
    count: input.count ?? null,
    until: input.until ?? null,
    tzid: input.tzid ?? null,
    bysetpos: input.bysetpos ?? null,
    bymonth: input.bymonth ?? null,
    bymonthday: input.bymonthday ?? null,
    bynmonthday: input.bynmonthday ?? null,
    byyearday: input.byyearday ?? null,
    byweekno: input.byweekno ?? null,
    byweekday: input.byweekday ?? null,
    bynweekday: input.bynweekday ?? null,
    byhour: input.byhour ?? null,
    byminute: input.byminute ?? null,
    bysecond: input.bysecond ?? null,
    byeaster: input.byeaster ?? null,
    rscale: input.rscale ?? null,
    skip: input.skip ?? null,
  };
}

/**
 * Build an engine-ready rule specification from normalized compat options and
 * optional pre-resolved Temporal values.
 */
export function buildRuleSpecFromResolvedTemporalOptions(
  options: Options,
  resolved: ResolvedTemporalOptions = {},
): RuleSpec {
  const tzid = resolved.tzid ?? options.tzid ?? 'UTC';
  const dtstart = resolved.dtstart ?? (options.dtstart ? dateToZdt(options.dtstart, tzid) : Temporal.Now.zonedDateTimeISO(tzid));
  const bymonthday = [
    ...(filterNumberList(options.bymonthday, (value) => (value >= 1 && value <= 31) || (value <= -1 && value >= -31)) ?? []),
    ...((options.bynmonthday ?? [])
      .filter((value) => Number.isInteger(value) && value !== 0 && Math.abs(value) <= 31)
      .map((value) => -Math.abs(value))),
  ];
  const normalizedByNWeekday = (options.bynweekday ?? [])
    .filter((value) => Array.isArray(value) && value.length >= 2)
    .map(([weekday, ordinal]) => {
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
      if (!Number.isInteger(ordinal) || ordinal === 0) return null;
      return { weekday, ordinal };
    })
    .filter(Boolean) as ByWeekdaySpec[];
  const normalizedByWeekday = asArray(options.byweekday)?.map(normalizeWeekday).filter(Boolean) as ByWeekdaySpec[] | undefined;

  return {
    freq: FREQ_MAP[options.freq],
    dtstart,
    tzid,
    interval: options.interval || 1,
    count: options.count ?? undefined,
    until: resolved.until ?? normalizeDateLike(options.until, tzid),
    wkst: normalizeWkst(options.wkst),
    bysetpos: filterNumberList(options.bysetpos, () => true),
    bymonth: normalizeByMonthList(options.bymonth)?.filter((value) => typeof value === 'number' || Boolean(options.rscale)),
    bymonthday: bymonthday.length ? bymonthday : undefined,
    byyearday: filterNumberList(options.byyearday, (value) => (value >= 1 && value <= 366) || (value <= -1 && value >= -366)),
    byweekno: filterNumberList(options.byweekno, (value) => (value >= 1 && value <= 53) || (value <= -1 && value >= -53)),
    byweekday: normalizedByWeekday || normalizedByNWeekday.length
      ? [...(normalizedByWeekday ?? []), ...normalizedByNWeekday]
      : undefined,
    byeaster: normalizeByEaster(options.byeaster),
    byhour: filterNumberList(options.byhour, (value) => value >= 0 && value <= 23),
    byminute: filterNumberList(options.byminute, (value) => value >= 0 && value <= 59),
    bysecond: filterNumberList(options.bysecond, (value) => value >= 0 && value <= 59),
    rscale: options.rscale ?? undefined,
    skip: options.skip ?? undefined,
  };
}

/**
 * Build an engine-ready rule specification from normalized compat options.
 */
export function buildRuleSpec(options: Options): RuleSpec {
  return buildRuleSpecFromResolvedTemporalOptions(options);
}
