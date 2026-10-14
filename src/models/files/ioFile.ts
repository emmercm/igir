import type { OpenMode, PathLike } from 'node:fs';
import fs from 'node:fs';

import { Mutex } from 'async-mutex';

import Defaults from '../../globals/defaults.js';
import FsUtil from '../../utils/fsUtil.js';

/**
 * A page of an {@link IOFile}'s contents, cached in memory.
 */
interface IOFilePage {
  readonly data: Buffer;
  // If the page has been written to since it was read from disk
  dirty: boolean;
}

/**
 * A wrapper for readable and writable files.
 *
 * Reads and writes go through an in-memory cache of the file's contents, in pages of
 * {@link Defaults.FILE_READING_CHUNK_SIZE} bytes, up to {@link Defaults.MAX_IO_FILE_CACHE_SIZE}
 * bytes per file. Files that fit within the limit end up entirely in memory, and larger files keep
 * their most recently used pages. Writes are staged in memory, and written to disk when their page
 * is evicted or the file is closed.
 */
export default class IOFile {
  private readonly pathLike: PathLike;
  private readonly fileHandle: fs.promises.FileHandle;
  private readonly writable: boolean;

  private size: number;
  // The size of the file on disk, past which it reads as zeros
  private diskSize: number;
  private readPosition = 0;

  // Cached pages by page index, from least to most recently used
  private readonly pages = new Map<number, IOFilePage>();
  // Load and evict pages one operation at a time, so a page can't be evicted mid-operation.
  // Operations on cached pages don't await, so they don't need it.
  private readonly pagesMutex = new Mutex();
  private wroteToPages = false;

  private constructor(
    pathLike: PathLike,
    fileHandle: fs.promises.FileHandle,
    fileMode: fs.Mode,
    size: number,
    diskSize: number,
  ) {
    this.pathLike = pathLike;
    this.fileHandle = fileHandle;
    this.writable = /w|a|r\+/.test(fileMode.toString());
    this.size = size;
    this.diskSize = diskSize;
  }

  /**
   * Return a new {@link IOFile} from a {@link pathLike}, with the {@link mode} mode.
   */
  static async fileFrom(
    pathLike: PathLike,
    mode: OpenMode,
    expectedSize?: number,
  ): Promise<IOFile> {
    /**
     * "On Linux, positional writes don't work when the file is opened in append mode. The
     *  kernel ignores the position argument and always appends the data to the end of the
     *  file."
     * @see https://nodejs.org/api/fs.html#file-system-flags
     */
    const finalMode = mode.toString().startsWith('a') ? 'r+' : mode;

    const fileHandle = await fs.promises.open(pathLike, finalMode);
    let diskSize: number;
    try {
      diskSize = (await fileHandle.stat()).size;
    } catch (error) {
      await fileHandle.close();
      throw error;
    }

    return new IOFile(pathLike, fileHandle, finalMode, expectedSize ?? diskSize, diskSize);
  }

  /**
   * Return a new {@link IOFile} of size {@link size} from a {@link pathLike}, with the
   * {@link flags} mode. If the {@link pathLike} already exists, the existing file will be
   * deleted.
   */
  static async fileOfSize(pathLike: string, flags: OpenMode, size: number): Promise<IOFile> {
    if (await FsUtil.exists(pathLike)) {
      await FsUtil.rm(pathLike, { force: true });
    }

    const write = await this.fileFrom(pathLike, 'wx+');
    try {
      try {
        await write.truncate(size);
      } finally {
        await write.close();
      }

      return await this.fileFrom(pathLike, flags);
    } catch (error) {
      // Don't leave a partially written file behind
      await FsUtil.rm(pathLike, { force: true });
      throw error;
    }
  }

  getPathLike(): PathLike {
    return this.pathLike;
  }

  /**
   * @returns if the seek position of the file has reached the end
   */
  isEOF(): boolean {
    return this.getPosition() >= this.getSize();
  }

  getPosition(): number {
    return this.readPosition;
  }

  getSize(): number {
    return this.size;
  }

  /**
   * Seek to a specific {@link position} in the file
   */
  seek(position: number): void {
    this.readPosition = position;
  }

  /**
   * Seek to the current position plus {@link size}
   */
  skipNext(size: number): void {
    this.readPosition += size;
  }

  /**
   * @returns the next {@link size} bytes from the current seek position, without changing the
   * seek position
   */
  async peekNext(size: number): Promise<Buffer> {
    return await this.readAt(this.readPosition, size);
  }

