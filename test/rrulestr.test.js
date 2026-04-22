import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';

import { datetime, Frequency, RRule, RRuleSet, rrulestr } from './support/compat.js';

function supportsCalendar(calendar) {
  try {
    Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]').withCalendar(calendar);
    return true;
  } catch {
    return false;
  }
}

test('rrulestr: toString and parseString roundtrip common fields', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    interval: 2,
    count: 4,
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
    byweekday: [RRule.MO, RRule.WE],
    byhour: [9],
    byminute: [30],
  });

  const serialized = rule.toString();
  const parsed = RRule.parseString(serialized);

  assert.equal(parsed.freq, Frequency.WEEKLY);
  assert.equal(parsed.interval, 2);
  assert.equal(parsed.count, 4);
  assert.deepEqual(parsed.byhour ?? [], [9]);
  assert.deepEqual(parsed.byminute ?? [], [30]);
  assert.equal(Array.isArray(parsed.byweekday), true);
  assert.equal((parsed.byweekday ?? []).length, 2);
});

test('rrulestr: optionsToString serializes WKST', () => {
  const serialized = RRule.optionsToString({
    freq: Frequency.WEEKLY,
    interval: 2,
    wkst: RRule.SU,
    count: 4,
    dtstart: datetime(1997, 8, 5, 9, 0, 0),
    byweekday: [RRule.TU, RRule.SU],
  });

  assert.match(serialized, /WKST=SU/);
});

test('rrulestr: optionsToString uses UTC DTSTART form without TZID', () => {
  const serialized = RRule.optionsToString({
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
    freq: Frequency.WEEKLY,
  });

  assert.equal(serialized, 'DTSTART:19970902T090000Z\nRRULE:FREQ=WEEKLY');
});

test('rrulestr: optionsToString serializes DTSTART-only named timezone values', () => {
  const serialized = RRule.optionsToString({
    dtstart: new Date('1997-09-02T13:00:00.000Z'),
    tzid: 'America/New_York',
  });

  assert.equal(serialized, 'DTSTART;TZID=America/New_York:19970902T090000');
});

test('rrulestr: optionsToString serializes named timezone DTSTART with RRULE body', () => {
  const serialized = RRule.optionsToString({
    dtstart: new Date('1997-09-02T13:00:00.000Z'),
    tzid: 'America/New_York',
    freq: Frequency.WEEKLY,
  });

  assert.equal(serialized, 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY');
});

test('rrulestr: parseString parses WKST', () => {
  const parsed = RRule.parseString(
    'DTSTART;TZID=UTC:19970805T090000\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;WKST=SU;BYDAY=TU,SU',
  );

  assert.equal(parsed.wkst, 6);
});

test('rrulestr: parseString accepts date-only UNTIL values', () => {
  const parsed = RRule.parseString('RRULE:FREQ=WEEKLY;UNTIL=20100101');

  assert.equal(parsed.freq, Frequency.WEEKLY);
  assert.equal(parsed.until?.toISOString(), '2010-01-01T00:00:00.000Z');
});

test('rrulestr: tolerates surrounding spaces and blank lines', () => {
  const rule = rrulestr(' DTSTART:19970902T090000 \n \n RRULE:FREQ=YEARLY;COUNT=3 \n');

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1998-09-02T09:00:00.000Z',
    '1999-09-02T09:00:00.000Z',
  ]);
});

test('rrulestr: parses DTSTART with VALUE=DATE', () => {
  const rule = rrulestr('DTSTART;VALUE=DATE:19970902\nRRULE:FREQ=YEARLY;COUNT=2');

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T00:00:00.000Z',
    '1998-09-02T00:00:00.000Z',
  ]);
});

