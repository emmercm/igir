export default {
  /**
   * Added in: v19.9.0
   */
  canParse(input: string, base?: string): boolean {
    try {
      const url = new URL(input, base);
      // Try to detect and ignore Windows drive letters
      return process.platform !== 'win32' || url.protocol.length > 2;
    } catch {
      return false;
    }
  },
};