  /**
   * @returns the next {@link size} bytes from the current seek position, also incrementing the
   * seek position the same amount
   */
  async readNext(size: number): Promise<Buffer> {
    const result = await this.readAt(this.readPosition, size);
    this.readPosition += size;
    return result;
  }

  /**
   * Read up to {@link maxSize} bytes from the current seek position, stopping before the first
   * {@link delimiter} byte. Reads at most a chunk per call, so it can stop before finding the
   * delimiter or reaching {@link maxSize}; call it again to keep reading. The seek position
   * increments past the bytes read, and past the delimiter if it was found.
   * @returns the bytes read, and if the delimiter was found
   */
  async readUntil(
    delimiter: number,
    maxSize: number,
  ): Promise<{ data: Buffer; delimiterFound: boolean }> {
    const available = await this.peekNext(
      Math.max(0, Math.min(maxSize, Defaults.FILE_READING_CHUNK_SIZE)),
    );
    const delimiterIndex = available.indexOf(delimiter);
    const isDelimiterFound = delimiterIndex !== -1;

    const data = isDelimiterFound ? available.subarray(0, delimiterIndex) : available;
    this.readPosition += data.length + (isDelimiterFound ? 1 : 0);
    return { data, delimiterFound: isDelimiterFound };
  }

  /**
   * @returns bytes of size {@link size} (fewer at the end of the file) at the seek position
   * {@link position}
   */
  async readAt(position: number, size: number): Promise<Buffer> {
    const end = Math.min(position + size, this.size);
    if (position >= end) {
      return Buffer.alloc(0);
    }

    const result = Buffer.allocUnsafe(end - position);
    await this.visitPages(position, result.length, false, (page, pageOffset, resultOffset) =>
      page.data.copy(result, resultOffset, pageOffset, pageOffset + result.length - resultOffset),
    );
    return result;
  }

  /**
   * Write {@link buffer} to the current seek position
   */
  async write(buffer: Buffer): Promise<number> {
    const bytesWritten = await this.writeAt(buffer, this.readPosition);
    this.readPosition += buffer.length;
    return bytesWritten;
  }

