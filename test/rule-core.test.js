import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';

import { datetime, Frequency, RRule } from './support/compat.js';

function supportsCalendar(calendar) {
  try {
    Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]').withCalendar(calendar);
    return true;
  } catch {
    return false;
  }
}

function weekIndexHebrew(pd, wkst) {
  const weekStart = pd.subtract({ days: (pd.dayOfWeek - wkst + 7) % 7 });
  const thursday = weekStart.add({ days: (4 - wkst + 7) % 7 });
  const weekYear = thursday.year;
  const jan4 = Temporal.PlainDate.from({ calendar: 'hebrew', year: weekYear, month: 1, day: 4 });
  const firstStart = jan4.subtract({ days: (jan4.dayOfWeek - wkst + 7) % 7 });
  return Math.floor(pd.since(firstStart).days / 7) + 1;
}

test('rule: daily count works', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
  ]);
});

test('rule: weekly byweekday works', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 4,
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
    byweekday: [RRule.MO, RRule.WE],
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-13T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
    '2026-04-22T09:00:00.000Z',
  ]);
});

test('rule: monthly bymonthday works', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 3,
    dtstart: datetime(2026, 1, 31, 9, 0, 0),
    bymonthday: 31,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-01-31T09:00:00.000Z',
    '2026-03-31T09:00:00.000Z',
    '2026-05-31T09:00:00.000Z',
  ]);
});

test('rule: daily bymonthday filter works', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    bymonthday: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-03T09:00:00.000Z',
    '1997-10-01T09:00:00.000Z',
    '1997-10-03T09:00:00.000Z',
  ]);
});

test('rule: daily byweekday filter works', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    byweekday: [RRule.MO, RRule.WE],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-03T09:00:00.000Z',
    '1997-09-08T09:00:00.000Z',
    '1997-09-10T09:00:00.000Z',
  ]);
});

test('rule: weekly between works', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO],
    count: 8,
    dtstart: datetime(2025, 1, 6, 10, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2025-01-10T00:00:00.000Z'), new Date('2025-01-21T00:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    ['2025-01-13T10:00:00.000Z', '2025-01-20T10:00:00.000Z'],
  );
});

test('rule: between preserves large interval spacing', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    interval: 53,
    count: 5,
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
    tzid: 'UTC',
  });

  assert.deepEqual(
    rule
      .between(new Date('2025-02-01T00:00:00.000Z'), new Date('2025-04-30T23:59:59.000Z'), true)
      .map((value) => value.toISOString()),
    ['2025-02-23T09:00:00.000Z', '2025-04-17T09:00:00.000Z'],
  );
});

test('rule: weekly byweekday order does not affect results', () => {
  const ruleA = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.WE, RRule.FR],
    count: 6,
    dtstart: datetime(2025, 1, 6, 10, 0, 0),
  });
  const ruleB = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.FR, RRule.MO, RRule.WE],
    count: 6,
    dtstart: datetime(2025, 1, 6, 10, 0, 0),
  });

  assert.deepEqual(
    ruleA.all().map((value) => value.toISOString()),
    ruleB.all().map((value) => value.toISOString()),
  );
});

test('rule: daily until excludes non-matching later time on the boundary day', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
    until: new Date('1997-09-05T08:00:00.000Z'),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-09-03T09:00:00.000Z',
    '1997-09-04T09:00:00.000Z',
  ]);
});

test('rule: weekly interval grouping with TU and SU changes with WKST', () => {
  const mo = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    interval: 2,
    byweekday: [RRule.TU, RRule.SU],
    wkst: RRule.MO,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });
  const su = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    interval: 2,
    byweekday: [RRule.TU, RRule.SU],
    wkst: RRule.SU,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(mo.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-09-07T09:00:00.000Z',
    '1997-09-16T09:00:00.000Z',
  ]);
  assert.deepEqual(su.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-09-14T09:00:00.000Z',
    '1997-09-16T09:00:00.000Z',
  ]);
});

test('rule: weekly count limits total emitted occurrences even with multiple weekdays', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 1,
    interval: 1,
    wkst: RRule.MO,
    byweekday: [RRule.MO, RRule.TU],
    dtstart: new Date('2023-08-30T22:28:00.000Z'),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), ['2023-09-04T22:28:00.000Z']);
});

test('rule: before and after behave correctly', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 5,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  assert.equal(rule.after(new Date('2026-04-12T00:00:00.000Z'))?.toISOString(), '2026-04-12T09:00:00.000Z');
  assert.equal(rule.before(new Date('2026-04-13T12:00:00.000Z'))?.toISOString(), '2026-04-13T09:00:00.000Z');
  assert.equal(rule.after(new Date('2026-04-12T09:00:00.000Z'), true)?.toISOString(), '2026-04-12T09:00:00.000Z');
  assert.equal(rule.before(new Date('2026-04-13T09:00:00.000Z'), true)?.toISOString(), '2026-04-13T09:00:00.000Z');
});

test('rule: all supports rrule.js-style iterator callback', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  assert.deepEqual(
    rule.all((_, index) => index < 3).map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:00.000Z',
      '2026-04-12T09:00:00.000Z',
      '2026-04-13T09:00:00.000Z',
    ],
  );
});

test('rule: between supports rrule.js-style iterator callback', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 5,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-04-11T00:00:00.000Z'), new Date('2026-04-15T23:59:59.000Z'), true, (_, index) => index < 2)
      .map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:00.000Z',
      '2026-04-12T09:00:00.000Z',
    ],
  );
});

test('rule: toJSON returns defensive date copies', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    until: new Date('2026-04-13T09:00:00.000Z'),
  });

  const json = rule.toJSON();
  json.dtstart?.setUTCDate(30);
  json.until?.setUTCDate(30);

  assert.equal(rule.origOptions.dtstart?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(rule.origOptions.until?.toISOString(), '2026-04-13T09:00:00.000Z');
});

test('rule: constructor does not mutate the passed options object', () => {
  const options = {
    freq: Frequency.MONTHLY,
    dtstart: new Date(2013, 0, 1),
    count: 3,
    bymonthday: [28],
  };

  const rule = new RRule(options);

  assert.deepEqual(options, {
    freq: Frequency.MONTHLY,
    dtstart: new Date(2013, 0, 1),
    count: 3,
    bymonthday: [28],
  });
  assert.deepEqual(rule.origOptions, options);
});

