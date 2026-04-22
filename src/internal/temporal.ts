import { Temporal } from 'temporal-polyfill';

export function toInstant(date: Date | Temporal.ZonedDateTime): Temporal.Instant {
  return date instanceof Date ? Temporal.Instant.from(date.toISOString()) : date.toInstant();
}

export function dateToZdt(date: Date, tzid: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO(tzid);
}

export function zdtToDate(zdt: Temporal.ZonedDateTime): Date {
  return new Date(zdt.toInstant().epochMilliseconds);
}

export function compareByInstant(a: Temporal.ZonedDateTime, b: Temporal.ZonedDateTime): number {
  return Temporal.Instant.compare(a.toInstant(), b.toInstant());
}

export function dedupeSortedByInstant(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
  if (dates.length <= 1) return dates;
  const out: Temporal.ZonedDateTime[] = [dates[0]!];
  let last = dates[0]!.toInstant().epochNanoseconds;

  for (let i = 1; i < dates.length; i += 1) {
    const date = dates[i]!;
    const current = date.toInstant().epochNanoseconds;
    if (current !== last) {
      out.push(date);
      last = current;
    }
  }

  return out;
}

export function dedupeByInstant(dates: Temporal.ZonedDateTime[]): Temporal.ZonedDateTime[] {
  const seen = new Map<string, Temporal.ZonedDateTime>();
  for (const date of dates) {
    const key = date.toInstant().epochNanoseconds.toString();
    if (!seen.has(key)) {
      seen.set(key, date);
    }
  }
  return [...seen.values()].sort(compareByInstant);
}
