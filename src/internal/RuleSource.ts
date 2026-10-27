import { Temporal } from 'temporal-polyfill';

import type { ByMonthSpec, RuleSpec, SourceQuery } from './spec.ts';
import { compareByInstant, dedupeByInstant, dedupeSortedByInstant } from './temporal.ts';
import { RecurrenceSearchLimitError } from './SearchLimitError.ts';

const monthWeekdayCache = new WeakMap<RuleSpec, Map<string, number[][]>>();
const timePartsCache = new WeakMap<RuleSpec, { hours?: number[]; minutes?: number[]; seconds?: number[] }>();

function matchesWeekday(date: Temporal.ZonedDateTime, weekday: number): boolean {
  return date.dayOfWeek === weekday + 1;
}

function monthKey(date: Temporal.ZonedDateTime): string {
  return `${date.year}-${date.month}`;
}

function listMonthWeekdays(date: Temporal.ZonedDateTime, spec: RuleSpec, weekday: number): number[] {
  let bySpec = monthWeekdayCache.get(spec);
  if (!bySpec) {
    bySpec = new Map();
    monthWeekdayCache.set(spec, bySpec);
  }

  const key = monthKey(date);
  let byMonth = bySpec.get(key);
  if (!byMonth) {
    byMonth = Array.from({ length: 7 }, () => []);
    const monthStart = date.with({ day: 1 });
    let cursor = monthStart;
    while (cursor.month === monthStart.month) {
      byMonth[cursor.dayOfWeek - 1]!.push(cursor.day);
      cursor = cursor.add({ days: 1 });
    }
    bySpec.set(key, byMonth);
  }

  return byMonth[weekday]!;
}

function matchesByWeekday(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.byweekday?.length) return true;
  return spec.byweekday.some((entry) => {
    if (!matchesWeekday(date, entry.weekday)) return false;
    if (!entry.ordinal) return true;
    const days = listMonthWeekdays(date, spec, entry.weekday);
    const target = entry.ordinal > 0 ? days[entry.ordinal - 1] : days[days.length + entry.ordinal];
    return target === date.day;
  });
}

function listYearWeekdays(date: Temporal.ZonedDateTime, weekday: number): number[] {
  const out: number[] = [];
  let cursor = date.with({ month: 1, day: 1 });
  const year = cursor.year;

  while (cursor.year === year) {
    if (matchesWeekday(cursor, weekday)) out.push(cursor.dayOfYear);
    cursor = cursor.add({ days: 1 });
  }

  return out;
}

function matchesByWeekdayYearly(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.byweekday?.length) return true;
  return spec.byweekday.some((entry) => {
    if (!matchesWeekday(date, entry.weekday)) return false;
    if (!entry.ordinal) return true;
    const days = listYearWeekdays(date, entry.weekday);
    const target = entry.ordinal > 0 ? days[entry.ordinal - 1] : days[days.length + entry.ordinal];
    return target === date.dayOfYear;
  });
}

function matchesByMonthDay(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.bymonthday?.length) return true;
  const lastDay = date.with({ day: 1 }).add({ months: 1 }).subtract({ days: 1 }).day;
  return spec.bymonthday.some((value) => {
    const target = value > 0 ? value : lastDay + value + 1;
    return date.day === target;
  });
}

function matchesByYearDay(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.byyearday?.length) return true;
  const last = date.with({ month: 12, day: 31 }).dayOfYear;
  return spec.byyearday.some((value) => {
    const target = value > 0 ? value : last + value + 1;
    return date.dayOfYear === target;
  });
}

function rscaleCalendarId(spec: RuleSpec): string | null {
  switch (spec.rscale) {
    case 'HEBREW':
      return 'hebrew';
    case 'CHINESE':
      return 'chinese';
    case 'INDIAN':
      return 'indian';
    default:
      return null;
  }
}

function byMonthTokenMonthCode(token: ByMonthSpec): string | null {
  if (typeof token === 'number') {
    return token >= 1 && token <= 12 ? `M${String(token).padStart(2, '0')}` : null;
  }
  const match = /^(\d{1,2})L$/i.exec(token.trim());
  if (!match) return null;
  const numeric = Number(match[1]);
  if (numeric < 1 || numeric > 12) return null;
  return `M${String(numeric).padStart(2, '0')}L`;
}

function monthCodeMatchesToken(monthCode: string, token: ByMonthSpec): boolean {
  const tokenMonthCode = byMonthTokenMonthCode(token);
  return tokenMonthCode !== null && monthCode === tokenMonthCode;
}

function gregorianEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function matchesByEaster(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (spec.byeaster === undefined) return true;
  const easter = gregorianEaster(date.year);
  const base = date.with({ month: easter.month, day: easter.day });
  const target = base.add({ days: spec.byeaster });
  return date.month === target.month && date.day === target.day;
}

function weekStartFor(date: Temporal.ZonedDateTime, wkst: number): Temporal.ZonedDateTime {
  return date.subtract({ days: (date.dayOfWeek - (wkst + 1) + 7) % 7 });
}

function firstWeekStartForYear(year: number, sample: Temporal.ZonedDateTime, wkst: number): Temporal.ZonedDateTime {
  const yearAnchor = sample.with({ year, month: 1, day: 4 });
  return weekStartFor(yearAnchor, wkst);
}

function weeksInYear(year: number, sample: Temporal.ZonedDateTime, wkst: number): number {
  const first = firstWeekStartForYear(year, sample, wkst);
  const next = firstWeekStartForYear(year + 1, sample, wkst);
  return Math.round(next.since(first, { largestUnit: 'days' }).days / 7);
}

function yearlyFirstWeekStart(year: number, sample: Temporal.ZonedDateTime, wkst: number): Temporal.ZonedDateTime {
  const jan4 = sample.with({ year, month: 1, day: 4 });
  const delta = (jan4.dayOfWeek - (wkst + 1) + 7) % 7;
  return jan4.subtract({ days: delta }).with({
    hour: sample.hour,
    minute: sample.minute,
    second: sample.second,
    millisecond: sample.millisecond,
  });
}

function yearlyLastWeekCount(year: number, sample: Temporal.ZonedDateTime): number {
  const jan1 = sample.with({ year, month: 1, day: 1 });
  return jan1.dayOfWeek === 4 || (jan1.inLeapYear && jan1.dayOfWeek === 3) ? 53 : 52;
}

function weekNumber(
  date: Temporal.ZonedDateTime,
  wkst: number,
): { week: number; weekYear: number } {
  const weekStart = weekStartFor(date, wkst);
  const weekEnd = weekStart.add({ days: 6 });
  const anchorYear = weekEnd.year;
  const firstWeekStart = firstWeekStartForYear(anchorYear, date, wkst);
  const diffDays = weekStart.since(firstWeekStart, { largestUnit: 'days' }).days;

  if (diffDays < 0) {
    const previousYear = anchorYear - 1;
    return {
      week: weeksInYear(previousYear, date, wkst),
      weekYear: previousYear,
    };
  }

  const week = Math.floor(diffDays / 7) + 1;
  const maxWeeks = weeksInYear(anchorYear, date, wkst);
  if (week > maxWeeks) {
    return { week: 1, weekYear: anchorYear + 1 };
  }

  return { week, weekYear: anchorYear };
}

function matchesByWeekNo(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.byweekno?.length) return true;
  const info = weekNumber(date, spec.wkst);
  const maxWeeks = weeksInYear(info.weekYear, date, spec.wkst);
  return spec.byweekno.some((value) => {
    const target = value > 0 ? value : maxWeeks + value + 1;
    return info.week === target;
  });
}

function matchesByMonth(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.bymonth?.length) return true;
  const calendarId = rscaleCalendarId(spec);
  if (!calendarId) {
    return spec.bymonth.some((token) => typeof token === 'number' && token === date.month);
  }
  const monthCode = date.toPlainDate().withCalendar(calendarId).monthCode;
  return spec.bymonth.some((token) => monthCodeMatchesToken(monthCode, token));
}

function sortedTimeParts(spec: RuleSpec): { hours?: number[]; minutes?: number[]; seconds?: number[] } {
  let cached = timePartsCache.get(spec);
  if (cached) return cached;

  cached = {
    hours: spec.byhour ? [...spec.byhour].sort((a, b) => a - b) : undefined,
    minutes: spec.byminute ? [...spec.byminute].sort((a, b) => a - b) : undefined,
    seconds: spec.bysecond ? [...spec.bysecond].sort((a, b) => a - b) : undefined,
  };
  timePartsCache.set(spec, cached);
  return cached;
}

function expandByTime(base: Temporal.ZonedDateTime, spec: RuleSpec): Temporal.ZonedDateTime[] {
  const { hours: cachedHours, minutes: cachedMinutes, seconds: cachedSeconds } = sortedTimeParts(spec);
  const hours = cachedHours ?? [base.hour];
  const minutes = cachedMinutes ?? [base.minute];
  const seconds = cachedSeconds ?? [base.second];
  const out: Temporal.ZonedDateTime[] = [];
  for (const hour of hours) {
    for (const minute of minutes) {
      for (const second of seconds) {
        out.push(base.with({ hour, minute, second }, { offset: 'ignore', disambiguation: 'compatible' }));
      }
    }
  }
  return out;
}

