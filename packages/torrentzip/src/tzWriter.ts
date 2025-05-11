import fs from 'node:fs';
import os from 'node:os';
import stream, { Readable } from 'node:stream';
import util from 'node:util';

import { crc32 } from '@node-rs/crc32';

import CompressedTransform from './compressedTransform.js';
import CP437Encoder from './cp437Encoder.js';
import UncompressedTransform from './uncompressedTransform.js';
import ZlibDeflateTransform from './zlibDeflateTransform.js';
import ZstdCompressTransform from './zstdCompressTransform.js';

export const CompressionMethod = {
  DEFLATE: 'DEFLATE',
  ZSTD: 'ZSTD',
};
export type CompressionMethodKey = keyof typeof CompressionMethod;
export type CompressionMethodValue = (typeof CompressionMethod)[CompressionMethodKey];

interface LocalFileHeader {
  position: number;
  uncompressedCrc32: number;
  compressedSize: number;
  uncompressedSize: number;
  rawBytes: Buffer<ArrayBuffer>;
}

/**
 * Write a TorrentZip file.
 */
export default class TZWriter {
  private static readonly LOCAL_FILE_HEADER_MIN_LENGTH = 30;
  private static readonly LOCAL_FILE_HEADER_SIGNATURE = Buffer.from('504B0304', 'hex');
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_MIN_LENGTH = 46;
  private static readonly CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = Buffer.from('504B0102', 'hex');
  private static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_LENGTH = 56;
  private static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE = Buffer.from(
    '504B0606',
    'hex',
  );
  private static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_LENGTH = 20;
  private static readonly ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE = Buffer.from(
    '504B0607',
    'hex',
  );
  private static readonly END_OF_CENTRAL_DIRECTORY_HEADER_MIN_LENGTH = 22;
  private static readonly END_OF_CENTRAL_DIRECTORY_HEADER_SIGNATURE = Buffer.from(
    '504B0506',
    'hex',
  );

  private readonly fileHandle: fs.promises.FileHandle;
  private readonly compressionMethod: CompressionMethodValue;

  private filePosition = 0;
  private readonly localFileHeaders: LocalFileHeader[] = [];

  private constructor(
    fileHandle: fs.promises.FileHandle,
    compressionMethod: CompressionMethodValue,
  ) {
    this.fileHandle = fileHandle;
    this.compressionMethod = compressionMethod;
  }

  /**
   * Open a file path for writing.
   */
  static async open(
    filePath: string,
    compressionMethod: CompressionMethodValue,
  ): Promise<TZWriter> {
    const fileHandle = await fs.promises.open(filePath, 'w');
    return new TZWriter(fileHandle, compressionMethod);
  }

  /**
   * Add a stream to the TorrentZip.
   */
  async addStream(
    readable: Readable,
    filename: string,
    uncompressedSize: number,
    compressorThreads: number,
  ): Promise<void> {
    // Figure out how long the local file header will be
    let localFileHeaderPlaceholder: Buffer<ArrayBuffer>;
    if (uncompressedSize >= 0xff_ff_ff_ff) {
      localFileHeaderPlaceholder = this.zip64LocalFileHeader(filename, this.filePosition);
    } else {
      localFileHeaderPlaceholder = this.localFileHeader(filename);
    }
    await this.fileHandle.write(
      localFileHeaderPlaceholder,
      undefined,
      undefined,
      this.filePosition,
    );

    // Write the file data
    const uncompressedTransform = new UncompressedTransform();
    const compressedTransform = new CompressedTransform();
    await util.promisify(stream.pipeline)(
      readable,
      uncompressedTransform,
      this.compressionMethod === CompressionMethod.DEFLATE
        ? new ZlibDeflateTransform()
        : new ZstdCompressTransform(compressorThreads),
      compressedTransform,
      fs.createWriteStream(os.devNull, {
        fd: this.fileHandle.fd,
        autoClose: false,
        start: this.filePosition + localFileHeaderPlaceholder.length,
      }),
    );

    // Write the final local file header
    let localFileHeader: Buffer<ArrayBuffer>;
    if (uncompressedSize >= 0xff_ff_ff_ff) {
      localFileHeader = this.zip64LocalFileHeader(
        filename,
        this.filePosition,
        uncompressedTransform.getCrc32(),
        compressedTransform.getSize(),
        uncompressedTransform.getSize(),
      );
    } else {
      localFileHeader = this.localFileHeader(
        filename,
        uncompressedTransform.getCrc32(),
        compressedTransform.getSize(),
        uncompressedTransform.getSize(),
      );
    }
    await this.fileHandle.write(localFileHeader, undefined, undefined, this.filePosition);

    this.localFileHeaders.push({
      position: this.filePosition,
      uncompressedCrc32: uncompressedTransform.getCrc32(),
      compressedSize: compressedTransform.getSize(),
      uncompressedSize: uncompressedTransform.getSize(),
      rawBytes: localFileHeader,
    });
    this.filePosition += localFileHeader.length + compressedTransform.getSize();
  }

