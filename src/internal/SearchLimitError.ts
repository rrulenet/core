/** A query exhausted its search budget without establishing completeness. */
export class RecurrenceSearchLimitError extends Error {
  readonly code = 'RECURRENCE_SEARCH_LIMIT';

  constructor() {
    super('Recurrence search exceeded its candidate budget; absence of further occurrences has not been established');
    this.name = 'RecurrenceSearchLimitError';
  }
}

/** Candidate evaluations available to a single query, including its component sources. */
export class CandidateBudget {
  constructor(private remaining = 1_000_000) {
    if (!Number.isSafeInteger(remaining) || remaining < 1) throw new RangeError('Candidate budget must be a positive safe integer');
  }

  spend(count = 1): void {
    this.remaining -= count;
    if (this.remaining < 0) throw new RecurrenceSearchLimitError();
  }
}
