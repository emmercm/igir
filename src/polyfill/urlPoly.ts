export default {
  /**
   * Added in: v19.9.0
   */
  canParse(input: string, base?: string): boolean {
    try {
      // eslint-disable-next-line no-new
      new URL(input, base);
      return true;
    } catch (e) {
      return false;
    }
  },
};
