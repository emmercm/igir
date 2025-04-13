import fs from 'node:fs';

export interface IFileRecord extends IFileRecordZip64 {
  versionNeeded: number;
  generalPurposeBitFlag: number;
  compressionMethod: CompressionMethodValue;
  timestamps: FileTimestamps;
  uncompressedCrc32: string;
  fileNameLength: number;
  extraFieldLength: number;
  fileName: Buffer<ArrayBuffer>;
  extraFields: Map<number, Buffer<ArrayBuffer>>;
}

export interface IFileRecordZip64 {
  uncompressedSize: number;
  compressedSize: number;
  localFileHeaderRelativeOffset?: number;
  fileDiskStart?: number;
}

export const CompressionMethod = {
  STORE: 0,
  SHRUNK: 1,
  REDUCED_FACTOR_1: 2,
  REDUCED_FACTOR_2: 3,
  REDUCED_FACTOR_3: 4,
  REDUCED_FACTOR_4: 5,
  IMPLODE: 6,
  DEFLATE: 8,
  DEFLATE64: 9,
  PKWARE_IMPLODE: 10,
  BZIP2: 12,
  LZMA: 14,
  IBM_CMPSC: 16,
  IBM_TERSE: 18,
  IBM_LZ77: 19,
  ZSTD_DEPRECATED: 20,
  ZSTD: 93,
  MP3: 94,
  XZ: 95,
  JPEG_VARIANT: 96,
  WAVPACK: 97,
  PPMD: 98,
  AE_X: 99,
} as const;
export type CompressionMethodKey = keyof typeof CompressionMethod;
export type CompressionMethodValue = (typeof CompressionMethod)[CompressionMethodKey];
export const CompressionMethodInverted = Object.fromEntries(
  Object.entries(CompressionMethod).map(([key, value]) => [value, key]),
) as Record<CompressionMethodValue, CompressionMethodKey>;

export interface FileTimestamps {
  modified?: Date;
  accessed?: Date;
  created?: Date;
}

export default class FileRecord implements IFileRecord {
  readonly versionNeeded: number;
  readonly generalPurposeBitFlag: number;
  readonly compressionMethod: CompressionMethodValue;
  readonly timestamps: FileTimestamps;
  readonly uncompressedCrc32: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly fileNameLength: number;
  readonly extraFieldLength: number;
  readonly fileName: Buffer<ArrayBuffer>;
  readonly extraFields: Map<number, Buffer<ArrayBuffer>>;
  readonly localFileHeaderRelativeOffset?: number;
  readonly fileDiskStart?: number;

  protected constructor(props: IFileRecord) {
    this.versionNeeded = props.versionNeeded;
    this.generalPurposeBitFlag = props.generalPurposeBitFlag;
    this.compressionMethod = props.compressionMethod;
    this.timestamps = props.timestamps;
    this.uncompressedCrc32 = props.uncompressedCrc32;
    this.compressedSize = props.compressedSize;
    this.uncompressedSize = props.uncompressedSize;
    this.fileNameLength = props.fileNameLength;
    this.extraFieldLength = props.extraFieldLength;
    this.fileName = props.fileName;
    this.extraFields = props.extraFields;
    this.localFileHeaderRelativeOffset = props.localFileHeaderRelativeOffset;
    this.fileDiskStart = props.fileDiskStart;
  }