function applyBySetPos(values: Temporal.ZonedDateTime[], spec: RuleSpec): Temporal.ZonedDateTime[] {
  // Positions refer to a chronological set, regardless of which selectors
  // produced a candidate (including overlapping or repeated selectors).
  const candidates = dedupeByInstant(values);
  if (!spec.bysetpos?.length) return candidates;
  const out: Temporal.ZonedDateTime[] = [];
  for (const pos of spec.bysetpos) {
    const index = pos > 0 ? pos - 1 : candidates.length + pos;
    if (index >= 0 && index < candidates.length) out.push(candidates[index]!);
  }
  return dedupeByInstant(out);
}

function matches(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  const calendarId = rscaleCalendarId(spec);
  const monthDay = spec.rscale === 'HEBREW' && spec.bymonthday?.length
    ? matchesHebrewMonthDay(date, spec) : matchesByMonthDay(date, spec);
  const yearDay = calendarId && spec.byyearday?.length
    ? matchesCalendarYearDay(date, spec, calendarId) : matchesByYearDay(date, spec);
  const weekNo = spec.rscale === 'HEBREW' && spec.freq === 'MINUTELY' && spec.interval === 1440 &&
    spec.byweekno?.length && spec.byweekday?.length
    ? matchesHebrewByWeekNoAndWeekday(date, spec) : matchesByWeekNo(date, spec);
  return (
    matchesByMonth(date, spec) &&
    monthDay && yearDay && weekNo &&
    matchesByWeekday(date, spec) &&
    matchesByEaster(date, spec)
  );
}

function emitForPeriod(periodBase: Temporal.ZonedDateTime, spec: RuleSpec): Temporal.ZonedDateTime[] {
  switch (spec.freq) {
    case 'WEEKLY': {
      const weekStart = periodBase.subtract({ days: (periodBase.dayOfWeek - (spec.wkst + 1) + 7) % 7 });
      const inferredWeekdays =
        !spec.byweekday?.length && (spec.bymonthday?.length || spec.byyearday?.length)
          ? [0, 1, 2, 3, 4, 5, 6]
          : [spec.dtstart.dayOfWeek - 1];
      const weekdays = (spec.byweekday?.length
        ? spec.byweekday.filter((w) => !w.ordinal).map((w) => w.weekday)
        : inferredWeekdays
      ).sort((a, b) => ((a - spec.wkst + 7) % 7) - ((b - spec.wkst + 7) % 7));
      const candidates = weekdays.flatMap((weekday) => {
        const day = weekStart.add({ days: (weekday - spec.wkst + 7) % 7 });
        return expandByTime(day, spec);
      });
      return applyBySetPos(candidates.filter((value) => matches(value, spec)), spec);
    }
    case 'MONTHLY': {
      const monthStart = periodBase.with({ day: 1 });
      const days = new Set<number>();
      if (spec.bymonthday?.length) {
        const lastDay = monthStart.add({ months: 1 }).subtract({ days: 1 }).day;
        for (const value of spec.bymonthday) {
          const target = value > 0 ? value : lastDay + value + 1;
          if (target >= 1 && target <= lastDay) days.add(target);
        }
      }
      if (spec.byweekday?.length) {
        for (const entry of spec.byweekday) {
          const weekdayDays = listMonthWeekdays(monthStart, spec, entry.weekday);
          if (entry.ordinal) {
            const target =
              entry.ordinal > 0
                ? weekdayDays[entry.ordinal - 1]
                : weekdayDays[weekdayDays.length + entry.ordinal];
            if (target != null) days.add(target);
          } else {
            for (const day of weekdayDays) days.add(day);
          }
        }
      }
      if (days.size === 0) days.add(spec.dtstart.day);
      const candidates = [...days].filter(day => day <= monthStart.daysInMonth).sort((a, b) => a - b).flatMap((day) => expandByTime(monthStart.with({ day }), spec));
      return applyBySetPos(candidates.filter((value) => matches(value, spec)), spec);
    }
    case 'YEARLY': {
      if (spec.byweekno?.length) {
        const lastWeek = yearlyLastWeekCount(periodBase.year, periodBase);
        const firstWeekStart = yearlyFirstWeekStart(periodBase.year, periodBase, spec.wkst);
        const weekdays = spec.byweekday?.length
          ? spec.byweekday.filter((w) => !w.ordinal).map((w) => w.weekday)
          : [spec.dtstart.dayOfWeek - 1];
        const candidates = spec.byweekno.flatMap((weekNo) => {
          if ((weekNo > 0 && weekNo > lastWeek) || (weekNo < 0 && -weekNo > lastWeek)) return [];
          const weekIndex = weekNo > 0 ? weekNo - 1 : lastWeek + weekNo;
          const weekStart = firstWeekStart.add({ weeks: weekIndex });
          return weekdays.flatMap((weekday) => {
            const day = weekStart.add({ days: (weekday - spec.wkst + 7) % 7 });
            return expandByTime(day, spec);
          });
        });
        return applyBySetPos(candidates.filter((value) => matches(value, spec)).sort(compareByInstant), spec);
      }

      if (spec.byeaster !== undefined && !spec.byyearday?.length) {
        const easter = gregorianEaster(periodBase.year);
        const target = periodBase.with({ month: easter.month, day: easter.day }).add({ days: spec.byeaster });
        const candidates = expandByTime(target, spec);
        return applyBySetPos(candidates.filter((value) => matches(value, spec)), spec);
      }

      if (!spec.byyearday?.length && !spec.byweekno?.length) {
        if (!spec.bymonth?.length && (spec.bymonthday?.length || spec.byweekday?.length)) {
          const yearStart = periodBase.with({ month: 1, day: 1 });
          const yearEnd = yearStart.add({ years: 1 }).subtract({ days: 1 });
          const days: Temporal.ZonedDateTime[] = [];
          let cursor = yearStart;

          while (Temporal.ZonedDateTime.compare(cursor, yearEnd) <= 0) {
            if (
              matchesByMonthDay(cursor, spec) &&
              matchesByWeekdayYearly(cursor, spec) &&
              matchesByEaster(cursor, spec)
            ) {
              days.push(cursor);
            }
            cursor = cursor.add({ days: 1 });
          }

          const candidates = days.flatMap((day) => expandByTime(day, spec));
          return applyBySetPos(dedupeByInstant(candidates), spec);
        }

        const months = spec.bymonth?.filter((value): value is number => typeof value === 'number').length
          ? spec.bymonth.filter((value): value is number => typeof value === 'number')
          : [spec.dtstart.month];
        const candidates = months.flatMap((month) => {
          const sample = periodBase.with({ month, day: 1 });
          // Expand every selected month before applying the yearly positions.
          return emitForPeriod(sample, { ...spec, freq: 'MONTHLY', bysetpos: undefined });
        });
        return applyBySetPos(candidates.filter((value) => matches(value, spec)), spec);
      }

      const yearStart = periodBase.with({ month: 1, day: 1 });
      const yearEnd = yearStart.add({ years: 1 }).subtract({ days: 1 });
      const days: Temporal.ZonedDateTime[] = [];
      let cursor = yearStart;

      while (Temporal.ZonedDateTime.compare(cursor, yearEnd) <= 0) {
        if (matches(cursor, spec)) days.push(cursor);
        cursor = cursor.add({ days: 1 });
      }

      const candidates = days.flatMap((day) => expandByTime(day, spec));
      return applyBySetPos(candidates.filter((value) => matches(value, spec)).sort(compareByInstant), spec);
    }
    default:
      return applyBySetPos(
        expandByTime(periodBase, spec).filter((value) => matches(value, spec)),
        spec,
      );
  }
}

function advancePeriod(current: Temporal.ZonedDateTime, spec: RuleSpec): Temporal.ZonedDateTime {
  switch (spec.freq) {
    case 'YEARLY':
      return current.add({ years: spec.interval }).with({ month: 1, day: 1 });
    case 'MONTHLY':
      return current.add({ months: spec.interval }).with({ day: 1 });
    case 'WEEKLY':
      return current.add({ weeks: spec.interval });
    case 'DAILY':
      return current.add({ days: spec.interval });
    case 'HOURLY':
      return current.add({ hours: spec.interval });
    case 'MINUTELY':
      return current.add({ minutes: spec.interval });
    case 'SECONDLY':
      return current.add({ seconds: spec.interval });
  }
}

