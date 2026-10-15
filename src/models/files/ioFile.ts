import type { OpenMode, PathLike } from 'node:fs';
import fs from 'node:fs';

import { Mutex } from 'async-mutex';

import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import FsUtil from '../../utils/fsUtil.js';

/**
 * A page of an {@link IOFile}'s contents, cached in memory.
 */
interface IOFilePage {
  data: Buffer;
  // Whether the page has staged writes that haven't been written to disk yet
  isDirty: boolean;
  // The number of readers actively reading this page, preventing the page memory from reuse
  pins: number;
}

/**
 * A wrapper for readable and writable files.
 *
 * Reads and writes of readable files go through an in-memory cache of the file's contents, in
 * pages of {@link Defaults.IO_FILE_PAGE_SIZE} bytes, up to
 * {@link Defaults.MAX_IO_FILE_CACHE_SIZE} bytes per file. Files that fit within the limit can end
 * up entirely in memory, and larger files keep their most recently used pages. Writes are staged in
 * memory and written to disk when their page is evicted or the file is closed. Reads from and
 * writes to disk through the cache are at most {@link Defaults.FILE_READING_CHUNK_SIZE} bytes at a
 * time.
 *
 * Write-only files that can't also be opened for reading aren't cached, so each write goes
 * straight to disk.
 */
export default class IOFile {
  private readonly pathLike: PathLike;
  private readonly fileHandle: fs.promises.FileHandle;
  private readonly isWritable: boolean;
  // Whether writes go to the end of the file because it was opened for appending
  private readonly isAppending: boolean;
  // A write-only file that can't also be opened for reading can't be cached
  private readonly isReadable: boolean;

  // The size of the file, including staged writes that haven't been written to disk yet
  private fileSize: number;
  // The end of the file's contents on disk
  private diskContentsEnd: number;
  private seekPosition = 0;
  private isClosed = false;
  private bytesSinceYield = 0;

  // Cached pages by page index, from least to most recently used
  private readonly pages = new Map<number, IOFilePage>();
  private mostRecentPageIndex = -1;
  // Load and evict pages one operation at a time, so a page can't be evicted mid-operation
  private readonly pagesMutex = new Mutex();

  private constructor(
    pathLike: PathLike,
    fileHandle: fs.promises.FileHandle,
    flags: number,
    isReadable: boolean,
    fileSize: number,
    diskContentsEnd: number,
  ) {
    this.pathLike = pathLike;
    this.fileHandle = fileHandle;
    this.isWritable = IOFile.hasWriteFlag(flags);
    this.isAppending = (flags & fs.constants.O_APPEND) !== 0;
    this.isReadable = isReadable;
    this.fileSize = fileSize;
    this.diskContentsEnd = diskContentsEnd;
  }

  /**
   * Return a new {@link IOFile} for {@link pathLike}, opened with the file system flags
   * {@link mode}. If {@link expectedSize} is given, the file is treated as that size: a writable
   * file larger than it is truncated to it when opened, and a smaller one is zero-extended to it
   * when closed.
   */
  static async fileFrom(
    pathLike: PathLike,
    mode: OpenMode,
    expectedSize?: number,
  ): Promise<IOFile> {
    const flags = this.toFlags(mode);
    const isWritable = this.hasWriteFlag(flags);

    // Writable files are opened for reading too, because staged writes may need to read the rest of
    // their page from disk. They're never opened for appending, because "on Linux, positional writes
    // don't work when the file is opened in append mode. The kernel ignores the position argument
    // and always appends the data to the end of the file."
    // @see https://nodejs.org/api/fs.html#file-system-flags
    let fileHandle: fs.promises.FileHandle;
    let isReadable = true;
    try {
      fileHandle = await fs.promises.open(
        pathLike,
        isWritable
          ? (flags & ~(fs.constants.O_WRONLY | fs.constants.O_APPEND)) | fs.constants.O_RDWR
          : flags,
      );
    } catch (error) {
      const isAccessError = error instanceof Error && 'code' in error && error.code === 'EACCES';
      if ((flags & fs.constants.O_WRONLY) === 0 || !isAccessError) {
        throw error;
      }
      // The file can only be written to, so open it with the requested flags
      fileHandle = await fs.promises.open(pathLike, flags);
      isReadable = false;
    }

    const diskContentsEnd = await this.closeOnError(fileHandle, async () => {
      const diskSize = (await fileHandle.stat()).size;
      if (expectedSize === undefined || diskSize <= expectedSize) {
        return diskSize;
      }
      if (isWritable) {
        // Don't leave the contents past the expected size on disk when the file is closed
        await fileHandle.truncate(expectedSize);
      }
      // Past the expected size isn't part of the file, so don't read it
      return expectedSize;
    });

    return new IOFile(
      pathLike,
      fileHandle,
      flags,
      isReadable,
      expectedSize ?? diskContentsEnd,
      diskContentsEnd,
    );
  }