test('rrulestr: toString omits default freq when it was not provided in origOptions', () => {
  const rule = new RRule({
    count: 1,
    dtstart: datetime(990, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toString(), 'DTSTART:09900101T000000Z\nRRULE:COUNT=1');
});

test('rrulestr: optionsToString serializes bynmonthday as negative BYMONTHDAY', () => {
  const serialized = RRule.optionsToString({
    freq: Frequency.MONTHLY,
    bynmonthday: [1, 3],
  });

  assert.equal(serialized, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1,-3');
});

test('rrulestr: optionsToString serializes bynweekday as BYDAY ordinals', () => {
  const serialized = RRule.optionsToString({
    freq: Frequency.MONTHLY,
    bynweekday: [[RRule.TU.weekday, 1], [RRule.TH.weekday, -1]],
  });

  assert.equal(serialized, 'RRULE:FREQ=MONTHLY;BYDAY=1TU,-1TH');
});

test('rrulestr: returns RRule for a single RRULE block', () => {
  const value = rrulestr('DTSTART;TZID=UTC:19970902T090000\nRRULE:FREQ=DAILY;COUNT=3;BYMONTHDAY=3,5');

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '1997-09-03T09:00:00.000Z',
    '1997-09-05T09:00:00.000Z',
    '1997-10-03T09:00:00.000Z',
  ]);
});

test('rrulestr: accepts a value-only RRULE string with external dtstart', () => {
  const value = rrulestr('FREQ=YEARLY;COUNT=3', {
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1998-09-02T09:00:00.000Z',
    '1999-09-02T09:00:00.000Z',
  ]);
});

test('rrulestr: accepts an RRULE-prefixed string with external dtstart', () => {
  const value = rrulestr('RRULE:FREQ=DAILY;COUNT=5', {
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
  });

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2025-01-01T09:00:00.000Z',
    '2025-01-02T09:00:00.000Z',
    '2025-01-03T09:00:00.000Z',
    '2025-01-04T09:00:00.000Z',
    '2025-01-05T09:00:00.000Z',
  ]);
});

test('rrulestr: external dtstart plus timezone-aware exdate behaves like embedded DTSTART', () => {
  const value = rrulestr(
    'FREQ=WEEKLY;WKST=SU;COUNT=2;INTERVAL=1;BYDAY=MO,TU\n' +
      'EXDATE;TZID=America/Edmonton:20220502T090000',
    { dtstart: datetime(2022, 5, 2, 9, 0, 0) },
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), ['2022-05-03T15:00:00.000Z']);
});

test('rrulestr: embedded DTSTART takes precedence over external dtstart', () => {
  const value = rrulestr('DTSTART:20250101T100000Z\nRRULE:FREQ=DAILY;COUNT=3', {
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
  });

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2025-01-01T10:00:00.000Z',
    '2025-01-02T10:00:00.000Z',
    '2025-01-03T10:00:00.000Z',
  ]);
});

test('rrulestr: roundtrips a bare DTSTART string exactly', () => {
  const input = 'DTSTART:19970902T090000Z';

  const parsed = rrulestr(input);

  assert.equal(parsed.toString(), input);
  assert.deepEqual(parsed.all().map((date) => date.toISOString()), ['1997-09-02T09:00:00.000Z']);
});

test('rrulestr: bare DTSTART does not recur in later years', () => {
  const parsed = rrulestr('DTSTART:20220831T070000Z');

  assert.deepEqual(
    parsed
      .between(new Date('2023-07-30T05:00:00.000Z'), new Date('2023-09-02T05:00:00.000Z'))
      .map((date) => date.toISOString()),
    [],
  );
});

test('rrulestr: accepts equals-form DTSTART without duplicating it on roundtrip', () => {
  const input = 'DTSTART=20201207T080000Z\nFREQ=DAILY;INTERVAL=1';
  const parsed = rrulestr(input, { forceset: true });

  assert.equal(parsed.toString(), 'DTSTART:20201207T080000Z\nRRULE:FREQ=DAILY;INTERVAL=1');
});

test('rrulestr: fromString honors inline DTSTART with TZID inside a value-only RRULE string', () => {
  const rule = RRule.fromString(
    'FREQ=DAILY;DTSTART;TZID=Europe/Berlin:19760101T000000;INTERVAL=1;BYHOUR=0;BYMINUTE=0;BYSECOND=0',
  );

  assert.deepEqual(rule.origOptions, {
    tzid: 'Europe/Berlin',
    dtstart: new Date('1975-12-31T23:00:00.000Z'),
    freq: Frequency.DAILY,
    interval: 1,
    byhour: [0],
    byminute: [0],
    bysecond: [0],
  });
  assert.equal(rule.after(new Date('2021-01-31T23:00:00.000Z'), true)?.toISOString(), '2021-01-31T23:00:00.000Z');
  assert.equal(rule.after(new Date('2021-06-30T22:00:00.000Z'), true)?.toISOString(), '2021-06-30T22:00:00.000Z');
});

test('rrulestr: external until is honored when the RRULE string omits UNTIL', () => {
  const value = rrulestr('RRULE:FREQ=DAILY;BYHOUR=5', {
    dtstart: new Date('2024-12-31T23:00:00.000Z'),
    tzid: 'Europe/Paris',
    until: new Date('2025-01-02T04:00:00.000Z'),
  });

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2025-01-01T04:00:00.000Z',
    '2025-01-02T04:00:00.000Z',
  ]);
});

