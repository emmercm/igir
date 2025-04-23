import fs from 'node:fs';

import CP437Decoder from './cp437Decoder.js';

export interface IEndOfCentralDirectoryRecord {
  diskNumber: number;
  centralDirectoryDiskStart: number;
  centralDirectoryDiskRecordsCount: number;
  centralDirectoryTotalRecordsCount: number;
  centralDirectorySizeBytes: number;
  centralDirectoryOffset: number;
  comment: string;
  // Zip64
  versionMadeBy?: number;
  versionNeeded?: number;
}

export default class EndOfCentralDirectoryRecord implements IEndOfCentralDirectoryRecord {
  public static readonly END_OF_CENTRAL_DIRECTORY_SIGNATURE = Buffer.from(
    '06054b50',
    'hex',
  ).reverse();
  public static readonly END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = Buffer.from(
    '06064b50',
    'hex',
  ).reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly END_OF_CENTRAL_DIRECTORY_SIZE = 22;

  // Maximum size of the non-zip64 EOCD
  private static readonly BACKWARD_CHUNK_SIZE: number = 22 + 0xff_ff;

  readonly _isZip64: boolean;
  readonly centralDirectoryDiskRecordsCount: number;
  readonly centralDirectoryDiskStart: number;
  readonly centralDirectoryOffset: number;
  readonly centralDirectorySizeBytes: number;
  readonly centralDirectoryTotalRecordsCount: number;
  readonly comment: string;
  readonly diskNumber: number;
  readonly versionMadeBy?: number;
  readonly versionNeeded?: number;

  private constructor(isZip64: boolean, props: IEndOfCentralDirectoryRecord) {
    this._isZip64 = isZip64;
    this.centralDirectoryDiskRecordsCount = props.centralDirectoryDiskRecordsCount;
    this.centralDirectoryDiskStart = props.centralDirectoryDiskStart;
    this.centralDirectoryOffset = props.centralDirectoryOffset;
    this.centralDirectorySizeBytes = props.centralDirectorySizeBytes;
    this.centralDirectoryTotalRecordsCount = props.centralDirectoryTotalRecordsCount;
    this.comment = props.comment;
    this.diskNumber = props.diskNumber;
    this.versionMadeBy = props.versionMadeBy;
    this.versionNeeded = props.versionNeeded;
  }

  static async fromFileHandle(
    fileHandle: fs.promises.FileHandle,
  ): Promise<EndOfCentralDirectoryRecord> {
    const fileSize = (await fileHandle.stat()).size;
    let filePosition = Math.max(fileSize - 1 - this.BACKWARD_CHUNK_SIZE, 0);
    const buffer = Buffer.allocUnsafe(Math.min(this.BACKWARD_CHUNK_SIZE, fileSize));

    // Find where the start position of the EOCD
    while (filePosition >= 0) {
      const readResult = await fileHandle.read({ buffer, position: filePosition });

      // Look for zip64 EOCD
      const eocdPositionZip64 = buffer
        .subarray(0, readResult.bytesRead)
        .lastIndexOf(this.END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE);
      if (eocdPositionZip64 !== -1) {
        return this.readEndOfCentralDirectoryRecordZip64(
          fileHandle,
          filePosition + eocdPositionZip64,
        );
      }

      // Look for zip EOCD
      const eocdPosition = buffer
        .subarray(0, readResult.bytesRead)
        .lastIndexOf(this.END_OF_CENTRAL_DIRECTORY_SIGNATURE);
      if (eocdPosition !== -1) {
        return this.readEndOfCentralDirectoryRecordZip(fileHandle, filePosition + eocdPosition);
      }

      filePosition -= readResult.bytesRead;
    }

    throw new Error('could not find end of central directory record');
  }

