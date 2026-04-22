import { dateToZdt } from './temporal.ts';
import { Frequency, type ByWeekday, type Options } from './options.ts';
import { Weekday } from './weekday.ts';

const DEFAULT_KEYS = new Set<keyof Options>([
  'freq',
  'dtstart',
  'interval',
  'wkst',
  'count',
  'until',
  'tzid',
  'bysetpos',
  'bymonth',
  'bymonthday',
  'bynmonthday',
  'byyearday',
  'byweekno',
  'byweekday',
  'bynweekday',
  'byhour',
  'byminute',
  'bysecond',
  'byeaster',
  'rscale',
  'skip',
]);

type WeekdayLike = {
  weekday: number;
  n?: number;
  toString(): string;
};

function isWeekdayLike(value: unknown): value is WeekdayLike {
  return typeof value === 'object'
    && value !== null
    && 'weekday' in value
    && Number.isInteger((value as { weekday?: unknown }).weekday)
    && typeof (value as { toString?: unknown }).toString === 'function';
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function toCompactUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

function toCompactLocal(date: Date, tzid: string) {
  return dateToZdt(date, tzid).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
}

function formatDateWithZone(date: Date, tzid?: string | null) {
  if (!tzid || tzid.toUpperCase() === 'UTC') {
    return `:${toCompactUtc(date)}`;
  }
  return `;TZID=${tzid}:${toCompactLocal(date, tzid)}`;
}

function formatUntil(date: Date, tzid?: string | null) {
  if (!tzid || tzid.toUpperCase() === 'UTC') {
    return toCompactUtc(date);
  }
  return toCompactLocal(date, tzid);
}

function formatWeekdayValue(value: ByWeekday | number[] | number): string {
  if (value instanceof Weekday || isWeekdayLike(value)) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return new Weekday(value[0]!, value[1]).toString();
  }
  if (typeof value === 'number') {
    return new Weekday(value).toString();
  }
  return String(value);
}

function formatNthWeekdayValue(value: number[]) {
  if (value.length < 2) return '';
  const weekday = value[0]!;
  const ordinal = value[1]!;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return '';
  if (!Number.isInteger(ordinal) || ordinal === 0) return '';
  const token = new Weekday(weekday).toString();
  return `${ordinal}${token}`;
}

function formatList(values: unknown[]) {
  return values.map((value) => String(value)).join(',');
}

export function optionsToString(options: Partial<Options>): string {
  const rrule: string[][] = [];
  let dtstart = '';

  for (const key of Object.keys(options) as (keyof Options)[]) {
    if (key === 'tzid' || !DEFAULT_KEYS.has(key)) continue;
    const value = options[key];
    if (!isPresent(value) || (Array.isArray(value) && !value.length)) continue;

    let partKey = key.toUpperCase();
    let outValue = '';

    switch (key) {
      case 'freq':
        outValue = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'][value as Frequency]!;
        break;
      case 'wkst':
        outValue = (value instanceof Weekday || isWeekdayLike(value))
          ? value.toString()
          : new Weekday(value as number).toString();
        break;
      case 'byweekday':
        partKey = 'BYDAY';
        outValue = (Array.isArray(value) ? value : [value])
          .map((weekday) => formatWeekdayValue(weekday as ByWeekday | number[] | number))
          .join(',');
        break;
      case 'bynweekday':
        partKey = 'BYDAY';
        outValue = (value as number[][])
          .map((entry) => formatNthWeekdayValue(entry))
          .filter(Boolean)
          .join(',');
        break;
      case 'bynmonthday':
        partKey = 'BYMONTHDAY';
        outValue = (value as number[])
          .map((monthday) => String(-Math.abs(monthday)))
          .join(',');
        break;
      case 'dtstart':
        dtstart = `DTSTART${formatDateWithZone(value as Date, options.tzid)}`;
        break;
      case 'until':
        outValue = formatUntil(value as Date, options.tzid);
        break;
      default:
        outValue = Array.isArray(value) ? formatList(value) : String(value);
        break;
    }

    if (outValue) {
      rrule.push([partKey, outValue]);
    }
  }

  const rule = rrule.map(([partKey, value]) => `${partKey}=${value}`).join(';');
  const ruleLine = rule ? `RRULE:${rule}` : '';
  return [dtstart, ruleLine].filter(Boolean).join('\n');
}