  /**
   * Return a new {@link IOFile} of {@link size} zero bytes for {@link pathLike}, opened with the
   * file system flags {@link mode}. Any existing file at {@link pathLike} is deleted first.
   */
  static async fileOfSize(pathLike: string, mode: OpenMode, size: number): Promise<IOFile> {
    const flags = this.toFlags(mode);
    // Delete the file rather than truncating it, so hard links to it aren't written through
    await FsUtil.rm(pathLike, { force: true });

    // Open the new file for writing so it can be sized, even if the requested flags are read-only
    const fileHandle = await fs.promises.open(
      pathLike,
      (flags & ~(fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_TRUNC)) |
        fs.constants.O_RDWR |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL,
    );
    try {
      await this.closeOnError(fileHandle, async () => {
        await fileHandle.truncate(size);
      });
    } catch (error) {
      // Don't leave a partially written file behind
      await FsUtil.rm(pathLike, { force: true });
      throw error;
    }

    // The file is all zeros, so don't read any of it from disk
    return new IOFile(pathLike, fileHandle, flags, true, size, 0);
  }

  /**
   * Run {@link callback}, and if it throws, close {@link fileHandle} before rethrowing. If closing
   * also fails, both errors are thrown together, so the close error doesn't hide the error that
   * came before it.
   * @returns what {@link callback} returns
   */
  private static async closeOnError<T>(
    fileHandle: fs.promises.FileHandle,
    callback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      try {
        await fileHandle.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          `${error instanceof Error ? error.message : 'unknown error'}, and then failed to close the file`,
          { cause: closeError },
        );
      }
      throw error;
    }
  }

  /**
   * @returns whether the numeric file system flags {@link flags} open a file for writing
   */
  private static hasWriteFlag(flags: number): boolean {
    return (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) !== 0;
  }

  /**
   * Convert the file system flags {@link mode} to their numeric form, the same way Node.js does.
   * @see https://nodejs.org/api/fs.html#file-system-flags
   * @returns the numeric flags
   */
  private static toFlags(mode: fs.Mode): number {
    if (typeof mode === 'number') {
      if (!Number.isSafeInteger(mode) || mode < -0x80_00_00_00 || mode > 0x7f_ff_ff_ff) {
        throw new RangeError(
          `The value of "flags" is out of range. It must be a 32-bit integer. Received ${mode}`,
        );
      }
      return mode;
    }

    const match = /^(r|rs|sr|w|wx|xw|a|ax|xa|as|sa)(\+?)$/.exec(mode);
    if (match === null) {
      throw new IgirException(`invalid file system flags: ${mode}`);
    }
    const [, letters, plus] = match;
    return (
      (plus === '+' ? fs.constants.O_RDWR : 0) |
      (plus === '' && !letters.includes('r') ? fs.constants.O_WRONLY : 0) |
      (letters.includes('w') ? fs.constants.O_TRUNC | fs.constants.O_CREAT : 0) |
      (letters.includes('a') ? fs.constants.O_APPEND | fs.constants.O_CREAT : 0) |
      (letters.includes('x') ? fs.constants.O_EXCL : 0) |
      (letters.includes('s') ? fs.constants.O_SYNC : 0)
    );
  }

  getPathLike(): PathLike {
    return this.pathLike;
  }

  /**
   * @returns whether the seek position has reached the end of the file
   */
  isEOF(): boolean {
    return this.getPosition() >= this.getSize();
  }

  getPosition(): number {
    return this.seekPosition;
  }

  getSize(): number {
    return this.fileSize;
  }

  /**
   * Seek to {@link position} in the file.
   */
  seek(position: number): void {
    this.seekPosition = position;
  }

  /**
   * Advance the seek position by {@link size} bytes.
   */
  skipNext(size: number): void {
    this.seekPosition += size;
  }

  /**
   * @returns up to {@link maxSize} bytes from the current seek position, fewer at the end of the
   * file, without changing the seek position
   */
  async peekNext(maxSize: number): Promise<Buffer> {
    return await this.readAt(this.seekPosition, maxSize);
  }

  /**
   * Read up to {@link maxSize} bytes from the current seek position, fewer at the end of the file,
   * and advance the seek position by {@link maxSize}.
   * @returns the bytes read
   */
  async readNext(maxSize: number): Promise<Buffer> {
    const result = await this.readAt(this.seekPosition, maxSize);
    this.seekPosition += maxSize;
    return result;
  }

  /**
   * @returns up to {@link maxSize} bytes starting at {@link position}, fewer at the end of the
   * file, without changing the seek position
   */
  async readAt(position: number, maxSize: number): Promise<Buffer> {
    this.assertOpen();
    this.assertPosition(position);
    const end = Math.min(position + maxSize, this.fileSize);
    if (position >= end) {
      return Buffer.alloc(0);
    }

    const result = Buffer.allocUnsafe(end - position);
    const cachedPage = this.getCachedPageOfRegion(position, result.length);
    if (cachedPage !== undefined) {
      const pageOffset = position % Defaults.IO_FILE_PAGE_SIZE;
      const copied = cachedPage.data.copy(result, 0, pageOffset, pageOffset + result.length);
      return copied < result.length ? result.subarray(0, copied) : result;
    }

    let resultSize = 0;
    await this.visitPages(position, result.length, false, (page, pageOffset, resultOffset) => {
      const copied = page.data.copy(
        result,
        resultOffset,
        pageOffset,
        pageOffset + result.length - resultOffset,
      );
      resultSize = resultOffset + copied;
      return copied;
    });
    // The file may have been truncated while waiting to read from disk
    return resultSize < result.length ? result.subarray(0, resultSize) : result;
  }

  /**
   * Read up to {@link maxSize} bytes from the current seek position, stopping before the first
   * {@link delimiter} byte. Each call reads at most {@link Defaults.FILE_READING_CHUNK_SIZE}
   * bytes, so it can stop before finding the delimiter or reaching {@link maxSize}; call it again
   * to keep reading. The seek position advances past the bytes read, and past the delimiter if it
   * was found.
   * @returns the bytes read, and whether the delimiter was found
   */
  async readUntil(
    delimiter: number,
    maxSize: number,
  ): Promise<{ data: Buffer; isDelimiterFound: boolean }> {
    this.assertOpen();
    this.assertPosition(this.seekPosition);
    const searchSize = Math.max(
      0,
      Math.min(maxSize, Defaults.FILE_READING_CHUNK_SIZE, this.fileSize - this.seekPosition),
    );

    const parts: Buffer[] = [];
    const pinnedPages: IOFilePage[] = [];
    let delimiterIndex = -1;
    let data: Buffer;
    try {
      await this.visitPages(this.seekPosition, searchSize, false, (page, pageOffset, visited) => {
        // Loading the next page can evict this one, so keep its memory from being reused until
        // the bytes before the delimiter are copied out
        page.pins += 1;
        pinnedPages.push(page);
        const part = page.data.subarray(pageOffset, pageOffset + searchSize - visited);
        delimiterIndex = part.indexOf(delimiter);
        if (delimiterIndex === -1) {
          parts.push(part);
          return part.length;
        }
        parts.push(part.subarray(0, delimiterIndex));
        return searchSize - visited;
      });
      // Copy the bytes out of the pages once, now that the delimiter's position is known
      data = Buffer.concat(parts);
    } finally {
      for (const page of pinnedPages) {
        page.pins -= 1;
      }
    }

    const isDelimiterFound = delimiterIndex !== -1;
    this.seekPosition += data.length + (isDelimiterFound ? 1 : 0);
    return { data, isDelimiterFound };
  }

  /**
   * Write {@link buffer} at the current seek position, or at the end of the file if it was opened
   * for appending, and advance the seek position past it.
   */
  async write(buffer: Buffer): Promise<number> {
    if (this.isAppending) {
      this.seekPosition = this.fileSize;
    }
    const bytesWritten = await this.writeAt(buffer, this.seekPosition);
    this.seekPosition += buffer.length;
    return bytesWritten;
  }

  /**
   * Write {@link buffer} at {@link position}, or at the end of the file if it was opened for
   * appending, without changing the seek position.
   */
  async writeAt(buffer: Buffer, position: number): Promise<number> {
    this.assertOpen();
    if (!this.isWritable) {
      throw new IgirException(`can't write to read-only file: ${this.pathLike.toString()}`);
    }
    const writePosition = this.isAppending ? this.fileSize : position;
    this.assertPosition(writePosition);

    if (!this.isReadable) {
      const { bytesWritten } = await this.fileHandle.write(buffer, 0, buffer.length, writePosition);
      this.fileSize = Math.max(this.fileSize, writePosition + bytesWritten);
      this.diskContentsEnd = Math.max(this.diskContentsEnd, writePosition + bytesWritten);
      return bytesWritten;
    }

    const cachedPage = this.getCachedPageOfRegion(writePosition, buffer.length);
    if (cachedPage === undefined) {
      await this.visitPages(writePosition, buffer.length, true, (page, pageOffset, bufferOffset) =>
        this.writeToPage(page, pageOffset, buffer, bufferOffset, writePosition),
      );
    } else {
      this.writeToPage(
        cachedPage,
        writePosition % Defaults.IO_FILE_PAGE_SIZE,
        buffer,
        0,
        writePosition,
      );
    }

    // Yield to the event loop after every chunk written, so progress bars can redraw
    this.bytesSinceYield += buffer.length;
    if (this.bytesSinceYield >= Defaults.FILE_READING_CHUNK_SIZE) {
      this.bytesSinceYield = 0;
      await new Promise((resolve) => setImmediate(resolve));
    }

    return buffer.length;
  }

  /**
   * Stage the bytes of {@link buffer} from {@link bufferOffset} onward that fit in {@link page},
   * starting at {@link pageOffset}, as part of a write of {@link buffer} at {@link writePosition}.
   * @returns the number of bytes staged
   */
  private writeToPage(
    page: IOFilePage,
    pageOffset: number,
    buffer: Buffer,
    bufferOffset: number,
    writePosition: number,
  ): number {
    const copyEnd = Math.min(pageOffset + buffer.length - bufferOffset, Defaults.IO_FILE_PAGE_SIZE);
    IOFile.reservePage(page, copyEnd);
    page.isDirty = true;
    const copied = buffer.copy(
      page.data,
      pageOffset,
      bufferOffset,
      bufferOffset + copyEnd - pageOffset,
    );
    // Grow the file as each page is staged, because a write larger than the cache evicts its own
    // dirty pages partway through, and only the bytes within the file's size are written to disk.
    // A write that fails partway through grows the file by only the bytes it staged.
    this.growFileSize(writePosition + bufferOffset + copied);
    return copied;
  }

  /**
   * Copy the next {@link size} bytes (fewer at the end of the file) from the current seek
   * position to {@link targetIOFile} starting at {@link targetStart}, a page at a time, and
   * advance the seek position by {@link size}.
   * @returns the number of bytes copied
   */
  async copyNext(
    targetIOFile: Pick<IOFile, 'writeAt'>,
    targetStart: number,
    size: number,
  ): Promise<number> {
    const copied = await this.copyRange(
      targetIOFile,
      targetStart,
      this.seekPosition,
      this.seekPosition + size,
    );
    this.seekPosition += size;
    return copied;
  }

  /**
   * Copy bytes from the region [{@link sourceStart}, {@link sourceEnd}) of this file to
   * {@link targetIOFile} starting at {@link targetStart}, a page at a time straight from this
   * file's cached pages. Stops early if this file ends before {@link sourceEnd}.
   * @returns the number of bytes copied
   */
  async copyRange(
    targetIOFile: Pick<IOFile, 'writeAt'>,
    targetStart = 0,
    sourceStart = 0,
    sourceEnd = this.getSize(),
  ): Promise<number> {
    this.assertOpen();
    this.assertPosition(sourceStart);
    this.assertPosition(targetStart);
    const size = sourceEnd - sourceStart;
    // When copying to a later position in this same file, the target starts this many bytes after
    // the source. If they overlap, part of the source is bytes that this copy writes.
    const distance = targetIOFile === this ? targetStart - sourceStart : 0;

    let copied = 0;
    while (copied < size) {
      const writePosition = targetStart + copied;

      // When the copy overlaps, the next byte can be read from any multiple of distance bytes
      // before writePosition. Each step reads from whichever one allows the longest step, without
      // reading unwritten bytes or crossing a page boundary. For example, copying 20 bytes from
      // position 5 to position 8 with 8-byte pages ("r" is read, "w" is written):
      //
      //   before:  |.....abc|________|________|________|
      //
      //                  rrr
      //   step 1:  |.....abc|abc_____|________|________|   source
      //                      www
      //
      //                  rrr
      //   step 2:  |.....abc|abcabc__|________|________|   source
      //                         www
      //
      //                      rrrrrr
      //   step 3:  |.....abc|abcabcab|cabc____|________|   last page written
      //                            ww wwww
      //
      //                      rrrrrrrr
      //   step 4:  |.....abc|abcabcab|cabcabca|bcab____|   page before the last page written
      //                                   wwww wwww
      const lastWrittenPageStart =
        IOFile.nextPageStart(writePosition - 1) - Defaults.IO_FILE_PAGE_SIZE;
      const readPositions =
        distance > 0
          ? [
              // The source, which is limited by its page's end
              sourceStart,
              // The page before the last page written to, which is fully written
              lastWrittenPageStart - Defaults.IO_FILE_PAGE_SIZE,
              // The last page written to, which is limited by writePosition
              lastWrittenPageStart,
            ].map((regionStart) => {
              const searchStart = Math.max(sourceStart, regionStart);
              return searchStart + ((writePosition - searchStart) % distance);
            })
          : // Without overlap, the next byte can only be read from its position in the source
            [sourceStart + copied];

      let readPosition = 0;
      let readEnd = 0;
      for (const position of readPositions) {
        const end = Math.min(
          // Copy straight from one cached page
          IOFile.nextPageStart(position),
          position + size - copied,
          // Only read bytes that were already written
          distance > 0 ? writePosition : Infinity,
          // The copy can grow this file, so check its size every step
          this.fileSize,
        );
        if (!(end - position > readEnd - readPosition)) {
          continue;
        }

        readPosition = position;
        readEnd = end;
      }

      if (readEnd <= readPosition) {
        // This file ends before the source does
        break;
      }
      copied += await this.copyPage(targetIOFile, writePosition, readPosition, readEnd);
    }
    return copied;
  }

  /**
   * Copy the region [{@link sourceStart}, {@link sourceEnd}) of this file, which must be within
   * one page, to {@link targetIOFile} starting at {@link targetStart}, straight from the cached
   * page.
   * @returns the number of bytes copied
   */
  private async copyPage(
    targetIOFile: Pick<IOFile, 'writeAt'>,
    targetStart: number,
    sourceStart: number,
    sourceEnd: number,
  ): Promise<number> {
    let pinnedPage: IOFilePage | undefined;
    let source: Buffer | undefined;
    await this.visitPages(sourceStart, sourceEnd - sourceStart, false, (page, pageOffset) => {
      // Writing to the target can evict the page, so keep its memory from being reused meanwhile
      page.pins += 1;
      pinnedPage = page;
      source = page.data.subarray(pageOffset, pageOffset + sourceEnd - sourceStart);
      return source.length;
    });
    if (pinnedPage === undefined || source === undefined) {
      // The file was truncated before the region while waiting to read from disk
      return 0;
    }

    try {
      return await targetIOFile.writeAt(source, targetStart);
    } finally {
      pinnedPage.pins -= 1;
    }
  }

  /**
   * Truncate or zero-extend the file to {@link size} bytes.
   */
  async truncate(size: number): Promise<void> {
    await this.pagesMutex.runExclusive(async () => {
      this.assertOpen();
      await this.fileHandle.truncate(size);
      // Like a FileHandle, a negative size truncates the file to zero bytes
      this.fileSize = Math.max(0, size);
      // Zero-extending the file doesn't add any contents to read from disk
      this.diskContentsEnd = Math.min(this.diskContentsEnd, this.fileSize);

      for (const [pageIndex, page] of this.pages) {
        const pageSize = this.fileSize - pageIndex * Defaults.IO_FILE_PAGE_SIZE;
        if (pageSize <= 0) {
          this.pages.delete(pageIndex);
          continue;
        }
        // Zero the bytes past the new end, so growing the file later can't expose them
        page.data.fill(0, Math.min(pageSize, page.data.length));
        IOFile.reservePage(page, Math.min(pageSize, Defaults.IO_FILE_PAGE_SIZE));
      }
    });
  }

  /**
   * Write any staged writes to disk, and close the underlying file handle. Closing a closed file
   * does nothing.
   */
  async close(): Promise<void> {
    await this.pagesMutex.runExclusive(async () => {
      if (this.isClosed) {
        return;
      }
      try {
        // Close the handle even if flushing the staged writes failed
        await IOFile.closeOnError(this.fileHandle, async () => {
          // Write every page with staged writes, combining consecutive pages into fewer writes
          for (const [pageIndex, page] of this.pages) {
            if (page.isDirty) {
              await this.writeDirtyRun(pageIndex);
            }
          }
          if (this.isWritable && this.fileSize > this.diskContentsEnd) {
            // Zero-extend the file to the size it was written to, or was expected to be
            await this.fileHandle.truncate(this.fileSize);
          }
        });
      } finally {
        this.isClosed = true;
        this.pages.clear();
      }
      await this.fileHandle.close();
    });
  }

  /**
   * Throw if the file has been closed, as its handle can't be used and its pages are gone.
   */
  private assertOpen(): void {
    if (this.isClosed) {
      throw new IgirException(`can't use closed file: ${this.pathLike.toString()}`);
    }
  }

  /**
   * Throw if {@link position} is before the start of the file.
   */
  private assertPosition(position: number): void {
    if (position < 0) {
      throw new IgirException(
        `can't use negative position ${position} in file: ${this.pathLike.toString()}`,
      );
    }
  }

  /**
   * Call {@link visit} with each page in the region [{@link position}, {@link position} +
   * {@link size}), in order, with the offset into the page and the number of bytes already
   * visited. {@link visit} returns the number of bytes it visited in the page.
   *
   * Cached pages are visited without locking, as visiting them doesn't await. Only once a page
   * needs to be read from disk are the remaining pages visited under the lock. A read stops early
   * if the file was truncated before the end of the region while waiting for the lock.
   * @returns a promise if a page needs to be read from disk, otherwise nothing, so visiting only
   * cached pages doesn't wait on a promise
   */
  private visitPages(
    position: number,
    size: number,
    isWrite: boolean,
    visit: (page: IOFilePage, pageOffset: number, visited: number) => number,
  ): Promise<void> | undefined {
    let visited = 0;

    // A locked operation may be midway through evicting a page, so wait for it
    if (!this.pagesMutex.isLocked()) {
      while (visited < size) {
        const page = this.getCachedPage(
          Math.floor((position + visited) / Defaults.IO_FILE_PAGE_SIZE),
        );
        if (page === undefined) {
          break;
        }
        visited += visit(page, (position + visited) % Defaults.IO_FILE_PAGE_SIZE, visited);
      }
    }

    if (visited >= size) {
      return undefined;
    }

    return this.pagesMutex.runExclusive(async () => {
      // The file may have been closed while waiting for the lock, which also clears the cache
      this.assertOpen();
      // The file may also have been truncated while waiting, so don't read past its new end
      const visitSize = isWrite ? size : Math.min(size, this.fileSize - position);
      while (visited < visitSize) {
        const pageIndex = Math.floor((position + visited) / Defaults.IO_FILE_PAGE_SIZE);
        const page =
          this.getCachedPage(pageIndex) ??
          (await this.loadPages(pageIndex, position, visitSize, isWrite));
        visited += visit(page, (position + visited) % Defaults.IO_FILE_PAGE_SIZE, visited);
      }
    });
  }

  /**
   * Find the cached page holding all of the non-empty region [{@link position}, {@link position} +
   * {@link size}), marking it as the most recently used. Reads and writes within one cached page,
   * the common case for small ones, can use it directly, without the closure and promise that
   * {@link visitPages} needs.
   * @returns the page, or undefined if the region is empty, spans more than one page, isn't
   * cached, or a locked operation may be midway through evicting it
   */
  private getCachedPageOfRegion(position: number, size: number): IOFilePage | undefined {
    if (size <= 0 || this.pagesMutex.isLocked()) {
      return undefined;
    }
    const pageIndex = Math.floor(position / Defaults.IO_FILE_PAGE_SIZE);
    if (Math.floor((position + size - 1) / Defaults.IO_FILE_PAGE_SIZE) !== pageIndex) {
      return undefined;
    }
    return this.getCachedPage(pageIndex);
  }

  /**
   * Find the page with index {@link pageIndex} in the cache, marking it as the most recently used.
   * @returns the page, or undefined if it isn't cached
   */
  private getCachedPage(pageIndex: number): IOFilePage | undefined {
    const page = this.pages.get(pageIndex);
    if (page !== undefined && pageIndex !== this.mostRecentPageIndex) {
      // Move the page to the most recently used end
      this.pages.delete(pageIndex);
      this.pages.set(pageIndex, page);
      this.mostRecentPageIndex = pageIndex;
    }
    return page;
  }

  /**
   * Load the uncached page with index {@link pageIndex}, along with every consecutive uncached
   * page after it within the region [{@link position}, {@link position} + {@link size}), from
   * disk into the cache at once, evicting the least recently used pages to make room. If the rest
   * of the region gets loaded, the same number of uncached pages as had to be read from disk are
   * also read ahead after it, because reads and writes tend to be sequential.
   * @returns the page with index {@link pageIndex}
   */
  private async loadPages(
    pageIndex: number,
    position: number,
    size: number,
    isWrite: boolean,
  ): Promise<IOFilePage> {
    if (!this.isReadable) {
      throw new IgirException(`can't read from write-only file: ${this.pathLike.toString()}`);
    }

    const end = position + size;
    const isOverwrites =
      isWrite &&
      Math.floor(end / Defaults.IO_FILE_PAGE_SIZE) >
        Math.ceil(position / Defaults.IO_FILE_PAGE_SIZE);
    const overwriteStart = isOverwrites
      ? Math.ceil(position / Defaults.IO_FILE_PAGE_SIZE)
      : Infinity;
    const overwriteEnd = isOverwrites ? Math.floor(end / Defaults.IO_FILE_PAGE_SIZE) : Infinity;

    const lastPageIndex = Math.floor((end - 1) / Defaults.IO_FILE_PAGE_SIZE);
    let pageCount = 1;
    while (pageIndex + pageCount <= lastPageIndex && !this.pages.has(pageIndex + pageCount)) {
      pageCount += 1;
    }
    if (pageIndex + pageCount > lastPageIndex) {
      const readCount =
        pageCount -
        Math.max(
          0,
          Math.min(pageIndex + pageCount, overwriteEnd) - Math.max(pageIndex, overwriteStart),
        );
      // Only read ahead pages with contents on disk
      const readAheadEnd = Math.min(
        pageIndex + pageCount + readCount,
        Math.ceil(Math.min(this.diskContentsEnd, this.fileSize) / Defaults.IO_FILE_PAGE_SIZE),
      );
      while (pageIndex + pageCount < readAheadEnd && !this.pages.has(pageIndex + pageCount)) {
        pageCount += 1;
      }
    }

    // Don't load more pages than the cache can hold
    const maxPages = Math.max(
      1,
      Math.floor(Defaults.MAX_IO_FILE_CACHE_SIZE / Defaults.IO_FILE_PAGE_SIZE),
    );
    const loadEnd = pageIndex + Math.min(pageCount, maxPages);

    // Make room in the cache, reusing the evicted pages' memory
    const evictedBuffers: Buffer[] = [];
    for (const [cachedPageIndex, page] of this.pages) {
      if (this.pages.size + loadEnd - pageIndex <= maxPages) {
        break;
      }
      if (page.isDirty) {
        await this.writeDirtyRun(cachedPageIndex);
      }
      this.pages.delete(cachedPageIndex);
      if (page.pins > 0) {
        // A copy is still reading from the page's memory
        continue;
      }
      evictedBuffers.push(page.data);
    }

    const loadedPages: IOFilePage[] = [];
    for (let loadIndex = pageIndex; loadIndex < loadEnd; loadIndex += 1) {
      // Only hold the part of the page within the file, which grows as the file does
      const pageSize = Math.min(
        Math.max(this.fileSize, isWrite ? end : 0) - loadIndex * Defaults.IO_FILE_PAGE_SIZE,
        Defaults.IO_FILE_PAGE_SIZE,
      );
      const evictedBuffer = evictedBuffers.pop();
      loadedPages.push({
        data: evictedBuffer?.length === pageSize ? evictedBuffer : Buffer.allocUnsafe(pageSize),
        isDirty: false,
        pins: 0,
      });
    }

    // Read the pages before and after the overwritten ones
    const runs: [number, number][] = [
      [pageIndex, Math.min(overwriteStart, loadEnd)],
      [Math.max(overwriteEnd, pageIndex), loadEnd],
    ];
    for (const [runStart, runEnd] of runs) {
      if (runEnd > runStart) {
        await this.readPages(runStart, loadedPages.slice(runStart - pageIndex, runEnd - pageIndex));
      }
    }

    // Cache the first page last, as the most recently used, as the pages after it may have been
    // read ahead. The rest of the pages that were asked for are marked as used when visited.
    for (let loadIndex = loadEnd - 1; loadIndex >= pageIndex; loadIndex -= 1) {
      this.pages.set(loadIndex, loadedPages[loadIndex - pageIndex]);
    }
    this.mostRecentPageIndex = pageIndex;
    return loadedPages[0];
  }

  /**
   * Read the consecutive {@link pages}, starting at page index {@link firstPageIndex}, from disk,
   * at most {@link Defaults.FILE_READING_CHUNK_SIZE} bytes at a time.
   */
  private async readPages(firstPageIndex: number, pages: IOFilePage[]): Promise<void> {
    const runStart = firstPageIndex * Defaults.IO_FILE_PAGE_SIZE;
    const buffers = pages.map((page) => page.data);
    // Past the end of the file's contents on disk is all zeros, so don't read it
    const runEnd = Math.min(
      buffers.reduce((end, buffer) => end + buffer.length, runStart),
      this.diskContentsEnd,
    );

    let position = runStart;
    while (position < runEnd) {
      const readEnd = Math.min(position + Defaults.FILE_READING_CHUNK_SIZE, runEnd);
      const { bytesRead } = await this.fileHandle.readv(
        IOFile.subarrays(buffers, runStart, position, readEnd),
        position,
      );
      if (bytesRead === 0) {
        // The file is shorter on disk than expected
        break;
      }
      position += bytesRead;
    }

    for (const [pageOffset, buffer] of buffers.entries()) {
      const readBytes = position - runStart - pageOffset * Defaults.IO_FILE_PAGE_SIZE;
      buffer.fill(0, Math.min(buffer.length, Math.max(0, readBytes)));
    }
  }

  /**
   * Write the page with index {@link pageIndex} to disk, along with every consecutive page with
   * staged writes around it, because those are likely to be evicted soon too, at most
   * {@link Defaults.FILE_READING_CHUNK_SIZE} bytes at a time. The pages stay cached.
   */
  private async writeDirtyRun(pageIndex: number): Promise<void> {
    let firstPageIndex = pageIndex;
    while (this.pages.get(firstPageIndex - 1)?.isDirty === true) {
      firstPageIndex -= 1;
    }

    const runPages: IOFilePage[] = [];
    let page = this.pages.get(firstPageIndex);
    while (page?.isDirty === true) {
      runPages.push(page);
      page = this.pages.get(firstPageIndex + runPages.length);
    }

    const runStart = firstPageIndex * Defaults.IO_FILE_PAGE_SIZE;
    const buffers = runPages.map((runPage) => runPage.data);
    // Don't write the zeros past the end of the file
    const runEnd = Math.min(runStart + runPages.length * Defaults.IO_FILE_PAGE_SIZE, this.fileSize);

    let position = runStart;
    while (position < runEnd) {
      const writeEnd = Math.min(position + Defaults.FILE_READING_CHUNK_SIZE, runEnd);
      const { bytesWritten } = await this.fileHandle.writev(
        IOFile.subarrays(buffers, runStart, position, writeEnd),
        position,
      );
      if (bytesWritten === 0) {
        throw new IgirException(`failed to write to file: ${this.pathLike.toString()}`);
      }
      position += bytesWritten;
      this.diskContentsEnd = Math.max(this.diskContentsEnd, position);
    }

    for (const runPage of runPages) {
      runPage.isDirty = false;
    }
  }

  /**
   * Find the parts of the consecutive page {@link buffers}, the first of which starts at the file
   * position {@link runStart}, that hold the region [{@link start}, {@link end}) of the file.
   * @returns the parts of the buffers, in order
   */
  private static subarrays(
    buffers: Buffer[],
    runStart: number,
    start: number,
    end: number,
  ): Buffer[] {
    const parts: Buffer[] = [];
    let position = start;
    while (position < end) {
      const runOffset = position - runStart;
      const pageOffset = runOffset % Defaults.IO_FILE_PAGE_SIZE;
      const part = buffers[Math.floor(runOffset / Defaults.IO_FILE_PAGE_SIZE)].subarray(
        pageOffset,
        pageOffset + end - position,
      );
      parts.push(part);
      position += part.length;
    }
    return parts;
  }

  /**
   * Grow {@link page}'s memory to hold at least {@link size} bytes, if it's smaller. Its memory at
   * least doubles, so a page grown by many small writes isn't copied for every one.
   */
  private static reservePage(page: IOFilePage, size: number): void {
    if (page.data.length >= size) {
      return;
    }
    // Zero-filled, as past the end of the file is all zeros
    const data = Buffer.alloc(
      Math.min(Math.max(size, page.data.length * 2), Defaults.IO_FILE_PAGE_SIZE),
    );
    page.data.copy(data);
    page.data = data;
  }

  /**
   * Grow the file to {@link size} bytes, if it's smaller, growing the page that the file ended in
   * to hold the bytes that are now within the file.
   */
  private growFileSize(size: number): void {
    if (size <= this.fileSize) {
      return;
    }
    const lastPageIndex = Math.floor((this.fileSize - 1) / Defaults.IO_FILE_PAGE_SIZE);
    const lastPage = this.fileSize > 0 ? this.pages.get(lastPageIndex) : undefined;
    if (lastPage !== undefined) {
      IOFile.reservePage(
        lastPage,
        Math.min(size - lastPageIndex * Defaults.IO_FILE_PAGE_SIZE, Defaults.IO_FILE_PAGE_SIZE),
      );
    }
    this.fileSize = size;
  }

  /**
   * @returns the start of the page after the one {@link position} is in
   */
  private static nextPageStart(position: number): number {
    return (Math.floor(position / Defaults.IO_FILE_PAGE_SIZE) + 1) * Defaults.IO_FILE_PAGE_SIZE;
  }
}
