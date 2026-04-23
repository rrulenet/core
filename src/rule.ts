/**
 * Rule normalization, parsing, and serialization helpers.
 *
 * This entrypoint exposes the low-level functions that turn compat-style rule
 * options into engine-ready specifications and back into RFC strings.
 *
 * @module
 */
export {
  buildRuleSpec,
  buildRuleSpecFromResolvedTemporalOptions,
  normalizeOptions,
} from './internal/normalize.ts';
export type { ResolvedTemporalOptions } from './internal/normalize.ts';
export { parseRuleString } from './internal/parse.ts';
export { optionsToString } from './internal/serialize.ts';
export type { RuleSpec, RuleFrequency, SourceQuery } from './internal/spec.ts';
