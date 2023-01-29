import crypto from 'crypto';
import fs, { PathLike, RmOptions } from 'fs';
import { isNotJunk } from 'junk';
import path from 'path';
import semver from 'semver';
import util from 'util';

export default class FsPoly {
  static async copyDir(src: string, dest: string): Promise<void> {
    await util.promisify(fs.mkdir)(dest, { recursive: true });
    const entries = await util.promisify(fs.readdir)(src, { withFileTypes: true });

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await util.promisify(fs.copyFile)(srcPath, destPath);
      }
    }
  }

  /**
   * There is no promise version of existsSync()
   */
  static async exists(pathLike: PathLike): Promise<boolean> {
    return util.promisify(fs.exists)(pathLike);
  }

  static async isDirectory(pathLike: PathLike): Promise<boolean> {
    try {
      return (await util.promisify(fs.lstat)(pathLike)).isDirectory();
    } catch (e) {
      return false;
    }
  }

  static isDirectorySync(pathLike: PathLike): boolean {
    try {
      return fs.lstatSync(pathLike).isDirectory();
    } catch (e) {
      return false;
    }
  }

  static makeLegal(filePath: string, pathSep = path.sep): string {
    let replaced = filePath
      // Make the filename Windows legal
      .replace(/:/g, ';')
      // Make the filename everything else legal
      .replace(/[<>:"|?*]/g, '_')
      // Normalize the path separators
      .replace(/[\\/]/g, pathSep);

    // Fix Windows drive letter
    if (replaced.match(/^[a-z];[\\/]/i) !== null) {
      replaced = replaced.replace(/^([a-z]);\\/i, '$1:\\');
    }

    return replaced;
  }

  /**
   * mkdtemp() takes a path "prefix" that's concatenated with random characters. Ignore that
   * behavior and instead assume we always want to specify a root temp directory.
   */
  static async mkdtemp(rootDir: string): Promise<string> {
    const rootDirProcessed = rootDir.replace(/[\\/]+$/, '') + path.sep;

    try {
      await util.promisify(fs.mkdir)(rootDirProcessed, { recursive: true });

      // Added in: v10.0.0
      return await util.promisify(fs.mkdtemp)(rootDirProcessed);
    } catch (e) {
      const backupDir = path.join(process.cwd(), 'tmp') + path.sep;
      await util.promisify(fs.mkdir)(backupDir, { recursive: true });

      // Added in: v10.0.0
      return await util.promisify(fs.mkdtemp)(backupDir);
    }
  }

  /**
   * mkdtempSync() takes a path "prefix" that's concatenated with random characters. Ignore that
   * behavior and instead assume we always want to specify a root temp directory.
   */
  static mkdtempSync(rootDir: string): string {
    const rootDirProcessed = rootDir.replace(/[\\/]+$/, '') + path.sep;

    try {
      fs.mkdirSync(rootDirProcessed, { recursive: true });

      // Added in: v5.10.0
      return fs.mkdtempSync(rootDirProcessed);
    } catch (e) {
      const backupDir = path.join(process.cwd(), 'tmp') + path.sep;
      fs.mkdirSync(backupDir, { recursive: true });

      // Added in: v5.10.0
      return fs.mkdtempSync(backupDir);
    }
  }

  static async mktemp(prefix: string): Promise<string> {
    /* eslint-disable no-constant-condition, no-await-in-loop */
    while (true) {
      const randomExtension = crypto.randomBytes(4).readUInt32LE(0).toString(36);
      const filePath = `${prefix.replace(/\.+$/, '')}.${randomExtension}`;
      if (!await util.promisify(fs.exists)(filePath)) {
        return filePath;
      }
    }
  }

  static async rename(oldPath: PathLike, newPath: PathLike): Promise<void> {
    try {
      await util.promisify(fs.rename)(oldPath, newPath);
    } catch (e) {
      // Attempt to resolve Windows' "EBUSY: resource busy or locked"
      await this.rm(newPath, { force: true });
      await this.rename(oldPath, newPath);
    }
  }

  /**
   * fs.rm() was added in: v14.14.0
   * util.promisify(fs.rm)() was added in: v14.14.0
   */
  static async rm(pathLike: PathLike, options: RmOptions = {}): Promise<void> {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    try {
      // Added in: v10.0.0
      await util.promisify(fs.access)(pathLike); // throw if file doesn't exist
    } catch (e) {
      if (optionsWithRetry?.force) {
        return;
      }
      throw e;
    }

    // Added in: v10.0.0
    if (await this.isDirectory(pathLike)) {
      // DEP0147
      if (semver.lt(process.version, '16.0.0')) {
        // Added in: v10.0.0
        await util.promisify(fs.rmdir)(pathLike, optionsWithRetry);
      } else {
        // Added in: v14.14.0
        await util.promisify(fs.rm)(pathLike, {
          ...optionsWithRetry,
          recursive: true,
        });
      }
    } else {
      // Added in: v10.0.0
      await util.promisify(fs.unlink)(pathLike);
    }
  }

  /**
   * fs.rmSync() was added in: v14.14.0
   */
  static rmSync(pathLike: PathLike, options: RmOptions = {}): void {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    try {
      // Added in: v0.11.15
      fs.accessSync(pathLike); // throw if file doesn't exist
    } catch (e) {
      if (optionsWithRetry.force) {
        return;
      }
      throw e;
    }

    // Added in: v0.1.30
    if (this.isDirectorySync(pathLike)) {
      // DEP0147
      if (semver.lt(process.version, '16.0.0')) {
        // Added in: v0.1.21
        fs.rmdirSync(pathLike, optionsWithRetry);
      } else {
        // Added in: v14.14.0
        fs.rmSync(pathLike, {
          ...optionsWithRetry,
          recursive: true,
        });
      }
    } else {
      // Added in: v0.1.21
      fs.unlinkSync(pathLike);
    }
  }

  static async touch(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    if (!await this.exists(dirname)) {
      await util.promisify(fs.mkdir)(dirname, { recursive: true });
    }

    // Create the file if it doesn't already exist
    const file = await util.promisify(fs.open)(filePath, 'a');

    // Ensure the file's `atime` and `mtime` are updated
    const date = new Date();
    await util.promisify(fs.futimes)(file, date, date);

    await util.promisify(fs.close)(file);
  }

  static async walk(pathLike: PathLike): Promise<string[]> {
    const output = [];

    const files = await util.promisify(fs.readdir)(pathLike);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < files.length; i += 1) {
      const file = path.join(pathLike.toString(), files[i]);
      const stats = await util.promisify(fs.stat)(file);
      if (stats.isDirectory()) {
        output.push(...await this.walk(file));
      } else if (stats.isFile()) {
        output.push(file);
      }
    }

    return output
      .filter((filePath) => isNotJunk(path.basename(filePath)));
  }
}
