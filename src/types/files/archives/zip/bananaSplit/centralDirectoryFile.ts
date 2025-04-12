import fs from 'node:fs';

import FileRecord, { IFileRecord, IFileRecordZip64 } from './fileRecord.js';

export interface ICentralDirectoryFileZip64 extends IFileRecordZip64 {
  fileDiskStart: number;
  localFileHeaderRelativeOffset: number;
}

export interface ICentralDirectoryFile extends IFileRecord, ICentralDirectoryFileZip64 {
  versionMadeBy: number;
  internalFileAttributes: number;
  externalFileAttributes: number;
  fileComment: Buffer<ArrayBuffer>;
}

export default class CentralDirectoryFile extends FileRecord implements ICentralDirectoryFile {
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = Buffer.from(
    '02014b50',
    'hex',
  ).reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIZE = 46;

  private static readonly FIELD_OFFSETS = {
    versionNeeded: 4,
    generalPurposeBitFlag: 8,
    compressionMethod: 10,
    modifiedTime: 12,
    modifiedDate: 14,
    uncompressedCrc32: 16,
    compressedSize: 20,
    uncompressedSize: 24,
    fileNameLength: 28,
    extraFieldLength: 30,
    fileCommentLength: 32,
    fileDiskStart: 34,
    localFileHeaderRelativeOffset: 42,
    fileName: 46,
  } as const;

  readonly versionMadeBy: number;
  readonly internalFileAttributes: number;
  readonly externalFileAttributes: number;
  readonly fileDiskStart: number;
  readonly localFileHeaderRelativeOffset: number;
  readonly fileComment: Buffer<ArrayBuffer>;

  private constructor(props: ICentralDirectoryFile) {
    super(props);
    this.versionMadeBy = props.versionMadeBy;
    this.internalFileAttributes = props.internalFileAttributes;
    this.externalFileAttributes = props.externalFileAttributes;
    this.fileDiskStart = props.fileDiskStart;
    this.localFileHeaderRelativeOffset = props.localFileHeaderRelativeOffset;
    this.fileComment = props.fileComment;
  }

  static async centralDirectoryFileFromFileHandle(
    fileHandle: fs.promises.FileHandle,
    centralDirectoryOffset: number,
  ): Promise<CentralDirectoryFile[]> {
    const fileHeaders: CentralDirectoryFile[] = [];

    let position = centralDirectoryOffset;

    const fixedLengthBuffer = Buffer.allocUnsafe(this.CENTRAL_DIRECTORY_FILE_HEADER_SIZE);

    const fileHandleSize = (await fileHandle.stat()).size;
    while (position < fileHandleSize) {
      await fileHandle.read({ buffer: fixedLengthBuffer, position });
      if (!fixedLengthBuffer.subarray(0, 4).equals(this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE)) {
        // Got to the end of the central directory
        break;
      }

      const fileRecord = await FileRecord.fileRecordFromFileHandle(
        fileHandle,
        position,
        this.FIELD_OFFSETS,
      );

      const fileCommentLength = fixedLengthBuffer.readUInt16LE(
        this.FIELD_OFFSETS.fileCommentLength,
      );
      const fileComment = Buffer.allocUnsafe(fileCommentLength);
      await fileHandle.read({
        buffer: fileComment,
        position:
          position +
          this.FIELD_OFFSETS.fileName +
          fileRecord.fileNameLength +
          fileRecord.extraFieldLength,
      });

      const zip64ExtendableInformation = this.parseCentralDirectoryFileZip64(
        fileRecord.extraFields.get(0x00_01),
        {
          compressedSize: fileRecord.compressedSize,
          uncompressedSize: fileRecord.uncompressedSize,
          fileDiskStart: fixedLengthBuffer.readUInt16LE(this.FIELD_OFFSETS.fileDiskStart),
          localFileHeaderRelativeOffset: fixedLengthBuffer.readUInt32LE(
            this.FIELD_OFFSETS.localFileHeaderRelativeOffset,
          ),
        },
      );

      fileHeaders.push(
        new CentralDirectoryFile({
          ...fileRecord,
          ...zip64ExtendableInformation,
          versionMadeBy: fixedLengthBuffer.readUInt16LE(4),
          internalFileAttributes: fixedLengthBuffer.readUInt16LE(36),
          externalFileAttributes: fixedLengthBuffer.readUInt32LE(38),
          fileComment,
        }),
      );

      position +=
        fixedLengthBuffer.length +
        fileRecord.fileNameLength +
        fileRecord.extraFieldLength +
        fileCommentLength;
    }

    return fileHeaders;
  }

  private static parseCentralDirectoryFileZip64(
    buffer: Buffer<ArrayBuffer> | undefined,
    originalDirectoryRecord: ICentralDirectoryFileZip64,
  ): ICentralDirectoryFileZip64 {
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
}
