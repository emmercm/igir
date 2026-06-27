const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS_SHORT = MONTHS_LONG.map((month) => month.slice(0, 3));
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = DAYS_LONG.map((day) => day.slice(0, 3));
const DAYS_MIN = DAYS_LONG.map((day) => day.slice(0, 2));

/**
 * Left-pad a number with zeroes to a minimum length.
 */
function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/**
 * Append the English ordinal suffix to a number (e.g. 1 -> "1st", 22 -> "22nd").
 */
function ordinal(value: number): string {
  const mod100 = value % 100;
  const mod10 = value % 10;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) {
      suffix = 'st';
    } else if (mod10 === 2) {
      suffix = 'nd';
    } else if (mod10 === 3) {
      suffix = 'rd';
    }
  }
  return `${value}${suffix}`;
}

/**
 * The common subset of {@link https://momentjs.com/docs/#/displaying/ Moment.js display tokens},
 * keyed by token and resolving against the local time zone.
 */
const TOKENS: Record<string, (date: Date) => string> = {
  YYYY: (date) => pad(date.getFullYear(), 4),
  YY: (date) => pad(date.getFullYear() % 100),
  MMMM: (date) => MONTHS_LONG[date.getMonth()],
  MMM: (date) => MONTHS_SHORT[date.getMonth()],
  MM: (date) => pad(date.getMonth() + 1),
  M: (date) => String(date.getMonth() + 1),
  Do: (date) => ordinal(date.getDate()),
  DD: (date) => pad(date.getDate()),
  D: (date) => String(date.getDate()),
  dddd: (date) => DAYS_LONG[date.getDay()],
  ddd: (date) => DAYS_SHORT[date.getDay()],
  dd: (date) => DAYS_MIN[date.getDay()],
  d: (date) => String(date.getDay()),
  HH: (date) => pad(date.getHours()),
  H: (date) => String(date.getHours()),
  hh: (date) => pad(((date.getHours() + 11) % 12) + 1),
  h: (date) => String(((date.getHours() + 11) % 12) + 1),
  mm: (date) => pad(date.getMinutes()),
  m: (date) => String(date.getMinutes()),
  ss: (date) => pad(date.getSeconds()),
  s: (date) => String(date.getSeconds()),
  SSS: (date) => pad(date.getMilliseconds(), 3),
  A: (date) => (date.getHours() < 12 ? 'AM' : 'PM'),
  a: (date) => (date.getHours() < 12 ? 'am' : 'pm'),
  X: (date) => String(Math.floor(date.getTime() / 1000)),
  x: (date) => String(date.getTime()),
};

// Match the longest tokens first so e.g. `YYYY` wins over `YY`. Text wrapped in square brackets is
// treated as a literal, matching Moment.js's escaping behavior.
const TOKEN_PATTERN = new RegExp(
  `\\[([^\\]]*)]|${Object.keys(TOKENS)
    .toSorted((a, b) => b.length - a.length)
    .join('|')}`,
  'g',
);

export default {
  /**
   * Format a {@link Date} using the common subset of Moment.js display tokens. Defaults to the
   * current time.
   */
  format: (pattern: string, date: Date = new Date()): string =>
    pattern.replace(
      TOKEN_PATTERN,
      (match: string, literal: string | undefined) => literal ?? TOKENS[match](date),
    ),
};