test('rrulestr: rejects decimal interval instead of looping forever', () => {
  assert.throws(
    () => rrulestr('DTSTART:20231003T040000Z\nRRULE:FREQ=DAILY;INTERVAL=0.5'),
    /interval must be greater than 0/i,
  );
});

test('rrulestr: UNTIL prevents later monthly day-of-month occurrences from leaking past the bound', () => {
  const value = rrulestr('DTSTART=20220901T080000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1;UNTIL=20230701T235959');

  assert.deepEqual(
    value
      .between(new Date('2023-06-15T00:00:00.000Z'), new Date('2023-09-15T00:00:00.000Z'))
      .map((date) => date.toISOString()),
    ['2023-07-01T08:00:00.000Z'],
  );
});

test('rrulestr: external count is honored when the RRULE string omits COUNT', () => {
  const value = rrulestr('RRULE:FREQ=DAILY;BYHOUR=5', {
    dtstart: new Date('2024-12-31T23:00:00.000Z'),
    tzid: 'Europe/Paris',
    count: 2,
  });

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2025-01-01T04:00:00.000Z',
    '2025-01-02T04:00:00.000Z',
  ]);
});

test('rrulestr: supports unfold option for folded value-only input', () => {
  const value = rrulestr('FREQ=YEA\n RLY;COUNT=3', {
    unfold: true,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1998-09-02T09:00:00.000Z',
    '1999-09-02T09:00:00.000Z',
  ]);
});

test('rrulestr: forceset returns a set for a single RRULE block', () => {
  const value = rrulestr('DTSTART:19970902T090000Z\nRRULE:FREQ=YEARLY;COUNT=3', {
    forceset: true,
  });

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1998-09-02T09:00:00.000Z',
    '1999-09-02T09:00:00.000Z',
  ]);
});

test('rrulestr: compatible mode unfolds and injects dtstart into the set', () => {
  const value = rrulestr('FREQ=YEA\n RLY;COUNT=2', {
    compatible: true,
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '1997-09-02T09:00:00.000Z',
    '1998-09-02T09:00:00.000Z',
  ]);
});

test('rrulestr: parses RDATE and EXDATE set lines', () => {
  const value = rrulestr(
    ['DTSTART;TZID=UTC:20260411T090000', 'RRULE:FREQ=DAILY;COUNT=3', 'RDATE:20260415T090000Z', 'EXDATE:20260412T090000Z'].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
});

test('rrulestr: parses multiple RRULE blocks as a set', () => {
  const value = rrulestr(
    ['DTSTART;TZID=UTC:20260411T090000', 'RRULE:FREQ=DAILY;COUNT=2', 'RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO'].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
  ]);
});

test('rrulestr: parses EXRULE lines', () => {
  const value = rrulestr(
    ['DTSTART;TZID=UTC:20260411T090000', 'RRULE:FREQ=DAILY;COUNT=5', 'EXRULE:FREQ=DAILY;COUNT=2;INTERVAL=2'].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-04-12T09:00:00.000Z',
    '2026-04-14T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
});

test('rrulestr: unfolds folded EXDATE lines', () => {
  const value = rrulestr(
    'DTSTART:20250101T090000Z\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE:20250102T090000Z,\r\n 20250103T090000Z',
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2025-01-01T09:00:00.000Z',
    '2025-01-04T09:00:00.000Z',
  ]);
});

test('rrulestr: roundtrips a set string via toString', () => {
  const input = [
    'DTSTART:20260411T090000Z',
    'RRULE:FREQ=DAILY;COUNT=2',
    'EXRULE:FREQ=DAILY;COUNT=1',
    'RDATE:20260415T090000Z',
    'EXDATE:20260411T090000Z',
  ].join('\n');

  const parsed = rrulestr(input);
  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(parsed.toString(), input);
});

test('rrulestr: parses DTSTART with TZID on RDATE and EXDATE lines', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=Europe/Paris:20260328T090000',
      'RRULE:FREQ=DAILY;COUNT=3',
      'RDATE;TZID=Europe/Paris:20260331T090000',
      'EXDATE;TZID=Europe/Paris:20260329T090000',
    ].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
    '2026-03-31T07:00:00.000Z',
  ]);
});

test('rrulestr: inherited timezone applies to RDATE and EXDATE without TZID', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=Europe/Paris:20260328T090000',
      'RRULE:FREQ=DAILY;COUNT=3',
      'RDATE:20260331T090000',
      'EXDATE:20260329T090000',
    ].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
    '2026-03-31T07:00:00.000Z',
  ]);
});

