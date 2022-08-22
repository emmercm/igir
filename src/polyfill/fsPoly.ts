import fs, { promises as fsPromises } from 'fs';
import { PathLike, RmOptions } from 'node:fs';
import os from 'os';
import path from 'path';

export default {
  /**
     * Some CI such as GitHub Actions give `EACCES: permission denied` on os.tmpdir()
     */
  mkdtempSync: (): string => {
    try {
      // Added in: v5.10.0
      return fs.mkdtempSync(os.tmpdir());
    } catch (e) {
      // Added in: v5.10.0
      return fs.mkdtempSync(path.join(process.cwd(), 'tmp'));
    }
  },

  /**
     * fs.rm() was added in: v14.14.0
     * fsPromises.rm() was added in: v14.14.0
     */
  rm: async (pathLike: PathLike, options?: RmOptions): Promise<void> => {
    try {
      // Added in: v10.0.0
      await fsPromises.access(pathLike); // throw if file doesn't exist
    } catch (e) {
      if (options?.force) {
        return;
      }
      throw e;
    }

    // Added in: v10.0.0
    if ((await fsPromises.lstat(pathLike)).isDirectory()) {
      // Added in: v10.0.0
      await fsPromises.rmdir(pathLike, options);
    } else {
      // Added in: v10.0.0
      await fsPromises.unlink(pathLike);
    }
  },

  /**
     * fs.rmSync() was added in: v14.14.0
     */
  rmSync: (pathLike: PathLike, options?: RmOptions): void => {
    try {
      // Added in: v0.11.15
      fs.accessSync(pathLike); // throw if file doesn't exist
    } catch (e) {
      if (options?.force) {
        return;
      }
      throw e;
    }

    // Added in: v0.1.30
    if (fs.lstatSync(pathLike).isDirectory()) {
      // Added in: v0.1.21
      fs.rmdirSync(pathLike, options);
    } else {
      // Added in: v0.1.21
      fs.unlinkSync(pathLike);
    }
  },
};
