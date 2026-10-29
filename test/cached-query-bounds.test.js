import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { RuleSource } from '../dist/engine.mjs';

test('cached COUNT queries preserve inclusive and exclusive bounds to the nanosecond', () => {
  for (const start of ['2026-03-29T03:15:00.123456789[Europe/Paris]',
    '2026-10-25T02:15:00.123456789+01:00[Europe/Paris]',
    '2026-10-04T02:45:00.123456789[Australia/Lord_Howe]', '2026-01-01T09:00:00.123456789[UTC]']) {
    for (const count of [0, 1, 30]) {
      const dtstart = Temporal.ZonedDateTime.from(start);
      const input = { dtstart, tzid: dtstart.timeZoneId, freq: 'DAILY', interval: 1, wkst: 0,
        count, byhour: [1, 2, 3], byminute: [0, 30], bysecond: [0] };
      const source = new RuleSource(input);
      const values = source.all().map(value => value.epochNanoseconds);
      const probes = [dtstart.epochNanoseconds - 1n, dtstart.epochNanoseconds,
        ...values.flatMap(value => [value - 1n, value, value + 1n]), dtstart.add({ days: 40 }).epochNanoseconds];
      const stamp = value => value?.epochNanoseconds ?? null;
      const instant = value => Temporal.Instant.fromEpochNanoseconds(value);
      for (const bound of probes) {
        for (const inc of [false, true]) {
          assert.equal(stamp(source.after(instant(bound), inc)),
            values.find(value => inc ? value >= bound : value > bound) ?? null);
          assert.equal(stamp(source.before(instant(bound), inc)),
            values.filter(value => inc ? value <= bound : value < bound).at(-1) ?? null);
          const upper = probes.at(-1);
          assert.deepEqual(source.between(instant(bound), instant(upper), inc).map(value => value.epochNanoseconds),
            values.filter(value => inc ? value >= bound && value <= upper : value > bound && value < upper));
          assert.deepEqual(source.between(instant(bound), instant(bound), inc).map(value => value.epochNanoseconds),
            inc ? values.filter(value => value === bound) : []);
        }
      }
      assert.deepEqual(source.between(instant(probes.at(-1)), instant(probes[0]), true), []);
    }
  }
});

test('cached open-ended previews do not truncate later directional or window queries', () => {
  const dtstart = Temporal.ZonedDateTime.from('2026-01-01T09:00:00[Europe/Paris]');
  const source = new RuleSource({ dtstart, tzid: dtstart.timeZoneId, freq: 'DAILY', interval: 1, wkst: 0 });
  assert.equal(source.all().length, 513);
  const distant = dtstart.add({ days: 1000 });
  assert.equal(source.after(distant.toInstant(), true).epochNanoseconds, distant.epochNanoseconds);
  assert.equal(source.before(distant.toInstant(), true).epochNanoseconds, distant.epochNanoseconds);
  assert.deepEqual(source.between(distant.toInstant(), distant.add({ days: 1 }).toInstant(), true)
    .map(value => value.epochNanoseconds), [distant.epochNanoseconds, distant.add({ days: 1 }).epochNanoseconds]);
});
