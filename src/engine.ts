/**
 * Low-level recurrence engine primitives.
 *
 * This entrypoint exposes source implementations and the set engine used to
 * expand, combine, and query recurrence expressions.
 *
 * @module
 */
export { DateSource } from './internal/DateSource.ts';
export { RuleSource } from './internal/RuleSource.ts';
export { SetEngine } from './internal/SetEngine.ts';
export type { SetExpression } from './internal/SetEngine.ts';
export type { RuleSpec, SourceQuery } from './internal/spec.ts';