test('rule: options exposes normalized defaults while origOptions preserves caller shape', () => {
  const rule = new RRule({
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  assert.deepEqual(rule.origOptions, {
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });
  assert.equal(rule.options.freq, Frequency.DAILY);
  assert.equal(rule.options.interval, 1);
  assert.equal(rule.options.count, 3);
  assert.equal(rule.options.dtstart?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(rule.options.until, null);
  assert.equal(rule.options.tzid, null);
  assert.equal(rule.options.wkst, null);
});

test('rule: clone is independent from origOptions date mutation', () => {
  const original = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    until: new Date('2026-04-13T09:00:00.000Z'),
  });

  const cloned = original.clone();
  cloned.origOptions.dtstart?.setUTCDate(30);
  cloned.origOptions.until?.setUTCDate(30);

  assert.equal(original.origOptions.dtstart?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(original.origOptions.until?.toISOString(), '2026-04-13T09:00:00.000Z');
});

test('rule: noCache disables all() result reuse', () => {
  const cached = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });
  const uncached = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }, true);

  assert.equal(cached.all(), cached.all());
  assert.notEqual(uncached.all(), uncached.all());
});

test('rule: before and after honor the inclusive flag', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  const pivot = new Date('2026-04-12T09:00:00.000Z');

  assert.equal(rule.before(pivot)?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(rule.before(pivot, true)?.toISOString(), '2026-04-12T09:00:00.000Z');
  assert.equal(rule.after(pivot)?.toISOString(), '2026-04-13T09:00:00.000Z');
  assert.equal(rule.after(pivot, true)?.toISOString(), '2026-04-12T09:00:00.000Z');
});

test('rule: query methods reject invalid dates', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });
  const invalid = new Date(undefined);
  const valid = new Date('2026-04-11T00:00:00.000Z');

  assert.throws(() => rule.before(invalid), /Invalid date/);
  assert.throws(() => rule.after(invalid), /Invalid date/);
  assert.throws(() => rule.between(invalid, valid), /Invalid date/);
  assert.throws(() => rule.between(valid, invalid), /Invalid date/);
});

test('rule: parseText parses basic daily text', () => {
  const parsed = RRule.parseText('every day for 3 times');

  assert.equal(parsed.freq, Frequency.DAILY);
  assert.equal(parsed.interval, undefined);
  assert.equal(parsed.count, 3);
});

test('rule: parseText parses ISO until text', () => {
  const parsed = RRule.parseText('every day until 2023-05-10T04:00:00.000Z');

  assert.equal(parsed.freq, Frequency.DAILY);
  assert.equal(parsed.until?.toISOString(), '2023-05-10T04:00:00.000Z');
});

test('rule: fromText parses weekly weekday text with time', () => {
  const rule = RRule.fromText('every week on Monday and Wednesday at 9 AM UTC for 4 times starting from April 13, 2026');

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-13T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
    '2026-04-22T09:00:00.000Z',
  ]);
});

test('rule: fromText parses every weekday shorthand', () => {
  const parsed = RRule.parseText('every weekday for 2 times');

  assert.equal(parsed.freq, Frequency.WEEKLY);
  assert.equal(parsed.interval, undefined);
  assert.equal((parsed.byweekday ?? []).length, 5);
});

test('rule: fromText parses interval hour text', () => {
  const rule = RRule.fromText('every 4 hours');

  assert.equal(rule.toString(), 'RRULE:FREQ=HOURLY;INTERVAL=4');
});

test('rule: parseText parses weekly single-weekday text', () => {
  const parsed = RRule.parseText('every week on Tuesday');

  assert.equal(parsed.freq, Frequency.WEEKLY);
  assert.deepEqual((parsed.byweekday ?? []).map((weekday) => weekday.toString()), ['TU']);
});

test('rule: parseText parses weekly weekday list text', () => {
  const rule = RRule.fromText('every week on Monday, Wednesday');

  assert.equal(rule.toString(), 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
});

test('rule: parseText parses weekly weekday text with multiple hours', () => {
  const rule = RRule.fromText('every week on Sunday at 10, 12 and 17');

  assert.equal(rule.toString(), 'RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=10,12,17;BYMINUTE=0;BYSECOND=0');
});

test('rule: parseText parses interval week text', () => {
  const rule = RRule.fromText('every 2 weeks');

  assert.equal(rule.toString(), 'RRULE:FREQ=WEEKLY;INTERVAL=2');
});

test('rule: parseText parses monthly text', () => {
  const parsed = RRule.parseText('every month');

  assert.equal(parsed.freq, Frequency.MONTHLY);
  assert.equal(parsed.interval, undefined);
});

test('rule: parseText parses interval month text', () => {
  const rule = RRule.fromText('every 6 months');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;INTERVAL=6');
});

test('rule: parseText parses plain numeric hour lists', () => {
  const rule = RRule.fromText('every day at 10, 12 and 17');

  assert.equal(rule.toString(), 'RRULE:FREQ=DAILY;BYHOUR=10,12,17;BYMINUTE=0;BYSECOND=0');
});

test('rule: parseText parses monthly ordinal weekday text', () => {
  const rule = RRule.fromText('every month on the 3rd Tuesday');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;BYDAY=+3TU');
});

test('rule: parseText parses monthly last weekday text', () => {
  const rule = RRule.fromText('every month on the last Monday');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;BYDAY=-1MO');
});

test('rule: parseText parses monthly monthday text', () => {
  const rule = RRule.fromText('every month on the 4th last');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-4');
});

test('rule: parseText parses monthly positive monthday text', () => {
  const rule = RRule.fromText('every month on the 4th');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=4');
});

test('rule: parseText parses yearly ordinal weekday text', () => {
  const rule = RRule.fromText('every year on the 1st Friday');

  assert.equal(rule.toString(), 'RRULE:FREQ=YEARLY;BYDAY=+1FR');
});

test('rule: parseText parses larger yearly ordinal weekday text', () => {
  const rule = RRule.fromText('every year on the 13th Friday');

  assert.equal(rule.toString(), 'RRULE:FREQ=YEARLY;BYDAY=+13FR');
});

test('rule: parseText parses monthly reverse ordinal weekday text', () => {
  const rule = RRule.fromText('every month on the 3rd last Tuesday');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;BYDAY=-3TU');
});

test('rule: parseText parses monthly second-last weekday text', () => {
  const rule = RRule.fromText('every month on the 2nd last Friday');

  assert.equal(rule.toString(), 'RRULE:FREQ=MONTHLY;BYDAY=-2FR');
});

test('rule: parseText parses count-only weekly text', () => {
  const rule = RRule.fromText('every week for 20 times');

  assert.equal(rule.toString(), 'RRULE:FREQ=WEEKLY;COUNT=20');
});

test('rule: parseText parses yearly month list text', () => {
  const rule = RRule.fromText('every January, February');

  assert.equal(rule.toString(), 'RRULE:FREQ=YEARLY;BYMONTH=1,2');
});

test('rule: parseText parses yearly month list with ordinal weekday text', () => {
  const rule = RRule.fromText('every January, February on the 1st Friday');

  assert.equal(rule.toString(), 'RRULE:FREQ=YEARLY;BYMONTH=1,2;BYDAY=+1FR');
});

test('rule: rejects interval of 0', () => {
  assert.throws(
    () =>
      new RRule({
        freq: Frequency.DAILY,
        interval: 0,
        dtstart: datetime(2026, 4, 11, 9, 0, 0),
      }),
    /interval must be greater than 0/,
  );
});

test('rule: rejects negative interval', () => {
  assert.throws(
    () =>
      new RRule({
        freq: Frequency.DAILY,
        interval: -1,
        dtstart: datetime(2026, 4, 11, 9, 0, 0),
      }),
    /interval must be greater than 0/,
  );
});

test('rule: rejects invalid dtstart', () => {
  assert.throws(
    () =>
      new RRule({
        freq: Frequency.DAILY,
        // @ts-ignore test invalid input handling
        dtstart: new Date('invalid'),
      }),
    /Invalid dtstart/,
  );
});

test('rule: rejects invalid until', () => {
  assert.throws(
    () =>
      new RRule({
        freq: Frequency.DAILY,
        dtstart: datetime(2026, 4, 11, 9, 0, 0),
        // @ts-ignore test invalid input handling
        until: new Date('invalid'),
      }),
    /Invalid until/,
  );
});

test('rule: count 0 yields no occurrences', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 0,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), []);
});

