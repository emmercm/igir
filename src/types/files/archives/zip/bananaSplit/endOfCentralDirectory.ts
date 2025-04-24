import fs from 'node:fs';

import CP437Decoder from './cp437Decoder.js';

export interface IEndOfCentralDirectory {
  record: IEndOfCentralDirectoryRecord;
  zip64Locator?: IZip64EndOfCentralDirectoryLocator;
  zip64Record?: IZip64EndOfCentralDirectoryRecord;
}

export interface IEndOfCentralDirectoryRecord {
  diskNumber: number;
  centralDirectoryDiskStart: number;
  centralDirectoryDiskRecordsCount: number;
  centralDirectoryTotalRecordsCount: number;
  centralDirectorySizeBytes: number;
  centralDirectoryOffset: number;
  comment: string;
}

export interface IZip64EndOfCentralDirectoryLocator {
  centralDirectoryDiskStart: number;
  centralDirectoryOffset: number;
  diskCount: number;
}

export interface IZip64EndOfCentralDirectoryRecord extends IEndOfCentralDirectoryRecord {
  versionMadeBy: number;
  versionNeeded: number;
}

export default class EndOfCentralDirectory {
  public static readonly END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE = Buffer.from(
    '06054b50',
    'hex',
  ).reverse();
  public static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = Buffer.from(
    '07064b50',
    'hex',
  ).reverse();
  public static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE = Buffer.from(
    '06064b50',
    'hex',
  ).reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 22;
  private static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE = 20;
  private static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 56;

  // Maximum size of the non-zip64 EOCD
  private static readonly BACKWARD_CHUNK_SIZE: number = 22 + 0xff_ff;

  private readonly record: IEndOfCentralDirectoryRecord;
  private readonly zip64Locator?: IZip64EndOfCentralDirectoryLocator;
  private readonly zip64Record?: IZip64EndOfCentralDirectoryRecord;

  private constructor(props: IEndOfCentralDirectory) {
    this.record = props.record;
    this.zip64Locator = props.zip64Locator;
    this.zip64Record = props.zip64Record;
  }

  static async fromFileHandle(fileHandle: fs.promises.FileHandle): Promise<EndOfCentralDirectory> {
    const fileSize = (await fileHandle.stat()).size;
    const filePosition = Math.max(fileSize - 1 - this.BACKWARD_CHUNK_SIZE, 0);
    const buffer = Buffer.allocUnsafe(Math.min(this.BACKWARD_CHUNK_SIZE, fileSize));

    // Find the start position of the EOCD
    const readResult = await fileHandle.read({ buffer, position: filePosition });
    const eocdPosition = buffer
      .subarray(0, readResult.bytesRead)
      .lastIndexOf(this.END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE);
    if (eocdPosition === -1) {
      throw new Error('could not find end of central directory record');
    }

    // Parse the EOCD
    return this.readEndOfCentralDirectoryRecordZip(fileHandle, filePosition + eocdPosition);
  }

  private static async readEndOfCentralDirectoryRecordZip(
    fileHandle: fs.promises.FileHandle,
    eocdPosition: number,
  ): Promise<EndOfCentralDirectory> {
    const buffer = Buffer.allocUnsafe(this.END_OF_CENTRAL_DIRECTORY_RECORD_SIZE);

    // Read the EOCD record except for the variable-length comment
    await fileHandle.read({ buffer, position: eocdPosition });
    if (!buffer.subarray(0, 4).equals(this.END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE)) {
      throw new Error('bad end of central directory record position');
    }

    const diskNumber = buffer.readUInt16LE(4);
    const centralDirectoryDiskStart = buffer.readUInt16LE(6);
    const centralDirectoryDiskRecordsCount = buffer.readUInt16LE(8);
    const centralDirectoryTotalRecordsCount = buffer.readUInt16LE(10);
    const centralDirectorySizeBytes = buffer.readUInt32LE(12);
    const centralDirectoryOffset = buffer.readUInt32LE(16);
    const commentLength = buffer.readUInt16LE(20);

    // Read the EOCD comment
    let commentBuffer: Buffer<ArrayBuffer>;
    if (commentLength === 0) {
      // No need to read the comment
      commentBuffer = Buffer.alloc(0);
    } else if (commentLength < buffer.length) {
      // The comment is small, keep re-using the same buffer
      const readResult = await fileHandle.read({
        buffer,
        position: eocdPosition + this.END_OF_CENTRAL_DIRECTORY_RECORD_SIZE,
        length: commentLength,
      });
      commentBuffer = readResult.buffer.subarray(0, readResult.bytesRead);
    } else {
      // The comment is long, allocate a new buffer
      const readResult = await fileHandle.read({
        buffer: Buffer.alloc(commentLength),
        position: eocdPosition + this.END_OF_CENTRAL_DIRECTORY_RECORD_SIZE,
      });
      commentBuffer = readResult.buffer;
    }
    const comment = CP437Decoder.decode(commentBuffer);

    const endOfCentralDirectoryRecord = {
      diskNumber,
      centralDirectoryDiskStart,
      centralDirectoryDiskRecordsCount,
      centralDirectoryTotalRecordsCount,
      centralDirectorySizeBytes,
      centralDirectoryOffset,
      comment,
    } satisfies IEndOfCentralDirectoryRecord;

    // Parse the optional zip64 EOCD
    let zip64EndOfCentralDirectoryLocator: IZip64EndOfCentralDirectoryLocator | undefined;
    let zip64EndOfCentralDirectoryRecord: IZip64EndOfCentralDirectoryRecord | undefined;
    if (
      centralDirectoryDiskStart === 0xff_ff ||
      centralDirectoryDiskRecordsCount === 0xff_ff ||
      centralDirectoryTotalRecordsCount === 0xff_ff ||
      centralDirectorySizeBytes === 0xff_ff_ff_ff ||
      centralDirectoryOffset === 0xff_ff_ff_ff
    ) {
      zip64EndOfCentralDirectoryLocator = await this.readZip64EndOfCentralDirectoryLocator(
        fileHandle,
        eocdPosition - this.ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE,
      );
      if (
        zip64EndOfCentralDirectoryLocator.centralDirectoryDiskStart !== 0 ||
        zip64EndOfCentralDirectoryLocator.diskCount !== 1
      ) {
        throw new Error("multi-disk zip64 zips aren't supported");
      }
      zip64EndOfCentralDirectoryRecord = await this.readZip64EndOfCentralDirectoryRecord(
        fileHandle,
        zip64EndOfCentralDirectoryLocator.centralDirectoryOffset,
      );
    }

    return new EndOfCentralDirectory({
      record: endOfCentralDirectoryRecord,
      zip64Locator: zip64EndOfCentralDirectoryLocator,
      zip64Record: zip64EndOfCentralDirectoryRecord,
    });
  }

