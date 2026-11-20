import { Temporal } from 'temporal-polyfill';

import type { QueryWindow, SourceQuery } from './spec.ts';
import { compareByInstant } from './temporal.ts';
import { getToTextLocale, type TextMergeDescriptor, type ToTextOptions } from './text.ts';
import { CandidateBudget } from './SearchLimitError.ts';

/**
 * A concrete source backed by explicit occurrence dates.
 */
export class DateSource implements SourceQuery {
  private readonly dates: Temporal.ZonedDateTime[];

  constructor(dates: Temporal.ZonedDateTime[]) {
    this.dates = [...dates].sort(compareByInstant);
  }

  all(budget: CandidateBudget = new CandidateBudget()): Temporal.ZonedDateTime[] {
    budget.spend(this.dates.length);
    return this.dates.slice();
  }

  *iterate(budget: CandidateBudget = new CandidateBudget()): Generator<Temporal.ZonedDateTime> {
    for (const date of this.dates) {
      budget.spend();
      yield date;
    }
  }

  private boundary(instant: Temporal.Instant, strict: boolean): number {
    const stamp = instant.epochNanoseconds;
    let lo = 0, hi = this.dates.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const value = this.dates[mid]!.epochNanoseconds;
      if (value < stamp || (strict && value === stamp)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean, budget: CandidateBudget = new CandidateBudget()): Temporal.ZonedDateTime[] {
    const first = this.boundary(after, !inc);
    const end = this.boundary(before, inc);
    if (end <= first) return [];
    budget.spend(end - first);
    return this.dates.slice(first, end);
  }

  *iterateWindow({ after, before, inc }: QueryWindow, budget: CandidateBudget = new CandidateBudget()): Generator<Temporal.ZonedDateTime> {
    const end = before ? this.boundary(before, inc) : this.dates.length;
    for (let index = this.boundary(after, !inc); index < end; index++) {
      budget.spend();
      yield this.dates[index]!;
    }
  }

  after(after: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null {
    const value = this.dates[this.boundary(after, !inc)] ?? null;
    if (value) budget?.spend();
    return value;
  }

  before(before: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null {
    const value = this.dates[this.boundary(before, inc) - 1] ?? null;
    if (value) budget?.spend();
    return value;
  }

  occursAt(instant: Temporal.Instant, budget?: CandidateBudget): boolean {
    return this.after(instant, true, budget)?.epochNanoseconds === instant.epochNanoseconds;
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
