import fs from 'node:fs';
import stream from 'node:stream';

import EndOfCentralDirectoryRecord from './endOfCentralDirectoryRecord.js';
import FileRecord, { IFileRecord } from './fileRecord.js';
import LocalFileHeader from './localFileHeader.js';

export interface ICentralDirectoryFile extends IFileRecord {
  versionMadeBy: number;
  internalFileAttributes: number;
  externalFileAttributes: number;
  localFileHeaderRelativeOffset: number;
  fileComment: string;
}

export default class CentralDirectoryFileHeader
  extends FileRecord
  implements ICentralDirectoryFile
{
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
  readonly localFileHeaderRelativeOffset: number;
  readonly fileComment: string;

  private _localFileHeader?: LocalFileHeader;

  private constructor(props: ICentralDirectoryFile) {
    super(props);
    this.versionMadeBy = props.versionMadeBy;
    this.internalFileAttributes = props.internalFileAttributes;
    this.externalFileAttributes = props.externalFileAttributes;
    this.localFileHeaderRelativeOffset = props.localFileHeaderRelativeOffset;
    this.fileComment = props.fileComment;
  }

  static async centralDirectoryFileFromFileHandle(
    zipFilePath: string,
    fileHandle: fs.promises.FileHandle,
    endOfCentralDirectoryRecord: EndOfCentralDirectoryRecord,
  ): Promise<CentralDirectoryFileHeader[]> {
    if (
      endOfCentralDirectoryRecord.diskNumber !== 0 ||
      endOfCentralDirectoryRecord.centralDirectoryDiskStart !== 0
    ) {
      throw new Error(`multi-disk zips aren't supported`);
    }

    const fileHeaders: CentralDirectoryFileHeader[] = [];

    const fixedLengthBuffer = Buffer.allocUnsafe(this.CENTRAL_DIRECTORY_FILE_HEADER_SIZE);

    let position = endOfCentralDirectoryRecord.centralDirectoryOffset;
    for (let i = 0; i < endOfCentralDirectoryRecord.centralDirectoryTotalRecordsCount; i += 1) {
      await fileHandle.read({ buffer: fixedLengthBuffer, position });

      const signature = fixedLengthBuffer.subarray(0, 4);
      if (!signature.equals(this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE)) {
        throw new Error(
          `invalid zip central directory file header signature for file ${i + 1}/${endOfCentralDirectoryRecord.centralDirectoryTotalRecordsCount}: 0x${signature.toString('hex')}`,
        );
      }

      const fileRecord = await FileRecord.fileRecordFromFileHandle(
        zipFilePath,
        fileHandle,
        position,
        this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE,
        this.FIELD_OFFSETS,
      );

      fileHeaders.push(
        new CentralDirectoryFileHeader({
          ...fileRecord,
          zipFilePath: zipFilePath,
          versionMadeBy: fixedLengthBuffer.readUInt16LE(4),
          internalFileAttributes: fixedLengthBuffer.readUInt16LE(36),
          externalFileAttributes: fixedLengthBuffer.readUInt32LE(38),
          localFileHeaderRelativeOffset: fileRecord.localFileHeaderRelativeOffset as number,
          fileComment: fileRecord.fileComment as string,
        }),
      );

      position +=
        fixedLengthBuffer.length +
        fileRecord.fileNameLength +
        fileRecord.extraFieldLength +
        (fileRecord.fileCommentLength as number);
    }

    return fileHeaders;
  }

  /**
   * Return the local file header associated with this central directory file header.
   */
  async localFileHeader(): Promise<LocalFileHeader> {
    if (this._localFileHeader !== undefined) {
      return this._localFileHeader;
    }

    const fileHandle = await fs.promises.open(this.zipFilePath, 'r');
    try {
      this._localFileHeader = await LocalFileHeader.localFileRecordFromFileHandle(this, fileHandle);
      return this._localFileHeader;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Return this file's compressed/raw stream.
   */
  async compressedStream(): Promise<stream.Readable> {
    const localFileHeader = await this.localFileHeader();
    return localFileHeader.compressedStream();
  }

  /**
   * Return this file's uncompressed/decompressed stream.
   */
  async uncompressedStream(): Promise<stream.Readable> {
    const localFileHeader = await this.localFileHeader();
    return localFileHeader.uncompressedStream();
  }
}
