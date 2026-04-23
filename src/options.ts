/**
 * Compat-oriented option types shared by the engine and adapters.
 *
 * This entrypoint exposes the option model, weekday helpers, and frequency
 * enum used by the classic rule representation.
 *
 * @module
 */
export {
  Frequency,
  type ByMonth,
  type ByWeekday,
  type Options,
  type QueryMethods,
  type Skip,
} from './internal/options.ts';
export { ALL_WEEKDAYS, Weekday } from './internal/weekday.ts';
export type { WeekdayStr } from './internal/weekday.ts';
