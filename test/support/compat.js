import { Temporal } from 'temporal-polyfill';

import {
  buildRuleSpecFromResolvedTemporalOptions,
  groomRuleOptions,
  normalizeOptions,
  parseRRuleStringComponents,
  QueryMethodsSource,
} from '../../dist/index.mjs';
import { RuleSource, DateSource, SetEngine } from '../../dist/engine.mjs';
import { parseRuleString, optionsToString as serializeOptions } from '../../dist/rule.mjs';
import {
  dateToZdt,
  toInstant,
  zdtToDate,
} from '../../dist/time.mjs';
import {
  describeSetExpression,
  EN_LOCALE,
  isFullyConvertibleToText,
  isSetExpressionFullyConvertible,
  ruleToText,
  textMergeDescriptorForOptions,
} from '../../dist/text.mjs';

import { parseText as parseNaturalLanguageText } from './parseText.js';

export const Frequency = {
  YEARLY: 0,
  MONTHLY: 1,
  WEEKLY: 2,
  DAILY: 3,
  HOURLY: 4,
  MINUTELY: 5,
  SECONDLY: 6,
};

const ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export class Weekday {
  constructor(weekday, n) {
    this.weekday = weekday;
    this.n = n;
    if (n === 0) throw new Error("Can't create weekday with n == 0");
  }

  static fromStr(str) {
    return WEEKDAY_INSTANCES[ORDER.indexOf(str)];
  }

  nth(n) {
    return this.n === n ? this : new Weekday(this.weekday, n);
  }

  equals(other) {
    return this.weekday === other.weekday && this.n === other.n;
  }

  getJsWeekday() {
    return this.weekday === 6 ? 0 : this.weekday + 1;
  }

  toString() {
    const token = ORDER[this.weekday];
    if (this.n === undefined) return token;
    return `${this.n > 0 ? '+' : ''}${this.n}${token}`;
  }
}

export const ALL_WEEKDAYS = [...ORDER];
export const WEEKDAY_INSTANCES = ORDER.map((_, index) => new Weekday(index));

export function datetime(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(Date.UTC(0, month - 1, day, hour, minute, second, 0));
  date.setUTCFullYear(year);
  return date;
}

export function cloneDate(date) {
  return new Date(date.getTime());
}

export function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

export class RRule {
  static FREQUENCIES = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'];
  static YEARLY = Frequency.YEARLY;
  static MONTHLY = Frequency.MONTHLY;
  static WEEKLY = Frequency.WEEKLY;
  static DAILY = Frequency.DAILY;
  static HOURLY = Frequency.HOURLY;
  static MINUTELY = Frequency.MINUTELY;
  static SECONDLY = Frequency.SECONDLY;
  static MO = WEEKDAY_INSTANCES[0];
  static TU = WEEKDAY_INSTANCES[1];
  static WE = WEEKDAY_INSTANCES[2];
  static TH = WEEKDAY_INSTANCES[3];
  static FR = WEEKDAY_INSTANCES[4];
  static SA = WEEKDAY_INSTANCES[5];
  static SU = WEEKDAY_INSTANCES[6];

  constructor(options = {}, noCache = false) {
    this.origOptions = { ...options };
    this.options = normalizeOptions(options);
    this.spec = buildRuleSpecFromResolvedTemporalOptions(this.options);
    this.source = new RuleSource(this.spec);
    this.noCache = noCache;
    this.allCache = null;
  }

  static parseString(str) {
    return parseRuleString(str);
  }

  static fromString(str) {
    return new RRule(RRule.parseString(str));
  }

  static parseText(text, language) {
    return parseNaturalLanguageText(text, language);
  }

  static fromText(text, language) {
    return new RRule(RRule.parseText(text, language));
  }

  static fromSpec(spec, config = {}) {
    const rule = new RRule({}, config.noCache ?? false);
    rule.origOptions = { ...(config.origOptions ?? {}) };
    rule.options = config.normalizedOptions ?? normalizeOptions(rule.origOptions);
    rule.spec = spec;
    rule.source = new RuleSource(spec);
    rule.noCache = config.noCache ?? false;
    rule.allCache = null;
    return rule;
  }

  static optionsToString(options) {
    return serializeOptions(options);
  }

