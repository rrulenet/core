import { Temporal } from 'temporal-polyfill';
import type { SourceQuery } from './spec.ts';

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
    if (stamp > 8_640_000_000_000_000_000_000n) return null;
    return Temporal.Instant.fromEpochNanoseconds(stamp).toZonedDateTimeISO(this.zone);
  }

  after(after: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    const distance = after.epochNanoseconds - this.spec.start.epochNanoseconds;
    if (distance < 0n) return this.value(0n);
    const index = distance / this.step + (inc && distance % this.step === 0n ? 0n : 1n);
    return this.value(index);
  }

  before(before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    let stamp = before.epochNanoseconds - (inc ? 0n : 1n);
    if (this.spec.until && stamp > this.spec.until.epochNanoseconds) stamp = this.spec.until.epochNanoseconds;
    const distance = stamp - this.spec.start.epochNanoseconds;
    if (distance < 0n || this.spec.count === 0) return null;
    let index = distance / this.step;
    if (this.spec.count !== undefined && index >= BigInt(this.spec.count)) index = BigInt(this.spec.count - 1);
    return this.value(index);
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    const out: Temporal.ZonedDateTime[] = [];
    let value = this.after(after, inc);
    while (value && (inc ? value.epochNanoseconds <= before.epochNanoseconds : value.epochNanoseconds < before.epochNanoseconds)) {
      out.push(value);
      value = this.after(value.toInstant(), false);
    }
    return out;
  }

  occursAt(instant: Temporal.Instant): boolean {
    return this.after(instant, true)?.epochNanoseconds === instant.epochNanoseconds;
  }

  all(): Temporal.ZonedDateTime[] {
    const out: Temporal.ZonedDateTime[] = [];
    const limit = this.spec.count ?? (this.spec.until ? Infinity : 513);
    for (let index = 0; index < limit; index++) {
      const value = this.value(BigInt(index));
      if (!value) break;
      out.push(value);
    }
    return out;
  }

  toTextDescription(): string {
    return `every ${this.spec.every} elapsed from ${this.spec.start.toString()}`;
  }

  isFullyConvertibleToText(): boolean { return false; }
}