test('rule: rejects bysetpos containing 0', () => {
  assert.throws(
    () =>
      new RRule({
        freq: Frequency.MONTHLY,
        count: 1,
        bysetpos: [0],
        dtstart: datetime(1997, 9, 2, 9, 0, 0),
      }),
    /bySetPos may not contain 0/,
  );
});

test('rule: ignores invalid bymonth values', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    dtstart: datetime(2019, 12, 19, 0, 0, 0),
    bymonth: [0],
    count: 4,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2019-12-19T00:00:00.000Z',
    '2020-12-19T00:00:00.000Z',
    '2021-12-19T00:00:00.000Z',
    '2022-12-19T00:00:00.000Z',
  ]);
});

test('rule: ignores invalid byyearday values', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    dtstart: datetime(2020, 1, 1, 0, 0, 0),
    byyearday: [0, -1],
    count: 3,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2020-12-31T00:00:00.000Z',
    '2021-12-31T00:00:00.000Z',
    '2022-12-31T00:00:00.000Z',
  ]);
});

test('rule: conflicting byyearday and byweekno parts produce no dates', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    byyearday: [100],
    byweekno: [10],
    count: 1,
    dtstart: datetime(2025, 1, 1, 0, 0, 0),
  });

  assert.deepEqual(rule.all(), []);
});

test('rule: ignores invalid bymonthday values', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
    bymonthday: [0, 31],
    count: 5,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-10-31T09:00:00.000Z',
    '1997-12-31T09:00:00.000Z',
    '1998-01-31T09:00:00.000Z',
    '1998-03-31T09:00:00.000Z',
    '1998-05-31T09:00:00.000Z',
  ]);
});

test('rule: ignores invalid byweekday values from options', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    dtstart: datetime(2019, 12, 19, 0, 0, 0),
    // @ts-ignore exercise runtime filtering
    byweekday: ['TH', 'XX', '0MO'],
    count: 4,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2019-12-19T00:00:00.000Z',
    '2019-12-26T00:00:00.000Z',
    '2020-01-02T00:00:00.000Z',
    '2020-01-09T00:00:00.000Z',
  ]);
});

test('rule: ignores invalid byhour byminute and bysecond values', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2019, 12, 19, 0, 0, 0),
    byhour: [-1, 14, 25],
    byminute: [-1, 30, 60],
    bysecond: [-1, 15, 61],
    count: 4,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2019-12-19T14:30:15.000Z',
    '2019-12-20T14:30:15.000Z',
    '2019-12-21T14:30:15.000Z',
    '2019-12-22T14:30:15.000Z',
  ]);
});

test('rule: monthly first friday with ordinal byweekday works', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    byweekday: [RRule.FR.nth(1)],
    dtstart: datetime(1997, 9, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-05T09:00:00.000Z',
    '1997-10-03T09:00:00.000Z',
    '1997-11-07T09:00:00.000Z',
    '1997-12-05T09:00:00.000Z',
  ]);
});

test('rule: bynweekday aliases ordinal byweekday semantics', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    bynweekday: [[RRule.FR.weekday, 1]],
    dtstart: datetime(1997, 9, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-05T09:00:00.000Z',
    '1997-10-03T09:00:00.000Z',
    '1997-11-07T09:00:00.000Z',
    '1997-12-05T09:00:00.000Z',
  ]);
});

test('rule: monthly bysetpos with weekdays works', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    bysetpos: -1,
    dtstart: datetime(1997, 9, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-30T09:00:00.000Z',
    '1997-10-31T09:00:00.000Z',
    '1997-11-28T09:00:00.000Z',
    '1997-12-31T09:00:00.000Z',
  ]);
});

test('rule: yearly bymonth works', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    bymonth: [1, 6, 12],
    dtstart: datetime(2025, 1, 15, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-01-15T09:00:00.000Z',
    '2025-06-15T09:00:00.000Z',
    '2025-12-15T09:00:00.000Z',
    '2026-01-15T09:00:00.000Z',
  ]);
});

