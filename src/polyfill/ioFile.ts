import fs, { OpenMode, PathLike } from 'node:fs';
import { FileHandle } from 'node:fs/promises';

import Defaults from '../globals/defaults.js';
import FsPoly from './fsPoly.js';

/**
 * A wrapper for readable and writable files
 */
export default class IOFile {
  private readonly pathLike: PathLike;

  private readonly fd: FileHandle;

  private readonly size: number;

  private tempBuffer: Buffer;

  private readPosition = 0;

  private fileBuffer?: Buffer;

  private constructor(pathLike: PathLike, fd: FileHandle, size: number) {
    this.pathLike = pathLike;
    this.fd = fd;
    this.size = size;
    this.tempBuffer = Buffer.allocUnsafe(Math.min(this.size, Defaults.FILE_READING_CHUNK_SIZE));
  }

  /**
   * Return a new {@link IOFile} from a {@param pathLike}, with the {@param flags} mode.
   */
  static async fileFrom(pathLike: PathLike, flags: OpenMode): Promise<IOFile> {
    return new IOFile(
      pathLike,
      await fs.promises.open(
        pathLike,
        /**
         * "On Linux, positional writes don't work when the file is opened in append mode. The
         *  kernel ignores the position argument and always appends the data to the end of the
         *  file."
         * @see https://nodejs.org/api/fs.html#file-system-flags
         */
        flags.toString().startsWith('a') ? 'r+' : flags,
      ),
      await FsPoly.size(pathLike),
    );
  }

  /**
   * Return a new {@link IOFile} of size {@param size} from a {@param pathLike}, with the
   * {@param flags} mode. If the {@param pathLike} already exists, the existing file will be
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

    return this.fileFrom(pathLike, flags);
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
   * Seek to a specific {@param position} in the file
   */
  seek(position: number): void {
    this.readPosition = position;
  }

  /**
   * Seek to the current position plus {@param size}
   */
  skipNext(size: number): void {
    this.readPosition += size;
  }

  /**
   * @returns the next {@param size} bytes from the current seek position, without changing the
   * seek position
   */
  async peekNext(size: number): Promise<Buffer> {
    return this.readAt(this.readPosition, size);
  }

  /**
   * @returns the next {@param size} bytes from the current seek position, also incrementing the
   * seek position the same amount
   */
  async readNext(size: number): Promise<Buffer> {
    const result = await this.readAt(this.readPosition, size);
    this.readPosition += size;
    return result;
  }

  /**
   * @returns bytes of size {@param size} at the seek position {@param offset}
   */
  async readAt(position: number, size: number): Promise<Buffer> {
    if (size > this.tempBuffer.length) {
      this.tempBuffer = Buffer.allocUnsafe(size);
    }

    // If the file is small, read the entire file to memory and "read" from there
    if (this.size <= Defaults.MAX_MEMORY_FILE_SIZE) {
      if (!this.fileBuffer) {
        this.tempBuffer = Buffer.alloc(0);
        this.fileBuffer = await fs.promises.readFile(this.fd);
      }
      return Buffer.from(this.fileBuffer.subarray(position, position + size));
    }

    // If the file is large, read from the open file handle
    let bytesRead = 0;
    try {
      bytesRead = (await this.fd.read(this.tempBuffer, 0, size, position)).bytesRead;
    } catch {
      // NOTE(cemmer): Windows will give "EINVAL: invalid argument, read" when reading out of
      //  bounds, but other OSes don't. Swallow the error.
      return Buffer.alloc(0);
    }

    return Buffer.from(this.tempBuffer.subarray(0, bytesRead));
  }

  /**
   * Write {@param buffer} to the current seek position
   */
  async write(buffer: Buffer): Promise<number> {
    const bytesWritten = await this.writeAt(buffer, this.readPosition);
    this.readPosition += buffer.length;
    return bytesWritten;
  }

  /**
   * Write {@param buffer} at the seek position {@param offset}
   */
  async writeAt(buffer: Buffer, position: number): Promise<number> {
    const { bytesWritten } = await this.fd.write(buffer, 0, buffer.length, position);

    if (this.fileBuffer) {
      if (position + bytesWritten > this.fileBuffer.length) {
        this.fileBuffer = Buffer.concat([
          this.fileBuffer,
          Buffer.allocUnsafe(position + bytesWritten - this.fileBuffer.length),
        ]);
      }
      for (let i = 0; i < bytesWritten; i += 1) {
        this.fileBuffer[position + i] = buffer[i];
      }
    }

    return bytesWritten;
  }

  /**
   * Close the underlying file handle
   */
  async close(): Promise<void> {
    return this.fd.close();
  }
}
