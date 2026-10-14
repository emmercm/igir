import type { OpenMode, PathLike } from 'node:fs';
import fs from 'node:fs';

import Defaults from '../../globals/defaults.js';
import FsUtil from '../../utils/fsUtil.js';

/**
 * A wrapper for readable and writable files
 */
export default class IOFile {
  private readonly pathLike: PathLike;
  private readonly fileHandle: fs.promises.FileHandle;
  private readonly fileMode: fs.Mode;

  private size: number;
  private readPosition = 0;
  private fileBuffer?: Buffer;
  private wroteToMemory = false;

  private constructor(
    pathLike: PathLike,
    fileHandle: fs.promises.FileHandle,
    fileMode: fs.Mode,
    size: number,
  ) {
    this.pathLike = pathLike;
    this.fileHandle = fileHandle;
    this.fileMode = fileMode;
    this.size = size;
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

    return new IOFile(
      pathLike,
      await fs.promises.open(pathLike, finalMode),
      finalMode,
      expectedSize ?? (await FsUtil.size(pathLike)),
    );
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

    const write = await this.fileFrom(pathLike, 'wx+', size);
    try {
      try {
        let written = 0;
        const buffer = Buffer.alloc(Defaults.FILE_READING_CHUNK_SIZE);
        while (written < size) {
          const sizeToWrite = Math.min(size - written, buffer.length);
          written += await write.write(buffer.subarray(0, sizeToWrite));
        }
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

  private async loadFileBuffer(): Promise<Buffer> {
    this.fileBuffer ??= await this.fileHandle.readFile();
    return this.fileBuffer;
  }

  /**
   * @returns bytes of size {@link size} at the seek position {@link offset}
   */
  async readAt(position: number, size: number): Promise<Buffer> {
    // If the file is small, read the entire file to memory and "read" from there
    if (this.fileBuffer !== undefined || this.size <= Defaults.MAX_MEMORY_FILE_SIZE) {
      // Read into the file buffer (if we haven't already)
      const fileBuffer = await this.loadFileBuffer();

      // Read from the file buffer, which may have been allocated past the end of the file
      return Buffer.from(
        fileBuffer.subarray(position, Math.max(position, Math.min(position + size, this.size))),
      );
    }

    // If the file is large, read from the open file handle. Each read gets its own buffer so
    // concurrent reads can't overwrite each other's bytes
    const buffer = Buffer.allocUnsafe(size);
    let bytesRead: number;
    try {
      bytesRead = (await this.fileHandle.read(buffer, 0, size, position)).bytesRead;
    } catch {
      // NOTE(cemmer): Windows will give "EINVAL: invalid argument, read" when reading out of
      //  bounds, but other OSes don't. Swallow the error.
      return Buffer.allocUnsafe(0);
    }

    return buffer.subarray(0, bytesRead);
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
   * Write {@link buffer} at the seek position {@link offset}
   */
  async writeAt(buffer: Buffer, position: number): Promise<number> {
    // If the file is small, write to memory
    if (
      (this.fileBuffer !== undefined || this.size <= Defaults.MAX_MEMORY_FILE_SIZE) &&
      /w|a|r\+/.test(this.fileMode.toString())
    ) {
      // Read into the file buffer (if we haven't already)
      this.fileBuffer = await this.loadFileBuffer();

      // Expand the file buffer if we're writing past its size
      if (position + buffer.length > this.fileBuffer.length) {
        this.fileBuffer = Buffer.concat([
          this.fileBuffer,
          Buffer.alloc(
            Math.max(
              // We only need this many more bytes to write the requested bytes...
              position + buffer.length - this.fileBuffer.length,
              // ...but if we know the final file size, just allocate the full amount,
              // because constant buffer allocation can be very expensive
              this.size,
            ),
          ),
        ]);
      }

      // Write to the file buffer
      const bytesWritten = buffer.copy(this.fileBuffer, position);
      this.size = Math.max(this.size, position + bytesWritten);
      this.wroteToMemory = true;

      // Yield to the event loop so progress bars can redraw
      if (bytesWritten > 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      return bytesWritten;
    }

    const { bytesWritten } = await this.fileHandle.write(buffer, 0, buffer.length, position);
    this.size = Math.max(this.size, position + bytesWritten);
    return bytesWritten;
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
    if (this.fileBuffer !== undefined) {
      if (size > this.fileBuffer.length) {
        this.fileBuffer = Buffer.concat([
          this.fileBuffer,
          Buffer.alloc(size - this.fileBuffer.length),
        ]);
      } else {
        // Drop the bytes past the new end, so growing the file later can't expose them
        this.fileBuffer = this.fileBuffer.subarray(0, size);
      }
    }
    await this.fileHandle.truncate(size);
    this.size = size;
  }

  /**
   * Close the underlying file handle
   */
  async close(): Promise<void> {
    try {
      if (this.fileBuffer !== undefined && this.wroteToMemory) {
        // We staged writes in memory, we need to rewrite the entire file
        await this.fileHandle.write(this.fileBuffer, 0, this.size, 0);
      }
    } finally {
      // Close the handle even if flushing the staged writes failed
      await this.fileHandle.close();
    }
  }
}
