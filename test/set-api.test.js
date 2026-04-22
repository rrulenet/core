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

function localDateInZone(year, month, day, hour, minute, second, timeZone) {
  const instant = new Temporal.PlainDateTime(year, month, day, hour, minute, second)
    .toZonedDateTime(timeZone)
    .toInstant();
  return new Date(instant.epochMilliseconds);
}

test('set/api: rruleset toString is deterministic and set-shaped', () => {
  const set = new RRuleSet();
  set.tzid('UTC');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exrule(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 12, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-15T09:00:00.000Z'));
  set.exdate(new Date('2026-04-11T09:00:00.000Z'));

  assert.equal(
    set.toString(),
    [
      'DTSTART:20260411T090000Z',
      'RRULE:FREQ=DAILY;COUNT=2',
      'EXRULE:FREQ=DAILY;COUNT=1',
      'RDATE:20260415T090000Z',
      'EXDATE:20260411T090000Z',
    ].join('\n'),
  );
});

test('set/api: valueOf keeps only the first rule DTSTART across multiple RRULE lines', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.YEARLY,
    count: 2,
    dtstart: datetime(1960, 1, 1, 9, 0, 0),
  }));
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
  }));

  assert.deepEqual(set.valueOf(), [
    'DTSTART:19600101T090000Z',
    'RRULE:FREQ=YEARLY;COUNT=2',
    'RRULE:FREQ=WEEKLY;COUNT=3',
  ]);
});

test('set/api: valueOf renders timezone-aware RRULE, RDATE, and EXDATE lines', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.YEARLY,
    count: 2,
    dtstart: localDateInZone(1960, 1, 1, 9, 0, 0, 'America/New_York'),
    tzid: 'America/New_York',
  }));
  set.rdate(localDateInZone(1961, 2, 1, 9, 0, 0, 'America/New_York'));
  set.rdate(localDateInZone(1961, 3, 1, 9, 0, 0, 'America/New_York'));
  set.exdate(localDateInZone(1961, 4, 1, 9, 0, 0, 'America/New_York'));
  set.exdate(localDateInZone(1961, 5, 1, 9, 0, 0, 'America/New_York'));

  assert.deepEqual(set.valueOf(), [
    'DTSTART;TZID=America/New_York:19600101T090000',
    'RRULE:FREQ=YEARLY;COUNT=2',
    'RDATE;TZID=America/New_York:19610201T090000,19610301T090000',
    'EXDATE;TZID=America/New_York:19610401T090000,19610501T090000',
  ]);
});

test('set/api: rruleset clone is independent from the original', () => {
  const original = new RRuleSet();
  original.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  original.rdate(new Date('2026-04-15T09:00:00.000Z'));

  const cloned = original.clone();
  cloned.exdate(new Date('2026-04-11T09:00:00.000Z'));

  assert.deepEqual(original.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
  assert.deepEqual(cloned.all().map((value) => value.toISOString()), [
    '2026-04-12T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
});

test('set/api: noCache disables all() result reuse', () => {
  const cached = new RRuleSet();
  cached.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  const uncached = new RRuleSet(true);
  uncached.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  assert.equal(cached.all(), cached.all());
  assert.notEqual(uncached.all(), uncached.all());
});

test('set/api: rrules getters return defensive copies', () => {
  const set = new RRuleSet();
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });
  const rdate = new Date('2026-04-15T09:00:00.000Z');
  const exdate = new Date('2026-04-11T09:00:00.000Z');

  set.rrule(rule);
  set.rdate(rdate);
  set.exdate(exdate);

  const rules = set.rrules();
  const exrules = set.exrules();
  const rdates = set.rdates();
  const exdates = set.exdates();

  rules.push(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 20, 9, 0, 0),
  }));
  exrules.push(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 21, 9, 0, 0),
  }));
  rdates[0]?.setUTCDate(30);
  exdates[0]?.setUTCDate(30);

  assert.equal(set.rrules().length, 1);
  assert.equal(set.exrules().length, 0);
  assert.deepEqual(set.rdates().map((value) => value.toISOString()), ['2026-04-15T09:00:00.000Z']);
  assert.deepEqual(set.exdates().map((value) => value.toISOString()), ['2026-04-11T09:00:00.000Z']);
});

