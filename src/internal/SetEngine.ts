import { Temporal } from 'temporal-polyfill';

import type { SourceQuery } from './spec.ts';
import { compareByInstant, dedupeByInstant } from './temporal.ts';

/**
 * Recursive set-expression tree used by the low-level engine.
 */
export type SetExpression =
  | { kind: 'source'; source: SourceQuery }
  | { kind: 'union'; expressions: SetExpression[] }
  | { kind: 'intersection'; expressions: SetExpression[] }
  | { kind: 'difference'; include: SetExpression; exclude: SetExpression };

function evaluateAll(expression: SetExpression): Temporal.ZonedDateTime[] {
  switch (expression.kind) {
    case 'source':
      return expression.source.all();
    case 'union':
      return dedupeByInstant(expression.expressions.flatMap(evaluateAll));
    case 'intersection': {
      if (!expression.expressions.length) return [];
      const [first, ...rest] = expression.expressions.map(evaluateAll);
      const shared = rest.map((values) => new Set(values.map((value) => value.toInstant().epochNanoseconds.toString())));
      return first.filter((value) => {
        const key = value.toInstant().epochNanoseconds.toString();
        return shared.every((values) => values.has(key));
      });
    }
    case 'difference': {
      const include = evaluateAll(expression.include);
      const excluded = new Set(evaluateAll(expression.exclude).map((value) => value.toInstant().epochNanoseconds.toString()));
      return include.filter((value) => !excluded.has(value.toInstant().epochNanoseconds.toString()));
    }
  }
}

/**
 * Evaluates set expressions and exposes query methods over their occurrences.
 */
export class SetEngine {
  private allCache: Temporal.ZonedDateTime[] | null = null;

  constructor(private readonly expression: SetExpression) {}

  all(): Temporal.ZonedDateTime[] {
    if (this.allCache) return this.allCache;
    this.allCache = evaluateAll(this.expression).sort(compareByInstant);
    return this.allCache;
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    return this.all().filter((date) => {
      const instant = date.toInstant();
      const lower = inc ? Temporal.Instant.compare(instant, after) >= 0 : Temporal.Instant.compare(instant, after) > 0;
      const upper = inc ? Temporal.Instant.compare(instant, before) <= 0 : Temporal.Instant.compare(instant, before) < 0;
      return lower && upper;
    });
  }

  after(after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    return this.all().find((value) => {
      const cmp = Temporal.Instant.compare(value.toInstant(), after);
      return inc ? cmp >= 0 : cmp > 0;
    }) ?? null;
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    const values = this.all().filter((value) => {
      const cmp = Temporal.Instant.compare(value.toInstant(), before);
      return inc ? cmp <= 0 : cmp < 0;
    });
    return values.length ? values[values.length - 1]! : null;
  }
}
