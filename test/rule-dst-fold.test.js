import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { ElapsedSource, RuleSource } from '../dist/engine.mjs';
import { buildRuleSpec, normalizeOptions, parseRuleString } from '../dist/rule.mjs';

const instant = (value) => Temporal.Instant.from(value);
const utc = (values) => values.map((value) => value.toInstant().toString());
const first = '2026-10-25T00:30:00Z';
const second = '2026-10-25T01:30:00Z';
const expected = ['2026-10-24T00:30:00Z', first, '2026-10-26T01:30:00Z'];

function source(start, overrides = {}) {
  return new RuleSource({
    freq: 'DAILY', dtstart: Temporal.ZonedDateTime.from(start),
    tzid: 'Europe/Paris', interval: 1, wkst: 0,
    bymonth: [10], bymonthday: [24, 25, 26],
    byhour: [2], byminute: [30], bysecond: [0],
    until: Temporal.ZonedDateTime.from('2026-10-26T23:59:59+00:00[UTC]'),
    ...overrides,
  });
}

for (const hour of ['00', '01', '02', '03', '09', '20']) {
  test(`calendar fold: Paris first 02:30 is independent of DTSTART hour ${hour}`, () => {
    const rule = source(`2026-10-16T${hour}:00:00+02:00[Europe/Paris]`);
    assert.deepEqual(utc(rule.all()), expected);
    assert.equal(rule.after(instant('2026-10-24T00:30:00Z'), false)?.toInstant().toString(), first);
    assert.equal(rule.after(instant(first), false)?.toInstant().toString(), expected[2]);
    assert.equal(rule.after(instant(second), true)?.toInstant().toString(), expected[2]);
    assert.equal(rule.before(instant(second), false)?.toInstant().toString(), first);
    assert.deepEqual(utc(rule.between(instant('2026-10-25T00:00:00Z'), instant('2026-10-25T02:00:00Z'), true)), [first]);
    assert.equal(rule.occursAt(instant(first)), true);
    assert.equal(rule.occursAt(instant(second)), false);
  });
}

test('calendar fold: finite COUNT agrees with UNTIL and next-occurrence queries', () => {
  const rule = source('2026-10-16T20:00:00+02:00[Europe/Paris]', { count: 3, until: undefined });
  assert.deepEqual(utc(rule.all()), expected);
  assert.equal(rule.after(instant(first), true)?.toInstant().toString(), first);
  assert.equal(rule.after(instant(first), false)?.toInstant().toString(), expected[2]);
  assert.equal(rule.occursAt(instant(second)), false);
});

for (const freq of ['WEEKLY', 'MONTHLY', 'YEARLY']) {
  test(`calendar fold: ${freq} BYHOUR expansion selects the first repeated time`, () => {
    const rule = source('2026-10-16T20:00:00+02:00[Europe/Paris]', { freq, bymonthday: [25], byweekday: [{ weekday: 6 }] });
    assert.deepEqual(utc(rule.all()), [first]);
    assert.equal(rule.after(instant('2026-10-25T00:00:00Z'), false)?.toInstant().toString(), first);
    assert.equal(rule.occursAt(instant(second)), false);
  });
}

for (const sample of [
  { zone: 'America/New_York', start: '2026-10-28T20:00:00-04:00[America/New_York]', month: 11, day: 1, hour: 1, minute: 30, until: '2026-11-02T23:59:59+00:00[UTC]', expected: '2026-11-01T05:30:00Z' },
  { zone: 'Australia/Lord_Howe', start: '2026-04-03T20:00:00+11:00[Australia/Lord_Howe]', month: 4, day: 5, hour: 1, minute: 45, until: '2026-04-06T00:00:00+00:00[UTC]', expected: '2026-04-04T14:45:00Z' },
]) {
  test(`calendar fold: first occurrence in ${sample.zone}`, () => {
    const rule = source(sample.start, { tzid: sample.zone, bymonth: [sample.month], bymonthday: [sample.day], byhour: [sample.hour], byminute: [sample.minute], until: Temporal.ZonedDateTime.from(sample.until) });
    assert.deepEqual(utc(rule.all()), [sample.expected]);
  });
}

test('elapsed cadence: Paris half-hour recurrence retains both repeated hours', () => {
  const rule = new ElapsedSource({ start: instant('2026-10-24T23:30:00Z'), every: 'PT30M', tzid: 'Europe/Paris', count: 6 });
  assert.deepEqual(utc(rule.all()), [
    '2026-10-24T23:30:00Z', '2026-10-25T00:00:00Z', first,
    '2026-10-25T01:00:00Z', second, '2026-10-25T02:00:00Z',
  ]);
});

