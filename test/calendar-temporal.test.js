import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { ElapsedSource, RuleSource } from '../dist/engine.mjs';

const instant = value => Temporal.Instant.from(value);
const utc = values => values.map(value => value.toInstant().toString());
const cases = [
  { name: 'autumn hourly', freq: 'HOURLY', start: '2026-10-25T01:30:00+02:00[Europe/Paris]',
    expected: ['2026-10-24T23:30:00Z', '2026-10-25T00:30:00Z', '2026-10-25T02:30:00Z', '2026-10-25T03:30:00Z'] },
  { name: 'autumn two-hour phase', freq: 'HOURLY', interval: 2, start: '2026-10-25T00:30:00+02:00[Europe/Paris]',
    expected: ['2026-10-24T22:30:00Z', '2026-10-25T00:30:00Z', '2026-10-25T03:30:00Z', '2026-10-25T05:30:00Z'] },
  { name: 'autumn 40-minute phase', freq: 'MINUTELY', interval: 40, start: '2026-10-25T00:30:00+02:00[Europe/Paris]',
    expected: ['2026-10-24T22:30:00Z', '2026-10-24T23:10:00Z', '2026-10-24T23:50:00Z', '2026-10-25T00:30:00Z', '2026-10-25T02:10:00Z'] },
  { name: 'autumn secondly', freq: 'SECONDLY', start: '2026-10-25T02:59:58+02:00[Europe/Paris]',
    expected: ['2026-10-25T00:59:58Z', '2026-10-25T00:59:59Z', '2026-10-25T02:00:00Z', '2026-10-25T02:00:01Z'] },
  { name: 'spring daily nominal time', freq: 'DAILY', start: '2026-03-28T02:30:00+01:00[Europe/Paris]',
    expected: ['2026-03-28T01:30:00Z', '2026-03-29T01:30:00Z', '2026-03-30T00:30:00Z', '2026-03-31T00:30:00Z'] },
  { name: 'spring weekly nominal time', freq: 'WEEKLY', start: '2026-03-22T02:30:00+01:00[Europe/Paris]',
    expected: ['2026-03-22T01:30:00Z', '2026-03-29T01:30:00Z', '2026-04-05T00:30:00Z'] },
  { name: 'spring monthly nominal time', freq: 'MONTHLY', start: '2026-01-29T02:30:00+01:00[Europe/Paris]',
    expected: ['2026-01-29T01:30:00Z', '2026-03-29T01:30:00Z', '2026-04-29T00:30:00Z'] },
  { name: 'spring yearly nominal time', freq: 'YEARLY', start: '2025-03-29T02:30:00+01:00[Europe/Paris]',
    expected: ['2025-03-29T01:30:00Z', '2026-03-29T01:30:00Z', '2027-03-29T00:30:00Z'] },
  { name: 'spring hourly collision', freq: 'HOURLY', start: '2026-03-29T01:30:00+01:00[Europe/Paris]',
    expected: ['2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', '2026-03-29T02:30:00Z', '2026-03-29T03:30:00Z'] },
  { name: 'spring half-hour collision', freq: 'MINUTELY', interval: 30, start: '2026-03-29T01:30:00+01:00[Europe/Paris]',
    expected: ['2026-03-29T00:30:00Z', '2026-03-29T01:00:00Z', '2026-03-29T01:30:00Z', '2026-03-29T02:00:00Z'] },
  { name: 'spring 40-minute ordering', freq: 'MINUTELY', interval: 40, start: '2026-03-29T01:30:00+01:00[Europe/Paris]',
    expected: ['2026-03-29T00:30:00Z', '2026-03-29T01:10:00Z', '2026-03-29T01:30:00Z', '2026-03-29T01:50:00Z', '2026-03-29T02:10:00Z'] },
  { name: 'spring secondly collision', freq: 'SECONDLY', start: '2026-03-29T01:59:58+01:00[Europe/Paris]',
    expected: ['2026-03-29T00:59:58Z', '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-03-29T01:00:01Z'] },
  { name: 'spring hourly nominal BYSETPOS', freq: 'HOURLY', options: { byminute: [10, 50], bysetpos: [-1] },
    start: '2026-03-29T01:50:00+01:00[Europe/Paris]',
    expected: ['2026-03-29T00:50:00Z', '2026-03-29T01:50:00Z', '2026-03-29T02:50:00Z'] },
  { name: 'Lord Howe spring half-hour gap', freq: 'DAILY', start: '2026-10-03T02:15:00+10:30[Australia/Lord_Howe]', zone: 'Australia/Lord_Howe',
    expected: ['2026-10-02T15:45:00Z', '2026-10-03T15:45:00Z', '2026-10-04T15:15:00Z'] },
];

