import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_PT = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'] as const;
const MONTH_NAMES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;
const WORKWEEK_PT = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'] as const;

function formatPortugueseWallTime(hour: number, minute: number, second: number) {
  if (second) return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function portugueseOrdinal(value: number) {
  if (value < 0) return value === -1 ? 'último' : `${Math.abs(value)}º último`;
  return `${value}º`;
}

export const PT_LOCALE: ToTextLocaleDefinition = {
  intl: 'pt-BR',
  weekdayNames: WEEKDAY_NAMES_PT,
  monthNames: MONTH_NAMES_PT,
  conjunction: 'e',
  customSource: 'fonte personalizada',
  customSet: 'conjunto personalizado',
  weekdayShortcut: 'dia útil',
  everyUnit(freq, interval) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'todo ano' : `a cada ${interval} anos`;
      case Frequency.MONTHLY: return interval === 1 ? 'todo mês' : `a cada ${interval} meses`;
      case Frequency.WEEKLY: return interval === 1 ? 'toda semana' : `a cada ${interval} semanas`;
      case Frequency.DAILY: return interval === 1 ? 'todo dia' : `a cada ${interval} dias`;
      case Frequency.HOURLY: return interval === 1 ? 'toda hora' : `a cada ${interval} horas`;
      case Frequency.MINUTELY: return interval === 1 ? 'todo minuto' : `a cada ${interval} minutos`;
      case Frequency.SECONDLY: return interval === 1 ? 'todo segundo' : `a cada ${interval} segundos`;
    }
  },
  ordinalNumber: portugueseOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_PT[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `última ${name}`;
    return `${portugueseOrdinal(value.ordinal)} ${name}`;
  },
  formatWallTime: formatPortugueseWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'pt-BR'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'pt-BR'); },
  countPhrase(count) { return `${count} ${count === 1 ? 'vez' : 'vezes'}`; },
  dateCountPhrase(count, additional) { return additional ? `${count} ${count === 1 ? 'data adicional' : 'datas adicionais'}` : `${count} ${count === 1 ? 'data' : 'datas'}`; },
  sourceDateCountPhrase(count) { return `${count} ${count === 1 ? 'data' : 'datas'}`; },
  withAdditionalDates(count) { return `com ${count} ${count === 1 ? 'data adicional' : 'datas adicionais'}`; },
  excludingDates(count) { return `excluindo ${count} ${count === 1 ? 'data' : 'datas'}`; },
  excludingPhrase(value) { return `excluindo ${value}`; },
  exceptPhrase(value) { return `exceto ${value}`; },
  weekPhrase(value) { return `na semana ${value}`; },
  monthsPhrase(months) { return `em ${months}`; },
  weekdaysPhrase(weekdays) { return `na ${joinList(weekdays, 'e', 'pt-BR')}`; },
  monthDaysPhrase(days) { return `no ${joinList(days, 'e', 'pt-BR')} dia do mes`; },
  yearDaysPhrase(days) { return `no ${joinList(days, 'e', 'pt-BR')} dia do ano`; },
  timePhrase(times) { return `às ${times}`; },
  minutesPhrase(minutes) { return `no minuto ${minutes}`; },
  secondsPhrase(seconds) { return `no segundo ${seconds}`; },
  untilPhrase(date) { return `até ${date}`; },
  countLimitPhrase(count) { return `por ${count} ${count === 1 ? 'vez' : 'vezes'}`; },
  dtstartPhrase(date) { return `a partir de ${date}`; },
  setPosPhrase(instances, count) {
    const feminine = instances.replaceAll('º', 'ª');
    return `na ${feminine} ${count === 1 ? 'ocorrência' : 'ocorrências'}`;
  },
  weekStartsOnPhrase(weekday) { return `semana começando na ${weekday}`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_PT].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'dias úteis' : null;
  },
  weekdayShortcutPhrase() { return 'todo dia útil'; },
};
