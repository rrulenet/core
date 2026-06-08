import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_JA = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'] as const;
const MONTH_NAMES_JA = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] as const;
const WORKWEEK_JA = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日'] as const;

function formatJapaneseWallTime(hour: number, minute: number, second: number) {
  if (second) return `${hour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  if (minute) return `${hour}:${String(minute).padStart(2, '0')}`;
  return `${hour}時`;
}

function japaneseOrdinal(value: number) {
  if (value < 0) return value === -1 ? '最後' : `最後から${Math.abs(value)}番目`;
  return `第${value}`;
}

export const JA_LOCALE: ToTextLocaleDefinition = {
  intl: 'ja-JP',
  weekdayNames: WEEKDAY_NAMES_JA,
  monthNames: MONTH_NAMES_JA,
  conjunction: 'と',
  customSource: 'カスタムソース',
  customSet: 'カスタムセット',
  weekdayShortcut: '平日',
  everyUnit(freq, interval) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? '毎年' : `${interval}年ごと`;
      case Frequency.MONTHLY: return interval === 1 ? '毎月' : `${interval}か月ごと`;
      case Frequency.WEEKLY: return interval === 1 ? '毎週' : `${interval}週間ごと`;
      case Frequency.DAILY: return interval === 1 ? '毎日' : `${interval}日ごと`;
      case Frequency.HOURLY: return interval === 1 ? '毎時' : `${interval}時間ごと`;
      case Frequency.MINUTELY: return interval === 1 ? '毎分' : `${interval}分ごと`;
      case Frequency.SECONDLY: return interval === 1 ? '毎秒' : `${interval}秒ごと`;
    }
  },
  ordinalNumber: japaneseOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_JA[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `最後の${name}`;
    return `${japaneseOrdinal(value.ordinal)}${name}`;
  },
  formatWallTime: formatJapaneseWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'ja-JP'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'ja-JP'); },
  countPhrase(count) { return `${count}回`; },
  dateCountPhrase(count, additional) { return additional ? `${count}個の追加日付` : `${count}個の日付`; },
  sourceDateCountPhrase(count) { return `${count}個の日付`; },
  withAdditionalDates(count) { return `${count}個の追加日付を含む`; },
  excludingDates(count) { return `${count}個の日付を除外`; },
  excludingPhrase(value) { return `${value}を除外`; },
  exceptPhrase(value) { return `${value}を除く`; },
  weekPhrase(value) { return `第${value}週`; },
  monthsPhrase(months) { return `${months}に`; },
  weekdaysPhrase(weekdays) { return `${joinList(weekdays, 'と', 'ja-JP')}に`; },
  monthDaysPhrase(days) { return `毎月${joinList(days, 'と', 'ja-JP')}日に`; },
  yearDaysPhrase(days) { return `毎年${joinList(days, 'と', 'ja-JP')}日に`; },
  timePhrase(times) { return `${times}に`; },
  minutesPhrase(minutes) { return `${minutes}分に`; },
  secondsPhrase(seconds) { return `${seconds}秒に`; },
  untilPhrase(date) { return `${date}まで`; },
  countLimitPhrase(count) { return `${count}回`; },
  dtstartPhrase(date) { return `${date}から開始`; },
  setPosPhrase(instances) { return `${instances}番目の発生`; },
  weekStartsOnPhrase(weekday) { return `週は${weekday}開始`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_JA].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? '平日' : null;
  },
  weekdayShortcutPhrase() { return '毎平日'; },
};
