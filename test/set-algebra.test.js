import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';

import { SetAlgebra } from '../dist/index.mjs';
import { datetime, Frequency, RRule, RRuleSet } from './support/compat.js';
import { DateSource } from '../dist/engine.mjs';

test('set/algebra: union composes rule and explicit date sources without RRuleSet', () => {
  const expression = SetAlgebra.union(
    new RRule({
      freq: Frequency.DAILY,
      count: 2,
      dtstart: datetime(2026, 4, 11, 9, 0, 0),
    }),
    SetAlgebra.dates([
      new Date('2026-04-10T09:00:00.000Z'),
      new Date('2026-04-12T09:00:00.000Z'),
    ]),
  );

  assert.deepEqual(expression.all().map((value) => value.toISOString()), [
    '2026-04-10T09:00:00.000Z',
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
  ]);
});

test('set/algebra: difference subtracts a composed exclusion expression', () => {
  const weekdays = SetAlgebra.union(
    new RRule({
      freq: Frequency.WEEKLY,
      count: 3,
      byweekday: [RRule.MO],
      dtstart: datetime(2026, 4, 13, 9, 0, 0),
    }),
    new RRule({
      freq: Frequency.WEEKLY,
      count: 3,
      byweekday: [RRule.WE],
      dtstart: datetime(2026, 4, 15, 9, 0, 0),
    }),
  );
  const blocked = SetAlgebra.union(
    SetAlgebra.dates([new Date('2026-04-15T09:00:00.000Z')]),
    new RRule({
      freq: Frequency.WEEKLY,
      count: 1,
      byweekday: [RRule.MO],
      dtstart: datetime(2026, 4, 20, 9, 0, 0),
    }),
  );

  assert.deepEqual(weekdays.difference(blocked).all().map((value) => value.toISOString()), [
    '2026-04-13T09:00:00.000Z',
    '2026-04-22T09:00:00.000Z',
    '2026-04-27T09:00:00.000Z',
    '2026-04-29T09:00:00.000Z',
  ]);
});

test('set/algebra: intersection keeps only shared occurrences', () => {
  const daily = new RRule({
    freq: Frequency.DAILY,
    count: 7,
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
  });
  const weekdays = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    byhour: [9],
    dtstart: datetime(2025, 1, 1, 9, 0, 0),
  });

  const expression = SetAlgebra.intersection(daily, weekdays);
  assert.deepEqual(expression.all().map((value) => value.toISOString()), [
    '2025-01-01T09:00:00.000Z',
    '2025-01-02T09:00:00.000Z',
    '2025-01-03T09:00:00.000Z',
    '2025-01-06T09:00:00.000Z',
    '2025-01-07T09:00:00.000Z',
  ]);
  assert.equal(expression.isFullyConvertibleToText(), false);
});

test('set/algebra: bounded queries work on chained expressions', () => {
  const expression = SetAlgebra
    .union(
      new RRule({
        freq: Frequency.DAILY,
        count: 4,
        dtstart: datetime(2026, 4, 11, 9, 0, 0),
      }),
      SetAlgebra.dates([new Date('2026-04-11T08:30:00.000Z')]),
    )
    .difference(SetAlgebra.dates([new Date('2026-04-12T09:00:00.000Z')]));

  assert.deepEqual(
    expression
      .between(new Date('2026-04-11T08:45:00.000Z'), new Date('2026-04-13T09:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    ['2026-04-11T09:00:00.000Z', '2026-04-13T09:00:00.000Z'],
  );
  assert.equal(expression.after(new Date('2026-04-11T08:00:00.000Z'))?.toISOString(), '2026-04-11T08:30:00.000Z');
  assert.equal(expression.before(new Date('2026-04-12T09:00:00.000Z'), true)?.toISOString(), '2026-04-11T09:00:00.000Z');
});

test('set/algebra: existing RRuleSet instances can be reused as sources', () => {
  const set = new RRuleSet();
  set.rrule(new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  }));
  set.exdate(new Date('2026-04-12T09:00:00.000Z'));

  const expression = SetAlgebra.union(
    SetAlgebra.from(set),
    SetAlgebra.dates([new Date('2026-04-12T08:00:00.000Z')]),
  );

  assert.deepEqual(expression.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T08:00:00.000Z',
  ]);
});

test('set/algebra: toText renders structural unions with explicit dates', () => {
  const expression = SetAlgebra.union(
    new RRule({
      freq: Frequency.DAILY,
      count: 2,
      dtstart: datetime(2026, 4, 11, 9, 0, 0),
    }),
    SetAlgebra.dates([
      new Date('2026-04-15T09:00:00.000Z'),
      new Date('2026-04-16T09:00:00.000Z'),
    ]),
  );

  assert.equal(expression.toText(), 'every day at 9 AM UTC for 2 times with 2 additional dates');
  assert.equal(expression.toText({ locale: 'fr' }), 'chaque jour à 09:00 UTC pendant 2 occurrences avec 2 dates supplémentaires');
  assert.equal(expression.isFullyConvertibleToText(), true);
});