test('rule: yearly first friday of may works', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    bymonth: 5,
    byweekday: [RRule.FR.nth(1)],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-05-02T09:00:00.000Z',
    '1998-05-01T09:00:00.000Z',
    '1999-05-07T09:00:00.000Z',
    '2000-05-05T09:00:00.000Z',
  ]);
});

test('rule: yearly bymonthday without bymonth stays anchored across the year', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    bymonthday: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-03T09:00:00.000Z',
    '1997-10-01T09:00:00.000Z',
    '1997-10-03T09:00:00.000Z',
  ]);
});

test('rule: yearly ordinal byweekday without bymonth spans the whole year', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-12-25T09:00:00.000Z',
    '1998-01-06T09:00:00.000Z',
    '1998-12-31T09:00:00.000Z',
  ]);
});

test('rule: yearly larger ordinal byweekday without bymonth works', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    byweekday: [RRule.TU.nth(3), RRule.TH.nth(-3)],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-12-11T09:00:00.000Z',
    '1998-01-20T09:00:00.000Z',
    '1998-12-17T09:00:00.000Z',
  ]);
});

test('rule: wkst affects weekly interval grouping', () => {
  const mondayWeekStart = new RRule({
    freq: Frequency.WEEKLY,
    interval: 2,
    count: 4,
    wkst: RRule.MO,
    byweekday: [RRule.TU, RRule.SU],
    dtstart: datetime(1997, 8, 5, 9, 0, 0),
  });
  const sundayWeekStart = new RRule({
    freq: Frequency.WEEKLY,
    interval: 2,
    count: 4,
    wkst: RRule.SU,
    byweekday: [RRule.TU, RRule.SU],
    dtstart: datetime(1997, 8, 5, 9, 0, 0),
  });

  assert.notDeepEqual(
    mondayWeekStart.all().map((value) => value.toISOString()),
    sundayWeekStart.all().map((value) => value.toISOString()),
  );
  assert.deepEqual(mondayWeekStart.all().map((value) => value.toISOString()), [
    '1997-08-05T09:00:00.000Z',
    '1997-08-10T09:00:00.000Z',
    '1997-08-19T09:00:00.000Z',
    '1997-08-24T09:00:00.000Z',
  ]);
  assert.deepEqual(sundayWeekStart.all().map((value) => value.toISOString()), [
    '1997-08-05T09:00:00.000Z',
    '1997-08-17T09:00:00.000Z',
    '1997-08-19T09:00:00.000Z',
    '1997-08-31T09:00:00.000Z',
  ]);
});

test('rule: count wins over open-ended generation without truncation drift', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 5,
    byweekday: [RRule.MO, RRule.WE, RRule.FR],
    dtstart: datetime(2026, 4, 10, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-10T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
    '2026-04-17T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
  ]);
});

test('rule: count limits after bysetpos filtering', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 2,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    bysetpos: -1,
    dtstart: datetime(1997, 9, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-30T09:00:00.000Z',
    '1997-10-31T09:00:00.000Z',
  ]);
});

test('rule: monthly bysetpos can select first and last weekdays in the same month', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 6,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    bysetpos: [1, -1],
    dtstart: datetime(1997, 9, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-01T09:00:00.000Z',
    '1997-09-30T09:00:00.000Z',
    '1997-10-01T09:00:00.000Z',
    '1997-10-31T09:00:00.000Z',
    '1997-11-03T09:00:00.000Z',
    '1997-11-28T09:00:00.000Z',
  ]);
});

test('rule: monthly bysetpos remains chronological even when positions are reversed', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 6,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    bysetpos: [-1, 1],
    byhour: [8],
    byminute: [0],
    dtstart: datetime(2025, 1, 1, 12, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-01-31T08:00:00.000Z',
    '2025-02-03T08:00:00.000Z',
    '2025-02-28T08:00:00.000Z',
    '2025-03-03T08:00:00.000Z',
    '2025-03-31T08:00:00.000Z',
    '2025-04-01T08:00:00.000Z',
  ]);
});

test('rule: monthly bysetpos applies after time expansion when multiple byhour values are present', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 3,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    bysetpos: -1,
    byhour: [8, 20],
    byminute: [0],
    dtstart: datetime(2025, 1, 1, 0, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-01-31T20:00:00.000Z',
    '2025-02-28T20:00:00.000Z',
    '2025-03-31T20:00:00.000Z',
  ]);
});

test('rule: monthly leap-day selection remains correct across 2100 in UTC', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 2,
    bymonth: [2],
    bymonthday: [29],
    dtstart: datetime(2099, 1, 1, 9, 0, 0),
    tzid: 'UTC',
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2104-02-29T09:00:00.000Z',
    '2108-02-29T09:00:00.000Z',
  ]);
});

test('rule: monthly negative ordinal weekday works', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    byweekday: [RRule.FR.nth(-1)],
    dtstart: datetime(1997, 9, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-26T09:00:00.000Z',
    '1997-10-31T09:00:00.000Z',
    '1997-11-28T09:00:00.000Z',
    '1997-12-26T09:00:00.000Z',
  ]);
});

test('rule: yearly bymonth can combine first and last weekday ordinals', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 6,
    bymonth: [3, 9],
    byweekday: [RRule.MO.nth(1), RRule.FR.nth(-1)],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-03-03T09:00:00.000Z',
    '1997-03-28T09:00:00.000Z',
    '1997-09-01T09:00:00.000Z',
    '1997-09-26T09:00:00.000Z',
    '1998-03-02T09:00:00.000Z',
    '1998-03-27T09:00:00.000Z',
  ]);
});

test('rule: yearly negative byyearday works', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    byyearday: [-1, -100],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-23T09:00:00.000Z',
    '1997-12-31T09:00:00.000Z',
    '1998-09-23T09:00:00.000Z',
    '1998-12-31T09:00:00.000Z',
  ]);
});

test('rule: yearly bymonth intersects byyearday positively', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    bymonth: [4, 7],
    byyearday: [1, 100, 200, 365],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-04-10T09:00:00.000Z',
    '1998-07-19T09:00:00.000Z',
    '1999-04-10T09:00:00.000Z',
    '1999-07-19T09:00:00.000Z',
  ]);
});

test('rule: yearly bymonth intersects negative byyearday positively', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    bymonth: [4, 7],
    byyearday: [-365, -266, -166, -1],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-04-10T09:00:00.000Z',
    '1998-07-19T09:00:00.000Z',
    '1999-04-10T09:00:00.000Z',
    '1999-07-19T09:00:00.000Z',
  ]);
});

