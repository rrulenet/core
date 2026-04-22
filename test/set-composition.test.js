import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';

import { datetime, Frequency, RRule, RRuleSet } from './support/compat.js';

function supportsCalendar(calendar) {
  try {
    Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]').withCalendar(calendar);
    return true;
  } catch {
    return false;
  }
}

test('set: exclusion works', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exdate(datetime(2026, 4, 12, 9, 0, 0));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
  ]);
});

test('set: between honors inclusive boundaries', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 4,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  assert.deepEqual(
    set.between(new Date('2026-04-12T09:00:00.000Z'), new Date('2026-04-13T09:00:00.000Z'), true).map((value) => value.toISOString()),
    ['2026-04-12T09:00:00.000Z', '2026-04-13T09:00:00.000Z'],
  );
});

test('set: set after and before work with mixed sources', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  }));
  set.rdate(new Date('2026-03-31T07:00:00.000Z'));
  set.exdate(new Date('2026-03-29T07:00:00.000Z'));

  assert.equal(set.after(new Date('2026-03-28T08:00:00.000Z'))?.toISOString(), '2026-03-30T07:00:00.000Z');
  assert.equal(set.before(new Date('2026-03-31T07:00:00.000Z'), true)?.toISOString(), '2026-03-31T07:00:00.000Z');
});

test('set: between in named timezone keeps deterministic ordering', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  }));
  set.rdate(new Date('2026-03-28T12:00:00.000Z'));

  assert.deepEqual(
    set
      .between(new Date('2026-03-28T00:00:00.000Z'), new Date('2026-03-30T23:59:59.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-03-28T08:00:00.000Z',
      '2026-03-28T12:00:00.000Z',
      '2026-03-29T07:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
    ],
  );
});

test('set: dedupes duplicate instants across rule and rdate', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-12T09:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
  ]);
});

test('set: exclusions win over duplicate included sources', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-12T09:00:00.000Z'));
  set.exdate(new Date('2026-04-12T09:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
  ]);
});

test('set: union of multiple rules is globally ordered', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  }));
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    byweekday: [RRule.WE],
    dtstart: datetime(2026, 4, 15, 9, 0, 0),
  }));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-04-13T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
    '2026-04-22T09:00:00.000Z',
    '2026-04-27T09:00:00.000Z',
    '2026-04-29T09:00:00.000Z',
  ]);
});

test('set: exrule subtracts only matching instants from the union', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 5,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 20, 9, 0, 0),
  }));
  set.exrule(new RRule({
    freq: Frequency.DAILY,
    interval: 2,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-04-12T09:00:00.000Z',
    '2026-04-14T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
    '2026-04-21T09:00:00.000Z',
  ]);
});

test('set: count reflects composed unique result', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-12T09:00:00.000Z'));
  set.rdate(new Date('2026-04-15T09:00:00.000Z'));
  set.exdate(new Date('2026-04-11T09:00:00.000Z'));

  assert.equal(set.count(), 3);
});

test('set: after prefers the earliest included instant across heterogeneous sources', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-11T08:30:00.000Z'));

  assert.equal(
    set.after(new Date('2026-04-11T08:00:00.000Z'))?.toISOString(),
    '2026-04-11T08:30:00.000Z',
  );
});

test('set: before prefers the latest included instant across heterogeneous sources', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-11T08:30:00.000Z'));

  assert.equal(
    set.before(new Date('2026-04-11T09:30:00.000Z'))?.toISOString(),
    '2026-04-11T09:00:00.000Z',
  );
});

test('set: inclusive after skips excluded exact-match instants', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exdate(new Date('2026-04-12T09:00:00.000Z'));

  assert.equal(
    set.after(new Date('2026-04-12T09:00:00.000Z'), true)?.toISOString(),
    '2026-04-13T09:00:00.000Z',
  );
});

test('set: inclusive before skips excluded exact-match instants', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exdate(new Date('2026-04-12T09:00:00.000Z'));

  assert.equal(
    set.before(new Date('2026-04-12T09:00:00.000Z'), true)?.toISOString(),
    '2026-04-11T09:00:00.000Z',
  );
});

