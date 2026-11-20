import { Temporal } from 'temporal-polyfill';
import type { QueryWindow, SourceQuery } from './spec.ts';
import { CandidateBudget } from './SearchLimitError.ts';

const MAX_INSTANT = 8_640_000_000_000_000_000_000n;

export interface ElapsedSpec {
  start: Temporal.Instant;
  every: string;
  tzid?: string;
  count?: number;
  until?: Temporal.Instant;
}

/** An anchored grid of whole elapsed seconds, independent of display timezone. */
export class ElapsedSource implements SourceQuery {
  readonly seconds: number;
  private readonly step: bigint;
  private readonly zone: string;

  constructor(readonly spec: ElapsedSpec) {
    this.spec = { ...spec, start: Temporal.Instant.from(spec.start.toString()),
      until: spec.until ? Temporal.Instant.from(spec.until.toString()) : undefined };
    if (typeof spec.every !== 'string' || !/^PT/i.test(spec.every)) {
      throw new RangeError('every expects a positive ISO time duration, such as PT30M');
    }
    const duration = Temporal.Duration.from(spec.every);
    const seconds = duration.hours * 3600 + duration.minutes * 60 + duration.seconds;
    if (duration.years || duration.months || duration.weeks || duration.days || duration.milliseconds ||
        duration.microseconds || duration.nanoseconds || !Number.isSafeInteger(seconds) || seconds <= 0) {
      throw new RangeError('every expects a positive duration in whole hours, minutes, or seconds');
    }
    if (spec.count !== undefined && (!Number.isSafeInteger(spec.count) || spec.count < 0)) {
      throw new RangeError('count expects a non-negative safe integer');
    }
    if (spec.count !== undefined && spec.until !== undefined) throw new RangeError('count and until are mutually exclusive');
    this.seconds = seconds;
    this.step = BigInt(seconds) * 1_000_000_000n;
    this.zone = spec.tzid ?? 'UTC';
    spec.start.toZonedDateTimeISO(this.zone);
  }

  private value(index: bigint): Temporal.ZonedDateTime | null {
    if (index < 0n || (this.spec.count !== undefined && index >= BigInt(this.spec.count))) return null;
    const stamp = this.spec.start.epochNanoseconds + index * this.step;
    if (this.spec.until && stamp > this.spec.until.epochNanoseconds) return null;
    if (stamp > MAX_INSTANT) return null;
    return Temporal.Instant.fromEpochNanoseconds(stamp).toZonedDateTimeISO(this.zone);
  }

  private firstIndex(stamp: bigint): bigint {
    const distance = stamp - this.spec.start.epochNanoseconds;
    return distance <= 0n ? 0n : (distance + this.step - 1n) / this.step;
  }

  private lastIndex(stamp: bigint): bigint {
    if (this.spec.until && stamp > this.spec.until.epochNanoseconds) stamp = this.spec.until.epochNanoseconds;
    const distance = stamp - this.spec.start.epochNanoseconds;
    if (distance < 0n || this.spec.count === 0) return -1n;
    const index = distance / this.step;
    return this.spec.count !== undefined && index >= BigInt(this.spec.count) ? BigInt(this.spec.count - 1) : index;
  }

  after(after: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null {
    const value = this.value(this.firstIndex(after.epochNanoseconds + (inc ? 0n : 1n)));
    if (value) budget?.spend();
    return value;
  }

  before(before: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null {
    const value = this.value(this.lastIndex(before.epochNanoseconds - (inc ? 0n : 1n)));
    if (value) budget?.spend();
    return value;
  }

  private range(first: bigint, last: bigint, budget: CandidateBudget): Temporal.ZonedDateTime[] {
    if (last < first) return [];
    budget.spend(Number(last - first + 1n));
    const out: Temporal.ZonedDateTime[] = [];
    for (let index = first; index <= last; index++) out.push(this.value(index)!);
    return out;
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean, budget = new CandidateBudget()): Temporal.ZonedDateTime[] {
    return this.range(this.firstIndex(after.epochNanoseconds + (inc ? 0n : 1n)),
      this.lastIndex(before.epochNanoseconds - (inc ? 0n : 1n)), budget);
  }

  *iterateWindow({ after, before, inc }: QueryWindow, budget = new CandidateBudget()): Generator<Temporal.ZonedDateTime> {
    const last = this.lastIndex(before ? before.epochNanoseconds - (inc ? 0n : 1n) : MAX_INSTANT);
    for (let index = this.firstIndex(after.epochNanoseconds + (inc ? 0n : 1n)); index <= last; index++) {
      budget.spend();
      yield this.value(index)!;
    }
  }

  occursAt(instant: Temporal.Instant, budget?: CandidateBudget): boolean {
    return this.after(instant, true, budget)?.epochNanoseconds === instant.epochNanoseconds;
  }

  all(budget = new CandidateBudget()): Temporal.ZonedDateTime[] {
    let last = this.lastIndex(MAX_INSTANT);
    if (this.spec.count === undefined && !this.spec.until && last > 512n) last = 512n;
    return this.range(0n, last, budget);
  }

  *iterate(budget = new CandidateBudget()): Generator<Temporal.ZonedDateTime> {
    for (let index = 0n; ; index++) {
      const value = this.value(index);
      if (!value) return;
      budget.spend();
      yield value;
    }
  }

  toTextDescription(): string {
    return `every ${this.spec.every} elapsed from ${this.spec.start.toString()}`;
  }

  isFullyConvertibleToText(): boolean { return false; }
}
