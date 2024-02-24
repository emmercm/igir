import crypto from 'node:crypto';
import fs, { MakeDirectoryOptions, PathLike, RmOptions } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import { isNotJunk } from 'junk';
import nodeDiskInfo from 'node-disk-info';
import semver from 'semver';

import ArrayPoly from './arrayPoly.js';

export type FsWalkCallback = (increment: number) => void;

export default class FsPoly {
  static readonly FILE_READING_CHUNK_SIZE = 1024 * 1024; // 1MiB

  // Assume that all drives we're reading from or writing to were already mounted at startup
  public static readonly DRIVES = nodeDiskInfo.getDiskInfoSync();

  static async canSymlink(tempDir: string): Promise<boolean> {
    const source = await this.mktemp(path.join(tempDir, 'source'));
    try {
      await this.touch(source);
      const target = await this.mktemp(path.join(tempDir, 'target'));
      try {
        await this.symlink(source, target);
        return await this.exists(target);
      } finally {
        await this.rm(target, { force: true });
      }
    } catch {
      return false;
    } finally {
      await this.rm(source, { force: true });
    }
  }

  static async copyDir(src: string, dest: string): Promise<void> {
    await this.mkdir(dest, { recursive: true });
    const entries = await util.promisify(fs.readdir)(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await this.copyFile(srcPath, destPath);
      }
    }
  }

  static async copyFile(src: string, dest: string): Promise<void> {
    const previouslyExisted = await this.exists(src);
    await util.promisify(fs.copyFile)(src, dest);
    if (previouslyExisted) {
      // Windows doesn't update mtime on overwrite?
      await this.touch(dest);
    }
  }

  static async dirs(dirPath: string): Promise<string[]> {
    const readDir = (await util.promisify(fs.readdir)(dirPath))
      .filter((filePath) => isNotJunk(path.basename(filePath)))
      .map((filePath) => path.join(dirPath, filePath));

    return (await Promise.all(
      readDir.map(async (filePath) => (await this.isDirectory(filePath) ? filePath : undefined)),
    )).filter(ArrayPoly.filterNotNullish);
  }

  static disksSync(): string[] {
    return FsPoly.DRIVES
      .filter((drive) => drive.available > 0)
      .map((drive) => drive.mounted)
      // Sort by mount points with the deepest number of subdirectories first
      .sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length);
  }

  /**
   * There is no promise version of existsSync()
   */
  static async exists(pathLike: PathLike): Promise<boolean> {
    return util.promisify(fs.exists)(pathLike);
  }

  static async hardlink(target: string, link: string): Promise<void> {
    try {
      // Added in: v10.0.0
      return await util.promisify(fs.link)(target, link);
    } catch (error) {
      if (this.onDifferentDrives(target, link)) {
        throw new Error(`can't hard link files on different drives: ${error}`);
      }
      throw error;
    }
  }

  static async inode(pathLike: PathLike): Promise<number> {
    return (await util.promisify(fs.stat)(pathLike)).ino;
  }

  static async isDirectory(pathLike: string): Promise<boolean> {
    try {
      const lstat = (await util.promisify(fs.lstat)(pathLike));
      if (lstat.isSymbolicLink()) {
        const link = await this.readlinkResolved(pathLike);
        return await this.isDirectory(link);
      }
      return lstat.isDirectory();
    } catch {
      return false;
    }
  }

  static async isExecutable(pathLike: PathLike): Promise<boolean> {
    try {
      await util.promisify(fs.access)(pathLike, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  static isSamba(filePath: string): boolean {
    const normalizedPath = filePath.replace(/[\\/]/g, path.sep);
    if (normalizedPath.startsWith(`${path.sep}${path.sep}`) && normalizedPath !== os.devNull) {
      return true;
    }

    const resolvedPath = path.resolve(normalizedPath);
    const filePathDrive = this.DRIVES
      // Sort by mount points with the deepest number of subdirectories first
      .sort((a, b) => b.mounted.split(/[\\/]/).length - a.mounted.split(/[\\/]/).length)
      .find((drive) => resolvedPath.startsWith(drive.mounted));

    if (!filePathDrive) {
      // Assume 'false' by default
      return false;
    }
    return filePathDrive.filesystem.replace(/[\\/]/g, path.sep).startsWith(`${path.sep}${path.sep}`);
  }

  static async isSymlink(pathLike: PathLike): Promise<boolean> {
    try {
      return (await util.promisify(fs.lstat)(pathLike)).isSymbolicLink();
    } catch {
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

  static async mkdir(pathLike: PathLike, options?: MakeDirectoryOptions): Promise<void> {
    await util.promisify(fs.mkdir)(pathLike, options);
  }

  /**
   * mkdtemp() takes a path "prefix" that's concatenated with random characters. Ignore that
   * behavior and instead assume we always want to specify a root temp directory.
   */
  static async mkdtemp(rootDir: string): Promise<string> {
    const rootDirProcessed = rootDir.replace(/[\\/]+$/, '') + path.sep;

    try {
      await this.mkdir(rootDirProcessed, { recursive: true });

      // Added in: v10.0.0
      return await util.promisify(fs.mkdtemp)(rootDirProcessed);
    } catch {
      const backupDir = path.join(process.cwd(), 'tmp') + path.sep;
      await this.mkdir(backupDir, { recursive: true });

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
    } catch {
      const backupDir = path.join(process.cwd(), 'tmp') + path.sep;
      fs.mkdirSync(backupDir, { recursive: true });

      // Added in: v5.10.0
      return fs.mkdtempSync(backupDir);
    }
  }

  static async mktemp(prefix: string): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const randomExtension = crypto.randomBytes(4).readUInt32LE().toString(36);
      const filePath = `${prefix.replace(/\.+$/, '')}.${randomExtension}`;
      if (!await this.exists(filePath)) {
        return filePath;
      }
    }
    throw new Error('failed to generate non-existent temp file');
  }

  static async mv(oldPath: string, newPath: string, attempt = 1): Promise<void> {
    /**
     * WARN(cemmer): {@link fs.rename} appears to be VERY memory intensive when copying across
     * drives! Instead, we'll use stream piping to keep memory usage low.
     */
    if (this.onDifferentDrives(oldPath, newPath)) {
      const read = fs.createReadStream(oldPath, {
        highWaterMark: this.FILE_READING_CHUNK_SIZE,
      });
      await new Promise((resolve, reject) => {
        const write = fs.createWriteStream(newPath);
        write.on('close', resolve);
        write.on('error', reject);
        read.pipe(write);
      });
      return this.rm(oldPath, { force: true });
    }

    try {
      return await util.promisify(fs.rename)(oldPath, newPath);
    } catch (error) {
      // These are the same error codes that `graceful-fs` catches
      if (!['EACCES', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error;
      }

      // Backoff with jitter
      if (attempt >= 3) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, Math.random() * (2 ** (attempt - 1) * 100));
      });

      // Attempt to resolve Windows' "EBUSY: resource busy or locked"
      await this.rm(newPath, { force: true });
      return await this.mv(oldPath, newPath, attempt + 1);
    }
  }

  private static onDifferentDrives(one: string, two: string): boolean {
    const oneResolved = path.resolve(one);
    const twoResolved = path.resolve(two);
    if (path.dirname(oneResolved) === path.dirname(twoResolved)) {
      return false;
    }
    const driveMounts = this.disksSync();
    return driveMounts.find((mount) => oneResolved.startsWith(mount))
      !== driveMounts.find((mount) => twoResolved.startsWith(mount));
  }

  static async readlink(pathLike: PathLike): Promise<string> {
    if (!await this.isSymlink(pathLike)) {
      throw new Error(`can't readlink of non-symlink: ${pathLike}`);
    }
    // Added in: v10.0.0
    return util.promisify(fs.readlink)(pathLike);
  }

  static async readlinkResolved(link: string): Promise<string> {
    const source = await this.readlink(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  static async realpath(pathLike: PathLike): Promise<string> {
    if (!await this.exists(pathLike)) {
      throw new Error(`can't get realpath of non-existent path: ${pathLike}`);
    }
    return util.promisify(fs.realpath)(pathLike);
  }

  /**
   * fs.rm() was added in: v14.14.0
   * util.promisify(fs.rm)() was added in: v14.14.0
   */
  static async rm(pathLike: string, options: RmOptions = {}): Promise<void> {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    try {
      // Added in: v10.0.0
      await util.promisify(fs.access)(pathLike); // throw if file doesn't exist
    } catch (error) {
      if (optionsWithRetry?.force) {
        return;
      }
      throw error;
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
   * Note: this will follow symlinks and get the size of the target.
   */
  static async size(pathLike: PathLike): Promise<number> {
    try {
      return (await util.promisify(fs.stat)(pathLike)).size;
    } catch {
      return 0;
    }
  }

  /**
   * @see https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
   */
  static sizeReadable(bytes: number, decimals = 1): string {
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(decimals))}${sizes[i]}`;
  }

  static async symlink(target: PathLike, link: PathLike): Promise<void> {
    return util.promisify(fs.symlink)(target, link);
  }

  static async symlinkRelativePath(target: string, link: string): Promise<string> {
    // NOTE(cemmer): macOS can be funny with files or links in system folders such as
    // `/var/folders/*/...` whose real path is actually `/private/var/folders/*/...`, and
    // path.resolve() won't resolve these fully, so we need the OS to resolve them in order to
    // generate valid relative paths
    const realTarget = await this.realpath(target);
    const realLink = path.join(
      await this.realpath(path.dirname(link)),
      path.basename(link),
    );
    return path.relative(path.dirname(realLink), realTarget);
  }

  static async touch(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    if (!await this.exists(dirname)) {
      await this.mkdir(dirname, { recursive: true });
    }

    // Create the file if it doesn't already exist
    const file = await util.promisify(fs.open)(filePath, 'a');

    // Ensure the file's `atime` and `mtime` are updated
    const date = new Date();
    await util.promisify(fs.futimes)(file, date, date);

    await util.promisify(fs.close)(file);
  }

  static async walk(pathLike: PathLike, callback?: FsWalkCallback): Promise<string[]> {
    let output: string[] = [];

    let files: string[];
    try {
      files = (await util.promisify(fs.readdir)(pathLike))
        .filter((filePath) => isNotJunk(path.basename(filePath)));
    } catch {
      return [];
    }

    if (callback) {
      callback(files.length);
    }

    // TODO(cemmer): `Promise.all()` this?
    for (const file of files) {
      const fullPath = path.join(pathLike.toString(), file);
      if (await this.isDirectory(fullPath)) {
        const subDirFiles = await this.walk(fullPath);
        output = [...output, ...subDirFiles];
        if (callback) {
          callback(subDirFiles.length - 1);
        }
      } else {
        output = [...output, fullPath];
      }
    }

    return output;
  }
}
