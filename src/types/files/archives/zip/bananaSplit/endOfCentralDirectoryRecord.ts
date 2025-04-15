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
  isZip64: boolean;
  versionMadeBy?: number;
  versionNeeded?: number;
}

export default class EndOfCentralDirectoryRecord implements IEndOfCentralDirectoryRecord {
  public static readonly CENTRAL_DIRECTORY_END_SIGNATURE = Buffer.from('06054b50', 'hex').reverse();
  public static readonly CENTRAL_DIRECTORY_END_SIGNATURE_ZIP64 = Buffer.from(
    '06064b50',
    'hex',
  ).reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly CENTRAL_DIRECTORY_END_SIZE = 22;
  private static readonly CENTRAL_DIRECTORY_END_SIZE_ZIP64 = 56;

  private static readonly BACKWARD_CHUNK_SIZE: number = Math.max(
    1024,
    // End of central directory record, minus the comment
    this.CENTRAL_DIRECTORY_END_SIZE,
    this.CENTRAL_DIRECTORY_END_SIZE_ZIP64,
  );

  readonly centralDirectoryDiskRecordsCount: number;
  readonly centralDirectoryDiskStart: number;
  readonly centralDirectoryOffset: number;
  readonly centralDirectorySizeBytes: number;
  readonly centralDirectoryTotalRecordsCount: number;
  readonly comment: string;
  readonly diskNumber: number;
  readonly isZip64: boolean;
  readonly versionMadeBy?: number;
  readonly versionNeeded?: number;

  private constructor(props: IEndOfCentralDirectoryRecord) {
    this.centralDirectoryDiskRecordsCount = props.centralDirectoryDiskRecordsCount;
    this.centralDirectoryDiskStart = props.centralDirectoryDiskStart;
    this.centralDirectoryOffset = props.centralDirectoryOffset;
    this.centralDirectorySizeBytes = props.centralDirectorySizeBytes;
    this.centralDirectoryTotalRecordsCount = props.centralDirectoryTotalRecordsCount;
    this.comment = props.comment;
    this.diskNumber = props.diskNumber;
    this.isZip64 = props.isZip64;
    this.versionMadeBy = props.versionMadeBy;
    this.versionNeeded = props.versionNeeded;
  }

  static async fromFileHandle(
    fileHandle: fs.promises.FileHandle,
  ): Promise<EndOfCentralDirectoryRecord> {
    const size = (await fileHandle.stat()).size;
    let filePosition = Math.max(size - 1 - this.BACKWARD_CHUNK_SIZE, 0);
    const buffer = Buffer.alloc(this.BACKWARD_CHUNK_SIZE);

    // Find where the start position of the EOCD
    while (filePosition >= 0) {
      await fileHandle.read({ buffer, position: filePosition });

      // Look for zip64 EOCD
      const eocdPositionZip64 = buffer.lastIndexOf(this.CENTRAL_DIRECTORY_END_SIGNATURE_ZIP64);
      if (eocdPositionZip64 !== -1) {
        return this.readEndOfCentralDirectoryRecordZip64(
          fileHandle,
          filePosition + eocdPositionZip64,
        );
      }

      // Look for zip EOCD
      const eocdPosition = buffer.lastIndexOf(this.CENTRAL_DIRECTORY_END_SIGNATURE);
      if (eocdPosition !== -1) {
        return this.readEndOfCentralDirectoryRecordZip(fileHandle, filePosition + eocdPosition);
      }

      filePosition -= this.BACKWARD_CHUNK_SIZE;
    }

    throw new Error('could not find end of central directory record');
  }

  private static async readEndOfCentralDirectoryRecordZip(
    fileHandle: fs.promises.FileHandle,
    eocdPosition: number,
  ): Promise<EndOfCentralDirectoryRecord> {
    const buffer = Buffer.allocUnsafe(this.CENTRAL_DIRECTORY_END_SIZE);

    // Read the EOCD record except for the variable-length comment
    await fileHandle.read({ buffer, position: eocdPosition });
    if (!buffer.subarray(0, 4).equals(this.CENTRAL_DIRECTORY_END_SIGNATURE)) {
      throw new Error('bad end of central directory record position');
    }

    const isZip64 = false;
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
        position: eocdPosition + this.CENTRAL_DIRECTORY_END_SIZE,
        length: commentLength,
      });
      commentBuffer = readResult.buffer.subarray(0, readResult.bytesRead);
    } else {
      // The comment is long, allocate a new buffer
      const readResult = await fileHandle.read({
        buffer: Buffer.alloc(commentLength),
        position: eocdPosition + this.CENTRAL_DIRECTORY_END_SIZE,
      });
      commentBuffer = readResult.buffer;
    }
    const comment = CP437Decoder.decode(commentBuffer);

    return new EndOfCentralDirectoryRecord({
      isZip64,
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
    const eocdSizeBuffer = await fileHandle.read({ position: eocdPosition + 4, length: 8 });
    const eocdSize = eocdSizeBuffer.buffer.readBigUInt64LE();

    const buffer = Buffer.allocUnsafe(Number(eocdSize));

    // Read the EOCD record
    await fileHandle.read({ buffer, position: eocdPosition + 12 });
    return new EndOfCentralDirectoryRecord({
      isZip64: true,
      versionMadeBy: buffer.readUInt16LE(0),
      versionNeeded: buffer.readUInt16LE(2),
      diskNumber: buffer.readUInt32LE(4),
      centralDirectoryDiskStart: buffer.readUInt32LE(8),
      centralDirectoryDiskRecordsCount: Number(buffer.readBigUInt64LE(12)),
      centralDirectoryTotalRecordsCount: Number(buffer.readBigUInt64LE(20)),
      centralDirectorySizeBytes: Number(buffer.readBigUInt64LE(28)),
      centralDirectoryOffset: Number(buffer.readBigUInt64LE(36)),
      comment: CP437Decoder.decode(buffer.subarray(44)),
    });
  }
}
