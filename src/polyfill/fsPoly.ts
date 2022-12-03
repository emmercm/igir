import crypto from 'crypto';
import fs, { PathLike, RmOptions } from 'fs';
import { isNotJunk } from 'junk';
import os from 'os';
import path from 'path';
import semver from 'semver';
import util from 'util';

export default class FsPoly {
  /**
   * There is no promise version of existsSync()
   */
  static async exists(pathLike: PathLike): Promise<boolean> {
    try {
      await util.promisify(fs.access)(pathLike); // throw if file doesn't exist
      return true;
    } catch (e) {
      return false;
    }
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

  static mktempSync(prefix: string): string {
    /* eslint-disable no-constant-condition */
    while (true) {
      const randomExtension = crypto.randomBytes(4).readUInt32LE(0).toString(36);
      const filePath = `${prefix.replace(/\.+$/, '')}.${randomExtension}`;
      if (!fs.existsSync(filePath)) {
        return filePath;
      }
    }
  }

  static async mkdtemp(prefix = os.tmpdir()): Promise<string> {
    // mkdtemp takes a string prefix rather than a file path, so we need to make sure the
    //  prefix ends with the path separator in order for it to become a parent directory.
    let prefixProcessed = prefix.replace(/[\\/]+$/, '');
    if (await this.isDirectory(prefixProcessed)) {
      prefixProcessed += path.sep;
    }

    try {
      // Added in: v10.0.0
      return await util.promisify(fs.mkdtemp)(prefixProcessed);
    } catch (e) {
      // Added in: v10.0.0
      return await util.promisify(fs.mkdtemp)(path.join(process.cwd(), 'tmp') + path.sep);
    }
  }

  static mkdtempSync(prefix = os.tmpdir()): string {
    // mkdtempSync takes a string prefix rather than a file path, so we need to make sure the
    //  prefix ends with the path separator in order for it to become a parent directory.
    let prefixProcessed = prefix.replace(/[\\/]+$/, '');
    if (this.isDirectorySync(prefixProcessed)) {
      prefixProcessed += path.sep;
    }

    try {
      // Added in: v5.10.0
      return fs.mkdtempSync(prefixProcessed);
    } catch (e) {
      // Added in: v5.10.0
      return fs.mkdtempSync(path.join(process.cwd(), 'tmp') + path.sep);
    }
  }

  static async renameOverwrite(oldPath: PathLike, newPath: PathLike, attempt = 1): Promise<void> {
    try {
      await util.promisify(fs.rename)(oldPath, newPath);
    } catch (e) {
      if (attempt >= 3) {
        throw e;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, Math.random() * (2 ** attempt * 1000));
      });
      await this.rm(newPath, { force: true });
      await this.renameOverwrite(oldPath, newPath, attempt + 1);
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
      if (optionsWithRetry?.force) {
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

    const time = new Date();
    try {
      await util.promisify(fs.utimes)(filePath, time, time);
    } catch (e) {
      const file = await util.promisify(fs.open)(filePath, 'a');
      await util.promisify(fs.close)(file);
    }
  }

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
}
