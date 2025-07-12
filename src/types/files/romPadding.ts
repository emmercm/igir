import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';

import FsReadTransform, { FsReadCallback } from '../../polyfill/fsReadTransform.js';
import StreamPoly from '../../polyfill/streamPoly.js';
import File from './file.js';
import FileChecksums from './fileChecksums.js';
import { ChecksumProps } from './fileChecksums.js';

export interface ROMPaddingProps extends ChecksumProps {
  paddedSize: number;
  fillByte: number;
}

export default class ROMPadding implements ROMPaddingProps {
  private static readonly POSSIBLE_FILL_BYTES = [0x00, 0xff];

  @Expose()
  readonly paddedSize: number;

  @Expose()
  readonly fillByte: number;

  @Expose()
  readonly crc32?: string;

  @Expose()
  readonly md5?: string;

  @Expose()
  readonly sha1?: string;

  @Expose()
  readonly sha256?: string;

  constructor(props?: ROMPaddingProps) {
    this.paddedSize = props?.paddedSize ?? 0;
    this.fillByte = props?.fillByte ?? 0x00;
    this.crc32 = props?.crc32;
    this.md5 = props?.md5;
    this.sha1 = props?.sha1;
    this.sha256 = props?.sha256;
  }

  static getKnownFillBytesCount(): number {
    return this.POSSIBLE_FILL_BYTES.length;
  }

  static fileOfObject(obj: ROMPaddingProps): ROMPadding {
    return plainToInstance(ROMPadding, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
  }

  toROMPaddingProps(): ROMPaddingProps {
    return instanceToPlain(this, { exposeUnsetFields: false }) as ROMPaddingProps;
  }

  getPaddedSize(): number {
    return this.paddedSize;
  }

  getCrc32(): string | undefined {
    return this.crc32;
  }

  getMd5(): string | undefined {
    return this.md5;
  }

  getSha1(): string | undefined {
    return this.sha1;
  }

  getSha256(): string | undefined {
    return this.sha256;
  }

  static async paddingsFromFile(file: File, callback?: FsReadCallback): Promise<ROMPadding[]> {
    const paddedSize = Math.pow(2, Math.ceil(Math.log(file.getSize()) / Math.log(2)));
    if (paddedSize === file.getSize()) {
      // The file isn't trimmed
      return [];
    }

    return file.createReadStream(async (readable) => {
      const readableWithCallback =
        callback === undefined
          ? readable
          : StreamPoly.withTransforms(readable, new FsReadTransform(callback));

      const splitStreams = StreamPoly.split(readableWithCallback, this.POSSIBLE_FILL_BYTES.length);

      return Promise.all(
        this.POSSIBLE_FILL_BYTES.map(async (fillByte, idx) => {
          const paddedStream = StreamPoly.padEnd(splitStreams[idx], paddedSize, fillByte);
          const checksums = await FileChecksums.hashStream(paddedStream, file.getChecksumBitmask());
          return new ROMPadding({ paddedSize: paddedSize, fillByte, ...checksums });
        }),
      );
    });
  }
}