function cadence(start, overrides = {}) {
  return source(start, {
    bymonth: undefined, bymonthday: undefined,
    byhour: undefined, byminute: undefined, bysecond: undefined,
    until: undefined,
    ...overrides,
  });
}

for (const sample of [
  {
    freq: 'HOURLY', interval: 1, start: '2026-10-25T01:30:00+02:00[Europe/Paris]',
    expected: ['2026-10-24T23:30:00Z', first, second, '2026-10-25T02:30:00Z'],
  },
  {
    freq: 'MINUTELY', interval: 30, start: '2026-10-25T01:30:00+02:00[Europe/Paris]',
    expected: [
      '2026-10-24T23:30:00Z', '2026-10-25T00:00:00Z', first,
      '2026-10-25T01:00:00Z', second, '2026-10-25T02:00:00Z',
    ],
  },
  {
    freq: 'SECONDLY', interval: 1, start: '2026-10-25T02:59:58+02:00[Europe/Paris]',
    expected: [
      '2026-10-25T00:59:58Z', '2026-10-25T00:59:59Z', '2026-10-25T01:00:00Z',
      '2026-10-25T01:00:01Z', '2026-10-25T01:00:02Z', '2026-10-25T01:00:03Z',
    ],
  },
]) {
  for (const limit of ['COUNT', 'UNTIL', 'unbounded']) {
    test(`elapsed cadence: ${sample.freq} queries agree across the fold with ${limit}`, () => {
      const endpoints = sample.expected.map(instant);
      const last = endpoints.at(-1);
      const rule = new ElapsedSource({
        start: Temporal.ZonedDateTime.from(sample.start).toInstant(),
        every: `PT${sample.interval}${{ HOURLY: 'H', MINUTELY: 'M', SECONDLY: 'S' }[sample.freq]}`,
        tzid: 'Europe/Paris',
        ...(limit === 'COUNT' ? { count: endpoints.length } : {}),
        ...(limit === 'UNTIL' ? { until: last } : {}),
      });

      assert.deepEqual(utc(rule.between(endpoints[0], last, true)), sample.expected);
      assert.deepEqual(utc(rule.between(endpoints[0], last, false)), sample.expected.slice(1, -1));
      assert.deepEqual(utc(rule.all().slice(0, endpoints.length)), sample.expected);
      for (const [index, endpoint] of endpoints.entries()) {
        assert.equal(rule.occursAt(endpoint), true, `occursAt(${endpoint})`);
        assert.equal(rule.after(endpoint, true)?.toInstant().toString(), sample.expected[index]);
        assert.equal(rule.before(endpoint, true)?.toInstant().toString(), sample.expected[index]);
        if (index + 1 < endpoints.length) {
          assert.equal(rule.after(endpoint, false)?.toInstant().toString(), sample.expected[index + 1]);
          assert.equal(rule.before(endpoints[index + 1], false)?.toInstant().toString(), sample.expected[index]);
        }
      }
      if (limit !== 'unbounded') {
        assert.equal(rule.all().length, endpoints.length);
        assert.equal(rule.after(last, false), null);
      }
    });
  }
}

for (const explicitTime of [false, true]) {
  test(`calendar fold: unbounded daily queries agree with ${explicitTime ? 'explicit' : 'inherited'} time`, () => {
    const rule = cadence('2026-10-24T02:30:00+02:00[Europe/Paris]',
      explicitTime ? { byhour: [2], byminute: [30], bysecond: [0] } : {});
    const lower = instant(expected[0]);
    const upper = instant(expected[2]);

    assert.deepEqual(utc(rule.between(lower, upper, true)), expected);
    assert.deepEqual(utc(rule.all().slice(0, 3)), expected);
    assert.equal(rule.after(lower, false)?.toInstant().toString(), first);
    assert.equal(rule.after(instant(first), false)?.toInstant().toString(), expected[2]);
    assert.equal(rule.after(instant(second), true)?.toInstant().toString(), expected[2]);
    assert.equal(rule.before(instant(second), false)?.toInstant().toString(), first);
    assert.equal(rule.occursAt(instant(first)), true);
    assert.equal(rule.occursAt(instant(second)), false);
  });
}

test('calendar fold: unbounded filtered rule agrees across query methods', () => {
  const rule = source('2026-10-16T20:00:00+02:00[Europe/Paris]', { until: undefined });
  assert.deepEqual(utc(rule.between(instant(expected[0]), instant(expected[2]), true)), expected);
  assert.deepEqual(utc(rule.all().slice(0, 3)), expected);
  assert.equal(rule.after(instant(first), false)?.toInstant().toString(), expected[2]);
  assert.equal(rule.before(instant(second), true)?.toInstant().toString(), first);
  assert.equal(rule.occursAt(instant(first)), true);
  assert.equal(rule.occursAt(instant(second)), false);
});

