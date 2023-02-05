import fs, { OpenMode, PathLike } from 'fs';
import util from 'util';

import Constants from '../constants.js';
import fsPoly from './fsPoly.js';

export default class FilePoly {
  private readonly pathLike: PathLike;

  private readonly fd: number;

  private readonly size: number;

  private tempBuffer: Buffer;

  private readPosition = 0;

  private fileBuffer?: Buffer;

  private constructor(pathLike: PathLike, fd: number, size: number) {
    this.pathLike = pathLike;
    this.fd = fd;
    this.size = size;
    this.tempBuffer = Buffer.allocUnsafe(Math.min(this.size, Constants.FILE_READING_CHUNK_SIZE));
  }

  static async fileFrom(pathLike: PathLike, flags: OpenMode): Promise<FilePoly> {
    return new FilePoly(
      pathLike,
      await util.promisify(fs.open)(
        pathLike,
        /**
         * "On Linux, positional writes don't work when the file is opened in append mode. The
         *  kernel ignores the position argument and always appends the data to the end of the
         *  file."
         * @link https://nodejs.org/api/fs.html#file-system-flags
         */
        flags.toString().startsWith('a') ? 'r+' : flags,
      ),
      (await util.promisify(fs.stat)(pathLike)).size,
    );
  }

  static async fileOfSize(pathLike: PathLike, flags: OpenMode, size: number): Promise<FilePoly> {
    if (await fsPoly.exists(pathLike)) {
      await fsPoly.rm(pathLike, { force: true });
    }

    const write = await this.fileFrom(pathLike, 'wx');
    let written = 0;
    /* eslint-disable no-await-in-loop */
    while (written < size) {
      const buffer = Buffer.alloc(Math.min(size - written, Constants.FILE_READING_CHUNK_SIZE));
      await write.write(buffer);
      written += buffer.length;
    }
    await write.close();

    return this.fileFrom(pathLike, flags);
  }

  getPathLike(): PathLike {
    return this.pathLike;
  }

  isEOF(): boolean {
    return this.getPosition() >= this.getSize();
  }

  getPosition(): number {
    return this.readPosition;
  }

  getSize(): number {
    return this.size;
  }

  seek(position: number): void {
    this.readPosition = position;
  }

  skipNext(size: number): void {
    this.readPosition += size;
  }

  async peekNext(size: number): Promise<Buffer> {
    return this.readAt(this.readPosition, size);
  }

  async readNext(size: number): Promise<Buffer> {
    const result = await this.readAt(this.readPosition, size);
    this.readPosition += size;
    return result;
  }

  async readAt(offset: number, size: number): Promise<Buffer> {
    if (size > this.tempBuffer.length) {
      this.tempBuffer = Buffer.allocUnsafe(size);
    }

    // If the file is small, read the entire file to memory and "read" from there
    if (this.size <= Constants.MAX_MEMORY_FILE_SIZE) {
      if (!this.fileBuffer) {
        this.tempBuffer = Buffer.alloc(0);
        this.fileBuffer = await util.promisify(fs.readFile)(this.fd);
      }
      return Buffer.from(this.fileBuffer.subarray(offset, offset + size));
    }

    // If the file is large, read from the open file handle
    let bytesRead = 0;
    try {
      bytesRead = (await util.promisify(fs.read)(
        this.fd,
        this.tempBuffer,
        0,
        size,
        offset,
      )).bytesRead;
    } catch (e) {
      // NOTE(cemmer): Windows will give "EINVAL: invalid argument, read" when reading out of
      //  bounds, but other OSes don't. Swallow the error.
      return Buffer.alloc(0);
    }

    return Buffer.from(this.tempBuffer.subarray(0, bytesRead));
  }

  async write(buffer: Buffer): Promise<number> {
    const bytesWritten = await this.writeAt(buffer, this.readPosition);
    this.readPosition += buffer.length;
    return bytesWritten;
  }

  async writeAt(buffer: Buffer, offset: number): Promise<number> {
    const { bytesWritten } = await util.promisify(fs.write)(
      this.fd,
      buffer,
      0,
      buffer.length,
      offset,
    );

    if (this.fileBuffer) {
      if (offset + bytesWritten > this.fileBuffer.length) {
        this.fileBuffer = Buffer.concat([
          this.fileBuffer,
          Buffer.allocUnsafe(offset + bytesWritten - this.fileBuffer.length),
        ]);
      }
      for (let i = 0; i < bytesWritten; i += 1) {
        this.fileBuffer[offset + i] = buffer[i];
      }
    }

    return bytesWritten;
  }

  async close(): Promise<void> {
    return util.promisify(fs.close)(this.fd);
  }
}