test('set/algebra: toText renders structural differences', () => {
  const expression = SetAlgebra
    .union(
      new RRule({
        freq: Frequency.DAILY,
        count: 4,
        dtstart: datetime(2026, 4, 11, 9, 0, 0),
      }),
      SetAlgebra.dates([new Date('2026-04-20T09:00:00.000Z')]),
    )
    .difference(
      SetAlgebra.union(
        new RRule({
          freq: Frequency.DAILY,
          count: 1,
          dtstart: datetime(2026, 4, 12, 9, 0, 0),
        }),
        SetAlgebra.dates([new Date('2026-04-20T09:00:00.000Z')]),
      ),
    );

  assert.equal(
    expression.toText(),
    'every day at 9 AM UTC for 4 times with 1 additional date excluding every day at 9 AM UTC for 1 time and 1 date',
  );
  assert.equal(expression.isFullyConvertibleToText(), true);
});

test('set/algebra: toText falls back to symbolic rendering for intersections', () => {
  const daily = new RRule({
    freq: Frequency.DAILY,
    count: 2,
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });
  const weekly = new RRule({
    freq: Frequency.WEEKLY,
    count: 2,
    byweekday: [RRule.SA],
    dtstart: datetime(2026, 4, 11, 9, 0, 0),
  });

  const expression = SetAlgebra.intersection(daily, weekly);
  assert.match(expression.toText(), /∩/);
  assert.equal(expression.isFullyConvertibleToText(), false);
});

test('set/algebra: toText merges similar weekly sources', () => {
  const expression = SetAlgebra.union(
    new RRule({
      freq: Frequency.WEEKLY,
      count: 3,
      byweekday: [RRule.MO],
      dtstart: datetime(2026, 4, 13, 9, 0, 0),
    }),
    new RRule({
      freq: Frequency.WEEKLY,
      count: 3,
      byweekday: [RRule.WE],
      dtstart: datetime(2026, 4, 15, 9, 0, 0),
    }),
  );

  assert.equal(expression.toText(), 'every week on Monday and Wednesday at 9 AM UTC for 3 times');
  assert.equal(expression.toText({ locale: 'fr' }), 'chaque semaine le lundi et le mercredi à 09:00 UTC pendant 3 occurrences');
});

test('set/algebra: date-only sources honor inclusive and exclusive bounded queries', () => {
  const expression = SetAlgebra.dates([
    new Date('2026-04-11T09:00:00.000Z'),
    new Date('2026-04-12T09:00:00.000Z'),
    new Date('2026-04-13T09:00:00.000Z'),
  ]);

  assert.deepEqual(
    expression
      .between(new Date('2026-04-11T09:00:00.000Z'), new Date('2026-04-13T09:00:00.000Z'), false)
      .map((value) => value.toISOString()),
    ['2026-04-12T09:00:00.000Z'],
  );
  assert.deepEqual(
    expression
      .between(new Date('2026-04-11T09:00:00.000Z'), new Date('2026-04-13T09:00:00.000Z'), true)
      .map((value) => value.toISOString()),
    [
      '2026-04-11T09:00:00.000Z',
      '2026-04-12T09:00:00.000Z',
      '2026-04-13T09:00:00.000Z',
    ],
  );
  assert.equal(expression.after(new Date('2026-04-12T09:00:00.000Z'), false)?.toISOString(), '2026-04-13T09:00:00.000Z');
  assert.equal(expression.after(new Date('2026-04-12T09:00:00.000Z'), true)?.toISOString(), '2026-04-12T09:00:00.000Z');
  assert.equal(expression.before(new Date('2026-04-12T09:00:00.000Z'), false)?.toISOString(), '2026-04-11T09:00:00.000Z');
  assert.equal(expression.before(new Date('2026-04-12T09:00:00.000Z'), true)?.toISOString(), '2026-04-12T09:00:00.000Z');
});

test('set/algebra: date-only sources expose date count semantics in text helpers', () => {
  const expression = SetAlgebra.dates([
    new Date('2026-04-11T09:00:00.000Z'),
    new Date('2026-04-12T09:00:00.000Z'),
  ]);

  assert.equal(expression.toText(), '2 dates');
  assert.equal(expression.toText({ locale: 'fr' }), '2 dates');
  assert.equal(expression.isFullyConvertibleToText(), true);
});

test('set/algebra: invalid dates are rejected in builder and query boundaries', () => {
  assert.throws(() => SetAlgebra.dates([new Date(Number.NaN)]), /Invalid date/);

  const expression = SetAlgebra.dates([new Date('2026-04-11T09:00:00.000Z')]);
  assert.throws(() => expression.between(new Date(Number.NaN), new Date('2026-04-12T09:00:00.000Z')), /Invalid date/);
  assert.throws(() => expression.after(new Date(Number.NaN)), /Invalid date/);
  assert.throws(() => expression.before(new Date(Number.NaN)), /Invalid date/);
});

