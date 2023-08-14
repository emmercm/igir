export default class ArrayPoly {
  public static isNotNullish<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
  }
}
