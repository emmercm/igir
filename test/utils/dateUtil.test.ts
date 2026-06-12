import DateUtil from '../../src/utils/dateUtil.js';

describe('format', () => {
  // Thursday, June 11th 2026, 18:52:53.330
  const date = new Date(2026, 5, 11, 18, 52, 53, 330);

  test.each([
    // Year
    ['YYYY', '2026'],
    ['YY', '26'],
    // Month
    ['MMMM', 'June'],
    ['MMM', 'Jun'],
    ['MM', '06'],
    ['M', '6'],
    // Day of month
    ['Do', '11th'],
    ['DD', '11'],
    ['D', '11'],
    // Day of week
    ['dddd', 'Thursday'],
    ['ddd', 'Thu'],
    ['dd', 'Th'],
    ['d', '4'],
    // Hour
    ['HH', '18'],
    ['H', '18'],
    ['hh', '06'],
    ['h', '6'],
    // Minute
    ['mm', '52'],
    ['m', '52'],
    // Second
    ['ss', '53'],
    ['s', '53'],
    // Fractional second
    ['SSS', '330'],
    // Meridiem
    ['A', 'PM'],
    ['a', 'pm'],
  ])('should format the token %s', (token, expected) => {
    expect(DateUtil.format(token, date)).toEqual(expected);
  });

  test('should format Unix timestamp tokens', () => {
    expect(DateUtil.format('X', date)).toEqual(String(Math.floor(date.getTime() / 1000)));
    expect(DateUtil.format('x', date)).toEqual(String(date.getTime()));
  });

  test.each([
    ['YYYYMMDD-HHmmss', '20260611-185253'],
    ['HH:mm:ss.SSS', '18:52:53.330'],
    ['dddd, MMMM Do YYYY, h:mm:ss a', 'Thursday, June 11th 2026, 6:52:53 pm'],
  ])('should format the multi-token pattern %s', (pattern, expected) => {
    expect(DateUtil.format(pattern, date)).toEqual(expected);
  });

  test.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [31, '31st'],
  ])('should compute the ordinal for day %s', (dayOfMonth, expected) => {
    expect(DateUtil.format('Do', new Date(2023, 0, dayOfMonth))).toEqual(expected);
  });

  test('should format midnight as 12-hour AM', () => {
    const midnight = new Date(2023, 3, 14, 0, 5, 0);
    expect(DateUtil.format('h:mm a', midnight)).toEqual('12:05 am');
    expect(DateUtil.format('hh A', midnight)).toEqual('12 AM');
  });

  test('should format noon as 12-hour PM', () => {
    const noon = new Date(2023, 3, 14, 12, 0, 0);
    expect(DateUtil.format('h a', noon)).toEqual('12 pm');
  });

  test('should treat bracketed text as a literal', () => {
    expect(DateUtil.format('[YYYY]-YYYY', date)).toEqual('YYYY-2026');
    expect(DateUtil.format('[]', date)).toEqual('');
  });

  test('should pass through separators that are not tokens', () => {
    expect(DateUtil.format('YYYY/MM/DD HH:mm:ss', date)).toEqual('2026/06/11 18:52:53');
  });

  test('should default to the current time', () => {
    expect(DateUtil.format('YYYY')).toMatch(/^\d{4}$/);
  });
});
