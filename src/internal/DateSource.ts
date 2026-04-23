import { Temporal } from 'temporal-polyfill';

import type { SourceQuery } from './spec.ts';
import { compareByInstant } from './temporal.ts';
import { getToTextLocale, type TextMergeDescriptor, type ToTextOptions } from './text.ts';

/**
 * A concrete source backed by explicit occurrence dates.
 */
export class DateSource implements SourceQuery {
  constructor(private readonly dates: Temporal.ZonedDateTime[]) {}

  all(): Temporal.ZonedDateTime[] {
    return [...this.dates].sort(compareByInstant);
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    return this.all().filter((value) => {
      const cmpA = Temporal.Instant.compare(value.toInstant(), after);
      const cmpB = Temporal.Instant.compare(value.toInstant(), before);
      return inc ? cmpA >= 0 && cmpB <= 0 : cmpA > 0 && cmpB < 0;
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

  toTextDescription(options?: ToTextOptions): string {
    return getToTextLocale(options?.locale).sourceDateCountPhrase(this.dates.length);
  }

  isFullyConvertibleToText(_options?: ToTextOptions): boolean {
    return true;
  }

  textMergeDescriptor(_options?: ToTextOptions): TextMergeDescriptor | null {
    return null;
  }

  isDateSource(): true {
    return true;
  }

  dateCount(): number {
    return this.dates.length;
  }
}
