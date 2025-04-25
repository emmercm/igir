import fs from 'node:fs';
import stream, { PassThrough } from 'node:stream';
import zlib from 'node:zlib';

import zstd from 'zstd-napi';

import CentralDirectoryFileHeader from './centralDirectoryFileHeader.js';
import FileRecord, {
  CompressionMethod,
  CompressionMethodInverted,
  CompressionMethodValue,
  IFileRecord,
} from './fileRecord.js';
import FileRecordUtil from './fileRecordUtil.js';
import ZipBombProtector from './zipBombProtector.js';

export interface ILocalFileHeader extends IFileRecord {
  headerRelativeOffset: number;
  dataRelativeOffset: number;
}

export default class LocalFileHeader extends FileRecord {
  public static readonly LOCAL_FILE_HEADER_SIGNATURE = Buffer.from('04034b50', 'hex').reverse();
  public static readonly DATA_DESCRIPTOR_SIGNATURE = Buffer.from('08074b50', 'hex').reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly LOCAL_FILE_HEADER_SIZE = 30;

  private readonly zipFilePath: string;
  private readonly centralDirectoryFileHeader: CentralDirectoryFileHeader;

  private readonly headerRelativeOffset: number;
  private readonly dataRelativeOffset: number;

  protected constructor(
    zipFilePath: string,
    centralDirectoryFileHeader: CentralDirectoryFileHeader,
    props: ILocalFileHeader,
  ) {
    super(props);
    this.zipFilePath = zipFilePath;
    this.centralDirectoryFileHeader = centralDirectoryFileHeader;

    this.headerRelativeOffset = props.headerRelativeOffset;
    this.dataRelativeOffset = props.dataRelativeOffset;
  }

  static async localFileRecordFromFileHandle(
    centralDirectoryFileHeader: CentralDirectoryFileHeader,
    fileHandle: fs.promises.FileHandle,
  ): Promise<LocalFileHeader> {
    const fixedLengthBuffer = Buffer.allocUnsafe(this.LOCAL_FILE_HEADER_SIZE);
    await fileHandle.read({
      buffer: fixedLengthBuffer,
      position: centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved(),
    });

    const versionNeeded = fixedLengthBuffer.readUInt16LE(4);
    const generalPurposeBitFlag = fixedLengthBuffer.readUInt16LE(6);
    const compressionMethod = fixedLengthBuffer.readUInt16LE(8) as CompressionMethodValue;
    const fileModificationTime = fixedLengthBuffer.readUInt16LE(10);
    const fileModificationDate = fixedLengthBuffer.readUInt16LE(12);
    const uncompressedCrc32 = Buffer.from(fixedLengthBuffer.subarray(14, 18));
    const compressedSize = fixedLengthBuffer.readUInt32LE(18);
    const uncompressedSize = fixedLengthBuffer.readUInt32LE(22);
    const fileNameLength = fixedLengthBuffer.readUInt16LE(26);
    const extraFieldLength = fixedLengthBuffer.readUInt16LE(28);

    const variableLengthBufferSize = fileNameLength + extraFieldLength;
    let variableLengthBuffer: Buffer<ArrayBuffer>;
    if (variableLengthBufferSize > 0) {
      // Only read from the file if there's something to read
      variableLengthBuffer = Buffer.allocUnsafe(variableLengthBufferSize);
      await fileHandle.read({
        buffer: variableLengthBuffer,
        position:
          centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved() +
          fixedLengthBuffer.length,
      });
    } else {
      variableLengthBuffer = Buffer.alloc(0);
    }

    const fileName = Buffer.from(variableLengthBuffer.subarray(0, fileNameLength));
    const extraFields = FileRecordUtil.parseExtraFields(
      variableLengthBuffer.subarray(fileNameLength, fileNameLength + extraFieldLength),
    );

    const zip64ExtendedInformation = FileRecordUtil.parseZip64ExtendedInformation(
      extraFields.get(0x00_01),
      uncompressedSize,
      compressedSize,
      centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved(),
      centralDirectoryFileHeader.fileDiskStartResolved(),
    );

    return new LocalFileHeader(centralDirectoryFileHeader.zipFilePath, centralDirectoryFileHeader, {
      raw: Buffer.concat([fixedLengthBuffer, variableLengthBuffer]),
      headerRelativeOffset: centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved(),
      dataRelativeOffset:
        centralDirectoryFileHeader.localFileHeaderRelativeOffsetResolved() +
        fixedLengthBuffer.length +
        variableLengthBuffer.length +
        (generalPurposeBitFlag & 0x01 ? 12 : 0),
      versionNeeded,
      generalPurposeBitFlag,
      compressionMethod,
      fileModificationTime,
      fileModificationDate,
      uncompressedCrc32,
      compressedSize,
      uncompressedSize,
      fileNameLength,
      extraFieldLength,
      fileName,
      extraFields,
      zip64ExtendedInformation,
    });
  }

  getLocalFileDataRelativeOffset(): number {
    return this.dataRelativeOffset;
  }

  uncompressedCrc32Number(): number {
    return this.hasDataDescriptor()
      ? this.centralDirectoryFileHeader.uncompressedCrc32Number()
      : super.uncompressedCrc32Number();
  }

  uncompressedCrc32String(): string {
    return this.hasDataDescriptor()
      ? this.centralDirectoryFileHeader.uncompressedCrc32String()
      : super.uncompressedCrc32String();
  }

  compressedSizeResolved(): number {
    return this.hasDataDescriptor()
      ? this.centralDirectoryFileHeader.compressedSizeResolved()
      : super.compressedSizeResolved();
  }

  uncompressedSizeResolved(): number {
    return this.hasDataDescriptor()
      ? this.centralDirectoryFileHeader.uncompressedSizeResolved()
      : super.uncompressedSizeResolved();
  }

  /**
   * Return this file's compressed/raw stream.
   */
  compressedStream(highWaterMark?: number): stream.Readable {
    if (this.compressedSizeResolved() === 0) {
      // There's no need to open the file, it will be an empty stream
      return stream.Readable.from([]);
    }

    return fs.createReadStream(this.zipFilePath, {
      start: this.getLocalFileDataRelativeOffset(),
      end: this.getLocalFileDataRelativeOffset() + this.compressedSizeResolved() - 1,
      highWaterMark,
    });
  }

  /**
   * Return this file's uncompressed/decompressed stream.
   */
  uncompressedStream(highWaterMark?: number): stream.Readable {
    switch (this.compressionMethod) {
      case CompressionMethod.STORE: {
        return this.compressedStream(highWaterMark);
      }
      case CompressionMethod.DEFLATE: {
        return LocalFileHeader.pipeline(
          this.compressedStream(highWaterMark),
          zlib.createInflateRaw(),
          new ZipBombProtector(this.uncompressedSizeResolved()),
        );
      }
      case CompressionMethod.ZSTD_DEPRECATED:
      case CompressionMethod.ZSTD: {
        return LocalFileHeader.pipeline(
          this.compressedStream(),
          // TODO(cemmer): replace with zlib in Node.js 24
          new zstd.DecompressStream(),
          new ZipBombProtector(this.uncompressedSizeResolved()),
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