function isOnInterval(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  switch (spec.freq) {
    case 'YEARLY':
      return (date.year - spec.dtstart.year) % spec.interval === 0;
    case 'MONTHLY': {
      const start = spec.dtstart.year * 12 + spec.dtstart.month;
      const current = date.year * 12 + date.month;
      return (current - start) % spec.interval === 0;
    }
    case 'WEEKLY': {
      const start = periodLowerBound(spec.dtstart, spec);
      const current = periodLowerBound(date, spec);
      const days = start.until(current, { largestUnit: 'days' }).days;
      return days >= 0 && days % (7 * spec.interval) === 0;
    }
    case 'DAILY': {
      const start = spec.dtstart.toPlainDate();
      const current = date.toPlainDate();
      const days = start.until(current, { largestUnit: 'days' }).days;
      return days >= 0 && days % spec.interval === 0;
    }
    case 'HOURLY': {
      const hours = spec.dtstart.until(date, { largestUnit: 'hours' }).hours;
      return hours >= 0 && hours % spec.interval === 0;
    }
    case 'MINUTELY': {
      const minutes = spec.dtstart.until(date, { largestUnit: 'minutes' }).minutes;
      return minutes >= 0 && minutes % spec.interval === 0;
    }
    case 'SECONDLY': {
      const seconds = spec.dtstart.until(date, { largestUnit: 'seconds' }).seconds;
      return seconds >= 0 && seconds % spec.interval === 0;
    }
  }
}

function hasSparseSubdailyCalendarFilters(spec: RuleSpec): boolean {
  if (!['HOURLY', 'MINUTELY', 'SECONDLY'].includes(spec.freq)) return false;
  if (spec.bysetpos?.length) return false;
  if (spec.byhour?.length || spec.byminute?.length || spec.bysecond?.length) return false;
  return Boolean(
    spec.bymonth?.length ||
      spec.bymonthday?.length ||
      spec.byyearday?.length ||
      spec.byweekno?.length ||
      spec.byweekday?.length,
  );
}

function needsWideSearch(spec: RuleSpec): boolean {
  if (!['HOURLY', 'MINUTELY', 'SECONDLY'].includes(spec.freq)) return false;
  return Boolean(
    spec.bymonth?.length ||
      spec.bymonthday?.length ||
      spec.byyearday?.length ||
      spec.byweekno?.length ||
      spec.byweekday?.length,
  );
}

function hasOnlyDtstartTimeSelectors(spec: RuleSpec): boolean {
  const hour = spec.dtstart.hour;
  const minute = spec.dtstart.minute;
  const second = spec.dtstart.second;
  return (
    (!spec.byhour?.length || (spec.byhour.length === 1 && spec.byhour[0] === hour)) &&
    (!spec.byminute?.length || (spec.byminute.length === 1 && spec.byminute[0] === minute)) &&
    (!spec.bysecond?.length || (spec.bysecond.length === 1 && spec.bysecond[0] === second))
  );
}

function hasSimpleOpenEndedCadence(spec: RuleSpec): boolean {
  if (spec.count !== undefined || spec.until) return false;
  if (spec.rscale || spec.skip || spec.byeaster !== undefined) return false;
  if (!hasOnlyDtstartTimeSelectors(spec)) return false;
  return !(
    spec.bysetpos?.length ||
    spec.bymonth?.length ||
    spec.bymonthday?.length ||
    spec.byyearday?.length ||
    spec.byweekno?.length ||
    spec.byweekday?.length
  );
}

function simpleCadenceBetween(
  spec: RuleSpec,
  after: Temporal.Instant,
  before: Temporal.Instant,
  inc: boolean,
): Temporal.ZonedDateTime[] {
  const lower = after.toZonedDateTimeISO(spec.tzid);
  const upper = before.toZonedDateTimeISO(spec.tzid);
  let step = 0;

  switch (spec.freq) {
    case 'YEARLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'years' }).years / spec.interval));
      break;
    case 'MONTHLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'months' }).months / spec.interval));
      break;
    case 'DAILY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'days' }).days / spec.interval));
      break;
    case 'WEEKLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'weeks' }).weeks / spec.interval));
      break;
    case 'HOURLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'hours' }).hours / spec.interval));
      break;
    case 'MINUTELY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'minutes' }).minutes / spec.interval));
      break;
    case 'SECONDLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'seconds' }).seconds / spec.interval));
      break;
    default:
      return [];
  }

  let cursor = spec.dtstart;
  if (step > 0) {
    switch (spec.freq) {
      case 'YEARLY':
        cursor = spec.dtstart.add({ years: spec.interval * step });
        break;
      case 'MONTHLY':
        cursor = spec.dtstart.add({ months: spec.interval * step });
        break;
      default:
        cursor = advancePeriod(spec.dtstart, { ...spec, interval: spec.interval * step });
        break;
    }
  }

  const out: Temporal.ZonedDateTime[] = [];
  while (true) {
    const instant = cursor.toInstant();
    const lowerOk = inc ? Temporal.Instant.compare(instant, after) >= 0 : Temporal.Instant.compare(instant, after) > 0;
    const upperOk = inc ? Temporal.Instant.compare(instant, before) <= 0 : Temporal.Instant.compare(instant, before) < 0;

    if (!upperOk) break;
    if (lowerOk) out.push(cursor);
    switch (spec.freq) {
      case 'YEARLY':
        cursor = cursor.add({ years: spec.interval });
        break;
      case 'MONTHLY':
        cursor = cursor.add({ months: spec.interval });
        break;
      default:
        cursor = advancePeriod(cursor, spec);
        break;
    }
  }

  return out;
}

function simpleCadenceAfter(
  spec: RuleSpec,
  after: Temporal.Instant,
  inc: boolean,
): Temporal.ZonedDateTime | null {
  const lower = after.toZonedDateTimeISO(spec.tzid);
  let step = 0;

  switch (spec.freq) {
    case 'YEARLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'years' }).years / spec.interval));
      break;
    case 'MONTHLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'months' }).months / spec.interval));
      break;
    case 'DAILY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'days' }).days / spec.interval));
      break;
    case 'WEEKLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'weeks' }).weeks / spec.interval));
      break;
    case 'HOURLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'hours' }).hours / spec.interval));
      break;
    case 'MINUTELY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'minutes' }).minutes / spec.interval));
      break;
    case 'SECONDLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'seconds' }).seconds / spec.interval));
      break;
    default:
      return null;
  }

  let cursor = spec.dtstart;
  if (step > 0) {
    switch (spec.freq) {
      case 'YEARLY':
        cursor = spec.dtstart.add({ years: spec.interval * step });
        break;
      case 'MONTHLY':
        cursor = spec.dtstart.add({ months: spec.interval * step });
        break;
      default:
        cursor = advancePeriod(spec.dtstart, { ...spec, interval: spec.interval * step });
        break;
    }
  }

  while (true) {
    const cmp = Temporal.Instant.compare(cursor.toInstant(), after);
    if (inc ? cmp >= 0 : cmp > 0) return cursor;
    switch (spec.freq) {
      case 'YEARLY':
        cursor = cursor.add({ years: spec.interval });
        break;
      case 'MONTHLY':
        cursor = cursor.add({ months: spec.interval });
        break;
      default:
        cursor = advancePeriod(cursor, spec);
        break;
    }
  }
}

function simpleCadenceBefore(
  spec: RuleSpec,
  before: Temporal.Instant,
  inc: boolean,
): Temporal.ZonedDateTime | null {
  const values = simpleCadenceBetween(
    spec,
    spec.dtstart.subtract({ seconds: 1 }).toInstant(),
    before,
    inc,
  );
  return values.length ? values[values.length - 1]! : null;
}

function hasBoundedSubdailySearchCandidate(spec: RuleSpec): boolean {
  return (
    spec.count === undefined &&
    !spec.bysetpos?.length &&
    ['HOURLY', 'MINUTELY', 'SECONDLY'].includes(spec.freq)
  );
}

function subdailyCursorNearLower(spec: RuleSpec, lower: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  let step = 0;

  switch (spec.freq) {
    case 'HOURLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'hours' }).hours / spec.interval));
      return spec.dtstart.add({ hours: spec.interval * step });
    case 'MINUTELY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'minutes' }).minutes / spec.interval));
      return spec.dtstart.add({ minutes: spec.interval * step });
    case 'SECONDLY':
      step = Math.max(0, Math.floor(spec.dtstart.until(lower, { largestUnit: 'seconds' }).seconds / spec.interval));
      return spec.dtstart.add({ seconds: spec.interval * step });
    default:
      return spec.dtstart;
  }
}

