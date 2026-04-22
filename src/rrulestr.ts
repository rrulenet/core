import { Temporal } from 'temporal-polyfill';

import { parseRuleString } from './internal/parse.ts';
import type { Options } from './internal/options.ts';

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

export interface ParsedRRuleStringComponents {
  noCache: boolean;
  sawInlineDtstart: boolean;
  dtstart: Date | null;
  tzid: string | null;
  rruleValues: Partial<Options>[];
  exruleValues: Partial<Options>[];
  rdateValues: Date[];
  exdateValues: Date[];
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

function parseDateList(line: string, defaultTzid: string): Date[] {
  const [header, body = ''] = line.split(':');
  const tzidMatch = header?.match(/TZID=([^;:]+)/i);
  const tzid = tzidMatch?.[1] ?? defaultTzid;

  return body
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (/^\d{8}T\d{6}Z$/.test(value)) {
        const normalized = value.replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
          '$1-$2-$3T$4:$5:$6Z',
        );
        return new Date(normalized);
      }

      if (/^\d{8}T\d{6}$/.test(value)) {
        const iso = value.replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
          '$1-$2-$3T$4:$5:$6',
        );
        const instant = Temporal.PlainDateTime.from(iso).toZonedDateTime(tzid).toInstant();
        return new Date(instant.epochMilliseconds);
      }

      if (/^\d{8}$/.test(value)) {
        const iso = value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
        const instant = Temporal.PlainDate.from(iso).toZonedDateTime(tzid).toInstant();
        return new Date(instant.epochMilliseconds);
      }

      return new Date(value);
    });
}

function parseDtstartMeta(line: string): { tzid?: string; date?: Date } {
  const [header, body = ''] = line.split(':');
  const tzidMatch = header?.match(/TZID=([^;:]+)/i);
  const tzid = tzidMatch?.[1];
  const options = parseRuleString(line);
  return { tzid, date: options.dtstart ?? undefined };
}

function extractLineTzid(line: string): string | undefined {
  const [header = ''] = line.split(':');
  return header.match(/TZID=([^;:]+)/i)?.[1];
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

export function groomRuleOptions(
  parsed: Partial<Options>,
  dtstart?: Date | null,
  tzid?: string | null,
  count?: number | null,
  until?: Date | null,
  reinterpretExternalDtstart = false,
): Partial<Options> {
  const effectiveDtstart =
    parsed.dtstart ??
    (dtstart && tzid && reinterpretExternalDtstart ? reinterpretExternalDtstartForTzid(dtstart, tzid) : dtstart) ??
    undefined;
  return {
    ...parsed,
    dtstart: effectiveDtstart,
    count: parsed.count ?? count ?? undefined,
    until: parsed.until ?? until ?? undefined,
    tzid: parsed.tzid ?? tzid ?? undefined,
  };
}

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

  let currentDtstartLine: string | undefined;
  let dtstart = options.dtstart;
  let tzid = options.tzid;
  let sawInlineDtstart = false;

  for (const line of lines) {
    const normalizedLine = line.trim();
    if (!normalizedLine) continue;

    const upperLine = normalizedLine.toUpperCase();
    if (upperLine.startsWith('DTSTART')) {
      currentDtstartLine = normalizedLine;
      sawInlineDtstart = true;
      const meta = parseDtstartMeta(normalizedLine);
      if (meta.tzid) tzid = meta.tzid;
      if (meta.date) dtstart = meta.date;
      continue;
    }

    if (upperLine.startsWith('RRULE:') || !normalizedLine.includes(':')) {
      const source = currentDtstartLine
        ? `${currentDtstartLine}\n${upperLine.startsWith('RRULE:') ? normalizedLine : `RRULE:${normalizedLine}`}`
        : upperLine.startsWith('RRULE:')
          ? normalizedLine
          : normalizedLine;
      rruleValues.push(parseRuleString(source));
      continue;
    }

    if (upperLine.startsWith('EXRULE:')) {
      const rruleLine = normalizedLine.replace(/^EXRULE:/i, 'RRULE:');
      const source = currentDtstartLine ? `${currentDtstartLine}\n${rruleLine}` : rruleLine;
      exruleValues.push(parseRuleString(source));
      continue;
    }

    if (upperLine.startsWith('RDATE')) {
      const lineTzid = extractLineTzid(normalizedLine);
      if (lineTzid && !tzid) tzid = lineTzid;
      rdateValues.push(...parseDateList(normalizedLine, tzid ?? 'UTC'));
      continue;
    }

    if (upperLine.startsWith('EXDATE')) {
      const lineTzid = extractLineTzid(normalizedLine);
      if (lineTzid && !tzid) tzid = lineTzid;
      exdateValues.push(...parseDateList(normalizedLine, tzid ?? 'UTC'));
      continue;
    }

    throw new Error(`unsupported property: ${normalizedLine.split(':', 1)[0]}`);
  }

  return {
    noCache,
    sawInlineDtstart,
    dtstart,
    tzid,
    rruleValues,
    exruleValues,
    rdateValues,
    exdateValues,
    rawOptions: options,
  };
}
