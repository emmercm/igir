import crypto from 'node:crypto';
import fs, { MakeDirectoryOptions, ObjectEncodingOptions, PathLike, RmOptions } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';
import util from 'node:util';

import async from 'async';
import { isNotJunk } from 'junk';
import nodeDiskInfo from 'node-disk-info';
import { Memoize } from 'typescript-memoize';

import Defaults from '../globals/defaults.js';
import IgirException from '../types/exceptions/igirException.js';
import FsCopyTransform, { FsCopyCallback } from './fsCopyTransform.js';

export const MoveResult = {
  COPIED: 1,
  RENAMED: 2,
} as const;
export type MoveResultKey = keyof typeof MoveResult;
export type MoveResultValue = (typeof MoveResult)[MoveResultKey];

export const WalkMode = {
  FILES: 1,
  DIRECTORIES: 2,
} as const;
export type WalkModeKey = keyof typeof WalkMode;
export type WalkModeValue = (typeof WalkMode)[WalkModeKey];

export type FsWalkCallback = (increment: number) => void;

/**
 * A collection of static filesystem utility functions.
 */
export default class FsPoly {
  // Assume that all drives we're reading from or writing to were already mounted at startup
  // https://github.com/cristiammercado/node-disk-info/issues/36
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private static readonly DRIVES = (() => {
    try {
      return nodeDiskInfo.getDiskInfoSync();
    } catch {
      return [];
    }
  })();

  /**
   * @param dirPath the path to a temporary directory
   * @returns if the current runtime can create hardlinks
   */
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

  /**
   * @param dirPath the path to a temporary directory
   * @returns if the current runtime can create symbolic links
   */
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

  /**
   * Copy the contents of {@param src} to {@param dest}, recursively, respecting subdirectories.
   */
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

  /**
   * Copy {@param src} to {@param dest}, overwriting any existing file, and ensuring {@param dest}
   * is writable.
   */
  static async copyFile(
    src: string,
    dest: string,
    callback?: FsCopyCallback,
    attempt = 1,
  ): Promise<void> {
    if (!(await this.exists(src))) {
      throw new IgirException(`can't copy nonexistent file '${src}' to '${dest}'`);
    }
    const destDir = path.dirname(dest);
    if (!(await this.exists(destDir))) {
      throw new IgirException(`can't copy '${src}' to nonexistent directory '${destDir}'`);
    }

    const destPreviouslyExisted = await this.exists(dest);

    try {
      await util.promisify(stream.pipeline)(
        fs.createReadStream(src, { highWaterMark: Defaults.FILE_READING_CHUNK_SIZE }),
        new FsCopyTransform(callback),
        fs.createWriteStream(dest),
      );
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
      return this.copyFile(src, dest, callback, attempt + 1);
    }

    // Ensure the destination file is writable
    const stat = await this.stat(dest);
    const chmodOwnerWrite = 0o222; // Node.js' default for file creation is 0o666 (rw)
    if (!(stat.mode & chmodOwnerWrite)) {
      await fs.promises.chmod(dest, stat.mode | chmodOwnerWrite);
    }

    if (destPreviouslyExisted) {
      // Windows doesn't update mtime on overwrite?
      await this.touch(dest);
    }
  }

  /**
   * @returns all the directories in {@param dirPath}, non-recursively
   */
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

  /**
   * @returns the path to the disk that {@param filePath} is on
   */
  static diskResolved(filePath: string): string | undefined {
    const filePathResolved = path.resolve(filePath);
    return this.disksSync().find((mountPath) => filePathResolved.startsWith(mountPath));
  }

