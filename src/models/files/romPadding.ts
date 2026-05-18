import { Expose, instanceToPlain, plainToInstance } from 'class-transformer';

import FsReadTransform, { FsReadCallback } from '../../streams/fsReadTransform.js';
import StreamUtil from '../../utils/streamUtil.js';
import File from './file.js';
import FileChecksums from './fileChecksums.js';
import { ChecksumProps } from './fileChecksums.js';

export interface ROMPaddingProps extends ChecksumProps {
  paddedSize: number;
  fillByte: number;
}

/**
 * Describes a ROM file's trailing padding — the padded size and fill byte, plus the checksums
 * of the padded form.
 */
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

  /**
   * Construct a {@link ROMPadding} from a plain object — the inverse of {@link toROMPaddingProps}.
   */
  static fileOfObject(obj: ROMPaddingProps): ROMPadding {
    return plainToInstance(ROMPadding, obj, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
  }

  /**
   * Serialize this padding into a plain object suitable for persistence.
   */
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

  /**
   * Compute the set of {@link ROMPadding} entries describing how a file would look if padded
   * up to the next power-of-two size with each of the known fill bytes.
   */
  static async paddingsFromFile(file: File, callback?: FsReadCallback): Promise<ROMPadding[]> {
    const paddedSize = Math.pow(2, Math.ceil(Math.log(file.getSize()) / Math.log(2)));
    if (paddedSize === file.getSize()) {
      // The file isn't trimmed
      return [];
    }

    if (callback !== undefined) {
      callback(0, paddedSize);
    }

    return await file.createReadStream(async (readable) => {
      const readableWithCallback =
        callback === undefined
          ? readable
          : StreamUtil.withTransforms(readable, new FsReadTransform(callback));

      const splitStreams = StreamUtil.split(readableWithCallback, this.POSSIBLE_FILL_BYTES.length);

      return await Promise.all(
        this.POSSIBLE_FILL_BYTES.map(async (fillByte, idx) => {
          const paddedStream = StreamUtil.padEnd(splitStreams[idx], paddedSize, fillByte);
          const checksums = await FileChecksums.hashStream(paddedStream, file.getChecksumBitmask());
          return new ROMPadding({ paddedSize: paddedSize, fillByte, ...checksums });
        }),
      );
    });
  }
}
