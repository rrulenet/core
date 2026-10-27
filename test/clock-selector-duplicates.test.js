import test from 'node:test';
import assert from 'node:assert/strict';

import { Frequency, RRule, datetime } from './support/compat.js';

const iso = rule => rule.all().map(date => date.toISOString());
const selectors = [
  { key: 'byhour', values: [10, 9, 9], second: '10:00:00', penultimate: '09:00:00' },
  { key: 'byminute', values: [30, 0, 0], second: '09:30:00', penultimate: '09:00:00' },
  { key: 'bysecond', values: [30, 0, 0], second: '09:00:30', penultimate: '09:00:00' },
];

for (const { key, values, second, penultimate } of selectors) {
  for (const [position, time] of [[2, second], [-2, penultimate]]) {
    test(`duplicate ${key}: position ${position} selects distinct candidates before COUNT and UNTIL`, () => {
      const input = Object.freeze([...values]);
      const options = { freq: Frequency.DAILY, dtstart: datetime(2026, 1, 1, 9), [key]: input, bysetpos: position };
      const expected = [1, 2, 3].map(day => `2026-01-0${day}T${time}.000Z`);
      for (const noCache of [false, true]) {
        const rule = new RRule({ ...options, count: 3 }, noCache);
        assert.deepEqual(iso(rule), expected);
        assert.deepEqual(iso(rule), expected);
        assert.equal(rule.after(new Date(expected[0]), false)?.toISOString(), expected[1]);
        assert.equal(rule.before(new Date(expected[1]), false)?.toISOString(), expected[0]);
        assert.deepEqual(rule.origOptions[key], values);
        assert(rule.toString().includes(`${key.toUpperCase()}=${values.join(',')}`));
      }
      const until = new RRule({ ...options, until: new Date(expected[1]) });
      assert.deepEqual(iso(until), expected.slice(0, 2));
      assert.deepEqual(input, values);
    });
  }
}

test('duplicate clock selectors: positions operate on the distinct Cartesian expansion', () => {
  const rule = new RRule({ freq: Frequency.DAILY, dtstart: datetime(2026, 1, 1, 9), count: 4,
    byhour: [10, 9, 9], byminute: [30, 0, 0], bysecond: [0, 0], bysetpos: [3, -3] });
  assert.deepEqual(iso(rule), [
    '2026-01-01T09:30:00.000Z', '2026-01-01T10:00:00.000Z',
    '2026-01-02T09:30:00.000Z', '2026-01-02T10:00:00.000Z',
  ]);
});

test('duplicate clock selectors: out-of-range positions cannot select repeated candidates', () => {
  for (const bysetpos of [3, -3]) {
    const rule = new RRule({ freq: Frequency.DAILY, dtstart: datetime(2026, 1, 1, 9),
      until: datetime(2026, 1, 3, 23), byhour: [9, 9, 10], bysetpos });
    assert.deepEqual(iso(rule), []);
  }
});

for (const [freq, extra, expected] of [
  [Frequency.WEEKLY, { byhour: [9, 9, 10] }, ['2026-01-01T10:00:00.000Z', '2026-01-08T10:00:00.000Z']],
  [Frequency.MONTHLY, { bymonthday: [1], byhour: [9, 9, 10] }, ['2026-01-01T10:00:00.000Z', '2026-02-01T10:00:00.000Z']],
  [Frequency.YEARLY, { bymonth: [1], bymonthday: [1], byhour: [9, 9, 10] }, ['2026-01-01T10:00:00.000Z', '2027-01-01T10:00:00.000Z']],
  [Frequency.HOURLY, { byminute: [0, 0, 30] }, ['2026-01-01T09:30:00.000Z', '2026-01-01T10:30:00.000Z']],
  [Frequency.MINUTELY, { bysecond: [0, 0, 30] }, ['2026-01-01T09:00:30.000Z', '2026-01-01T09:01:30.000Z']],
]) {
  test(`duplicate clock selectors: frequency ${freq} selects the second distinct candidate`, () => {
    assert.deepEqual(iso(new RRule({ freq, ...extra, dtstart: datetime(2026, 1, 1, 9), count: 2, bysetpos: 2 })), expected);
  });
}
