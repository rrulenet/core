import { Temporal } from 'temporal-polyfill';
import type { RuleSpec, SourceQuery } from './spec.ts';

const DAY = 86_400_000_000_000n;

// A deliberately narrow rank/select path. UTC ISO daily rules filtered only
// by weekday repeat after at most seven cadence steps. Zoned clocks, date/time
// selectors and positional ranks retain the general calendar implementation.
export class UtcWeekdayCountSource implements Pick<SourceQuery, 'after' | 'before' | 'between'> {
  static from(spec: RuleSpec): UtcWeekdayCountSource | null {
    if (spec.freq !== 'DAILY' || spec.tzid !== 'UTC' || spec.dtstart.calendarId !== 'iso8601' ||
        !Number.isSafeInteger(spec.interval) || spec.interval <= 0 ||
        !Number.isSafeInteger(spec.count) || spec.count! < 0 || spec.until || spec.rscale || spec.byeaster !== undefined ||
        !spec.byweekday?.length || spec.byweekday.some(({ weekday }) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6) ||
        [spec.byhour, spec.byminute, spec.bysecond, spec.bymonth, spec.bymonthday, spec.byyearday,
          spec.byweekno, spec.bysetpos].some(values => values?.length)) return null;

    const length = spec.interval % 7 === 0 ? 1 : 7;
    const step = BigInt(spec.interval) * DAY;
    const allowed = new Set(spec.byweekday.map(({ weekday }) => weekday));
    const offsets = Array.from({ length }, (_, index) => index)
      .filter(index => allowed.has((spec.dtstart.dayOfWeek - 1 + index * (spec.interval % 7)) % 7))
      .map(index => BigInt(index) * step);
    // Preserve the general engine's search-limit behavior for an unreachable
    // filter rather than introducing a different empty-rule contract here.
    return offsets.length ? new UtcWeekdayCountSource(spec.dtstart.epochNanoseconds,
      step * BigInt(length), offsets, BigInt(spec.count!)) : null;
  }

  private constructor(
    private readonly start: bigint,
    private readonly cycle: bigint,
    private readonly offsets: bigint[],
    private readonly count: bigint,
  ) {}

  private firstIndex(bound: Temporal.Instant, strict: boolean): bigint {
    const delta = bound.epochNanoseconds - this.start;
    if (delta < 0n) return 0n;
    let cycle = delta / this.cycle;
    const remainder = delta % this.cycle;
    let slot = this.offsets.findIndex(offset => strict ? offset > remainder : offset >= remainder);
    if (slot < 0) { cycle++; slot = 0; }
    return cycle * BigInt(this.offsets.length) + BigInt(slot);
  }

  private at(index: bigint): Temporal.ZonedDateTime | null {
    if (index < 0n || index >= this.count) return null;
    const length = BigInt(this.offsets.length);
    return Temporal.Instant.fromEpochNanoseconds(this.start + index / length * this.cycle
      + this.offsets[Number(index % length)]!).toZonedDateTimeISO('UTC');
  }

  after(bound: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    return this.at(this.firstIndex(bound, !inc));
  }

  before(bound: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime | null {
    const index = this.firstIndex(bound, inc) - 1n;
    return this.at(index < this.count ? index : this.count - 1n);
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean): Temporal.ZonedDateTime[] {
    if (after.epochNanoseconds > before.epochNanoseconds) return [];
    const end = this.firstIndex(before, inc);
    const limit = end < this.count ? end : this.count;
    const out: Temporal.ZonedDateTime[] = [];
    for (let index = this.firstIndex(after, !inc); index < limit; index++) out.push(this.at(index)!);
    return out;
  }
}
