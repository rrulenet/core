export function datetime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  // Apply the real year before normalizing the day: Date.UTC treats years
  // 0..99 as 1900..1999, which would turn a valid leap day into March 1.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date;
}

export function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

export function isValidDate(date: Date): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
}
