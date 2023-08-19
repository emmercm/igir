export default class ArrayPoly {
  /**
   * Filter out nullish values from an array, in a way that TypeScript can understand how the
   * resulting element type has changed. For example, TypeScript (as of v5.1.3) will tell you that:
   *
   * <code>
   * [1, 2, undefined, 4, undefined].filter((val) => val);
   * </code
   *
   * has the resulting type `(number | undefined)[]`. Instead, use:
   *
   * <code>
   * [1, 2, undefined, 4, undefined].filter(ArrayPoly.filterNotNullish);
   * </code>
   */
  public static filterNotNullish<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
  }

  /**
   * Filter elements in an array to only unique ones. Usage:
   *
   * <code>
   * [1, 2, 3, 1, 1, 3].filter(ArrayPoly.filterUnique);
   * </code>
   */
  public static filterUnique<T>(value: T, index: number, array: T[]): boolean {
    return array.indexOf(value) === index;
  }
}
