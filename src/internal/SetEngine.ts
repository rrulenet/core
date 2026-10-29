import { Temporal } from 'temporal-polyfill';

import type { SourceQuery } from './spec.ts';
import { compareByInstant, dedupeByInstant } from './temporal.ts';
import { RecurrenceSearchLimitError } from './SearchLimitError.ts';

/**
 * Recursive set-expression tree used by the low-level engine.
 */
export type SetExpression =
  | { kind: 'source'; source: SourceQuery }
  | { kind: 'union'; expressions: SetExpression[] }
  | { kind: 'intersection'; expressions: SetExpression[] }
  | { kind: 'difference'; include: SetExpression; exclude: SetExpression };

function *iterateExpression(expression: SetExpression): Generator<Temporal.ZonedDateTime> {
  if (expression.kind === 'source') {
    let last: bigint | undefined;
    for (const value of expression.source.iterate?.() ?? expression.source.all().slice().sort(compareByInstant)) {
      if (value.epochNanoseconds !== last) yield value;
      last = value.epochNanoseconds;
    }
    return;
  }
  if (expression.kind === 'union') {
    const iterators = expression.expressions.map(entry => iterateExpression(entry));
    try {
      const heads = iterators.map(iterator => iterator.next());
      while (true) {
        let next: Temporal.ZonedDateTime | undefined;
        for (const head of heads) if (!head.done && (!next || compareByInstant(head.value, next) < 0)) next = head.value;
        if (!next) return;
        yield next;
        for (let i = 0; i < heads.length; i++) {
          if (!heads[i]!.done && compareByInstant(heads[i]!.value!, next) === 0) heads[i] = iterators[i]!.next();
        }
      }
    } finally {
      for (const iterator of iterators) iterator.return(undefined);
    }
    return;
  }
  if (expression.kind === 'intersection') {
    if (!expression.expressions.length) return;
    const iterators = expression.expressions.map(entry => iterateExpression(entry));
    try {
      const heads = iterators.map(iterator => iterator.next());
      let skipped = 0;
      const hasEnded = (): boolean => heads.some(head => !!head.done);
      while (!hasEnded()) {
        const latest = heads.reduce((a, b) => compareByInstant(a.value!, b.value!) >= 0 ? a : b).value!;
        if (heads.every(head => compareByInstant(head.value!, latest) === 0)) {
          yield latest;
          skipped = 0;
          for (let i = 0; i < heads.length; i++) heads[i] = iterators[i]!.next();
        } else {
          if (++skipped >= 10_000) throw new RecurrenceSearchLimitError();
          for (let i = 0; i < heads.length; i++) {
            if (compareByInstant(heads[i]!.value!, latest) < 0) heads[i] = iterators[i]!.next();
          }
        }
      }
    } finally {
      for (const iterator of iterators) iterator.return(undefined);
    }
    return;
  }
  const include = expression.include;
  let skipped = 0;
  for (const value of iterateExpression(include)) {
    const instant = value.toInstant();
    const keep = !evaluateContains(expression.exclude, instant);
    if (keep) {
      skipped = 0;
      yield value;
    } else if (++skipped >= 10_000) {
      throw new RecurrenceSearchLimitError();
    }
  }
}

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

function evaluateBetween(expression: SetExpression, after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
  switch (expression.kind) {
    case 'source':
      return expression.source.between(after, before, inc);
    case 'union':
      return dedupeByInstant(expression.expressions.flatMap((entry) => evaluateBetween(entry, after, before, inc))).sort(compareByInstant);
    case 'intersection': {
      if (!expression.expressions.length) return [];
      const [first, ...rest] = expression.expressions;
      return evaluateBetween(first, after, before, inc).filter((value) => {
        const instant = value.toInstant();
        return rest.every((entry) => evaluateContains(entry, instant));
      });
    }
    case 'difference': {
      const excluded = new Set(
        evaluateBetween(expression.exclude, after, before, true)
          .map((value) => value.toInstant().epochNanoseconds.toString()),
      );
      return evaluateBetween(expression.include, after, before, inc)
        .filter((value) => !excluded.has(value.toInstant().epochNanoseconds.toString()));
    }
  }
}

