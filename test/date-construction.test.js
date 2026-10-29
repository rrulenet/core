import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuleString } from '../dist/rule.mjs';
import { RRule } from './support/compat.js';

test('UTC RFC parsing preserves leap days in the actual proleptic Gregorian year', () => {
  for (const year of [0, 4, 96, 400, 1600, 2000, 2016, 2024, 2400]) {
    const stamp = `${String(year).padStart(4, '0')}-02-29T12:34:56.000Z`;
    assert.equal(parseRuleString(`DTSTART:${String(year).padStart(4, '0')}0229T123456Z\nRRULE:FREQ=YEARLY;COUNT=1`).dtstart.toISOString(), stamp);
  }
  for (const year of [1, 99, 100, 1900, 2100]) {
    assert.equal(parseRuleString(`DTSTART:${String(year).padStart(4, '0')}0228T000000Z`).dtstart.toISOString(), `${String(year).padStart(4, '0')}-02-28T00:00:00.000Z`);
  }
});

test('leap-day DTSTART and inclusive UNTIL remain unchanged before RSCALE expansion', () => {
  const expression = 'DTSTART:20160229T120000Z\nRRULE:RSCALE=GREGORIAN;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;SKIP=BACKWARD;COUNT=4';
  const rule = RRule.fromString(expression);
  assert.deepEqual(rule.all().map(date => date.toISOString()), [
    '2016-02-29T12:00:00.000Z', '2017-02-28T12:00:00.000Z',
    '2018-02-28T12:00:00.000Z', '2019-02-28T12:00:00.000Z',
  ]);
  const options = parseRuleString('DTSTART:20160228T120000Z\nRRULE:FREQ=DAILY;UNTIL=20160229T120000Z');
  assert.equal(options.until.toISOString(), '2016-02-29T12:00:00.000Z');
  assert.deepEqual(new RRule(options).all().map(date => date.toISOString()), ['2016-02-28T12:00:00.000Z', '2016-02-29T12:00:00.000Z']);
});
