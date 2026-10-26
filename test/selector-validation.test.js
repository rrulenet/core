import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOptions, parseRuleString, buildRuleSpec } from '../dist/rule.mjs';
import { Frequency, RRule, datetime } from './support/compat.js';

const selectors = [
  { key: 'byhour', valid: [0, 23], invalid: [-1, 24, 25, 1.5, NaN, Infinity] },
  { key: 'byminute', valid: [0, 59], invalid: [-1, 60, 1.5, NaN, Infinity] },
  { key: 'bysecond', valid: [0, 59, 60], invalid: [-1, 61, 1.5, NaN, Infinity] },
  { key: 'bymonth', valid: [1, 12], invalid: [0, 13, 1.5, NaN, Infinity] },
  { key: 'bymonthday', valid: [-31, -1, 1, 31], invalid: [0, -32, 32, 1.5, NaN, Infinity] },
];

for (const { key, valid, invalid } of selectors) {
  test(`selector validation: ${key} rejects invalid scalars and mixed lists`, () => {
    for (const value of invalid) {
      for (const input of [value, [valid[0], value]]) {
        assert.throws(() => normalizeOptions({ [key]: input }), error =>
          error instanceof RangeError && error.message.includes(key.toUpperCase()) && error.message.includes(String(value)));
        assert.throws(() => parseRuleString(`FREQ=DAILY;${key.toUpperCase()}=${[input].flat().join(',')}`), RangeError);
      }
    }
  });

  test(`selector validation: ${key} preserves valid bounds, absent options and caller arrays`, () => {
    const values = Object.freeze([...valid]);
    assert.deepEqual(normalizeOptions({ [key]: values })[key], valid);
    assert.deepEqual(parseRuleString(`FREQ=DAILY;${key.toUpperCase()}=${valid.join(',')}`)[key], valid);
    assert.deepEqual(values, valid);
    assert.equal(normalizeOptions({})[key], null);
    assert.equal(normalizeOptions({ [key]: null })[key], null);
  });
}

test('selector validation: parse-only helpers do not inject rule defaults', () => {
  assert.deepEqual(parseRuleString('BYHOUR=9'), { byhour: [9] });
});

test('selector validation: valid month-day selectors still omit nonexistent dates', () => {
  const rule = new RRule({ freq: Frequency.MONTHLY, dtstart: datetime(2026, 1, 31), bymonthday: 31, count: 3 });
  assert.deepEqual(rule.all().map(date => date.toISOString()), [
    '2026-01-31T00:00:00.000Z', '2026-03-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z',
  ]);
  const last = new RRule({ freq: Frequency.MONTHLY, dtstart: datetime(2026, 1, 31), bymonthday: -1, count: 3 });
  assert.deepEqual(last.all().map(date => date.toISOString()), [
    '2026-01-31T00:00:00.000Z', '2026-02-28T00:00:00.000Z', '2026-03-31T00:00:00.000Z',
  ]);
});

test('selector validation: negative month-day aliases cannot bypass validation', () => {
  for (const value of [0, 32, -32]) assert.throws(() => normalizeOptions({ bynmonthday: [value] }), RangeError);
  assert.deepEqual(buildRuleSpec(normalizeOptions({ dtstart: datetime(2026, 1, 1), bynmonthday: [1, -31] })).bymonthday, [-1, -31]);
});

test('selector validation: supported leap-month tokens survive either RFC property order', () => {
  for (const input of ['RSCALE=HEBREW;BYMONTH=5L', 'BYMONTH=5L;RSCALE=HEBREW']) {
    const options = normalizeOptions(parseRuleString(`FREQ=YEARLY;${input}`));
    assert.deepEqual(buildRuleSpec(options).bymonth, ['5L']);
  }
  for (const token of ['0L', '13L', 'invalid']) {
    assert.throws(() => normalizeOptions({ rscale: 'HEBREW', bymonth: token }), RangeError);
  }
  assert.throws(() => normalizeOptions({ bymonth: '5L' }), RangeError);
});

test('selector validation: second 60 resolves to 59 without mutating or shortening COUNT', () => {
  const seconds = Object.freeze([59, 60]);
  const rule = new RRule({ freq: Frequency.MINUTELY, dtstart: datetime(2026, 1, 1, 0, 0, 59), count: 3, bysecond: seconds });
  assert.deepEqual(rule.all().map(date => date.toISOString()), [
    '2026-01-01T00:00:59.000Z', '2026-01-01T00:01:59.000Z', '2026-01-01T00:02:59.000Z',
  ]);
  assert.deepEqual(seconds, [59, 60]);
  assert.deepEqual(rule.origOptions.bysecond, [59, 60]);
  assert.match(rule.toString(), /BYSECOND=59,60/);
  const onlyLeap = new RRule({ freq: Frequency.MINUTELY, dtstart: datetime(2026, 1, 1, 0, 0, 59), count: 2, bysecond: 60 });
  assert.deepEqual(onlyLeap.all().map(date => date.toISOString()), [
    '2026-01-01T00:00:59.000Z', '2026-01-01T00:01:59.000Z',
  ]);
});

test('selector validation: second-60 collisions are removed before BYSETPOS', () => {
  const rule = RRule.fromString('DTSTART:20260101T000058Z\nRRULE:FREQ=MINUTELY;BYSECOND=58,59,60;BYSETPOS=-2;COUNT=2');
  assert.deepEqual(rule.all().map(date => date.toISOString()), [
    '2026-01-01T00:00:58.000Z', '2026-01-01T00:01:58.000Z',
  ]);
});
