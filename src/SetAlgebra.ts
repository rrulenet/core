import { Temporal } from 'temporal-polyfill';

import { cloneDate, isValidDate } from './internal/dateutil.ts';
import { DateSource } from './internal/DateSource.ts';
import type { QueryMethods } from './internal/options.ts';
import { SetEngine, type SetExpression } from './internal/SetEngine.ts';
import type { SourceQuery } from './internal/spec.ts';
import { describeSetExpression, getToTextLocale, isSetExpressionFullyConvertible, type TextMergeDescriptor, type ToTextOptions } from './internal/text.ts';
import { dateToZdt, toInstant, zdtToDate } from './internal/temporal.ts';

type TextQueryMethods = QueryMethods & {
  toText?: (options?: ToTextOptions) => string;
  isFullyConvertibleToText?: (options?: ToTextOptions) => boolean;
};

/**
 * Adapts classic `QueryMethods` sources into the low-level `SourceQuery`
 * interface used by the engine.
 */
export class QueryMethodsSource implements SourceQuery {
  constructor(private readonly query: QueryMethods) {}

  all(): Temporal.ZonedDateTime[] {
    return this.query.all().map((date) => dateToZdt(date, 'UTC'));
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    return this.query
      .between(new Date(Number(after.epochMilliseconds)), new Date(Number(before.epochMilliseconds)), inc)
      .map((date) => dateToZdt(date, 'UTC'));
  }

  after(after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    const value = this.query.after(new Date(Number(after.epochMilliseconds)), inc);
    return value ? dateToZdt(value, 'UTC') : null;
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    const value = this.query.before(new Date(Number(before.epochMilliseconds)), inc);
    return value ? dateToZdt(value, 'UTC') : null;
  }

  toTextDescription(options?: ToTextOptions): string {
    return (this.query as TextQueryMethods).toText?.(options) ?? getToTextLocale(options?.locale).customSource;
  }

  isFullyConvertibleToText(options?: ToTextOptions): boolean {
    return (this.query as TextQueryMethods).isFullyConvertibleToText?.(options) ?? false;
  }

  textMergeDescriptor(options?: ToTextOptions): TextMergeDescriptor | null {
    return (this.query as TextQueryMethods & { textMergeDescriptor?: (options?: ToTextOptions) => TextMergeDescriptor | null })
      .textMergeDescriptor?.(options) ?? null;
  }
}

export type SetOperand = QueryMethods | SetAlgebra;

function toExpression(operand: SetOperand): SetExpression {
  return operand instanceof SetAlgebra
    ? operand.getExpression()
    : { kind: 'source', source: new QueryMethodsSource(operand) };
}

/**
 * Composes recurrence-producing sources with set algebra operations.
 *
 * `SetAlgebra` is the low-level composition layer behind unions,
 * intersections, and differences of recurrence-producing sources.
 */
export class SetAlgebra implements QueryMethods {
  constructor(private readonly expression: SetExpression) {}

  /**
   * Wrap a compat-style source so it can participate in set algebra.
   */
  static from(source: QueryMethods): SetAlgebra {
    return new SetAlgebra({ kind: 'source', source: new QueryMethodsSource(source) });
  }

  /**
   * Build a set operand from explicit dates interpreted in the given timezone.
   */
  static dates(dates: Date[], tzid = 'UTC'): SetAlgebra {
    const values = dates.map((date) => {
      if (!isValidDate(date)) throw new Error('Invalid date');
      return dateToZdt(cloneDate(date), tzid);
    });
    return new SetAlgebra({ kind: 'source', source: new DateSource(values) });
  }

  /**
   * Create the union of multiple set operands.
   */
  static union(...operands: SetOperand[]): SetAlgebra {
    return new SetAlgebra({ kind: 'union', expressions: operands.map(toExpression) });
  }

  /**
   * Create the intersection of multiple set operands.
   */
  static intersection(...operands: SetOperand[]): SetAlgebra {
    return new SetAlgebra({ kind: 'intersection', expressions: operands.map(toExpression) });
  }

  /**
   * Subtract one set operand from another.
   */
  static difference(include: SetOperand, exclude: SetOperand): SetAlgebra {
    return new SetAlgebra({
      kind: 'difference',
      include: toExpression(include),
      exclude: toExpression(exclude),
    });
  }

  all(): Date[] {
    return new SetEngine(this.expression).all().map(zdtToDate);
  }

  between(after: Date, before: Date, inc = false): Date[] {
    if (!isValidDate(after) || !isValidDate(before)) throw new Error('Invalid date');
    return new SetEngine(this.expression).between(toInstant(after), toInstant(before), inc).map(zdtToDate);
  }

  before(date: Date, inc = false): Date | null {
    if (!isValidDate(date)) throw new Error('Invalid date');
    const value = new SetEngine(this.expression).before(toInstant(date), inc);
    return value ? zdtToDate(value) : null;
  }

  after(date: Date, inc = false): Date | null {
    if (!isValidDate(date)) throw new Error('Invalid date');
    const value = new SetEngine(this.expression).after(toInstant(date), inc);
    return value ? zdtToDate(value) : null;
  }

  union(...operands: SetOperand[]): SetAlgebra {
    return SetAlgebra.union(this, ...operands);
  }

  intersection(...operands: SetOperand[]): SetAlgebra {
    return SetAlgebra.intersection(this, ...operands);
  }

  difference(exclude: SetOperand): SetAlgebra {
    return SetAlgebra.difference(this, exclude);
  }

  toText(options?: ToTextOptions): string {
    return describeSetExpression(this.expression, options);
  }

  isFullyConvertibleToText(options?: ToTextOptions): boolean {
    return isSetExpressionFullyConvertible(this.expression, options);
  }

  /**
   * Expose the underlying engine expression.
   */
  getExpression(): SetExpression {
    return this.expression;
  }
}
