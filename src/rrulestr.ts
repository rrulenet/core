import { Temporal } from 'temporal-polyfill';

import { parseRuleString, plainDateFromCompact } from './internal/parse.ts';
import type { Options } from './internal/options.ts';
import { parseContentLine } from './internal/contentLine.ts';

/**
 * Options accepted by the low-level RFC string parser.
 */
export interface RRuleStrOptions {
  dtstart: Date | null;
  count: number | null;
  until: Date | null;
  cache: boolean;
  unfold: boolean;
  forceset: boolean;
  compatible: boolean;
  tzid: string | null;
}

const DEFAULT_OPTIONS: RRuleStrOptions = {
  dtstart: null,
  count: null,
  until: null,
  cache: false,
  unfold: false,
  forceset: false,
  compatible: false,
  tzid: null,
};

/**
 * Structured result of parsing an RFC recurrence string into normalized
 * components.
 */
export interface ParsedRRuleStringComponents {
  noCache: boolean;
  sawInlineDtstart: boolean;
  dtstart: Date | null;
  dtstartDate?: string;
  tzid: string | null;
  rruleValues: Partial<Options>[];
  exruleValues: Partial<Options>[];
  rdateValues: Date[];
  exdateValues: Date[];
  rdatePlainDates: (string | undefined)[];
  exdatePlainDates: (string | undefined)[];
  rawOptions: RRuleStrOptions;
}

function splitIntoLines(input: string, unfold = false): string[] {
  const trimmed = input.trim().replace(/\r?\n[ \t]/g, '');
  if (!trimmed) throw new Error('Invalid empty string');

  if (!unfold) {
    if (/\r?\n/.test(trimmed)) {
      return trimmed
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }
    return trimmed.split(/\s+/).filter(Boolean);
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDateList(line: string, defaultTzid: string, dates: Date[], plainDates: (string | undefined)[]): void {
  const { parameters, value: body } = parseContentLine(line);
  const tzid = parameters.get('TZID') ?? defaultTzid;

  const values = body
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of values) {
    const plainDate = plainDateFromCompact(value);
    plainDates.push(plainDate);
    if (/^\d{8}T\d{6}Z$/.test(value)) {
      const normalized = value.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        '$1-$2-$3T$4:$5:$6Z',
      );
      dates.push(new Date(normalized));
      continue;
    }

    if (/^\d{8}T\d{6}$/.test(value)) {
      const iso = value.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
        '$1-$2-$3T$4:$5:$6',
      );
      const instant = Temporal.PlainDateTime.from(iso).toZonedDateTime(tzid).toInstant();
      dates.push(new Date(instant.epochMilliseconds));
      continue;
    }

    if (plainDate) {
      const instant = Temporal.PlainDate.from(plainDate).toZonedDateTime(tzid).toInstant();
      dates.push(new Date(instant.epochMilliseconds));
      continue;
    }

    dates.push(new Date(value));
  }
}

function extractLineTzid(line: string): string | undefined {
  // DTSTART= is a classic compatibility form without content-line parameters.
  if (/^DTSTART=/i.test(line)) return undefined;
  return parseContentLine(line).parameters.get('TZID');
}

function initializeOptions(options: Partial<RRuleStrOptions>): RRuleStrOptions {
  const validKeys = new Set(Object.keys(DEFAULT_OPTIONS));
  const invalid = Object.keys(options).filter((key) => !validKeys.has(key));
  if (invalid.length) {
    throw new Error(`Invalid options: ${invalid.join(', ')}`);
  }
  return { ...DEFAULT_OPTIONS, ...options };
}