test('set: between excludes removed instants even when boundaries are inclusive', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 4,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exrule(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 12, 9, 0, 0),
  }));

  assert.deepEqual(
    set
      .between(new Date('2026-04-12T09:00:00.000Z'), new Date('2026-04-13T09:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    ['2026-04-13T09:00:00.000Z'],
  );
});

test('set/timezone: explicit Paris rdate sorts correctly against Paris rule occurrences', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  }));
  set.rdate(new Date('2026-03-28T07:30:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-03-28T07:30:00.000Z',
    '2026-03-28T08:00:00.000Z',
    '2026-03-29T07:00:00.000Z',
  ]);
});

test('set/timezone: exdate in named timezone removes matching wall-time occurrence', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  }));
  set.exdate(new Date('2026-03-29T07:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
  ]);
});

test('set/timezone: mixed UTC rdate and Paris rule stay ordered by instant', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  }));
  set.rdate(new Date('2026-03-29T06:30:00.000Z'));

  assert.deepEqual(
    set
      .between(new Date('2026-03-28T00:00:00.000Z'), new Date('2026-03-30T00:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-03-28T08:00:00.000Z',
      '2026-03-29T06:30:00.000Z',
      '2026-03-29T07:00:00.000Z',
    ],
  );
});

test('set/timezone: after and before remain correct around DST-crossing explicit dates', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  }));
  set.rdate(new Date('2026-03-29T06:30:00.000Z'));

  assert.equal(
    set.after(new Date('2026-03-29T06:00:00.000Z'))?.toISOString(),
    '2026-03-29T06:30:00.000Z',
  );
  assert.equal(
    set.before(new Date('2026-03-29T07:00:00.000Z'), true)?.toISOString(),
    '2026-03-29T07:00:00.000Z',
  );
});

test('set/dense: between stays correct on mixed minutely sources with exclusions', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.MINUTELY,
    count: 8,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    bysecond: [0, 30],
  }));
  set.rdate(new Date('2026-04-11T09:01:15.000Z'));
  set.exdate(new Date('2026-04-11T09:01:30.000Z'));

  assert.deepEqual(
    set
      .between(new Date('2026-04-11T09:00:15.000Z'), new Date('2026-04-11T09:02:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:30.000Z',
      '2026-04-11T09:01:00.000Z',
      '2026-04-11T09:01:15.000Z',
      '2026-04-11T09:02:00.000Z',
    ],
  );
});

test('set/dense: after and before stay correct on mixed secondly sources', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.SECONDLY,
    count: 8,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byminute: [0, 1],
    bysecond: [10, 20],
  }));
  set.rdate(new Date('2026-04-11T09:00:15.000Z'));

  assert.equal(
    set.after(new Date('2026-04-11T09:00:12.000Z'))?.toISOString(),
    '2026-04-11T09:00:15.000Z',
  );
  assert.equal(
    set.before(new Date('2026-04-11T09:01:10.000Z'), false)?.toISOString(),
    '2026-04-11T09:00:20.000Z',
  );
});

test('set/dense: inclusive boundaries still honor exclusions on dense recurrences', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.MINUTELY,
    count: 8,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    bysecond: [0, 30],
  }));
  set.exdate(new Date('2026-04-11T09:01:00.000Z'));

  assert.deepEqual(
    set
      .between(new Date('2026-04-11T09:01:00.000Z'), new Date('2026-04-11T09:01:30.000Z'), true)
      .map((value) => value.toISOString()),
    ['2026-04-11T09:01:30.000Z'],
  );
  assert.equal(
    set.after(new Date('2026-04-11T09:01:00.000Z'), true)?.toISOString(),
    '2026-04-11T09:01:30.000Z',
  );
});

test('set/order: builder insertion order does not change composed results', () => {
  const a = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  });
  const b = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    byweekday: [RRule.WE],
    dtstart: datetime(2026, 4, 15, 9, 0, 0),
  });

  const setA = new RRuleSet();
  setA.rrule(a);
  setA.rrule(b);
  setA.rdate(new Date('2026-04-14T09:00:00.000Z'));
  setA.exdate(new Date('2026-04-22T09:00:00.000Z'));

  const setB = new RRuleSet();
  setB.exdate(new Date('2026-04-22T09:00:00.000Z'));
  setB.rdate(new Date('2026-04-14T09:00:00.000Z'));
  setB.rrule(b);
  setB.rrule(a);

  assert.deepEqual(
    setA.all().map((value) => value.toISOString()),
    setB.all().map((value) => value.toISOString()),
  );
});

