import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { RRule, rrulestr } from './support/compat.js';
import { parseRuleString } from '../dist/rule.mjs';

const iso = rule => rule.all().map(value => value.toISOString());

test('yearly positions select across months and retain DTSTART date defaults', () => {
  for (const [position, start, month] of [[1, '20260101', '01'], [-1, '20260201', '02']]) {
    const rule = rrulestr(`DTSTART:${start}T090000Z\nRRULE:FREQ=YEARLY;BYMONTH=2,1;BYMONTHDAY=1;BYSETPOS=${position};COUNT=3`);
    assert.deepEqual(iso(rule), [2026, 2027, 2028].map(year => `${year}-${month}-01T09:00:00.000Z`));
  }
  assert.deepEqual(iso(rrulestr('DTSTART:20260105T090000Z\nRRULE:FREQ=YEARLY;BYHOUR=9,10;BYSETPOS=2;COUNT=2')), [
    '2026-01-05T10:00:00.000Z', '2027-01-05T10:00:00.000Z',
  ]);
});

test('positional selection deduplicates days and coinciding positive/negative week numbers', () => {
  for (const selectors of ['BYDAY=MO,TU', 'BYDAY=MO,MO,TU']) {
    assert.deepEqual(iso(rrulestr(`DTSTART:20260105T090000Z\nRRULE:FREQ=WEEKLY;${selectors};BYSETPOS=2;COUNT=2`)), [
      '2026-01-06T09:00:00.000Z', '2026-01-13T09:00:00.000Z',
    ]);
  }
  for (const weeks of ['2,3', '2,2,3', '2,-52,3']) {
    const rule = rrulestr(`DTSTART:20260101T090000Z\nRRULE:FREQ=YEARLY;BYWEEKNO=${weeks};BYDAY=MO;BYSETPOS=2;UNTIL=20261231T235959Z`);
    assert.deepEqual(iso(rule), ['2026-01-12T09:00:00.000Z']);
  }
});

test('numeric RFC tokens are checked before coercion, including scalar and list fields', () => {
  const fields = ['BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYMONTH', 'BYMONTHDAY', 'BYWEEKNO', 'BYYEARDAY', 'BYSETPOS', 'BYEASTER', 'INTERVAL', 'COUNT'];
  for (const field of fields) {
    for (const token of ['', ' ', '0xA', '1e1', '1.0', 'NaN', 'Infinity', '9007199254740993']) {
      assert.throws(() => parseRuleString(`FREQ=DAILY;${field}=${token}`), error => error instanceof RangeError && error.message.includes(field));
    }
  }
  for (const token of ['9,,10', ',9', '9,', '9, ,10']) {
    assert.throws(() => parseRuleString(`FREQ=DAILY;BYHOUR=${token}`), RangeError);
  }
  assert.deepEqual(parseRuleString('FREQ=DAILY;BYHOUR=09, 10;BYMONTHDAY=-1,+1').byhour, [9, 10]);
  assert.deepEqual(parseRuleString('FREQ=YEARLY;BYMONTH=5L;RSCALE=HEBREW').bymonth, ['5L']);
});

test('impossible subdaily clock phases terminate without moving the anchor', () => {
  for (const [freq, interval, selectors, start] of [
    [RRule.MINUTELY, 10, { byminute: [0, 10, 20, 30, 40, 50], byhour: [9, 10], byweekday: [RRule.WE] }, '2026-07-08T08:27:55Z'],
    [RRule.HOURLY, 4, { byhour: [6, 10, 14, 18, 22] }, '2026-07-01T08:00:00Z'],
    [RRule.SECONDLY, 10, { bysecond: [0, 10, 20] }, '2026-01-01T09:00:07Z'],
  ]) {
    for (const tzid of ['UTC', 'Europe/Paris']) {
      const dtstart = new Date(Temporal.PlainDateTime.from(start.replace(/Z$/, '')).toZonedDateTime(tzid).epochMilliseconds);
      const rule = new RRule({ freq, interval, ...selectors, tzid, dtstart });
      assert.deepEqual(rule.all(), []);
      assert.equal(rule.after(new Date(start), true), null);
      assert.equal(rule.before(new Date('2028-01-01T00:00:00Z'), true), null);
      assert.deepEqual(rule.between(new Date(start), new Date('2028-01-01T00:00:00Z'), true), []);
      assert.deepEqual(new RRule({ ...rule.origOptions, count: 2 }).all(), []);
    }
  }
  const reachable = new RRule({ freq: RRule.MINUTELY, interval: 7, byminute: [0], count: 3,
    dtstart: new Date('2026-10-01T08:00:56Z') });
  assert.deepEqual(iso(reachable), [
    '2026-10-01T08:00:56.000Z', '2026-10-01T15:00:56.000Z', '2026-10-01T22:00:56.000Z',
  ]);
});