test('set/api: dtstart getter returns a defensive copy', () => {
  const set = new RRuleSet();
  set.dtstart(datetime(2026, 4, 11, 9, 0, 0));

  const got = set.dtstart();
  got?.setUTCDate(30);

  assert.equal(set.dtstart()?.toISOString(), '2026-04-11T09:00:00.000Z');
});

test('set/api: dtstart and tzid fall back to first included rule', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  const dtstart = set.dtstart();
  dtstart?.setUTCDate(30);

  assert.equal(set.dtstart()?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(set.tzid(), 'Europe/Paris');
});

test('set/api: all and between support rrule.js-style iterator callback', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 5,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  assert.deepEqual(
    set.all((_, index) => index < 2).map((value) => value.toISOString()),
    ['2026-04-11T09:00:00.000Z', '2026-04-12T09:00:00.000Z'],
  );
  assert.deepEqual(
    set
      .between(new Date('2026-04-11T00:00:00.000Z'), new Date('2026-04-15T23:59:59.000Z'), true, (_, index) => index < 3)
      .map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:00.000Z',
      '2026-04-12T09:00:00.000Z',
      '2026-04-13T09:00:00.000Z',
    ],
  );
});

test('set/api: toJSON returns defensive date copies and serialized rules', () => {
  const set = new RRuleSet();
  set.dtstart(datetime(2026, 4, 10, 9, 0, 0));
  set.tzid('UTC');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-15T09:00:00.000Z'));

  const json = set.toJSON();
  json.dtstart?.setUTCDate(30);
  json.rdate?.[0]?.setUTCDate(30);

  assert.equal(set.dtstart()?.toISOString(), '2026-04-10T09:00:00.000Z');
  assert.deepEqual(set.rdates().map((value) => value.toISOString()), ['2026-04-15T09:00:00.000Z']);
  assert.equal(json.rrule?.[0]?.freq, Frequency.DAILY);
});

test('set/api: duplicate rdate and exdate additions are ignored', () => {
  const set = new RRuleSet();
  const date = new Date('2026-04-15T09:00:00.000Z');

  set.rdate(date);
  set.rdate(new Date('2026-04-15T09:00:00.000Z'));
  set.exdate(date);
  set.exdate(new Date('2026-04-15T09:00:00.000Z'));

  assert.equal(set.rdates().length, 1);
  assert.equal(set.exdates().length, 1);
});

test('set/api: exclusion rules can remove explicit included dates at the same instant', () => {
  const set = new RRuleSet();
  set.rdate(new Date('2026-04-15T09:00:00.000Z'));
  set.exrule(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 15, 9, 0, 0),
  }));

  assert.deepEqual(set.all().map((value) => value.toISOString()), []);
});

test('set/api: exdate can remove a matching explicit rdate while leaving other explicit dates intact', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 10,
    dtstart: datetime(2025, 1, 1, 10, 0, 0),
  }));
  set.rdate(new Date('2025-01-10T10:00:00.000Z'));
  set.rdate(new Date('2025-01-15T10:00:00.000Z'));
  set.exdate(new Date('2025-01-02T10:00:00.000Z'));
  set.exdate(new Date('2025-01-15T10:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2025-01-01T10:00:00.000Z',
    '2025-01-03T10:00:00.000Z',
    '2025-01-04T10:00:00.000Z',
    '2025-01-05T10:00:00.000Z',
    '2025-01-06T10:00:00.000Z',
    '2025-01-07T10:00:00.000Z',
    '2025-01-08T10:00:00.000Z',
    '2025-01-09T10:00:00.000Z',
    '2025-01-10T10:00:00.000Z',
  ]);
});

test('set/api: exdate with no matching instant has no effect on results', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2025, 1, 1, 10, 0, 0),
  }));
  set.exdate(new Date('2025-02-01T10:00:00.000Z'));

  assert.deepEqual(set.all().map((value) => value.toISOString()), [
    '2025-01-01T10:00:00.000Z',
    '2025-01-02T10:00:00.000Z',
    '2025-01-03T10:00:00.000Z',
  ]);
});

