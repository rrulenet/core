import type { CandidateBudget } from './SearchLimitError.ts';
import type { QueryWindow, SourceQuery } from './spec.ts';
import { compareByInstant } from './temporal.ts';

export function isEmptyWindow({ after, before, inc }: QueryWindow): boolean {
  if (!before) return false;
  return inc ? after.epochNanoseconds > before.epochNanoseconds : after.epochNanoseconds >= before.epochNanoseconds;
}

export function* iterateWindowWithQueries(source: SourceQuery, { after, before, inc }: QueryWindow, budget: CandidateBudget) {
  if (before) {
    yield* source.between(after, before, inc, budget).slice().sort(compareByInstant);
    return;
  }
  let value = source.after(after, inc, budget);
  while (value) {
    yield value;
    value = source.after(value.toInstant(), false, budget);
  }
}