test('rule: weekly byweekno with non-default wkst changes yearly week selection', () => {
  const mondayWeekStart = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    byweekno: [1],
    byweekday: [RRule.MO, RRule.SU],
    wkst: RRule.MO,
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });
  const sundayWeekStart = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    byweekno: [1],
    byweekday: [RRule.MO, RRule.SU],
    wkst: RRule.SU,
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(mondayWeekStart.all().map((value) => value.toISOString()), [
    '1997-01-05T09:00:00.000Z',
    '1997-12-29T09:00:00.000Z',
    '1998-01-04T09:00:00.000Z',
    '1999-01-04T09:00:00.000Z',
  ]);
  assert.deepEqual(sundayWeekStart.all().map((value) => value.toISOString()), [
    '1998-01-04T09:00:00.000Z',
    '1998-01-05T09:00:00.000Z',
    '1999-01-03T09:00:00.000Z',
    '1999-01-04T09:00:00.000Z',
  ]);
});

test('rule: secondly bymonthday filter resets to start of matching day', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 3,
    bymonthday: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-03T00:00:00.000Z',
    '1997-09-03T00:00:01.000Z',
    '1997-09-03T00:00:02.000Z',
  ]);
});

test('rule: minutely ordinal byweekday with bymonth resolves monthly anchors', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 3,
    bymonth: [1, 3],
    byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-06T00:00:00.000Z',
    '1998-01-06T00:01:00.000Z',
    '1998-01-06T00:02:00.000Z',
  ]);
});

test('rule: hourly large interval preserves carried hour offsets', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    count: 3,
    interval: 769,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-10-04T10:00:00.000Z',
    '1997-11-05T11:00:00.000Z',
  ]);
});

test('rule: minutely large interval preserves carried minute offsets', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 3,
    interval: 1501,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-09-03T10:01:00.000Z',
    '1997-09-04T11:02:00.000Z',
  ]);
});

test('rule: secondly large interval preserves carried second offsets', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 3,
    interval: 90061,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-09-03T10:01:01.000Z',
    '1997-09-04T11:02:02.000Z',
  ]);
});

test('rule: secondly ordinal byweekday with bymonth resolves monthly anchors', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 3,
    bymonth: [1, 3],
    byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-06T00:00:00.000Z',
    '1998-01-06T00:00:01.000Z',
    '1998-01-06T00:00:02.000Z',
  ]);
});

test('rule: hourly bymonth filter jumps to next valid month', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    count: 3,
    bymonth: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-01T00:00:00.000Z',
    '1998-01-01T01:00:00.000Z',
    '1998-01-01T02:00:00.000Z',
  ]);
});

test('rule: minutely byweekno and byweekday select first matching ISO week', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 3,
    byweekno: [1],
    byweekday: [RRule.MO],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-12-29T00:00:00.000Z',
    '1997-12-29T00:01:00.000Z',
    '1997-12-29T00:02:00.000Z',
  ]);
});

test('rule: secondly byweekno and byweekday select first matching ISO week', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 3,
    byweekno: [1],
    byweekday: [RRule.MO],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-12-29T00:00:00.000Z',
    '1997-12-29T00:00:01.000Z',
    '1997-12-29T00:00:02.000Z',
  ]);
});

test('rule: secondly large interval carries hour minute and second', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 3,
    interval: 90061,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1997-09-03T10:01:01.000Z',
    '1997-09-04T11:02:02.000Z',
  ]);
});

test('rule: monthly bymonth filter jumps across invalid months predictably', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    bymonth: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-02T09:00:00.000Z',
    '1998-03-02T09:00:00.000Z',
    '1999-01-02T09:00:00.000Z',
    '1999-03-02T09:00:00.000Z',
  ]);
});

test('rule: yearly negative byweekno works', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    byweekno: [-1],
    byweekday: [RRule.MO],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-12-22T09:00:00.000Z',
    '1998-12-28T09:00:00.000Z',
    '1999-12-27T09:00:00.000Z',
    '2000-12-25T09:00:00.000Z',
  ]);
});

test('rule: yearly byweekno 53 only selects years with ISO week 53', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    byweekno: [53],
    byweekday: [RRule.MO],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-12-28T09:00:00.000Z',
    '2004-12-27T09:00:00.000Z',
    '2009-12-28T09:00:00.000Z',
  ]);
});

test('rule: yearly negative bymonthday works', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    bymonth: [2],
    bymonthday: [-1],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-02-28T09:00:00.000Z',
    '1998-02-28T09:00:00.000Z',
    '1999-02-28T09:00:00.000Z',
    '2000-02-29T09:00:00.000Z',
  ]);
});

test('rule: bynmonthday aliases negative bymonthday semantics', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    bymonth: [2],
    bynmonthday: [1],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-02-28T09:00:00.000Z',
    '1998-02-28T09:00:00.000Z',
    '1999-02-28T09:00:00.000Z',
    '2000-02-29T09:00:00.000Z',
  ]);
});

test('rule: yearly byweekno can select multiple weekdays in the same target week', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 6,
    byweekno: [20],
    byweekday: [RRule.MO, RRule.FR],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-05-12T09:00:00.000Z',
    '1997-05-16T09:00:00.000Z',
    '1998-05-11T09:00:00.000Z',
    '1998-05-15T09:00:00.000Z',
    '1999-05-17T09:00:00.000Z',
    '1999-05-21T09:00:00.000Z',
  ]);
});

test('rule: monthly every Tuesday every other month follows the RFC pattern', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    interval: 2,
    byweekday: [RRule.TU],
    dtstart: new Date('1997-09-02T13:00:00.000Z'),
  });

  assert.deepEqual(
    rule.between(new Date('1997-09-02T13:00:00.000Z'), new Date('1998-04-01T13:00:00.000Z'), true).map((value) => value.toISOString()),
    [
      '1997-09-02T13:00:00.000Z',
      '1997-09-09T13:00:00.000Z',
      '1997-09-16T13:00:00.000Z',
      '1997-09-23T13:00:00.000Z',
      '1997-09-30T13:00:00.000Z',
      '1997-11-04T13:00:00.000Z',
      '1997-11-11T13:00:00.000Z',
      '1997-11-18T13:00:00.000Z',
      '1997-11-25T13:00:00.000Z',
      '1998-01-06T13:00:00.000Z',
      '1998-01-13T13:00:00.000Z',
      '1998-01-20T13:00:00.000Z',
      '1998-01-27T13:00:00.000Z',
      '1998-03-03T13:00:00.000Z',
      '1998-03-10T13:00:00.000Z',
      '1998-03-17T13:00:00.000Z',
      '1998-03-24T13:00:00.000Z',
      '1998-03-31T13:00:00.000Z',
    ],
  );
});

