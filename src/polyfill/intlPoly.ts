/**
 * Polyfill functionality for the Intl library.
 */
export default class IntlPoly {
  /**
   * Returns a string with a language-sensitive representation of a number.
   */
  static toLocaleString(number: number, minimumIntegerDigits?: number): string {
    return this.paddedNumberFormatter(minimumIntegerDigits).format(number);
  }

  private static readonly paddedNumberFormatterCache = new Map<
    number | undefined,
    Intl.NumberFormat
  >();
  private static paddedNumberFormatter(minimumIntegerDigits?: number): Intl.NumberFormat {
    let numberFormat = this.paddedNumberFormatterCache.get(minimumIntegerDigits);
    if (numberFormat === undefined) {
      numberFormat = new Intl.NumberFormat(undefined, { minimumIntegerDigits, useGrouping: true });
      this.paddedNumberFormatterCache.set(minimumIntegerDigits, numberFormat);
    }
    return numberFormat;
  }
}
