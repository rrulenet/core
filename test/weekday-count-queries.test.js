import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { RuleSource } from '../dist/engine.mjs';

// Deliberately enumerate calendar days; do not reproduce the optimized cycle
// calculation or obtain expected results from another engine query method.
function reference(input) {
  const values = [];
  const start = input.dtstart.toPlainDateTime();
  for (let day = 0; day < 400 && values.length < input.count; day += input.interval) {
    const value = start.add({ days: day });
    if (input.byweekday.some(({ weekday }) => weekday === value.dayOfWeek - 1)) {
      values.push(value.toZonedDateTime('UTC').epochNanoseconds);
    }
  }
  return values;
}

function check(input, expected) {
  const source = new RuleSource(input);
  const instant = value => Temporal.Instant.fromEpochNanoseconds(value);
  const stamp = value => value?.epochNanoseconds ?? null;
  const bounds = [input.dtstart.epochNanoseconds - 1n, input.dtstart.epochNanoseconds,
    ...expected.flatMap(value => [value - 1n, value, value + 1n]), input.dtstart.add({ days: 401 }).epochNanoseconds];
  function queries() {
    for (const bound of bounds) {
      for (const inc of [false, true]) {
        assert.equal(stamp(source.after(instant(bound), inc)), expected.find(value => inc ? value >= bound : value > bound) ?? null);
        assert.equal(stamp(source.before(instant(bound), inc)), expected.filter(value => inc ? value <= bound : value < bound).at(-1) ?? null);
        const upper = bounds.at(-1);
        assert.deepEqual(source.between(instant(bound), instant(upper), inc).map(value => value.epochNanoseconds),
          expected.filter(value => inc ? value >= bound && value <= upper : value > bound && value < upper));
        assert.deepEqual(source.between(instant(bound), instant(bound), inc).map(value => value.epochNanoseconds),
          inc ? expected.filter(value => value === bound) : []);
      }
    }
    assert.deepEqual(source.between(instant(bounds.at(-1)), instant(bounds[0]), true), []);
  }
  queries();
  assert.deepEqual(source.all().map(value => value.epochNanoseconds), expected);
  queries();
}

test('UTC weekday COUNT queries agree with independent calendar enumeration', () => {
  for (const start of ['1999-12-31T09:00:00.123456789[UTC]', '2000-02-28T23:59:59.999999999[UTC]', '2026-01-05T00:00:00[UTC]']) {
    for (const interval of [1, 2, 3, 7, 8, 14]) {
      for (const weekdays of [[0, 1, 2, 3, 4], [0, 6], [2], [0, 0, 1, 2, 3, 4, 5, 6]]) {
        for (const count of [0, 1, 12]) {
          const input = { dtstart: Temporal.ZonedDateTime.from(start), tzid: 'UTC', freq: 'DAILY', interval, wkst: 6,
            count, byweekday: weekdays.map(weekday => ({ weekday, ordinal: weekday % 2 ? -1 : 2 })) };
          const expected = reference(input);
          if (expected.length !== count) continue; // Unreachable filters retain the general search-limit path.
          check(input, expected);
        }
      }
    }
  }
});

test('UTC weekday ranking handles distant bounds without materializing COUNT', () => {
  const input = { dtstart: Temporal.ZonedDateTime.from('2000-01-01T09:00:00.123456789[UTC]'), tzid: 'UTC',
    freq: 'DAILY', interval: 1, wkst: 0, count: 1_000_000_000,
    byweekday: [0, 1, 2, 3, 4].map(weekday => ({ weekday })) };
  const source = new RuleSource(input);
  const bound = Temporal.Instant.from('2050-01-01T09:00:00.123456789Z'); // Saturday
  assert.equal(source.after(bound, true).toInstant().toString(), '2050-01-03T09:00:00.123456789Z');
  assert.equal(source.before(bound, true).toInstant().toString(), '2049-12-31T09:00:00.123456789Z');
});

test('COUNT weekday shortcut excludes time/date/positional filters, UNTIL and named zones', () => {
  const input = { dtstart: Temporal.ZonedDateTime.from('2026-01-05T09:00:00[UTC]'), tzid: 'UTC', freq: 'DAILY', interval: 1,
    wkst: 0, count: 3, byweekday: [0, 1, 2, 3, 4].map(weekday => ({ weekday })) };
  for (const extra of [{ byhour: [9, 12] }, { byminute: [0, 30] }, { bysecond: [0, 30] }, { bymonthday: [6, 8, 12] },
    { bymonth: [2] }, { byyearday: [6, 8, 12] }, { byweekno: [2, 3] },
    { byhour: [9, 12], bysetpos: [-1] }, { until: input.dtstart.add({ days: 3 }) },
    { dtstart: input.dtstart.withTimeZone('Europe/Paris'), tzid: 'Europe/Paris' },
    { dtstart: input.dtstart.withCalendar('gregory') }]) {
    const source = new RuleSource({ ...input, ...extra });
    const expected = source.all().map(value => value.epochNanoseconds);
    check({ ...input, ...extra }, expected);
  }
});