  all(iterator) {
    const values = !this.noCache && this.allCache
      ? this.allCache
      : this.source.all().map(zdtToDate);
    if (!this.noCache && !this.allCache) this.allCache = values;
    return iterator ? applyIterator(values, iterator) : values;
  }

  between(after, before, inc = false, iterator) {
    if (!isValidDate(after) || !isValidDate(before)) throw new Error('Invalid date');
    const values = this.source.between(toInstant(after), toInstant(before), inc).map(zdtToDate);
    return iterator ? applyIterator(values, iterator) : values;
  }

  before(date, inc = false) {
    if (!isValidDate(date)) throw new Error('Invalid date');
    const value = this.source.before(toInstant(date), inc);
    return value ? zdtToDate(value) : null;
  }

  after(date, inc = false) {
    if (!isValidDate(date)) throw new Error('Invalid date');
    const value = this.source.after(toInstant(date), inc);
    return value ? zdtToDate(value) : null;
  }

  count() {
    return this.all().length;
  }

  toString() {
    return serializeOptions(this.origOptions);
  }

  toText(options) {
    return ruleToText(this.options, options);
  }

  isFullyConvertibleToText(options) {
    return isFullyConvertibleToText(this.options, options);
  }

  textMergeDescriptor(options) {
    return textMergeDescriptorForOptions(this.options, options);
  }

  clone() {
    return new RRule(
      {
        ...this.origOptions,
        dtstart: this.origOptions.dtstart ? cloneDate(this.origOptions.dtstart) : null,
        until: this.origOptions.until ? cloneDate(this.origOptions.until) : null,
      },
      this.noCache,
    );
  }

  toJSON() {
    return {
      ...this.origOptions,
      dtstart: this.origOptions.dtstart ? cloneDate(this.origOptions.dtstart) : null,
      until: this.origOptions.until ? cloneDate(this.origOptions.until) : null,
    };
  }

  getSpec() {
    return this.spec;
  }

  getSource() {
    return this.source;
  }
}

export class RRuleSet extends RRule {
  constructor(noCache = false) {
    super({}, noCache);
    this._rrule = [];
    this._rdate = [];
    this._exrule = [];
    this._exdate = [];
    this.engine = new SetEngine({ kind: 'union', expressions: [] });
    this.setNoCache = noCache;
    this.setAllCache = null;
  }

  static fromExpression(expression, config = {}) {
    const set = new RRuleSet(config.noCache ?? false);
    if (config.dtstart !== undefined) set._dtstart = config.dtstart ? cloneDate(config.dtstart) : null;
    if (config.tzid !== undefined) set._tzid = config.tzid;
    for (const rule of config.includeRules ?? []) set._rrule.push(rule);
    for (const rule of config.excludeRules ?? []) set._exrule.push(rule);
    for (const date of config.rdates ?? []) set._rdate.push(cloneDate(date));
    for (const date of config.exdates ?? []) set._exdate.push(cloneDate(date));
    set._rdate.sort((a, b) => a.getTime() - b.getTime());
    set._exdate.sort((a, b) => a.getTime() - b.getTime());
    set.engine = new SetEngine(expression);
    set.setAllCache = null;
    return set;
  }

  dtstart(value) {
    if (value !== undefined) this._dtstart = value ? cloneDate(value) : null;
    if (this._dtstart !== undefined) return this._dtstart ? cloneDate(this._dtstart) : null;
    const fallback = this._rrule.find((rule) => rule.origOptions.dtstart)?.origOptions.dtstart;
    return fallback ? cloneDate(fallback) : null;
  }

  tzid(value) {
    if (value !== undefined) this._tzid = value;
    if (this._tzid !== undefined) return this._tzid;
    return this._rrule.find((rule) => rule.origOptions.tzid)?.origOptions.tzid;
  }

  buildExpression() {
    const tzid = this._tzid ?? 'UTC';
    const include = [
      ...this._rrule.map((rule) => ({ kind: 'source', source: new QueryMethodsSource(rule) })),
    ];
    if (this._rdate.length) {
      include.push({
        kind: 'source',
        source: new DateSource(this._rdate.map((date) => dateToZdt(date, tzid))),
      });
    }

    const exclude = [
      ...this._exrule.map((rule) => ({ kind: 'source', source: new QueryMethodsSource(rule) })),
    ];
    if (this._exdate.length) {
      exclude.push({
        kind: 'source',
        source: new DateSource(this._exdate.map((date) => dateToZdt(date, tzid))),
      });
    }

    const includeExpression = { kind: 'union', expressions: include };
    if (!exclude.length) return includeExpression;
    return {
      kind: 'difference',
      include: includeExpression,
      exclude: { kind: 'union', expressions: exclude },
    };
  }

