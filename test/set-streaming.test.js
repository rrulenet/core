import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import { DateSource, ElapsedSource, SetEngine } from '../dist/engine.mjs';
import { QueryMethodsSource } from '../dist/index.mjs';

const instant = value => Temporal.Instant.from(value);
const source = source => ({ kind: 'source', source });
const grid = () => source(new ElapsedSource({ start: instant('2000-01-01T09:00:00Z'), every: 'PT24H' }));
const dates = values => source(new DateSource(values.map(value => instant(value).toZonedDateTimeISO('UTC'))));

test('streamed sets merge explicit dates, deduplicate, exclude, and close their sources on cancellation', () => {
  let closed = false;
  const input = { *iterate() { try { yield* new ElapsedSource({ start: instant('2026-01-01T09:00:00Z'), every: 'PT24H' }).iterate(); }
    finally { closed = true; } } };
  const engine = new SetEngine({ kind: 'difference', include: { kind: 'union', expressions: [
    source(input), dates(['2026-01-01T09:00:00Z', '2026-01-02T08:00:00Z', '2026-01-02T08:00:00Z']),
  ] }, exclude: dates(['2026-01-02T09:00:00Z']) });
  const values = [];
  for (const value of engine.iterate()) {
    values.push(value.toInstant().toString());
    if (values.length === 3) break;
  }
  assert.deepEqual(values, ['2026-01-01T09:00:00Z', '2026-01-02T08:00:00Z', '2026-01-03T09:00:00Z']);
  assert.equal(closed, true);
});

test('difference and intersection directional queries reach beyond finite all() previews', () => {
  const boundary = instant('2050-01-01T09:00:00Z');
  const difference = new SetEngine({ kind: 'difference', include: grid(), exclude: dates(['2050-01-01T09:00:00Z']) });
  assert.equal(difference.before(boundary, true).toInstant().toString(), '2049-12-31T09:00:00Z');
  assert.equal(difference.after(boundary, true).toInstant().toString(), '2050-01-02T09:00:00Z');
  const intersection = new SetEngine({ kind: 'intersection', expressions: [grid(), dates(['2050-01-01T09:00:00Z'])] });
  assert.equal(intersection.before(boundary, true).toInstant().toString(), boundary.toString());
  assert.equal(intersection.after(boundary, true).toInstant().toString(), boundary.toString());
});

test('filtered streaming and directional searches report exhaustion instead of claiming absence', () => {
  const never = source(new ElapsedSource({ start: instant('2000-01-01T09:30:00Z'), every: 'PT24H' }));
  const engine = new SetEngine({ kind: 'intersection', expressions: [grid(), never] });
  for (const operation of [() => engine.iterate().next(), () => engine.after(instant('2050-01-01T00:00:00Z'), true),
    () => engine.before(instant('2050-01-01T00:00:00Z'), true)]) {
    assert.throws(operation, error => error.code === 'RECURRENCE_SEARCH_LIMIT');
  }
});

test('empty intersection operands terminate streaming and directional queries immediately', () => {
  const engine = new SetEngine({ kind: 'intersection', expressions: [grid(), dates([])] });
  assert.deepEqual([...engine.iterate()], []);
  assert.equal(engine.after(instant('2050-01-01T00:00:00Z'), true), null);
  assert.equal(engine.before(instant('2050-01-01T00:00:00Z'), true), null);
});

test('non-streaming custom sources keep chronological ordering without mutating their arrays', () => {
  const input = ['2026-01-03T09:00:00Z', '2026-01-01T09:00:00Z', '2026-01-01T09:00:00Z'];
  const values = input.map(value => instant(value).toZonedDateTimeISO('UTC'));
  const classic = input.map(value => new Date(value));
  for (const expression of [source({ all: () => values }), source(new QueryMethodsSource({ all: () => classic }))]) {
    const engine = new SetEngine(expression);
    assert.deepEqual([...engine.iterate()].map(value => value.toInstant().toString()), ['2026-01-01T09:00:00Z', '2026-01-03T09:00:00Z']);
  }
  assert.deepEqual(values.map(value => value.toInstant().toString()), input);
  assert.deepEqual(classic.map(value => value.toISOString().replace('.000', '')), input);
});

test('generated finite streams and directional set queries match primitive set arithmetic', () => {
  const start = instant('2026-01-01T00:00:00Z');
  let seed = 0x20261029;
  const random = limit => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % limit; };
  for (let trial = 0; trial < 100; trial++) {
    const make = () => {
      const offset = random(5), step = 1 + random(4), count = random(12);
      return { expression: source(new ElapsedSource({ start: start.add({ hours: offset }), every: `PT${step}H`, count })),
        values: Array.from({ length: count }, (_, index) => offset + index * step) };
    };
    const a = make(), b = make();
    for (const kind of ['union', 'intersection', 'difference']) {
      const expression = kind === 'difference' ? { kind, include: a.expression, exclude: b.expression }
        : { kind, expressions: [a.expression, b.expression] };
      const expected = kind === 'union' ? [...new Set([...a.values, ...b.values])].sort((a, b) => a - b)
        : a.values.filter(value => kind === 'intersection' ? b.values.includes(value) : !b.values.includes(value));
      const engine = new SetEngine(expression);
      const hours = value => Number((value.epochNanoseconds - start.epochNanoseconds) / 3_600_000_000_000n);
      assert.deepEqual([...engine.iterate()].map(hours), expected, `${kind} trial ${trial}`);
      const bound = random(45);
      for (const inclusive of [false, true]) {
        const next = engine.after(start.add({ hours: bound }), inclusive);
        const previous = engine.before(start.add({ hours: bound }), inclusive);
        assert.equal(next ? hours(next) : null, expected.find(value => inclusive ? value >= bound : value > bound) ?? null);
        assert.equal(previous ? hours(previous) : null, expected.filter(value => inclusive ? value <= bound : value < bound).at(-1) ?? null);
      }
    }
  }
});
