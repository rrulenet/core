import { Temporal } from 'temporal-polyfill';
import { CandidateBudget } from './SearchLimitError.ts';
import type { QueryWindow, RuleSpec, SourceQuery } from './spec.ts';

const SECOND = 1_000_000_000n;
const DAY = 86_400n * SECOND;
const MAX_INSTANT = 8_640_000_000_000_000_000_000n;

/** Rank UTC daily and weekly COUNT rules using their repeating dates and clock selectors. */
export class UtcCalendarCountSource implements SourceQuery {
  static from(spec: RuleSpec): UtcCalendarCountSource | null {
    const { dtstart, interval, count } = spec;
    if ((spec.freq !== 'DAILY' && spec.freq !== 'WEEKLY') || spec.tzid !== 'UTC' ||
        dtstart.timeZoneId !== 'UTC' || dtstart.calendarId !== 'iso8601' ||
        !Number.isSafeInteger(interval) || interval < 1 || !Number.isSafeInteger(count) || count! < 0 ||
        spec.until || spec.rscale || spec.byeaster !== undefined ||
        [spec.bymonth, spec.bymonthday, spec.byyearday, spec.byweekno, spec.bysetpos].some(values => values?.length)) return null;

    const [hours, minutes, seconds] = [spec.byhour ?? [dtstart.hour], spec.byminute ?? [dtstart.minute], spec.bysecond ?? [dtstart.second]]
      .map(values => [...new Set(values)].sort((a, b) => a - b)) as [number[], number[], number[]];
    if ([hours, minutes, seconds].some((values, index) => !values.length ||
      values.some(value => !Number.isInteger(value) || value < 0 || value >= (index === 0 ? 24 : 60)))) return null;

    const startWeekday = dtstart.dayOfWeek - 1;
    const weekdays = spec.byweekday?.map(({ weekday }) => weekday);
    if (weekdays?.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return null;
    const start = dtstart.epochNanoseconds;
    const startOfDay = start - BigInt(dtstart.hour * 3600 + dtstart.minute * 60 + dtstart.second) * SECOND;
    const step = BigInt(interval) * DAY;

    if (spec.freq === 'WEEKLY') {
      if (!Number.isInteger(spec.wkst) || spec.wkst < 0 || spec.wkst > 6) return null;
      const startOffset = (startWeekday - spec.wkst + 7) % 7;
      const days = [...new Set(weekdays?.length ? weekdays : [startWeekday])]
        .map(day => (day - spec.wkst + 7) % 7).sort((a, b) => a - b).map(day => BigInt(day) * DAY);
      return new UtcCalendarCountSource(startOfDay - BigInt(startOffset) * DAY, 7n * step, days, hours, minutes, seconds, start, BigInt(count!));
    }

    const length = !weekdays?.length || interval % 7 === 0 ? 1 : 7;
    const days = Array.from({ length }, (_, index) => index)
      .filter(index => !weekdays?.length || weekdays.includes((startWeekday + index * (interval % 7)) % 7))
      .map(index => BigInt(index) * step);
    // A change to reachability should be made in the general engine as well.
    return days.length ? new UtcCalendarCountSource(startOfDay, step * BigInt(length), days, hours, minutes, seconds, start, BigInt(count!)) : null;
  }

  private readonly slots: number;
  private readonly cycleSize: bigint;
  private readonly first: bigint;
  private readonly end: bigint;

  private constructor(
    private readonly origin: bigint,
    private readonly cycle: bigint,
    private readonly days: bigint[],
    private readonly hours: number[],
    private readonly minutes: number[],
    private readonly seconds: number[],
    start: bigint,
    count: bigint,
  ) {
    this.slots = hours.length * minutes.length * seconds.length;
    this.cycleSize = BigInt(days.length * this.slots);
    this.first = this.firstIndex(start);
    const countEnd = this.first + count;
    const timeEnd = this.firstIndex(MAX_INSTANT + 1n);
    this.end = countEnd < timeEnd ? countEnd : timeEnd;
  }

  private offsetAt(rank: number): bigint {
    const clock = rank % this.slots;
    const hour = this.hours[Math.floor(clock / (this.minutes.length * this.seconds.length))]!;
    const minute = this.minutes[Math.floor(clock / this.seconds.length) % this.minutes.length]!;
    const second = this.seconds[clock % this.seconds.length]!;
    return this.days[Math.floor(rank / this.slots)]! + BigInt(hour * 3600 + minute * 60 + second) * SECOND;
  }

  private firstIndex(stamp: bigint): bigint {
    const delta = stamp - this.origin;
    if (delta <= 0n) return 0n;
    const cycle = delta / this.cycle;
    const remainder = delta % this.cycle;
    let lo = 0, hi = Number(this.cycleSize);
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (this.offsetAt(mid) < remainder) lo = mid + 1;
      else hi = mid;
    }
    return cycle * this.cycleSize + BigInt(lo);
  }

  private at(index: bigint): Temporal.ZonedDateTime {
    const stamp = this.origin + index / this.cycleSize * this.cycle + this.offsetAt(Number(index % this.cycleSize));
    return Temporal.Instant.fromEpochNanoseconds(stamp).toZonedDateTimeISO('UTC');
  }

  after(bound: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null {
    let index = this.firstIndex(bound.epochNanoseconds + (inc ? 0n : 1n));
    if (index < this.first) index = this.first;
    if (index >= this.end) return null;
    budget?.spend();
    return this.at(index);
  }

  before(bound: Temporal.Instant, inc: boolean, budget?: CandidateBudget): Temporal.ZonedDateTime | null {
    let index = this.firstIndex(bound.epochNanoseconds + (inc ? 1n : 0n)) - 1n;
    if (index >= this.end) index = this.end - 1n;
    if (index < this.first) return null;
    budget?.spend();
    return this.at(index);
  }

  private range(first: bigint, end: bigint, budget: CandidateBudget): Temporal.ZonedDateTime[] {
    if (first < this.first) first = this.first;
    if (end > this.end) end = this.end;
    if (first >= end) return [];
    budget.spend(Number(end - first));
    const out: Temporal.ZonedDateTime[] = [];
    for (let index = first; index < end; index++) out.push(this.at(index));
    return out;
  }

  between(after: Temporal.Instant, before: Temporal.Instant, inc: boolean, budget = new CandidateBudget()): Temporal.ZonedDateTime[] {
    return this.range(this.firstIndex(after.epochNanoseconds + (inc ? 0n : 1n)),
      this.firstIndex(before.epochNanoseconds + (inc ? 1n : 0n)), budget);
  }

  *iterateWindow({ after, before, inc }: QueryWindow, budget = new CandidateBudget()): Generator<Temporal.ZonedDateTime> {
    let index = this.firstIndex(after.epochNanoseconds + (inc ? 0n : 1n));
    if (index < this.first) index = this.first;
    const end = before ? this.firstIndex(before.epochNanoseconds + (inc ? 1n : 0n)) : this.end;
    for (; index < end && index < this.end; index++) {
      budget.spend();
      yield this.at(index);
    }
  }

  all(budget = new CandidateBudget()): Temporal.ZonedDateTime[] {
    return this.range(this.first, this.end, budget);
  }

  *iterate(budget = new CandidateBudget()): Generator<Temporal.ZonedDateTime> {
    for (let index = this.first; index < this.end; index++) {
      budget.spend();
      yield this.at(index);
    }
  }
}
