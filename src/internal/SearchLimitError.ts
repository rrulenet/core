/** A query exhausted its search budget without establishing completeness. */
export class RecurrenceSearchLimitError extends Error {
  readonly code = 'RECURRENCE_SEARCH_LIMIT';

  constructor() {
    super('Recurrence search exceeded its candidate budget; absence of further occurrences has not been established');
    this.name = 'RecurrenceSearchLimitError';
  }
}
