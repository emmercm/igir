import os from 'node:os';
import type { Readable } from 'node:stream';

import IgirException from '../../exceptions/igirException.js';
import FsUtil from '../../utils/fsUtil.js';
import StreamUtil from '../../utils/streamUtil.js';
import File from './file.js';

/**
 * A singleton {@link File} representing an empty (zero-byte) file with precomputed checksums.
 */
export default class ZeroSizeFile extends File {
  private static readonly singleton = new ZeroSizeFile();

  static getInstance(): ZeroSizeFile {
    return this.singleton;
  }

  private constructor() {
    super({
      filePath: os.devNull,
      size: 0,
      crc32: '00000000',
      crc32WithoutHeader: '00000000',
      md5: 'd41d8cd98f00b204e9800998ecf8427e',
      md5WithoutHeader: 'd41d8cd98f00b204e9800998ecf8427e',
      sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      sha1WithoutHeader: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sha256WithoutHeader: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
  }

  /**
   * Create an empty file at the given path, overwriting any existing file.
   */
  async extractToFile(destinationPath: string): Promise<void> {
    if (await FsUtil.exists(destinationPath)) {
      await FsUtil.rm(destinationPath, { force: true });
    }
    await FsUtil.touch(destinationPath);
  }

  /**
   * Invoke the callback with a readable stream that produces zero bytes.
   */
  async createReadStream<T>(callback: (readable: Readable) => Promise<T> | T): Promise<T> {
    const readable = StreamUtil.staticReadable(0, 0x00);
    return await callback(readable);
  }

  withProps(): File {
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async withFileHeader(): Promise<File> {
    throw new IgirException(`${this.constructor.name} can't have a header`);
  }

  /**
   * Always throw — a zero-size file cannot have a header.
   */
  withoutFileHeader(): File {
    throw new IgirException(`${this.constructor.name} can't have a header`);
  }

  withPaddings(): File {
    throw new IgirException(`${this.constructor.name} can't be padded`);
  }

  withPatch(): File {
    throw new IgirException(`${this.constructor.name} can't be patched`);
  }
}
