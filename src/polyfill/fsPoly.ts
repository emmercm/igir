import fs, { PathLike, promises as fsPromises, RmOptions } from 'fs';
import { isNotJunk } from 'junk';
import os from 'os';
import path from 'path';
import semver from 'semver';

export default class FsPoly {
  /**
   * There is no promise version of existsSync()
   */
  static async exists(pathLike: PathLike): Promise<boolean> {
    try {
      await fsPromises.access(pathLike); // throw if file doesn't exist
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Some CI such as GitHub Actions give `EACCES: permission denied` on os.tmpdir()
   */
  static mkdtempSync(): string {
    try {
      // Added in: v5.10.0
      return fs.mkdtempSync(os.tmpdir());
    } catch (e) {
      // Added in: v5.10.0
      return fs.mkdtempSync(path.join(process.cwd(), 'tmp'));
    }
  }

  /**
   * fs.rm() was added in: v14.14.0
   * fsPromises.rm() was added in: v14.14.0
   */
  static async rm(pathLike: PathLike, options?: RmOptions): Promise<void> {
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
  }

  /**
   * fs.rmSync() was added in: v14.14.0
   */
  static rmSync(pathLike: PathLike, options?: RmOptions): void {
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
      // DEP0147
      if (semver.lt(process.version, '16.0.0')) {
        // Added in: v0.1.21
        fs.rmdirSync(pathLike, options);
      } else {
        // Added in: v14.14.0
        fs.rmSync(pathLike, { recursive: true, force: true });
      }
    } else {
      // Added in: v0.1.21
      fs.unlinkSync(pathLike);
    }
  }

  /**
   * Technically not a polyfill, but a function that should exist in the stdlib
   */
  static walkSync(pathLike: PathLike): string[] {
    const output = [];

    const files = fs.readdirSync(pathLike);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < files.length; i += 1) {
      const file = path.join(pathLike.toString(), files[i]);
      const stats = fs.statSync(file);
      if (stats.isDirectory()) {
        output.push(...this.walkSync(file));
      } else if (stats.isFile()) {
        output.push(file);
      }
    }

    return output
      .filter((filePath) => isNotJunk(path.basename(filePath)));
  }

  /**
   * Technically not a polyfill, but a function that should exist in the stdlib
   */
  static copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