test('set/algebra: custom query sources fall back cleanly for text conversion metadata', () => {
  const custom = {
    all() {
      return [new Date('2026-04-11T09:00:00.000Z')];
    },
    between() {
      return [];
    },
    after() {
      return null;
    },
    before() {
      return null;
    },
  };

  const expression = SetAlgebra.from(custom);

  assert.equal(expression.toText(), 'custom source');
  assert.equal(expression.isFullyConvertibleToText(), false);
});

test('set/algebra: custom query sources delegate query methods through SetAlgebra.from()', () => {
  const custom = {
    all() {
      return [
        new Date('2026-04-12T09:00:00.000Z'),
        new Date('2026-04-11T09:00:00.000Z'),
      ];
    },
    between(after, before, inc) {
      const values = this.all().filter((value) => inc
        ? value >= after && value <= before
        : value > after && value < before);
      return values;
    },
    after(after, inc) {
      return this.all().find((value) => inc ? value >= after : value > after) ?? null;
    },
    before(before, inc) {
      return this.all().filter((value) => inc ? value <= before : value < before).at(-1) ?? null;
    },
    toText() {
      return 'delegated custom source';
    },
    isFullyConvertibleToText() {
      return true;
    },
    textMergeDescriptor() {
      return {
        kind: 'rule',
        descriptor: {
          freq: 2,
          interval: 1,
          byweekday: [0],
          times: ['09:00 UTC'],
        },
      };
    },
  };

  const expression = SetAlgebra.from(custom);
  const { source } = expression.getExpression();

  assert.deepEqual(expression.all().map((value) => value.toISOString()), [
    '2026-04-11T09:00:00.000Z',
    '2026-04-12T09:00:00.000Z',
  ]);
  assert.deepEqual(source.all().map((value) => value.toString()), [
    '2026-04-12T09:00:00+00:00[UTC]',
    '2026-04-11T09:00:00+00:00[UTC]',
  ]);
  assert.deepEqual(
    source
      .between(Temporal.Instant.from('2026-04-11T09:00:00Z'), Temporal.Instant.from('2026-04-12T09:00:00Z'), false)
      .map((value) => value.toString()),
    [],
  );
  assert.equal(source.after(Temporal.Instant.from('2026-04-11T09:00:00Z'), true)?.toString(), '2026-04-12T09:00:00+00:00[UTC]');
  assert.equal(source.before(Temporal.Instant.from('2026-04-12T09:00:00Z'), true)?.toString(), '2026-04-11T09:00:00+00:00[UTC]');
  assert.deepEqual(source.textMergeDescriptor(), custom.textMergeDescriptor());
  assert.equal(expression.toText(), 'delegated custom source');
  assert.equal(expression.isFullyConvertibleToText(), true);
});

test('set/algebra: DateSource exposes sorted direct date-source semantics', () => {
  const source = new DateSource([
    Temporal.ZonedDateTime.from('2026-04-13T09:00:00Z[UTC]'),
    Temporal.ZonedDateTime.from('2026-04-11T09:00:00Z[UTC]'),
    Temporal.ZonedDateTime.from('2026-04-12T09:00:00Z[UTC]'),
  ]);

  assert.deepEqual(source.all().map((value) => value.toString()), [
    '2026-04-11T09:00:00+00:00[UTC]',
    '2026-04-12T09:00:00+00:00[UTC]',
    '2026-04-13T09:00:00+00:00[UTC]',
  ]);
  assert.deepEqual(
    source
      .between(Temporal.Instant.from('2026-04-11T09:00:00Z'), Temporal.Instant.from('2026-04-13T09:00:00Z'), false)
      .map((value) => value.toString()),
    ['2026-04-12T09:00:00+00:00[UTC]'],
  );
  assert.equal(source.after(Temporal.Instant.from('2026-04-12T09:00:00Z'), false)?.toString(), '2026-04-13T09:00:00+00:00[UTC]');
  assert.equal(source.after(Temporal.Instant.from('2026-04-12T09:00:00Z'), true)?.toString(), '2026-04-12T09:00:00+00:00[UTC]');
  assert.equal(source.before(Temporal.Instant.from('2026-04-12T09:00:00Z'), false)?.toString(), '2026-04-11T09:00:00+00:00[UTC]');
  assert.equal(source.before(Temporal.Instant.from('2026-04-12T09:00:00Z'), true)?.toString(), '2026-04-12T09:00:00+00:00[UTC]');
  assert.equal(source.toTextDescription(), '3 dates');
  assert.equal(source.toTextDescription({ locale: 'fr' }), '3 dates');
  assert.equal(source.isFullyConvertibleToText(), true);
  assert.equal(source.textMergeDescriptor(), null);
  assert.equal(source.isDateSource(), true);
  assert.equal(source.dateCount(), 3);
});