  sync() {
    this.engine = new SetEngine(this.buildExpression());
    this.setAllCache = null;
  }

  all(iterator) {
    const values = !this.setNoCache && this.setAllCache
      ? this.setAllCache
      : this.engine.all().map(zdtToDate);
    if (!this.setNoCache && !this.setAllCache) this.setAllCache = values;
    return iterator ? applyIterator(values, iterator) : values;
  }

  between(after, before, inc = false, iterator) {
    if (!isValidDate(after) || !isValidDate(before)) throw new Error('Invalid date');
    const values = this.engine
      .between(Temporal.Instant.from(after.toISOString()), Temporal.Instant.from(before.toISOString()), inc)
      .map(zdtToDate);
    return iterator ? applyIterator(values, iterator) : values;
  }

  before(date, inc = false) {
    if (!isValidDate(date)) throw new Error('Invalid date');
    const value = this.engine.before(Temporal.Instant.from(date.toISOString()), inc);
    return value ? zdtToDate(value) : null;
  }

  after(date, inc = false) {
    if (!isValidDate(date)) throw new Error('Invalid date');
    const value = this.engine.after(Temporal.Instant.from(date.toISOString()), inc);
    return value ? zdtToDate(value) : null;
  }

  count() {
    return this.all().length;
  }

  rrule(rule) {
    if (!(rule instanceof RRule)) throw new TypeError(`${String(rule)} is not RRule instance`);
    if (!this._rrule.some((entry) => entry.toString() === rule.toString())) {
      this._rrule.push(rule);
      this.sync();
    }
  }

  exrule(rule) {
    if (!(rule instanceof RRule)) throw new TypeError(`${String(rule)} is not RRule instance`);
    if (!this._exrule.some((entry) => entry.toString() === rule.toString())) {
      this._exrule.push(rule);
      this.sync();
    }
  }

  rdate(date) {
    if (!(date instanceof Date)) throw new TypeError(`${String(date)} is not Date instance`);
    if (!this._rdate.some((entry) => entry.getTime() === date.getTime())) {
      this._rdate.push(cloneDate(date));
      this._rdate.sort((a, b) => a.getTime() - b.getTime());
      this.sync();
    }
  }

  exdate(date) {
    if (!(date instanceof Date)) throw new TypeError(`${String(date)} is not Date instance`);
    if (!this._exdate.some((entry) => entry.getTime() === date.getTime())) {
      this._exdate.push(cloneDate(date));
      this._exdate.sort((a, b) => a.getTime() - b.getTime());
      this.sync();
    }
  }

  rrules() {
    return this._rrule.map((rule) => rule.clone());
  }

  exrules() {
    return this._exrule.map((rule) => rule.clone());
  }

  rdates() {
    return this._rdate.map(cloneDate);
  }

  exdates() {
    return this._exdate.map(cloneDate);
  }

  valueOf() {
    const parts = [];
    const isDtstartSingleton =
      !this._rrule.length &&
      !this._exrule.length &&
      !this._exdate.length &&
      !!this._dtstart &&
      this._rdate.length === 1 &&
      this._rdate[0].getTime() === this._dtstart.getTime();

    if (!this._rrule.length && this._dtstart) {
      parts.push(renderDateProperty('DTSTART', this._dtstart, this.tzid() ?? undefined));
    }

    for (const rule of this._rrule) parts.push(...rule.toString().split('\n'));
    for (const rule of this._exrule) {
      parts.push(
        ...rule
          .toString()
          .split('\n')
          .map((line) => line.replace(/^RRULE:/, 'EXRULE:'))
          .filter((line) => !line.startsWith('DTSTART')),
      );
    }

    if (this._rdate.length && !isDtstartSingleton) {
      parts.push(renderDateList('RDATE', this._rdate, this.tzid() ?? undefined));
    }
    if (this._exdate.length) {
      parts.push(renderDateList('EXDATE', this._exdate, this.tzid() ?? undefined));
    }
    return parts;
  }

  toString() {
    return this.valueOf().join('\n');
  }

  toText(options) {
    return describeSetExpression(this.buildExpression(), options);
  }