function boundedSubdailyBetween(
  spec: RuleSpec,
  after: Temporal.Instant,
  before: Temporal.Instant,
  inc: boolean,
): Temporal.ZonedDateTime[] {
  const lower = after.toZonedDateTimeISO(spec.tzid);
  const upper = before.toZonedDateTimeISO(spec.tzid);
  let cursor = subdailyCursorNearLower(spec, lower);
  const out: Temporal.ZonedDateTime[] = [];
  let safety = 0;

  while (safety < 1_000_000) {
    safety += 1;
    const candidates = subdailyCandidatesForPeriod(cursor, spec);
    let shouldStop = false;

    for (const candidate of candidates) {
      const instant = candidate.toInstant();
      const lowerOk = inc ? Temporal.Instant.compare(instant, after) >= 0 : Temporal.Instant.compare(instant, after) > 0;
      const upperOk = inc ? Temporal.Instant.compare(instant, before) <= 0 : Temporal.Instant.compare(instant, before) < 0;

      if (!upperOk && Temporal.Instant.compare(instant, before) > 0) {
        shouldStop = true;
        break;
      }
      if (
        lowerOk &&
        upperOk &&
        Temporal.ZonedDateTime.compare(candidate, spec.dtstart) >= 0 &&
        (!spec.until || Temporal.ZonedDateTime.compare(candidate, spec.until) <= 0) &&
        matches(candidate, spec) &&
        matchesTimeSelectors(candidate, spec)
      ) {
        out.push(candidate);
      }
    }

    if (shouldStop) break;
    cursor = addByFreq(cursor, spec);
  }

  return dedupeByInstant(out);
}

function matchesTimeSelectors(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  return (
    (!spec.byhour?.length || spec.byhour.includes(date.hour)) &&
    (!spec.byminute?.length || spec.byminute.includes(date.minute)) &&
    (!spec.bysecond?.length || spec.bysecond.includes(date.second))
  );
}

function subdailyCandidatesForPeriod(
  cursor: Temporal.ZonedDateTime,
  spec: RuleSpec,
): Temporal.ZonedDateTime[] {
  switch (spec.freq) {
    case 'HOURLY': {
      const minutes = spec.byminute ?? [cursor.minute];
      const seconds = spec.bysecond ?? [cursor.second];
      return minutes.flatMap((minute) => seconds.map((second) => cursor.with({ minute, second })));
    }
    case 'MINUTELY': {
      const seconds = spec.bysecond ?? [cursor.second];
      return seconds.map((second) => cursor.with({ second }));
    }
    case 'SECONDLY':
      return [cursor];
    default:
      return [cursor];
  }
}

function boundedSubdailyAfter(
  spec: RuleSpec,
  after: Temporal.Instant,
  inc: boolean,
): Temporal.ZonedDateTime | null {
  if (hasMinutelyWindowSearchCandidate(spec)) {
    return minutelyWindowAfter(spec, after, inc);
  }

  const lower = after.toZonedDateTimeISO(spec.tzid);
  let cursor = subdailyCursorNearLower(spec, lower);
  let safety = 0;

  while (safety < 1_000_000) {
    safety += 1;
    const candidates = subdailyCandidatesForPeriod(cursor, spec);
    candidates.sort(compareByInstant);

    for (const candidate of candidates) {
      const cmp = Temporal.Instant.compare(candidate.toInstant(), after);
      if (
        (inc ? cmp >= 0 : cmp > 0) &&
        Temporal.ZonedDateTime.compare(candidate, spec.dtstart) >= 0 &&
        (!spec.until || Temporal.ZonedDateTime.compare(candidate, spec.until) <= 0) &&
        matches(candidate, spec) &&
        matchesTimeSelectors(candidate, spec)
      ) {
        return candidate;
      }
      if (spec.until && Temporal.ZonedDateTime.compare(candidate, spec.until) > 0) return null;
    }

    cursor = addByFreq(cursor, spec);
  }

  return null;
}

function hasMinutelyWindowSearchCandidate(spec: RuleSpec): boolean {
  return (
    spec.freq === 'MINUTELY' &&
    spec.count === undefined &&
    !spec.bysetpos?.length &&
    Boolean(spec.byhour?.length)
  );
}

function range(end: number): number[] {
  return Array.from({ length: end }, (_, index) => index);
}

function minutelyWindowAfter(
  spec: RuleSpec,
  after: Temporal.Instant,
  inc: boolean,
): Temporal.ZonedDateTime | null {
  const lower = after.toZonedDateTimeISO(spec.tzid);
  const { hours: cachedHours, minutes: cachedMinutes, seconds: cachedSeconds } = sortedTimeParts(spec);
  const hours = cachedHours ?? range(24);
  const minutes = cachedMinutes ?? range(60);
  const seconds = cachedSeconds ?? [spec.dtstart.second];
  let day = lower.with({
    hour: 0,
    minute: 0,
    second: spec.dtstart.second,
    millisecond: spec.dtstart.millisecond,
    microsecond: spec.dtstart.microsecond,
    nanosecond: spec.dtstart.nanosecond,
  });
  let safety = 0;

  while (safety < 10_000) {
    safety += 1;

    if (!matches(day, spec)) {
      day = day.add({ days: 1 });
      continue;
    }

    for (const hour of hours) {
      for (const minute of minutes) {
        for (const second of seconds) {
          const candidate = day.with({
            hour,
            minute,
            second,
            millisecond: spec.dtstart.millisecond,
            microsecond: spec.dtstart.microsecond,
            nanosecond: spec.dtstart.nanosecond,
          });
          const cmp = Temporal.Instant.compare(candidate.toInstant(), after);

          if (spec.until && Temporal.ZonedDateTime.compare(candidate, spec.until) > 0) return null;
          if (
            (inc ? cmp >= 0 : cmp > 0) &&
            Temporal.ZonedDateTime.compare(candidate, spec.dtstart) >= 0 &&
            isOnInterval(candidate, spec) &&
            matches(candidate, spec) &&
            matchesTimeSelectors(candidate, spec)
          ) {
            return candidate;
          }
        }
      }
    }

    day = day.add({ days: 1 });
  }

  return null;
}

function periodLowerBound(cursor: Temporal.ZonedDateTime, spec: RuleSpec): Temporal.ZonedDateTime {
  switch (spec.freq) {
    case 'YEARLY':
      return cursor.with({ month: 1, day: 1 });
    case 'MONTHLY':
      return cursor.with({ day: 1 });
    case 'WEEKLY':
      return cursor.subtract({ days: (cursor.dayOfWeek - (spec.wkst + 1) + 7) % 7 });
    default:
      return cursor;
  }
}

function searchAfterByPeriod(spec: RuleSpec, after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
  let cursor = periodLowerBound(spec.dtstart, spec);
  let safety = 0;

  while (safety < 10_000) {
    safety += 1;
    const candidates = emitForPeriod(cursor, spec)
      .filter((date) => {
        const instant = date.toInstant();
        const lower = inc ? Temporal.Instant.compare(instant, after) >= 0 : Temporal.Instant.compare(instant, after) > 0;
        return lower &&
          Temporal.ZonedDateTime.compare(date, spec.dtstart) >= 0 &&
          (!spec.until || Temporal.ZonedDateTime.compare(date, spec.until) <= 0);
      })
      .sort(compareByInstant);

    if (candidates.length) return candidates[0]!;
    cursor = advancePeriod(cursor, spec);
    if (spec.until && Temporal.ZonedDateTime.compare(periodLowerBound(cursor, spec), spec.until) > 0) return null;
  }

  return null;
}

function skipMode(spec: RuleSpec): 'OMIT' | 'BACKWARD' | 'FORWARD' {
  return spec.skip ?? 'OMIT';
}

function withPreservedTime(
  base: Temporal.ZonedDateTime,
  timeSource: Temporal.ZonedDateTime,
): Temporal.ZonedDateTime {
  return base.with({
    hour: timeSource.hour,
    minute: timeSource.minute,
    second: timeSource.second,
    millisecond: timeSource.millisecond,
    microsecond: timeSource.microsecond,
    nanosecond: timeSource.nanosecond,
  }, { offset: 'ignore', disambiguation: 'compatible' });
}

function buildRscaleMonthDate(
  seed: Temporal.ZonedDateTime,
  year: number,
  monthCode: string,
  daySpecifier: number,
  spec: RuleSpec,
): Temporal.ZonedDateTime | null {
  let monthStart: Temporal.ZonedDateTime;
  try {
    monthStart = seed.with({ year, monthCode, day: 1 });
  } catch {
    return null;
  }

  if (monthStart.toPlainDate().monthCode !== monthCode) {
    const skip = skipMode(spec);
    if (skip === 'BACKWARD') {
      return monthStart.subtract({ days: 1 });
    }
    if (skip === 'FORWARD') {
      return monthStart.with({ day: 1 });
    }
    return null;
  }

  const daysInMonth = monthStart.daysInMonth;
  const requestedDay = daySpecifier > 0 ? daySpecifier : daysInMonth + daySpecifier + 1;
  if (requestedDay >= 1 && requestedDay <= daysInMonth) {
    return monthStart.with({ day: requestedDay });
  }

  const skip = skipMode(spec);
  if (skip === 'BACKWARD') {
    return monthStart.with({ day: daysInMonth });
  }
  if (skip === 'FORWARD') {
    return monthStart.add({ months: 1 }).with({ day: 1 });
  }
  return null;
}