  private localFileHeader(
    filename: string,
    uncompressedCrc32?: number,
    compressedSize?: number,
    uncompressedSize?: number,
  ): Buffer<ArrayBuffer> {
    const cp437 = CP437Encoder.canEncode(filename);
    const encodedFilename = cp437 ? CP437Encoder.encode(filename) : Buffer.from(filename, 'utf8');

    const buffer = Buffer.allocUnsafe(
      TZWriter.LOCAL_FILE_HEADER_MIN_LENGTH + encodedFilename.length,
    );
    TZWriter.LOCAL_FILE_HEADER_SIGNATURE.copy(buffer);

    if (this.compressionMethod === CompressionMethod.DEFLATE) {
      buffer.writeUInt16LE(20, 4); // version needed
    } else {
      buffer.writeUInt16LE(63, 4); // version needed
    }

    buffer.writeUInt16LE(0x02 | (cp437 ? 0x0 : 0x8_00), 6); // general purpose flag (max compression)

    if (this.compressionMethod === CompressionMethod.DEFLATE) {
      buffer.writeUInt16LE(8, 8); // compression method
    } else {
      buffer.writeUInt16LE(93, 8); // compression method
    }

    if (this.compressionMethod === CompressionMethod.DEFLATE) {
      buffer.writeUInt16LE(48_128, 10); // file last modification time
      buffer.writeUInt16LE(8600, 12); // file last modification date
    } else {
      buffer.writeUInt16LE(0, 10); // file last modification time
      buffer.writeUInt16LE(0, 12); // file last modification date
    }

    buffer.writeUInt32LE(uncompressedCrc32 ?? 0, 14);
    if ((compressedSize ?? 0) >= 0xff_ff_ff_ff || (uncompressedSize ?? 0) >= 0xff_ff_ff_ff) {
      buffer.writeUInt32LE(0xff_ff_ff_ff, 18);
      buffer.writeUInt32LE(0xff_ff_ff_ff, 22);
    } else {
      buffer.writeUInt32LE(compressedSize ?? 0, 18);
      buffer.writeUInt32LE(uncompressedSize ?? 0, 22);
    }
    buffer.writeUint16LE(encodedFilename.length, 26); // file name length
    buffer.writeUint16LE(0, 28); // extra field length
    encodedFilename.copy(buffer, TZWriter.LOCAL_FILE_HEADER_MIN_LENGTH);
    return buffer;
  }

  private zip64LocalFileHeader(
    filename: string,
    localFileHeaderRelativeOffset: number,
    uncompressedCrc32?: number,
    compressedSize?: number,
    uncompressedSize?: number,
  ): Buffer<ArrayBuffer> {
    const localFileHeader = this.localFileHeader(
      filename,
      uncompressedCrc32,
      compressedSize,
      uncompressedSize,
    );

    const extraFieldLength = 20 + (localFileHeaderRelativeOffset >= 0xff_ff_ff_ff ? 8 : 0);

    const buffer = Buffer.alloc(localFileHeader.length + extraFieldLength);
    localFileHeader.copy(buffer, 0);
    if (buffer.readUInt16LE(4) < 45) {
      buffer.writeUInt16LE(45, 4); // version needed (for zip64)
    }
    buffer.writeUint16LE(extraFieldLength, 28); // extra field length

    // Write extra field
    buffer.writeUInt16LE(0x00_01, localFileHeader.length);
    buffer.writeUInt16LE(extraFieldLength - 4, localFileHeader.length + 2);
    buffer.writeBigUInt64LE(BigInt(uncompressedSize ?? 0), localFileHeader.length + 4);
    buffer.writeBigUInt64LE(BigInt(compressedSize ?? 0), localFileHeader.length + 12);
    if (localFileHeaderRelativeOffset >= 0xff_ff_ff_ff) {
      buffer.writeBigUInt64LE(BigInt(localFileHeaderRelativeOffset), localFileHeader.length + 20);
    }

    return buffer;
  }

