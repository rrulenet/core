/**
 * Shared high-level exports for the `@rrulenet/core` recurrence engine.
 *
 * This entrypoint exposes RFC-oriented parsing helpers, set composition,
 * low-level engine types, and text rendering helpers that are shared by the
 * higher-level `@rrulenet/rrule` and `@rrulenet/recurrence` packages.
 *
 * @module
 */
export { SetAlgebra, QueryMethodsSource } from './SetAlgebra.ts';
export { groomRuleOptions, parseRRuleStringComponents } from './rrulestr.ts';
export type { RRuleStrOptions } from './rrulestr.ts';
export { DateSource } from './internal/DateSource.ts';
export { buildRuleSpecFromResolvedTemporalOptions, normalizeOptions } from './internal/normalize.ts';
export type { ResolvedTemporalOptions } from './internal/normalize.ts';
export type { RuleSpec, SourceQuery } from './internal/spec.ts';
export type { SetExpression } from './internal/SetEngine.ts';
export { getToTextLocale, listToTextLocales, registerToTextLocale } from './internal/text.ts';
export type { ToTextLocaleDefinition, ToTextOptions } from './internal/text.ts';
