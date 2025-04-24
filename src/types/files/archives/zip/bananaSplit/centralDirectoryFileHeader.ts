import fs from 'node:fs';
import stream from 'node:stream';

import CP437Decoder from './cp437Decoder.js';
import EndOfCentralDirectory from './endOfCentralDirectory.js';
import FileRecord, { CompressionMethodValue, IFileRecord } from './fileRecord.js';
import FileRecordUtil from './fileRecordUtil.js';
import LocalFileHeader from './localFileHeader.js';

export interface ICentralDirectoryFileHeader extends IFileRecord {
  versionMadeBy: number;
  fileCommentLength: number;
  fileDiskStart: number;
  internalFileAttributes: number;
  externalFileAttributes: number;
  localFileHeaderRelativeOffset: number;
  fileComment: Buffer<ArrayBuffer>;
}

export default class CentralDirectoryFileHeader extends FileRecord {
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = Buffer.from(
    '02014b50',
    'hex',
  ).reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIZE = 46;

  private readonly zipFilePath: string;

  private readonly versionMadeBy: number;
  private readonly fileCommentLength: number;
  private readonly fileDiskStart: number;
  private readonly internalFileAttributes: number;
  private readonly externalFileAttributes: number;
  private readonly localFileHeaderRelativeOffset: number;
  private readonly fileComment: Buffer<ArrayBuffer>;

  private _localFileHeader?: LocalFileHeader;

  private constructor(zipFilePath: string, props: ICentralDirectoryFileHeader) {
    super(props);
    this.zipFilePath = zipFilePath;

    this.versionMadeBy = props.versionMadeBy;
    this.fileCommentLength = props.fileCommentLength;
    this.fileDiskStart = props.fileDiskStart;
    this.internalFileAttributes = props.internalFileAttributes;
    this.externalFileAttributes = props.externalFileAttributes;
    this.localFileHeaderRelativeOffset = props.localFileHeaderRelativeOffset;
    this.fileComment = props.fileComment;
  }

  static async centralDirectoryFileFromFileHandle(
    zipFilePath: string,
    fileHandle: fs.promises.FileHandle,
    endOfCentralDirectoryRecord: EndOfCentralDirectory,
  ): Promise<CentralDirectoryFileHeader[]> {
    if (
      endOfCentralDirectoryRecord.getDiskNumber() !== 0 ||
      endOfCentralDirectoryRecord.getCentralDirectoryDiskStart() !== 0
    ) {
      throw new Error(`multi-disk zips aren't supported`);
    }

    const fileHeaders: CentralDirectoryFileHeader[] = [];

    const fixedLengthBuffer = Buffer.allocUnsafe(this.CENTRAL_DIRECTORY_FILE_HEADER_SIZE);

    let position = endOfCentralDirectoryRecord.getCentralDirectoryOffset();
    for (
      let i = 0;
      i < endOfCentralDirectoryRecord.getCentralDirectoryTotalRecordsCount();
      i += 1
    ) {
      // const fileRecord = await FileRecord.fileRecordFromFileHandle(
      //   zipFilePath,
      //   fileHandle,
      //   position,
      //   this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE,
      //   this.CENTRAL_DIRECTORY_FILE_HEADER_SIZE,
      //   this.FIELD_OFFSETS,
      // );

      await fileHandle.read({ buffer: fixedLengthBuffer, position });

      const signature = fixedLengthBuffer.subarray(
        0,
        this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE.length,
      );
      if (!signature.equals(this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE)) {
        throw new Error(
          `invalid zip central directory file header signature: 0x${signature.toString('hex')}`,
        );
      }

      const versionMadeBy = fixedLengthBuffer.readUInt16LE(4);
      const versionNeeded = fixedLengthBuffer.readUInt16LE(6);
      const generalPurposeBitFlag = fixedLengthBuffer.readUInt16LE(8);
      const compressionMethod = fixedLengthBuffer.readUInt16LE(10) as CompressionMethodValue;
      const fileModificationTime = fixedLengthBuffer.readUInt16LE(12);
      const fileModificationDate = fixedLengthBuffer.readUInt16LE(14);
      const uncompressedCrc32 = Buffer.from(fixedLengthBuffer.subarray(16, 20));
      const compressedSize = fixedLengthBuffer.readUInt32LE(20);
      const uncompressedSize = fixedLengthBuffer.readUInt32LE(24);
      const fileNameLength = fixedLengthBuffer.readUInt16LE(28);
      const extraFieldLength = fixedLengthBuffer.readUInt16LE(30);
      const fileCommentLength = fixedLengthBuffer.readUInt16LE(32);
      const fileDiskStart = fixedLengthBuffer.readUInt16LE(34);
      const internalFileAttributes = fixedLengthBuffer.readUInt16LE(36);
      const externalFileAttributes = fixedLengthBuffer.readUInt32LE(38);
      const localFileHeaderRelativeOffset = fixedLengthBuffer.readUInt32LE(42);

      const variableLengthBufferSize = fileNameLength + extraFieldLength + fileCommentLength;
      let variableLengthBuffer: Buffer<ArrayBuffer>;
      if (variableLengthBufferSize > 0) {
        // Only read from the file if there's something to read
        variableLengthBuffer = Buffer.allocUnsafe(variableLengthBufferSize);
        await fileHandle.read({
          buffer: variableLengthBuffer,
          position: position + fixedLengthBuffer.length,
        });
      } else {
        variableLengthBuffer = Buffer.alloc(0);
      }

      const fileName = Buffer.from(variableLengthBuffer.subarray(0, fileNameLength));
      const extraFields = FileRecordUtil.parseExtraFields(
        variableLengthBuffer.subarray(fileNameLength, fileNameLength + extraFieldLength),
      );
      const fileComment = Buffer.from(
        variableLengthBuffer.subarray(fileNameLength + extraFieldLength),
      );

      const zip64ExtendedInformation = FileRecordUtil.parseZip64ExtendedInformation(
        extraFields.get(0x00_01),
        uncompressedSize,
        compressedSize,
        localFileHeaderRelativeOffset,
        fileDiskStart,
      );

      fileHeaders.push(
        new CentralDirectoryFileHeader(zipFilePath, {
          raw: Buffer.concat([fixedLengthBuffer, variableLengthBuffer]),
          versionMadeBy,
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
          fileCommentLength,
          fileDiskStart,
          internalFileAttributes,
          externalFileAttributes,
          localFileHeaderRelativeOffset,
          fileName,
          extraFields,
          fileComment,
          zip64ExtendedInformation,
        }),
      );

      position += fixedLengthBuffer.length + variableLengthBuffer.length;
    }

    return fileHeaders;
  }

  getZipFilePath(): string {
    return this.zipFilePath;
  }

  getVersionMadeBy(): number {
    return this.versionMadeBy;
  }

  getFileDiskStart(): number {
    return this.getZip64ExtendedInformation()?.fileDiskStart ?? this.fileDiskStart;
  }

  getInternalFileAttributes(): number {
    return this.internalFileAttributes;
  }

  getExternalFileAttributes(): number {
    return this.externalFileAttributes;
  }

  getLocalFileHeaderRelativeOffset(): number {
    return (
      this.getZip64ExtendedInformation()?.localFileHeaderRelativeOffset ??
      this.localFileHeaderRelativeOffset
    );
  }

  getFileComment(): string {
    return (
      this.getExtraFields().get(0x63_75)?.subarray(5).toString('utf8') ??
      (this.getGeneralPurposeBitFlag() & 0x8_00
        ? this.fileComment.toString('utf8')
        : CP437Decoder.decode(this.fileComment))
    );
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