function allCalendarRscaleYearlySimple(spec: RuleSpec, calendarId: string): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  const seed = spec.dtstart.withCalendar(calendarId);
  const seedDate = seed.toPlainDate();
  const monthCodes = spec.bymonth?.length
    ? spec.bymonth.map(byMonthTokenMonthCode).filter(Boolean) as string[]
    : [seedDate.monthCode];
  const daySpecifiers = spec.bymonthday?.length ? spec.bymonthday : [seedDate.day];
  let emitted = 0;
  let safety = 0;
  let cursor = seed;

  while (safety < 10000) {
    safety += 1;
    const targetYear = cursor.toPlainDate().year;
    const candidates = monthCodes.flatMap((monthCode) => (
      daySpecifiers
        .map((daySpecifier) => buildRscaleMonthDate(seed, targetYear, monthCode, daySpecifier, spec))
        .filter(Boolean) as Temporal.ZonedDateTime[]
    )).map((candidate) => withPreservedTime(candidate, seed));

    for (const candidate of candidates.sort(compareByInstant)) {
      if (Temporal.ZonedDateTime.compare(candidate, spec.dtstart) < 0) continue;
      if (spec.until && Temporal.ZonedDateTime.compare(candidate, spec.until) > 0) {
        return dedupeByInstant(out);
      }
      out.push(candidate);
      emitted += 1;
      if (spec.count !== undefined && emitted >= spec.count) {
        return dedupeByInstant(out);
      }
    }

    cursor = cursor.add({ years: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
    if (spec.until && Temporal.ZonedDateTime.compare(cursor, spec.until) > 0) break;
  }

  return dedupeByInstant(out);
}

function allGregorianRscaleMonthlySimple(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  const start = spec.dtstart;
  const targetDom = start.day;
  let emitted = 0;
  let safety = 0;
  let cursor = start.with({ day: 1 });

  while (safety < 10000) {
    safety += 1;

    let occ: Temporal.ZonedDateTime | null;
    const lastDay = cursor.add({ months: 1 }).subtract({ days: 1 }).day;

    if (targetDom <= lastDay) {
      occ = cursor.with({ day: targetDom });
    } else {
      const skip = skipMode(spec);
      if (skip === 'BACKWARD') {
        occ = cursor.with({ day: lastDay });
      } else if (skip === 'FORWARD') {
        occ = cursor.add({ months: 1 }).with({ day: 1 });
      } else {
        occ = null;
      }
    }

    if (occ) {
      occ = withPreservedTime(occ, start);
      if (Temporal.ZonedDateTime.compare(occ, start) >= 0) {
        if (spec.until && Temporal.ZonedDateTime.compare(occ, spec.until) > 0) break;
        out.push(occ);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) break;
      }
    }

    cursor = cursor.add({ months: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
    if (spec.until && Temporal.ZonedDateTime.compare(cursor, spec.until) > 0) break;
  }

  return dedupeByInstant(out);
}

function allGregorianRscaleYearlySimple(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  const start = spec.dtstart;
  const targetMonth = spec.bymonth?.find((value): value is number => typeof value === 'number') ?? start.month;
  const targetDom = spec.bymonthday?.[0] ?? start.day;
  let emitted = 0;
  let safety = 0;
  let year = start.year;

  while (safety < 10000) {
    safety += 1;

    const monthStart = start.with({ year, month: targetMonth, day: 1 });
    const lastDay = monthStart.add({ months: 1 }).subtract({ days: 1 }).day;

    let occ: Temporal.ZonedDateTime | null;
    if (targetDom <= lastDay) {
      occ = monthStart.with({ day: targetDom });
    } else {
      const skip = skipMode(spec);
      if (skip === 'BACKWARD') {
        occ = monthStart.with({ day: lastDay });
      } else if (skip === 'FORWARD') {
        occ = monthStart.add({ months: 1 }).with({ day: 1 });
      } else {
        occ = null;
      }
    }

    if (occ) {
      occ = withPreservedTime(occ, start);
      if (Temporal.ZonedDateTime.compare(occ, start) >= 0) {
        if (spec.until && Temporal.ZonedDateTime.compare(occ, spec.until) > 0) break;
        out.push(occ);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) break;
      }
    }

    year += spec.interval;
    if (spec.count === undefined && !spec.until && out.length > 512) break;
    if (spec.until && Temporal.ZonedDateTime.compare(start.with({ year }), spec.until) > 0) break;
  }

  return dedupeByInstant(out);
}

function allHebrewRscaleYearlySimple(spec: RuleSpec): Temporal.ZonedDateTime[] {
  return allCalendarRscaleYearlySimple(spec, 'hebrew');
}

function allHebrewRscaleYearlyByWeekNoAndWeekday(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let yearCursor = spec.dtstart.withCalendar('hebrew').with({ month: 1, day: 1 });

  while (safety < 10000) {
    safety += 1;

    const hebrewYear = yearCursor.toPlainDate().withCalendar('hebrew').year;
    let candidate = yearCursor;
    while (candidate.toPlainDate().withCalendar('hebrew').year === hebrewYear) {
      if (Temporal.ZonedDateTime.compare(candidate, spec.dtstart) >= 0 && matchesHebrewByWeekNoAndWeekday(candidate, spec)) {
        if (spec.until && Temporal.ZonedDateTime.compare(candidate, spec.until) > 0) {
          return dedupeByInstant(out);
        }
        out.push(candidate);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) {
          return dedupeByInstant(out);
        }
      }
      candidate = candidate.add({ days: 1 });
    }

    yearCursor = yearCursor.add({ years: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
    if (spec.until && Temporal.ZonedDateTime.compare(yearCursor, spec.until) > 0) break;
  }

  return dedupeByInstant(out);
}

function allHebrewRscaleMonthlySimple(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let cursor = spec.dtstart.withCalendar('hebrew');
  const seedDay = cursor.toPlainDate().day;

  while (safety < 10000) {
    safety += 1;

    const monthCode = cursor.toPlainDate().monthCode;
    if (!spec.bymonth?.length || spec.bymonth.some((token) => monthCodeMatchesToken(monthCode, token))) {
      const daySpecifiers = spec.bymonthday?.length ? spec.bymonthday : [seedDay];
      const candidates = daySpecifiers
        .map((daySpecifier) => buildRscaleMonthDate(spec.dtstart.withCalendar('hebrew'), cursor.toPlainDate().year, monthCode, daySpecifier, spec))
        .filter(Boolean) as Temporal.ZonedDateTime[];

      for (const candidate of candidates.map((value) => withPreservedTime(value, spec.dtstart.withCalendar('hebrew'))).sort(compareByInstant)) {
        if (Temporal.ZonedDateTime.compare(candidate, spec.dtstart) < 0) continue;
        if (spec.until && Temporal.ZonedDateTime.compare(candidate, spec.until) > 0) {
          return dedupeByInstant(out);
        }
        out.push(candidate);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) {
          return dedupeByInstant(out);
        }
      }
    }

    cursor = cursor.add({ months: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
    if (spec.until && Temporal.ZonedDateTime.compare(cursor, spec.until) > 0) break;
  }

  return dedupeByInstant(out);
}

function matchesHebrewMonthDay(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.bymonthday?.length) return false;
  const hebrewDate = date.toPlainDate().withCalendar('hebrew');
  return spec.bymonthday.some((value) => {
    if (value > 0) return hebrewDate.day === value;
    return hebrewDate.day === hebrewDate.daysInMonth + value + 1;
  });
}

function matchesHebrewYearDay(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.byyearday?.length) return false;
  const hebrewDate = date.toPlainDate().withCalendar('hebrew');
  return spec.byyearday.some((value) => {
    if (value > 0) return hebrewDate.dayOfYear === value;
    return hebrewDate.dayOfYear === hebrewDate.daysInYear + value + 1;
  });
}

function allHebrewRscaleDailyByMonthDay(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let cursor = spec.dtstart.withCalendar('hebrew');

  while (safety < 100000) {
    safety += 1;

    if (!spec.until || Temporal.ZonedDateTime.compare(cursor, spec.until) <= 0) {
      if (Temporal.ZonedDateTime.compare(cursor, spec.dtstart) >= 0 && matchesHebrewMonthDay(cursor, spec)) {
        out.push(cursor);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) break;
      }
    } else {
      break;
    }

    cursor = cursor.add({ days: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
  }

  return dedupeByInstant(out);
}

function matchesCalendarYearDay(
  date: Temporal.ZonedDateTime,
  spec: RuleSpec,
  calendarId: string,
): boolean {
  if (!spec.byyearday?.length) return false;
  const calendarDate = date.toPlainDate().withCalendar(calendarId);
  return spec.byyearday.some((value) => {
    if (value > 0) return calendarDate.dayOfYear === value;
    return calendarDate.dayOfYear === calendarDate.daysInYear + value + 1;
  });
}

function allCalendarRscaleDailyByYearDay(spec: RuleSpec, calendarId: string): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let cursor = spec.dtstart.withCalendar(calendarId);

  while (safety < 100000) {
    safety += 1;

    if (!spec.until || Temporal.ZonedDateTime.compare(cursor, spec.until) <= 0) {
      if (Temporal.ZonedDateTime.compare(cursor, spec.dtstart) >= 0 && matchesCalendarYearDay(cursor, spec, calendarId)) {
        out.push(cursor);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) break;
      }
    } else {
      break;
    }

    cursor = cursor.add({ days: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
  }

  return dedupeByInstant(out);
}

function allHebrewRscaleMonthlyByWeekday(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let monthCursor = spec.dtstart.withCalendar('hebrew').with({ day: 1 });

  while (safety < 10000) {
    safety += 1;

    const hebrewMonth = monthCursor.toPlainDate().withCalendar('hebrew');
    for (let day = 1; day <= hebrewMonth.daysInMonth; day += 1) {
      const candidate = monthCursor.with({ day });
      if (Temporal.ZonedDateTime.compare(candidate, spec.dtstart) < 0) continue;
      if (spec.until && Temporal.ZonedDateTime.compare(candidate, spec.until) > 0) {
        return dedupeByInstant(out);
      }
      if (matchesByWeekday(candidate, spec)) {
        out.push(candidate);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) {
          return dedupeByInstant(out);
        }
      }
    }

    monthCursor = monthCursor.add({ months: spec.interval });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
    if (spec.until && Temporal.ZonedDateTime.compare(monthCursor, spec.until) > 0) break;
  }

  return dedupeByInstant(out);
}

function addByFreq(date: Temporal.ZonedDateTime, spec: RuleSpec): Temporal.ZonedDateTime {
  switch (spec.freq) {
    case 'HOURLY':
      return date.add({ hours: spec.interval });
    case 'MINUTELY':
      return date.add({ minutes: spec.interval });
    case 'SECONDLY':
      return date.add({ seconds: spec.interval });
    default:
      return date;
  }
}

function allCalendarRscaleSubdailyByYearDay(spec: RuleSpec, calendarId: string): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let cursor = spec.dtstart;

  while (safety < 100000) {
    safety += 1;

    if (!spec.until || Temporal.ZonedDateTime.compare(cursor, spec.until) <= 0) {
      if (Temporal.ZonedDateTime.compare(cursor, spec.dtstart) >= 0 && matchesCalendarYearDay(cursor, spec, calendarId)) {
        out.push(cursor);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) break;
      }
    } else {
      break;
    }

    cursor = addByFreq(cursor, spec);
    if (spec.count === undefined && !spec.until && out.length > 512) break;
  }

  return dedupeByInstant(out);
}

