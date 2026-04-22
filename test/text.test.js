import test from 'node:test';
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';

import { SetAlgebra } from '../dist/index.mjs';
import { datetime, Frequency, RRule } from './support/compat.js';
import { getToTextLocale, listToTextLocales, registerToTextLocale } from '../dist/text.mjs';

function supportsCalendar(calendar) {
  try {
    const probe = Temporal.ZonedDateTime.from('2000-01-01T00:00:00+00:00[UTC]').withCalendar(calendar);
    void probe.year;
    void probe.monthCode;
    void probe.day;
    return true;
  } catch {
    return false;
  }
}

test('text: daily rule renders basic text', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every day');
  assert.equal(rule.isFullyConvertibleToText(), true);
});

test('text: can include dtstart in output', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });

  assert.equal(rule.toText({ includeDtstart: true }), 'every day starting from April 14, 2026');
});

test('text: can exclude timezone abbreviation in output', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    dtstart: datetime(2025, 1, 1, 8, 0, 0),
  });

  assert.equal(rule.toText({ excludeTzAbbreviation: true }), 'every week on Wednesday at 8 AM');
});

test('text: weekly rule inherits weekday and local time from dtstart', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    tzid: 'UTC',
    dtstart: datetime(2026, 1, 1, 10, 30, 0),
  });

  assert.equal(rule.toText(), 'every week on Thursday at 10:30 AM UTC');
});

test('text: weekly rule inherits dtstart minutes when byminute is omitted', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.SU],
    byhour: [12],
    tzid: 'UTC',
    dtstart: datetime(2026, 1, 1, 10, 30, 0),
  });

  assert.equal(rule.toText(), 'every week on Sunday at 12:30 PM UTC');
});

