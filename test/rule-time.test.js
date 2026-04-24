import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Temporal } from 'temporal-polyfill';

import { datetime, Frequency, RRule, RRuleSet, rrulestr } from './support/compat.js';

const compatModuleUrl = new URL('./support/compat.js', import.meta.url).href;

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

test('rule/time: timezone keeps local wall time stable across DST', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  });

  assert.deepEqual(
    rule.getSource().all().map((value) => value.toString({ smallestUnit: 'second' })),
    [
      '2026-03-28T09:00:00+01:00[Europe/Paris]',
      '2026-03-29T09:00:00+02:00[Europe/Paris]',
      '2026-03-30T09:00:00+02:00[Europe/Paris]',
    ],
  );
});

test('rule/time: between in named timezone honors local wall time boundaries', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-03-29T06:59:59.000Z'), new Date('2026-03-30T07:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    ['2026-03-29T07:00:00.000Z', '2026-03-30T07:00:00.000Z'],
  );
});

test('rule/time: timezone-aware daily rule does not skip the initial occurrence when byhour matches local wall time', () => {
  const rule = new RRule({
    tzid: 'America/Los_Angeles',
    byhour: 5,
    count: 1,
    dtstart: new Date('2024-05-14T06:59:59.999Z'),
    freq: Frequency.DAILY,
  });

  assert.deepEqual(rule.all().map((date) => date.toISOString()), ['2024-05-14T12:59:59.999Z']);
});

test('rule/time: Europe/London daily midnight stays on local midnight across DST', () => {
  const rule = RRule.fromString('DTSTART;TZID=Europe/London:20200305T000000\nRRULE:FREQ=DAILY;COUNT=30;INTERVAL=1;WKST=MO');

  assert.deepEqual(
    rule.getSource().all().slice(-7).map((value) => value.toString({ smallestUnit: 'second' })),
    [
      '2020-03-28T00:00:00+00:00[Europe/London]',
      '2020-03-29T00:00:00+00:00[Europe/London]',
      '2020-03-30T00:00:00+01:00[Europe/London]',
      '2020-03-31T00:00:00+01:00[Europe/London]',
      '2020-04-01T00:00:00+01:00[Europe/London]',
      '2020-04-02T00:00:00+01:00[Europe/London]',
      '2020-04-03T00:00:00+01:00[Europe/London]',
    ],
  );
});

