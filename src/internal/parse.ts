import { Temporal } from 'temporal-polyfill';

import { datetime } from './dateutil.ts';
import { Frequency, type Options, type Skip } from './options.ts';
import { Weekday } from './weekday.ts';
import { validateRuleSelectors } from './validateSelectors.ts';
import { parseContentLine } from './contentLine.ts';

function unfoldLines(input: string): string[] {
  return input
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCompactDateTime(value: string, tzid?: string): Date {
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    if (!tzid) {
      return datetime(year, month, day, 0, 0, 0);
    }

    const instant = Temporal.PlainDate
      .from({ year, month, day })
      .toZonedDateTime(tzid)
      .toInstant();
    return new Date(instant.epochMilliseconds);
  }

  if (!/^\d{8}T\d{6}Z?$/.test(value)) {
    throw new Error(`Invalid date-time value: ${value}`);
  }

  if (value.endsWith('Z')) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    return datetime(year, month, day, hour, minute, second);
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15));
  if (!tzid) {
    return datetime(year, month, day, hour, minute, second);
  }

  const instant = Temporal.PlainDateTime
    .from({ year, month, day, hour, minute, second })
    .toZonedDateTime(tzid)
    .toInstant();
  return new Date(instant.epochMilliseconds);
}

function parseFreq(value: string): Frequency {
  const parsed = Frequency[value as keyof typeof Frequency];
  if (typeof parsed !== 'number') {
    throw new Error(`Invalid FREQ value: ${value}`);
  }
  return parsed as unknown as Frequency;
}

function parseWeekdayToken(token: string): Weekday | null {
  const match = token.match(/^([+-]?\d+)?([A-Z]{2})$/);
  if (!match) return null;
  const weekday = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(match?.[2] as never);
  if (weekday < 0) return null;
  const base = new Weekday(weekday);
  if (!match[1]) return base;
  const ordinal = Number(match[1]);
  return ordinal === 0 ? null : base.nth(ordinal);
}

function parseByMonthToken(token: string): number | string {
  const trimmed = token.trim().toUpperCase();
  if (/^\d+L$/.test(trimmed)) return trimmed;
  return parseInteger(trimmed, 'BYMONTH');
}

function parseInteger(value: string, field: string): number {
  const token = value.trim();
  if (!/^[+-]?\d+$/.test(token)) {
    throw new RangeError(`Invalid ${field} value ${value}: expected a decimal integer`);
  }
  const result = Number(token);
  if (!Number.isSafeInteger(result)) throw new RangeError(`Invalid ${field} value ${value}: expected a safe integer`);
  return result;
}

function parseIntegerList(value: string, field: string): number[] {
  return value.split(',').map(token => parseInteger(token, field));
}

function parseDtstartToken(token: string, result: Partial<Options>) {
  // Retain the historical DTSTART= form used inside a classic rule string.
  token = token.replace(/^DTSTART=/i, 'DTSTART:');
  if (!token.includes(':')) token = token.replace(/=([^;=]+)$/, ':$1');
  const { name, parameters, value } = parseContentLine(token);
  if (name !== 'DTSTART') return false;
  for (const [key, value] of parameters) {
    if (key !== 'TZID' && (key !== 'VALUE' || !['DATE', 'DATE-TIME'].includes(value.toUpperCase()))) return false;
  }
  const tzid = parameters.get('TZID');
  result.tzid = tzid ?? 'UTC';
  result.dtstart = parseCompactDateTime(value, result.tzid);
  return true;
}

/**
 * Parse a single RFC-style rule string into compat-style options.
 */