test('set/api: rdate and exdate clone input dates and keep them sorted', () => {
  const set = new RRuleSet();
  const later = new Date('2026-04-15T09:00:00.000Z');
  const earlier = new Date('2026-04-11T09:00:00.000Z');

  set.rdate(later);
  set.rdate(earlier);
  set.exdate(later);
  set.exdate(earlier);

  later.setUTCDate(30);
  earlier.setUTCDate(1);

  assert.deepEqual(set.rdates().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
  assert.deepEqual(set.exdates().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-15T09:00:00.000Z',
  ]);
});

test('set/api: mutators reject invalid input types', () => {
  const set = new RRuleSet();

  assert.throws(() => set.rrule('RRULE:FREQ=DAILY'), /is not RRule instance/);
  assert.throws(() => set.exrule('RRULE:FREQ=DAILY'), /is not RRule instance/);
  assert.throws(() => set.rdate('2026-04-15'), /is not Date instance/);
  assert.throws(() => set.exdate('2026-04-15'), /is not Date instance/);
});

test('set/api: duplicate rule additions are ignored by serialized identity', () => {
  const set = new RRuleSet();
  const a = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });
  const b = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  set.rrule(a);
  set.rrule(b);
  set.exrule(a.clone());
  set.exrule(b.clone());

  assert.equal(set.rrules().length, 1);
  assert.equal(set.exrules().length, 1);
});

test('set/api: before and after honor the inclusive flag', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));

  const pivot = new Date('2026-04-12T09:00:00.000Z');

  assert.equal(set.before(pivot)?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(set.before(pivot, true)?.toISOString(), '2026-04-12T09:00:00.000Z');
  assert.equal(set.after(pivot)?.toISOString(), '2026-04-13T09:00:00.000Z');
  assert.equal(set.after(pivot, true)?.toISOString(), '2026-04-12T09:00:00.000Z');
});

test('set/api: before and after surface explicit included dates in query order', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 2,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 1, 5, 9, 0, 0),
  }));
  set.rdate(new Date('2026-01-07T09:00:00.000Z'));

  assert.equal(set.after(new Date('2026-01-05T09:00:00.000Z'))?.toISOString(), '2026-01-07T09:00:00.000Z');
  assert.equal(set.before(new Date('2026-01-12T09:00:00.000Z'))?.toISOString(), '2026-01-07T09:00:00.000Z');
});

test('set/api: query methods reject invalid dates', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  const invalid = new Date(undefined);
  const valid = new Date('2026-04-11T00:00:00.000Z');

  assert.throws(() => set.before(invalid), /Invalid date/);
  assert.throws(() => set.after(invalid), /Invalid date/);
  assert.throws(() => set.between(invalid, valid), /Invalid date/);
  assert.throws(() => set.between(valid, invalid), /Invalid date/);
});

test('set/api: toText describes single-rule sets with additional and excluded dates', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.MONTHLY,
    count: 1,
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  }));
  set.rdate(new Date('2026-02-10T00:00:00.000Z'));
  set.exdate(new Date('2026-03-10T00:00:00.000Z'));
  set.exdate(new Date('2026-04-10T00:00:00.000Z'));

  assert.equal(set.toText(), 'every month for 1 time with 1 additional date excluding 2 dates');
  assert.equal(set.toText({ locale: 'fr' }), 'chaque mois pendant 1 occurrence avec 1 date supplémentaire en excluant 2 dates');
  assert.equal(set.isFullyConvertibleToText(), true);
});

test('set/api: toText composes included and excluded rule text for multi-rule sets', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 2,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  }));
  set.exrule(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 12, 9, 0, 0),
  }));

  assert.equal(
    set.toText(),
    'every day at 9 AM UTC for 2 times and every week on Monday at 9 AM UTC for 2 times excluding every day at 9 AM UTC for 1 time',
  );
  assert.equal(set.isFullyConvertibleToText(), true);
});

test('set/api: toText merges similar weekly rules into one sentence', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 2,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  }));
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 2,
    byweekday: [RRule.WE],
    dtstart: datetime(2026, 4, 15, 9, 0, 0),
  }));

  assert.equal(set.toText(), 'every week on Monday and Wednesday at 9 AM UTC for 2 times');
  assert.equal(set.toText({ locale: 'fr' }), 'chaque semaine le lundi et le mercredi à 09:00 UTC pendant 2 occurrences');
});

