import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { CandidateBudget, DateSource, ElapsedSource, RuleSource, SetEngine } from '../dist/engine.mjs';

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

test('COUNT queries agree with expansion for date and positional filters, UNTIL and named zones', () => {
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

test('dense UTC daily and weekly COUNT queries rank weekday and clock combinations directly', () => {
  const start = Temporal.ZonedDateTime.from('2000-01-01T09:30:00.123456789[UTC]');
  const hours = [9, 16];
  const minutes = [0, 30];
  const seconds = [0, 15, 30, 45];
  for (const freq of ['DAILY', 'WEEKLY']) {
    for (const interval of [1, 2, 3, 7]) {
      const weekdays = freq === 'DAILY' ? [start.dayOfWeek, 1] : [start.dayOfWeek, 3, 7];
      const wkst = 6;
      const spec = { freq, interval, wkst, dtstart: start, tzid: 'UTC', count: 27, byhour: hours,
        byminute: minutes, bysecond: seconds, byweekday: weekdays.map(day => ({ weekday: day - 1 })) };
      const expected = [];
      const firstDay = start.startOfDay();
      const weekOffset = (start.dayOfWeek - 1 - wkst + 7) % 7;
      for (let day = 0; expected.length < spec.count; day++) {
        const period = freq === 'DAILY' ? day : Math.floor((day + weekOffset) / 7);
        const date = firstDay.add({ days: day });
        if (period % interval !== 0 || !weekdays.includes(date.dayOfWeek)) continue;
        for (const hour of hours) for (const minute of minutes) for (const second of seconds) {
          const candidate = date.with({ hour, minute, second, millisecond: 123, microsecond: 456, nanosecond: 789 });
          if (candidate.epochNanoseconds >= start.epochNanoseconds) expected.push(candidate.epochNanoseconds);
        }
      }
      check(spec, expected.slice(0, spec.count));
    }
  }

  const range = count => Array.from({ length: count }, (_, index) => index);
  const bound = Temporal.Instant.from('2025-01-01T12:00:00.123456789Z');
  const oneSecond = bound.add({ seconds: 1 });
  const source = new RuleSource({ freq: 'WEEKLY', wkst: 6, interval: 1, tzid: 'UTC', count: 1_000_000_000,
    dtstart: start, byweekday: [3, 5].map(weekday => ({ weekday: weekday - 1 })), byhour: range(24),
    byminute: range(60), bysecond: range(60) });
  assert.equal(source.after(bound, false, new CandidateBudget(1)).epochNanoseconds, oneSecond.epochNanoseconds);
  assert.equal(source.before(bound, true, new CandidateBudget(1)).epochNanoseconds, bound.epochNanoseconds);
  assert.throws(() => source.all(), { code: 'RECURRENCE_SEARCH_LIMIT' });
  assert.deepEqual(source.between(bound, oneSecond, true, new CandidateBudget(2)).map(value => value.toInstant().toString()),
    [bound.toString(), oneSecond.toString()]);
});

test('candidate budget applies to general, ranked, elapsed, and composed window queries', () => {
  const start = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
  const from = start.toInstant().add({ hours: 12 });
  const to = from.add({ seconds: 3 });
  const range = count => Array.from({ length: count }, (_, index) => index);
  const spec = { dtstart: start, tzid: 'UTC', freq: 'DAILY', interval: 1, wkst: 0,
    byhour: range(24), byminute: range(60), bysecond: range(60) };
  const elapsed = new ElapsedSource({ start: start.toInstant(), every: 'PT1S' });
  for (const source of [new RuleSource(spec), new RuleSource({ ...spec, count: 100_000 }), elapsed]) {
    assert.throws(() => source.between(from, to, true, new CandidateBudget(3)), { code: 'RECURRENCE_SEARCH_LIMIT' });
    assert.deepEqual(source.between(from, to, false, new CandidateBudget(2)).map(value => value.epochNanoseconds),
      [from.add({ seconds: 1 }).epochNanoseconds, from.add({ seconds: 2 }).epochNanoseconds]);
  }
  const explicit = new DateSource([from.toZonedDateTimeISO('UTC')]);
  const expression = { kind: 'union', expressions: [elapsed, explicit].map(source => ({ kind: 'source', source })) };
  assert.throws(() => new SetEngine(expression, 4).between(from, to, true), { code: 'RECURRENCE_SEARCH_LIMIT' });
  assert.equal(new SetEngine(expression, 5).between(from, to, true).length, 4);
});

test('yearly emptiness proof follows the interval phase and checks positional reachability', () => {
  const start = Temporal.ZonedDateTime.from('2025-01-01T09:00:00[Europe/Paris]');
  const spec = { freq: 'YEARLY', tzid: start.timeZoneId, dtstart: start, interval: 1, wkst: 0 };
  for (const extra of [
    { byweekno: [20], bymonthday: [1] },
    { interval: 400, byyearday: [366] },
    { byyearday: [1], bymonthday: [2] },
    { byyearday: [1], bysetpos: [2, -2] },
  ]) {
    const empty = new RuleSource({ ...spec, ...extra });
    assert.deepEqual(empty.all(), []);
    assert.equal(empty.after(start.toInstant(), true), null);
    assert.equal(empty.before(start.add({ years: 10 }).toInstant(), true), null);
  }
  const reachable = new RuleSource({ ...spec, count: 2, byyearday: [366], byweekday: [{ weekday: 6 }] });
  assert.deepEqual(reachable.all().map(value => value.toPlainDate().toString()), ['2028-12-31', '2056-12-31']);
});
