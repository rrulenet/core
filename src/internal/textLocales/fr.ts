import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, frenchOrdinal, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const MONTH_NAMES_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;
const WORKWEEK_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] as const;

function formatFrenchWallTime(hour: number, minute: number, second: number) {
  if (second) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export const FR_LOCALE: ToTextLocaleDefinition = {
  intl: 'fr-FR',
  weekdayNames: WEEKDAY_NAMES_FR,
  monthNames: MONTH_NAMES_FR,
  conjunction: 'et',
  customSource: 'source personnalisée',
  customSet: 'ensemble personnalisé',
  weekdayShortcut: 'ouvré',
  everyUnit(freq: Frequency, interval: number) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'chaque année' : `toutes les ${interval} années`;
      case Frequency.MONTHLY: return interval === 1 ? 'chaque mois' : `tous les ${interval} mois`;
      case Frequency.WEEKLY: return interval === 1 ? 'chaque semaine' : `toutes les ${interval} semaines`;
      case Frequency.DAILY: return interval === 1 ? 'chaque jour' : `tous les ${interval} jours`;
      case Frequency.HOURLY: return interval === 1 ? 'chaque heure' : `toutes les ${interval} heures`;
      case Frequency.MINUTELY: return interval === 1 ? 'chaque minute' : `toutes les ${interval} minutes`;
      case Frequency.SECONDLY: return interval === 1 ? 'chaque seconde' : `toutes les ${interval} secondes`;
    }
  },
  ordinalNumber: frenchOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_FR[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `dernier ${name}`;
    return `${frenchOrdinal(value.ordinal)} ${name}`;
  },
  formatWallTime: formatFrenchWallTime,
  formatDate(date: Date, tzid: string) {
    return formatLocalizedDate(date, tzid, 'fr-FR');
  },
  tzAbbreviation(date: Date, tzid: string) {
    return formatTzAbbreviation(date, tzid, 'fr-FR');
  },
  countPhrase(count: number) {
    return `${count} ${count === 1 ? 'occurrence' : 'occurrences'}`;
  },
  dateCountPhrase(count: number, additional: boolean) {
    if (additional) return `${count} ${count === 1 ? 'date supplémentaire' : 'dates supplémentaires'}`;
    return `${count} ${count === 1 ? 'date' : 'dates'}`;
  },
  sourceDateCountPhrase(count: number) {
    return `${count} ${count === 1 ? 'date' : 'dates'}`;
  },
  withAdditionalDates(count: number) {
    return `avec ${count} ${count === 1 ? 'date supplémentaire' : 'dates supplémentaires'}`;
  },
  excludingDates(count: number) {
    return `en excluant ${count} ${count === 1 ? 'date' : 'dates'}`;
  },
  excludingPhrase(value: string) {
    return `en excluant ${value}`;
  },
  exceptPhrase(value: string) {
    return `sauf ${value}`;
  },
  weekPhrase(value: string) {
    return `pendant la semaine ${value}`;
  },
  monthsPhrase(months: string) {
    return `en ${months}`;
  },
  weekdaysPhrase(weekdays: string[]) {
    if (weekdays.length === 1 && weekdays[0] === 'jours ouvrés') return 'les jours ouvrés';
    return weekdays.length === 1
      ? `le ${weekdays[0]}`
      : joinList(weekdays.map((weekday) => `le ${weekday}`), 'et', 'fr-FR');
  },
  monthDaysPhrase(days: string[]) {
    return days.length === 1
      ? `le ${days[0]} jour du mois`
      : `${joinList(days.map((day) => `le ${day}`), 'et', 'fr-FR')} jour du mois`;
  },
  yearDaysPhrase(days: string[]) {
    return days.length === 1
      ? `le ${days[0]} jour de l'année`
      : `${joinList(days.map((day) => `le ${day}`), 'et', 'fr-FR')} jour de l'année`;
  },
  timePhrase(times: string) {
    return `à ${times}`;
  },
  minutesPhrase(minutes: string) {
    return `à la minute ${minutes}`;
  },
  secondsPhrase(seconds: string) {
    return `à la seconde ${seconds}`;
  },
  untilPhrase(date: string) {
    return `jusqu'au ${date}`;
  },
  countLimitPhrase(count: number) {
    return `pendant ${count} ${count === 1 ? 'occurrence' : 'occurrences'}`;
  },
  dtstartPhrase(date: string) {
    return `à partir du ${date}`;
  },
  setPosPhrase(instances: string, count: number) {
    return `à la ${instances} ${count === 1 ? 'occurrence' : 'occurrences'}`;
  },
  weekStartsOnPhrase(weekday: string) {
    return `semaine commençant le ${weekday}`;
  },
  rscalePhrase(rscale: string, skip?: string | null) {
    return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`;
  },
  mergeWeekdayShortcut(weekdays: string[]) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_FR].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'jours ouvrés' : null;
  },
  weekdayShortcutPhrase() {
    return 'chaque jour ouvré';
  },
};
