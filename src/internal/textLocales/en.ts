import { Frequency } from '../options.ts';
import { englishOrdinal, formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WORKWEEK_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;

function formatEnglishWallTime(hour: number, minute: number, second: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  if (second) return `${hour12}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} ${suffix}`;
  if (minute) return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
  return `${hour12} ${suffix}`;
}

function isOrdinalWeekdayPhrase(value: string) {
  return /^(?:last|\d)/i.test(value);
}

export const EN_LOCALE: ToTextLocaleDefinition = {
  intl: 'en-US',
  weekdayNames: WEEKDAY_NAMES_EN,
  monthNames: MONTH_NAMES_EN,
  conjunction: 'and',
  customSource: 'custom source',
  customSet: 'custom set',
  weekdayShortcut: 'weekday',
  everyUnit(freq: Frequency, interval: number) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'every year' : `every ${interval} years`;
      case Frequency.MONTHLY: return interval === 1 ? 'every month' : `every ${interval} months`;
      case Frequency.WEEKLY: return interval === 1 ? 'every week' : `every ${interval} weeks`;
      case Frequency.DAILY: return interval === 1 ? 'every day' : `every ${interval} days`;
      case Frequency.HOURLY: return interval === 1 ? 'every hour' : `every ${interval} hours`;
      case Frequency.MINUTELY: return interval === 1 ? 'every minute' : `every ${interval} minutes`;
      case Frequency.SECONDLY: return interval === 1 ? 'every second' : `every ${interval} seconds`;
    }
  },
  ordinalNumber: englishOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_EN[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `last ${name}`;
    return `${englishOrdinal(value.ordinal)} ${name}`;
  },
  formatWallTime: formatEnglishWallTime,
  formatDate(date: Date, tzid: string) {
    return formatLocalizedDate(date, tzid, 'en-US');
  },
  tzAbbreviation(date: Date, tzid: string) {
    return formatTzAbbreviation(date, tzid, 'en-US');
  },
  countPhrase(count: number) {
    return `${count} ${count === 1 ? 'time' : 'times'}`;
  },
  dateCountPhrase(count: number, additional: boolean) {
    const base = `${count} ${count === 1 ? 'date' : 'dates'}`;
    return additional ? `${base === '1 date' ? '1 additional date' : `${count} additional dates`}` : base;
  },
  sourceDateCountPhrase(count: number) {
    return `${count} ${count === 1 ? 'date' : 'dates'}`;
  },
  withAdditionalDates(count: number) {
    return `with ${count} ${count === 1 ? 'additional date' : 'additional dates'}`;
  },
  excludingDates(count: number) {
    return `excluding ${count} ${count === 1 ? 'date' : 'dates'}`;
  },
  excludingPhrase(value: string) {
    return `excluding ${value}`;
  },
  exceptPhrase(value: string) {
    return `except ${value}`;
  },
  weekPhrase(value: string) {
    return `in week ${value}`;
  },
  monthsPhrase(months: string) {
    return `in ${months}`;
  },
  weekdaysPhrase(weekdays: string[]) {
    const joined = joinList(weekdays, 'and', 'en-US');
    return weekdays.length > 0 && weekdays.every(isOrdinalWeekdayPhrase)
      ? `on the ${joined}`
      : `on ${joined}`;
  },
  standaloneMonthDaysPhrase(days: string[]) {
    return `on the ${joinList(days, 'and', 'en-US')}`;
  },
  monthDaysPhrase(days: string[]) {
    return `on the ${joinList(days, 'and', 'en-US')} day of the month`;
  },
  yearDaysPhrase(days: string[]) {
    return `on the ${joinList(days, 'and', 'en-US')} day of the year`;
  },
  timePhrase(times: string) {
    return `at ${times}`;
  },
  minutesPhrase(minutes: string) {
    return `at minute ${minutes}`;
  },
  secondsPhrase(seconds: string) {
    return `at second ${seconds}`;
  },
  untilPhrase(date: string) {
    return `until ${date}`;
  },
  countLimitPhrase(count: number) {
    return `for ${count} ${count === 1 ? 'time' : 'times'}`;
  },
  dtstartPhrase(date: string) {
    return `starting from ${date}`;
  },
  setPosPhrase(instances: string, count: number) {
    return `on the ${instances} ${count === 1 ? 'instance' : 'instances'}`;
  },
  weekStartsOnPhrase(weekday: string) {
    return `week starts on ${weekday}`;
  },
  rscalePhrase(rscale: string, skip?: string | null) {
    return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`;
  },
  mergeWeekdayShortcut(weekdays: string[]) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_EN].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'weekday' : null;
  },
  weekdayShortcutPhrase() {
    return 'every weekday';
  },
};