test('set/order: bounded queries are stable across equivalent construction orders', () => {
  const buildA = () => {
    const set = new RRuleSet();
    set.rrule(new RRule({
      freq: Frequency.MINUTELY,
      count: 8,
      dtstart: datetime(2026, 4, 11, 9, 0, 0),
      bysecond: [0, 30],
    }));
    set.rdate(new Date('2026-04-11T09:01:15.000Z'));
    set.exdate(new Date('2026-04-11T09:01:30.000Z'));
    return set;
  };

  const buildB = () => {
    const set = new RRuleSet();
    set.exdate(new Date('2026-04-11T09:01:30.000Z'));
    set.rdate(new Date('2026-04-11T09:01:15.000Z'));
    set.rrule(new RRule({
      freq: Frequency.MINUTELY,
      count: 8,
      dtstart: datetime(2026, 4, 11, 9, 0, 0),
      bysecond: [0, 30],
    }));
    return set;
  };

  const setA = buildA();
  const setB = buildB();

  assert.deepEqual(
    setA
      .between(new Date('2026-04-11T09:00:15.000Z'), new Date('2026-04-11T09:02:00.000Z'), true)
      .map((value) => value.toISOString()),
    setB
      .between(new Date('2026-04-11T09:00:15.000Z'), new Date('2026-04-11T09:02:00.000Z'), true)
      .map((value) => value.toISOString()),
  );

  assert.equal(
    setA.after(new Date('2026-04-11T09:01:00.000Z'), true)?.toISOString(),
    setB.after(new Date('2026-04-11T09:01:00.000Z'), true)?.toISOString(),
  );
});

test('set/timezone+dense: bysetpos-based rule and explicit date remain consistent across DST', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
    bysetpos: -1,
  }));
  set.rdate(new Date('2026-03-29T15:00:00.000Z'));

  assert.deepEqual(
    set.all().map((value) => value.toISOString()),
    [
      '2026-03-28T16:30:00.000Z',
      '2026-03-29T15:00:00.000Z',
      '2026-03-29T15:30:00.000Z',
      '2026-03-30T15:30:00.000Z',
    ],
  );
});

test('set/timezone+dense: bounded queries stay correct with bysetpos-based rule and exclusions', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
    bysetpos: -1,
  }));
  set.exdate(new Date('2026-03-29T15:30:00.000Z'));

  assert.deepEqual(
    set
      .between(new Date('2026-03-29T15:00:00.000Z'), new Date('2026-03-30T15:30:00.000Z'), true)
      .map((value) => value.toISOString()),
    ['2026-03-30T15:30:00.000Z'],
  );
  assert.equal(
    set.after(new Date('2026-03-29T15:30:00.000Z'), true)?.toISOString(),
    '2026-03-30T15:30:00.000Z',
  );
});

test('set/timezone+dense: excluding one ambiguous fall-back instant does not remove the other', () => {
  const set = new RRuleSet();
  set.tzid('Europe/Paris');
  set.rrule(new RRule({
    freq: Frequency.HOURLY,
    count: 5,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 10, 24, 23, 0, 0),
  }));
  set.exdate(new Date('2026-10-25T01:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2026-10-24T23:00:00.000Z',
    '2026-10-25T00:00:00.000Z',
    '2026-10-25T02:00:00.000Z',
    '2026-10-25T03:00:00.000Z',
  ]);
  assert.equal(
    set.after(new Date('2026-10-25T00:00:00.000Z'), false)?.toISOString(),
    '2026-10-25T02:00:00.000Z',
  );
});

test('set/rscale: rruleset composes hebrew yearly rules without special set-side logic', { skip: !supportsCalendar('hebrew') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');

  for (let i = 0; i < 800; i += 1) {
    const hebrew = cursor.withCalendar('hebrew');
    if (hebrew.monthCode === 'M01' && hebrew.day === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const set = new RRuleSet();
  set.rrule(RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3`));
  set.exdate(new Date('2025-09-23T00:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2024-10-03T00:00:00.000Z',
    '2026-09-12T00:00:00.000Z',
  ]);
});
