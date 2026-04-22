import { Frequency } from '../options.ts';
import { englishOrdinal, formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
const MONTH_NAMES_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const;
const WORKWEEK_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'] as const;

function formatGermanWallTime(hour: number, minute: number, second: number) {
  if (second) return `${hour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} Uhr`;
  if (minute) return `${hour}:${String(minute).padStart(2, '0')} Uhr`;
  return `${hour} Uhr`;
}

export const DE_LOCALE: ToTextLocaleDefinition = {
  intl: 'de-DE',
  weekdayNames: WEEKDAY_NAMES_DE,
  monthNames: MONTH_NAMES_DE,
  conjunction: 'und',
  customSource: 'benutzerdefinierte Quelle',
  customSet: 'benutzerdefinierte Menge',
  weekdayShortcut: 'Werktag',
  everyUnit(freq: Frequency, interval: number) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'jedes Jahr' : `alle ${interval} Jahre`;
      case Frequency.MONTHLY: return interval === 1 ? 'jeden Monat' : `alle ${interval} Monate`;
      case Frequency.WEEKLY: return interval === 1 ? 'jede Woche' : `alle ${interval} Wochen`;
      case Frequency.DAILY: return interval === 1 ? 'jeden Tag' : `alle ${interval} Tage`;
      case Frequency.HOURLY: return interval === 1 ? 'jede Stunde' : `alle ${interval} Stunden`;
      case Frequency.MINUTELY: return interval === 1 ? 'jede Minute' : `alle ${interval} Minuten`;
      case Frequency.SECONDLY: return interval === 1 ? 'jede Sekunde' : `alle ${interval} Sekunden`;
    }
  },
  ordinalNumber(value) {
    if (value < 0) return value === -1 ? 'letzte' : `${Math.abs(value)}. letzte`;
    return `${value}.`;
  },
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_DE[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `letzten ${name}`;
    return `${value.ordinal}. ${name}`;
  },
  formatWallTime: formatGermanWallTime,
  formatDate(date, tzid) {
    return formatLocalizedDate(date, tzid, 'de-DE');
  },
  tzAbbreviation(date, tzid) {
    return formatTzAbbreviation(date, tzid, 'de-DE');
  },
  countPhrase(count) { return `${count} ${count === 1 ? 'Mal' : 'Mal'}`; },
  dateCountPhrase(count, additional) { return additional ? `mit ${count} ${count === 1 ? 'zusätzlichen Datum' : 'zusätzlichen Daten'}` : `${count} ${count === 1 ? 'Datum' : 'Daten'}`; },
  sourceDateCountPhrase(count) { return `${count} ${count === 1 ? 'Datum' : 'Daten'}`; },
  withAdditionalDates(count) { return `mit ${count} ${count === 1 ? 'zusätzlichen Datum' : 'zusätzlichen Daten'}`; },
  excludingDates(count) { return `ohne ${count} ${count === 1 ? 'Datum' : 'Daten'}`; },
  excludingPhrase(value) { return `ohne ${value}`; },
  exceptPhrase(value) { return `außer ${value}`; },
  weekPhrase(value) { return `in Kalenderwoche ${value}`; },
  monthsPhrase(months) { return `im ${months}`; },
  weekdaysPhrase(weekdays) { return `am ${joinList(weekdays, 'und', 'de-DE')}`; },
  monthDaysPhrase(days) { return `am ${joinList(days, 'und', 'de-DE')} Tag des Monats`; },
  yearDaysPhrase(days) { return `am ${joinList(days, 'und', 'de-DE')} Tag des Jahres`; },
  timePhrase(times) { return `um ${times}`; },
  minutesPhrase(minutes) { return `in Minute ${minutes}`; },
  secondsPhrase(seconds) { return `in Sekunde ${seconds}`; },
  untilPhrase(date) { return `bis ${date}`; },
  countLimitPhrase(count) { return `für ${count} ${count === 1 ? 'Mal' : 'Mal'}`; },
  dtstartPhrase(date) { return `ab ${date}`; },
  setPosPhrase(instances, count) { return `am ${instances} ${count === 1 ? 'Vorkommen' : 'Vorkommen'}`; },
  weekStartsOnPhrase(weekday) { return `Woche beginnt am ${weekday}`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_DE].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'Werktag' : null;
  },
  weekdayShortcutPhrase() { return 'jeden Werktag'; },
};