for (const sample of cases) {
  for (const limit of ['COUNT', 'UNTIL', 'unbounded']) {
    test(`calendar contract: ${sample.name} with ${limit}`, () => {
      const endpoints = sample.expected.map(instant);
      const source = new RuleSource({
        freq: sample.freq, interval: sample.interval ?? 1, wkst: 0,
        dtstart: Temporal.ZonedDateTime.from(sample.start), tzid: sample.zone ?? 'Europe/Paris',
        ...sample.options,
        ...(limit === 'COUNT' ? { count: endpoints.length } : {}),
        ...(limit === 'UNTIL' ? { until: endpoints.at(-1).toZonedDateTimeISO(sample.zone ?? 'Europe/Paris') } : {}),
      });
      assert.deepEqual(utc(source.all().slice(0, endpoints.length)), sample.expected);
      assert.deepEqual(utc(source.between(endpoints[0], endpoints.at(-1), true)), sample.expected);
      for (let index = 0; index < endpoints.length; index++) {
        assert.equal(source.occursAt(endpoints[index]), true);
        assert.equal(source.after(endpoints[index], true)?.toInstant().toString(), sample.expected[index]);
        assert.equal(source.before(endpoints[index], true)?.toInstant().toString(), sample.expected[index]);
        if (index + 1 < endpoints.length) {
          assert.equal(source.after(endpoints[index], false)?.toInstant().toString(), sample.expected[index + 1]);
          assert.equal(source.before(endpoints[index + 1], false)?.toInstant().toString(), sample.expected[index]);
        }
      }
    });
  }
}

test('calendar contract: minutely hour filters agree between after and between in the overlap', () => {
  const source = new RuleSource({ freq: 'MINUTELY', interval: 30, wkst: 0,
    dtstart: Temporal.ZonedDateTime.from('2026-10-25T01:30:00+02:00[Europe/Paris]'), tzid: 'Europe/Paris', byhour: [2],
    until: Temporal.ZonedDateTime.from('2026-10-26T03:00:00+01:00[Europe/Paris]') });
  const lower = instant('2026-10-25T00:45:00Z');
  assert.deepEqual(source.between(lower, instant('2026-10-25T02:00:00Z'), true), []);
  assert.equal(source.after(lower, false)?.toInstant().toString(), '2026-10-26T01:00:00Z');
  assert.equal(source.occursAt(instant('2026-10-25T01:30:00Z')), false);
});

test('calendar contract: second-passage membership is rejected even without COUNT', () => {
  const source = new RuleSource({ freq: 'MINUTELY', interval: 30, wkst: 0,
    dtstart: Temporal.ZonedDateTime.from('2026-10-25T01:30:00+02:00[Europe/Paris]'), tzid: 'Europe/Paris' });
  assert.equal(source.occursAt(instant('2026-10-25T01:30:00Z')), false);
  assert.equal(source.before(instant('2026-10-25T01:30:00Z'), true)?.toInstant().toString(), '2026-10-25T00:30:00Z');
});