test('rrulestr: parseString handles advanced RRULE fields and negative values', () => {
  const parsed = RRule.parseString(
    [
      'DTSTART;TZID=UTC:19970101T090000',
      'RRULE:FREQ=YEARLY;COUNT=4;WKST=SU;BYMONTH=3,9;BYDAY=1MO,-1FR;BYWEEKNO=-1;BYYEARDAY=-100,-1;BYSETPOS=1,-1',
    ].join('\n'),
  );

  assert.equal(parsed.freq, Frequency.YEARLY);
  assert.equal(parsed.count, 4);
  assert.equal(parsed.wkst, RRule.SU.weekday);
  assert.deepEqual(parsed.bymonth ?? [], [3, 9]);
  assert.deepEqual(parsed.byweekno ?? [], [-1]);
  assert.deepEqual(parsed.byyearday ?? [], [-100, -1]);
  assert.deepEqual(parsed.bysetpos ?? [], [1, -1]);
  assert.equal(Array.isArray(parsed.byweekday), true);
  assert.equal((parsed.byweekday ?? []).length, 2);
});

test('rrulestr: rule toString and fromString roundtrip advanced yearly rule', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 6,
    bymonth: [3, 9],
    byweekday: [RRule.MO.nth(1), RRule.FR.nth(-1)],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  const serialized = rule.toString();
  const reparsed = RRule.fromString(serialized);

  assert.equal(serialized, reparsed.toString());
  assert.deepEqual(
    reparsed.all().map((date) => date.toISOString()),
    rule.all().map((date) => date.toISOString()),
  );
});

test('rrulestr: rule toString and fromString roundtrip negative bymonthday and byweekno', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 6,
    bymonth: [2],
    bymonthday: [-1],
    byweekno: [-1],
    byweekday: [RRule.MO],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  const serialized = rule.toString();
  const reparsed = RRule.fromString(serialized);

  assert.equal(serialized, reparsed.toString());
  assert.deepEqual(
    reparsed.all().map((date) => date.toISOString()),
    rule.all().map((date) => date.toISOString()),
  );
});

test('rrulestr: parseString keeps local UNTIL semantics for named timezones', () => {
  const parsed = RRule.parseString(
    [
      'DTSTART;TZID=Europe/Paris:20260328T090000',
      'RRULE:FREQ=DAILY;UNTIL=20260330T090000',
    ].join('\n'),
  );

  const rule = new RRule(parsed);
  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-29T07:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
  ]);
});

test('rrulestr: roundtrips named-timezone DTSTART with local UNTIL exactly', () => {
  const input = 'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;UNTIL=19980902T090000;INTERVAL=1';

  const parsed = rrulestr(input);

  assert.equal(parsed.toString(), input);
});

test('rrulestr: parseString is case-insensitive for property names', () => {
  const parsed = RRule.parseString(
    [
      'dtstart;TZID=UTC:19970902T090000',
      'rrule:freq=yearly;count=3;wkst=su;byday=1mo,-1fr',
    ].join('\n'),
  );

  assert.equal(parsed.freq, Frequency.YEARLY);
  assert.equal(parsed.count, 3);
  assert.equal(parsed.wkst, RRule.SU.weekday);
  assert.equal(Array.isArray(parsed.byweekday), true);
  assert.equal(parsed.byweekday.length, 2);
});

test('rrulestr: parseString parses DTSTART embedded inside RRULE', () => {
  const parsed = RRule.parseString(
    'RRULE:UNTIL=19990404T110000Z;DTSTART=19990104T110000Z;FREQ=WEEKLY;BYDAY=TU,WE',
  );

  assert.equal(parsed.freq, Frequency.WEEKLY);
  assert.deepEqual(parsed.byweekday?.map((weekday) => weekday.toString()), ['TU', 'WE']);
  assert.equal(parsed.dtstart?.toISOString(), '1999-01-04T11:00:00.000Z');
  assert.equal(parsed.until?.toISOString(), '1999-04-04T11:00:00.000Z');
});

test('rrulestr: parseString parses TZID on embedded DTSTART inside RRULE', () => {
  const parsed = RRule.parseString(
    'RRULE:DTSTART;TZID=America/Los_Angeles:20180719T111500;FREQ=DAILY;INTERVAL=1',
  );

  assert.equal(parsed.freq, Frequency.DAILY);
  assert.equal(parsed.interval, 1);
  assert.equal(parsed.tzid, 'America/Los_Angeles');
  assert.equal(parsed.dtstart?.toISOString(), '2018-07-19T18:15:00.000Z');
});