function hebrewWeekIndex(
  date: Temporal.PlainDate,
  wkst: number,
): { week: number; weekYear: number } {
  const wkstDay = wkst + 1;
  const weekStart = date.subtract({ days: (date.dayOfWeek - wkstDay + 7) % 7 });
  const thursday = weekStart.add({ days: (4 - wkstDay + 7) % 7 });
  const weekYear = thursday.year;
  const jan4 = Temporal.PlainDate.from({ calendar: 'hebrew', year: weekYear, month: 1, day: 4 });
  const firstStart = jan4.subtract({ days: (jan4.dayOfWeek - wkstDay + 7) % 7 });
  return {
    week: Math.floor(date.since(firstStart).days / 7) + 1,
    weekYear,
  };
}

function matchesHebrewByWeekNoAndWeekday(date: Temporal.ZonedDateTime, spec: RuleSpec): boolean {
  if (!spec.byweekno?.length || !spec.byweekday?.length) return false;
  if (spec.byweekday.some((entry) => entry.ordinal !== undefined)) return false;
  const weekdayMatch = spec.byweekday.some((entry) => date.dayOfWeek === entry.weekday + 1);
  if (!weekdayMatch) return false;
  const hebrewDate = date.toPlainDate().withCalendar('hebrew');
  const info = hebrewWeekIndex(hebrewDate, spec.wkst);
  return spec.byweekno.includes(info.week);
}

function allHebrewRscaleDailyLikeWeekNo(spec: RuleSpec): Temporal.ZonedDateTime[] {
  const out: Temporal.ZonedDateTime[] = [];
  let emitted = 0;
  let safety = 0;
  let cursor = spec.dtstart;

  while (safety < 100000) {
    safety += 1;

    if (!spec.until || Temporal.ZonedDateTime.compare(cursor, spec.until) <= 0) {
      if (Temporal.ZonedDateTime.compare(cursor, spec.dtstart) >= 0 && matchesHebrewByWeekNoAndWeekday(cursor, spec)) {
        out.push(cursor);
        emitted += 1;
        if (spec.count !== undefined && emitted >= spec.count) break;
      }
    } else {
      break;
    }

    cursor = cursor.add({ days: 1 });
    if (spec.count === undefined && !spec.until && out.length > 512) break;
  }

  return dedupeByInstant(out);
}

export class RuleSource implements SourceQuery {
  private allCache: Temporal.ZonedDateTime[] | null = null;

  private readonly calendar: CalendarRuleSource | null;

  constructor(private readonly spec: RuleSpec) {
    // RSCALE month/year expansion keeps its dedicated invalid-date policies.
    // Its daily and subdaily clocks share the nominal local progression.
    this.calendar = spec.rscale && ['MONTHLY', 'YEARLY'].includes(spec.freq)
      ? null : new CalendarRuleSource(spec);
  }

  private allSparseSubdaily(): Temporal.ZonedDateTime[] {
    const out: Temporal.ZonedDateTime[] = [];
    let dayCursor = this.spec.dtstart.with({ hour: 0, minute: 0, second: 0 });
    let emitted = 0;
    let safety = 0;

    while (safety < 10000) {
      safety += 1;

      if (this.spec.until && Temporal.ZonedDateTime.compare(dayCursor, this.spec.until) > 0) {
        break;
      }

      if (matches(dayCursor, this.spec)) {
        let cursor = dayCursor;
        const dayEnd = dayCursor.add({ days: 1 });

        while (Temporal.ZonedDateTime.compare(cursor, dayEnd) < 0) {
          if (Temporal.ZonedDateTime.compare(cursor, this.spec.dtstart) >= 0 && matches(cursor, this.spec)) {
            if (this.spec.until && Temporal.ZonedDateTime.compare(cursor, this.spec.until) > 0) {
              return dedupeSortedByInstant(out);
            }
            out.push(cursor);
            emitted += 1;
            if (this.spec.count !== undefined && emitted >= this.spec.count) {
              return dedupeSortedByInstant(out);
            }
          }
          cursor = advancePeriod(cursor, this.spec);
        }
      }

      if (this.spec.count === undefined && !this.spec.until && out.length > 512) break;
      dayCursor = dayCursor.add({ days: 1 });
    }

    return dedupeSortedByInstant(out);
  }

