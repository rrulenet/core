import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_IT = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'] as const;
const MONTH_NAMES_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'] as const;
const WORKWEEK_IT = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì'] as const;

function formatItalianWallTime(hour: number, minute: number, second: number) {
  if (second) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function italianOrdinal(value: number) {
  if (value < 0) return value === -1 ? 'ultimo' : `${Math.abs(value)}º ultimo`;
  return `${value}º`;
}

export const IT_LOCALE: ToTextLocaleDefinition = {
  intl: 'it-IT',
  weekdayNames: WEEKDAY_NAMES_IT,
  monthNames: MONTH_NAMES_IT,
  conjunction: 'e',
  customSource: 'sorgente personalizzata',
  customSet: 'insieme personalizzato',
  weekdayShortcut: 'giorno feriale',
  everyUnit(freq, interval) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'ogni anno' : `ogni ${interval} anni`;
      case Frequency.MONTHLY: return interval === 1 ? 'ogni mese' : `ogni ${interval} mesi`;
      case Frequency.WEEKLY: return interval === 1 ? 'ogni settimana' : `ogni ${interval} settimane`;
      case Frequency.DAILY: return interval === 1 ? 'ogni giorno' : `ogni ${interval} giorni`;
      case Frequency.HOURLY: return interval === 1 ? 'ogni ora' : `ogni ${interval} ore`;
      case Frequency.MINUTELY: return interval === 1 ? 'ogni minuto' : `ogni ${interval} minuti`;
      case Frequency.SECONDLY: return interval === 1 ? 'ogni secondo' : `ogni ${interval} secondi`;
    }
  },
  ordinalNumber: italianOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_IT[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `ultimo ${name}`;
    return `${italianOrdinal(value.ordinal)} ${name}`;
  },
  formatWallTime: formatItalianWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'it-IT'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'it-IT'); },
  countPhrase(count) { return `${count} ${count === 1 ? 'volta' : 'volte'}`; },
  dateCountPhrase(count, additional) { return additional ? `${count} ${count === 1 ? 'data aggiuntiva' : 'date aggiuntive'}` : `${count} ${count === 1 ? 'data' : 'date'}`; },
  sourceDateCountPhrase(count) { return `${count} ${count === 1 ? 'data' : 'date'}`; },
  withAdditionalDates(count) { return `con ${count} ${count === 1 ? 'data aggiuntiva' : 'date aggiuntive'}`; },
  excludingDates(count) { return `escludendo ${count} ${count === 1 ? 'data' : 'date'}`; },
  excludingPhrase(value) { return `escludendo ${value}`; },
  exceptPhrase(value) { return `tranne ${value}`; },
  weekPhrase(value) { return `nella settimana ${value}`; },
  monthsPhrase(months) { return `in ${months}`; },
  weekdaysPhrase(weekdays) { return `di ${joinList(weekdays, 'e', 'it-IT')}`; },
  monthDaysPhrase(days) { return `il ${joinList(days, 'e', 'it-IT')} giorno del mese`; },
  yearDaysPhrase(days) { return `il ${joinList(days, 'e', 'it-IT')} giorno dell'anno`; },
  timePhrase(times) { return `alle ${times}`; },
  minutesPhrase(minutes) { return `al minuto ${minutes}`; },
  secondsPhrase(seconds) { return `al secondo ${seconds}`; },
  untilPhrase(date) { return `fino al ${date}`; },
  countLimitPhrase(count) { return `per ${count} ${count === 1 ? 'volta' : 'volte'}`; },
  dtstartPhrase(date) { return `a partire da ${date}`; },
  setPosPhrase(instances, count) {
    const feminine = instances === 'ultimo' ? 'ultima' : instances.replaceAll('º', 'ª');
    return `alla ${feminine} ${count === 1 ? 'occorrenza' : 'occorrenze'}`;
  },
  weekStartsOnPhrase(weekday) { return `settimana che inizia di ${weekday}`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_IT].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'giorni feriali' : null;
  },
  weekdayShortcutPhrase() { return 'ogni giorno feriale'; },
};
