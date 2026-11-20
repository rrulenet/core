import { Temporal } from 'temporal-polyfill';

import type { QueryWindow, SourceQuery } from './spec.ts';
import { isEmptyWindow, iterateWindowWithQueries } from './QueryWindow.ts';
import { compareByInstant, dedupeByInstant } from './temporal.ts';
import { CandidateBudget, RecurrenceSearchLimitError } from './SearchLimitError.ts';

/**
 * Recursive set-expression tree used by the low-level engine.
 */
export type SetExpression =
  | { kind: 'source'; source: SourceQuery }
  | { kind: 'union'; expressions: SetExpression[] }
  | { kind: 'intersection'; expressions: SetExpression[] }
  | { kind: 'difference'; include: SetExpression; exclude: SetExpression };

function *iterateExpression(expression: SetExpression, budget: CandidateBudget, window?: QueryWindow): Generator<Temporal.ZonedDateTime> {
  if (expression.kind === 'source') {
    let last: bigint | undefined;
    const source = expression.source;
    const values = window
      ? source.iterateWindow?.(window, budget) ?? iterateWindowWithQueries(source, window, budget)
      : source.iterate?.(budget) ?? source.all(budget).slice().sort(compareByInstant);
    for (const value of values) {
      if (value.epochNanoseconds !== last) yield value;
      last = value.epochNanoseconds;
    }
    return;
  }
  if (expression.kind === 'union') {
    const iterators = expression.expressions.map(entry => iterateExpression(entry, budget, window));
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
  if (window) {
    yield* iterateFilteredWindow(expression, budget, window);
    return;
  }
  if (expression.kind === 'intersection') {
    if (!expression.expressions.length) return;
    const iterators = expression.expressions.map(entry => iterateExpression(entry, budget));
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
  yield* iterateDifferenceByMembership(expression, budget);
}

function *iterateDifferenceByMembership(
  expression: Extract<SetExpression, { kind: 'difference' }>,
  budget: CandidateBudget,
  window?: QueryWindow,
): Generator<Temporal.ZonedDateTime> {
  let skipped = 0;
  for (const value of iterateExpression(expression.include, budget, window)) {
    const instant = value.toInstant();
    const keep = !evaluateContains(expression.exclude, instant, budget);
    if (keep) {
      skipped = 0;
      yield value;
    } else if (++skipped >= 10_000) {
      throw new RecurrenceSearchLimitError();
    }
  }
}

function isExplicitDates(expression: SetExpression): boolean {
  if (expression.kind === 'source') return expression.source.isDateSource?.() === true;
  return expression.kind === 'union' && expression.expressions.every(isExplicitDates);
}

function *iterateFilteredWindow(
  expression: Extract<SetExpression, { kind: 'difference' | 'intersection' }>,
  budget: CandidateBudget,
  window: QueryWindow,
): Generator<Temporal.ZonedDateTime> {
  if (!window.before) {
    if (expression.kind === 'difference' && isExplicitDates(expression.exclude)) {
      yield* iterateDifferenceByMembership(expression, budget, window);
      return;
    }
    // Directional search can jump gaps in a sparse filtered expression.
    let value = evaluateAfter(expression, window.after, window.inc, budget);
    while (value) {
      yield value;
      value = evaluateAfter(expression, value.toInstant(), false, budget);
    }
    return;
  }
  if (expression.kind === 'intersection') {
    const [first, ...rest] = expression.expressions;
    if (!first) return;
    for (const value of iterateExpression(first, budget, window)) {
      const instant = value.toInstant();
      if (rest.every(entry => evaluateContains(entry, instant, budget))) yield value;
    }
    return;
  }
  const excluded = iterateExpression(expression.exclude, budget, window);
  try {
    let head: IteratorResult<Temporal.ZonedDateTime> | undefined;
    for (const value of iterateExpression(expression.include, budget, window)) {
      head ??= excluded.next();
      while (!head.done && compareByInstant(head.value, value) < 0) head = excluded.next();
      if (head.done || compareByInstant(head.value, value) !== 0) yield value;
    }
  } finally {
    excluded.return(undefined);
  }
}

function evaluateAll(expression: SetExpression, budget: CandidateBudget): Temporal.ZonedDateTime[] {
  switch (expression.kind) {
    case 'source':
      return expression.source.all(budget);
    case 'union':
      return dedupeByInstant(expression.expressions.flatMap(entry => evaluateAll(entry, budget)));
    case 'intersection': {
      if (!expression.expressions.length) return [];
      const [first, ...rest] = expression.expressions.map(entry => evaluateAll(entry, budget));
      const shared = rest.map((values) => new Set(values.map((value) => value.toInstant().epochNanoseconds.toString())));
      return first.filter((value) => {
        const key = value.toInstant().epochNanoseconds.toString();
        return shared.every((values) => values.has(key));
      });
    }
    case 'difference': {
      const include = evaluateAll(expression.include, budget);
      const excluded = new Set(evaluateAll(expression.exclude, budget).map((value) => value.toInstant().epochNanoseconds.toString()));
      return include.filter((value) => !excluded.has(value.toInstant().epochNanoseconds.toString()));
    }
  }
}

function evaluateBetween(expression: SetExpression, after: Temporal.Instant, before: Temporal.Instant, inc: boolean, budget: CandidateBudget): Temporal.ZonedDateTime[] {
  switch (expression.kind) {
    case 'source':
      return expression.source.between(after, before, inc, budget);
    case 'union':
      return dedupeByInstant(expression.expressions.flatMap((entry) => evaluateBetween(entry, after, before, inc, budget))).sort(compareByInstant);
    case 'intersection': {
      if (!expression.expressions.length) return [];
      const [first, ...rest] = expression.expressions;
      return evaluateBetween(first, after, before, inc, budget).filter((value) => {
        const instant = value.toInstant();
        return rest.every((entry) => evaluateContains(entry, instant, budget));
      });
    }
    case 'difference': {
      const excluded = new Set(
        evaluateBetween(expression.exclude, after, before, true, budget)
          .map((value) => value.toInstant().epochNanoseconds.toString()),
      );
      return evaluateBetween(expression.include, after, before, inc, budget)
        .filter((value) => !excluded.has(value.toInstant().epochNanoseconds.toString()));
    }
  }
}

function evaluateContains(expression: SetExpression, instant: Temporal.Instant, budget: CandidateBudget): boolean {
  switch (expression.kind) {
    case 'source':
      return expression.source.occursAt
        ? expression.source.occursAt(instant, budget)
        : expression.source.between(instant, instant, true, budget)
          .some((value) => Temporal.Instant.compare(value.toInstant(), instant) === 0);
    case 'union':
      return expression.expressions.some((entry) => evaluateContains(entry, instant, budget));
    case 'intersection':
      return expression.expressions.length > 0 &&
        expression.expressions.every((entry) => evaluateContains(entry, instant, budget));
    case 'difference':
      return evaluateContains(expression.include, instant, budget) &&
        !evaluateContains(expression.exclude, instant, budget);
  }
}

function evaluateAfter(expression: SetExpression, after: Temporal.Instant, inc: boolean, budget: CandidateBudget): Temporal.ZonedDateTime | null {
  switch (expression.kind) {
    case 'source':
      return expression.source.after(after, inc, budget);
    case 'union': {
      const candidates = expression.expressions
        .map((entry) => evaluateAfter(entry, after, inc, budget))
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
        const candidate = evaluateAfter(expression.include, cursor, inclusive, budget);
        if (!candidate) return null;
        const instant = candidate.toInstant();
        const excluded = evaluateContains(expression.exclude, instant, budget);
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
        const values = expression.expressions.map(entry => evaluateAfter(entry, cursor, inclusive, budget));
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

function evaluateBefore(expression: SetExpression, before: Temporal.Instant, inc: boolean, budget: CandidateBudget): Temporal.ZonedDateTime | null {
  switch (expression.kind) {
    case 'source':
      return expression.source.before(before, inc, budget);
    case 'union': {
      const candidates = expression.expressions
        .map((entry) => evaluateBefore(entry, before, inc, budget))
        .filter((value): value is Temporal.ZonedDateTime => value !== null);
      candidates.sort(compareByInstant);
      return candidates[candidates.length - 1] ?? null;
    }
    case 'difference': {
      let cursor = before;
      let inclusive = inc;
      for (let attempt = 0; attempt < 10_000; attempt++) {
        const value = evaluateBefore(expression.include, cursor, inclusive, budget);
        if (!value) return null;
        const instant = value.toInstant();
        const keep = !evaluateContains(expression.exclude, instant, budget);
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
        const values = expression.expressions.map(entry => evaluateBefore(entry, cursor, inclusive, budget));
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

  constructor(private readonly expression: SetExpression, private readonly maxCandidateEvaluations?: number) {}

  all(): Temporal.ZonedDateTime[] {
    if (this.allCache) return this.allCache;
    this.allCache = evaluateAll(this.expression, new CandidateBudget(this.maxCandidateEvaluations)).sort(compareByInstant);
    return this.allCache;
  }

  iterate(): Generator<Temporal.ZonedDateTime> {
    return iterateExpression(this.expression, new CandidateBudget(this.maxCandidateEvaluations));
  }

  *iterateWindow(window: QueryWindow): Generator<Temporal.ZonedDateTime> {
    if (isEmptyWindow(window)) return;
    yield* iterateExpression(this.expression, new CandidateBudget(this.maxCandidateEvaluations), window);
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    return evaluateBetween(this.expression, after, before, inc, new CandidateBudget(this.maxCandidateEvaluations));
  }

  after(after: Temporal.Instant, inc: boolean, budget = new CandidateBudget(this.maxCandidateEvaluations)): Temporal.ZonedDateTime | null {
    return evaluateAfter(this.expression, after, inc, budget);
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    return evaluateBefore(this.expression, before, inc, new CandidateBudget(this.maxCandidateEvaluations));
  }
}
