import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { RuleSource } from '../dist/engine.mjs';
import { parseRuleString } from '../dist/rule.mjs';
import { rrulestr } from './support/compat.js';

const iso = rule => rule.all().map(date => date.toISOString());

test('iCalendar date properties accept quoted TZID and either parameter order', () => {
  for (const header of [
    'DTSTART;VALUE=DATE-TIME;TZID="America/New_York"',
    'DTSTART;TZID="America/New_York";VALUE=DATE-TIME',
    'dtstart;tzid=America/New_York;value=date-time',
  ]) {
    const text = `${header}:20260307T090000\nRRULE:FREQ=DAILY;COUNT=3`;
    assert.equal(parseRuleString(text).tzid, 'America/New_York');
    assert.deepEqual(iso(rrulestr(text)), [
      '2026-03-07T14:00:00.000Z', '2026-03-08T13:00:00.000Z', '2026-03-09T13:00:00.000Z',
    ]);
  }
});

test('quoted RDATE and EXDATE parameters retain their local timezone across DST', () => {
  const text = [
    'DTSTART;TZID="America/New_York":20260307T090000',
    'RRULE:FREQ=DAILY;COUNT=3',
    'EXDATE;TZID="America/New_York";VALUE=DATE-TIME:20260308T090000',
    'RDATE;VALUE=DATE-TIME;TZID="America/\r\n New_York":20260310T090000',
  ].join('\n');
  const rule = rrulestr(text);
  const expected = ['2026-03-07T14:00:00.000Z', '2026-03-09T13:00:00.000Z', '2026-03-10T13:00:00.000Z'];
  assert.deepEqual(iso(rule), expected);
  assert.deepEqual(iso(rrulestr(rule.toString())), expected);
});

test('quoted parameter delimiters do not truncate a timezone offset', () => {
  const parsed = parseRuleString('DTSTART;TZID="+05:30";VALUE=DATE-TIME:20260101T090000');
  assert.equal(parsed.tzid, '+05:30');
  assert.equal(parsed.dtstart.toISOString(), '2026-01-01T03:30:00.000Z');
});

test('yearly last week uses WKST when determining whether the year has 53 weeks', () => {
  for (const weekday of ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']) {
    const rule = rrulestr(`DTSTART:19970101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=-1;WKST=SU;BYDAY=${weekday};COUNT=1`);
    const offset = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(weekday);
    const expected = new Date('1997-12-28T09:00:00Z');
    expected.setUTCDate(expected.getUTCDate() + offset);
    assert.deepEqual(iso(rule), [expected.toISOString()]);
  }
});

test('yearly ordinal weekdays are selected within the entire year', () => {
  const source = new RuleSource({ freq: 'YEARLY', interval: 1, wkst: 0,
    dtstart: Temporal.ZonedDateTime.from('1997-05-19T09:00:00[UTC]'), tzid: 'UTC',
    byweekday: [{ weekday: 0, ordinal: 20 }], count: 3 });
  assert.deepEqual(source.all().map(date => date.toPlainDate().toString()), ['1997-05-19', '1998-05-18', '1999-05-17']);
  const negative = rrulestr('DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;BYDAY=-20MO;COUNT=2');
  assert.deepEqual(iso(negative), ['2025-08-18T09:00:00.000Z', '2026-08-17T09:00:00.000Z']);
  const limited = rrulestr('DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;BYYEARDAY=138,139;BYDAY=20MO;COUNT=2');
  assert.deepEqual(iso(limited), ['2025-05-19T09:00:00.000Z', '2026-05-18T09:00:00.000Z']);
});

test('lenient monthly year-day and week-number filters match classic expansion', () => {
  assert.deepEqual(iso(rrulestr('DTSTART:19970902T090000Z\nRRULE:FREQ=MONTHLY;BYYEARDAY=-365,-266,-166,-1;COUNT=4')), [
    '1997-12-31T09:00:00.000Z', '1998-01-01T09:00:00.000Z', '1998-04-10T09:00:00.000Z', '1998-07-19T09:00:00.000Z',
  ]);
  assert.deepEqual(iso(rrulestr('DTSTART:19970902T090000Z\nRRULE:FREQ=MONTHLY;BYWEEKNO=20;COUNT=3')), [
    '1998-05-11T09:00:00.000Z', '1998-05-12T09:00:00.000Z', '1998-05-13T09:00:00.000Z',
  ]);
});

test('classic DAILY/WEEKLY ordinal weekdays and BYWEEKDAY alias retain plain weekday filtering', () => {
  for (const frequency of ['DAILY', 'WEEKLY']) {
    for (const property of ['BYDAY', 'BYWEEKDAY']) {
      assert.deepEqual(iso(rrulestr(`DTSTART:19970902T090000Z\nRRULE:FREQ=${frequency};${property}=1TU,-1TH;COUNT=3`)), [
        '1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z',
      ]);
    }
  }
});

