// Deliberately slow, bounded reference: enumerate UTC days, filter them,
// group by frequency interval, then apply positions. No engine/Temporal imports.
const dayMs = 86400000;
const list = value => value == null ? null : Array.isArray(value) ? value : [value];
const dayStamp = date => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
function period(date, freq) {
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  if (freq === 0) return year;
  if (freq === 1) return year * 12 + month;
  if (freq === 2) return Math.floor((dayStamp(date) - ((date.getUTCDay() + 6) % 7) * dayMs) / (7 * dayMs));
  return dayStamp(date) / dayMs;
}
function firstDay(date, freq) {
  if (freq === 0) return Date.UTC(date.getUTCFullYear(), 0, 1);
  if (freq === 1) return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  if (freq === 2) return dayStamp(date) - ((date.getUTCDay() + 6) % 7) * dayMs;
  return dayStamp(date);
}
export function utcOracle(options) {
  if (![0, 1, 2, 3].includes(options.freq) || !options.until || options.tzid && options.tzid !== 'UTC') {
    throw new Error('UTC oracle requires a bounded Gregorian yearly/monthly/weekly/daily rule');
  }
  const start = options.dtstart, end = options.until;
  const firstPeriod = period(start, options.freq), lastPeriod = period(end, options.freq);
  const groups = new Map();
  for (let stamp = firstDay(start, options.freq); ; stamp += dayMs) {
    const date = new Date(stamp), key = period(date, options.freq);
    if (key > lastPeriod) break;
    if ((key - firstPeriod) % (options.interval ?? 1)) continue;
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const yearDay = (stamp - Date.UTC(year, 0, 1)) / dayMs + 1;
    const yearLength = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / dayMs;
    const months = list(options.bymonth), monthDays = list(options.bymonthday), weekDays = list(options.byweekday), yearDays = list(options.byyearday);
    if (months?.length && !months.includes(month + 1)) continue;
    if (monthDays?.length && !monthDays.some(value => day === (value > 0 ? value : lastDay + value + 1))) continue;
    if (yearDays?.length && !yearDays.some(value => yearDay === (value > 0 ? value : yearLength + value + 1))) continue;
    if (weekDays?.length && !weekDays.some(entry => {
      const weekday = typeof entry === 'number' ? entry : entry.weekday;
      if ((date.getUTCDay() + 6) % 7 !== weekday) return false;
      const ordinal = entry.n;
      if (!ordinal) return true;
      const inYear = options.freq === 0 && !months?.length;
      const position = inYear ? yearDay : day;
      const length = inYear ? yearLength : lastDay;
      return ordinal > 0 ? Math.floor((position - 1) / 7) + 1 === ordinal : -(Math.floor((length - position) / 7) + 1) === ordinal;
    })) continue;
    if (options.freq === 0 && !months?.length && !monthDays?.length && !weekDays?.length && !yearDays?.length && month !== start.getUTCMonth()) continue;
    if ([0, 1].includes(options.freq) && !monthDays?.length && !weekDays?.length && !yearDays?.length && day !== start.getUTCDate()) continue;
    if (options.freq === 2 && !weekDays?.length && date.getUTCDay() !== start.getUTCDay()) continue;
    const candidates = groups.get(key) ?? new Set();
    for (const hour of list(options.byhour) ?? [start.getUTCHours()]) {
      for (const minute of list(options.byminute) ?? [start.getUTCMinutes()]) {
        for (const second of list(options.bysecond) ?? [start.getUTCSeconds()]) {
          candidates.add(stamp + hour * 3600000 + minute * 60000 + Math.min(second, 59) * 1000);
        }
      }
    }
    groups.set(key, candidates);
  }
  const selected = new Set();
  for (const values of groups.values()) {
    const sorted = [...values].sort((a, b) => a - b);
    for (const value of list(options.bysetpos)?.length ? list(options.bysetpos).map(pos => sorted[pos > 0 ? pos - 1 : sorted.length + pos]) : sorted) {
      if (value !== undefined && value >= +start && value <= +end) selected.add(value);
    }
  }
  return [...selected].sort((a, b) => a - b).map(time => new Date(time).toISOString());
}

// Failure-only reducer: remove selectors and individual members while retaining
// a bounded rule. Every accepted reduction must still exhibit the discrepancy.
export function minimizeRule(options, fails) {
  let current = { ...options };
  for (const key of ['bysetpos', 'bymonth', 'bymonthday', 'byyearday', 'byweekday', 'byhour', 'byminute', 'bysecond']) {
    const removed = { ...current };
    delete removed[key];
    if (fails(removed)) { current = removed; continue; }
    if (Array.isArray(current[key])) {
      for (let index = current[key].length - 1; index >= 0 && current[key].length > 1; index--) {
        const reduced = { ...current, [key]: current[key].filter((_, i) => i !== index) };
        if (fails(reduced)) current = reduced;
      }
    }
  }
  return current;
}