test('rule: minutely with byday and a single byhour does not skip whole weeks', () => {
  const rule = RRule.fromString(
    'DTSTART:20230901T090000Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;BYDAY=MO;BYHOUR=9;UNTIL=20231231T235900',
  );

  assert.deepEqual(rule.all().slice(0, 6).map((date) => date.toISOString()), [
    '2023-09-04T09:00:00.000Z',
    '2023-09-11T09:00:00.000Z',
    '2023-09-18T09:00:00.000Z',
    '2023-09-25T09:00:00.000Z',
    '2023-10-02T09:00:00.000Z',
    '2023-10-09T09:00:00.000Z',
  ]);
});

test('rule: monthly rules mixing ordinal and plain byday values are not empty', () => {
  const rule = RRule.fromString('DTSTART:20230401T080000Z\nRRULE:FREQ=MONTHLY;BYDAY=1MO,TH;COUNT=10');

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2023-04-03T08:00:00.000Z',
    '2023-04-06T08:00:00.000Z',
    '2023-04-13T08:00:00.000Z',
    '2023-04-20T08:00:00.000Z',
    '2023-04-27T08:00:00.000Z',
    '2023-05-01T08:00:00.000Z',
    '2023-05-04T08:00:00.000Z',
    '2023-05-11T08:00:00.000Z',
    '2023-05-18T08:00:00.000Z',
    '2023-05-25T08:00:00.000Z',
  ]);
});

test('rule: election-day yearly rule matches the RFC example', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    interval: 4,
    bymonth: [11],
    byweekday: [RRule.TU],
    bymonthday: [2, 3, 4, 5, 6, 7, 8],
    dtstart: new Date('1996-11-05T14:00:00.000Z'),
  });

  assert.deepEqual(
    rule.between(new Date('1996-11-05T14:00:00.000Z'), new Date('2024-11-05T14:00:00.000Z'), true).map((value) => value.toISOString()),
    [
      '1996-11-05T14:00:00.000Z',
      '2000-11-07T14:00:00.000Z',
      '2004-11-02T14:00:00.000Z',
      '2008-11-04T14:00:00.000Z',
      '2012-11-06T14:00:00.000Z',
      '2016-11-08T14:00:00.000Z',
      '2020-11-03T14:00:00.000Z',
      '2024-11-05T14:00:00.000Z',
    ],
  );
});

test('rule: first Saturday after the first Sunday of the month matches the RFC example', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    byweekday: [RRule.SA],
    bymonthday: [7, 8, 9, 10, 11, 12, 13],
    dtstart: new Date('1997-09-13T13:00:00.000Z'),
  });

  assert.deepEqual(
    rule.between(new Date('1997-09-13T13:00:00.000Z'), new Date('1998-06-13T13:00:00.000Z'), true).map((value) => value.toISOString()),
    [
      '1997-09-13T13:00:00.000Z',
      '1997-10-11T13:00:00.000Z',
      '1997-11-08T13:00:00.000Z',
      '1997-12-13T13:00:00.000Z',
      '1998-01-10T13:00:00.000Z',
      '1998-02-07T13:00:00.000Z',
      '1998-03-07T13:00:00.000Z',
      '1998-04-11T13:00:00.000Z',
      '1998-05-09T13:00:00.000Z',
      '1998-06-13T13:00:00.000Z',
    ],
  );
});

test('rule: invalid monthly dates are ignored rather than synthesized', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    bymonthday: [15, 30],
    count: 5,
    dtstart: new Date('2007-01-15T14:00:00.000Z'),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2007-01-15T14:00:00.000Z',
    '2007-01-30T14:00:00.000Z',
    '2007-02-15T14:00:00.000Z',
    '2007-03-15T14:00:00.000Z',
    '2007-03-30T14:00:00.000Z',
  ]);
});

test('rule: yearly byeaster selects Easter Sunday', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
    byeaster: 0,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-04-20T09:00:00.000Z',
    '2026-04-05T09:00:00.000Z',
    '2027-03-28T09:00:00.000Z',
  ]);
});

test('rule: byeaster can be used as a daily filter across years', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
    byeaster: -2,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-04-18T09:00:00.000Z',
    '2026-04-03T09:00:00.000Z',
  ]);
});

test('rule: wkst changes biweekly boundary behavior only when relevant', () => {
  const mondayWeekStart = new RRule({
    freq: Frequency.WEEKLY,
    interval: 2,
    count: 4,
    wkst: RRule.MO,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  });
  const sundayWeekStart = new RRule({
    freq: Frequency.WEEKLY,
    interval: 2,
    count: 4,
    wkst: RRule.SU,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  });

  assert.deepEqual(
    mondayWeekStart.all().map((value) => value.toISOString()),
    sundayWeekStart.all().map((value) => value.toISOString()),
  );
});

test('rule/rscale: yearly Feb 29 with SKIP=BACKWARD clamps to Feb 28 on non-leap years', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20160229T000000\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=6',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2016-02-29T00:00:00.000Z',
    '2017-02-28T00:00:00.000Z',
    '2018-02-28T00:00:00.000Z',
    '2019-02-28T00:00:00.000Z',
    '2020-02-29T00:00:00.000Z',
    '2021-02-28T00:00:00.000Z',
  ]);
});

test('rule/rscale: yearly Feb 29 with SKIP=OMIT keeps leap years only', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20160229T000000\nRRULE:RSCALE=GREGORIAN;SKIP=OMIT;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=6',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2016-02-29T00:00:00.000Z',
    '2020-02-29T00:00:00.000Z',
    '2024-02-29T00:00:00.000Z',
    '2028-02-29T00:00:00.000Z',
    '2032-02-29T00:00:00.000Z',
    '2036-02-29T00:00:00.000Z',
  ]);
});