test('elapsed contract: spring crossing and distant queries preserve the instant grid', () => {
  const source = new ElapsedSource({ start: instant('2000-01-01T00:00:00Z'), every: 'PT1S', tzid: 'Europe/Paris' });
  const lower = instant('2026-03-29T00:59:59Z');
  assert.deepEqual(utc(source.between(lower, instant('2026-03-29T01:00:01Z'), true)),
    ['2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-03-29T01:00:01Z']);
  assert.equal(source.occursAt(instant('2026-03-29T01:00:00.5Z')), false);
});

test('calendar contract: distant secondly search does not enumerate from DTSTART', () => {
  const source = new RuleSource({ freq: 'SECONDLY', interval: 40, wkst: 0,
    dtstart: Temporal.ZonedDateTime.from('2000-01-01T00:00:00+01:00[Europe/Paris]'), tzid: 'Europe/Paris' });
  assert.equal(source.after(instant('2026-10-25T01:59:59Z'), false)?.toInstant().toString(), '2026-10-25T02:00:00Z');
  assert.equal(source.before(instant('2026-10-25T02:00:00Z'), false)?.toInstant().toString(), '2026-10-25T00:59:20Z');
});

test('dense finite sources do not stop at the empty-search iteration budget', () => {
  const source = new RuleSource({ freq: 'SECONDLY', interval: 1, wkst: 0, count: 10005,
    dtstart: Temporal.ZonedDateTime.from('2026-01-01T00:00:00Z[UTC]'), tzid: 'UTC' });
  const values = source.all();
  assert.equal(values.length, 10005);
  assert.equal(values.at(-1).toInstant().toString(), '2026-01-01T02:46:44Z');
});

test('before a distant boundary respects UNTIL without scanning past it', () => {
  const source = new RuleSource({ freq: 'SECONDLY', interval: 1, wkst: 0,
    dtstart: Temporal.ZonedDateTime.from('2026-01-01T00:00:00Z[UTC]'), tzid: 'UTC',
    until: Temporal.ZonedDateTime.from('2026-01-01T00:00:03Z[UTC]') });
  assert.equal(source.before(instant('2099-01-01T00:00:00Z'), false).toInstant().toString(), '2026-01-01T00:00:03Z');
});

test('RSCALE keeps its date policies while using the local subdaily clock', () => {
  const source = new RuleSource({ freq: 'HOURLY', interval: 1, wkst: 0, count: 4, rscale: 'GREGORIAN',
    dtstart: Temporal.ZonedDateTime.from('2026-10-25T01:30:00+02:00[Europe/Paris]'), tzid: 'Europe/Paris' });
  assert.deepEqual(utc(source.all()), cases[0].expected);
});

test('RSCALE monthly and yearly select the first autumn passage and retain spring nominal time', () => {
  for (const freq of ['MONTHLY', 'YEARLY']) {
    const autumn = new RuleSource({ freq, interval: 1, wkst: 0, count: 1, rscale: 'GREGORIAN',
      dtstart: Temporal.ZonedDateTime.from('2026-10-25T01:30:00Z[Europe/Paris]'), tzid: 'Europe/Paris' });
    // An exact second-passage start filters out the earlier resolved candidate.
    assert.equal(autumn.all()[0].toInstant().toString(), freq === 'MONTHLY' ? '2026-11-25T01:30:00Z' : '2027-10-25T00:30:00Z');
    const spring = new RuleSource({ freq, interval: 1, wkst: 0, count: 3, rscale: 'GREGORIAN',
      dtstart: Temporal.ZonedDateTime.from(freq === 'MONTHLY'
        ? '2026-01-29T02:30:00+01:00[Europe/Paris]'
        : '2025-03-29T02:30:00+01:00[Europe/Paris]'), tzid: 'Europe/Paris' });
    assert.equal(spring.all()[1].toInstant().toString(), '2026-03-29T01:30:00Z');
    assert.equal(spring.all().at(-1).toInstant().toString(), freq === 'MONTHLY' ? '2026-04-29T00:30:00Z' : '2027-03-29T00:30:00Z');
  }
});