test('rrulestr: roundtrips single- and double-digit years without shifting to the 1900s', () => {
  const input = new RRule({ dtstart: new Date('0010-01-01T00:00:00.000Z') }).toString();
  const parsed = rrulestr(input);

  assert.equal(input, 'DTSTART:00100101T000000Z');
  assert.equal(parsed.toString(), input);
});

test('rrulestr: fromString preserves origOptions and normalized options for named timezones', () => {
  const rule = RRule.fromString(
    [
      'DTSTART;TZID=America/New_York:19970902T090000',
      'RRULE:FREQ=DAILY;UNTIL=19980902T090000',
    ].join('\n'),
  );

  assert.equal(rule.origOptions.tzid, 'America/New_York');
  assert.equal(rule.origOptions.freq, Frequency.DAILY);
  assert.equal(rule.origOptions.dtstart?.toISOString(), '1997-09-02T13:00:00.000Z');
  assert.equal(rule.origOptions.until?.toISOString(), '1998-09-02T13:00:00.000Z');

  assert.equal(rule.options.tzid, 'America/New_York');
  assert.equal(rule.options.freq, Frequency.DAILY);
  assert.equal(rule.options.interval, 1);
  assert.equal(rule.options.dtstart?.toISOString(), '1997-09-02T13:00:00.000Z');
  assert.equal(rule.options.until?.toISOString(), '1998-09-02T13:00:00.000Z');
});

test('rrulestr: fromString preserves floating DTSTART without TZID in origOptions', () => {
  const rule = RRule.fromString('DTSTART:19970902T090000\nRRULE:FREQ=WEEKLY');

  assert.equal(rule.origOptions.tzid, 'UTC');
  assert.equal(rule.origOptions.freq, Frequency.WEEKLY);
  assert.equal(rule.origOptions.dtstart?.toISOString(), '1997-09-02T09:00:00.000Z');
  assert.equal(rule.toString(), 'DTSTART:19970902T090000Z\nRRULE:FREQ=WEEKLY');
});

test('rrulestr: parseString unfolds folded RRULE input', () => {
  const parsed = RRule.parseString(
    [
      'DTSTART:19970902T090000Z',
      'RRULE:FREQ=YEA',
      ' RLY;COUNT=3;BYMONTH=1,6',
    ].join('\r\n'),
  );

  const rule = new RRule(parsed);
  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '1998-01-02T09:00:00.000Z',
    '1998-06-02T09:00:00.000Z',
    '1999-01-02T09:00:00.000Z',
  ]);
});

test('rrulestr: invalid BYDAY tokens are ignored during parsing', () => {
  const rule = RRule.fromString(
    [
      'DTSTART:20191219T000000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TH,XX,0MO',
    ].join('\n'),
  );

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2019-12-19T00:00:00.000Z',
    '2019-12-26T00:00:00.000Z',
    '2020-01-02T00:00:00.000Z',
    '2020-01-09T00:00:00.000Z',
  ]);
});

test('rrulestr: parseString rejects invalid FREQ values', () => {
  assert.throws(
    () =>
      RRule.parseString(
        [
          'DTSTART:19970902T090000Z',
          'RRULE:FREQ=NOPE;COUNT=3',
        ].join('\n'),
      ),
    /Invalid FREQ value: NOPE/,
  );
});

test('rrulestr: parseString rejects invalid UNTIL values', () => {
  assert.throws(
    () =>
      RRule.parseString(
        [
          'DTSTART;TZID=UTC:20210101T090000',
          'RRULE:FREQ=DAILY;UNTIL=INVALID',
        ].join('\n'),
      ),
    /Invalid date-time value: INVALID/,
  );
});

test('rrulestr: parseString accepts empty BYDAY as omitted', () => {
  const rule = RRule.fromString(
    [
      'DTSTART:19970902T090000',
      'RRULE:FREQ=WEEKLY;BYDAY=;WKST=SU',
    ].join('\n'),
  );

  assert.equal(rule.toString(), 'DTSTART:19970902T090000Z\nRRULE:FREQ=WEEKLY;WKST=SU');
});

test('rrulestr: parseString rejects malformed DTSTART lines', () => {
  assert.throws(
    () =>
      RRule.parseString(
        [
          'DTSTART;TZID=UTC:INVALID',
          'RRULE:FREQ=DAILY;COUNT=2',
        ].join('\n'),
      ),
    /Invalid date-time value: INVALID/,
  );
});