  /**
   * Write the central directory and close the file.
   */
  async finalize(): Promise<void> {
    try {
      const centralDirectoryFileHeaders = this.localFileHeaders.map((lfh) =>
        TZWriter.centralDirectoryFileHeader(lfh),
      );
      const startOfCentralDirectoryOffset = this.filePosition;
      const centralDirectoryFileHeadersConcat = Buffer.concat(centralDirectoryFileHeaders);
      await this.fileHandle.write(
        centralDirectoryFileHeadersConcat,
        undefined,
        undefined,
        this.filePosition,
      );
      this.filePosition += centralDirectoryFileHeadersConcat.length;

      // Determine if a zip64 EOCD needs to be written
      const zip64 =
        centralDirectoryFileHeadersConcat.length >= 0xff_ff_ff_ff ||
        startOfCentralDirectoryOffset >= 0xff_ff_ff_ff ||
        this.localFileHeaders.length >= 0xff_ff;
      if (zip64) {
        const zip64EndOfCentralDirectoryOffset = this.filePosition;
        const zip64EndOfCentralDirectoryRecord = TZWriter.zip64EndOfCentralDirectoryRecord(
          centralDirectoryFileHeaders,
          startOfCentralDirectoryOffset,
        );
        const zip64EndOfCentralDirectoryLocator = TZWriter.zip64EndOfCentralDirectoryLocator(
          zip64EndOfCentralDirectoryOffset,
        );
        await this.fileHandle.write(
          Buffer.concat([zip64EndOfCentralDirectoryRecord, zip64EndOfCentralDirectoryLocator]),
          undefined,
          undefined,
          this.filePosition,
        );
        this.filePosition +=
          zip64EndOfCentralDirectoryRecord.length + zip64EndOfCentralDirectoryLocator.length;
      }

      const eocd = this.endOfCentralDirectoryHeader(
        centralDirectoryFileHeaders,
        startOfCentralDirectoryOffset,
      );
      await this.fileHandle.write(eocd, undefined, undefined, this.filePosition);
      this.filePosition += eocd.length;
    } finally {
      await this.close();
    }
  }

  /**
   * Close the file handle.
   */
  async close(): Promise<void> {
    await this.fileHandle.close();
  }

  private static centralDirectoryFileHeader(localFileHeader: LocalFileHeader): Buffer<ArrayBuffer> {
    const fileNameLength = localFileHeader.rawBytes.readUInt16LE(26);
    const extraFieldLength =
      localFileHeader.uncompressedSize >= 0xff_ff_ff_ff ||
      localFileHeader.compressedSize >= 0xff_ff_ff_ff ||
      localFileHeader.position >= 0xff_ff_ff_ff
        ? 4 +
          (localFileHeader.uncompressedSize >= 0xff_ff_ff_ff ? 8 : 0) +
          (localFileHeader.compressedSize >= 0xff_ff_ff_ff ? 8 : 0) +
          (localFileHeader.position >= 0xff_ff_ff_ff ? 8 : 0)
        : 0;
    const buffer = Buffer.allocUnsafe(
      this.CENTRAL_DIRECTORY_FILE_HEADER_MIN_LENGTH + fileNameLength + extraFieldLength,
    );

    this.CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE.copy(buffer);
    buffer.writeUInt16LE(0, 4); // version made by
    localFileHeader.rawBytes.copy(buffer, 6, 4, 4 + 2); // version needed to extract
    localFileHeader.rawBytes.copy(buffer, 8, 6, 6 + 2); // general purpose flag
    localFileHeader.rawBytes.copy(buffer, 10, 8, 8 + 2); // compression method
    localFileHeader.rawBytes.copy(buffer, 12, 10, 10 + 2); // file last modification time
    localFileHeader.rawBytes.copy(buffer, 14, 12, 12 + 2); // file last modification date
    buffer.writeUInt32LE(localFileHeader.uncompressedCrc32, 16); // uncompressed CRC32
    buffer.writeUInt32LE(Math.min(localFileHeader.compressedSize, 0xff_ff_ff_ff), 20); // compressed size
    buffer.writeUInt32LE(Math.min(localFileHeader.uncompressedSize, 0xff_ff_ff_ff), 24); // uncompressed size
    localFileHeader.rawBytes.copy(buffer, 28, 26, 26 + 2); // file name length
    buffer.writeUInt16LE(extraFieldLength, 30); // extra field length
    buffer.writeUInt16LE(0, 32); // file comment length
    buffer.writeUInt16LE(0, 34); // disk number where file starts
    buffer.writeUInt16LE(0, 36); // internal file attributes
    buffer.writeUInt32LE(0, 38); // external file attributes
    buffer.writeUInt32LE(Math.min(localFileHeader.position, 0xff_ff_ff_ff), 42);
    localFileHeader.rawBytes.copy(buffer, 46, 30, 30 + fileNameLength); // file name

    // Write extra field
    if (extraFieldLength > 0) {
      buffer.writeUInt16LE(0x00_01, 46 + fileNameLength);
      buffer.writeUInt16LE(extraFieldLength - 4, 46 + fileNameLength + 2);
      let extraFieldPosition = 46 + fileNameLength + 4;
      if (localFileHeader.uncompressedSize >= 0xff_ff_ff_ff) {
        buffer.writeBigUInt64LE(BigInt(localFileHeader.uncompressedSize), extraFieldPosition);
        extraFieldPosition += 8;
      }
      if (localFileHeader.compressedSize >= 0xff_ff_ff_ff) {
        buffer.writeBigUInt64LE(BigInt(localFileHeader.compressedSize), extraFieldPosition);
        extraFieldPosition += 8;
      }
      if (localFileHeader.position >= 0xff_ff_ff_ff) {
        buffer.writeBigUInt64LE(BigInt(localFileHeader.position), extraFieldPosition);
      }
    }

    return buffer;
  }

