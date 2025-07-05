/**
 * A collection of static array utility functions.
 */
export default {
  /**
   * Filter elements in an array to only unique values, using the result of a mapper function to
   * test for equality. Usage:
   *
   * <code>
   * ['a', 'b', 'c', 'a', 'A', 'C'].filter(ArrayPoly.filterUniqueMapped((str) => str.toUpperCase());
   * </code>
   */
  filterUniqueMapped<T>(
    mapper: (arg: T) => unknown,
  ): (value: T, idx: number, values: T[]) => boolean {
    const seenMappedValues = new Set<unknown>();
    return (value, _idx, values): boolean => {
      if (values.length <= 1) {
        // Arrays that are empty or only have one element are already unique
        return true;
      }

      const mapped = mapper(value);
      if (!seenMappedValues.has(mapped)) {
        seenMappedValues.add(mapped);
        return true;
      }
      return false;
    };
  },

  /**
   * Reduce elements in an array to chunks of size {@link limit}.
   *
   * <code>
   * [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].reduce(ArrayPoly.reduceChunk(3), []);
   * </code>
   */
  reduceChunk<T>(limit: number): (previous: T[][], current: T, idx: number, array: T[]) => T[][] {
    return (previous: T[][], _current: T, idx: number, array: T[]): T[][] => {
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
  },

  /**
   * Reduce elements in an array to only unique values. Usage:
   *
   * <code>
   * [1, 2, 3, 1, 1, 3].reduce(ArrayPoly.reduceUnique(), []);
   * </code>
   */
  reduceUnique<T>(): (previous: T[], current: T, idx: number, array: T[]) => T[] {
    return (previous: T[], _current: T, idx: number, array: T[]): T[] => {
      if (array.length <= 1) {
        // Arrays that are empty or only have one element are already unique
        return array;
      }

      if (idx === 0) {
        return [...new Set(array)];
      }
      return previous;
    };
  },
};