test('rrulestr: rejects multiple DTSTART values on a single line', () => {
  assert.throws(
    () => rrulestr('DTSTART:19970101T000000,19970202T000000\nRRULE:FREQ=YEARLY;COUNT=1'),
    /Invalid/,
  );
});

test('rrulestr: parseString rejects malformed embedded DTSTART values', () => {
  assert.throws(
    () => RRule.parseString('RRULE:DTSTART=INVALID;FREQ=DAILY;COUNT=2'),
    /Invalid date-time value: INVALID/,
  );
});

test('rrulestr: rejects empty input strings', () => {
  assert.throws(
    () => rrulestr('   \n\t  '),
    /Invalid empty string/,
  );
});

test('rrulestr: rejects unsupported top-level properties', () => {
  assert.throws(
    () => rrulestr('DTSTART:20260411T090000Z\nFOO:BAR'),
    /unsupported property: FOO/,
  );
});

test('rrulestr: invalid named TZID on a simple rule fails observably', () => {
  assert.throws(
    () => rrulestr('DTSTART;TZID=Not/AZone:20260411T090000\nRRULE:FREQ=DAILY;COUNT=2'),
    RangeError,
  );
});

test('rrulestr: invalid named TZID on embedded DTSTART fails observably', () => {
  assert.throws(
    () => RRule.parseString('RRULE:DTSTART;TZID=Not/AZone:20260411T090000;FREQ=DAILY;COUNT=2'),
    RangeError,
  );
});

test('rrulestr: invalid named TZID on RDATE-only sets fails observably', () => {
  assert.throws(
    () => rrulestr('RDATE;TZID=Not/AZone:20260411T090000'),
    RangeError,
  );
});

test('rrulestr: parseString rejects invalid SKIP values', () => {
  assert.throws(
    () =>
      RRule.parseString(
        [
          'DTSTART;TZID=UTC:20250131T080000',
          'RRULE:FREQ=MONTHLY;COUNT=6;RSCALE=GREGORIAN;SKIP=SIDEWAYS',
        ].join('\n'),
      ),
    /Invalid SKIP value: SIDEWAYS/,
  );
});

test('rrulestr: unfolds folded RRULE lines with advanced fields', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=UTC:19970101T090000',
      'RRULE:FREQ=YEARLY;COUNT=4;BYMONTH=3,9;',
      ' BYDAY=1MO,-1FR;BYSETPOS=1,-1',
    ].join('\r\n'),
  );

  assert.equal(value instanceof RRule, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '1997-03-03T09:00:00.000Z',
    '1997-03-28T09:00:00.000Z',
    '1997-09-01T09:00:00.000Z',
    '1997-09-26T09:00:00.000Z',
  ]);
});

test('rrulestr: respects nearest preceding DTSTART for EXRULE blocks', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=UTC:20260411T090000',
      'RRULE:FREQ=DAILY;COUNT=5',
      'DTSTART;TZID=UTC:20260413T090000',
      'EXRULE:FREQ=DAILY;COUNT=2',
    ].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
});

test('rrulestr: accumulates multiple RDATE and EXDATE lines in a set', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=UTC:20260411T090000',
      'RRULE:FREQ=DAILY;COUNT=4',
      'RDATE:20260420T090000Z',
      'RDATE:20260421T090000Z',
      'EXDATE:20260412T090000Z',
      'EXDATE:20260413T090000Z',
    ].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-14T09:00:00.000Z',
    '2026-04-20T09:00:00.000Z',
    '2026-04-21T09:00:00.000Z',
  ]);
});

test('rrulestr: mixes EXDATE date-time encodings without changing exclusions', () => {
  const rule = rrulestr(
    [
      'DTSTART:19970902T090000',
      'RRULE:FREQ=YEARLY;COUNT=4;BYDAY=TU,TH',
      'EXDATE;VALUE=DATE-TIME:19970902T090000',
      'EXDATE:19970909T090000',
    ].join('\n'),
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-04T09:00:00.000Z',
    '1997-09-11T09:00:00.000Z',
  ]);
});

test('rrulestr: parses timezone-aware set with mixed UTC and local explicit dates', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=Europe/Paris:20260328T090000',
      'RRULE:FREQ=DAILY;COUNT=4',
      'RDATE:20260401T070000Z',
      'RDATE;TZID=Europe/Paris:20260402T090000',
      'EXDATE;TZID=Europe/Paris:20260329T090000',
      'EXDATE:20260331T070000Z',
    ].join('\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
    '2026-04-01T07:00:00.000Z',
    '2026-04-02T07:00:00.000Z',
  ]);
});

