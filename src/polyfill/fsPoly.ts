import crypto from 'crypto';
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

  static mkdtempSync(prefix = os.tmpdir()): string {
    // mkdtempSync takes a string prefix rather than a file path, so we need to make sure the
    //  prefix ends with the path separator in order for it to become a parent directory.
    let prefixProcessed = prefix.replace(/[\\/]+$/, '');
    try {
      if (fs.lstatSync(prefixProcessed).isDirectory()) {
        prefixProcessed += path.sep;
      }
    } catch (e) {
      // eslint-disable-line no-empty
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
    console.log(`move: ${oldPath} -> ${newPath}`);
    try {
      await fsPromises.rename(oldPath, newPath);
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
   * fsPromises.rm() was added in: v14.14.0
   */
  static async rm(pathLike: PathLike, options: RmOptions = {}): Promise<void> {
    console.log(`rm: ${pathLike}`);
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    try {
      // Added in: v10.0.0
      await fsPromises.access(pathLike); // throw if file doesn't exist
    } catch (e) {
      if (optionsWithRetry?.force) {
        return;
      }
      throw e;
    }

    // Added in: v10.0.0
    if ((await fsPromises.lstat(pathLike)).isDirectory()) {
      // DEP0147
      if (semver.lt(process.version, '16.0.0')) {
        // Added in: v10.0.0
        await fsPromises.rmdir(pathLike, optionsWithRetry);
      } else {
        // Added in: v14.14.0
        await fsPromises.rm(pathLike, {
          ...optionsWithRetry,
          recursive: true,
        });
      }
    } else {
      // Added in: v10.0.0
      await fsPromises.unlink(pathLike);
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
    if (fs.lstatSync(pathLike).isDirectory()) {
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
      await fsPromises.mkdir(dirname, { recursive: true });
    }

    const time = new Date();
    try {
      await fsPromises.utimes(filePath, time, time);
    } catch (e) {
      await (await fsPromises.open(filePath, 'a')).close();
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
