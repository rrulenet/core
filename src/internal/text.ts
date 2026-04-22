import { Temporal } from 'temporal-polyfill';

import type { ByWeekday, Options } from './options.ts';
import { Frequency } from './options.ts';
import { Weekday } from './weekday.ts';
import type { SetExpression } from './SetEngine.ts';
import { resolveLocale } from './textLocales/registry.ts';
import { joinList, type ResolvedTextLocale, type ToTextOptions, type WeekdayValue } from './textLocales/shared.ts';

const WEEKDAY_TOKENS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
const WORKWEEK = ['MO', 'TU', 'WE', 'TH', 'FR'] as const;
const ALL_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

type WeekdayLike = {
  weekday: number;
  n?: number;
  toString(): string;
};

type TextAnalysis = { text: string; fullyConvertible: boolean };
type RenderContext = 'standalone' | 'include' | 'exclude';

function isWeekdayLike(value: unknown): value is WeekdayLike {
  return typeof value === 'object'
    && value !== null
    && 'weekday' in value
    && Number.isInteger((value as { weekday?: unknown }).weekday)
    && typeof (value as { toString?: unknown }).toString === 'function';
}

export interface TextMergeDescriptor {
  key: string;
  weekdays: string[];
  render: (weekdays: string[]) => string;
}

export type { ToTextLocaleDefinition, ToTextOptions } from './textLocales/shared.ts';
export { getToTextLocale, listToTextLocales, registerToTextLocale } from './textLocales/registry.ts';

