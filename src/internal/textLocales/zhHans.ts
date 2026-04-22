import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_ZH = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'] as const;
const MONTH_NAMES_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'] as const;
const WORKWEEK_ZH = ['星期一', '星期二', '星期三', '星期四', '星期五'] as const;

function formatChineseWallTime(hour: number, minute: number, second: number) { if (second) return `${hour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`; if (minute) return `${hour}:${String(minute).padStart(2, '0')}`; return `${hour}时`; }

export const ZH_HANS_LOCALE: ToTextLocaleDefinition = {
  intl: 'zh-Hans', weekdayNames: WEEKDAY_NAMES_ZH, monthNames: MONTH_NAMES_ZH, conjunction: '和', customSource: '自定义来源', customSet: '自定义集合', weekdayShortcut: '工作日',
  everyUnit(freq, interval) { switch (freq) { case Frequency.YEARLY: return interval === 1 ? '每年' : `每 ${interval} 年`; case Frequency.MONTHLY: return interval === 1 ? '每月' : `每 ${interval} 月`; case Frequency.WEEKLY: return interval === 1 ? '每周' : `每 ${interval} 周`; case Frequency.DAILY: return interval === 1 ? '每日' : `每 ${interval} 日`; case Frequency.HOURLY: return interval === 1 ? '每小时' : `每 ${interval} 小时`; case Frequency.MINUTELY: return interval === 1 ? '每分钟' : `每 ${interval} 分钟`; case Frequency.SECONDLY: return interval === 1 ? '每秒' : `每 ${interval} 秒`; } },
  ordinalNumber(value) { if (value < 0) return value === -1 ? '最后' : `倒数第${Math.abs(value)}`; return `第${value}`; },
  formatWeekday(value) { const name = WEEKDAY_NAMES_ZH[value.weekday]!; if (!value.ordinal) return name; if (value.ordinal === -1) return `最后${name}`; return `第${value.ordinal}${name}`; },
  formatWallTime: formatChineseWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'zh-Hans'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'zh-Hans'); },
  countPhrase(count) { return `${count} 次`; }, dateCountPhrase(count, additional) { return additional ? `${count} 个额外日期` : `${count} 个日期`; }, sourceDateCountPhrase(count) { return `${count} 个日期`; }, withAdditionalDates(count) { return `附加 ${count} 个日期`; }, excludingDates(count) { return `排除 ${count} 个日期`; }, excludingPhrase(value) { return `排除 ${value}`; }, exceptPhrase(value) { return `除 ${value}`; }, weekPhrase(value) { return `在第 ${value} 周`; }, monthsPhrase(months) { return `在 ${months}`; }, weekdaysPhrase(weekdays) { return `在 ${joinList(weekdays, '和', 'zh-Hans')}`; }, monthDaysPhrase(days) { return `在每月的 ${joinList(days, '和', 'zh-Hans')} 日`; }, yearDaysPhrase(days) { return `在每年的 ${joinList(days, '和', 'zh-Hans')} 日`; }, timePhrase(times) { return `在 ${times}`; }, minutesPhrase(minutes) { return `在第 ${minutes} 分钟`; }, secondsPhrase(seconds) { return `在第 ${seconds} 秒`; }, untilPhrase(date) { return `直到 ${date}`; }, countLimitPhrase(count) { return `共 ${count} 次`; }, dtstartPhrase(date) { return `从 ${date} 开始`; }, setPosPhrase(instances, count) { return `在第 ${instances} ${count === 1 ? '次' : '次'}`; }, weekStartsOnPhrase(weekday) { return `每周始于 ${weekday}`; }, rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; }, mergeWeekdayShortcut(weekdays) { const sorted = [...weekdays].sort(); const expected = [...WORKWEEK_ZH].sort(); return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? '工作日' : null; }, weekdayShortcutPhrase() { return '每个工作日'; },
};