test('text: daily rules render multiple hours', () => {
  const rule = new RRule({
    freq: Frequency.DAILY,
    byhour: [10, 12, 17],
    tzid: 'UTC',
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every day at 10 AM, 12 PM, and 5 PM UTC');
});

test('text: hourly rules can render minute-only selectors', () => {
  const rule = new RRule({
    freq: Frequency.HOURLY,
    byminute: [15, 45],
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every hour at minute 15 and 45');
  assert.equal(rule.toText({ locale: 'fr' }), 'chaque heure à la minute 15 et 45');
});

test('text: minutely rules can render second-only selectors', () => {
  const rule = new RRule({
    freq: Frequency.MINUTELY,
    bysecond: [10, 20],
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every minute at second 10 and 20');
  assert.equal(rule.toText({ locale: 'fr' }), 'chaque minute à la seconde 10 et 20');
});

test('text: weekly weekday shortcut is recognized', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    dtstart: datetime(2026, 4, 13, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every weekday');
});

test('text: weekly all-days shortcut is recognized', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU],
    dtstart: datetime(2026, 4, 13, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every day');
});

test('text: english ordinal weekday phrasing matches classic single-rule wording', () => {
  const yearly = new RRule({
    freq: Frequency.YEARLY,
    byweekday: [RRule.FR.nth(1)],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });
  const monthly = new RRule({
    freq: Frequency.MONTHLY,
    byweekday: [RRule.TU.nth(-3)],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(yearly.toText(), 'every year on the 1st Friday');
  assert.equal(monthly.toText(), 'every month on the 3rd last Tuesday');
});

test('text: english monthly monthday phrasing keeps classic concise wording', () => {
  const positive = new RRule({
    freq: Frequency.MONTHLY,
    bymonthday: [4],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });
  const negative = new RRule({
    freq: Frequency.MONTHLY,
    bymonthday: [-4],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(positive.toText(), 'every month on the 4th');
  assert.equal(negative.toText(), 'every month on the 4th last');
});

test('text: english weekly monthday phrasing keeps classic concise wording', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    bymonthday: [3, 10, 17, 24],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every week on the 3rd, 10th, 17th, and 24th');
});

test('text: integer byweekday renders like classic weekly wording', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: 0,
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every week on Monday');
});

test('text: named-timezone weekly rule stays readable in classic wording', () => {
  const rule = RRule.fromString('DTSTART;TZID=America/New_York:20220601T000000\nRRULE:INTERVAL=1;FREQ=WEEKLY;BYDAY=MO');

  assert.equal(rule.toText(), 'every week on Monday');
});

test('text: spring-forward wall time keeps requested local display', () => {
  const rule = RRule.fromString(
    'DTSTART;TZID=America/New_York:20250309T023000\nRRULE:FREQ=YEARLY;BYHOUR=2;BYMINUTE=30',
  );

  assert.equal(rule.toText(), 'every year at 2:30 AM EDT');
});

test('text: yearly byyearday renders explicitly', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    byyearday: [100],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every year on the 100th day of the year');
  assert.equal(rule.toText({ locale: 'fr' }), 'chaque année le 100e jour de l\'année');
});

test('text: yearly byweekno renders explicitly', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    byweekno: [20],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every year in week 20');
  assert.equal(rule.toText({ locale: 'fr' }), 'chaque année pendant la semaine 20');
});

test('text: monthly bysetpos renders instance wording', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    byweekday: [RRule.MO, RRule.WE],
    bysetpos: [2],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every month on Monday and Wednesday on the 2nd instance');
  assert.equal(rule.toText({ locale: 'fr' }), 'chaque mois le lundi et le mercredi à la 2e occurrence');
});

test('text: yearly bymonthday uses day-of-month wording', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    bymonth: 5,
    bymonthday: [1, 15],
    dtstart: datetime(2026, 5, 1, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every year in May on the 1st and 15th day of the month');
  assert.equal(rule.toText({ locale: 'fr' }), 'chaque année en mai le 1er et le 15e jour du mois');
});

test('text: french locale uses accented month names', () => {
  const rule = new RRule({
    freq: Frequency.YEARLY,
    bymonth: [2, 8, 12],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(rule.toText({ locale: 'fr' }), 'chaque année en février, août et décembre');
});

test('text: until is rendered as a long date', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    tzid: 'UTC',
    dtstart: datetime(2012, 1, 1, 0, 0, 0),
    until: datetime(2012, 11, 10, 0, 0, 0),
  });

  assert.equal(rule.toText(), 'every week on Sunday until November 10, 2012');
});

test('text: minutely rules render singular and plural intervals', () => {
  const singular = new RRule({
    freq: Frequency.MINUTELY,
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });
  const plural = new RRule({
    freq: Frequency.MINUTELY,
    interval: 2,
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });

  assert.equal(singular.toText(), 'every minute');
  assert.equal(plural.toText(), 'every 2 minutes');
});

test('text: interval phrasing stays concise for hourly monthly and yearly rules', () => {
  const hourly = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=HOURLY');
  const everyFourHours = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:INTERVAL=4;FREQ=HOURLY');
  const monthly = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=MONTHLY');
  const everySixMonths = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:INTERVAL=6;FREQ=MONTHLY');
  const yearly = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=YEARLY');

  assert.equal(hourly.toText(), 'every hour');
  assert.equal(everyFourHours.toText(), 'every 4 hours');
  assert.equal(monthly.toText(), 'every month');
  assert.equal(everySixMonths.toText(), 'every 6 months');
  assert.equal(yearly.toText(), 'every year');
});

test('text: weekly default weekday and interval wording stay readable', () => {
  const weekly = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=WEEKLY');
  const everyTwoWeeks = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:INTERVAL=2;FREQ=WEEKLY');

  assert.equal(weekly.toText(), 'every week on Sunday');
  assert.equal(everyTwoWeeks.toText(), 'every 2 weeks on Sunday');
});

test('text: weekly text can include explicit week-start metadata', () => {
  const withWeekday = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.WE],
    wkst: RRule.SU,
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  });
  const withNumeric = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO],
    wkst: 1,
    dtstart: datetime(2026, 4, 13, 9, 0, 0),
  });

  assert.equal(withWeekday.toText(), 'every week on Monday and Wednesday at 9 AM UTC week starts on Sunday');
  assert.equal(withNumeric.toText({ locale: 'fr' }), 'chaque semaine le lundi à 09:00 UTC semaine commençant le mardi');
});