for (const sample of [
  { start: '20261023T200000', body: 'FREQ=DAILY;BYHOUR=2;BYMINUTE=30;BYSECOND=0;COUNT=3' },
  { start: '20261024T023000', body: 'FREQ=DAILY;UNTIL=20261026T013000Z' },
]) {
  test(`calendar fold: public parsing and normalization preserve ${sample.body}`, () => {
    const parsed = parseRuleString(`DTSTART;TZID=Europe/Paris:${sample.start}\nRRULE:${sample.body}`);
    const spec = buildRuleSpec(normalizeOptions(parsed));
    const rule = new RuleSource(spec);

    assert.equal(spec.tzid, 'Europe/Paris');
    assert.deepEqual(utc(rule.all()), expected);
    assert.deepEqual(utc(rule.between(instant(first), instant(second), true)), [first]);
    assert.equal(rule.after(instant(first), false)?.toInstant().toString(), expected[2]);
    assert.equal(rule.before(instant(second), true)?.toInstant().toString(), first);
    assert.equal(rule.occursAt(instant(first)), true);
    assert.equal(rule.occursAt(instant(second)), false);
  });
}

for (const limit of ['COUNT', 'UNTIL', 'unbounded']) {
  test(`calendar fold: inclusive and exclusive bounds do not introduce the second passage with ${limit}`, () => {
    const rule = source('2026-10-16T20:00:00+02:00[Europe/Paris]', {
      ...(limit === 'COUNT' ? { count: 3, until: undefined } : {}),
      ...(limit === 'unbounded' ? { until: undefined } : {}),
    });
    const earlier = instant(first);
    const later = instant(second);
    const middle = instant('2026-10-25T01:00:00Z');
    const next = instant(expected[2]);

    assert.deepEqual(utc(rule.between(earlier, earlier, true)), [first]);
    assert.deepEqual(utc(rule.between(earlier, earlier, false)), []);
    assert.deepEqual(utc(rule.between(earlier, later, true)), [first]);
    assert.deepEqual(utc(rule.between(earlier, later, false)), []);
    assert.deepEqual(utc(rule.between(middle, later, true)), []);
    assert.deepEqual(utc(rule.between(later, next, true)), [expected[2]]);
    assert.deepEqual(utc(rule.between(later, next, false)), []);
    assert.equal(rule.after(earlier, true)?.toInstant().toString(), first);
    assert.equal(rule.after(earlier, false)?.toInstant().toString(), expected[2]);
    assert.equal(rule.before(earlier, true)?.toInstant().toString(), first);
    assert.equal(rule.before(earlier, false)?.toInstant().toString(), expected[0]);
    for (const inclusive of [false, true]) {
      assert.equal(rule.after(middle, inclusive)?.toInstant().toString(), expected[2]);
      assert.equal(rule.before(middle, inclusive)?.toInstant().toString(), first);
      assert.equal(rule.after(later, inclusive)?.toInstant().toString(), expected[2]);
      assert.equal(rule.before(later, inclusive)?.toInstant().toString(), first);
    }
  });
}

for (const sample of [
  { start: '2026-10-25T02:15:00+02:00[Europe/Paris]', expected: [first, expected[2]] },
  { start: '2026-10-25T02:45:00+02:00[Europe/Paris]', expected: [expected[2]] },
  { start: '2026-10-25T02:15:00+01:00[Europe/Paris]', expected: [expected[2]] },
  { start: '2026-10-25T02:45:00+01:00[Europe/Paris]', expected: [expected[2]] },
]) {
  test(`calendar fold: DTSTART ${sample.start} excludes earlier calendar occurrences`, () => {
    const rule = source(sample.start);
    const start = Temporal.ZonedDateTime.from(sample.start).toInstant();
    assert.deepEqual(utc(rule.all()), sample.expected);
    assert.deepEqual(utc(rule.between(start, instant(expected[2]), true)), sample.expected);
    assert.equal(rule.after(start, true)?.toInstant().toString(), sample.expected[0]);
    assert.equal(rule.before(start, false), null);
    assert.equal(rule.occursAt(instant(first)), sample.expected.includes(first));
    assert.equal(rule.occursAt(instant(second)), false);
  });
}

test('calendar fold: skipped passages before DTSTART do not consume COUNT', () => {
  const rule = cadence('2026-10-25T02:15:00+01:00[Europe/Paris]', {
    count: 2, byhour: [2], byminute: [30], bysecond: [0],
  });
  assert.deepEqual(utc(rule.all()), [expected[2], '2026-10-27T01:30:00Z']);
  assert.equal(rule.occursAt(instant(first)), false);
  assert.equal(rule.occursAt(instant(second)), false);
});