test('rule/time: weekly timezone repro from rrule.js issue 658 matches expected local weekday', () => {
  const script = `
    import { RRule } from '${compatModuleUrl}'
    const rule = new RRule({
      freq: RRule.WEEKLY,
      dtstart: new Date(2025, 10, 25, 3, 0, 0),
      tzid: 'Asia/Kolkata',
      count: 1,
      byweekday: RRule.TH,
    })
    console.log(JSON.stringify(rule.all().map((date) => date.toISOString())))
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'Asia/Kolkata' },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), ['2025-11-26T21:30:00.000Z']);
});

test('rule/time: named timezone byhour values are interpreted in the target timezone', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    dtstart: new Date(Date.UTC(2023, 0, 7, 0, 0, 0)),
    tzid: 'Asia/Karachi',
    until: new Date(Date.UTC(2023, 0, 22, 3, 48, 0)),
    count: 30,
    interval: 1,
    byweekday: [RRule.MO, RRule.TU, RRule.WE],
    byhour: [0, 1],
    byminute: [0, 30],
    bysecond: [0],
  });

  assert.deepEqual(
    rule.between(new Date(Date.UTC(2023, 0, 8, 0, 0, 0)), new Date(Date.UTC(2023, 0, 11, 23, 59, 59)), true).map((date) => date.toISOString()),
    [
      '2023-01-08T19:00:00.000Z',
      '2023-01-08T19:30:00.000Z',
      '2023-01-08T20:00:00.000Z',
      '2023-01-08T20:30:00.000Z',
      '2023-01-09T19:00:00.000Z',
      '2023-01-09T19:30:00.000Z',
      '2023-01-09T20:00:00.000Z',
      '2023-01-09T20:30:00.000Z',
      '2023-01-10T19:00:00.000Z',
      '2023-01-10T19:30:00.000Z',
      '2023-01-10T20:00:00.000Z',
      '2023-01-10T20:30:00.000Z',
    ],
  );
});

test('rule/time: timezone-aware first-Friday monthly rule matches RFC 5545 examples', () => {
  const fromString = RRule.fromString('DTSTART;TZID=America/New_York:19970905T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYDAY=+1FR');
  const fromOptions = new RRule({
    dtstart: new Date(Date.UTC(1997, 8, 5, 13, 0, 0)),
    freq: Frequency.MONTHLY,
    count: 10,
    tzid: 'America/New_York',
    byweekday: RRule.FR.nth(+1),
  });

  assert.equal(fromString.toString(), 'DTSTART;TZID=America/New_York:19970905T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYDAY=+1FR');
  assert.equal(fromOptions.toString(), 'DTSTART;TZID=America/New_York:19970905T090000\nRRULE:FREQ=MONTHLY;COUNT=10;BYDAY=+1FR');
  assert.deepEqual(
    fromString.all().slice(0, 4).map((date) => date.toISOString()),
    [
      '1997-09-05T13:00:00.000Z',
      '1997-10-03T13:00:00.000Z',
      '1997-11-07T14:00:00.000Z',
      '1997-12-05T14:00:00.000Z',
    ],
  );
  assert.deepEqual(
    fromOptions.all().slice(0, 4).map((date) => date.toISOString()),
    [
      '1997-09-05T13:00:00.000Z',
      '1997-10-03T13:00:00.000Z',
      '1997-11-07T14:00:00.000Z',
      '1997-12-05T14:00:00.000Z',
    ],
  );
});

test('rule/time: weekly Montreal DTSTART keeps the expected EST wall time in late 2020', () => {
  const rule = RRule.fromString('DTSTART;TZID=America/Montreal:20111002T090000\nRRULE:FREQ=WEEKLY');

  assert.deepEqual(
    rule.between(new Date('2020-11-02T00:00:00.000Z'), new Date('2020-12-09T00:00:00.000Z')).map((date) => date.toISOString()),
    [
      '2020-11-08T14:00:00.000Z',
      '2020-11-15T14:00:00.000Z',
      '2020-11-22T14:00:00.000Z',
      '2020-11-29T14:00:00.000Z',
      '2020-12-06T14:00:00.000Z',
    ],
  );
});

test('rule/time: named timezone daily byhour ignores the machine local timezone', () => {
  const dubai = new RRule({
    dtstart: datetime(2023, 10, 25),
    until: datetime(2023, 10, 29),
    interval: 1,
    freq: Frequency.DAILY,
    tzid: 'Asia/Dubai',
    byhour: [9],
  });
  const cairo = new RRule({
    dtstart: datetime(2023, 10, 25),
    until: datetime(2023, 10, 29),
    interval: 1,
    freq: Frequency.DAILY,
    tzid: 'Africa/Cairo',
    byhour: [9],
  });

  assert.deepEqual(dubai.all().map((date) => date.toISOString()), [
    '2023-10-25T05:00:00.000Z',
    '2023-10-26T05:00:00.000Z',
    '2023-10-27T05:00:00.000Z',
    '2023-10-28T05:00:00.000Z',
  ]);
  assert.deepEqual(cairo.all().map((date) => date.toISOString()), [
    '2023-10-25T06:00:00.000Z',
    '2023-10-26T06:00:00.000Z',
    '2023-10-27T07:00:00.000Z',
    '2023-10-28T07:00:00.000Z',
  ]);
});

test('rule/time: weekly named timezone rules do not roll over to the wrong local day', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    interval: 1,
    byweekday: [RRule.WE],
    dtstart: datetime(2023, 12, 14, 0, 15, 0),
    count: 5,
    tzid: 'America/Denver',
  });

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2023-12-14T00:15:00.000Z',
    '2023-12-21T00:15:00.000Z',
    '2023-12-28T00:15:00.000Z',
    '2024-01-04T00:15:00.000Z',
    '2024-01-11T00:15:00.000Z',
  ]);
});

test('rule/time: before is stable across process local timezones when tzid is set', () => {
  const script = `
    import { RRule, datetime } from '${compatModuleUrl}'
    const dtstart = datetime(2023, 2, 25, 0, 0, 0)
    const rule = new RRule({
      byweekday: [RRule.SA],
      freq: RRule.WEEKLY,
      tzid: 'Europe/Madrid',
      interval: 1,
      dtstart,
    })
    const result = rule.before(new Date('2023-02-27T08:15:00.000Z'), true)
    console.log(result ? result.toISOString() : 'null')
  `;

  for (const tz of ['UTC', 'CET', 'Asia/Taipei', 'America/New_York']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '2023-02-25T00:00:00.000Z');
  }
});

test('rule/time: between with timezone-aware DTSTART preserves the intended local wall time', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=America/Los_Angeles:20190603T181500\nRRULE:FREQ=WEEKLY;WKST=SU;BYDAY=MO,TU,WE,FR,SA',
  );

  assert.deepEqual(
    rule
      .between(new Date('2019-07-16T14:00:00.000Z'), new Date('2019-07-23T14:00:00.000Z'))
      .map((date) => date.toISOString()),
    [
      '2019-07-17T01:15:00.000Z',
      '2019-07-18T01:15:00.000Z',
      '2019-07-20T01:15:00.000Z',
      '2019-07-21T01:15:00.000Z',
      '2019-07-23T01:15:00.000Z',
    ],
  );
});

test('rule/time: between on UTC rules does not depend on process timezone greater than GMT+12', () => {
  const script = `
    import { RRule } from '${compatModuleUrl}'
    const rule = new RRule({
      freq: RRule.DAILY,
      dtstart: new Date('2021-03-23T10:00:00Z'),
    })
    console.log(JSON.stringify(rule.between(
      new Date('2021-03-20T00:00:00Z'),
      new Date('2021-03-26T00:00:00Z'),
      true,
    ).map((date) => date.toISOString())))
  `;

  for (const tz of ['Pacific/Fiji', 'Pacific/Apia']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), [
      '2021-03-23T10:00:00.000Z',
      '2021-03-24T10:00:00.000Z',
      '2021-03-25T10:00:00.000Z',
    ]);
  }
});

test('rule/time: UTC UNTIL remains inclusive when DTSTART has TZID', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=Asia/Jerusalem:20230805T123000\nRRULE:FREQ=WEEKLY;UNTIL=20230819T093000Z',
  );

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2023-08-05T09:30:00.000Z',
    '2023-08-12T09:30:00.000Z',
    '2023-08-19T09:30:00.000Z',
  ]);
});

test('rule/time: weekly byweekday plus subdaily expansion stays non-empty before an UNTIL later that week', () => {
  const options = {
    freq: Frequency.WEEKLY,
    dtstart: new Date(Date.UTC(2025, 1, 2, 14, 30, 0)),
    until: new Date(Date.UTC(2025, 1, 6, 0, 0, 0)),
    byweekday: [RRule.MO, RRule.TU, RRule.WE],
    byhour: [14, 15],
    byminute: [30, 45, 0, 15],
    bysecond: [0],
  };
  const rule = new RRule(options);
  const set = new RRuleSet();
  set.rrule(new RRule(options));

  const expected = [
    '2025-02-03T14:00:00.000Z',
    '2025-02-03T14:15:00.000Z',
    '2025-02-03T14:30:00.000Z',
    '2025-02-03T14:45:00.000Z',
    '2025-02-03T15:00:00.000Z',
    '2025-02-03T15:15:00.000Z',
    '2025-02-03T15:30:00.000Z',
    '2025-02-03T15:45:00.000Z',
    '2025-02-04T14:00:00.000Z',
    '2025-02-04T14:15:00.000Z',
    '2025-02-04T14:30:00.000Z',
    '2025-02-04T14:45:00.000Z',
    '2025-02-04T15:00:00.000Z',
    '2025-02-04T15:15:00.000Z',
    '2025-02-04T15:30:00.000Z',
    '2025-02-04T15:45:00.000Z',
    '2025-02-05T14:00:00.000Z',
    '2025-02-05T14:15:00.000Z',
    '2025-02-05T14:30:00.000Z',
    '2025-02-05T14:45:00.000Z',
    '2025-02-05T15:00:00.000Z',
    '2025-02-05T15:15:00.000Z',
    '2025-02-05T15:30:00.000Z',
    '2025-02-05T15:45:00.000Z',
  ];

  assert.deepEqual(rule.all().map((date) => date.toISOString()), expected);
  assert.deepEqual(set.all().map((date) => date.toISOString()), expected);
});

test('rule/time: after on a simple open-ended timezone-aware rule does not depend on bounded all()', () => {
  const rule = RRule.fromString('DTSTART;TZID=Europe/Berlin:20231120T110012\nRRULE:FREQ=DAILY;INTERVAL=1');

  assert.equal(rule.after(new Date('2026-04-16T12:00:00.000Z'), true)?.toISOString(), '2026-04-17T09:00:12.000Z');
});

test('rule/time: hourly rules with byhour and byminute stay finite under all()', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    interval: 6,
    tzid: 'Asia/Kolkata',
    dtstart: new Date('2021-06-03T00:00:00.000Z'),
    until: new Date('2021-08-04T23:59:59.000Z'),
    byhour: [11],
    byminute: [2],
    bysecond: [0],
  });

  const dates = rule.all().map((date) => date.toISOString());

  assert.equal(dates.length, 63);
  assert.equal(dates[0], '2021-06-03T05:32:00.000Z');
  assert.equal(dates.at(-1), '2021-08-04T05:32:00.000Z');
});

test('rule/time: between on long-running minutely rules searches inside the requested window', () => {
  const rule = rrulestr(
    'DTSTART:20210703T090000Z\n' +
      'RRULE:FREQ=MINUTELY;UNTIL=20220704T121500Z;BYDAY=MO,TU,WE,TH,FR,SU;WKST=MO;BYHOUR=9,10,11,12;INTERVAL=15',
  );

  assert.deepEqual(
    rule
      .between(new Date('2022-07-03T09:00:00.000Z'), new Date('2022-07-03T12:15:00.000Z'))
      .map((date) => date.toISOString()),
    [
      '2022-07-03T09:15:00.000Z',
      '2022-07-03T09:30:00.000Z',
      '2022-07-03T09:45:00.000Z',
      '2022-07-03T10:00:00.000Z',
      '2022-07-03T10:15:00.000Z',
      '2022-07-03T10:30:00.000Z',
      '2022-07-03T10:45:00.000Z',
      '2022-07-03T11:00:00.000Z',
      '2022-07-03T11:15:00.000Z',
      '2022-07-03T11:30:00.000Z',
      '2022-07-03T11:45:00.000Z',
      '2022-07-03T12:00:00.000Z',
    ],
  );
});

test('rule/time: yearly between works across timezone conversion windows', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    tzid: 'Europe/Berlin',
    dtstart: localDateInZone(2030, 7, 1, 10, 0, 0, 'Europe/Berlin'),
  });

  const dates = rule.between(new Date('2029-12-27T12:30:00.000Z'), new Date('2057-05-19T12:30:00.000Z'), true);

  assert.equal(dates.length, 27);
  assert.deepEqual(
    Temporal.Instant.from(dates[0].toISOString()).toZonedDateTimeISO('Europe/Berlin').toString({ smallestUnit: 'second' }),
    '2030-07-01T10:00:00+02:00[Europe/Berlin]',
  );
  assert.deepEqual(
    Temporal.Instant.from(dates.at(-1).toISOString()).toZonedDateTimeISO('Europe/Berlin').toString({ smallestUnit: 'second' }),
    '2056-07-01T10:00:00+01:00[Europe/Berlin]',
  );
});

test('rule/time: yearly between preserves large interval cadence', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    interval: 2,
    tzid: 'America/New_York',
    dtstart: localDateInZone(2020, 1, 1, 12, 0, 0, 'America/New_York'),
  });

  const dates = rule.between(new Date('2030-01-01T00:00:00.000Z'), new Date('2040-12-31T23:59:59.000Z'), true);

  assert.deepEqual(
    dates.map((date) => Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO('America/New_York').year),
    [2030, 2032, 2034, 2036, 2038, 2040],
  );
});

test('rule/time: monthly between preserves large interval cadence in named timezone', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    interval: 3,
    tzid: 'Asia/Tokyo',
    dtstart: localDateInZone(2025, 1, 15, 10, 0, 0, 'Asia/Tokyo'),
  });

  const dates = rule.between(new Date('2030-01-01T00:00:00.000Z'), new Date('2030-12-31T23:59:59.000Z'), true);

  assert.deepEqual(
    dates.map((date) => Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO('Asia/Tokyo').month),
    [1, 4, 7, 10],
  );
});

test('rule/time: weekly between preserves interval cadence in named timezone', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    interval: 4,
    tzid: 'Australia/Sydney',
    dtstart: localDateInZone(2025, 1, 6, 9, 0, 0, 'Australia/Sydney'),
  });

  const dates = rule.between(new Date('2030-01-01T00:00:00.000Z'), new Date('2030-02-28T23:59:59.000Z'), true);

  assert.ok(dates.length > 0);
  assert.equal(
    dates.every((date) => Temporal.Instant.from(date.toISOString()).toZonedDateTimeISO('Australia/Sydney').dayOfWeek === 1),
    true,
  );
});

test('rule/time: after in named timezone returns first matching instant after boundary', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  });

  assert.equal(rule.after(new Date('2026-03-28T08:00:00.000Z'))?.toISOString(), '2026-03-29T07:00:00.000Z');
  assert.equal(rule.after(new Date('2026-03-29T07:00:00.000Z'), true)?.toISOString(), '2026-03-29T07:00:00.000Z');
});

test('rule/time: daily with byhour byminute bysecond expands deterministically', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-11T09:30:00.000Z',
    '2026-04-11T17:00:00.000Z',
    '2026-04-11T17:30:00.000Z',
  ]);
});

test('rule/time: UTC daily cadence preserves second precision', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2025, 1, 1, 23, 59, 59),
    tzid: 'UTC',
  });

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2025-01-01T23:59:59.000Z',
    '2025-01-02T23:59:59.000Z',
    '2025-01-03T23:59:59.000Z',
  ]);
});

test('rule/time: UTC hourly until remains inclusive on exact boundary', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    interval: 1,
    dtstart: datetime(2025, 1, 1, 22, 0, 0),
    until: new Date('2025-01-02T02:00:00.000Z'),
    tzid: 'UTC',
  });

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2025-01-01T22:00:00.000Z',
    '2025-01-01T23:00:00.000Z',
    '2025-01-02T00:00:00.000Z',
    '2025-01-02T01:00:00.000Z',
    '2025-01-02T02:00:00.000Z',
  ]);
});

test('rule/time: UTC weekly ordering stays stable with explicit wkst and multiple byday values', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 6,
    wkst: RRule.SU,
    byweekday: [RRule.SU, RRule.WE],
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
    tzid: 'UTC',
  });

  assert.deepEqual(rule.all().map((date) => date.toISOString()), [
    '2025-01-01T09:00:00.000Z',
    '2025-01-05T09:00:00.000Z',
    '2025-01-08T09:00:00.000Z',
    '2025-01-12T09:00:00.000Z',
    '2025-01-15T09:00:00.000Z',
    '2025-01-19T09:00:00.000Z',
  ]);
});

test('rule/time: weekly bymonth skips directly to matching months', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    bymonth: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-06T09:00:00.000Z',
    '1998-01-13T09:00:00.000Z',
    '1998-01-20T09:00:00.000Z',
  ]);
});

test('rule/time: weekly bymonthday keeps specific day-of-month hits', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
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

test('rule/time: weekly intersects bymonth, bymonthday, and byweekday predictably', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    bymonth: [1, 3],
    bymonthday: [1, 3],
    byweekday: [RRule.TU, RRule.TH],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-01T09:00:00.000Z',
    '1998-03-03T09:00:00.000Z',
    '2001-03-01T09:00:00.000Z',
  ]);
});

test('rule/time: weekly bysetpos can select inner expanded positions deterministically', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 3,
    byweekday: [RRule.TU, RRule.TH],
    byhour: [6, 18],
    bysetpos: [3, -3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T18:00:00.000Z',
    '1997-09-04T06:00:00.000Z',
    '1997-09-09T18:00:00.000Z',
  ]);
});

test('rule/time: weekly byhour byminute bysecond expands in chronological order', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    count: 4,
    byhour: [6, 18],
    byminute: [6, 18],
    bysecond: [6, 18],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T18:06:06.000Z',
    '1997-09-02T18:06:18.000Z',
    '1997-09-02T18:18:06.000Z',
    '1997-09-02T18:18:18.000Z',
  ]);
});

test('rule/time: monthly bymonthday includes remaining matching days in dtstart month', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=Europe/Lisbon:20260224T095000\nRRULE:FREQ=MONTHLY;UNTIL=20260522T225959Z;BYMONTHDAY=24,28,10',
  );

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-02-24T09:50:00.000Z',
    '2026-02-28T09:50:00.000Z',
    '2026-03-10T09:50:00.000Z',
    '2026-03-24T09:50:00.000Z',
    '2026-03-28T09:50:00.000Z',
    '2026-04-10T08:50:00.000Z',
    '2026-04-24T08:50:00.000Z',
    '2026-04-28T08:50:00.000Z',
    '2026-05-10T08:50:00.000Z',
  ]);
});

test('rule/time: between respects daily interval alignment on off-day windows', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    interval: 2,
    dtstart: datetime(2025, 1, 1, 0, 0, 0),
    until: new Date('2025-12-31T00:00:00.000Z'),
    tzid: 'UTC',
  });

  assert.deepEqual(
    rule
      .between(new Date('2025-01-08T00:00:00.000Z'), new Date('2025-01-08T23:59:59.000Z'), true)
      .map((date) => date.toISOString()),
    [],
  );

  assert.deepEqual(
    rule
      .between(new Date('2025-01-01T00:00:00.000Z'), new Date('2025-01-10T23:59:59.000Z'), true)
      .map((date) => date.toISOString()),
    [
      '2025-01-01T00:00:00.000Z',
      '2025-01-03T00:00:00.000Z',
      '2025-01-05T00:00:00.000Z',
      '2025-01-07T00:00:00.000Z',
      '2025-01-09T00:00:00.000Z',
    ],
  );
});

test('rule/time: daily bymonth skips directly to matching months', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    bymonth: [1, 3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-01T09:00:00.000Z',
    '1998-01-02T09:00:00.000Z',
    '1998-01-03T09:00:00.000Z',
  ]);
});

test('rule/time: daily bymonthday keeps month boundaries and day ordering', () => {
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

test('rule/time: daily intersects bymonth, bymonthday, and byweekday predictably', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    bymonth: [1, 3],
    bymonthday: [1, 3],
    byweekday: [RRule.TU, RRule.TH],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1998-01-01T09:00:00.000Z',
    '1998-03-03T09:00:00.000Z',
    '2001-03-01T09:00:00.000Z',
  ]);
});

test('rule/time: daily bysetpos works with expanded times', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
    bysetpos: -1,
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T17:30:00.000Z',
    '2026-04-12T17:30:00.000Z',
    '2026-04-13T17:30:00.000Z',
  ]);
});

test('rule/time: daily bysetpos can select inner expanded positions deterministically', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    byhour: [6, 18],
    byminute: [15, 45],
    bysetpos: [3, -3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T18:15:00.000Z',
    '1997-09-03T06:45:00.000Z',
    '1997-09-03T18:15:00.000Z',
  ]);
});

test('rule/time: until is inclusive when occurrence matches exactly', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    until: datetime(2026, 4, 13, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
    '2026-04-13T09:00:00.000Z',
  ]);
});

test('rule/time: manual daily options can override local wall time in named timezone', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    interval: 2,
    count: 3,
    byhour: [9],
    byminute: [15],
    tzid: 'America/Chicago',
    dtstart: datetime(2025, 4, 20, 8, 30, 0),
  });

  assert.deepEqual(
    rule.getSource().all().map((value) => value.toString({ smallestUnit: 'minute' })),
    [
      '2025-04-20T09:15-05:00[America/Chicago]',
      '2025-04-22T09:15-05:00[America/Chicago]',
      '2025-04-24T09:15-05:00[America/Chicago]',
    ],
  );
});

test('rule/time: until excludes later expanded times in same day', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    until: datetime(2026, 4, 11, 9, 30, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-11T09:30:00.000Z',
  ]);
});

test('rule/time: until earlier than dtstart yields no occurrences', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    until: datetime(2026, 4, 10, 9, 0, 0),
  });

  assert.deepEqual(rule.all(), []);
});

test('rule/time: minutely with expanded seconds stays ordered', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 6,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    bysecond: [0, 20, 40],
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-11T09:00:20.000Z',
    '2026-04-11T09:00:40.000Z',
    '2026-04-11T09:01:00.000Z',
    '2026-04-11T09:01:20.000Z',
    '2026-04-11T09:01:40.000Z',
  ]);
});

test('rule/time: secondly with byminute and bysecond filters correctly', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 4,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byminute: [0, 1],
    bysecond: [10, 20],
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:10.000Z',
    '2026-04-11T09:00:20.000Z',
    '2026-04-11T09:01:10.000Z',
    '2026-04-11T09:01:20.000Z',
  ]);
});

test('rule/time: open-ended dense subdaily generation stays bounded by safety cap', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    bysecond: [0, 30],
  });

  const values = rule.all();

  assert.ok(values.length > 512);
  assert.equal(values[0]?.toISOString(), '2026-04-11T09:00:00.000Z');
});

test('rule/time: open-ended wide subdaily generation stays bounded by safety cap', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    dtstart: datetime(2026, 4, 13, 0, 0, 0),
    byweekday: [RRule.MO],
    bysecond: [0, 30],
  });

  const values = rule.all();

  assert.ok(values.length > 512);
  assert.equal(values[0]?.toISOString(), '2026-04-13T00:00:00.000Z');
  assert.equal(values.every((value) => value.getUTCDay() === 1), true);
});

test('rule/time: between on unbounded daily rules works far after dtstart', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(1970, 1, 1, 0, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-05T00:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2024-01-01T00:00:00.000Z',
      '2024-01-02T00:00:00.000Z',
      '2024-01-03T00:00:00.000Z',
      '2024-01-04T00:00:00.000Z',
      '2024-01-05T00:00:00.000Z',
    ],
  );
});

test('rule/time: minutely bysecond seeks efficiently far after dtstart', () => {
  const rule = RRule.fromString([
    'DTSTART;TZID=UTC:20200101T000000',
    'RRULE:FREQ=MINUTELY;BYSECOND=0',
  ].join('\n'));
  const after = new Date('2026-03-02T10:15:30.000Z');

  assert.equal(
    rule.after(after, false)?.toISOString(),
    '2026-03-02T10:16:00.000Z',
  );
  assert.deepEqual(
    rule
      .between(after, new Date('2026-03-02T10:20:00.000Z'), false)
      .map((value) => value.toISOString()),
    [
      '2026-03-02T10:16:00.000Z',
      '2026-03-02T10:17:00.000Z',
      '2026-03-02T10:18:00.000Z',
      '2026-03-02T10:19:00.000Z',
    ],
  );
});

test('rule/time: between clips to count and returns empty past the last occurrence', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 5,
    dtstart: datetime(2024, 1, 1, 0, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-10T00:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2024-01-01T00:00:00.000Z',
      '2024-01-02T00:00:00.000Z',
      '2024-01-03T00:00:00.000Z',
      '2024-01-04T00:00:00.000Z',
      '2024-01-05T00:00:00.000Z',
    ],
  );

  assert.deepEqual(
    rule
      .between(new Date('2024-01-06T00:00:00.000Z'), new Date('2024-01-10T00:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [],
  );
});

test('rule/time: daily byyearday works', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 3,
    byyearday: [100, 200],
    dtstart: datetime(1997, 1, 1, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-04-10T09:00:00.000Z',
    '1997-07-19T09:00:00.000Z',
    '1998-04-10T09:00:00.000Z',
  ]);
});

test('rule/time: daily byweekno 53 only selects years that actually contain ISO week 53', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
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

test('rule/time: monthly bysetpos on monthday candidates keeps chronological expanded positions', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 3,
    bymonthday: [13, 17],
    byhour: [6, 18],
    bysetpos: [3, -3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-13T18:00:00.000Z',
    '1997-09-17T06:00:00.000Z',
    '1997-10-13T18:00:00.000Z',
  ]);
});

test('rule/time: monthly byhour byminute bysecond expands in chronological order', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 4,
    byhour: [6, 18],
    byminute: [6, 18],
    bysecond: [6, 18],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T18:06:06.000Z',
    '1997-09-02T18:06:18.000Z',
    '1997-09-02T18:18:06.000Z',
    '1997-09-02T18:18:18.000Z',
  ]);
});

test('rule/time: yearly bysetpos on monthday candidates keeps chronological expanded positions', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 3,
    bymonthday: [15],
    byhour: [6, 18],
    bysetpos: [3, -3],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-11-15T18:00:00.000Z',
    '1998-02-15T06:00:00.000Z',
    '1998-11-15T18:00:00.000Z',
  ]);
});

test('rule/time: yearly byhour byminute bysecond expands in chronological order', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    count: 4,
    byhour: [6, 18],
    byminute: [6, 18],
    bysecond: [6, 18],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-09-02T18:06:06.000Z',
    '1997-09-02T18:06:18.000Z',
    '1997-09-02T18:18:06.000Z',
    '1997-09-02T18:18:18.000Z',
  ]);
});

test('rule/time: hourly byweekno and byweekday works', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    count: 3,
    byweekno: 1,
    byweekday: [RRule.MO],
    dtstart: datetime(1997, 9, 2, 9, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '1997-12-29T00:00:00.000Z',
    '1997-12-29T01:00:00.000Z',
    '1997-12-29T02:00:00.000Z',
  ]);
});

test('rule/time: before and after remain correct across spring-forward boundary', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
  });

  assert.equal(
    rule.before(new Date('2026-03-29T07:00:00.000Z'), true)?.toISOString(),
    '2026-03-29T07:00:00.000Z',
  );
  assert.equal(
    rule.after(new Date('2026-03-29T07:00:00.000Z'), false)?.toISOString(),
    '2026-03-30T07:00:00.000Z',
  );
});

test('rule/time: between stays correct across fall-back boundary in Europe/Paris', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 10, 24, 7, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-10-24T06:30:00.000Z'), new Date('2026-10-26T08:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-10-24T07:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
      '2026-10-26T08:00:00.000Z',
    ],
  );
});

test('rule/time: hourly bounded queries remain correct across spring-forward boundary', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    count: 6,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 29, 0, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-03-29T00:30:00.000Z'), new Date('2026-03-29T05:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-03-29T01:00:00.000Z',
      '2026-03-29T02:00:00.000Z',
      '2026-03-29T03:00:00.000Z',
      '2026-03-29T04:00:00.000Z',
      '2026-03-29T05:00:00.000Z',
    ],
  );
});

test('rule/time: minutely bounded queries with expanded seconds stay correct in named timezone', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 8,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 29, 0, 0, 0),
    bysecond: [0, 30],
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-03-29T00:00:15.000Z'), new Date('2026-03-29T00:02:30.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-03-29T00:00:30.000Z',
      '2026-03-29T00:01:00.000Z',
      '2026-03-29T00:01:30.000Z',
      '2026-03-29T00:02:00.000Z',
      '2026-03-29T00:02:30.000Z',
    ],
  );
});

test('rule/time: minutely before and after stay correct with dense expanded seconds', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    count: 8,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 29, 0, 0, 0),
    bysecond: [0, 30],
  });

  assert.equal(
    rule.after(new Date('2026-03-29T00:01:15.000Z'))?.toISOString(),
    '2026-03-29T00:01:30.000Z',
  );
  assert.equal(
    rule.before(new Date('2026-03-29T00:01:15.000Z'))?.toISOString(),
    '2026-03-29T00:01:00.000Z',
  );
});

test('rule/time: secondly between stays correct with minute and second filters', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 8,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byminute: [0, 1],
    bysecond: [10, 20],
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-04-11T09:00:15.000Z'), new Date('2026-04-11T09:01:10.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:20.000Z',
      '2026-04-11T09:01:10.000Z',
    ],
  );
});

test('rule/time: secondly before and after stay correct with exact-boundary inclusivity', () => {
  const rule = new RRule({
    freq: Frequency.SECONDLY,
    count: 8,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byminute: [0, 1],
    bysecond: [10, 20],
  });

  assert.equal(
    rule.after(new Date('2026-04-11T09:01:10.000Z'), true)?.toISOString(),
    '2026-04-11T09:01:10.000Z',
  );
  assert.equal(
    rule.before(new Date('2026-04-11T09:01:10.000Z'), false)?.toISOString(),
    '2026-04-11T09:00:20.000Z',
  );
});

test('rule/time: daily bysetpos with expanded times keeps bounded queries correct', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
    bysetpos: -1,
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-04-11T18:00:00.000Z'), new Date('2026-04-13T17:30:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-04-12T17:30:00.000Z',
      '2026-04-13T17:30:00.000Z',
    ],
  );
  assert.equal(
    rule.after(new Date('2026-04-12T12:00:00.000Z'))?.toISOString(),
    '2026-04-12T17:30:00.000Z',
  );
});

test('rule/time: bysetpos with expanded times remains correct in named timezone across DST', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    count: 4,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 3, 28, 8, 0, 0),
    byhour: [9, 17],
    byminute: [0, 30],
    bysecond: [0],
    bysetpos: -1,
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-03-28T16:00:00.000Z'), new Date('2026-03-30T15:30:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-03-28T16:30:00.000Z',
      '2026-03-29T15:30:00.000Z',
      '2026-03-30T15:30:00.000Z',
    ],
  );
});

test('rule/time: hourly rule across fall-back keeps both ambiguous 02:00 instants', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    count: 5,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 10, 24, 23, 0, 0),
  });

  assert.deepEqual(rule.all().map((value) => value.toISOString()), [
    '2026-10-24T23:00:00.000Z',
    '2026-10-25T00:00:00.000Z',
    '2026-10-25T01:00:00.000Z',
    '2026-10-25T02:00:00.000Z',
    '2026-10-25T03:00:00.000Z',
  ]);
});

test('rule/time: bounded hourly queries across fall-back distinguish the two ambiguous hours', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    count: 5,
    tzid: 'Europe/Paris',
    dtstart: datetime(2026, 10, 24, 23, 0, 0),
  });

  assert.deepEqual(
    rule
      .between(new Date('2026-10-24T23:30:00.000Z'), new Date('2026-10-25T02:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T01:00:00.000Z',
      '2026-10-25T02:00:00.000Z',
    ],
  );
  assert.equal(
    rule.after(new Date('2026-10-25T00:00:00.000Z'), false)?.toISOString(),
    '2026-10-25T01:00:00.000Z',
  );
  assert.equal(
    rule.before(new Date('2026-10-25T01:00:00.000Z'), false)?.toISOString(),
    '2026-10-25T00:00:00.000Z',
  );
});

test('rule/rscale/time: after and before work on hebrew yearly simple rules', { skip: !supportsCalendar('hebrew') }, () => {
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
  const all = rule.all().map((value) => value.toISOString());

  assert.equal(rule.after(new Date('2025-01-01T00:00:00.000Z'))?.toISOString(), all[1]);
  assert.equal(rule.before(new Date('2026-12-31T23:59:59.000Z'))?.toISOString(), all[2]);
});

test('rule/rscale/time: between works on hebrew monthly simple rules', { skip: !supportsCalendar('hebrew') }, () => {
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

  assert.deepEqual(
    rule
      .between(new Date('2024-10-15T00:00:00.000Z'), new Date('2025-02-15T00:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2024-11-02T00:00:00.000Z',
      '2024-12-02T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      '2025-01-30T00:00:00.000Z',
    ],
  );
});

test('rule/rscale/time: hourly byyearday respects hebrew day-of-year and preserves time', { skip: !supportsCalendar('hebrew') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T09:00:00+00:00[UTC]');

  for (let i = 0; i < 1000; i += 1) {
    const hebrew = cursor.withCalendar('hebrew');
    if (hebrew.dayOfYear === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=HOURLY;INTERVAL=24;BYYEARDAY=1;COUNT=2`);
  const out = rule.all();

  assert.equal(out.length, 2);
  for (const occ of out) {
    const zdt = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]'));
    const hebrew = zdt.withCalendar('hebrew');
    assert.equal(hebrew.dayOfYear, 1);
    assert.equal(zdt.hour, found.hour);
    assert.equal(zdt.minute, found.minute);
  }
});