  private static async readZip64EndOfCentralDirectoryLocator(
    fileHandle: fs.promises.FileHandle,
    locatorPosition: number,
  ): Promise<IZip64EndOfCentralDirectoryLocator> {
    const buffer = Buffer.allocUnsafe(this.ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE);
    await fileHandle.read({ buffer, position: locatorPosition });
    if (!buffer.subarray(0, 4).equals(this.ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE)) {
      throw new Error('bad zip64 end of central directory locator position');
    }

    return {
      centralDirectoryDiskStart: buffer.readUInt32LE(4),
      centralDirectoryOffset: Number(buffer.readBigUInt64LE(8)),
      diskCount: buffer.readUInt32LE(16),
    };
  }

  private static async readZip64EndOfCentralDirectoryRecord(
    fileHandle: fs.promises.FileHandle,
    eocdPosition: number,
  ): Promise<IZip64EndOfCentralDirectoryRecord> {
    // TODO(cemmer): don't skip reading the signature, validate it
    const fixedLengthBuffer = Buffer.allocUnsafe(this.ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE);
    await fileHandle.read({ buffer: fixedLengthBuffer, position: eocdPosition });
    if (
      !fixedLengthBuffer.subarray(0, 4).equals(this.ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE)
    ) {
      throw new Error(`bad zip64 end of central directory record position`);
    }

    const eocdSize = fixedLengthBuffer.readBigUInt64LE(4) + 12n;
    const commentBuffer = Buffer.allocUnsafe(Number(eocdSize - 56n));
    if (commentBuffer.length > 0) {
      await fileHandle.read({ buffer: commentBuffer, position: eocdPosition + 56 });
    }

    return {
      versionMadeBy: fixedLengthBuffer.readUInt16LE(12),
      versionNeeded: fixedLengthBuffer.readUInt16LE(14),
      diskNumber: fixedLengthBuffer.readUInt32LE(16),
      centralDirectoryDiskStart: fixedLengthBuffer.readUInt32LE(20),
      centralDirectoryDiskRecordsCount: Number(fixedLengthBuffer.readBigUInt64LE(24)),
      centralDirectoryTotalRecordsCount: Number(fixedLengthBuffer.readBigUInt64LE(32)),
      centralDirectorySizeBytes: Number(fixedLengthBuffer.readBigUInt64LE(40)),
      centralDirectoryOffset: Number(fixedLengthBuffer.readBigUInt64LE(48)),
      comment: CP437Decoder.decode(commentBuffer),
    };
  }

  getDiskNumber(): number {
    return this.record.diskNumber === 0xff_ff && this.zip64Record !== undefined
      ? this.zip64Record.diskNumber
      : this.record.diskNumber;
  }

  getCentralDirectoryDiskStart(): number {
    return this.record.centralDirectoryDiskStart === 0xff_ff && this.zip64Record !== undefined
      ? this.zip64Record.centralDirectoryDiskStart
      : this.record.centralDirectoryDiskStart;
  }

  getCentralDirectoryDiskRecordsCount(): number {
    return this.record.centralDirectoryDiskRecordsCount === 0xff_ff &&
      this.zip64Record !== undefined
      ? this.zip64Record.centralDirectoryDiskRecordsCount
      : this.record.centralDirectoryDiskRecordsCount;
  }

  getCentralDirectoryTotalRecordsCount(): number {
    return this.record.centralDirectoryTotalRecordsCount === 0xff_ff &&
      this.zip64Record !== undefined
      ? this.zip64Record.centralDirectoryTotalRecordsCount
      : this.record.centralDirectoryTotalRecordsCount;
  }

  getCentralDirectorySizeBytes(): number {
    return this.record.centralDirectorySizeBytes === 0xff_ff_ff_ff && this.zip64Record !== undefined
      ? this.zip64Record.centralDirectorySizeBytes
      : this.record.centralDirectorySizeBytes;
  }

  getCentralDirectoryOffset(): number {
    return this.record.centralDirectoryOffset === 0xff_ff_ff_ff && this.zip64Record !== undefined
      ? this.zip64Record.centralDirectoryOffset
      : this.record.centralDirectoryOffset;
  }

  getComment(): string {
    return this.record.comment;
  }

  getZip64Record(): IZip64EndOfCentralDirectoryRecord | undefined {
    return this.zip64Record;
  }
}
