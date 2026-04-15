import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream';

import async from 'async';
import { isNotJunk } from 'junk';
import nodeDiskInfo from 'node-disk-info';
import { Memoize } from 'typescript-memoize';

import Defaults from '../globals/defaults.js';
import IgirException from '../types/exceptions/igirException.js';
import FsReadTransform, { FsReadCallback } from './fsReadTransform.js';
import gracefulFs from './gracefulFs.js';

// Monkey-patch 'fs' to help prevent Windows EMFILE and other errors
gracefulFs.gracefulify(fs);

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
    if (process.platform === 'win32') {
      // https://support.microsoft.com/en-us/topic/windows-management-instrumentation-command-line-wmic-removal-from-windows-e9e83c7f-4992-477f-ba1d-96f694b8665d
      // https://github.com/cristiammercado/node-disk-info/issues/29
      return [];
    }
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
   * Copy the contents of {@link src} to {@link dest}, recursively, respecting subdirectories.
   */
  static async copyDir(src: string, dest: string): Promise<void> {
    await this.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

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
   * Copy {@link src} to {@link dest}, overwriting any existing file, and ensuring {@link dest}
   * is writable.
   */
  static async copyFile(src: string, dest: string, callback?: FsReadCallback): Promise<void> {
    if (!(await this.exists(src))) {
      throw new IgirException(`can't copy nonexistent file '${src}' to '${dest}'`);
    }
    const destDir = path.dirname(dest);
    if (!(await this.exists(destDir))) {
      throw new IgirException(`can't copy '${src}' to nonexistent directory '${destDir}'`);
    }

    const destPreviouslyExisted = await this.exists(dest);

    const readStream = fs.createReadStream(src, {
      highWaterMark: Defaults.FILE_READING_CHUNK_SIZE,
    });
    const writeStream = fs.createWriteStream(dest);
    if (callback) {
      await stream.promises.pipeline(readStream, new FsReadTransform(callback), writeStream);
    } else {
      await stream.promises.pipeline(readStream, writeStream);
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
   * @returns all the directories in {@link dirPath}, non-recursively
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
   * @returns the path to the disk that {@link filePath} is on
   */
  static diskResolved(filePath: string): string | undefined {
    const filePathResolved = path.resolve(filePath);
    return this.disksSync().find((drive) => filePathResolved.startsWith(drive.mounted))?.mounted;
  }

  @Memoize()
  // https://github.com/cristiammercado/node-disk-info/issues/36
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private static disksSync() {
    return (
      this.DRIVES.filter((drive) => drive.available > 0)
        .filter(
          // Evidently the typing of 'node-disk-info' is wrong, the mounted path can be undefined
          // https://github.com/emmercm/igir/issues/1862
          (drive) => (drive.mounted as string | undefined) !== undefined && drive.mounted !== '/',
        )
        // Sort by mount points with the deepest number of subdirectories first
        .toSorted((a, b) => b.mounted.split(/[\\/]/).length - a.mounted.split(/[\\/]/).length)
    );
  }

  /**
   * @returns if {@link pathLike} exists, not following symbolic links
   */
  static async exists(pathLike: fs.PathLike): Promise<boolean> {
    try {
      await fs.promises.lstat(pathLike);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@link pathLike} exists, not following symbolic links
   */
  static existsSync(pathLike: fs.PathLike): boolean {
    try {
      fs.lstatSync(pathLike);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a hardlink at location {@link link} to the original file {@link target}.
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
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        throw new IgirException(`can't hard link files on different drives: ${error}`);
      }
      throw error;
    }
  }

  /**
   * @returns the index node of {@link pathLike}
   */
  static async inode(pathLike: fs.PathLike): Promise<number> {
    return (await this.stat(pathLike)).ino;
  }

  /**
   * @returns if {@link pathLike} is a directory, following symbolic links
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
   * @returns if {@link pathLike} is a directory, following symbolic links
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
   * @returns if {@link pathLike} can be executed
   */
  static async isExecutable(pathLike: fs.PathLike): Promise<boolean> {
    try {
      await fs.promises.access(pathLike, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@link pathLike} is a file, following symbolic links
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
   * @returns if {@link pathLike} has at least one related hardlink
   */
  static async isHardlink(pathLike: fs.PathLike): Promise<boolean> {
    try {
      return (await this.stat(pathLike)).nlink > 1;
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@link filePath} is on a samba path
   */
  static isSamba(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    if (resolvedPath === os.devNull) {
      return false;
    }

    if (
      // Standard UNC: \\Server\Share\Path
      // Extended UNC: \\?\UNC\Server\Share\Path
      filePath.startsWith(`\\\\`) ||
      // smb://[user[:password]@]server/share[/path]
      filePath.toLowerCase().startsWith('smb://') ||
      // /mnt/smb/share/folder/
      filePath.toLowerCase().startsWith('/mnt/smb/')
    ) {
      return true;
    }
    const filePathDrive = this.disksSync().find((drive) => resolvedPath.startsWith(drive.mounted));

    if (!filePathDrive) {
      // Assume 'false' by default
      return false;
    }
    return filePathDrive.filesystem
      .replaceAll(/[\\/]/g, path.sep)
      .startsWith(`${path.sep}${path.sep}`);
  }

  /**
   * @returns if {@link pathLike} is a symlink
   */
  static async isSymlink(pathLike: fs.PathLike): Promise<boolean> {
    try {
      return (await fs.promises.lstat(pathLike)).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /**
   * @returns if {@link pathLike} is a symlink
   */
  static isSymlinkSync(pathLike: fs.PathLike): boolean {
    try {
      return fs.lstatSync(pathLike).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /**
   * @returns if the current runtime can write to {@link filePath}
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
   * Makes the directory {@link pathLike} with the options {@link options}.
   */
  static async mkdir(pathLike: fs.PathLike, options?: fs.MakeDirectoryOptions): Promise<void> {
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
      return await fs.promises.mkdtemp(backupDir);
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
   * Move the file {@link oldPath} to {@link newPath}, retrying failures.
   */
  static async mv(
    oldPath: string,
    newPath: string,
    callback?: FsReadCallback,
  ): Promise<MoveResultValue> {
    try {
      await fs.promises.rename(oldPath, newPath);
      return MoveResult.RENAMED;
    } catch (error) {
      // Can't rename across drives
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        await this.copyFile(oldPath, newPath, callback);
        await this.rm(oldPath, { force: true });
        return MoveResult.COPIED;
      }

      // Attempt to resolve Windows' "EBUSY: resource busy or locked"
      try {
        await this.rm(newPath);
        return await this.mv(oldPath, newPath, callback);
      } catch {
        throw error;
      }
    }
  }

  /**
   * @returns the contents of the file.
   */
  static async readFile(pathLike: fs.PathLike): Promise<Buffer<ArrayBuffer>> {
    return await fs.promises.readFile(pathLike);
  }

  /**
   * @returns the target path for the symlink {@link pathLike}
   */
  static async readlink(pathLike: fs.PathLike): Promise<string> {
    if (!(await this.isSymlink(pathLike))) {
      throw new IgirException(`can't readlink of non-symlink: ${pathLike.toString()}`);
    }
    return await fs.promises.readlink(pathLike);
  }

  /**
   * @returns the target path for the symlink {@link pathLike}
   */
  static readlinkSync(pathLike: fs.PathLike): string {
    if (!this.isSymlinkSync(pathLike)) {
      throw new IgirException(`can't readlink of non-symlink: ${pathLike.toString()}`);
    }
    return fs.readlinkSync(pathLike);
  }

  /**
   * @returns the absolute target path for the symlink {@link link}
   */
  static async readlinkResolved(link: string): Promise<string> {
    const source = await this.readlink(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  /**
   * @returns the absolute target path for the symlink {@link link}
   */
  static readlinkResolvedSync(link: string): string {
    const source = this.readlinkSync(link);
    if (path.isAbsolute(source)) {
      return source;
    }
    return path.join(path.dirname(link), source);
  }

  /**
   * @returns the fully resolved path to {@link pathLike}
   */
  static async realpath(pathLike: fs.PathLike): Promise<string> {
    if (!(await this.exists(pathLike))) {
      throw new IgirException(`can't get realpath of non-existent path: ${pathLike.toString()}`);
    }
    return await fs.promises.realpath(pathLike);
  }

  /**
   * Copy {@link src} to {@link dest}, overwriting any existing file, and ensuring {@link dest}
   * is writable.
   */
  static async reflink(src: string, dest: string): Promise<void> {
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
      if ((error as NodeJS.ErrnoException).code === 'ENOTSUP') {
        throw new IgirException('reflinks are not supported on this filesystem');
      }
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        throw new IgirException('reflinks are not supported across filesystems');
      }
      throw error;
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
   * Deletes the file or directory {@link pathLike} with the options {@link options}, retrying
   * failures.
   */
  static async rm(pathLike: string, options: fs.RmOptions = {}): Promise<void> {
    if (pathLike === os.devNull) {
      return;
    }

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
   * Deletes the file or directory {@link pathLike} with the options {@link options}, retrying
   * failures.
   */
  static rmSync(pathLike: string, options: fs.RmOptions = {}): void {
    if (pathLike === os.devNull) {
      return;
    }

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
  static async size(pathLike: fs.PathLike): Promise<number> {
    try {
      return (await this.stat(pathLike)).size;
    } catch {
      // TODO(cemmer): maybe have this return 'undefined'
      return 0;
    }
  }

  /**
   * @see https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
   */
  static sizeReadable(bytes: number): string {
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    const i = bytes === 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(k));
    const bytesFormatted = bytes / k ** i;
    let fractionDigits = 1;
    if (bytesFormatted === 0) {
      fractionDigits = 0;
    } else if (bytesFormatted < 10) {
      fractionDigits = 2;
    } else if (bytesFormatted >= 100) {
      fractionDigits = 0;
    }
    return `${bytesFormatted.toFixed(fractionDigits)}${sizes[i]}`;
  }

  /**
   * Creates a relative symbolic link at {@link link} to the original file {@link target}
   *
   * Note: {@link target} should be processed with `path.resolve()` to create absolute path
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
    await fs.promises.symlink(target, link);
  }

  /**
   * Creates a relative symbolic link at {@link link} to the original file {@link target}
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
   * @returns the stats of {@link pathLike}
   */
  static async stat(
    pathLike: fs.PathLike,
  ): Promise<fs.Stats & { atimeS: number; mtimeS: number; ctimeS: number; birthtimeS: number }> {
    const fsStats = await fs.promises.stat(pathLike);
    return Object.assign(
      Object.create(Object.getPrototypeOf(fsStats) as object) as fs.Stats,
      fsStats,
      {
        atimeS: Math.floor(fsStats.atimeMs / 1000),
        mtimeS: Math.floor(fsStats.mtimeMs / 1000),
        ctimeS: Math.floor(fsStats.ctimeMs / 1000),
        birthtimeS: Math.floor(fsStats.birthtimeMs / 1000),
      },
    );
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
      await file.sync(); // emulate fs.writeFile() flush:true added in v21.0.0
      // Ensure the file's `atime` and `mtime` are updated
      const date = new Date();
      await file.utimes(date, date);
    } finally {
      await file.close();
    }
  }

  /**
   * Return every file in {@link pathLike}, recursively.
   */
  static async walk(
    pathLike: fs.PathLike,
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
      if (walkMode === WalkMode.DIRECTORIES) {
        output.push(directory);
      }
      for (const subPath of subPaths) {
        output.push(subPath);
      }
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
   * Write {@link data} to {@link filePath}.
   */
  static async writeFile(
    filePath: fs.PathLike,
    data: string | Uint8Array,
    options?: fs.ObjectEncodingOptions,
  ): Promise<void> {
    const file = await fs.promises.open(filePath, 'w');
    try {
      await file.writeFile(data, options);
      await file.sync(); // emulate fs.writeFile() flush:true added in v21.0.0
    } finally {
      await file.close();
    }
  }
}
