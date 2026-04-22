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
