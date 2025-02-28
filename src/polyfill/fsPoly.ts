import crypto from 'node:crypto';
import fs, { MakeDirectoryOptions, ObjectEncodingOptions, PathLike, RmOptions } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import util from 'node:util';

import async from 'async';
import { isNotJunk } from 'junk';
import nodeDiskInfo from 'node-disk-info';
import { Memoize } from 'typescript-memoize';

import Defaults from '../globals/defaults.js';
import ExpectedError from '../types/expectedError.js';

export type FsWalkCallback = (increment: number) => void;

export default class FsPoly {
  // Assume that all drives we're reading from or writing to were already mounted at startup
  private static readonly DRIVES = nodeDiskInfo.getDiskInfoSync();

  static async canHardlink(dirPath: string): Promise<boolean> {
    const source = await this.mktemp(path.join(dirPath, 'source'));
    try {
      await this.touch(source);
      const target = await this.mktemp(path.join(dirPath, 'target'));
      try {
        await this.hardlink(source, target);
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

  static async canSymlink(dirPath: string): Promise<boolean> {
    const source = await this.mktemp(path.join(dirPath, 'source'));
    try {
      await this.touch(source);
      const target = await this.mktemp(path.join(dirPath, 'target'));
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
    await fs.promises.copyFile(src, dest);

    // Ensure the destination file is writable
    const stat = await this.stat(dest);
    const chmodOwnerWrite = 0o222; // Node.js' default for file creation is 0o666 (rw)
    if (!(stat.mode & chmodOwnerWrite)) {
      await fs.promises.chmod(dest, stat.mode | chmodOwnerWrite);
    }

    if (previouslyExisted) {
      // Windows doesn't update mtime on overwrite?
      await this.touch(dest);
    }
  }

  static async dirs(dirPath: string): Promise<string[]> {
    const readDir = (await fs.promises.readdir(dirPath))
      .filter((filePath) => isNotJunk(path.basename(filePath)))
      .map((filePath) => path.join(dirPath, filePath));

    return (
      await async.mapLimit(readDir, Defaults.MAX_FS_THREADS, async (filePath: string) =>
        (await this.isDirectory(filePath)) ? filePath : undefined,
      )
    ).filter((childDir) => childDir !== undefined);
  }

  static diskResolved(filePath: string): string | undefined {
    const filePathResolved = path.resolve(filePath);
    return this.disksSync().find((mountPath) => filePathResolved.startsWith(mountPath));
  }

  @Memoize()
  private static disksSync(): string[] {
    return (
      FsPoly.DRIVES.filter((drive) => drive.available > 0)
        .map((drive) => drive.mounted)
        .filter((mountPath) => mountPath !== '/')
        // Sort by mount points with the deepest number of subdirectories first
        .sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length)
    );
  }

  static async exists(pathLike: PathLike): Promise<boolean> {
    try {
      await fs.promises.access(pathLike);
      return true;
    } catch {
      return false;
    }
  }

  static async hardlink(target: string, link: string): Promise<void> {
    const targetResolved = path.resolve(target);
    try {
      return await fs.promises.link(targetResolved, link);
    } catch (error) {
      if (this.onDifferentDrives(targetResolved, link)) {
        throw new ExpectedError(`can't hard link files on different drives: ${error}`);
      }
      throw error;
    }
  }

  static async inode(pathLike: PathLike): Promise<number> {
    return (await this.stat(pathLike)).ino;
  }

  static async isDirectory(pathLike: string): Promise<boolean> {
    try {
      const lstat = await fs.promises.lstat(pathLike);
      if (lstat.isSymbolicLink()) {
        const link = await this.readlinkResolved(pathLike);
        return await this.isDirectory(link);
      }
      return lstat.isDirectory();
    } catch {
      return false;
    }
  }

  static isDirectorySync(pathLike: string): boolean {
    try {
      const lstat = fs.lstatSync(pathLike);
      if (lstat.isSymbolicLink()) {
        const link = this.readlinkResolvedSync(pathLike);
        return this.isDirectorySync(link);
      }
      return lstat.isDirectory();
    } catch {
      return false;
    }
  }

  static async isExecutable(pathLike: PathLike): Promise<boolean> {
    try {
      await fs.promises.access(pathLike, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  static async isHardlink(pathLike: PathLike): Promise<boolean> {
    try {
      return (await this.stat(pathLike)).nlink > 1;
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
    return filePathDrive.filesystem
      .replace(/[\\/]/g, path.sep)
      .startsWith(`${path.sep}${path.sep}`);
  }

  static async isSymlink(pathLike: PathLike): Promise<boolean> {
    try {
      return (await fs.promises.lstat(pathLike)).isSymbolicLink();
    } catch {
      return false;
    }
  }

  static isSymlinkSync(pathLike: PathLike): boolean {
    try {
      return fs.lstatSync(pathLike).isSymbolicLink();
    } catch {
      return false;
    }
  }

  static async isWritable(filePath: string): Promise<boolean> {
    const exists = await this.exists(filePath);
    try {
      await this.touch(filePath);
      return true;
    } catch {
      return false;
    } finally {
      if (!exists) {
        await this.rm(filePath, { force: true });
      }
    }
  }

  static makeLegal(filePath: string, pathSep = path.sep): string {
    const replaced = filePath
      // Make the filename Windows legal
      .replace(/:/g, ';')
      // Make the filename everything else legal
      .replace(/[<>:"|?*]/g, '_')
      // Normalize the path separators
      .replace(/[\\/]/g, pathSep)
      // Revert the Windows drive letter
      .replace(/^([a-z]);\\/i, '$1:\\');

    return replaced;
  }

  static async mkdir(pathLike: PathLike, options?: MakeDirectoryOptions): Promise<void> {
    await fs.promises.mkdir(pathLike, options);
  }

  /**
   * mkdtemp() takes a path "prefix" that's concatenated with random characters. Ignore that
   * behavior and instead assume we always want to specify a root temp directory.
   */
  static async mkdtemp(rootDir: string): Promise<string> {
    const rootDirProcessed = rootDir.replace(/[\\/]+$/, '') + path.sep;

    try {
      await this.mkdir(rootDirProcessed, { recursive: true });
      return await fs.promises.mkdtemp(rootDirProcessed);
    } catch {
      const backupDir = path.join(process.cwd(), 'tmp') + path.sep;
      await this.mkdir(backupDir, { recursive: true });
      return fs.promises.mkdtemp(backupDir);
    }
  }

  static async mktemp(prefix: string): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const randomExtension = crypto.randomBytes(4).readUInt32LE().toString(36);
      const filePath = `${prefix.replace(/\.+$/, '')}.${randomExtension}`;
      if (!(await this.exists(filePath))) {
        return filePath;
      }
    }
    throw new ExpectedError('failed to generate non-existent temp file');
  }

  static async mv(oldPath: string, newPath: string, attempt = 1): Promise<void> {
    try {
      return await fs.promises.rename(oldPath, newPath);
    } catch (error) {
      // These are the same error codes that `graceful-fs` catches
      if (!['EACCES', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw error;
      }

      // Backoff with jitter
      if (attempt >= 5) {
        throw error;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, Math.random() * (2 ** (attempt - 1) * 10));
      });

      // Attempt to resolve Windows' "EBUSY: resource busy or locked"
      await this.rm(newPath, { force: true });
      return this.mv(oldPath, newPath, attempt + 1);
    }
  }

  private static onDifferentDrives(one: string, two: string): boolean {
    if (path.dirname(one) === path.dirname(two)) {
      return false;
    }
    return this.diskResolved(one) !== this.diskResolved(two);
  }

  static async readlink(pathLike: PathLike): Promise<string> {
    if (!(await this.isSymlink(pathLike))) {
      throw new ExpectedError(`can't readlink of non-symlink: ${pathLike}`);
    }
    return fs.promises.readlink(pathLike);
  }

  static readlinkSync(pathLike: PathLike): string {
    if (!this.isSymlinkSync(pathLike)) {
      throw new ExpectedError(`can't readlink of non-symlink: ${pathLike}`);
    }
    return fs.readlinkSync(pathLike);
  }

  static async readlinkResolved(link: string): Promise<string> {
    const source = await this.readlink(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  static readlinkResolvedSync(link: string): string {
    const source = this.readlinkSync(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  static async realpath(pathLike: PathLike): Promise<string> {
    if (!(await this.exists(pathLike))) {
      throw new ExpectedError(`can't get realpath of non-existent path: ${pathLike}`);
    }
    return fs.promises.realpath(pathLike);
  }

  static async rm(pathLike: string, options: RmOptions = {}): Promise<void> {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    try {
      await fs.promises.access(pathLike); // throw if file doesn't exist
    } catch {
      if (optionsWithRetry?.force) {
        return;
      }
      throw new ExpectedError(`can't rm, path doesn't exist: ${pathLike}`);
    }

    if (await this.isDirectory(pathLike)) {
      await fs.promises.rm(pathLike, {
        ...optionsWithRetry,
        recursive: true,
      });
    } else {
      await fs.promises.unlink(pathLike);
    }
  }

  static rmSync(pathLike: string, options: RmOptions = {}): void {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    try {
      fs.accessSync(pathLike);
    } catch {
      if (optionsWithRetry?.force) {
        return;
      }
      throw new ExpectedError(`can't rmSync, path doesn't exist: ${pathLike}`);
    }

    if (this.isDirectorySync(pathLike)) {
      fs.rmSync(pathLike, {
        ...optionsWithRetry,
        recursive: true,
      });
    } else {
      fs.unlinkSync(pathLike);
    }
  }

  /**
   * Note: this will follow symlinks and get the size of the target.
   */
  static async size(pathLike: PathLike): Promise<number> {
    try {
      return (await this.stat(pathLike)).size;
    } catch {
      return 0;
    }
  }

  /**
   * @see https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
   */
  static sizeReadable(bytes: number, decimals = 1): string {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(decimals))}${sizes[i]}`;
  }

  /**
   * Note: {@param target} should be processed with `path.resolve()` to create absolute path
   * symlinks
   */
  static async symlink(target: PathLike, link: PathLike): Promise<void> {
    return util.promisify(fs.symlink)(target, link);
  }

  static async symlinkRelativePath(target: string, link: string): Promise<string> {
    // NOTE(cemmer): macOS can be funny with files or links in system folders such as
    // `/var/folders/*/...` whose real path is actually `/private/var/folders/*/...`, and
    // path.resolve() won't resolve these fully, so we need the OS to resolve them in order to
    // generate valid relative paths
    const realTarget = await this.realpath(target);
    const realLink = path.join(await this.realpath(path.dirname(link)), path.basename(link));
    return path.relative(path.dirname(realLink), realTarget);
  }

  static async stat(pathLike: PathLike): Promise<fs.Stats> {
    return fs.promises.stat(pathLike);
  }

  static async touch(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    if (!(await this.exists(dirname))) {
      await this.mkdir(dirname, { recursive: true });
    }

    // Create the file if it doesn't already exist
    const file = await fs.promises.open(filePath, 'a');

    // Ensure the file's `atime` and `mtime` are updated
    const date = new Date();
    await util.promisify(fs.futimes)(file.fd, date, date);

    await file.close();
  }

  static async walk(pathLike: PathLike, callback?: FsWalkCallback): Promise<string[]> {
    let output: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = (await fs.promises.readdir(pathLike, { withFileTypes: true })).filter((entry) =>
        isNotJunk(path.basename(entry.name)),
      );
    } catch {
      return [];
    }

    const entryIsDirectory = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(pathLike.toString(), entry.name);
        return (
          entry.isDirectory() || (entry.isSymbolicLink() && (await this.isDirectory(fullPath)))
        );
      }),
    );

    // Depth-first search directories first
    const directories = entries
      .filter((entry, idx) => entryIsDirectory[idx])
      .map((entry) => path.join(pathLike.toString(), entry.name));
    for (const directory of directories) {
      const subDirFiles = await this.walk(directory);
      if (callback) {
        callback(subDirFiles.length);
      }
      output = [...output, ...subDirFiles];
    }

    const files = entries
      .filter((entry, idx) => !entryIsDirectory[idx])
      .map((entry) => path.join(pathLike.toString(), entry.name));
    if (callback) {
      callback(files.length);
    }
    output = [...output, ...files];

    return output;
  }

  static async writeFile(
    filePath: PathLike,
    data: string | Uint8Array,
    options?: ObjectEncodingOptions,
  ): Promise<void> {
    const file = await fs.promises.open(filePath, 'w');
    await file.writeFile(data, options);
    await file.sync(); // emulate fs.promises.writeFile() flush:true added in v21.0.0
    await file.close();
  }
}