test('set/api: toText uses except wording for simple single exclusions', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 4,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exdate(new Date('2026-04-12T09:00:00.000Z'));

  assert.equal(set.toText(), 'every day at 9 AM UTC for 4 times except 1 date');
  assert.equal(set.toText({ locale: 'fr' }), 'chaque jour à 09:00 UTC pendant 4 occurrences sauf 1 date');
});

test('set/api: toString is stable for multi-rule multi-date sets', () => {
  const set = new RRuleSet();
  set.tzid('UTC');
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.rrule(new RRule({
    freq: Frequency.WEEKLY,
    count: 2,
    byweekday: [RRule.MO],
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  }));
  set.exrule(new RRule({
    freq: Frequency.DAILY,
    count: 1,
    dtstart: datetime(2026, 4, 12, 9, 0, 0),
  }));
  set.rdate(new Date('2026-04-15T09:00:00.000Z'));
  set.exdate(new Date('2026-04-11T09:00:00.000Z'));

  assert.equal(
    set.toString(),
    [
      'DTSTART:20260411T090000Z',
      'RRULE:FREQ=DAILY;COUNT=2',
      'DTSTART:20260413T090000Z',
      'RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO',
      'EXRULE:FREQ=DAILY;COUNT=1',
      'RDATE:20260415T090000Z',
      'EXDATE:20260411T090000Z',
    ].join('\n'),
  );
});