test('year-week spillover is visible to bounded and directional queries', () => {
  for (const bounded of [false, true]) {
    const rule = rrulestr(`DTSTART:19970902T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO${bounded ? ';UNTIL=19971231T235959Z' : ''}`);
    const lower = new Date('1997-12-28T00:00:00Z');
    const upper = new Date('1997-12-31T23:59:59Z');
    const expected = '1997-12-29T09:00:00.000Z';
    assert.deepEqual(rule.between(lower, upper, true).map(date => date.toISOString()), [expected]);
    assert.equal(rule.after(lower).toISOString(), expected);
    assert.equal(rule.before(upper).toISOString(), expected);
  }
});

const denseSpec = overrides => ({ freq: 'YEARLY', interval: 1, wkst: 0, tzid: 'UTC',
  dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]'),
  bymonth: Array.from({ length: 12 }, (_, i) => i + 1),
  bymonthday: Array.from({ length: 31 }, (_, i) => i + 1),
  byhour: Array.from({ length: 24 }, (_, i) => i),
  byminute: Array.from({ length: 60 }, (_, i) => i),
  bysecond: Array.from({ length: 60 }, (_, i) => i), ...overrides });

test('dense calendar periods construct only required COUNT and positional slots', () => {
  const utc = source => source.all().map(date => date.toInstant().toString());
  assert.deepEqual(utc(new RuleSource(denseSpec({ count: 3 }))), [
    '2025-01-01T00:00:00Z', '2025-01-01T00:00:01Z', '2025-01-01T00:00:02Z',
  ]);
  assert.deepEqual(utc(new RuleSource(denseSpec({ count: 3, bysetpos: [-1, 1, -3, 1] }))), [
    '2025-01-01T00:00:00Z', '2025-12-31T23:59:57Z', '2025-12-31T23:59:59Z',
  ]);
});

test('dense query windows clip clock slots after full-period BYSETPOS selection', () => {
  const source = new RuleSource(denseSpec());
  const lower = Temporal.Instant.from('2025-06-15T12:00:00Z');
  const upper = lower.add({ seconds: 3 });
  assert.deepEqual(source.between(lower, upper, true).map(date => date.toInstant().toString()), [
    '2025-06-15T12:00:00Z', '2025-06-15T12:00:01Z', '2025-06-15T12:00:02Z', '2025-06-15T12:00:03Z',
  ]);
  assert.equal(source.after(lower, false).toInstant().toString(), '2025-06-15T12:00:01Z');
  assert.equal(source.before(lower, false).toInstant().toString(), '2025-06-15T11:59:59Z');
  const positional = new RuleSource(denseSpec({ bysetpos: [1, -1] }));
  assert.deepEqual(positional.between(lower, upper, true), []);
  assert.equal(positional.before(upper, true).toInstant().toString(), '2025-01-01T00:00:00Z');
});

test('streaming iteration can stop before a dense calendar period is expanded', () => {
  const source = new RuleSource(denseSpec());
  const iterator = source.iterate();
  assert.equal(iterator.next().value.toInstant().toString(), '2025-01-01T00:00:00Z');
  iterator.return();
  const sparse = new RuleSource({ ...denseSpec(), byhour: [9], byminute: [0], bysecond: [0] });
  let count = 0;
  for (const value of sparse.iterate()) {
    assert.ok(value);
    if (++count === 1000) break;
  }
  assert.equal(count, 1000);
});

test('point queries and narrow windows do not materialize an entire large COUNT', () => {
  const start = Temporal.ZonedDateTime.from('2026-01-01T00:00:00[UTC]');
  const source = new RuleSource({ freq: 'SECONDLY', interval: 1, wkst: 0, dtstart: start, tzid: 'UTC', count: 1_000_000_000 });
  const first = start.toInstant();
  assert.equal(source.after(first, true).toInstant().toString(), '2026-01-01T00:00:00Z');
  assert.equal(source.after(first, false).toInstant().toString(), '2026-01-01T00:00:01Z');
  assert.equal(source.before(first.add({ seconds: 3 }), false).toInstant().toString(), '2026-01-01T00:00:02Z');
  assert.deepEqual(source.between(first, first.add({ seconds: 2 }), true).map(date => date.toInstant().toString()), [
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z',
  ]);
  const distant = Temporal.Instant.from('2050-01-01T00:00:00Z');
  assert.equal(source.after(distant, true).toInstant().toString(), distant.toString());
  assert.equal(source.before(distant, false).toInstant().toString(), '2049-12-31T23:59:59Z');
  // Filtered shapes retain traversal, but still stop at the query boundary.
  const filtered = new RuleSource({ freq: 'DAILY', interval: 1, wkst: 0, dtstart: start, tzid: 'UTC',
    count: 1_000_000_000, byhour: [0, 12] });
  assert.equal(filtered.after(first, false).toInstant().toString(), '2026-01-01T12:00:00Z');
  const gregorian = new RuleSource({ freq: 'DAILY', interval: 1, wkst: 0, dtstart: start.withCalendar('gregory'), tzid: 'UTC', count: 2 });
  assert.equal(gregorian.after(first, true).calendarId, 'gregory');
});
