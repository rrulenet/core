import { Frequency } from '../options.ts';
import { formatLocalizedDate, formatTzAbbreviation, joinList, type ToTextLocaleDefinition } from './shared.ts';

const WEEKDAY_NAMES_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const;
const MONTH_NAMES_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'] as const;
const WORKWEEK_ID = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'] as const;

function formatIndonesianWallTime(hour: number, minute: number, second: number) {
  if (second) return `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}.${String(second).padStart(2, '0')}`;
  return `${String(hour).padStart(2, '0')}.${String(minute).padStart(2, '0')}`;
}

function indonesianOrdinal(value: number) {
  if (value < 0) return value === -1 ? 'terakhir' : `ke-${Math.abs(value)} dari akhir`;
  return `ke-${value}`;
}

export const ID_LOCALE: ToTextLocaleDefinition = {
  intl: 'id-ID',
  weekdayNames: WEEKDAY_NAMES_ID,
  monthNames: MONTH_NAMES_ID,
  conjunction: 'dan',
  customSource: 'sumber kustom',
  customSet: 'kumpulan kustom',
  weekdayShortcut: 'hari kerja',
  everyUnit(freq, interval) {
    switch (freq) {
      case Frequency.YEARLY: return interval === 1 ? 'setiap tahun' : `setiap ${interval} tahun`;
      case Frequency.MONTHLY: return interval === 1 ? 'setiap bulan' : `setiap ${interval} bulan`;
      case Frequency.WEEKLY: return interval === 1 ? 'setiap minggu' : `setiap ${interval} minggu`;
      case Frequency.DAILY: return interval === 1 ? 'setiap hari' : `setiap ${interval} hari`;
      case Frequency.HOURLY: return interval === 1 ? 'setiap jam' : `setiap ${interval} jam`;
      case Frequency.MINUTELY: return interval === 1 ? 'setiap menit' : `setiap ${interval} menit`;
      case Frequency.SECONDLY: return interval === 1 ? 'setiap detik' : `setiap ${interval} detik`;
    }
  },
  ordinalNumber: indonesianOrdinal,
  formatWeekday(value) {
    const name = WEEKDAY_NAMES_ID[value.weekday]!;
    if (!value.ordinal) return name;
    if (value.ordinal === -1) return `${name} terakhir`;
    return `${name} ${indonesianOrdinal(value.ordinal)}`;
  },
  formatWallTime: formatIndonesianWallTime,
  formatDate(date, tzid) { return formatLocalizedDate(date, tzid, 'id-ID'); },
  tzAbbreviation(date, tzid) { return formatTzAbbreviation(date, tzid, 'id-ID'); },
  countPhrase(count) { return `${count} kali`; },
  dateCountPhrase(count, additional) { return additional ? `${count} tanggal tambahan` : `${count} tanggal`; },
  sourceDateCountPhrase(count) { return `${count} tanggal`; },
  withAdditionalDates(count) { return `dengan ${count} tanggal tambahan`; },
  excludingDates(count) { return `mengecualikan ${count} tanggal`; },
  excludingPhrase(value) { return `mengecualikan ${value}`; },
  exceptPhrase(value) { return `kecuali ${value}`; },
  weekPhrase(value) { return `pada minggu ${value}`; },
  monthsPhrase(months) { return `pada ${months}`; },
  weekdaysPhrase(weekdays) { return `pada ${joinList(weekdays, 'dan', 'id-ID')}`; },
  monthDaysPhrase(days) { return `pada hari ${joinList(days, 'dan', 'id-ID')} setiap bulan`; },
  yearDaysPhrase(days) { return `pada hari ${joinList(days, 'dan', 'id-ID')} setiap tahun`; },
  timePhrase(times) { return `pukul ${times}`; },
  minutesPhrase(minutes) { return `pada menit ${minutes}`; },
  secondsPhrase(seconds) { return `pada detik ${seconds}`; },
  untilPhrase(date) { return `sampai ${date}`; },
  countLimitPhrase(count) { return `selama ${count} kali`; },
  dtstartPhrase(date) { return `mulai ${date}`; },
  setPosPhrase(instances) { return `pada kejadian ${instances}`; },
  weekStartsOnPhrase(weekday) { return `minggu dimulai pada ${weekday}`; },
  rscalePhrase(rscale, skip) { return `(RSCALE=${rscale}${skip ? `;SKIP=${skip}` : ''})`; },
  mergeWeekdayShortcut(weekdays) {
    const sorted = [...weekdays].sort();
    const expected = [...WORKWEEK_ID].sort();
    return sorted.length === expected.length && sorted.every((day, index) => day === expected[index]) ? 'hari kerja' : null;
  },
  weekdayShortcutPhrase() { return 'setiap hari kerja'; },
};
