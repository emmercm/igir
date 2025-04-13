import fs from 'node:fs';

import EndOfCentralDirectoryRecord from './endOfCentralDirectoryRecord.js';
import FileRecord, { IFileRecord } from './fileRecord.js';

export interface ICentralDirectoryFile extends IFileRecord {
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
  readonly fileComment: Buffer<ArrayBuffer>;

  private constructor(props: ICentralDirectoryFile) {
    super(props);
    this.versionMadeBy = props.versionMadeBy;
    this.internalFileAttributes = props.internalFileAttributes;
    this.externalFileAttributes = props.externalFileAttributes;
    this.fileComment = props.fileComment;
  }

  static async centralDirectoryFileFromFileHandle(
    fileHandle: fs.promises.FileHandle,
    endOfCentralDirectoryRecord: EndOfCentralDirectoryRecord,
  ): Promise<CentralDirectoryFile[]> {
    const fileHeaders: CentralDirectoryFile[] = [];

    const fixedLengthBuffer = Buffer.allocUnsafe(this.CENTRAL_DIRECTORY_FILE_HEADER_SIZE);

    let position = endOfCentralDirectoryRecord.centralDirectoryOffset;
    for (let i = 0; i < endOfCentralDirectoryRecord.centralDirectoryTotalRecordsCount; i += 1) {
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
      let fileComment: Buffer<ArrayBuffer>;
      if (fileCommentLength > 0) {
        // Only read from the file if there's something to read
        fileComment = Buffer.allocUnsafe(fileCommentLength);
        await fileHandle.read({
          buffer: fileComment,
          position:
            position +
            this.FIELD_OFFSETS.fileName +
            fileRecord.fileNameLength +
            fileRecord.extraFieldLength,
        });
      } else {
        fileComment = Buffer.alloc(0);
      }

      fileHeaders.push(
        new CentralDirectoryFile({
          ...fileRecord,
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
}