test('text: set algebra falls back cleanly when include or exclude text is empty', () => {
  const silent = {
    all() {
      return [];
    },
    between() {
      return [];
    },
    after() {
      return null;
    },
    before() {
      return null;
    },
    toText() {
      return '';
    },
    isFullyConvertibleToText() {
      return true;
    },
  };
  const included = {
    ...silent,
    toText() {
      return 'named inclusion';
    },
  };
  const excluded = {
    ...silent,
    toText() {
      return 'named exclusion';
    },
  };

  assert.equal(SetAlgebra.difference(included, silent).toText(), 'named inclusion');
  assert.equal(SetAlgebra.difference(silent, excluded).toText(), 'named exclusion');
});

test('text: yearly and weekly long-tail english cases match classic wording', () => {
  const yearlyOrdinal = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=YEARLY;BYDAY=+13FR');
  const dailyMinute = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=30');
  const weeklyHours = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=10,16');
  const weeklyHoursMinutes = RRule.fromString('DTSTART;TZID=America/New_York:20250601T000000\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH;BYHOUR=9,15;BYMINUTE=30');

  assert.equal(yearlyOrdinal.toText(), 'every year on the 13th Friday');
  assert.equal(dailyMinute.toText(), 'every day at 5:30 PM EDT');
  assert.equal(weeklyHours.toText(), 'every week on Monday and Wednesday at 10 AM and 4 PM EDT');
  assert.equal(weeklyHoursMinutes.toText(), 'every week on Tuesday and Thursday at 9:30 AM and 3:30 PM EDT');
});

test('text: rscale and skip are mentioned explicitly', () => {
  const rule = new RRule({
    freq: Frequency.MONTHLY,
    count: 2,
    dtstart: datetime(2025, 1, 31, 8, 0, 0),
    rscale: 'GREGORIAN',
    skip: 'BACKWARD',
  });

  assert.equal(rule.toText(), 'every month at 8 AM UTC for 2 times (RSCALE=GREGORIAN;SKIP=BACKWARD)');
  assert.equal(rule.isFullyConvertibleToText(), false);
});

test('text: non-gregorian rscale rules stay readable', { skip: !supportsCalendar('hebrew') || !supportsCalendar('indian') || !supportsCalendar('chinese') }, () => {
  const hebrew = RRule.fromString(
    'DTSTART;TZID=UTC:20240210T000000\nRRULE:RSCALE=HEBREW;SKIP=OMIT;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=2',
  );
  const chinese = RRule.fromString(
    'DTSTART;VALUE=DATE:20130210\nRRULE:RSCALE=CHINESE;FREQ=YEARLY;COUNT=2',
  );
  const indian = RRule.fromString(
    'DTSTART;TZID=UTC:20240321T090000\nRRULE:RSCALE=INDIAN;FREQ=DAILY;BYYEARDAY=1;COUNT=2',
  );

  assert.equal(hebrew.toText(), 'every year in 5L on the 1st day of the month for 2 times (RSCALE=HEBREW;SKIP=OMIT)');
  assert.equal(chinese.toText(), 'every year for 2 times (RSCALE=CHINESE)');
  assert.equal(indian.toText(), 'every day on the 1st day of the year at 9 AM UTC for 2 times (RSCALE=INDIAN)');
});

test('text: french locale renders rule text', () => {
  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.WE],
    count: 2,
    tzid: 'UTC',
    dtstart: datetime(2026, 4, 13, 9, 30, 0),
  });

  assert.equal(rule.toText({ locale: 'fr' }), 'chaque semaine le lundi et le mercredi à 09:30 UTC pendant 2 occurrences');
});

test('text: locale registry can extend an existing locale without forking the renderer', () => {
  registerToTextLocale('fr-net', {
    weekdayShortcutPhrase: () => 'tous les jours ouvrés',
    countLimitPhrase: (count) => `sur ${count} ${count === 1 ? 'occurrence' : 'occurrences'}`,
  }, 'fr');

  const rule = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    count: 2,
    dtstart: datetime(2026, 4, 13, 0, 0, 0),
  });

  assert.equal(rule.toText({ locale: 'fr-net' }), 'tous les jours ouvrés sur 2 occurrences');
  assert.equal(getToTextLocale('fr-net').customSource, 'source personnalisée');
  assert.equal(listToTextLocales().includes('fr-net'), true);
});