  private static async readEndOfCentralDirectoryRecordZip(
    fileHandle: fs.promises.FileHandle,
    eocdPosition: number,
  ): Promise<EndOfCentralDirectoryRecord> {
    const buffer = Buffer.allocUnsafe(this.END_OF_CENTRAL_DIRECTORY_SIZE);

    // Read the EOCD record except for the variable-length comment
    await fileHandle.read({ buffer, position: eocdPosition });
    if (!buffer.subarray(0, 4).equals(this.END_OF_CENTRAL_DIRECTORY_SIGNATURE)) {
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
        position: eocdPosition + this.END_OF_CENTRAL_DIRECTORY_SIZE,
        length: commentLength,
      });
      commentBuffer = readResult.buffer.subarray(0, readResult.bytesRead);
    } else {
      // The comment is long, allocate a new buffer
      const readResult = await fileHandle.read({
        buffer: Buffer.alloc(commentLength),
        position: eocdPosition + this.END_OF_CENTRAL_DIRECTORY_SIZE,
      });
      commentBuffer = readResult.buffer;
    }
    const comment = CP437Decoder.decode(commentBuffer);

    return new EndOfCentralDirectoryRecord(false, {
      diskNumber,
      centralDirectoryDiskStart,
      centralDirectoryDiskRecordsCount,
      centralDirectoryTotalRecordsCount,
      centralDirectorySizeBytes,
      centralDirectoryOffset,
      comment,
    });
  }

  private static async readEndOfCentralDirectoryRecordZip64(
    fileHandle: fs.promises.FileHandle,
    eocdPosition: number,
  ): Promise<EndOfCentralDirectoryRecord> {
    const eocdZip64SizeBuffer = await fileHandle.read({ position: eocdPosition + 4, length: 8 });
    const eocdZip64Size = eocdZip64SizeBuffer.buffer.readBigUInt64LE() + 12n;

    const eocdZip64Buffer = Buffer.allocUnsafe(Number(eocdZip64Size - 12n));
    await fileHandle.read({ buffer: eocdZip64Buffer, position: eocdPosition + 12 });
    const eocdZip64 = {
      versionMadeBy: eocdZip64Buffer.readUInt16LE(0),
      versionNeeded: eocdZip64Buffer.readUInt16LE(2),
      diskNumber: eocdZip64Buffer.readUInt32LE(4),
      centralDirectoryDiskStart: eocdZip64Buffer.readUInt32LE(8),
      centralDirectoryDiskRecordsCount: Number(eocdZip64Buffer.readBigUInt64LE(12)),
      centralDirectoryTotalRecordsCount: Number(eocdZip64Buffer.readBigUInt64LE(20)),
      centralDirectorySizeBytes: Number(eocdZip64Buffer.readBigUInt64LE(28)),
      centralDirectoryOffset: Number(eocdZip64Buffer.readBigUInt64LE(36)),
      comment: CP437Decoder.decode(eocdZip64Buffer.subarray(44)),
    } satisfies IEndOfCentralDirectoryRecord;

    const eocd = await this.readEndOfCentralDirectoryRecordZip(
      fileHandle,
      eocdPosition + Number(eocdZip64Size) + 20,
    );

    return new EndOfCentralDirectoryRecord(true, {
      diskNumber: eocd.diskNumber === 0xff_ff ? eocdZip64.diskNumber : eocd.diskNumber,
      centralDirectoryDiskStart:
        eocd.centralDirectoryDiskStart === 0xff_ff
          ? eocdZip64.centralDirectoryDiskStart
          : eocd.centralDirectoryDiskStart,
      centralDirectoryDiskRecordsCount:
        eocd.centralDirectoryDiskRecordsCount === 0xff_ff
          ? eocdZip64.centralDirectoryDiskRecordsCount
          : eocd.centralDirectoryDiskRecordsCount,
      centralDirectoryTotalRecordsCount:
        eocd.centralDirectoryTotalRecordsCount === 0xff_ff
          ? eocdZip64.centralDirectoryTotalRecordsCount
          : eocd.centralDirectoryTotalRecordsCount,
      centralDirectorySizeBytes:
        eocd.centralDirectorySizeBytes === 0xff_ff_ff_ff
          ? eocdZip64.centralDirectorySizeBytes
          : eocd.centralDirectorySizeBytes,
      centralDirectoryOffset:
        eocd.centralDirectoryOffset === 0xff_ff_ff_ff
          ? eocdZip64.centralDirectoryOffset
          : eocd.centralDirectoryOffset,
      comment: eocd.comment.length > 0 ? eocd.comment : eocdZip64.comment,
      versionMadeBy: eocdZip64.versionMadeBy,
      versionNeeded: eocdZip64.versionNeeded,
    });
  }

  isZip64(): boolean {
    return this._isZip64;
  }
}