  static async fileRecordFromFileHandle(
    fileHandle: fs.promises.FileHandle,
    recordOffset: number,
    fieldOffsets: {
      versionNeeded: number;
      generalPurposeBitFlag: number;
      compressionMethod: number;
      modifiedTime: number;
      modifiedDate: number;
      uncompressedCrc32: number;
      compressedSize: number;
      uncompressedSize: number;
      fileDiskStart?: number;
      localFileHeaderRelativeOffset?: number;
      fileNameLength: number;
      extraFieldLength: number;
      fileName: number;
    },
  ): Promise<FileRecord> {
    const fixedLengthBuffer = Buffer.allocUnsafe(Math.max(...Object.values(fieldOffsets)) + 4);
    await fileHandle.read({ buffer: fixedLengthBuffer, position: recordOffset });

    const fileNameLength = fixedLengthBuffer.readUInt16LE(fieldOffsets.fileNameLength);
    const extraFieldLength = fixedLengthBuffer.readUInt16LE(fieldOffsets.extraFieldLength);
    const variableLengthBuffer = Buffer.allocUnsafe(fileNameLength + extraFieldLength);
    await fileHandle.read({
      buffer: variableLengthBuffer,
      position: recordOffset + fieldOffsets.fileName,
    });

    const extraFields = this.parseExtraFields(
      variableLengthBuffer.subarray(fileNameLength, fileNameLength + extraFieldLength),
    );

    const zip64ExtendableInformation = this.parseFileRecordZip64(extraFields.get(0x00_01), {
      compressedSize: fixedLengthBuffer.readUInt32LE(fieldOffsets.compressedSize),
      uncompressedSize: fixedLengthBuffer.readUInt32LE(fieldOffsets.uncompressedSize),
      fileDiskStart:
        fieldOffsets.fileDiskStart === undefined
          ? undefined
          : fixedLengthBuffer.readUInt16LE(fieldOffsets.fileDiskStart),
      localFileHeaderRelativeOffset:
        fieldOffsets.localFileHeaderRelativeOffset === undefined
          ? undefined
          : fixedLengthBuffer.readUInt32LE(fieldOffsets.localFileHeaderRelativeOffset),
    });

    const fileName =
      // Info-ZIP Unicode Path Extra Field
      extraFields.get(0x70_75)?.subarray(5) ?? variableLengthBuffer.subarray(0, fileNameLength);

    // TODO(cemmer): 0x000d UNIX timestamp
    // TODO(cemmer): 0x5855 unix extra field original
    // TODO(cemmer): 0x7855 unix extra field new?
    const timestamps =
      this.parseExtendedTimestamp(extraFields.get(0x54_55)) ??
      this.parseUnixExtraTimestamp(extraFields.get(0x58_55)) ??
      this.parseNtfsExtraTimestamp(extraFields.get(0x00_0a)) ??
      this.parseDOSTimestamp(
        fixedLengthBuffer.readUInt16LE(fieldOffsets.modifiedTime),
        fixedLengthBuffer.readUInt16LE(fieldOffsets.modifiedDate),
      );

    return new FileRecord({
      ...zip64ExtendableInformation,
      versionNeeded: fixedLengthBuffer.readUInt16LE(fieldOffsets.versionNeeded),
      generalPurposeBitFlag: fixedLengthBuffer.readUInt16LE(fieldOffsets.generalPurposeBitFlag),
      compressionMethod: fixedLengthBuffer.readUInt16LE(
        fieldOffsets.compressionMethod,
      ) as CompressionMethodValue,
      timestamps,
      uncompressedCrc32: fixedLengthBuffer
        .subarray(fieldOffsets.uncompressedCrc32, fieldOffsets.uncompressedCrc32 + 4)
        .reverse()
        .toString('hex')
        .toLowerCase(),
      fileNameLength,
      extraFieldLength,
      fileName,
      extraFields,
    });
  }

  private static parseExtraFields(buffer: Buffer<ArrayBuffer>): Map<number, Buffer<ArrayBuffer>> {
    if (buffer.length === 0) {
      return new Map();
    }

    const extraFields = new Map<number, Buffer<ArrayBuffer>>();
    let position = 0;
    while (position < buffer.length) {
      const headerId = buffer.readUInt16LE(position);
      const dataSize = buffer.readUInt16LE(position + 2);
      extraFields.set(headerId, buffer.subarray(position + 4, position + 4 + dataSize));
      position += 4 + dataSize;
    }
    return extraFields;
  }

  /**
   * @see https://github.com/DidierStevens/DidierStevensSuite/blob/master/zipdump.py
   */
  private static parseDOSTimestamp(bufferTime: number, bufferDate: number): FileTimestamps {
    const seconds = (bufferTime & 0b0000_0000_0001_1111) * 2;
    const minutes = (bufferTime & 0b0000_0111_1110_0000) >> 5;
    const hours = (bufferTime & 0b1111_1000_0000_0000) >> 11;

    const day = bufferDate & 0b0000_0000_0001_1111;
    const month = (bufferDate & 0b0000_0001_1110_0000) >> 5;
    const year = 1980 + ((bufferDate & 0b1111_1110_0000_0000) >> 9);

    return {
      // The specification provides no way to know the timezone, so local is assumed
      modified: new Date(year, month - 1, day, hours, minutes, seconds),
    };
  }