test('rule/rscale/time: hourly byyearday respects indian day-of-year and preserves time', { skip: !supportsCalendar('indian') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T09:00:00+00:00[UTC]');

  for (let i = 0; i < 1000; i += 1) {
    const indian = cursor.withCalendar('indian');
    if (indian.dayOfYear === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=HOURLY;INTERVAL=24;BYYEARDAY=1;COUNT=2`);
  const out = rule.all();

  assert.equal(out.length, 2);
  for (const occ of out) {
    const zdt = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]'));
    const indian = zdt.withCalendar('indian');
    assert.equal(indian.dayOfYear, 1);
    assert.equal(zdt.hour, found.hour);
    assert.equal(zdt.minute, found.minute);
  }
});

test('rule/rscale/time: hourly byyearday respects chinese day-of-year and preserves time', { skip: !supportsCalendar('chinese') }, () => {
  let found = null;
  let cursor = Temporal.ZonedDateTime.from('2024-01-01T09:00:00+00:00[UTC]');

  for (let i = 0; i < 1000; i += 1) {
    const chinese = cursor.withCalendar('chinese');
    if (chinese.dayOfYear === 1) {
      found = cursor;
      break;
    }
    cursor = cursor.add({ days: 1 });
  }

  assert.ok(found);

  const dtline = found.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15);
  const rule = RRule.fromString(`DTSTART;TZID=UTC:${dtline}\nRRULE:RSCALE=CHINESE;FREQ=HOURLY;INTERVAL=24;BYYEARDAY=1;COUNT=2`);
  const out = rule.all();

  assert.equal(out.length, 2);
  for (const occ of out) {
    const zdt = Temporal.ZonedDateTime.from(occ.toISOString().replace('Z', '+00:00[UTC]'));
    const chinese = zdt.withCalendar('chinese');
    assert.equal(chinese.dayOfYear, 1);
    assert.equal(zdt.hour, found.hour);
    assert.equal(zdt.minute, found.minute);
  }
});

test('rule/time: RFC daily until in New York stays stable across DST and until boundary', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;UNTIL=19971224T000000Z',
  );

  const all = rule.all();
  assert.equal(all[0]?.toUTCString(), 'Tue, 02 Sep 1997 13:00:00 GMT');
  assert.equal(all[54]?.toUTCString(), 'Sun, 26 Oct 1997 14:00:00 GMT');
  assert.equal(all.at(-1)?.toUTCString(), 'Tue, 23 Dec 1997 14:00:00 GMT');
  assert.equal(all.length, 113);
});

test('rule/time: RFC every other day in New York matches the canonical bounded window', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=DAILY;INTERVAL=2',
  );

  const results = rule.between(
    new Date('1997-09-02T13:00:00.000Z'),
    new Date('1997-12-04T05:00:00.000Z'),
    true,
  );

  assert.deepEqual(
    results.slice(0, 5),
    [
      new Date('1997-09-02T13:00:00.000Z'),
      new Date('1997-09-04T13:00:00.000Z'),
      new Date('1997-09-06T13:00:00.000Z'),
      new Date('1997-09-08T13:00:00.000Z'),
      new Date('1997-09-10T13:00:00.000Z'),
    ],
  );
  assert.deepEqual(
    results.slice(-3),
    [
      new Date('1997-11-29T14:00:00.000Z'),
      new Date('1997-12-01T14:00:00.000Z'),
      new Date('1997-12-03T14:00:00.000Z'),
    ],
  );
  assert.equal(results.length, 47);
});

test('rule/time: RFC January daily and yearly forms stay equivalent across years', () => {
  const daily = RRule.fromString(
    'DTSTART;TZID=America/New_York:19980101T090000\nRRULE:FREQ=DAILY;UNTIL=20000131T140000Z;BYMONTH=1',
  );
  const yearly = RRule.fromString(
    'DTSTART;TZID=America/New_York:19980101T090000\nRRULE:FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA',
  );

  const dailyAll = daily.all();
  const yearlyAll = yearly.all();

  assert.equal(dailyAll.length, 93);
  assert.deepEqual(yearlyAll, dailyAll);
  assert.equal(dailyAll[0]?.toUTCString(), 'Thu, 01 Jan 1998 14:00:00 GMT');
  assert.equal(dailyAll.at(-1)?.toUTCString(), 'Mon, 31 Jan 2000 14:00:00 GMT');
});