export function parseRuleString(input: string): Partial<Options> {
  const result: Partial<Options> = {};
  for (const line of unfoldLines(input)) {
    const upperLine = line.toUpperCase();
    if (upperLine.startsWith('DTSTART')) {
      if (!parseDtstartToken(line, result)) {
        throw new Error(`Invalid DTSTART line: ${line}`);
      }
      continue;
    }
    let rule = line;
    if (upperLine.startsWith('RRULE:')) {
      rule = line.slice(6);
    } else if (upperLine.startsWith('EXRULE:')) {
      rule = line.slice(7);
    }

    const embeddedDtstart = /(?:^|;)DTSTART(?:;TZID=([^:=;]+))?(?::|=)([^;]+)/i.exec(rule);
    if (embeddedDtstart) {
      parseDtstartToken(embeddedDtstart[0]!.replace(/^;/, ''), result);
      const before = rule.slice(0, embeddedDtstart.index).replace(/;$/, '');
      const after = rule.slice(embeddedDtstart.index + embeddedDtstart[0]!.length).replace(/^;/, '');
      rule = [before, after].filter(Boolean).join(';');
    }

    if (!upperLine.startsWith('RRULE:') && !upperLine.startsWith('EXRULE:') && line.includes(':') && !embeddedDtstart) {
      continue;
    }

    for (const part of rule.split(';')) {
      const separatorIndex = part.indexOf('=');
      const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
      if (!key || separatorIndex < 0) {
        throw new Error(`Unknown RRULE property '${key}'`);
      }
      const rawValue = part.slice(separatorIndex + 1);
      switch (key.toUpperCase()) {
        case 'FREQ':
          result.freq = parseFreq(rawValue.toUpperCase());
          break;
        case 'INTERVAL':
          result.interval = parseInteger(rawValue, 'INTERVAL');
          break;
        case 'COUNT':
          result.count = parseInteger(rawValue, 'COUNT');
          break;
        case 'UNTIL':
          result.until = parseCompactDateTime(rawValue, result.tzid ?? undefined);
          break;
        case 'BYMONTH':
          result.bymonth = rawValue.split(',').map(parseByMonthToken);
          break;
        case 'BYMONTHDAY':
          result.bymonthday = parseIntegerList(rawValue, 'BYMONTHDAY');
          break;
        case 'BYWEEKNO':
          result.byweekno = parseIntegerList(rawValue, 'BYWEEKNO');
          break;
        case 'BYYEARDAY':
          result.byyearday = parseIntegerList(rawValue, 'BYYEARDAY');
          break;
        case 'BYSETPOS':
          result.bysetpos = parseIntegerList(rawValue, 'BYSETPOS');
          break;
        case 'BYEASTER':
          result.byeaster = parseInteger(rawValue, 'BYEASTER');
          break;
        case 'BYHOUR':
          result.byhour = parseIntegerList(rawValue, 'BYHOUR');
          break;
        case 'BYMINUTE':
          result.byminute = parseIntegerList(rawValue, 'BYMINUTE');
          break;
        case 'BYSECOND':
          result.bysecond = parseIntegerList(rawValue, 'BYSECOND');
          break;
        case 'BYDAY':
        case 'BYWEEKDAY':
          result.byweekday = rawValue.split(',').map((token) => {
            const weekday = parseWeekdayToken(token.toUpperCase());
            if (!weekday) throw new SyntaxError(`Invalid weekday string: ${token}`);
            return weekday;
          });
          break;
        case 'WKST': {
          const weekday = parseWeekdayToken(rawValue.toUpperCase());
          if (!weekday || weekday.n) throw new SyntaxError(`Invalid weekday string: ${rawValue}`);
          result.wkst = weekday.weekday;
          break;
        }
        case 'TZID':
          result.tzid = rawValue;
          break;
        case 'RSCALE':
          result.rscale = rawValue.toUpperCase();
          break;
        case 'SKIP':
          if (!['OMIT', 'BACKWARD', 'FORWARD'].includes(rawValue.toUpperCase())) {
            throw new Error(`Invalid SKIP value: ${rawValue}`);
          }
          result.skip = rawValue.toUpperCase() as Skip;
          break;
        default:
          throw new Error(`Unknown RRULE property '${key}'`);
      }
    }
  }
  if (result.skip && !result.rscale) {
    throw new Error('SKIP MUST NOT be present unless RSCALE is present');
  }
  validateRuleSelectors(result);
  return result;
}