  private static parseNtfsExtraTimestamp(
    buffer: Buffer<ArrayBuffer> | undefined,
  ): FileTimestamps | undefined {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    const attributes = new Map<number, Buffer<ArrayBuffer>>();
    let position = 4;
    while (position < buffer.length) {
      const attributeTagValue = buffer.readUInt16LE(position);
      const attributeTagSize = buffer.readUInt16LE(position + 2);
      const attributeTagData = buffer.subarray(position + 4, position + 4 + attributeTagSize);
      attributes.set(attributeTagValue, attributeTagData);
      position += 4 + attributeTagSize;
    }

    const fileTimes = attributes.get(0x00_01);
    if (fileTimes === undefined) {
      return undefined;
    }

    return {
      modified: new Date(
        Number(BigInt(Date.UTC(1601, 0, 1)) + fileTimes.readBigUInt64LE(0) / 10_000n),
      ),
      accessed: new Date(
        Number(BigInt(Date.UTC(1601, 0, 1)) + fileTimes.readBigUInt64LE(8) / 10_000n),
      ),
      created: new Date(
        Number(BigInt(Date.UTC(1601, 0, 1)) + fileTimes.readBigUInt64LE(16) / 10_000n),
      ),
    };
  }

  /**
   * @see https://libzip.org/specifications/appnote_iz.txt
   */
  private static parseExtendedTimestamp(
    buffer: Buffer<ArrayBuffer> | undefined,
  ): FileTimestamps | undefined {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    const times = [...Array.from({ length: (buffer.length - 1) / 4 }).keys()].map((idx) =>
      buffer.readInt32LE(1 + idx * 4),
    );
    if (times.length === 0) {
      // Should be invalid
      return undefined;
    }

    const timestamps: FileTimestamps = {};
    let readTimes = 0;

    const infoBit = buffer.readInt8(0);
    if (infoBit & 0x01) {
      const epochSeconds = times.at(readTimes);
      timestamps.modified = epochSeconds === undefined ? undefined : new Date(epochSeconds * 1000);
      readTimes += 1;
    }
    if (infoBit & 0x02) {
      const epochSeconds = times.at(readTimes);
      timestamps.accessed = epochSeconds === undefined ? undefined : new Date(epochSeconds * 1000);
      readTimes += 1;
    }
    if (infoBit & 0x04) {
      const epochSeconds = times.at(readTimes);
      timestamps.created = epochSeconds === undefined ? undefined : new Date(epochSeconds * 1000);
      readTimes += 1;
    }

    return timestamps;
  }

  private static parseUnixExtraTimestamp(
    buffer: Buffer<ArrayBuffer> | undefined,
  ): FileTimestamps | undefined {
    if (buffer === undefined || buffer.length === 0) {
      return undefined;
    }

    return {
      accessed: new Date(buffer.readUInt32LE(0) * 1000),
      modified: new Date(buffer.readUInt32LE(4) * 1000),
    };
  }

  private static parseFileRecordZip64(
    buffer: Buffer<ArrayBuffer> | undefined,
    originalDirectoryRecord: IFileRecordZip64,
  ): IFileRecordZip64 {
    if (buffer === undefined || buffer.length === 0) {
      return originalDirectoryRecord;
    }

    const extendedInformation = {
      ...originalDirectoryRecord,
    };

    // Only respect the zip64 extended information if the local/central directory record says to do so
    let position = 0;
    if (originalDirectoryRecord.uncompressedSize === 0xff_ff_ff_ff) {
      extendedInformation.uncompressedSize = Number(buffer.readBigUInt64LE(position));
      position += 8;
    }
    if (originalDirectoryRecord.compressedSize === 0xff_ff_ff_ff) {
      extendedInformation.compressedSize = Number(buffer.readBigUInt64LE(position));
      position += 8;
    }
    if (originalDirectoryRecord.localFileHeaderRelativeOffset === 0xff_ff_ff_ff) {
      extendedInformation.localFileHeaderRelativeOffset = Number(buffer.readBigUInt64LE(position));
      position += 8;
    }
    if (originalDirectoryRecord.fileDiskStart === 0xff_ff) {
      extendedInformation.fileDiskStart = buffer.readUInt32LE(position);
      position += 4;
    }

    return extendedInformation;
  }

  isEncrypted(): boolean {
    return (this.generalPurposeBitFlag & 0x01) !== 0;
  }

  isDirectory(): boolean {
    return this.fileName.toString('utf8').endsWith('/');
  }
}
