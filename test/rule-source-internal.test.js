import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';

import { RuleSource } from '../dist/engine.mjs';

function makeSpec(overrides = {}) {
  return {
    freq: 'DAILY',
    dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00+00:00[UTC]'),
    tzid: 'UTC',
    interval: 1,
    wkst: 0,
    ...overrides,
  };
}

test('rule/source: simple yearly cadence supports bounded queries without materializing all()', () => {
  const source = new RuleSource(makeSpec({
    freq: 'YEARLY',
    interval: 2,
    dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00+00:00[UTC]'),
  }));

  assert.deepEqual(
    source
      .between(Temporal.Instant.from('2026-01-01T00:00:00Z'), Temporal.Instant.from('2031-12-31T23:59:59Z'), true)
      .map((value) => value.toString()),
    [
      '2027-01-01T09:00:00+00:00[UTC]',
      '2029-01-01T09:00:00+00:00[UTC]',
      '2031-01-01T09:00:00+00:00[UTC]',
    ],
  );
  assert.equal(source.after(Temporal.Instant.from('2027-01-01T09:00:00Z'), false)?.toString(), '2029-01-01T09:00:00+00:00[UTC]');
  assert.equal(source.before(Temporal.Instant.from('2029-01-01T09:00:00Z'), false)?.toString(), '2027-01-01T09:00:00+00:00[UTC]');
});

test('rule/source: simple monthly cadence handles inclusive boundaries and caching', () => {
  const source = new RuleSource(makeSpec({
    freq: 'MONTHLY',
    interval: 2,
    dtstart: Temporal.ZonedDateTime.from('2025-01-31T09:00:00+00:00[UTC]'),
  }));

  assert.equal(source.after(Temporal.Instant.from('2025-03-31T09:00:00Z'), true)?.toString(), '2025-03-31T09:00:00+00:00[UTC]');
  assert.equal(source.before(Temporal.Instant.from('2025-05-31T09:00:00Z'), true)?.toString(), '2025-05-31T09:00:00+00:00[UTC]');

  const first = source.all();
  const second = source.all();
  assert.equal(first, second);
  assert.deepEqual(first.slice(0, 4).map((value) => value.toString()), [
    '2025-01-31T09:00:00+00:00[UTC]',
    '2025-03-31T09:00:00+00:00[UTC]',
    '2025-05-31T09:00:00+00:00[UTC]',
    '2025-07-31T09:00:00+00:00[UTC]',
  ]);
});

test('rule/source: complex monthly after searches by period without materializing all()', () => {
  const source = new RuleSource(makeSpec({
    freq: 'MONTHLY',
    dtstart: Temporal.ZonedDateTime.from('2026-01-01T18:00:00+01:00[Europe/Paris]'),
    tzid: 'Europe/Paris',
    byweekday: [{ weekday: 1 }],
    bysetpos: [2],
    byhour: [18],
    byminute: [0],
    bysecond: [0],
  }));
  source.all = () => {
    throw new Error('all() should not be called by open-ended after()');
  };

  assert.equal(
    source.after(Temporal.Instant.from('2026-04-28T00:00:00Z'), false)?.toString(),
    '2026-05-12T18:00:00+02:00[Europe/Paris]',
  );
  assert.equal(
    source.after(Temporal.Instant.from('2026-05-12T16:00:00Z'), true)?.toString(),
    '2026-05-12T18:00:00+02:00[Europe/Paris]',
  );
});

test('rule/source: minutely window after jumps across calendar gaps', () => {
  const source = new RuleSource(makeSpec({
    freq: 'MINUTELY',
    dtstart: Temporal.ZonedDateTime.from('2026-04-28T11:00:00+02:00[Europe/Paris]'),
    tzid: 'Europe/Paris',
    byweekday: [{ weekday: 0 }, { weekday: 1 }, { weekday: 2 }, { weekday: 3 }, { weekday: 4 }],
    byhour: [11],
    byminute: Array.from({ length: 60 }, (_, index) => index),
    bysecond: [0],
  }));
  source.all = () => {
    throw new Error('all() should not be called by minutely window after()');
  };

  assert.equal(
    source.after(Temporal.Instant.from('2026-04-28T18:00:00Z'), false)?.toString(),
    '2026-04-29T11:00:00+02:00[Europe/Paris]',
  );
  assert.equal(
    source.after(Temporal.Instant.from('2026-04-29T09:00:00Z'), true)?.toString(),
    '2026-04-29T11:00:00+02:00[Europe/Paris]',
  );
  assert.equal(
    source.after(Temporal.Instant.from('2026-05-01T16:00:00Z'), false)?.toString(),
    '2026-05-04T11:00:00+02:00[Europe/Paris]',
  );
});

test('rule/source: count zero short-circuits to an empty cached result', () => {
  const source = new RuleSource(makeSpec({ count: 0 }));

  const first = source.all();
  const second = source.all();

  assert.deepEqual(first, []);
  assert.equal(first, second);
  assert.equal(source.after(Temporal.Instant.from('2025-01-01T00:00:00Z'), true), null);
  assert.equal(source.before(Temporal.Instant.from('2025-01-01T00:00:00Z'), true), null);
});