function reinterpretExternalDtstartForTzid(date: Date, tzid: string): Date {
  const plain = new Temporal.PlainDateTime(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
  const instant = plain.toZonedDateTime(tzid).toInstant();
  return new Date(instant.epochMilliseconds);
}

/**
 * Merge parsed rule values with externally supplied defaults such as
 * `dtstart`, `tzid`, `count`, and `until`.
 */
export function groomRuleOptions(
  parsed: Partial<Options>,
  dtstart?: Date | null,
  tzid?: string | null,
  count?: number | null,
  until?: Date | null,
  reinterpretExternalDtstart = false,
  dtstartDate?: string,
): Partial<Options> {
  const effectiveDtstart =
    parsed.dtstart ??
    (dtstart && tzid && reinterpretExternalDtstart ? reinterpretExternalDtstartForTzid(dtstart, tzid) : dtstart) ??
    undefined;
  return {
    ...parsed,
    dtstart: effectiveDtstart,
    ...(!parsed.dtstart && dtstartDate ? { dtstartDate } : {}),
    count: parsed.count ?? count ?? undefined,
    until: parsed.until ?? until ?? undefined,
    tzid: parsed.tzid ?? tzid ?? undefined,
  };
}

/**
 * Parse an RFC-style recurrence string into its rule, date, and timezone
 * components without instantiating a higher-level facade object.
 */
export function parseRRuleStringComponents(
  input: string,
  rawOptions: Partial<RRuleStrOptions> = {},
): ParsedRRuleStringComponents {
  const options = initializeOptions(rawOptions);
  if (options.compatible) {
    options.forceset = true;
    options.unfold = true;
  }

  const lines = splitIntoLines(input, options.unfold);
  const noCache = options.cache === false;
  const rruleValues: Partial<Options>[] = [];
  const exruleValues: Partial<Options>[] = [];
  const rdateValues: Date[] = [];
  const exdateValues: Date[] = [];
  const rdatePlainDates: (string | undefined)[] = [];
  const exdatePlainDates: (string | undefined)[] = [];

  let currentDtstartLine: string | undefined;
  let dtstart = options.dtstart;
  let dtstartDate: string | undefined;
  let tzid = options.tzid;
  let sawInlineDtstart = false;

  for (const line of lines) {
    const normalizedLine = line.trim();
    if (!normalizedLine) continue;

    const upperLine = normalizedLine.toUpperCase();
    if (upperLine.startsWith('DTSTART')) {
      currentDtstartLine = normalizedLine;
      sawInlineDtstart = true;
      const meta = parseRuleString(normalizedLine, tzid ?? undefined);
      const lineTzid = extractLineTzid(normalizedLine);
      if (lineTzid || meta.dtstartDate) tzid = lineTzid ?? meta.tzid ?? tzid;
      if (meta.dtstart) dtstart = meta.dtstart;
      dtstartDate = meta.dtstartDate;
      continue;
    }

    if (upperLine.startsWith('RRULE:') || !normalizedLine.includes(':')) {
      const source = currentDtstartLine
        ? `${currentDtstartLine}\n${upperLine.startsWith('RRULE:') ? normalizedLine : `RRULE:${normalizedLine}`}`
        : upperLine.startsWith('RRULE:')
          ? normalizedLine
          : normalizedLine;
      rruleValues.push(parseRuleString(source, tzid ?? undefined));
      continue;
    }

    if (upperLine.startsWith('EXRULE:')) {
      const rruleLine = normalizedLine.replace(/^EXRULE:/i, 'RRULE:');
      const source = currentDtstartLine ? `${currentDtstartLine}\n${rruleLine}` : rruleLine;
      exruleValues.push(parseRuleString(source, tzid ?? undefined));
      continue;
    }

    if (upperLine.startsWith('RDATE')) {
      const lineTzid = extractLineTzid(normalizedLine);
      if (lineTzid && !tzid) tzid = lineTzid;
      parseDateList(normalizedLine, tzid ?? 'UTC', rdateValues, rdatePlainDates);
      continue;
    }

    if (upperLine.startsWith('EXDATE')) {
      const lineTzid = extractLineTzid(normalizedLine);
      if (lineTzid && !tzid) tzid = lineTzid;
      parseDateList(normalizedLine, tzid ?? 'UTC', exdateValues, exdatePlainDates);
      continue;
    }

    throw new Error(`unsupported property: ${normalizedLine.split(':', 1)[0]}`);
  }

  return {
    noCache,
    sawInlineDtstart,
    dtstart,
    dtstartDate,
    tzid,
    rruleValues,
    exruleValues,
    rdateValues,
    exdateValues,
    rdatePlainDates,
    exdatePlainDates,
    rawOptions: options,
  };
}