test('rule/rscale: monthly Jan 31 with SKIP=FORWARD rolls to first of next month', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=FORWARD;FREQ=MONTHLY;COUNT=6',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-01-31T08:00:00.000Z',
    '2025-03-01T08:00:00.000Z',
    '2025-03-31T08:00:00.000Z',
    '2025-05-01T08:00:00.000Z',
    '2025-05-31T08:00:00.000Z',
    '2025-07-01T08:00:00.000Z',
  ]);
});

test('rule/rscale: monthly Jan 31 with SKIP=BACKWARD clamps to month end', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=MONTHLY;COUNT=6',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-01-31T08:00:00.000Z',
    '2025-02-28T08:00:00.000Z',
    '2025-03-31T08:00:00.000Z',
    '2025-04-30T08:00:00.000Z',
    '2025-05-31T08:00:00.000Z',
    '2025-06-30T08:00:00.000Z',
  ]);
});

test('rule/rscale: monthly Jan 31 with SKIP=OMIT skips short months', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=OMIT;FREQ=MONTHLY;COUNT=6',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2025-01-31T08:00:00.000Z',
    '2025-03-31T08:00:00.000Z',
    '2025-05-31T08:00:00.000Z',
    '2025-07-31T08:00:00.000Z',
    '2025-08-31T08:00:00.000Z',
    '2025-10-31T08:00:00.000Z',
  ]);
});

test('rule/rscale: hebrew yearly preserves monthCode M01 day 1', { skip: !supportsCalendar('hebrew') }, () => {
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
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3`);

  const out = rule.all();
  assert.equal(out.length, 3);
  for (const occ of out) {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    assert.equal(hebrew.monthCode, 'M01');
    assert.equal(hebrew.day, 1);
  }
});

test('rule/rscale: hebrew monthly simple advances by hebrew months and preserves day', { skip: !supportsCalendar('hebrew') }, () => {
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
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=MONTHLY;COUNT=6`);

  const out = rule.all();
  assert.equal(out.length, 6);

  const monthCodes = out.map((occ) => {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    assert.equal(hebrew.day, 1);
    return hebrew.monthCode;
  });

  assert.deepEqual(monthCodes, ['M01', 'M02', 'M03', 'M04', 'M05', 'M06']);
});

test('rule/rscale: hebrew minutely byweekno and byday stays in week 1 mondays', { skip: !supportsCalendar('hebrew') }, () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20240101T060000\nRRULE:RSCALE=HEBREW;WKST=MO;FREQ=MINUTELY;INTERVAL=1440;BYWEEKNO=1;BYDAY=MO;COUNT=2',
  );

  const out = rule.all();
  assert.equal(out.length, 2);
  for (const occ of out) {
    const zdt = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]'));
    assert.equal(zdt.dayOfWeek, 1);
    const pd = zdt.toPlainDate().withCalendar('hebrew');
    assert.equal(weekIndexHebrew(pd, 1), 1);
  }
});

test('rule/rscale: hebrew weekly byday stays on mondays', { skip: !supportsCalendar('hebrew') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');

  for (let i = 0; i < 800; i += 1) {
    const hebrew = cursor.toPlainDate().withCalendar('hebrew');
    if (hebrew.dayOfWeek === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;WKST=MO;FREQ=WEEKLY;BYDAY=MO;COUNT=3`);

  const out = rule.all();
  assert.equal(out.length, 3);
  for (const occ of out) {
    const zdt = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]'));
    assert.equal(zdt.dayOfWeek, 1);
  }
});

test('rule/rscale: hebrew yearly byyearday 1 stays on day 1 of the hebrew year', { skip: !supportsCalendar('hebrew') }, () => {
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
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYYEARDAY=1;COUNT=3`);
  const out = rule.all();

  assert.equal(out.length, 3);
  for (const occ of out) {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    assert.equal(hebrew.dayOfYear, 1);
  }
});

test('rule/rscale: hebrew yearly byweekno 1 and monday stays in hebrew week 1 mondays', { skip: !supportsCalendar('hebrew') }, () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20240101T000000\nRRULE:RSCALE=HEBREW;WKST=MO;FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO;COUNT=3',
  );
  const out = rule.all();

  assert.equal(out.length, 3);
  for (const occ of out) {
    const zdt = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]'));
    assert.equal(zdt.dayOfWeek, 1);
    const pd = zdt.toPlainDate().withCalendar('hebrew');
    assert.equal(weekIndexHebrew(pd, 1), 1);
  }
});

test('rule/rscale: chinese yearly simple preserves monthCode M01 day 1', { skip: !supportsCalendar('chinese') }, () => {
  const rule = RRule.fromString('DTSTART;VALUE=DATE:20130210\nRRULE:RSCALE=CHINESE;FREQ=YEARLY;COUNT=4');
  const out = rule.all();

  assert.deepEqual(out.map((value) => value.toISOString()), [
    '2013-02-10T00:00:00.000Z',
    '2014-01-31T00:00:00.000Z',
    '2015-02-19T00:00:00.000Z',
    '2016-02-08T00:00:00.000Z',
  ]);

  for (const occ of out) {
    const chinese = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('chinese');
    assert.equal(chinese.monthCode, 'M01');
    assert.equal(chinese.day, 1);
  }
});

