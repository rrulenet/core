import { AR_LOCALE } from './ar.ts';
import { DE_LOCALE } from './de.ts';
import { EN_LOCALE } from './en.ts';
import { ES_LOCALE } from './es.ts';
import { FR_LOCALE } from './fr.ts';
import { HE_LOCALE } from './he.ts';
import { HI_LOCALE } from './hi.ts';
import { YUE_HANT_LOCALE } from './yueHant.ts';
import { ZH_HANS_LOCALE } from './zhHans.ts';
import type { ResolvedTextLocale, ToTextLocaleDefinition, ToTextOptions } from './shared.ts';

const localeRegistry = new Map<string, ToTextLocaleDefinition>([
  ['ar', AR_LOCALE],
  ['de', DE_LOCALE],
  ['en', EN_LOCALE],
  ['es', ES_LOCALE],
  ['fr', FR_LOCALE],
  ['he', HE_LOCALE],
  ['hi', HI_LOCALE],
  ['yue-hant', YUE_HANT_LOCALE],
  ['zh-hans', ZH_HANS_LOCALE],
]);

function normalizeLocaleKey(locale?: string | null) {
  return (locale ?? 'en').toLowerCase();
}

function cloneLocaleDefinition(locale: ToTextLocaleDefinition): ToTextLocaleDefinition {
  return {
    ...locale,
    weekdayNames: [...locale.weekdayNames],
    monthNames: [...locale.monthNames],
  };
}

export function getToTextLocale(locale = 'en'): ToTextLocaleDefinition {
  const exact = localeRegistry.get(normalizeLocaleKey(locale));
  if (exact) return cloneLocaleDefinition(exact);

  const [base] = normalizeLocaleKey(locale).split('-');
  const baseLocale = base ? localeRegistry.get(base) : null;
  if (baseLocale) return cloneLocaleDefinition(baseLocale);

  return cloneLocaleDefinition(EN_LOCALE);
}

export function listToTextLocales(): string[] {
  return [...localeRegistry.keys()].sort();
}

export function registerToTextLocale(
  locale: string,
  overrides: Partial<ToTextLocaleDefinition>,
  baseLocale = 'en',
): ToTextLocaleDefinition {
  const base = getToTextLocale(baseLocale);
  const next: ToTextLocaleDefinition = {
    ...base,
    ...overrides,
    weekdayNames: overrides.weekdayNames ?? base.weekdayNames,
    monthNames: overrides.monthNames ?? base.monthNames,
  };
  localeRegistry.set(normalizeLocaleKey(locale), next);
  return cloneLocaleDefinition(next);
}

export function resolveLocale(textOptions: ToTextOptions = {}): ResolvedTextLocale {
  const code = normalizeLocaleKey(textOptions.locale);
  return {
    code,
    ...getToTextLocale(code),
  };
}
