/**
 * Text rendering helpers for rules and set expressions.
 *
 * This entrypoint contains the locale registry and the low-level helpers used
 * to describe recurrence rules and composed schedules in natural language.
 *
 * @module
 */
export {
  describeSetExpression,
  getToTextLocale,
  isFullyConvertibleToText,
  isSetExpressionFullyConvertible,
  listToTextLocales,
  registerToTextLocale,
  ruleToText,
  textMergeDescriptorForOptions,
  textMergeDescriptorForRuleBase,
} from './internal/text.ts';
export type {
  TextMergeDescriptor,
  ToTextLocaleDefinition,
  ToTextOptions,
} from './internal/text.ts';
export { EN_LOCALE } from './internal/textLocales/en.ts';
