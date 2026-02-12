import type { OpenMode, PathLike } from 'node:fs';
import fs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';

import Defaults from '../globals/defaults.js';
import FsPoly from './fsPoly.js';

/**
 * A wrapper for readable and writable files
 */
export default class IOFile {
  private readonly pathLike: PathLike;

  private readonly fileHandle: FileHandle;

  private readonly fileMode: fs.Mode;

  private readonly size: number;

  private tempBuffer: Buffer;

  private readPosition = 0;

  private fileBuffer?: Buffer;

  private wroteToMemory = false;

  private constructor(pathLike: PathLike, fileHandle: FileHandle, fileMode: fs.Mode, size: number) {
    this.pathLike = pathLike;
    this.fileHandle = fileHandle;
    this.fileMode = fileMode;
    this.size = size;
    this.tempBuffer = Buffer.allocUnsafe(0);
  }

  /**
   * Return a new {@link IOFile} from a {@link pathLike}, with the {@link mode} mode.
   */
  static async fileFrom(pathLike: PathLike, mode: OpenMode): Promise<IOFile> {
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
      await FsPoly.size(pathLike),
    );
  }

  /**
   * Return a new {@link IOFile} of size {@link size} from a {@link pathLike}, with the
   * {@link flags} mode. If the {@link pathLike} already exists, the existing file will be
   * deleted.
   */
  static async fileOfSize(pathLike: string, flags: OpenMode, size: number): Promise<IOFile> {
    if (await FsPoly.exists(pathLike)) {
      await FsPoly.rm(pathLike, { force: true });
    }

    const write = await this.fileFrom(pathLike, 'wx');
    let written = 0;
    while (written < size) {
      const buffer = Buffer.alloc(Math.min(size - written, Defaults.FILE_READING_CHUNK_SIZE));
      await write.write(buffer);
      written += buffer.length;
    }
    await write.close();

    return await this.fileFrom(pathLike, flags);
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
   * @returns bytes of size {@link size} at the seek position {@link offset}
   */
  async readAt(position: number, size: number): Promise<Buffer> {
    // If the file is small, read the entire file to memory and "read" from there
    if (this.fileBuffer !== undefined || this.size <= Defaults.MAX_MEMORY_FILE_SIZE) {
      // Read into the file buffer (if we haven't already)
      this.fileBuffer ??= await FsPoly.readFile(this.fileHandle.fd);

      // Read from the file buffer
      return Buffer.from(this.fileBuffer.subarray(position, position + size));
    }

    if (size > this.tempBuffer.length) {
      this.tempBuffer = Buffer.allocUnsafe(Math.max(size, Defaults.FILE_READING_CHUNK_SIZE));
    }

    // If the file is large, read from the open file handle
    let bytesRead = 0;
    try {
      bytesRead = (await this.fileHandle.read(this.tempBuffer, 0, size, position)).bytesRead;
    } catch {
      // NOTE(cemmer): Windows will give "EINVAL: invalid argument, read" when reading out of
      //  bounds, but other OSes don't. Swallow the error.
      return Buffer.alloc(0);
    }

    return Buffer.from(this.tempBuffer.subarray(0, bytesRead));
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
      this.fileBuffer ??= await FsPoly.readFile(this.fileHandle.fd);

      // Expand the file buffer if we're writing past its size
      if (position + buffer.length > this.fileBuffer.length) {
        this.fileBuffer = Buffer.concat([
          this.fileBuffer,
          Buffer.alloc(position + buffer.length - this.fileBuffer.length),
        ]);
      }

      // Write to the file buffer
      const bytesWritten = buffer.copy(this.fileBuffer, position);
      this.wroteToMemory = true;

      // Yield to the event loop so progress bars can redraw
      if (bytesWritten > 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      return bytesWritten;
    }

    const { bytesWritten } = await this.fileHandle.write(buffer, 0, buffer.length, position);
    return bytesWritten;
  }

  /**
   * Close the underlying file handle
   */
  async close(): Promise<void> {
    if (this.fileBuffer !== undefined && this.wroteToMemory) {
      // We staged writes in memory, we need to rewrite the entire file
      await this.fileHandle.write(this.fileBuffer, 0, this.fileBuffer.length, 0);
    }

    await this.fileHandle.close();
  }
}