  @Memoize()
  private static disksSync(): string[] {
    return (
      this.DRIVES.filter((drive) => drive.available > 0)
        .map((drive) => drive.mounted)
        .filter((mountPath) => mountPath !== '/')
        // Sort by mount points with the deepest number of subdirectories first
        .sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length)
    );
  }

  /**
   * @returns if {@param pathLike} exists, not following symbolic links
   */
  static async exists(pathLike: PathLike): Promise<boolean> {
    try {
      await fs.promises.lstat(pathLike);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@param pathLike} exists, not following symbolic links
   */
  static existsSync(pathLike: PathLike): boolean {
    try {
      fs.lstatSync(pathLike);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a hardlink at location {@param link} to the original file {@param target}.
   */
  static async hardlink(target: string, link: string): Promise<void> {
    const targetResolved = path.resolve(target);

    if (!(await this.exists(targetResolved))) {
      throw new IgirException(`can't link nonexistent file '${targetResolved}' to '${link}'`);
    }
    const linkDir = path.dirname(link);
    if (!(await this.exists(linkDir))) {
      throw new IgirException(
        `can't link '${targetResolved}' to nonexistent directory '${linkDir}'`,
      );
    }

    await this.rm(link, { force: true });
    try {
      await fs.promises.link(targetResolved, link);
      return;
    } catch (error) {
      if (this.onDifferentDrives(targetResolved, link)) {
        throw new IgirException(`can't hard link files on different drives: ${error}`);
      }
      throw error;
    }
  }

  /**
   * @returns the index node of {@param pathLike}
   */
  static async inode(pathLike: PathLike): Promise<number> {
    return (await this.stat(pathLike)).ino;
  }

  /**
   * @returns if {@param pathLike} is a directory, following symbolic links
   */
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

  /**
   * @returns if {@param pathLike} is a directory, following symbolic links
   */
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

  /**
   * @returns if {@param pathLike} can be executed
   */
  static async isExecutable(pathLike: PathLike): Promise<boolean> {
    try {
      await fs.promises.access(pathLike, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@param pathLike} is a file, following symbolic links
   */
  static async isFile(pathLike: string): Promise<boolean> {
    try {
      const lstat = await fs.promises.lstat(pathLike);
      if (lstat.isSymbolicLink()) {
        const link = await this.readlinkResolved(pathLike);
        return await this.isFile(link);
      }
      return lstat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@param pathLike} has at least one related hardlink
   */
  static async isHardlink(pathLike: PathLike): Promise<boolean> {
    try {
      return (await this.stat(pathLike)).nlink > 1;
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@param filePath} is on a samba path
   */
  static isSamba(filePath: string): boolean {
    const normalizedPath = filePath.replaceAll(/[\\/]/g, path.sep);
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
      .replaceAll(/[\\/]/g, path.sep)
      .startsWith(`${path.sep}${path.sep}`);
  }

  /**
   * @returns if {@param pathLike} is a symlink
   */
  static async isSymlink(pathLike: PathLike): Promise<boolean> {
    try {
      return (await fs.promises.lstat(pathLike)).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@param pathLike} is a symlink
   */
  static isSymlinkSync(pathLike: PathLike): boolean {
    try {
      return fs.lstatSync(pathLike).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /**
   * @returns if the current runtime can write to {@param filePath}
   */
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

  /**
   * @returns a new filepath with all illegal characters removed
   */
  static makeLegal(filePath: string, pathSep = path.sep): string {
    return (
      filePath
        // Make the filename Windows legal
        .replaceAll(':', ';')
        // Make the filename everything else legal
        .replaceAll(/[<>:"|?*]/g, '_')
        // Normalize the path separators
        .replaceAll(/[\\/]/g, pathSep)
        // Revert the Windows drive letter
        .replace(/^([a-z]);\\/i, '$1:\\')
    );
  }

  /**
   * Makes the directory {@param pathLike} with the options {@param options}.
   */
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

  /**
   * @returns a path to a temporary file that doesn't exist, without creating that file
   */
  static async mktemp(prefix: string): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const randomExtension = crypto.randomBytes(4).readUInt32LE().toString(36);
      const filePath = `${prefix.replace(/\.+$/, '')}.${randomExtension}`;
      if (!(await this.exists(filePath))) {
        return filePath;
      }
    }
    throw new IgirException('failed to generate non-existent temp file');
  }

  /**
   * Move the file {@param oldPath} to {@param newPath}, retrying failures.
   */
  static async mv(
    oldPath: string,
    newPath: string,
    callback?: FsCopyCallback,
    attempt = 1,
  ): Promise<MoveResultValue> {
    // Can't rename across drives
    if (this.onDifferentDrives(oldPath, newPath)) {
      const newPathTemp = await this.mktemp(newPath);
      await this.copyFile(oldPath, newPathTemp);
      await this.mv(newPathTemp, newPath);
      await this.rm(oldPath, { force: true });
      return MoveResult.COPIED;
    }

    try {
      await fs.promises.rename(oldPath, newPath);
      return MoveResult.RENAMED;
    } catch (error) {
      // Can't rename across drives
      if (['EXDEV'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        await this.copyFile(oldPath, newPath, callback);
        await this.rm(oldPath, { force: true });
        return MoveResult.COPIED;
      }

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
      return this.mv(oldPath, newPath, callback, attempt + 1);
    }
  }

  private static onDifferentDrives(one: string, two: string): boolean {
    if (path.dirname(one) === path.dirname(two)) {
      return false;
    }
    return this.diskResolved(one) !== this.diskResolved(two);
  }

  /**
   * @returns the target path for the symlink {@param pathLike}
   */
  static async readlink(pathLike: PathLike): Promise<string> {
    if (!(await this.isSymlink(pathLike))) {
      throw new IgirException(`can't readlink of non-symlink: ${pathLike.toString()}`);
    }
    return fs.promises.readlink(pathLike);
  }

  /**
   * @returns the target path for the symlink {@param pathLike}
   */
  static readlinkSync(pathLike: PathLike): string {
    if (!this.isSymlinkSync(pathLike)) {
      throw new IgirException(`can't readlink of non-symlink: ${pathLike.toString()}`);
    }
    return fs.readlinkSync(pathLike);
  }

  /**
   * @returns the absolute target path for the symlink {@param link}
   */
  static async readlinkResolved(link: string): Promise<string> {
    const source = await this.readlink(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  /**
   * @returns the absolute target path for the symlink {@param link}
   */
  static readlinkResolvedSync(link: string): string {
    const source = this.readlinkSync(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  /**
   * @returns the fully resolved path to {@param pathLike}
   */
  static async realpath(pathLike: PathLike): Promise<string> {
    if (!(await this.exists(pathLike))) {
      throw new IgirException(`can't get realpath of non-existent path: ${pathLike.toString()}`);
    }
    return fs.promises.realpath(pathLike);
  }

  /**
   * Copy {@param src} to {@param dest}, overwriting any existing file, and ensuring {@param dest}
   * is writable.
   */
  static async reflink(src: string, dest: string, attempt = 1): Promise<void> {
    if (!(await this.exists(src))) {
      throw new IgirException(`can't copy nonexistent file '${src}' to '${dest}'`);
    }
    const destDir = path.dirname(dest);
    if (!(await this.exists(destDir))) {
      throw new IgirException(`can't copy '${src}' to nonexistent directory '${destDir}'`);
    }

    const destPreviouslyExisted = await this.exists(dest);

    try {
      await fs.promises.copyFile(src, dest, fs.constants.COPYFILE_FICLONE);
    } catch (error) {
      if (((error as NodeJS.ErrnoException).code ?? '') === 'ENOTSUP') {
        throw new IgirException('reflinks are not supported on this filesystem');
      }

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
      return this.reflink(src, dest, attempt + 1);
    }

    // Ensure the destination file is writable
    const stat = await this.stat(dest);
    const chmodOwnerWrite = 0o222; // Node.js' default for file creation is 0o666 (rw)
    if (!(stat.mode & chmodOwnerWrite)) {
      await fs.promises.chmod(dest, stat.mode | chmodOwnerWrite);
    }

    if (destPreviouslyExisted) {
      // Windows doesn't update mtime on overwrite?
      await this.touch(dest);
    }
  }

  /**
   * Deletes the file or directory {@param pathLike} with the options {@param options}, retrying
   * failures.
   */
  static async rm(pathLike: string, options: RmOptions = {}): Promise<void> {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    if (!(await this.exists(pathLike))) {
      if (optionsWithRetry.force) {
        return;
      }
      throw new IgirException(`can't rm, path doesn't exist: ${pathLike}`);
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

  /**
   * Deletes the file or directory {@param pathLike} with the options {@param options}, retrying
   * failures.
   */
  static rmSync(pathLike: string, options: RmOptions = {}): void {
    const optionsWithRetry = {
      maxRetries: 2,
      ...options,
    };

    if (!this.existsSync(pathLike)) {
      if (optionsWithRetry.force) {
        return;
      }
      throw new IgirException(`can't rmSync, path doesn't exist: ${pathLike}`);
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
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(decimals)}${sizes[i]}`;
  }

  /**
   * Creates a relative symbolic link at {@param link} to the original file {@link target}
   *
   * Note: {@param target} should be processed with `path.resolve()` to create absolute path
   * symlinks
   */
  static async symlink(target: string, link: string): Promise<void> {
    const targetAbsolute = path.isAbsolute(target) ? target : path.join(path.dirname(link), target);
    if (!(await this.exists(targetAbsolute))) {
      throw new IgirException(`can't link nonexistent file '${targetAbsolute}' to '${link}'`);
    }
    const linkDir = path.dirname(link);
    if (!(await this.exists(linkDir))) {
      throw new IgirException(
        `can't link '${targetAbsolute}' to nonexistent directory '${linkDir}'`,
      );
    }

    await this.rm(link, { force: true });
    return util.promisify(fs.symlink)(target, link);
  }

  /**
   * Creates a relative symbolic link at {@param link} to the original file {@link target}
   */
  static async symlinkRelativePath(target: string, link: string): Promise<string> {
    // NOTE(cemmer): macOS can be funny with files or links in system folders such as
    // `/var/folders/*/...` whose real path is actually `/private/var/folders/*/...`, and
    // path.resolve() won't resolve these fully, so we need the OS to resolve them in order to
    // generate valid relative paths
    const realTarget = await this.realpath(target);
    const realLink = path.join(await this.realpath(path.dirname(link)), path.basename(link));
    return path.relative(path.dirname(realLink), realTarget);
  }

  /**
   * @returns the stats of {@param pathLike}
   */
  static async stat(pathLike: PathLike): Promise<fs.Stats> {
    return fs.promises.stat(pathLike);
  }

  /**
   * Create the file {@link filePath} if it doesn't exist, otherwise update the access and modified
   * time to "now".
   */
  static async touch(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    if (!(await this.exists(dirname))) {
      await this.mkdir(dirname, { recursive: true });
    }

    // Create the file if it doesn't already exist
    const file = await fs.promises.open(filePath, 'a');

    try {
      // Ensure the file's `atime` and `mtime` are updated
      const date = new Date();
      await util.promisify(fs.futimes)(file.fd, date, date);
    } finally {
      await file.close();
    }
  }

  /**
   * Return every file in {@param pathLike}, recursively.
   */
  static async walk(
    pathLike: PathLike,
    walkMode: WalkModeValue,
    callback?: FsWalkCallback,
  ): Promise<string[]> {
    let output: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = (await fs.promises.readdir(pathLike, { withFileTypes: true })).filter((entry) =>
        isNotJunk(entry.name),
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
      .filter((_entry, idx) => entryIsDirectory[idx])
      .map((entry) => path.join(pathLike.toString(), entry.name));
    for (const directory of directories) {
      const subPaths = await this.walk(directory, walkMode);
      if (callback) {
        callback(subPaths.length);
      }
      output = [...output, ...(walkMode === WalkMode.DIRECTORIES ? [directory] : []), ...subPaths];
    }

    if (walkMode === WalkMode.FILES) {
      const files = entries
        .filter((_entry, idx) => !entryIsDirectory[idx])
        .map((entry) => path.join(pathLike.toString(), entry.name));
      if (callback) {
        callback(files.length);
      }
      output = [...output, ...files];
    }

    return output;
  }

  /**
   * Write {@param data} to {@param filePath}.
   */
  static async writeFile(
    filePath: PathLike,
    data: string | Uint8Array,
    options?: ObjectEncodingOptions,
  ): Promise<void> {
    const file = await fs.promises.open(filePath, 'w');
    try {
      await file.writeFile(data, options);
      await file.sync(); // emulate fs.promises.writeFile() flush:true added in v21.0.0
    } finally {
      await file.close();
    }
  }
}