function asArray<T>(value: T | T[] | null): T[] {
  if (value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseWeekday(value: ByWeekday): WeekdayValue | null {
  if (value instanceof Weekday || isWeekdayLike(value)) {
    if (value.weekday < 0 || value.weekday > 6 || value.n === 0) return null;
    return value.n ? { weekday: value.weekday, ordinal: value.n } : { weekday: value.weekday };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 6) return null;
    return { weekday: value };
  }

  const match = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/.exec(value);
  if (!match) return null;
  const weekday = WEEKDAY_TOKENS.indexOf(match[2] as (typeof WEEKDAY_TOKENS)[number]);
  if (weekday < 0) return null;
  const ordinal = match[1] ? Number(match[1]) : undefined;
  if (ordinal === 0) return null;
  return ordinal ? { weekday, ordinal } : { weekday };
}

function getTzid(options: Options) {
  return options.tzid ?? 'UTC';
}

function toZdt(date: Date, tzid: string) {
  return Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO(tzid);
}

function dtstartZdt(options: Options) {
  if (!options.dtstart) return null;
  return toZdt(options.dtstart, getTzid(options));
}

function weekdayTokenFromOptions(options: Options) {
  const zdt = dtstartZdt(options);
  return zdt ? WEEKDAY_TOKENS[zdt.dayOfWeek - 1]! : null;
}

function weekdayIndexFromOptions(options: Options) {
  const token = weekdayTokenFromOptions(options);
  return token ? WEEKDAY_TOKENS.indexOf(token) : null;
}

function isWeekdayShortcut(weekdays: WeekdayValue[]) {
  return weekdays.length === WORKWEEK.length
    && WORKWEEK.every((token, index) => weekdays[index]?.weekday === WEEKDAY_TOKENS.indexOf(token));
}

function isEverydayShortcut(weekdays: WeekdayValue[]) {
  return weekdays.length === ALL_DAYS.length
    && ALL_DAYS.every((token, index) => weekdays[index]?.weekday === WEEKDAY_TOKENS.indexOf(token));
}

function buildDisplayedTimes(options: Options, locale: ResolvedTextLocale) {
  const start = dtstartZdt(options);
  const startHour = start?.hour ?? 0;
  const startMinute = start?.minute ?? 0;
  const startSecond = start?.second ?? 0;
  const dayOrLarger = options.freq <= Frequency.DAILY;
  const hasExplicitTime = options.byhour !== null || options.byminute !== null || options.bysecond !== null;
  const startHasTime = startHour !== 0 || startMinute !== 0 || startSecond !== 0;
  const shouldDefaultTime = dayOrLarger && (hasExplicitTime || startHasTime);

  const hours = options.byhour !== null ? asArray(options.byhour) : (shouldDefaultTime ? [startHour] : []);
  const minutes = hours.length
    ? (options.byminute !== null ? asArray(options.byminute) : [startMinute])
    : asArray(options.byminute);
  const seconds = hours.length
    ? (options.bysecond !== null ? asArray(options.bysecond) : [startSecond])
    : (minutes.length ? asArray(options.bysecond) : asArray(options.bysecond));

  if (hours.length) {
    const resolvedMinutes = minutes.length ? minutes : [0];
    const resolvedSeconds = seconds.length ? seconds : [0];
    return {
      kind: 'times' as const,
      values: hours.flatMap((hour) => resolvedMinutes.flatMap((minute) => resolvedSeconds.map((second) => locale.formatWallTime(hour, minute, second)))),
    };
  }
  if (minutes.length) {
    return { kind: 'minutes' as const, values: minutes.map(String) };
  }
  if (seconds.length) {
    return { kind: 'seconds' as const, values: seconds.map(String) };
  }
  return { kind: 'none' as const, values: [] };
}

function analyzeOptions(options: Options, textOptions: ToTextOptions = {}): TextAnalysis {
  const locale = resolveLocale(textOptions);
  const tzid = getTzid(options);
  const weekdayValues = asArray(options.byweekday).map(parseWeekday).filter(Boolean) as WeekdayValue[];
  const hasExplicitDateSelectors = asArray(options.bymonthday).length > 0
    || asArray(options.bymonth).length > 0
    || asArray(options.byyearday).length > 0
    || asArray(options.byweekno).length > 0;
  const weekdays = options.freq === Frequency.WEEKLY
    && weekdayValues.length === 0
    && !hasExplicitDateSelectors
    && weekdayIndexFromOptions(options) !== null
    ? [{ weekday: weekdayIndexFromOptions(options)! }]
    : weekdayValues;
  const weeklyWeekdayShortcut = options.freq === Frequency.WEEKLY
    && options.interval === 1
    && weekdays.length > 0
    && isWeekdayShortcut(weekdays)
    && weekdays.every((value) => value.ordinal === undefined);
  const weeklyEverydayShortcut = options.freq === Frequency.WEEKLY
    && options.interval === 1
    && weekdays.length > 0
    && isEverydayShortcut(weekdays)
    && weekdays.every((value) => value.ordinal === undefined);
  const parts: string[] = [weeklyWeekdayShortcut
    ? (locale.weekdayShortcutPhrase?.() ?? `${locale.everyUnit(Frequency.DAILY, 1)} ${locale.weekdayShortcut}`)
    : weeklyEverydayShortcut
      ? locale.everyUnit(Frequency.DAILY, 1)
      : locale.everyUnit(options.freq, options.interval)];
  let fullyConvertible = true;
  const monthdays = asArray(options.bymonthday);
  const months = asArray(options.bymonth);
  const byyearday = asArray(options.byyearday);
  const byweekno = asArray(options.byweekno);
  const bysetpos = asArray(options.bysetpos);
  const displayedTime = buildDisplayedTimes(options, locale);

  if (weekdays.length && !(options.freq === Frequency.WEEKLY && isWeekdayShortcut(weekdays) && options.interval === 1) && !(options.freq === Frequency.WEEKLY && isEverydayShortcut(weekdays) && options.interval === 1)) {
    parts.push(locale.weekdaysPhrase(weekdays.map((value) => locale.formatWeekday(value))));
  }

  if (months.length) {
    parts.push(locale.monthsPhrase(joinList(months.map((month) => (
      typeof month === 'number' ? (locale.monthNames[month - 1] ?? String(month)) : String(month)
    )), locale.conjunction, locale.intl)));
  }

  if (monthdays.length) {
    const renderedDays = monthdays.map((value) => locale.ordinalNumber(value));
    if ((options.freq === Frequency.MONTHLY || options.freq === Frequency.WEEKLY) && months.length === 0 && locale.standaloneMonthDaysPhrase) {
      parts.push(locale.standaloneMonthDaysPhrase(renderedDays));
    } else {
      parts.push(locale.monthDaysPhrase(renderedDays));
    }
  }

  if (byyearday.length) {
    parts.push(locale.yearDaysPhrase(byyearday.map((value) => locale.ordinalNumber(value))));
  }

  if (byweekno.length) {
    parts.push(locale.weekPhrase(joinList(byweekno.map(String), locale.conjunction, locale.intl)));
  }

  if (displayedTime.kind === 'times' && displayedTime.values.length) {
    parts.push(locale.timePhrase(joinList(displayedTime.values, locale.conjunction, locale.intl)));
    if (!textOptions.excludeTzAbbreviation && options.dtstart) {
      parts.push(locale.tzAbbreviation(options.dtstart, tzid));
    }
  } else if (displayedTime.kind === 'minutes' && displayedTime.values.length) {
    parts.push(locale.minutesPhrase(joinList(displayedTime.values, locale.conjunction, locale.intl)));
  } else if (displayedTime.kind === 'seconds' && displayedTime.values.length) {
    parts.push(locale.secondsPhrase(joinList(displayedTime.values, locale.conjunction, locale.intl)));
  }

  if (options.until) {
    parts.push(locale.untilPhrase(locale.formatDate(options.until, tzid)));
  } else if (options.count !== null) {
    parts.push(locale.countLimitPhrase(options.count));
  }

  if (textOptions.includeDtstart && options.dtstart) {
    parts.push(locale.dtstartPhrase(locale.formatDate(options.dtstart, tzid)));
  }

  if (bysetpos.length) {
    parts.push(locale.setPosPhrase(joinList(bysetpos.map((value) => locale.ordinalNumber(value)), locale.conjunction, locale.intl), bysetpos.length));
  }

  if (options.wkst instanceof Weekday || isWeekdayLike(options.wkst)) {
    parts.push(locale.weekStartsOnPhrase(locale.weekdayNames[options.wkst.weekday]!));
  } else if (typeof options.wkst === 'number') {
    parts.push(locale.weekStartsOnPhrase(locale.weekdayNames[options.wkst]!));
  }

  if (options.rscale) {
    parts.push(locale.rscalePhrase(options.rscale, options.skip));
    fullyConvertible = false;
  }

  if (options.byeaster !== null || options.bynmonthday !== null || options.bynweekday !== null) {
    fullyConvertible = false;
  }

  return {
    text: parts.join(' '),
    fullyConvertible,
  };
}

function describeRuleBaseWithoutWeekdays(options: Options, textOptions: ToTextOptions = {}) {
  const locale = resolveLocale(textOptions);
  const tzid = getTzid(options);
  const parts: string[] = [locale.everyUnit(options.freq, options.interval)];
  const displayedTime = buildDisplayedTimes(options, locale);

  if (displayedTime.kind === 'times' && displayedTime.values.length) {
    parts.push(locale.timePhrase(joinList(displayedTime.values, locale.conjunction, locale.intl)));
    if (!textOptions.excludeTzAbbreviation && options.dtstart) {
      parts.push(locale.tzAbbreviation(options.dtstart, tzid));
    }
  }

  if (options.until) {
    parts.push(locale.untilPhrase(locale.formatDate(options.until, tzid)));
  } else if (options.count !== null) {
    parts.push(locale.countLimitPhrase(options.count));
  }

  return parts.join(' ');
}

function describeWeeklyMerge(options: Options, weekdays: string[], textOptions: ToTextOptions = {}) {
  const locale = resolveLocale(textOptions);
  const mergedShortcut = locale.mergeWeekdayShortcut(weekdays);
  const tzid = getTzid(options);
  const displayedTime = buildDisplayedTimes(options, locale);
  const parts = [
    locale.everyUnit(Frequency.WEEKLY, options.interval),
    locale.weekdaysPhrase(mergedShortcut ? [mergedShortcut] : weekdays),
  ];

  if (displayedTime.kind === 'times' && displayedTime.values.length) {
    parts.push(locale.timePhrase(joinList(displayedTime.values, locale.conjunction, locale.intl)));
    if (!textOptions.excludeTzAbbreviation && options.dtstart) {
      parts.push(locale.tzAbbreviation(options.dtstart, tzid));
    }
  }

  if (options.until) {
    parts.push(locale.untilPhrase(locale.formatDate(options.until, tzid)));
  } else if (options.count !== null) {
    parts.push(locale.countLimitPhrase(options.count));
  }

  return parts.join(' ');
}

function cloneWithWeekdays(options: Options, weekdays: ByWeekday[] | null): Options {
  return {
    ...options,
    byweekday: weekdays,
  };
}

function normalizeWeekdayTokens(values: WeekdayValue[], locale: ResolvedTextLocale) {
  return values
    .filter((value) => value.ordinal === undefined)
    .map((value) => locale.weekdayNames[value.weekday]!)
    .sort((a, b) => a.localeCompare(b, locale.intl));
}

export function textMergeDescriptorForOptions(options: Options, textOptions: ToTextOptions = {}): TextMergeDescriptor | null {
  const locale = resolveLocale(textOptions);
  const weekdayValues = asArray(options.byweekday).map(parseWeekday).filter(Boolean) as WeekdayValue[];
  const mergeableWeekdays = weekdayValues.length > 0 && weekdayValues.every((value) => value.ordinal === undefined);
  const simpleShape =
    options.freq === Frequency.WEEKLY
    && mergeableWeekdays
    && options.bysetpos === null
    && options.bymonthday === null
    && options.byweekno === null
    && options.byyearday === null
    && options.bymonth === null
    && options.byeaster === null
    && options.rscale === null
    && options.skip === null;

  if (!simpleShape) return null;

  const weekdayNames = normalizeWeekdayTokens(weekdayValues, locale);
  const key = JSON.stringify({
    locale: locale.code,
    freq: options.freq,
    interval: options.interval,
    count: options.count,
    until: options.until?.toISOString() ?? null,
    tzid: options.tzid,
    byhour: options.byhour,
    byminute: options.byminute,
    bysecond: options.bysecond,
    wkst: (options.wkst instanceof Weekday || isWeekdayLike(options.wkst)) ? options.wkst.toString() : options.wkst,
  });

  return {
    key,
    weekdays: weekdayNames,
    render: (weekdays) => describeWeeklyMerge(cloneWithWeekdays(options, []), weekdays, textOptions),
  };
}

function describeSource(expression: Extract<SetExpression, { kind: 'source' }>, options: ToTextOptions | undefined, context: RenderContext) {
  const locale = resolveLocale(options);
  const source = expression.source;
  if (source.isDateSource?.()) {
    const count = source.dateCount?.() ?? source.all().length;
    if (context === 'include') return locale.withAdditionalDates(count);
    if (context === 'exclude') return locale.excludingDates(count);
    return locale.sourceDateCountPhrase(count);
  }
  return source.toTextDescription?.(options) ?? locale.customSource;
}

function describeUnion(expressions: SetExpression[], options: ToTextOptions | undefined, context: RenderContext) {
  const locale = resolveLocale(options);
  const dateSources: Extract<SetExpression, { kind: 'source' }>[] = [];
  const otherSources: SetExpression[] = [];

  for (const expression of expressions) {
    if (expression.kind === 'source' && expression.source.isDateSource?.()) {
      dateSources.push(expression);
    } else {
      otherSources.push(expression);
    }
  }

  const grouped = new Map<string, TextMergeDescriptor>();
  const standalone: string[] = [];
  for (const expression of otherSources) {
    if (expression.kind === 'source') {
      const merge = expression.source.textMergeDescriptor?.(options);
      if (merge) {
        const current = grouped.get(merge.key);
        if (current) {
          current.weekdays = [...new Set([...current.weekdays, ...merge.weekdays])].sort((a, b) => a.localeCompare(b, locale.intl));
        } else {
          grouped.set(merge.key, { ...merge, weekdays: [...merge.weekdays] });
        }
        continue;
      }
    }
    standalone.push(describeSetExpression(expression, options, 'standalone'));
  }
  const otherText = [
    ...[...grouped.values()].map((entry) => entry.render(entry.weekdays)),
    ...standalone,
  ].filter(Boolean).sort((a, b) => a.localeCompare(b, locale.intl));
  const dateCount = dateSources.reduce((sum, expression) => sum + (expression.source.dateCount?.() ?? expression.source.all().length), 0);

  if (context === 'include') {
    if (!otherText.length && dateCount) return locale.withAdditionalDates(dateCount);
    if (otherText.length && dateCount) return `${joinList(otherText, locale.conjunction, locale.intl)} ${locale.withAdditionalDates(dateCount)}`;
    return joinList(otherText, locale.conjunction, locale.intl);
  }

  if (context === 'exclude') {
    const parts = [...otherText];
    if (dateCount) parts.push(locale.sourceDateCountPhrase(dateCount));
    return locale.excludingPhrase(joinList(parts, locale.conjunction, locale.intl));
  }

  if (!otherText.length && dateCount) return locale.sourceDateCountPhrase(dateCount);
  if (otherText.length && dateCount) return `${joinList(otherText, locale.conjunction, locale.intl)} ${locale.withAdditionalDates(dateCount)}`;
  return joinList(otherText, locale.conjunction, locale.intl);
}

export function describeSetExpression(expression: SetExpression, options?: ToTextOptions, context: RenderContext = 'standalone'): string {
  const locale = resolveLocale(options);
  switch (expression.kind) {
    case 'source':
      return describeSource(expression, options, context);
    case 'union':
      return describeUnion(expression.expressions, options, context);
    case 'intersection': {
      const rendered = expression.expressions
        .map((entry) => describeSetExpression(entry, options, 'standalone'))
        .filter(Boolean);
      if (!rendered.length) return locale.customSet;
      if (rendered.length === 1) return rendered[0]!;
      return rendered.map((entry) => `(${entry})`).join(' ∩ ');
    }
    case 'difference': {
      const include = describeSetExpression(expression.include, options, 'include');
      const exclude = describeSetExpression(expression.exclude, options, 'exclude');
      if (!exclude) return include;
      if (!include) return exclude;
      if (exclude === locale.excludingDates(1)) {
        return `${include} ${locale.exceptPhrase(locale.sourceDateCountPhrase(1))}`;
      }
      if (exclude.startsWith(locale.excludingPhrase(''))) return `${include} ${exclude}`;
      return `${include} ${locale.excludingPhrase(exclude)}`;
    }
  }
}

export function isSetExpressionFullyConvertible(expression: SetExpression, options?: ToTextOptions): boolean {
  switch (expression.kind) {
    case 'source':
      return expression.source.isFullyConvertibleToText?.(options) ?? false;
    case 'union':
      return expression.expressions.every((entry) => isSetExpressionFullyConvertible(entry, options));
    case 'intersection':
      return false;
    case 'difference':
      return isSetExpressionFullyConvertible(expression.include, options)
        && isSetExpressionFullyConvertible(expression.exclude, options);
  }
}

export function ruleToText(options: Options, textOptions?: ToTextOptions): string {
  return analyzeOptions(options, textOptions).text;
}

export function isFullyConvertibleToText(options: Options, textOptions?: ToTextOptions): boolean {
  return analyzeOptions(options, textOptions).fullyConvertible;
}

export function textMergeDescriptorForRuleBase(options: Options, textOptions?: ToTextOptions): string {
  return describeRuleBaseWithoutWeekdays(options, textOptions);
}