test('set/api: rrulestr roundtrips multi-rule multi-date sets', () => {
  const input = [
    'DTSTART:20260411T090000Z',
    'RRULE:FREQ=DAILY;COUNT=2',
    'DTSTART:20260413T090000Z',
    'RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO',
    'EXRULE:FREQ=DAILY;COUNT=1',
    'RDATE:20260415T090000Z',
    'EXDATE:20260411T090000Z',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(parsed.toString(), input);
  assert.deepEqual(
    parsed.all().map((value) => value.toISOString()),
    [
      '2026-04-12T09:00:00.000Z',
      '2026-04-15T09:00:00.000Z',
      '2026-04-20T09:00:00.000Z',
    ],
  );
});

test('set/api: rrulestr roundtrips timezone-aware sets with explicit local dates', () => {
  const input = [
    'DTSTART;TZID=Europe/Paris:20260328T090000',
    'RRULE:FREQ=DAILY;COUNT=3',
    'RDATE;TZID=Europe/Paris:20260331T090000',
    'EXDATE;TZID=Europe/Paris:20260329T090000',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(parsed.toString(), input);
  assert.deepEqual(
    parsed.all().map((value) => value.toISOString()),
    [
      '2026-03-28T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
      '2026-03-31T07:00:00.000Z',
    ],
  );
});

test('set/api: rrulestr preserves tzid for sets that only contain RDATE values', () => {
  const input = 'RDATE;TZID=America/Los_Angeles:20101110T100000';

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(parsed.tzid(), 'America/Los_Angeles');
  assert.equal(parsed.toString(), input);
  assert.deepEqual(parsed.all().map((value) => value.toISOString()), [
    '2010-11-10T18:00:00.000Z',
  ]);
});

test('set/api: toString renders multi-date RDATE-only sets in UTC and named timezones', () => {
  const utcSet = new RRuleSet();
  utcSet.tzid('UTC');
  utcSet.rdate(datetime(1961, 2, 1, 9, 0, 0));
  utcSet.rdate(datetime(1961, 3, 1, 9, 0, 0));

  const zonedSet = new RRuleSet();
  zonedSet.tzid('America/New_York');
  zonedSet.rdate(localDateInZone(1961, 2, 1, 9, 0, 0, 'America/New_York'));
  zonedSet.rdate(localDateInZone(1961, 3, 1, 9, 0, 0, 'America/New_York'));

  assert.equal(utcSet.toString(), 'RDATE:19610201T090000Z,19610301T090000Z');
  assert.equal(zonedSet.toString(), 'RDATE;TZID=America/New_York:19610201T090000,19610301T090000');
  assert.equal(rrulestr(zonedSet.toString()).toString(), zonedSet.toString());
});

test('set/api: rrulestr canonicalizes legacy RRULE DTSTART form when exclusions are present', () => {
  const input = [
    'RRULE:DTSTART=19990104T110000Z;FREQ=DAILY;INTERVAL=1',
    'EXDATE:20170821T160000Z',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(
    parsed.toString(),
    [
      'DTSTART:19990104T110000Z',
      'RRULE:FREQ=DAILY;INTERVAL=1',
      'EXDATE:20170821T160000Z',
    ].join('\n'),
  );
});

test('set/api: rrulestr canonicalizes legacy RRULE DTSTART form with existing UNTIL', () => {
  const input = 'RRULE:DTSTART=20171201T080000Z;FREQ=WEEKLY;UNTIL=20180301T080000Z';

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRule, true);
  assert.equal(
    parsed.toString(),
    [
      'DTSTART:20171201T080000Z',
      'RRULE:FREQ=WEEKLY;UNTIL=20180301T080000Z',
    ].join('\n'),
  );
});

test('set/api: rrulestr canonicalizes legacy RRULE DTSTART form with TZID', () => {
  const input = 'RRULE:DTSTART;TZID=America/New_York:20171201T080000;FREQ=WEEKLY;UNTIL=20171224T235959';

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRule, true);
  assert.equal(
    parsed.toString(),
    [
      'DTSTART;TZID=America/New_York:20171201T080000',
      'RRULE:FREQ=WEEKLY;UNTIL=20171224T235959',
    ].join('\n'),
  );
});

test('set/api: rrulestr roundtrips dense multi-rule sets with exrule and explicit dates', () => {
  const input = [
    'DTSTART:20260411T090000Z',
    'RRULE:FREQ=DAILY;COUNT=2',
    'DTSTART:20260413T090000Z',
    'RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO,WE',
    'EXRULE:FREQ=DAILY;COUNT=1',
    'RDATE:20260415T090000Z,20260417T090000Z',
    'EXDATE:20260411T090000Z,20260420T090000Z',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(parsed.toString(), input);
  assert.deepEqual(
    parsed.all().map((value) => value.toISOString()),
    [
      '2026-04-12T09:00:00.000Z',
      '2026-04-15T09:00:00.000Z',
      '2026-04-17T09:00:00.000Z',
    ],
  );
});

test('set/api: rrulestr unfolds folded RDATE and EXDATE lines in sets', () => {
  const input = [
    'DTSTART:20260411T090000Z',
    'RRULE:FREQ=DAILY;COUNT=6',
    'RDATE:20260420T090000Z,',
    ' 20260421T090000Z',
    'EXDATE:20260412T090000Z,',
    ' 20260413T090000Z',
  ].join('\r\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.deepEqual(
    parsed.all().map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:00.000Z',
      '2026-04-14T09:00:00.000Z',
      '2026-04-15T09:00:00.000Z',
      '2026-04-16T09:00:00.000Z',
      '2026-04-20T09:00:00.000Z',
      '2026-04-21T09:00:00.000Z',
    ],
  );
});

test('set/api: rrulestr preserves per-rule DTSTART in timezone-aware multi-rule sets', () => {
  const input = [
    'DTSTART;TZID=Europe/Paris:20260328T090000',
    'RRULE:FREQ=DAILY;COUNT=2',
    'DTSTART;TZID=Europe/Paris:20260330T180000',
    'RRULE:FREQ=DAILY;COUNT=2',
    'EXDATE;TZID=Europe/Paris:20260329T090000',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(parsed.toString(), input);
  assert.deepEqual(
    parsed.all().map((value) => value.toISOString()),
    [
      '2026-03-28T08:00:00.000Z',
      '2026-03-30T16:00:00.000Z',
      '2026-03-31T16:00:00.000Z',
    ],
  );
});

test('set/api: rrulestr roundtrips sets containing hebrew RSCALE rules', { skip: !supportsCalendar('hebrew') }, () => {
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
  const input = [
    `DTSTART:${dtline}Z`,
    'RRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3',
    'EXDATE:20250923T000000Z',
  ].join('\n');

  const parsed = rrulestr(input);

  assert.equal(parsed instanceof RRuleSet, true);
  assert.equal(
    parsed.toString(),
    [
      `DTSTART:${dtline}Z`,
      'RRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3',
      'EXDATE:20250923T000000Z',
    ].join('\n'),
  );
  assert.deepEqual(parsed.all().map((value) => value.toISOString()), [
    '2024-10-03T00:00:00.000Z',
    '2026-09-12T00:00:00.000Z',
  ]);
});

test('set/api: invalid tzid on a set with exdate fails observably', () => {
  assert.throws(() => {
    const set = new RRuleSet();
    set.rrule(new RRule({
      count: 1,
      dtstart: datetime(1997, 9, 2, 9, 0, 0),
      tzid: 'America/Unknown',
    }));
    set.exdate(datetime(1997, 9, 2, 9, 0, 0));
  }, RangeError);
});

test('set/api: between is not sensitive to rule insertion order when one rule is finite and one is open-ended', () => {
  const finite = rrulestr('DTSTART:20201117T000000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20201117T000000Z');
  const infinite = rrulestr('DTSTART:20201118T000000Z\nRRULE:FREQ=WEEKLY;BYDAY=WE,FR,SA');

  const finiteFirst = new RRuleSet();
  finiteFirst.rrule(finite);
  finiteFirst.rrule(infinite);

  const infiniteFirst = new RRuleSet();
  infiniteFirst.rrule(infinite);
  infiniteFirst.rrule(finite);

  assert.deepEqual(
    finiteFirst
      .between(new Date('2020-11-17T00:00:00.000Z'), new Date('2020-11-17T00:00:00.000Z'), true)
      .map((date) => date.toISOString()),
    ['2020-11-17T00:00:00.000Z'],
  );
  assert.deepEqual(
    infiniteFirst
      .between(new Date('2020-11-17T00:00:00.000Z'), new Date('2020-11-17T00:00:00.000Z'), true)
      .map((date) => date.toISOString()),
    ['2020-11-17T00:00:00.000Z'],
  );
});

test('set/api: rulesets rebuilt from their string keep the same timezone-aware occurrences', () => {
  const first = new RRuleSet();
  first.rrule(
    rrulestr('DTSTART;TZID=Europe/Paris:20190311T070000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20190324T230000'),
  );
  first.rrule(
    rrulestr('DTSTART;TZID=Europe/Paris:20190325T120000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20210325T120000Z'),
  );

  const rebuilt = new RRuleSet();
  rebuilt.rrule(rrulestr(first.toString(), { forceset: true }));

  const windowStart = new Date('2019-03-18T00:00:00.000Z');
  const windowEnd = new Date('2019-04-01T00:00:00.000Z');

  assert.deepEqual(
    rebuilt.between(windowStart, windowEnd).map((date) => date.toISOString()),
    first.between(windowStart, windowEnd).map((date) => date.toISOString()),
  );
});


test('set/api: after before and between honor exdate exclusions under cache on timezone-aware monthly sets', () => {
  const set = rrulestr([
    'DTSTART;TZID=Europe/Amsterdam:20260101T163000',
    'RRULE:FREQ=MONTHLY;INTERVAL=1',
    'RDATE;TZID=Europe/Amsterdam:20260327T093000',
    'EXDATE;TZID=Europe/Amsterdam:20260401T163000',
  ].join('\n'), { forceset: true });

  const aprilOccurrence = new Date('2026-04-01T16:30:00.000Z');

  assert.equal(set.after(aprilOccurrence, true)?.toISOString(), '2026-05-01T14:30:00.000Z');
  assert.equal(set.before(aprilOccurrence, true)?.toISOString(), '2026-03-27T08:30:00.000Z');
  assert.deepEqual(
    set.between(new Date('2026-03-01T00:00:00.000Z'), new Date('2026-05-01T00:00:00.000Z'), true),
    [
      new Date('2026-03-01T15:30:00.000Z'),
      new Date('2026-03-27T08:30:00.000Z'),
    ],
  );
});