function evaluateContains(expression: SetExpression, instant: Temporal.Instant): boolean {
  switch (expression.kind) {
    case 'source':
      return expression.source.occursAt
        ? expression.source.occursAt(instant)
        : expression.source.between(instant, instant, true)
          .some((value) => Temporal.Instant.compare(value.toInstant(), instant) === 0);
    case 'union':
      return expression.expressions.some((entry) => evaluateContains(entry, instant));
    case 'intersection':
      return expression.expressions.length > 0 &&
        expression.expressions.every((entry) => evaluateContains(entry, instant));
    case 'difference':
      return evaluateContains(expression.include, instant) &&
        !evaluateContains(expression.exclude, instant);
  }
}

function evaluateAfter(expression: SetExpression, after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
  switch (expression.kind) {
    case 'source':
      return expression.source.after(after, inc);
    case 'union': {
      const candidates = expression.expressions
        .map((entry) => evaluateAfter(entry, after, inc))
        .filter((value): value is Temporal.ZonedDateTime => value !== null);
      candidates.sort(compareByInstant);
      return candidates[0] ?? null;
    }
    case 'difference': {
      let cursor = after;
      let inclusive = inc;
      let safety = 0;
      while (safety < 10_000) {
        safety += 1;
        const candidate = evaluateAfter(expression.include, cursor, inclusive);
        if (!candidate) return null;
        const instant = candidate.toInstant();
        const excluded = evaluateContains(expression.exclude, instant);
        if (!excluded) return candidate;
        cursor = instant;
        inclusive = false;
      }
      throw new RecurrenceSearchLimitError();
    }
    case 'intersection': {
      if (!expression.expressions.length) return null;
      let cursor = after;
      let inclusive = inc;
      for (let attempt = 0; attempt < 10_000; attempt++) {
        const values = expression.expressions.map(entry => evaluateAfter(entry, cursor, inclusive));
        if (values.some(value => !value)) return null;
        const latest = values.reduce((a, b) => compareByInstant(a!, b!) >= 0 ? a : b)!;
        if (values.every(value => compareByInstant(value!, latest) === 0)) return latest;
        cursor = latest.toInstant();
        inclusive = true;
      }
      throw new RecurrenceSearchLimitError();
    }
  }
}

function evaluateBefore(expression: SetExpression, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
  switch (expression.kind) {
    case 'source':
      return expression.source.before(before, inc);
    case 'union': {
      const candidates = expression.expressions
        .map((entry) => evaluateBefore(entry, before, inc))
        .filter((value): value is Temporal.ZonedDateTime => value !== null);
      candidates.sort(compareByInstant);
      return candidates[candidates.length - 1] ?? null;
    }
    case 'difference': {
      let cursor = before;
      let inclusive = inc;
      for (let attempt = 0; attempt < 10_000; attempt++) {
        const value = evaluateBefore(expression.include, cursor, inclusive);
        if (!value) return null;
        const instant = value.toInstant();
        const keep = !evaluateContains(expression.exclude, instant);
        if (keep) return value;
        cursor = instant;
        inclusive = false;
      }
      throw new RecurrenceSearchLimitError();
    }
    case 'intersection': {
      if (!expression.expressions.length) return null;
      let cursor = before;
      let inclusive = inc;
      for (let attempt = 0; attempt < 10_000; attempt++) {
        const values = expression.expressions.map(entry => evaluateBefore(entry, cursor, inclusive));
        if (values.some(value => !value)) return null;
        const earliest = values.reduce((a, b) => compareByInstant(a!, b!) <= 0 ? a : b)!;
        if (values.every(value => compareByInstant(value!, earliest) === 0)) return earliest;
        cursor = earliest.toInstant();
        inclusive = true;
      }
      throw new RecurrenceSearchLimitError();
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

  iterate(): Generator<Temporal.ZonedDateTime> {
    return iterateExpression(this.expression);
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    return evaluateBetween(this.expression, after, before, inc);
  }

  after(after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    return evaluateAfter(this.expression, after, inc);
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    return evaluateBefore(this.expression, before, inc);
  }
}
