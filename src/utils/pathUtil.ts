import path from 'node:path';

export default {
  /**
   * The same as `path.resolve()`, but returns the last of {@link paths} itself when it's already
   * resolved. `path.resolve()` always builds a new string, so objects that resolve a shared path
   * (e.g. every entry of an archive) would otherwise each hold their own copy of it.
   * @returns the resolved path
   */
  resolve(...paths: string[]): string {
    // eslint-disable-next-line local/no-path-resolve
    const resolvedPath = path.resolve(...paths);
    const lastPath = paths.at(-1);
    return resolvedPath === lastPath ? lastPath : resolvedPath;
  },
};