test('rrulestr: unfolds mixed folded set lines with local timezone metadata', () => {
  const value = rrulestr(
    [
      'DTSTART;TZID=Europe/Paris:20260328T090000',
      'RRULE:FREQ=DAILY;COUNT=4',
      'RDATE;TZID=Europe/Paris:20260401T090000,',
      ' 20260402T090000',
      'EXDATE;TZID=Europe/Paris:20260329T090000,',
      ' 20260331T090000',
    ].join('\r\n'),
  );

  assert.equal(value instanceof RRuleSet, true);
  assert.deepEqual(value.all().map((date) => date.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
    '2026-04-01T07:00:00.000Z',
    '2026-04-02T07:00:00.000Z',
  ]);
});

test('rrulestr: canonicalizes semantically equivalent UTC set input', () => {
  const input = [
    'DTSTART:20260411T090000Z',
    'RRULE:FREQ=DAILY;COUNT=3',
    'RDATE:20260415T090000Z',
    'EXDATE:20260412T090000Z',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(
    parsed.toString(),
    [
      'DTSTART:20260411T090000Z',
      'RRULE:FREQ=DAILY;COUNT=3',
      'RDATE:20260415T090000Z',
      'EXDATE:20260412T090000Z',
    ].join('\n'),
  );
  assert.deepEqual(parsed.all().map((date) => date.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
});

test('rrulestr: canonicalizes timezone-aware set with mixed explicit date encodings', () => {
  const input = [
    'DTSTART;TZID=Europe/Paris:20260328T090000',
    'RRULE:FREQ=DAILY;COUNT=4',
    'RDATE:20260401T070000Z',
    'RDATE;TZID=Europe/Paris:20260402T090000',
    'EXDATE:20260329T070000Z',
    'EXDATE;TZID=Europe/Paris:20260331T090000',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(
    parsed.toString(),
    [
      'DTSTART;TZID=Europe/Paris:20260328T090000',
      'RRULE:FREQ=DAILY;COUNT=4',
      'RDATE;TZID=Europe/Paris:20260401T090000,20260402T090000',
      'EXDATE;TZID=Europe/Paris:20260329T090000,20260331T090000',
    ].join('\n'),
  );
  assert.deepEqual(parsed.all().map((date) => date.toISOString()), [
    '2026-03-28T08:00:00.000Z',
    '2026-03-30T07:00:00.000Z',
    '2026-04-01T07:00:00.000Z',
    '2026-04-02T07:00:00.000Z',
  ]);
});

test('rrulestr: parseString parses RSCALE and SKIP', () => {
  const parsed = RRule.parseString(
    [
      'DTSTART;TZID=UTC:20250131T080000',
      'RRULE:FREQ=MONTHLY;COUNT=6;RSCALE=GREGORIAN;SKIP=FORWARD',
    ].join('\n'),
  );

  assert.equal(parsed.rscale, 'GREGORIAN');
  assert.equal(parsed.skip, 'FORWARD');
});

test('rrulestr: parses SKIP before RSCALE when provided later in rule', () => {
  assert.doesNotThrow(() => {
    const parsed = RRule.parseString(
      [
        'DTSTART;TZID=UTC:20250131T080000',
        'RRULE:SKIP=BACKWARD;RSCALE=GREGORIAN;FREQ=MONTHLY;COUNT=3',
      ].join('\n'),
    );

    assert.equal(parsed.rscale, 'GREGORIAN');
    assert.equal(parsed.skip, 'BACKWARD');
  });
});

test('rrulestr: toString and fromString roundtrip RSCALE and SKIP fields', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 6,
    dtstart: datetime(2025, 1, 31, 8, 0, 0),
    rscale: 'GREGORIAN',
    skip: 'BACKWARD',
  });

  const serialized = rule.toString();
  const reparsed = RRule.fromString(serialized);

  assert.match(serialized, /RSCALE=GREGORIAN/);
  assert.match(serialized, /SKIP=BACKWARD/);
  assert.equal(reparsed.toString(), serialized);
});

test('rrulestr: parseString parses BYEASTER', () => {
  const parsed = RRule.parseString('DTSTART:20250101T090000Z\nRRULE:FREQ=YEARLY;COUNT=2;BYEASTER=-2');

  assert.equal(parsed.byeaster, -2);
});

test('rrulestr: toString and fromString roundtrip BYEASTER', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 2,
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
    byeaster: -2,
  });

  const serialized = rule.toString();
  const reparsed = RRule.fromString(serialized);

  assert.match(serialized, /BYEASTER=-2/);
  assert.equal(reparsed.toString(), serialized);
  assert.deepEqual(reparsed.all().map((date) => date.toISOString()), [
    '2025-04-18T09:00:00.000Z',
    '2026-04-03T09:00:00.000Z',
  ]);
});

