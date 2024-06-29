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
   * Filter elements in an array to only unique values, using the result of a mapper function to
   * test for equality. Usage:
   *
   * <code>
   * ['a', 'b', 'c', 'a', 'A', 'C'].filter(ArrayPoly.filterUniqueMapped((str) => str.toUpperCase());
   * </code>
   */
  public static filterUniqueMapped<T, V>(
    mapper: (arg: T) => V,
  ): (value: T, idx: number, values: T[]) => boolean {
    const seenMappedValues = new Set<V>();
    return (value: T): boolean => {
      const mapped = mapper(value);
      if (!seenMappedValues.has(mapped)) {
        seenMappedValues.add(mapped);
        return true;
      }
      return false;
    };
  }

  /**
   * Reduce elements in an array to chunks of size {@link limit}.
   *
   * <code>
   * [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].reduce(ArrayPoly.reduceChunk(3), []);
   * </code>
   */
  public static reduceChunk<T>(
    limit: number,
  ): (previous: T[][], current: T, idx: number, array: T[]) => T[][] {
    return (previous: T[][], current: T, idx: number, array: T[]): T[][] => {
      if (idx === 0) {
        if (limit <= 0) {
          return [array];
        }

        const chunks = [] as T[][];
        for (let i = 0; i < array.length; i += limit) {
          const chunk = array.slice(i, i + limit);
          chunks.push(chunk);
        }
        return chunks;
      }

      return previous;
    };
  }

  /**
   * Reduce elements in an array to only unique values. Usage:
   *
   * <code>
   * [1, 2, 3, 1, 1, 3].reduce(ArrayPoly.reduceUnique(), []);
   * </code>
   */
  public static reduceUnique<T>(): (previous: T[], current: T, idx: number, array: T[]) => T[] {
    return (previous: T[], current: T, idx: number, array: T[]): T[] => {
      if (idx === 0) {
        return [...new Set(array)];
      }
      return previous;
    };
  }
}
