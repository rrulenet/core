import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_RU = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'] as const;
const MONTH_NAMES_RU = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'] as const;
const WORKWEEK_RU = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу'] as const;

function formatRussianWallTime(hour: number, minute: number, second: number) {
  if (second) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function russianOrdinal(value: number) {
  if (value < 0) return value === -1 ? 'последний' : `${Math.abs(value)}-й с конца`;
  return `${value}-й`;
}

export const RU_LOCALE: ToTextLocaleDefinition = {
  intl: 'ru-RU',
  weekdayNames: WEEKDAY_NAMES_RU,
  monthNames: MONTH_NAMES_RU,
  conjunction: 'и',
  customSource: 'пользовательский источник',
  customSet: 'пользовательский набор',
  weekdayShortcut: 'рабочий день',
  everyUnit(freq, interval) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'каждый год' : `каждые ${interval} лет`;
      case Frequency.MONTHLY: return interval === 1 ? 'каждый месяц' : `каждые ${interval} месяца`;
      case Frequency.WEEKLY: return interval === 1 ? 'каждую неделю' : `каждые ${interval} недели`;
      case Frequency.DAILY: return interval === 1 ? 'каждый день' : `каждые ${interval} дня`;
      case Frequency.HOURLY: return interval === 1 ? 'каждый час' : `каждые ${interval} часа`;
      case Frequency.MINUTELY: return interval === 1 ? 'каждую минуту' : `каждые ${interval} минуты`;
      case Frequency.SECONDLY: return interval === 1 ? 'каждую секунду' : `каждые ${interval} секунды`;
    }
  },
  ordinalNumber: russianOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_RU[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `последний ${name}`;
    return `${russianOrdinal(value.ordinal)} ${name}`;
  },
  formatWallTime: formatRussianWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'ru-RU'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'ru-RU'); },
  countPhrase(count) { return `${count} раз`; },
  dateCountPhrase(count, additional) { return additional ? `${count} дополнительных дат` : `${count} дат`; },
  sourceDateCountPhrase(count) { return `${count} дат`; },
  withAdditionalDates(count) { return `с ${count} дополнительными датами`; },
  excludingDates(count) { return `исключая ${count} дат`; },
  excludingPhrase(value) { return `исключая ${value}`; },
  exceptPhrase(value) { return `кроме ${value}`; },
  weekPhrase(value) { return `на неделе ${value}`; },
  monthsPhrase(months) { return `в ${months}`; },
  weekdaysPhrase(weekdays) { return `в ${joinList(weekdays, 'и', 'ru-RU')}`; },
  monthDaysPhrase(days) { return `в ${joinList(days, 'и', 'ru-RU')} день месяца`; },
  yearDaysPhrase(days) { return `в ${joinList(days, 'и', 'ru-RU')} день года`; },
  timePhrase(times) { return `в ${times}`; },
  minutesPhrase(minutes) { return `на минуте ${minutes}`; },
  secondsPhrase(seconds) { return `на секунде ${seconds}`; },
  untilPhrase(date) { return `до ${date}`; },
  countLimitPhrase(count) { return `${count} раз`; },
  dtstartPhrase(date) { return `начиная с ${date}`; },
  setPosPhrase(instances) {
    const neuter = instances === 'последний' ? 'последнее' : instances.replace(/-й$/, '-е');
    return `в ${neuter} вхождение`;
  },
  weekStartsOnPhrase(weekday) { return `неделя начинается в ${weekday}`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_RU].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'рабочие дни' : null;
  },
  weekdayShortcutPhrase() { return 'каждый рабочий день'; },
};