  private static zip64EndOfCentralDirectoryRecord(
    centralDirectoryFileHeaders: Buffer<ArrayBuffer>[],
    startOfCentralDirectoryOffset: number,
  ): Buffer<ArrayBuffer> {
    const buffer = Buffer.allocUnsafe(this.ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_LENGTH);
    this.ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE.copy(buffer);
    buffer.writeBigUInt64LE(BigInt(buffer.length - 12), 4); // size of the zip64 EOCD minus 12
    buffer.writeUInt16LE(45, 12); // version made by
    buffer.writeUInt16LE(45, 14); // version needed to extract
    buffer.writeUInt32LE(0, 16); // number of this disk
    buffer.writeUInt32LE(0, 20); // number of the disk with the SOCD
    buffer.writeBigUInt64LE(BigInt(centralDirectoryFileHeaders.length), 24); // number of central directory records on this disk
    buffer.writeBigUInt64LE(BigInt(centralDirectoryFileHeaders.length), 32); // number of central directory records total
    buffer.writeBigUInt64LE(
      BigInt(centralDirectoryFileHeaders.reduce((sum, cdfh) => sum + cdfh.length, 0)),
      40,
    ); // size of the central directory
    buffer.writeBigUInt64LE(BigInt(startOfCentralDirectoryOffset), 48);
    // Note: no comment
    return buffer;
  }

  private static zip64EndOfCentralDirectoryLocator(
    zip64EndOfCentralDirectoryOffset: number,
  ): Buffer<ArrayBuffer> {
    const buffer = Buffer.allocUnsafe(this.ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_LENGTH);
    this.ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNATURE.copy(buffer);
    buffer.writeUInt32LE(0, 4); // number of the disk with the zip64 EOCD
    buffer.writeBigUInt64LE(BigInt(zip64EndOfCentralDirectoryOffset), 8); // relative offset of the zip64 EOCD
    buffer.writeUInt32LE(1, 16); // total number of disks
    return buffer;
  }

  private endOfCentralDirectoryHeader(
    centralDirectoryFileHeaders: Buffer<ArrayBuffer>[],
    startOfCentralDirectoryOffset: number,
  ): Buffer<ArrayBuffer> {
    const commentLength = this.compressionMethod === CompressionMethod.DEFLATE ? 22 : 15;
    const buffer = Buffer.allocUnsafe(
      TZWriter.END_OF_CENTRAL_DIRECTORY_HEADER_MIN_LENGTH + commentLength,
    );
    TZWriter.END_OF_CENTRAL_DIRECTORY_HEADER_SIGNATURE.copy(buffer);
    buffer.writeUInt16LE(0, 4); // number of this disk
    buffer.writeUInt16LE(0, 6); // number of the disk with the SOCD
    buffer.writeUInt16LE(Math.min(centralDirectoryFileHeaders.length, 0xff_ff), 8); // total number of entries in this disk's CD
    buffer.writeUInt16LE(Math.min(centralDirectoryFileHeaders.length, 0xff_ff), 10); // total number of entries in the CD
    buffer.writeUInt32LE(
      Math.min(
        centralDirectoryFileHeaders.reduce((sum, cdfh) => sum + cdfh.length, 0),
        0xff_ff_ff_ff,
      ),
      12,
    ); // length of the CD
    buffer.writeUInt32LE(Math.min(startOfCentralDirectoryOffset, 0xff_ff_ff_ff), 16);

    const cdfhCrc32 = crc32(Buffer.concat(centralDirectoryFileHeaders))
      .toString(16)
      .padStart(8, '0')
      .toUpperCase();
    let comment: string;
    if (this.compressionMethod === CompressionMethod.DEFLATE) {
      comment = `TORRENTZIPPED-${cdfhCrc32}`;
    } else {
      comment = `RVZSTD-${cdfhCrc32}`;
    }
    buffer.writeUInt32LE(comment.length, 20);
    buffer.write(comment, 22);

    return buffer;
  }
}
