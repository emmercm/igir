import fs from 'node:fs';
import stream from 'node:stream';

import CP437Decoder from './cp437Decoder.js';
import EndOfCentralDirectory from './endOfCentralDirectory.js';
import { CompressionMethodValue } from './fileRecord.js';
import FileRecordUtil, { IZip64ExtendedInformation } from './fileRecordUtil.js';
import LocalFileHeader from './localFileHeader.js';
import TimestampUtil from './timestampUtil.js';

export interface ICentralDirectoryFileHeader {
  versionMadeBy: number;
  versionNeeded: number;
  generalPurposeBitFlag: number;
  compressionMethod: CompressionMethodValue;
  fileModificationTime: number;
  fileModificationDate: number;
  uncompressedCrc32: Buffer<ArrayBuffer>;
  compressedSize: number;
  uncompressedSize: number;
  fileNameLength: number;
  extraFieldLength: number;
  fileCommentLength: number;
  fileDiskStart: number;
  internalFileAttributes: number;
  externalFileAttributes: number;
  localFileHeaderRelativeOffset: number;
  fileName: Buffer<ArrayBuffer>;
  extraFields: Map<number, Buffer<ArrayBuffer>>;
  fileComment: Buffer<ArrayBuffer>;

  zip64ExtendedInformation?: IZip64ExtendedInformation;
}

export default class CentralDirectoryFileHeader {
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = Buffer.from(
    '02014b50',
    'hex',
  ).reverse();

  // Size with the signature, and without variable length fields at the end
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIZE = 46;

  private readonly zipFilePath: string;

  private readonly versionMadeBy: number;
  private readonly versionNeeded: number;
  private readonly generalPurposeBitFlag: number;
  private readonly compressionMethod: CompressionMethodValue;
  private readonly fileModificationTime: number;
  private readonly fileModificationDate: number;
  private readonly uncompressedCrc32: Buffer<ArrayBuffer>;
  private readonly compressedSize: number;
  private readonly uncompressedSize: number;
  private readonly fileNameLength: number;
  private readonly extraFieldLength: number;
  private readonly fileCommentLength: number;
  private readonly fileDiskStart: number;
  private readonly internalFileAttributes: number;
  private readonly externalFileAttributes: number;
  private readonly localFileHeaderRelativeOffset: number;
  private readonly fileName: Buffer<ArrayBuffer>;
  private readonly extraFields: Map<number, Buffer<ArrayBuffer>>;
  private readonly fileComment: Buffer<ArrayBuffer>;

  private readonly zip64ExtendedInformation?: IZip64ExtendedInformation;

  private _localFileHeader?: LocalFileHeader;

  private constructor(zipFilePath: string, props: ICentralDirectoryFileHeader) {
    this.zipFilePath = zipFilePath;

    this.versionMadeBy = props.versionMadeBy;
    this.versionNeeded = props.versionNeeded;
    this.generalPurposeBitFlag = props.generalPurposeBitFlag;
    this.compressionMethod = props.compressionMethod;
    this.fileModificationTime = props.fileModificationTime;
    this.fileModificationDate = props.fileModificationDate;
    this.uncompressedCrc32 = props.uncompressedCrc32;
    this.compressedSize = props.compressedSize;
    this.uncompressedSize = props.uncompressedSize;
    this.fileNameLength = props.fileNameLength;
    this.extraFieldLength = props.extraFieldLength;
    this.fileCommentLength = props.fileCommentLength;
    this.fileDiskStart = props.fileDiskStart;
    this.internalFileAttributes = props.internalFileAttributes;
    this.externalFileAttributes = props.externalFileAttributes;
    this.localFileHeaderRelativeOffset = props.localFileHeaderRelativeOffset;
    this.fileName = props.fileName;
    this.extraFields = props.extraFields;
    this.fileComment = props.fileComment;

    this.zip64ExtendedInformation = props.zip64ExtendedInformation;
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

  getCompressionMethod(): CompressionMethodValue {
    return this.compressionMethod;
  }

  getFileModification(): Date {
    // TODO(cemmer): 0x000d UNIX timestamp
    // TODO(cemmer): 0x7855 unix extra field new?
    return (
      TimestampUtil.parseExtendedTimestamp(this.extraFields.get(0x54_55))?.modified ??
      TimestampUtil.parseUnixExtraTimestamp(this.extraFields.get(0x58_55))?.modified ??
      TimestampUtil.parseNtfsExtraTimestamp(this.extraFields.get(0x00_0a))?.modified ??
      TimestampUtil.parseDOSTimestamp(this.fileModificationTime, this.fileModificationDate)
    );
  }

  getUncompressedCrc32(): string {
    return Buffer.from(this.uncompressedCrc32).reverse().toString('hex').toLowerCase();
  }

  getCompressedSize(): number {
    return (
      this.zip64ExtendedInformation?.compressedSize ??
      this.compressedSize - (this.isEncrypted() ? 12 : 0)
    );
  }

  getUncompressedSize(): number {
    return this.zip64ExtendedInformation?.uncompressedSize ?? this.uncompressedSize;
  }

  getFileDiskStart(): number {
    return this.zip64ExtendedInformation?.fileDiskStart ?? this.fileDiskStart;
  }

  getLocalFileHeaderRelativeOffset(): number {
    return (
      this.zip64ExtendedInformation?.localFileHeaderRelativeOffset ??
      this.localFileHeaderRelativeOffset
    );
  }

  getFileName(): string {
    return (
      // Info-ZIP Unicode Path Extra Field
      this.extraFields.get(0x70_75)?.subarray(5).toString('utf8') ??
      (this.generalPurposeBitFlag & 0x8_00
        ? this.fileName.toString('utf8')
        : CP437Decoder.decode(this.fileName))
    );
  }

  getFileComment(): string {
    return (
      this.extraFields.get(0x63_75)?.subarray(5).toString('utf8') ??
      (this.generalPurposeBitFlag & 0x8_00
        ? this.fileComment.toString('utf8')
        : CP437Decoder.decode(this.fileComment))
    );
  }

  isEncrypted(): boolean {
    return (this.generalPurposeBitFlag & 0x01) !== 0;
  }

  isDirectory(): boolean {
    return this.getFileName().endsWith('/');
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
