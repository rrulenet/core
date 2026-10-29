import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { RuleSource } from '../dist/engine.mjs';

const stamps = values => Array.from(values, value => value.epochNanoseconds);
const spec = (start, overrides = {}) => {
  const dtstart = Temporal.ZonedDateTime.from(start);
  return { dtstart, tzid: dtstart.timeZoneId, freq: 'DAILY', interval: 1, wkst: 0, count: 4, ...overrides };
};

function check(input, expected) {
  const instants = expected.map(value => Temporal.Instant.from(value).epochNanoseconds);
  const source = new RuleSource(input);
  assert.deepEqual(stamps(source.iterate()), instants);
  const lower = input.dtstart.toInstant().subtract({ nanoseconds: 1 });
  const upper = Temporal.Instant.from(expected.at(-1));
  assert.deepEqual(stamps(source.between(lower, upper, true)), instants);
  assert.equal(source.after(lower, false)?.epochNanoseconds, instants[0]);
  assert.equal(source.before(upper, true)?.epochNanoseconds, instants.at(-1));
  assert.deepEqual(stamps(source.all()), instants);
  assert.deepEqual(stamps(source.iterate()), instants);
  assert.deepEqual(stamps(source.between(lower, upper, true)), instants);
}

test('initial dense annual expansion starts at DTSTART without changing clock ranks', () => {
  const input = spec('2025-06-15T09:00:00.123456789[UTC]', {
    freq: 'YEARLY', count: 3,
    bymonth: Array.from({ length: 12 }, (_, i) => i + 1),
    bymonthday: Array.from({ length: 31 }, (_, i) => i + 1),
    byhour: Array.from({ length: 24 }, (_, i) => i),
    byminute: Array.from({ length: 60 }, (_, i) => i),
    bysecond: Array.from({ length: 60 }, (_, i) => i),
  });
  check(input, ['2025-06-15T09:00:00.123456789Z', '2025-06-15T09:00:01.123456789Z', '2025-06-15T09:00:02.123456789Z']);
  const until = { ...input, count: undefined, until: input.dtstart.add({ seconds: 2 }) };
  check(until, ['2025-06-15T09:00:00.123456789Z', '2025-06-15T09:00:01.123456789Z', '2025-06-15T09:00:02.123456789Z']);
});

test('initial-period clipping preserves positive and negative BYSETPOS in the full period', () => {
  for (const [freq, start, expected] of [
    ['DAILY', '2026-01-01T09:00:00[UTC]', ['2026-01-01T12:00:00Z', '2026-01-02T00:00:00Z']],
    ['WEEKLY', '2026-01-07T09:00:00[UTC]', ['2026-01-11T12:00:00Z', '2026-01-12T00:00:00Z']],
    ['MONTHLY', '2026-01-15T09:00:00[UTC]', ['2026-01-31T12:00:00Z', '2026-02-01T00:00:00Z']],
    ['YEARLY', '2026-06-15T09:00:00[UTC]', ['2026-12-31T12:00:00Z', '2027-01-01T00:00:00Z']],
  ]) {
    const days = freq === 'WEEKLY' ? { byweekday: [{ weekday: 0 }, { weekday: 6 }] }
      : freq === 'MONTHLY' ? { bymonthday: [1, -1] }
      : freq === 'YEARLY' ? { bymonth: [1, 12], bymonthday: [1, -1] } : {};
    check(spec(start, { freq, ...days, byhour: [0, 12], byminute: [0], bysecond: [0], bysetpos: [1, -1], count: 2 }), expected);
  }
});

test('DTSTART clipping retains earlier nominal gap slots that resolve after the start', () => {
  check(spec('2026-03-29T03:15:00[Europe/Paris]', { byhour: [2], byminute: [0, 30], bysecond: [0], count: 3 }),
    ['2026-03-29T01:30:00Z', '2026-03-30T00:00:00Z', '2026-03-30T00:30:00Z']);
  check(spec('2026-03-29T03:00:00[Europe/Paris]', { byhour: [2, 3], byminute: [0, 30], bysecond: [0], count: 3 }),
    ['2026-03-29T01:00:00Z', '2026-03-29T01:30:00Z', '2026-03-30T00:00:00Z']);
  check(spec('2026-03-29T03:00:00[Europe/Paris]', { byhour: [2, 3], byminute: [0, 30], bysecond: [0], bysetpos: [1], count: 2 }),
    ['2026-03-29T01:00:00Z', '2026-03-30T00:00:00Z']);
  check(spec('2026-10-04T02:45:00[Australia/Lord_Howe]', { byhour: [2], byminute: [15], bysecond: [0], count: 2 }),
    ['2026-10-03T15:45:00Z', '2026-10-04T15:15:00Z']);
  check(spec('2011-12-31T00:15:00[Pacific/Apia]', { freq: 'YEARLY', bymonth: [12], bymonthday: [30, 31],
    byhour: [1], byminute: [0], bysecond: [0], count: 2 }),
    ['2011-12-30T11:00:00Z', '2012-12-29T11:00:00Z']);
});

test('initial clipping does not generate the second autumn passage', () => {
  const clock = { byhour: [2, 3], byminute: [30], bysecond: [0], count: 2 };
  check(spec('2026-10-25T02:15:00+02:00[Europe/Paris]', clock), ['2026-10-25T00:30:00Z', '2026-10-25T02:30:00Z']);
  check(spec('2026-10-25T02:15:00+01:00[Europe/Paris]', clock), ['2026-10-25T02:30:00Z', '2026-10-26T01:30:00Z']);
});

test('nominal month weekday and negative month-day selection matches independent date enumeration', () => {
  for (const year of [1900, 2000, 2024, 2100]) {
    for (let month = 1; month <= 12; month++) {
      const days = [];
      for (let day = 1; day <= 31; day++) {
        const date = new Date(Date.UTC(year, month - 1, day, 9));
        if (date.getUTCMonth() === month - 1) days.push(date);
      }
      const start = `${year}-${String(month).padStart(2, '0')}-01T09:00:00[UTC]`;
      for (const [selectors, expected] of [
        [{ byweekday: [0, 1, 2, 3, 4].map(weekday => ({ weekday })), bysetpos: [-1] },
          [days.filter(date => date.getUTCDay() !== 0 && date.getUTCDay() !== 6).at(-1)]],
        [{ byweekday: [{ weekday: 0, ordinal: -1 }] }, [days.filter(date => date.getUTCDay() === 1).at(-1)]],
        [{ bymonthday: [-2, -1] }, days.slice(-2)],
      ]) {
        const source = new RuleSource(spec(start, { freq: 'MONTHLY', count: expected.length, ...selectors }));
        assert.deepEqual(source.all().map(value => Number(value.epochMilliseconds)), expected.map(date => date.getTime()));
      }
    }
  }
});