test('rule/rscale: hebrew yearly bymonth 5L keeps leap-month occurrences only', { skip: !supportsCalendar('hebrew') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');

  for (let i = 0; i < 1000; i += 1) {
    const hebrew = cursor.withCalendar('hebrew');
    if (hebrew.monthCode === 'M05L' && hebrew.day === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(
    `DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;SKIP=OMIT;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=4`,
  );
  const out = rule.all();

  assert.equal(out.length, 4);
  for (const occ of out) {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    assert.equal(hebrew.monthCode, 'M05L');
    assert.equal(hebrew.day, 1);
  }
});

test('rule/rscale: hebrew yearly bymonth 5L with SKIP=BACKWARD falls back to previous month end', { skip: !supportsCalendar('hebrew') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');

  for (let i = 0; i < 1000; i += 1) {
    const hebrew = cursor.withCalendar('hebrew');
    if (hebrew.monthCode === 'M05L' && hebrew.day === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(
    `DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;SKIP=BACKWARD;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=4`,
  );
  const monthCodes = rule.all().map((occ) => {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    return hebrew.monthCode;
  });

  assert.deepEqual(monthCodes, ['M05L', 'M05', 'M05', 'M05L']);
});

test('rule/rscale: hebrew yearly bymonth 5L with SKIP=FORWARD rolls into following month', { skip: !supportsCalendar('hebrew') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');

  for (let i = 0; i < 1000; i += 1) {
    const hebrew = cursor.withCalendar('hebrew');
    if (hebrew.monthCode === 'M05L' && hebrew.day === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(
    `DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;SKIP=FORWARD;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=4`,
  );
  const monthCodes = rule.all().map((occ) => {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    return hebrew.monthCode;
  });

  assert.deepEqual(monthCodes, ['M05L', 'M06', 'M06', 'M05L']);
});

test('rule/rscale: indian yearly simple preserves monthCode M01 day 1', { skip: !supportsCalendar('indian') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');

  for (let i = 0; i < 366; i += 1) {
    const indian = cursor.withCalendar('indian');
    if (indian.monthCode === 'M01' && indian.day === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=YEARLY;COUNT=3`);
  const out = rule.all();

  assert.equal(out.length, 3);
  for (const occ of out) {
    const indian = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('indian');
    assert.equal(indian.monthCode, 'M01');
    assert.equal(indian.day, 1);
  }
});

test('rule/rscale: indian daily byyearday 1 stays on day 1 of the indian year', { skip: !supportsCalendar('indian') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T09:00:00+00:00[UTC]');

  for (let i = 0; i < 366; i += 1) {
    const indian = cursor.withCalendar('indian');
    if (indian.monthCode === 'M01' && indian.day === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=DAILY;BYYEARDAY=1;COUNT=2`);
  const out = rule.all();

  assert.equal(out.length, 2);
  for (const occ of out) {
    const indian = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('indian');
    assert.equal(indian.dayOfYear, 1);
    assert.equal(occ.getUTCHours(), 9);
  }
});

test('rule/rscale: hebrew monthly simple respects UNTIL before the next hebrew month', { skip: !supportsCalendar('hebrew') }, () => {
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
  const until = found.add({ days: 20 }).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=MONTHLY;UNTIL=${until}`);

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    new Date(Number(found.epochMilliseconds)).toISOString(),
  ]);
});

test('rule/rscale: hebrew monthly byweekday respects UNTIL truncation', { skip: !supportsCalendar('hebrew') }, () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20240101T090000\nRRULE:RSCALE=HEBREW;FREQ=MONTHLY;BYDAY=MO;UNTIL=20240110T090000',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2024-01-01T09:00:00.000Z',
    '2024-01-08T09:00:00.000Z',
  ]);
});

test('rule/rscale: hebrew daily bymonthday -1 respects hebrew month lengths', { skip: !supportsCalendar('hebrew') }, () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20240125T090000\nRRULE:RSCALE=HEBREW;FREQ=DAILY;BYMONTHDAY=-1;COUNT=6',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2024-02-09T09:00:00.000Z',
    '2024-03-10T09:00:00.000Z',
    '2024-04-08T09:00:00.000Z',
    '2024-05-08T09:00:00.000Z',
    '2024-06-06T09:00:00.000Z',
    '2024-07-06T09:00:00.000Z',
  ]);
});

test('rule/rscale: hebrew monthly byweekday uses hebrew-month weekdays', { skip: !supportsCalendar('hebrew') }, () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=UTC:20240101T090000\nRRULE:RSCALE=HEBREW;FREQ=MONTHLY;BYDAY=MO;COUNT=3',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2024-01-01T09:00:00.000Z',
    '2024-01-08T09:00:00.000Z',
    '2024-01-15T09:00:00.000Z',
  ]);
});

test('rule: monthly negative bymonthday crosses February in non-leap years', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    bymonthday: [-1],
    tzid: 'UTC',
    dtstart: datetime(2013, 12, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), [
    new Date('2013-12-31T09:00:00.000Z'),
    new Date('2014-01-31T09:00:00.000Z'),
    new Date('2014-02-28T09:00:00.000Z'),
    new Date('2014-03-31T09:00:00.000Z'),
  ]);
});

test('rule: monthly negative bymonthday crosses February in leap years', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    bymonthday: [-1],
    tzid: 'UTC',
    dtstart: datetime(2015, 12, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), [
    new Date('2015-12-31T09:00:00.000Z'),
    new Date('2016-01-31T09:00:00.000Z'),
    new Date('2016-02-29T09:00:00.000Z'),
    new Date('2016-03-31T09:00:00.000Z'),
  ]);
});

test('rule: monthly interval from a 31st keeps six-month cadence across short months', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    interval: 6,
    count: 4,
    tzid: 'UTC',
    dtstart: new Date('2025-03-31T01:01:00.000Z'),
  });

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2025-03-31T01:01:00.000Z',
    '2025-09-30T01:01:00.000Z',
    '2026-03-31T01:01:00.000Z',
    '2026-09-30T01:01:00.000Z',
  ]);
});

test('rule: minutely bysetpos selects first and last seconds in each minute', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 4,
    bysecond: [0, 15, 30, 45],
    bysetpos: [1, -1],
    tzid: 'UTC',
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), [
    new Date('1997-09-02T09:00:00.000Z'),
    new Date('1997-09-02T09:00:45.000Z'),
    new Date('1997-09-02T09:01:00.000Z'),
    new Date('1997-09-02T09:01:45.000Z'),
  ]);
});

test('rule: yearly large positive and negative ordinal weekdays work together', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    byweekday: ['13TU', '-13TH'],
    tzid: 'UTC',
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), [
    new Date('1997-10-02T09:00:00.000Z'),
    new Date('1998-03-31T09:00:00.000Z'),
    new Date('1998-10-08T09:00:00.000Z'),
  ]);
});

test('rule: daily until matching returns the exact boundary occurrence', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    tzid: 'UTC',
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
    until: datetime(1997, 9, 4, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), [
    new Date('1997-09-02T09:00:00.000Z'),
    new Date('1997-09-03T09:00:00.000Z'),
    new Date('1997-09-04T09:00:00.000Z'),
  ]);
});

test('rule: daily until equal to dtstart yields a single occurrence', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    tzid: 'UTC',
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
    until: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), [new Date('1997-09-02T09:00:00.000Z')]);
});