  isFullyConvertibleToText(options) {
    return isSetExpressionFullyConvertible(this.buildExpression(), options);
  }

  clone() {
    const clone = new RRuleSet(this.setNoCache);
    if (this._dtstart !== undefined) clone.dtstart(this._dtstart);
    if (this._tzid !== undefined) clone.tzid(this._tzid);
    this._rrule.forEach((rule) => clone.rrule(rule.clone()));
    this._exrule.forEach((rule) => clone.exrule(rule.clone()));
    this._rdate.forEach((date) => clone.rdate(date));
    this._exdate.forEach((date) => clone.exdate(date));
    return clone;
  }

  toJSON() {
    const json = {};
    if (this._dtstart !== undefined) json.dtstart = this._dtstart ? cloneDate(this._dtstart) : null;
    if (this._tzid !== undefined) json.tzid = this._tzid;
    if (this._rrule.length) json.rrule = this._rrule.map((rule) => rule.toJSON());
    if (this._exrule.length) json.exrule = this._exrule.map((rule) => rule.toJSON());
    if (this._rdate.length) json.rdate = this._rdate.map(cloneDate);
    if (this._exdate.length) json.exdate = this._exdate.map(cloneDate);
    return json;
  }
}

export function rrulestr(input, rawOptions = {}) {
  const {
    noCache,
    sawInlineDtstart,
    dtstart,
    tzid,
    rruleValues,
    exruleValues,
    rdateValues,
    exdateValues,
    rawOptions: options,
  } = parseRRuleStringComponents(input, rawOptions);

  const hasSet =
    options.forceset ||
    rruleValues.length > 1 ||
    exruleValues.length > 0 ||
    rdateValues.length > 0 ||
    exdateValues.length > 0;

  if (!rruleValues.length && !exruleValues.length && !rdateValues.length && !exdateValues.length) {
    const set = new RRuleSet(noCache);
    if (tzid) set.tzid(tzid);
    if (dtstart) {
      set.dtstart(dtstart);
      set.rdate(dtstart);
    }
    return set;
  }

  if (!hasSet) {
    const value = rruleValues[0] ?? {};
    return new RRule(
      groomRuleOptions(
        value,
        dtstart,
        tzid,
        options.count,
        options.until,
        Boolean(options.dtstart && !options.tzid && tzid && !sawInlineDtstart),
      ),
      noCache,
    );
  }

  const set = new RRuleSet(noCache);
  if (tzid) set.tzid(tzid);
  if (dtstart) set.dtstart(dtstart);

  for (const value of rruleValues) {
    set.rrule(
      new RRule(
        groomRuleOptions(
          value,
          dtstart,
          tzid,
          options.count,
          options.until,
          Boolean(options.dtstart && !options.tzid && tzid && !sawInlineDtstart),
        ),
        noCache,
      ),
    );
  }

  for (const value of exruleValues) {
    set.exrule(
      new RRule(
        groomRuleOptions(
          value,
          dtstart,
          tzid,
          options.count,
          options.until,
          Boolean(options.dtstart && !options.tzid && tzid && !sawInlineDtstart),
        ),
        noCache,
      ),
    );
  }

  for (const value of rdateValues) set.rdate(value);
  for (const value of exdateValues) set.exdate(value);
  if (options.compatible && dtstart) set.rdate(dtstart);
  return set;
}

function applyIterator(values, iterator) {
  const accepted = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!iterator(value, index)) break;
    accepted.push(value);
  }
  return accepted;
}

function toCompactUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

function renderDateProperty(kind, date, tzid) {
  const isUtc = !tzid || tzid.toUpperCase() === 'UTC';
  const header = isUtc ? `${kind}:` : `${kind};TZID=${tzid}:`;
  if (isUtc) return `${header}${toCompactUtc(date)}`;
  return `${header}${dateToZdt(date, tzid).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15)}`;
}

function renderDateList(kind, dates, tzid) {
  const isUtc = !tzid || tzid.toUpperCase() === 'UTC';
  const header = isUtc ? `${kind}:` : `${kind};TZID=${tzid}:`;
  if (isUtc) return `${header}${dates.map((date) => toCompactUtc(date)).join(',')}`;
  return `${header}${dates
    .map((date) => dateToZdt(date, tzid).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '').slice(0, 15))
    .join(',')}`;
}