  /**
   * Write {@link buffer} at the seek position {@link position}
   */
  async writeAt(buffer: Buffer, position: number): Promise<number> {
    if (!this.writable) {
      // The file isn't writable, let the file handle throw
      const { bytesWritten } = await this.fileHandle.write(buffer, 0, buffer.length, position);
      return bytesWritten;
    }

    await this.visitPages(position, buffer.length, true, (page, pageOffset, bufferOffset) => {
      page.dirty = true;
      return buffer.copy(page.data, pageOffset, bufferOffset);
    });
    this.size = Math.max(this.size, position + buffer.length);
    this.wroteToPages = true;

    // Yield to the event loop so progress bars can redraw
    if (buffer.length > 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    return buffer.length;
  }

  /**
   * Copy bytes from the region [{@link sourceStart}, {@link sourceEnd}) of this file to
   * {@link target} starting at {@link targetStart}, a chunk at a time, like
   * {@link Buffer.copy}. Stops early if this file ends before {@link sourceEnd}.
   *
   * Unlike {@link Buffer.copy}, when {@link target} is this file and the target region starts
   * after the source region, the copy moves forward: bytes written earlier in the copy are read
   * again later in it, which repeats them (LZ77-style).
   * @returns the number of bytes copied
   */
  async copyChunked(
    target: IOFile,
    targetStart = 0,
    sourceStart = 0,
    sourceEnd = this.getSize(),
  ): Promise<number> {
    const distance = targetStart - sourceStart;
    if (
      target === this &&
      distance > 0 &&
      distance < Math.min(sourceEnd - sourceStart, Defaults.FILE_READING_CHUNK_SIZE)
    ) {
      return await this.copyRepeating(targetStart, sourceStart, sourceEnd - sourceStart);
    }

    // If this copy overlaps itself, the source is at least a chunk behind the target, so each
    // chunk only reads bytes that were already written
    let copied = 0;
    while (sourceStart + copied < sourceEnd) {
      const chunkSize = Math.min(
        sourceEnd - sourceStart - copied,
        Defaults.FILE_READING_CHUNK_SIZE,
      );
      const chunk = await this.readAt(sourceStart + copied, chunkSize);
      if (chunk.length === 0) {
        break;
      }
      copied += await target.writeAt(chunk, targetStart + copied);
      if (chunk.length < chunkSize) {
        break;
      }
    }
    return copied;
  }

  /**
   * Copy the next {@link size} bytes (fewer at the end of the file) from the current seek
   * position to {@link target} starting at {@link targetStart}, a chunk at a time, also
   * incrementing the seek position by {@link size}.
   * @returns the number of bytes copied
   */
  async copyNext(target: IOFile, targetStart: number, size: number): Promise<number> {
    const copied = await this.copyChunked(
      target,
      targetStart,
      this.readPosition,
      this.readPosition + size,
    );
    this.readPosition += size;
    return copied;
  }

  /**
   * Copy {@link size} bytes from {@link sourceStart} of this file to the later, overlapping
   * {@link targetStart}. The copy repeats the bytes between the two starts, so read those once and
   * write their repetitions a chunk at a time, rather than a repetition at a time.
   */
  private async copyRepeating(
    targetStart: number,
    sourceStart: number,
    size: number,
  ): Promise<number> {
    const pattern = await this.readAt(sourceStart, targetStart - sourceStart);
    if (pattern.length < targetStart - sourceStart) {
      // This file ends before the target region, so there's nothing to repeat
      return pattern.length > 0 ? await this.writeAt(pattern, targetStart) : 0;
    }

    // Keep each chunk a whole number of repetitions, so every chunk starts at the pattern's start
    const repetitions = Buffer.alloc(
      Math.min(
        size,
        Defaults.FILE_READING_CHUNK_SIZE - (Defaults.FILE_READING_CHUNK_SIZE % pattern.length),
      ),
      pattern,
    );
    let copied = 0;
    while (copied < size) {
      copied += await this.writeAt(repetitions.subarray(0, size - copied), targetStart + copied);
    }
    return copied;
  }

  /**
   * Truncate or zero-extend the file to {@link size} bytes.
   */
  async truncate(size: number): Promise<void> {
    await this.pagesMutex.runExclusive(async () => {
      await this.fileHandle.truncate(size);
      this.diskSize = size;
      this.size = size;

      for (const [pageIndex, page] of this.pages) {
        const pageStart = pageIndex * Defaults.FILE_READING_CHUNK_SIZE;
        if (pageStart >= size) {
          this.pages.delete(pageIndex);
        } else if (pageStart + Defaults.FILE_READING_CHUNK_SIZE > size) {
          // Zero the bytes past the new end, so growing the file later can't expose them
          page.data.fill(0, size - pageStart);
        }
      }
    });
  }

  /**
   * Write any staged writes to disk, and close the underlying file handle
   */
  async close(): Promise<void> {
    await this.pagesMutex.runExclusive(async () => {
      try {
        await this.flushPages();
        if (this.wroteToPages && this.size > this.diskSize) {
          // Zero-extend the file to the size it was written to, or was expected to be
          await this.fileHandle.truncate(this.size);
        }
      } finally {
        // Close the handle even if flushing the staged writes failed
        this.pages.clear();
        await this.fileHandle.close();
      }
    });
  }

  /**
   * Call {@link visit} with each page in the region [{@link position}, {@link position} +
   * {@link size}), in order, with the offset into the page and the number of bytes already
   * visited. {@link visit} returns the number of bytes it visited in the page.
   *
   * Cached pages are visited without locking, as visiting them doesn't await. Only once a page
   * needs to be read from disk are the remaining pages visited under the lock.
   */
  private async visitPages(
    position: number,
    size: number,
    isWrite: boolean,
    visit: (page: IOFilePage, pageOffset: number, visited: number) => number,
  ): Promise<void> {
    let visited = 0;

    // A locked operation may be mid-way through evicting a page, so wait for it
    if (!this.pagesMutex.isLocked()) {
      while (visited < size) {
        const pageIndex = Math.floor((position + visited) / Defaults.FILE_READING_CHUNK_SIZE);
        const page = this.getCachedPage(pageIndex);
        if (page === undefined) {
          break;
        }
        visited += visit(page, (position + visited) % Defaults.FILE_READING_CHUNK_SIZE, visited);
      }
    }

    if (visited < size) {
      await this.pagesMutex.runExclusive(async () => {
        while (visited < size) {
          const pageIndex = Math.floor((position + visited) / Defaults.FILE_READING_CHUNK_SIZE);
          const pageOffset = (position + visited) % Defaults.FILE_READING_CHUNK_SIZE;
          const page =
            this.getCachedPage(pageIndex) ??
            (await this.loadPage(
              pageIndex,
              // Don't read a page from disk that's about to be entirely overwritten
              isWrite && pageOffset === 0 && size - visited >= Defaults.FILE_READING_CHUNK_SIZE,
            ));
          visited += visit(page, pageOffset, visited);
        }
      });
    }
  }

  /**
   * Find the page with index {@link pageIndex} in the cache, marking it as the most recently used.
   * @returns the page, or undefined if it isn't cached
   */
  private getCachedPage(pageIndex: number): IOFilePage | undefined {
    const page = this.pages.get(pageIndex);
    if (page !== undefined) {
      // Move the page to the most recently used end
      this.pages.delete(pageIndex);
      this.pages.set(pageIndex, page);
    }
    return page;
  }

  /**
   * Read the page with index {@link pageIndex} from disk into the cache, evicting the least
   * recently used page if the cache is full. If {@link isOverwritten} is true, the caller is about
   * to overwrite the whole page, so its contents aren't read.
   * @returns the page
   */
  private async loadPage(pageIndex: number, isOverwritten: boolean): Promise<IOFilePage> {
    const pageStart = pageIndex * Defaults.FILE_READING_CHUNK_SIZE;
    // Writable files can grow into their last page, but read-only files can't
    const pageSize = this.writable
      ? Defaults.FILE_READING_CHUNK_SIZE
      : Math.min(Defaults.FILE_READING_CHUNK_SIZE, this.size - pageStart);

    // Make room if another page would exceed the cache size, reusing the evicted page's memory
    let data: Buffer | undefined;
    if (
      (this.pages.size + 1) * Defaults.FILE_READING_CHUNK_SIZE >
      Defaults.MAX_IO_FILE_CACHE_SIZE
    ) {
      data = await this.evictPage();
    }
    if (data?.length !== pageSize) {
      data = Buffer.allocUnsafe(pageSize);
    }

    if (!isOverwritten) {
      let bytesRead = 0;
      // Past the end of the file on disk is all zeros, so don't read it
      const diskBytes = Math.min(pageSize, this.diskSize - pageStart);
      while (bytesRead < diskBytes) {
        const result = await this.fileHandle.read(
          data,
          bytesRead,
          diskBytes - bytesRead,
          pageStart + bytesRead,
        );
        if (result.bytesRead === 0) {
          break;
        }
        bytesRead += result.bytesRead;
      }
      data.fill(0, bytesRead);
    }

    const page: IOFilePage = { data, dirty: false };
    this.pages.set(pageIndex, page);
    return page;
  }

  /**
   * Evict the least recently used page, writing it to disk first if it has staged writes.
   * @returns the evicted page's memory, to be reused
   */
  private async evictPage(): Promise<Buffer | undefined> {
    const leastRecentlyUsed = this.pages.entries().next();
    if (leastRecentlyUsed.done === true) {
      return undefined;
    }
    const [pageIndex, page] = leastRecentlyUsed.value;
    if (page.dirty) {
      await this.writePages(pageIndex, [page]);
    }
    this.pages.delete(pageIndex);
    return page.data;
  }

  /**
   * Write every page with staged writes to disk, combining consecutive pages into one write
   */
  private async flushPages(): Promise<void> {
    const dirtyPages = [...this.pages]
      .filter(([, page]) => page.dirty)
      .toSorted(([firstIndex], [secondIndex]) => firstIndex - secondIndex);

    let runStart = 0;
    while (runStart < dirtyPages.length) {
      let runEnd = runStart + 1;
      while (
        runEnd < dirtyPages.length &&
        dirtyPages[runEnd][0] === dirtyPages[runEnd - 1][0] + 1
      ) {
        runEnd += 1;
      }
      await this.writePages(
        dirtyPages[runStart][0],
        dirtyPages.slice(runStart, runEnd).map(([, page]) => page),
      );
      runStart = runEnd;
    }
  }

  /**
   * Write the consecutive {@link pages}, starting at page index {@link firstPageIndex}, to disk
   */
  private async writePages(firstPageIndex: number, pages: IOFilePage[]): Promise<void> {
    const position = firstPageIndex * Defaults.FILE_READING_CHUNK_SIZE;
    // Don't write the zeros past the end of the file
    const buffers = pages.map((page, pageOffset) =>
      page.data.subarray(
        0,
        Math.min(
          Defaults.FILE_READING_CHUNK_SIZE,
          this.size - position - pageOffset * Defaults.FILE_READING_CHUNK_SIZE,
        ),
      ),
    );
    const { bytesWritten } = await this.fileHandle.writev(buffers, position);
    this.diskSize = Math.max(this.diskSize, position + bytesWritten);
    for (const page of pages) {
      page.dirty = false;
    }
  }
}