test('text: built-in locale registry includes additional shipped locales', () => {
  const locales = listToTextLocales();
  for (const code of ['ar', 'de', 'es', 'fr', 'he', 'hi', 'yue-hant', 'zh-hans']) {
    assert.equal(locales.includes(code), true);
  }
});

test('text: built-in locales render representative basic phrases', () => {
  const daily = new RRule({
    freq: Frequency.DAILY,
    byhour: [10, 12, 17],
    tzid: 'UTC',
    dtstart: datetime(2026, 4, 14, 0, 0, 0),
  });
  const weekday = new RRule({
    freq: Frequency.WEEKLY,
    byweekday: [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR],
    dtstart: datetime(2026, 4, 13, 0, 0, 0),
  });

  assert.equal(daily.toText({ locale: 'de' }), 'jeden Tag um 10 Uhr, 12 Uhr und 17 Uhr UTC');
  assert.equal(weekday.toText({ locale: 'de' }), 'jeden Werktag');

  assert.equal(daily.toText({ locale: 'es' }), 'cada día a las 10, 12 y 17 UTC');
  assert.equal(weekday.toText({ locale: 'es' }), 'cada día laborable');

  assert.equal(daily.toText({ locale: 'hi' }), 'हर दिन 10 AM, 12 PM, और 5 PM पर UTC');
  assert.equal(weekday.toText({ locale: 'hi' }), 'हर कार्यदिवस');

  assert.equal(daily.toText({ locale: 'yue-Hant' }), '每日 喺 10時、12時同17時 UTC');
  assert.equal(weekday.toText({ locale: 'yue-Hant' }), '每個平日');

  assert.equal(daily.toText({ locale: 'ar' }), 'كل يوم عند 10 و12 و17 UTC');
  assert.equal(weekday.toText({ locale: 'ar' }), 'كل يوم عمل');

  assert.equal(daily.toText({ locale: 'he' }), 'כל יום בשעה 10, 12 ו-17 UTC');
  assert.equal(weekday.toText({ locale: 'he' }), 'כל יום חול');

  assert.equal(daily.toText({ locale: 'zh-Hans' }), '每日 在 10时、12时和17时 UTC');
  assert.equal(weekday.toText({ locale: 'zh-Hans' }), '每个工作日');
});

test('text: built-in locales render representative advanced phrases', () => {
  const yearly = new RRule({
    freq: Frequency.YEARLY,
    byyearday: [100],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });
  const set = new RRule({
    freq: Frequency.MONTHLY,
    byweekday: [RRule.MO, RRule.WE],
    bysetpos: [2],
    dtstart: datetime(2026, 1, 1, 0, 0, 0),
  });

  assert.equal(yearly.toText({ locale: 'de' }), 'jedes Jahr am 100. Tag des Jahres');
  assert.equal(set.toText({ locale: 'de' }), 'jeden Monat am Montag und Mittwoch am 2. Vorkommen');

  assert.equal(yearly.toText({ locale: 'es' }), 'cada año en el 100º día del año');
  assert.equal(set.toText({ locale: 'es' }), 'cada mes en lunes y miércoles en la 2º ocasión');

  assert.equal(yearly.toText({ locale: 'hi' }), 'हर साल साल के 100वां दिन');
  assert.equal(set.toText({ locale: 'hi' }), 'हर महीना सोमवार और बुधवार को 2वां बार');

  assert.equal(yearly.toText({ locale: 'yue-Hant' }), '每年 喺每年第 第100 日');
  assert.equal(set.toText({ locale: 'yue-Hant' }), '每月 喺 星期一和星期三 喺第 第2 次');

  assert.equal(yearly.toText({ locale: 'ar' }), 'كل سنة في اليوم 100 من السنة');
  assert.equal(set.toText({ locale: 'ar' }), 'كل شهر في الاثنين والأربعاء في 2 مرة');

  assert.equal(yearly.toText({ locale: 'he' }), 'כל שנה ביום 100 של השנה');
  assert.equal(set.toText({ locale: 'he' }), 'כל חודש ב יום שני ויום רביעי ב2 פעם');

  assert.equal(yearly.toText({ locale: 'zh-Hans' }), '每年 在每年的 第100 日');
  assert.equal(set.toText({ locale: 'zh-Hans' }), '每月 在 星期一和星期三 在第 第2 次');
});
