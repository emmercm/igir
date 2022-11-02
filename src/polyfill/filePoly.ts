import fs, { OpenMode, PathLike } from 'fs';
import util from 'util';

import Constants from '../constants.js';
import fsPoly from './fsPoly.js';

export default class FilePoly {
  private readonly pathLike: PathLike;

  private readonly fd: number;

  private readonly size: number;

  private buffer: Buffer;

  private readPosition = 0;

  private constructor(pathLike: PathLike, fd: number) {
    this.pathLike = pathLike;
    this.fd = fd;
    this.size = fs.statSync(pathLike).size;
    this.buffer = Buffer.alloc(Math.min(this.size, Constants.FILE_READING_CHUNK_SIZE));
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
    );
  }

  static async fileOfSize(pathLike: PathLike, flags: OpenMode, size: number): Promise<FilePoly> {
    if (await fsPoly.exists(pathLike)) {
      await fsPoly.rm(pathLike);
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

  getPosition(): number {
    return this.readPosition;
  }

  getSize(): number {
    return this.size;
  }

  seek(position: number): void {
    this.readPosition = position;
  }

  async readNext(size: number): Promise<Buffer> {
    const result = await this.readAt(this.readPosition, size);
    this.readPosition += size;
    return result;
  }

  async readAt(offset: number, size: number): Promise<Buffer> {
    if (size > this.buffer.length) {
      this.buffer = Buffer.alloc(size);
    }

    const { bytesRead } = await util.promisify(fs.read)(
      this.fd,
      this.buffer,
      0,
      size,
      offset,
    );

    const result = Buffer.alloc(bytesRead);
    this.buffer.copy(result);
    return result;
  }

  async readAll(): Promise<Buffer> {
    const buffer = Buffer.alloc(this.size);
    await util.promisify(fs.read)(
      this.fd,
      buffer,
      0,
      this.size,
      0,
    );
    return buffer;
  }

  async write(buffer: Buffer): Promise<number> {
    return (await util.promisify(fs.write)(this.fd, buffer)).bytesWritten;
  }

  async writeAt(buffer: Buffer, offset: number): Promise<number> {
    return (await util.promisify(fs.write)(this.fd, buffer, 0, buffer.length, offset)).bytesWritten;
  }

  async close(): Promise<void> {
    return util.promisify(fs.close)(this.fd);
  }
}
