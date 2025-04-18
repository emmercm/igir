import fs from 'node:fs';
import stream, { PassThrough } from 'node:stream';
import zlib from 'node:zlib';

import zstd from 'zstd-napi';

import CentralDirectoryFileHeader from './centralDirectoryFileHeader.js';
import FileRecord, {
  CompressionMethod,
  CompressionMethodInverted,
  IFileRecord,
} from './fileRecord.js';
import ZipBombProtector from './zipBombProtector.js';

export interface ILocalFileRecord extends IFileRecord {
  localFileDataRelativeOffset: number;
}

export default class LocalFileHeader extends FileRecord implements ILocalFileRecord {
  public static readonly LOCAL_FILE_HEADER_SIGNATURE = Buffer.from('04034b50', 'hex').reverse();
  public static readonly DATA_DESCRIPTOR_SIGNATURE = Buffer.from('08074b50', 'hex').reverse();

  private static readonly FIELD_OFFSETS = {
    versionNeeded: 4,
    generalPurposeBitFlag: 6,
    compressionMethod: 8,
    modifiedTime: 10,
    modifiedDate: 12,
    uncompressedCrc32: 14,
    compressedSize: 18,
    uncompressedSize: 22,
    fileNameLength: 26,
    extraFieldLength: 28,
    fileName: 30,
  } as const;

  readonly localFileDataRelativeOffset: number;

  protected constructor(props: ILocalFileRecord) {
    super(props);
    this.localFileDataRelativeOffset = props.localFileDataRelativeOffset;
  }

  static async localFileRecordFromFileHandle(
    centralDirectoryFileHeader: CentralDirectoryFileHeader,
    fileHandle: fs.promises.FileHandle,
  ): Promise<LocalFileHeader> {
    const fileRecord = await FileRecord.fileRecordFromFileHandle(
      centralDirectoryFileHeader.zipFilePath,
      fileHandle,
      centralDirectoryFileHeader.localFileHeaderRelativeOffset,
      this.LOCAL_FILE_HEADER_SIGNATURE,
      this.FIELD_OFFSETS,
    );

    // Trust the central directory's CRC and sizes if a data descriptor is present
    let centralDirectoryUncompressedCrc32: string | undefined;
    let centralDirectoryCompressedSize: number | undefined;
    let centralDirectoryUncompressedSize: number | undefined;
    if (fileRecord.generalPurposeBitFlag & 0x08) {
      centralDirectoryUncompressedCrc32 = centralDirectoryFileHeader.uncompressedCrc32;
      centralDirectoryCompressedSize = centralDirectoryFileHeader.compressedSize;
      centralDirectoryUncompressedSize = centralDirectoryFileHeader.uncompressedSize;
    }

    return new LocalFileHeader({
      ...fileRecord,
      uncompressedCrc32: centralDirectoryUncompressedCrc32 ?? fileRecord.uncompressedCrc32,
      compressedSize: centralDirectoryCompressedSize ?? fileRecord.compressedSize,
      uncompressedSize: centralDirectoryUncompressedSize ?? fileRecord.uncompressedSize,
      localFileDataRelativeOffset:
        centralDirectoryFileHeader.localFileHeaderRelativeOffset +
        this.FIELD_OFFSETS.fileName +
        fileRecord.fileNameLength +
        fileRecord.extraFieldLength +
        (fileRecord.isEncrypted() ? 12 : 0),
    });
  }

  /**
   * Return this file's compressed/raw stream.
   */
  compressedStream(): stream.Readable {
    if (this.compressedSize === 0) {
      // There's no need to open the file, it will be an empty stream
      return stream.Readable.from([]);
    }

    return fs.createReadStream(this.zipFilePath, {
      start: this.localFileDataRelativeOffset,
      end: this.localFileDataRelativeOffset + this.compressedSize - 1,
    });
  }

  /**
   * Return this file's uncompressed/decompressed stream.
   */
  uncompressedStream(): stream.Readable {
    switch (this.compressionMethod) {
      case CompressionMethod.STORE: {
        return this.compressedStream();
      }
      case CompressionMethod.DEFLATE: {
        return LocalFileHeader.pipeline(
          this.compressedStream(),
          zlib.createInflateRaw(),
          new ZipBombProtector(this.uncompressedSize),
        );
      }
      case CompressionMethod.ZSTD_DEPRECATED:
      case CompressionMethod.ZSTD: {
        return LocalFileHeader.pipeline(
          this.compressedStream(),
          // TODO(cemmer): replace with zlib in Node.js 24
          new zstd.DecompressStream(),
          new ZipBombProtector(this.uncompressedSize),
        );
      }
      default: {
        throw new Error(
          `unsupported compression method: ${CompressionMethodInverted[this.compressionMethod]}`,
        );
      }
    }
  }

  /**
   * {@link stream.pipeline} returns a {@link stream.Writable} which doesn't let us pipe through
   * more steps, so use an intermediate {@link stream.PassThrough} to allow for further piping.
   */
  private static pipeline(
    inputStream: stream.Readable,
    transformOne: stream.Transform,
    transformTwo: stream.Transform,
  ): stream.Readable {
    const outputStream = new PassThrough();
    stream.pipeline(inputStream, transformOne, transformTwo, outputStream, (err) => {
      if (err) {
        outputStream.destroy(err);
      }
    });
    return outputStream;
  }
}
