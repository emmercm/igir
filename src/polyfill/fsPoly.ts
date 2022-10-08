import crypto from 'crypto';
import fs, {
  PathLike,
  promises as fsPromises,
  RmOptions,
  StatOptions,
  Stats,
} from 'fs';
import { isNotJunk } from 'junk';
import os from 'os';
import path from 'path';
import semver from 'semver';
import { BackOffPolicy, Retryable } from 'typescript-retry-decorator';

export default class FsPoly {
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

  @Retryable({
    maxAttempts: 3,
    backOff: 1000,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    doRetry: (e: { code: string }) => ['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM'].indexOf(e.code) !== -1,
  })
  static async lstat(pathLike: PathLike, options?: StatOptions): Promise<Stats> {
    if (!await this.exists(pathLike)) {
      return new Stats();
    }
    return fsPromises.lstat(pathLike, { ...options, bigint: false });
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

  /**
   * fs.rm() was added in: v14.14.0
   * fsPromises.rm() was added in: v14.14.0
   */
  @Retryable({
    maxAttempts: 3,
    backOff: 1000,
    backOffPolicy: BackOffPolicy.ExponentialBackOffPolicy,
    doRetry: (e: { code: string }) => ['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM'].indexOf(e.code) !== -1,
  })
  static async rm(pathLike: PathLike, options?: RmOptions): Promise<void> {
    // Added in: v10.0.0
    await fsPromises.rm(pathLike, {
      ...options,
      force: true,
    });
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
        fs.rmSync(pathLike, {
          ...options,
          force: true,
        });
      }
    } else {
      // Added in: v0.1.21
      fs.unlinkSync(pathLike);
    }
  }

  static walkSync(pathLike: PathLike): string[] {
    const output = [];

    const files = fs.readdirSync(pathLike);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < files.length; i += 1) {
      const file = path.join(pathLike.toString(), files[i]);
      try {
        const stats = fs.statSync(file);
        if (stats.isDirectory()) {
          output.push(...this.walkSync(file));
        } else if (stats.isFile()) {
          output.push(file);
        }
      } catch (e) {
        // Windows can give `EPERM: operation not permitted, stat` for explainable reason
      }
    }

    return output
      .filter((filePath) => isNotJunk(path.basename(filePath)));
  }
}
