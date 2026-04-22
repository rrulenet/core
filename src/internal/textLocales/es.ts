import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
const MONTH_NAMES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
const WORKWEEK_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'] as const;

function formatSpanishWallTime(hour: number, minute: number, second: number) {
  if (second) return `${hour}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  if (minute) return `${hour}:${String(minute).padStart(2, '0')}`;
  return `${hour}`;
}

export const ES_LOCALE: ToTextLocaleDefinition = {
  intl: 'es-ES', weekdayNames: WEEKDAY_NAMES_ES, monthNames: MONTH_NAMES_ES, conjunction: 'y', customSource: 'fuente personalizada', customSet: 'conjunto personalizado', weekdayShortcut: 'día laborable',
  everyUnit(freq, interval) { switch (freq) { case Frequency.YEARLY: return interval === 1 ? 'cada año' : `cada ${interval} años`; case Frequency.MONTHLY: return interval === 1 ? 'cada mes' : `cada ${interval} meses`; case Frequency.WEEKLY: return interval === 1 ? 'cada semana' : `cada ${interval} semanas`; case Frequency.DAILY: return interval === 1 ? 'cada día' : `cada ${interval} días`; case Frequency.HOURLY: return interval === 1 ? 'cada hora' : `cada ${interval} horas`; case Frequency.MINUTELY: return interval === 1 ? 'cada minuto' : `cada ${interval} minutos`; case Frequency.SECONDLY: return interval === 1 ? 'cada segundo' : `cada ${interval} segundos`; } },
  ordinalNumber(value) { if (value < 0) return value === -1 ? 'último' : `${Math.abs(value)}º último`; return `${value}º`; },
  formatWeekday(value) { const name = WEEKDAY_NAMES_ES[value.weekday]!; if (!value.ordinal) return name; if (value.ordinal === -1) return `último ${name}`; return `${value.ordinal}º ${name}`; },
  formatWallTime: formatSpanishWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'es-ES'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'es-ES'); },
  countPhrase(count) { return `${count} ${count === 1 ? 'vez' : 'veces'}`; },
  dateCountPhrase(count, additional) { return additional ? `${count} ${count === 1 ? 'fecha adicional' : 'fechas adicionales'}` : `${count} ${count === 1 ? 'fecha' : 'fechas'}`; },
  sourceDateCountPhrase(count) { return `${count} ${count === 1 ? 'fecha' : 'fechas'}`; },
  withAdditionalDates(count) { return `con ${count} ${count === 1 ? 'fecha adicional' : 'fechas adicionales'}`; },
  excludingDates(count) { return `excluyendo ${count} ${count === 1 ? 'fecha' : 'fechas'}`; },
  excludingPhrase(value) { return `excluyendo ${value}`; },
  exceptPhrase(value) { return `excepto ${value}`; },
  weekPhrase(value) { return `en la semana ${value}`; },
  monthsPhrase(months) { return `en ${months}`; },
  weekdaysPhrase(weekdays) { return `en ${joinList(weekdays, 'y', 'es-ES')}`; },
  monthDaysPhrase(days) { return `en el ${joinList(days, 'y', 'es-ES')} día del mes`; },
  yearDaysPhrase(days) { return `en el ${joinList(days, 'y', 'es-ES')} día del año`; },
  timePhrase(times) { return `a las ${times}`; },
  minutesPhrase(minutes) { return `en el minuto ${minutes}`; },
  secondsPhrase(seconds) { return `en el segundo ${seconds}`; },
  untilPhrase(date) { return `hasta ${date}`; },
  countLimitPhrase(count) { return `durante ${count} ${count === 1 ? 'vez' : 'veces'}`; },
  dtstartPhrase(date) { return `a partir de ${date}`; },
  setPosPhrase(instances, count) { return `en la ${instances} ${count === 1 ? 'ocasión' : 'ocasiones'}`; },
  weekStartsOnPhrase(weekday) { return `semana comenzando en ${weekday}`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) { const sorted = [...weekdays].sort(); const expected = [...WORKWEEK_ES].sort(); return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'día laborable' : null; },
  weekdayShortcutPhrase() { return 'cada día laborable'; },
};