  all(): Temporal.ZonedDateTime[] {
    if (this.calendar) return this.calendar.all();
    if (this.allCache) return this.allCache;
    if (this.spec.count === 0) {
      this.allCache = [];
      return this.allCache;
    }

    let result: Temporal.ZonedDateTime[];
    if (this.spec.rscale === 'GREGORIAN') {
      if (this.spec.freq === 'MONTHLY' && !this.spec.bymonthday?.length && !this.spec.byweekday?.length) {
        result = allGregorianRscaleMonthlySimple(this.spec);
        this.allCache = result;
        return result;
      }
      if (this.spec.freq === 'YEARLY') {
        result = allGregorianRscaleYearlySimple(this.spec);
        this.allCache = result;
        return result;
      }
    }

    if (this.spec.rscale === 'HEBREW' && this.spec.freq === 'YEARLY') {
      if (
        this.spec.byweekno?.length &&
        this.spec.byweekday?.length &&
        this.spec.byweekday.every((entry) => entry.ordinal === undefined)
      ) {
        result = allHebrewRscaleYearlyByWeekNoAndWeekday(this.spec);
        this.allCache = result;
        return result;
      }
      result = allHebrewRscaleYearlySimple(this.spec);
      this.allCache = result;
      return result;
    }
    if (this.spec.rscale === 'CHINESE' && this.spec.freq === 'YEARLY') {
      result = allCalendarRscaleYearlySimple(this.spec, 'chinese');
      this.allCache = result;
      return result;
    }
    if (this.spec.rscale === 'INDIAN' && this.spec.freq === 'YEARLY') {
      result = allCalendarRscaleYearlySimple(this.spec, 'indian');
      this.allCache = result;
      return result;
    }
    if (this.spec.rscale === 'HEBREW' && this.spec.freq === 'DAILY' && this.spec.bymonthday?.length) {
      result = allHebrewRscaleDailyByMonthDay(this.spec);
      this.allCache = result;
      return result;
    }
    if (
      this.spec.rscale === 'INDIAN' &&
      this.spec.freq === 'DAILY' &&
      this.spec.byyearday?.length &&
      !this.spec.bymonth?.length &&
      !this.spec.bymonthday?.length &&
      !this.spec.byweekno?.length &&
      !this.spec.byweekday?.length &&
      !this.spec.bysetpos?.length
    ) {
      result = allCalendarRscaleDailyByYearDay(this.spec, 'indian');
      this.allCache = result;
      return result;
    }
    if (this.spec.rscale === 'HEBREW' && this.spec.freq === 'MONTHLY') {
      if (
        this.spec.byweekday?.length &&
        this.spec.byweekday.every((entry) => entry.ordinal === undefined) &&
        !this.spec.bymonthday?.length &&
        !this.spec.bysetpos?.length
      ) {
        result = allHebrewRscaleMonthlyByWeekday(this.spec);
        this.allCache = result;
        return result;
      }
      result = allHebrewRscaleMonthlySimple(this.spec);
      this.allCache = result;
      return result;
    }
    if (
      ['HEBREW', 'INDIAN', 'CHINESE'].includes(this.spec.rscale ?? '') &&
      ['HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.spec.freq) &&
      this.spec.byyearday?.length &&
      !this.spec.bymonth?.length &&
      !this.spec.bymonthday?.length &&
      !this.spec.byweekno?.length &&
      !this.spec.byweekday?.length &&
      !this.spec.bysetpos?.length
    ) {
      result = allCalendarRscaleSubdailyByYearDay(this.spec, rscaleCalendarId(this.spec)!);
      this.allCache = result;
      return result;
    }
    if (
      this.spec.rscale === 'HEBREW' &&
      this.spec.freq === 'MINUTELY' &&
      this.spec.interval === 1440 &&
      this.spec.byweekno?.length &&
      this.spec.byweekday?.length
    ) {
      result = allHebrewRscaleDailyLikeWeekNo(this.spec);
      this.allCache = result;
      return result;
    }

    if (hasSparseSubdailyCalendarFilters(this.spec)) {
      result = this.allSparseSubdaily();
      this.allCache = result;
      return result;
    }

    const out: Temporal.ZonedDateTime[] = [];
    let cursor = this.spec.dtstart;
    let emitted = 0;
    let safety = 0;
    const maxIterations = needsWideSearch(this.spec) ? 1_000_000 : 10_000;

    if (this.spec.byweekno?.length && ['DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(this.spec.freq)) {
      const targetWeek = [...this.spec.byweekno].sort((a, b) => a - b)[0]!;

      for (let year = this.spec.dtstart.year; year <= this.spec.dtstart.year + 5; year += 1) {
        let date = this.spec.dtstart.with({ year, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
        while (date.year === year) {
          const candidate = withPreservedTime(date, this.spec.dtstart);
          if (matchesByWeekNo(candidate, this.spec) && matches(candidate, this.spec)) {
            if (Temporal.ZonedDateTime.compare(candidate, this.spec.dtstart) >= 0) {
              cursor = candidate;
              break;
            }
          }
          date = date.add({ days: 1 });
        }
        if (
          Temporal.ZonedDateTime.compare(cursor, this.spec.dtstart) >= 0 &&
          matchesByWeekNo(cursor, this.spec) &&
          weekNumber(cursor, this.spec.wkst).week === targetWeek
        ) {
          break;
        }
      }
    }

    while (safety < maxIterations) {
      safety += 1;
      for (const candidate of emitForPeriod(cursor, this.spec)) {
        if (Temporal.ZonedDateTime.compare(candidate, this.spec.dtstart) < 0) continue;
        if (this.spec.until && Temporal.ZonedDateTime.compare(candidate, this.spec.until) > 0) {
          result = dedupeByInstant(out);
          this.allCache = result;
          return result;
        }
        out.push(candidate);
        emitted += 1;
        if (this.spec.count !== undefined && emitted >= this.spec.count) {
          result = dedupeByInstant(out);
          this.allCache = result;
          return result;
        }
      }
      if (this.spec.count === undefined && !this.spec.until && out.length > 512) break;
      cursor = advancePeriod(cursor, this.spec);
      if (this.spec.until && Temporal.ZonedDateTime.compare(periodLowerBound(cursor, this.spec), this.spec.until) > 0) break;
    }

    result = dedupeByInstant(out);
    this.allCache = result;
    return result;
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    if (this.calendar) return this.calendar.between(after, before, inc);
    if (hasSimpleOpenEndedCadence(this.spec)) {
      return simpleCadenceBetween(this.spec, after, before, inc);
    }
    if (hasBoundedSubdailySearchCandidate(this.spec)) {
      return boundedSubdailyBetween(this.spec, after, before, inc);
    }
    return this.all().filter((date) => {
      const instant = date.toInstant();
      const lower = inc ? Temporal.Instant.compare(instant, after) >= 0 : Temporal.Instant.compare(instant, after) > 0;
      const upper = inc ? Temporal.Instant.compare(instant, before) <= 0 : Temporal.Instant.compare(instant, before) < 0;
      return lower && upper;
    });
  }

  after(after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    if (this.calendar) return this.calendar.after(after, inc);
    if (hasSimpleOpenEndedCadence(this.spec)) {
      return simpleCadenceAfter(this.spec, after, inc);
    }
    if (hasBoundedSubdailySearchCandidate(this.spec)) {
      return boundedSubdailyAfter(this.spec, after, inc);
    }
    if (this.spec.count === undefined) {
      return searchAfterByPeriod(this.spec, after, inc);
    }
    return this.all().find((date) => {
      const cmp = Temporal.Instant.compare(date.toInstant(), after);
      return inc ? cmp >= 0 : cmp > 0;
    }) ?? null;
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    if (this.calendar) return this.calendar.before(before, inc);
    if (hasSimpleOpenEndedCadence(this.spec)) {
      return simpleCadenceBefore(this.spec, before, inc);
    }
    const values = this.all().filter((date) => {
      const cmp = Temporal.Instant.compare(date.toInstant(), before);
      return inc ? cmp <= 0 : cmp < 0;
    });
    return values.length ? values[values.length - 1]! : null;
  }

  occursAt(instant: Temporal.Instant): boolean {
    if (this.calendar) return this.calendar.occursAt(instant);
    if (this.spec.count !== undefined) {
      return this.all().some((date) => Temporal.Instant.compare(date.toInstant(), instant) === 0);
    }

    const date = instant.toZonedDateTimeISO(this.spec.dtstart.timeZoneId);
    if (Temporal.ZonedDateTime.compare(date, this.spec.dtstart) < 0) return false;
    if (this.spec.until && Temporal.ZonedDateTime.compare(date, this.spec.until) > 0) return false;
    if (!isOnInterval(date, this.spec)) return false;

    return emitForPeriod(periodLowerBound(date, this.spec), this.spec)
      .some((candidate) => Temporal.Instant.compare(candidate.toInstant(), instant) === 0);
  }
}


// A UTC ZonedDateTime is used only as a nominal calendar carrier. It is never
// emitted: timezone resolution happens after nominal filtering and expansion.
function nominal(value: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
  // Rehydrate at the public boundary: callers can use a different Temporal
  // polyfill instance, whose objects are not branded by this module's runtime.
  return Temporal.PlainDateTime.from(value.toPlainDateTime().toString()).toZonedDateTime('UTC');
}

function hasReachableClock(spec: RuleSpec): boolean {
  const units = spec.freq === 'HOURLY' ? 24 : spec.freq === 'MINUTELY' ? 1440 : spec.freq === 'SECONDLY' ? 86400 : 0;
  if (!units || !Number.isSafeInteger(spec.interval)) return true;
  if (!spec.byhour?.length && (spec.freq === 'HOURLY' || !spec.byminute?.length) &&
      (spec.freq !== 'SECONDLY' || !spec.bysecond?.length)) return true;
  const scale = units / 24;
  const start = spec.dtstart.hour * scale + (scale >= 60 ? spec.dtstart.minute * (scale / 60) : 0)
    + (scale === 3600 ? spec.dtstart.second : 0);
  const step = spec.interval % units;
  let cursor = start;
  // The nominal clock repeats after at most one day's worth of distinct
  // residues. Date filters can only remove candidates from this finite set.
  do {
    const hour = Math.floor(cursor / scale);
    const minute = Math.floor(cursor / (scale === 3600 ? 60 : 1)) % 60;
    if ((!spec.byhour?.length || spec.byhour.includes(hour)) &&
        (spec.freq === 'HOURLY' || !spec.byminute?.length || spec.byminute.includes(minute)) &&
        (spec.freq !== 'SECONDLY' || !spec.bysecond?.length || spec.bysecond.includes(cursor % 60))) return true;
    cursor = (cursor + step) % units;
  } while (cursor !== start);
  return false;
}

class CalendarRuleSource implements SourceQuery {
  private readonly origin: Temporal.ZonedDateTime;
  private readonly unit: 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds';
  private readonly subdaily: boolean;
  private readonly reachableClock: boolean;
  private cache: Temporal.ZonedDateTime[] | null = null;

  constructor(private readonly spec: RuleSpec) {
    this.origin = periodLowerBound(nominal(spec.dtstart), spec);
    this.unit = ({ YEARLY: 'years', MONTHLY: 'months', WEEKLY: 'weeks', DAILY: 'days',
      HOURLY: 'hours', MINUTELY: 'minutes', SECONDLY: 'seconds' } as const)[spec.freq];
    this.subdaily = ['HOURLY', 'MINUTELY', 'SECONDLY'].includes(spec.freq);
    this.reachableClock = hasReachableClock(spec);
  }

  private at(index: number): Temporal.ZonedDateTime {
    return this.origin.add({ [this.unit]: index * this.spec.interval });
  }

  private index(value: Temporal.ZonedDateTime): number {
    const difference = this.origin.until(value, { largestUnit: this.unit });
    const amount = this.unit === 'weeks' ? difference.weeks : difference[this.unit];
    return Math.max(0, Math.floor(amount / this.spec.interval));
  }

  private floor(value: Temporal.ZonedDateTime): Temporal.ZonedDateTime {
    const zero = { millisecond: 0, microsecond: 0, nanosecond: 0 };
    if (this.spec.freq === 'SECONDLY') return value.with(zero);
    if (this.spec.freq === 'MINUTELY') return value.with({ ...zero, second: 0 });
    if (this.spec.freq === 'HOURLY') return value.with({ ...zero, minute: 0, second: 0 });
    return periodLowerBound(value, this.spec).with({ ...zero, hour: 0, minute: 0, second: 0 });
  }

  // An instant in the spring's shifted interval has an earlier nominal
  // preimage. In the second autumn passage, the whole first passage precedes it.
  private queryNominal(value: Temporal.Instant, upper: boolean): Temporal.ZonedDateTime {
    const zoned = value.toZonedDateTimeISO(this.spec.tzid);
    let result = nominal(zoned);
    const transition = zoned.add({ nanoseconds: 1 }).getTimeZoneTransition('previous');
    if (transition) {
      const shift = transition.offsetNanoseconds - transition.subtract({ nanoseconds: 1 }).offsetNanoseconds;
      const wall = nominal(transition);
      if (shift > 0 && !upper && Temporal.ZonedDateTime.compare(result, wall.add({ nanoseconds: shift })) < 0) {
        result = result.subtract({ nanoseconds: shift });
      } else if (shift < 0 && upper && Temporal.ZonedDateTime.compare(result, wall.subtract({ nanoseconds: shift })) < 0) {
        result = wall.subtract({ nanoseconds: shift });
      }
    }
    return result;
  }

  private *values(from = 0, upper?: Temporal.Instant): Generator<Temporal.ZonedDateTime> {
    if (this.spec.count === 0 || !this.reachableClock) return;
    const end = upper && this.spec.until
      ? (Temporal.Instant.compare(upper, this.spec.until.toInstant()) < 0 ? upper : this.spec.until.toInstant())
      : upper ?? this.spec.until?.toInstant();
    const nominalEnd = end ? this.queryNominal(end, true) : undefined;
    let pending: Temporal.ZonedDateTime[] = [];
    let bufferUntil: Temporal.ZonedDateTime | null = null;
    let last: bigint | null = null;
    let index = from;
    let attempts = 0;
    let skippedDays = 0;

    while (attempts++ < (needsWideSearch(this.spec) ? 1_000_000 : 10_000) || bufferUntil) {
      const cursor = this.at(index);
      const floor = this.floor(cursor);
      const done = nominalEnd && Temporal.ZonedDateTime.compare(floor, nominalEnd) > 0;
      if (pending.length && (done || !bufferUntil || Temporal.ZonedDateTime.compare(floor, bufferUntil) > 0)) {
        for (const candidate of dedupeByInstant(pending)) {
          const stamp = candidate.epochNanoseconds;
          if (stamp === last || stamp < this.spec.dtstart.epochNanoseconds || (end && stamp > end.epochNanoseconds)) continue;
          last = stamp;
          attempts = 0;
          skippedDays = 0;
          yield candidate;
        }
        pending = [];
        bufferUntil = null;
      }
      if (done) return;

      // Skip impossible calendar days without enumerating their seconds.
      if (this.subdaily && !matches(cursor, this.spec)) {
        if (++skippedDays > 10_000) throw new RecurrenceSearchLimitError();
        const nextDay = cursor.add({ days: 1 }).with({ hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
        index = Math.max(index + 1, this.index(nextDay));
        if (Temporal.ZonedDateTime.compare(this.at(index), nextDay) < 0) index++;
        continue;
      }
      if (this.subdaily) {
        const hourMismatch = this.spec.byhour?.length && !this.spec.byhour.includes(cursor.hour);
        const minuteMismatch = this.spec.freq !== 'HOURLY' && this.spec.byminute?.length && !this.spec.byminute.includes(cursor.minute);
        if (hourMismatch || minuteMismatch) {
          const next = hourMismatch
            ? cursor.add({ hours: 1 }).with({ minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
            : cursor.add({ minutes: 1 }).with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
          index = Math.max(index + 1, this.index(next));
          if (Temporal.ZonedDateTime.compare(this.at(index), next) < 0) index++;
          continue;
        }
      }
      const candidates = this.subdaily
        ? applyBySetPos(subdailyCandidatesForPeriod(cursor, this.spec).filter(value => matches(value, this.spec) && matchesTimeSelectors(value, this.spec)).sort(compareByInstant), this.spec)
        : emitForPeriod(cursor, this.spec);
      for (const candidate of candidates) {
        const resolved = candidate.toPlainDateTime().toZonedDateTime(this.spec.tzid, { disambiguation: 'compatible' });
        const resolvedWall = nominal(resolved);
        if (Temporal.ZonedDateTime.compare(resolvedWall, candidate) > 0 &&
            (!bufferUntil || Temporal.ZonedDateTime.compare(resolvedWall, bufferUntil) > 0)) {
          bufferUntil = resolvedWall;
        }
        pending.push(resolved);
      }
      index++;
    }
    throw new RecurrenceSearchLimitError();
  }

  all(): Temporal.ZonedDateTime[] {
    if (this.cache) return this.cache;
    const out: Temporal.ZonedDateTime[] = [];
    const limit = this.spec.count ?? (this.spec.until ? Infinity : 513);
    if (limit === 0) return this.cache = out;
    for (const value of this.values()) {
      out.push(value);
      if (out.length >= limit) break;
    }
    return this.cache = out;
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    if (Temporal.Instant.compare(after, before) > 0) return [];
    const values = this.spec.count !== undefined ? this.all() : this.values(this.index(this.queryNominal(after, false)), before);
    return Array.from(values).filter(value => {
      const stamp = value.epochNanoseconds;
      return (inc ? stamp >= after.epochNanoseconds : stamp > after.epochNanoseconds) &&
        (inc ? stamp <= before.epochNanoseconds : stamp < before.epochNanoseconds);
    });
  }

  after(after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    const values = this.spec.count !== undefined ? this.all() : this.values(this.index(this.queryNominal(after, false)));
    for (const value of values) {
      if (inc ? value.epochNanoseconds >= after.epochNanoseconds : value.epochNanoseconds > after.epochNanoseconds) return value;
    }
    return null;
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    if (!this.reachableClock) return null;
    if (this.spec.count !== undefined) {
      return this.all().filter(value => inc ? value.epochNanoseconds <= before.epochNanoseconds : value.epochNanoseconds < before.epochNanoseconds).at(-1) ?? null;
    }
    if (this.spec.until && before.epochNanoseconds > this.spec.until.epochNanoseconds) {
      before = this.spec.until.toInstant();
      inc = true;
    }
    const end = this.index(this.queryNominal(before, true));
    let width = 1;
    while (true) {
      const begin = Math.max(0, end - width);
      let result: Temporal.ZonedDateTime | null = null;
      for (const value of this.values(begin, before)) {
        if (inc ? value.epochNanoseconds <= before.epochNanoseconds : value.epochNanoseconds < before.epochNanoseconds) result = value;
      }
      if (result || begin === 0) {
        const zoned = before.toZonedDateTimeISO(this.spec.tzid);
        const transition = zoned.add({ nanoseconds: 1 }).getTimeZoneTransition('previous');
        if (transition) {
          const shift = transition.offsetNanoseconds - transition.subtract({ nanoseconds: 1 }).offsetNanoseconds;
          // The last shifted gap candidate can follow the last regular one.
          // Query that short nominal segment independently instead of scanning
          // from a historical transition to the boundary.
          if (shift > 0 && (!result || result.epochNanoseconds < transition.epochNanoseconds + BigInt(shift))) {
            const start = nominal(transition).subtract({ nanoseconds: shift });
            const stop = Temporal.Instant.fromEpochNanoseconds(transition.epochNanoseconds + BigInt(shift));
            const ceiling = before.epochNanoseconds < stop.epochNanoseconds ? before : stop;
            for (const value of this.values(this.index(start), ceiling)) {
              if ((inc ? value.epochNanoseconds <= before.epochNanoseconds : value.epochNanoseconds < before.epochNanoseconds) &&
                  (!result || value.epochNanoseconds > result.epochNanoseconds)) result = value;
            }
          }
        }
        return result;
      }
      width *= 2;
    }
  }

  occursAt(instant: Temporal.Instant): boolean {
    return this.after(instant, true)?.epochNanoseconds === instant.epochNanoseconds;
  }
}
