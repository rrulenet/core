import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { RuleSource } from '../dist/engine.mjs';

const stamps = values => Array.from(values, value => value.epochNanoseconds);

// Independent bounded model: construct nominal wall-clock slots with PlainDateTime,
// select positions per period, resolve them, then order/deduplicate exact instants.
// It does not call the engine's expansion, seeking or rank-selection helpers.
function reference(spec) {
  const seed = spec.dtstart.toPlainDateTime();
  const origin = spec.freq === 'WEEKLY'
    ? seed.subtract({ days: (seed.dayOfWeek - (spec.wkst + 1) + 7) % 7 }) : seed;
  const all = [];
  for (let period = 0; period < 64; period++) {
    const base = origin.add({ [spec.freq === 'DAILY' ? 'days' : 'weeks']: period * spec.interval });
    const days = spec.freq === 'WEEKLY'
      ? spec.byweekday.map(({ weekday }) => base.add({ days: (weekday - spec.wkst + 7) % 7 })) : [base];
    const slots = days.flatMap(day => spec.byhour.flatMap(hour => spec.byminute.map(minute => day.with({ hour, minute, second: 0 }))));
    slots.sort(Temporal.PlainDateTime.compare);
    const selected = spec.bysetpos?.length
      ? spec.bysetpos.map(pos => slots[pos > 0 ? pos - 1 : slots.length + pos]).filter(Boolean) : slots;
    all.push(...selected.map(value => value.toZonedDateTime(spec.tzid, { disambiguation: 'compatible' })));
  }
  const unique = new Map(all.filter(value => value.epochNanoseconds >= spec.dtstart.epochNanoseconds)
    .map(value => [value.epochNanoseconds, value]));
  return [...unique.values()].sort((a, b) => a.epochNanoseconds < b.epochNanoseconds ? -1 : 1).slice(0, 8);
}

function checkQueries(source, expected, start) {
  const lower = start.toInstant().subtract({ nanoseconds: 1 });
  const upper = expected.at(-1).toInstant();
  assert.deepEqual(stamps(source.between(lower, upper, true)), stamps(expected));
  const probes = [lower, expected[0].toInstant(), expected[3].toInstant().subtract({ nanoseconds: 1 }),
    expected[3].toInstant().add({ nanoseconds: 1 }), upper, upper.add({ nanoseconds: 1 })];
  for (const bound of probes) {
    for (const inc of [false, true]) {
      const stamp = bound.epochNanoseconds;
      assert.equal(source.after(bound, inc)?.epochNanoseconds ?? null,
        expected.find(value => inc ? value.epochNanoseconds >= stamp : value.epochNanoseconds > stamp)?.epochNanoseconds ?? null);
      assert.equal(source.before(bound, inc)?.epochNanoseconds ?? null,
        expected.filter(value => inc ? value.epochNanoseconds <= stamp : value.epochNanoseconds < stamp).at(-1)?.epochNanoseconds ?? null);
    }
    assert.equal(source.occursAt(bound), expected.some(value => value.epochNanoseconds === bound.epochNanoseconds));
  }
}

test('cold, cached and streamed calendar queries preserve the nominal contract against an independent model', () => {
  const starts = [
    '2026-03-27T01:15:00.123456789[Europe/Paris]',
    '2026-10-23T01:15:00.123456789[Europe/Paris]',
    '2026-10-25T02:15:00.123456789+01:00[Europe/Paris]',
    '2026-03-06T01:15:00.123456789[America/New_York]',
    '2026-10-30T01:15:00.123456789[America/New_York]',
    '2026-10-02T01:15:00.123456789[Australia/Lord_Howe]',
    '2026-04-03T01:15:00.123456789[Australia/Lord_Howe]',
    '2011-12-28T01:15:00.123456789[Pacific/Apia]',
  ];
  for (const start of starts) {
    for (let variant = 0; variant < 4; variant++) {
      const dtstart = Temporal.ZonedDateTime.from(start);
      const spec = { dtstart, tzid: dtstart.timeZoneId, freq: variant % 2 ? 'WEEKLY' : 'DAILY',
        interval: variant < 2 ? 1 : 2, wkst: variant < 2 ? 0 : 6,
        byweekday: variant % 2 ? [{ weekday: 0 }, { weekday: 6 }] : undefined,
        byhour: [1, 2, 3], byminute: [0, 30], bysecond: [0],
        bysetpos: [undefined, [2, -1], [3], [-2]][variant] };
      const expected = reference(spec);
      assert.equal(expected.length, 8);
      for (const bounds of [{ count: 8 }, { until: expected.at(-1) }]) {
        const source = new RuleSource({ ...spec, ...bounds });
        checkQueries(source, expected, dtstart);
        assert.deepEqual(stamps(source.iterate()), stamps(expected));
        assert.deepEqual(stamps(source.all()), stamps(expected));
        checkQueries(source, expected, dtstart);
      }
    }
  }
});

test('equivalent unfiltered calendar frequency units retain the same transition behavior', () => {
  for (const start of ['2026-03-29T01:30:00[Europe/Paris]', '2026-10-25T01:30:00[Europe/Paris]',
    '2026-10-04T01:30:00[Australia/Lord_Howe]']) {
    const dtstart = Temporal.ZonedDateTime.from(start);
    const values = [['HOURLY', 1], ['MINUTELY', 60], ['SECONDLY', 3600]].map(([freq, interval]) =>
      stamps(new RuleSource({ dtstart, tzid: dtstart.timeZoneId, freq, interval, wkst: 0, count: 6 }).all()));
    assert.deepEqual(values[1], values[0]);
    assert.deepEqual(values[2], values[0]);
  }
});