test('rrulestr: rejects SKIP without RSCALE', () => {
  assert.throws(
    () => RRule.parseString('DTSTART;TZID=UTC:20250131T080000\nRRULE:FREQ=MONTHLY;COUNT=6;SKIP=FORWARD'),
    /SKIP MUST NOT be present unless RSCALE is present/,
  );
});

test('rrulestr: roundtrips hebrew yearly RSCALE rules', { skip: !supportsCalendar('hebrew') }, () => {
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
  const input = `DTSTART:${dtline}Z\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3`;
  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRule, true);
  assert.equal(
    parsed.toString(),
    `DTSTART:${dtline}Z\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3`,
  );
  assert.deepEqual(parsed.all().map((value) => value.toISOString()), [
    '2024-10-03T00:00:00.000Z',
    '2025-09-23T00:00:00.000Z',
    '2026-09-12T00:00:00.000Z',
  ]);
});

test('rrulestr: preserves leap-month BYMONTH tokens under RSCALE', { skip: !supportsCalendar('hebrew') }, () => {
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
  const input = `DTSTART:${dtline}Z\nRRULE:RSCALE=HEBREW;SKIP=OMIT;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=2`;
  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRule, true);
  assert.equal(
    parsed.toString(),
    `DTSTART:${dtline}Z\nRRULE:RSCALE=HEBREW;SKIP=OMIT;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=2`,
  );

  for (const occ of parsed.all()) {
    const hebrew = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]')).withCalendar('hebrew');
    assert.equal(hebrew.monthCode, 'M05L');
    assert.equal(hebrew.day, 1);
  }
});

test('rrulestr: string and options paths stay consistent on weekly business-day queries', () => {
  const fromString = RRule.fromString(
    'DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=WEEKLY;UNTIL=99991231T000000Z;BYDAY=MO,TU,WE,TH,FR',
  );
  const fromOptions = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    dtstart: datetime(2025, 1, 1, 0, 0, 0),
    until: new Date('9999-12-31T00:00:00.000Z'),
    tzid: 'UTC',
  });

  const stringValues = fromString
    .between(new Date('2025-09-01T00:00:00.000Z'), new Date('2025-09-30T23:59:59.000Z'), true)
    .map((date) => date.toISOString());
  const optionValues = fromOptions
    .between(new Date('2025-09-01T00:00:00.000Z'), new Date('2025-09-30T23:59:59.000Z'), true)
    .map((date) => date.toISOString());

  assert.equal(stringValues.length, 22);
  assert.equal(optionValues.length, 22);
  assert.equal(new Set(stringValues.map((value) => value.slice(11, 19))).size, 1);
  assert.equal(new Set(optionValues.map((value) => value.slice(11, 19))).size, 1);
  assert.equal(stringValues[0]?.slice(11, 19), '12:00:00');
  assert.equal(optionValues[0]?.slice(11, 19), '00:00:00');
});

test('rrulestr: string and options paths stay consistent for monthly BYSETPOS bounded queries', () => {
  const fromString = RRule.fromString(
    'DTSTART;TZID=UTC:20250101T080000\nRRULE:FREQ=MONTHLY;COUNT=6;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=8,20;BYMINUTE=0;BYSECOND=0',
  );
  const fromOptions = new RRule({
    freq: Frequency.MONTHLY,
    count: 6,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    bysetpos: -1,
    byhour: [8, 20],
    byminute: [0],
    bysecond: [0],
    dtstart: datetime(2025, 1, 1, 8, 0, 0),
    tzid: 'UTC',
  });

  const fromStringValues = fromString
    .between(new Date('2025-01-01T00:00:00.000Z'), new Date('2025-04-30T23:59:59.000Z'), true)
    .map((date) => date.toISOString());
  const fromOptionsValues = fromOptions
    .between(new Date('2025-01-01T00:00:00.000Z'), new Date('2025-04-30T23:59:59.000Z'), true)
    .map((date) => date.toISOString());

  assert.deepEqual(fromStringValues, fromOptionsValues);
  assert.deepEqual(fromStringValues, [
    '2025-01-31T20:00:00.000Z',
    '2025-02-28T20:00:00.000Z',
    '2025-03-31T20:00:00.000Z',
    '2025-04-30T20:00:00.000Z',
  ]);
});
