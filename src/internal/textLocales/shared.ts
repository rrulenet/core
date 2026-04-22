import { Frequency } from '../options.ts';

export type WeekdayValue = { weekday: number; ordinal?: number };

export interface ToTextLocaleDefinition {
  intl: string;
  weekdayNames: readonly string[];
  monthNames: readonly string[];
  conjunction: string;
  customSource: string;
  customSet: string;
  weekdayShortcut: string;
  everyUnit: (freq: Frequency, interval: number) => string;
  ordinalNumber: (value: number) => string;
  formatWeekday: (value: WeekdayValue) => string;
  formatWallTime: (hour: number, minute: number, second: number) => string;
  formatDate: (date: Date, tzid: string) => string;
  tzAbbreviation: (date: Date, tzid: string) => string;
  countPhrase: (count: number) => string;
  dateCountPhrase: (count: number, additional: boolean) => string;
  sourceDateCountPhrase: (count: number) => string;
  withAdditionalDates: (count: number) => string;
  excludingDates: (count: number) => string;
  excludingPhrase: (value: string) => string;
  exceptPhrase: (value: string) => string;
  weekPhrase: (value: string) => string;
  monthsPhrase: (months: string) => string;
  weekdaysPhrase: (weekdays: string[]) => string;
  standaloneMonthDaysPhrase?: (days: string[]) => string;
  monthDaysPhrase: (days: string[]) => string;
  yearDaysPhrase: (days: string[]) => string;
  timePhrase: (times: string) => string;
  minutesPhrase: (minutes: string) => string;
  secondsPhrase: (seconds: string) => string;
  untilPhrase: (date: string) => string;
  countLimitPhrase: (count: number) => string;
  dtstartPhrase: (date: string) => string;
  setPosPhrase: (instances: string, count: number) => string;
  weekStartsOnPhrase: (weekday: string) => string;
  rscalePhrase: (rscale: string, skip?: string | null) => string;
  mergeWeekdayShortcut: (weekdays: string[]) => string | null;
  weekdayShortcutPhrase?: () => string;
}

export interface ToTextOptions {
  includeDtstart?: boolean;
  excludeTzAbbreviation?: boolean;
  locale?: string;
}

export type ResolvedTextLocale = ToTextLocaleDefinition & {
  code: string;
};

export function joinList(parts: string[], conjunction: string, locale?: string) {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (locale) {
    try {
      return new Intl.ListFormat(locale, {
        style: 'long',
        type: 'conjunction',
      }).format(parts);
    } catch {
      // Fall through to deterministic manual formatting if Intl.ListFormat is unavailable.
    }
  }
  if (parts.length === 2) return `${parts[0]} ${conjunction} ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}

export function formatLocalizedDate(date: Date, tzid: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tzid,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatTzAbbreviation(date: Date, tzid: string, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: tzid,
    hour: 'numeric',
    timeZoneName: 'short',
  }).formatToParts(date);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? tzid;
}

export function englishOrdinal(value: number): string {
  if (value < 0) {
    if (value === -1) return 'last';
    return `${englishOrdinal(Math.abs(value))} last`;
  }
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

export function frenchOrdinal(value: number): string {
  if (value < 0) {
    if (value === -1) return 'dernier';
    return `${frenchOrdinal(Math.abs(value))} dernier`;
  }
  if (value === 1) return '1er';
  return `${value}e`;
}
