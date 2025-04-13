import fs from 'node:fs';
import stream from 'node:stream';
import * as zlib from 'node:zlib';

import zstd from 'zstd-napi';

import CentralDirectoryFile from './centralDirectoryFile.js';
import EndOfCentralDirectoryRecord from './endOfCentralDirectoryRecord.js';
import { CompressionMethod, CompressionMethodInverted } from './fileRecord.js';
import LocalFileRecord from './localFileRecord.js';

/**
 * Why did I make the terrible choice of writing my own zip decompression library? Because neither
 * `unzipper` nor `yauzl` can handle Zstandard as of writing, and neither provide a way to access
 * the compressed stream.
 * @see https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * @see https://en.wikipedia.org/wiki/ZIP_(file_format)
 * @see https://libzip.org/specifications/appnote_iz.txt
 * @see https://romvault.com/trrntzip_explained.pdf
 */
export default class BananaSplit {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async entries(): Promise<CentralDirectoryFile[]> {
    const fileHandle = await fs.promises.open(this.filePath, 'r');
    try {
      await this.assertValidMagicNumber(fileHandle);

      const eocd = await EndOfCentralDirectoryRecord.fromFileHandle(fileHandle);
      if (eocd.diskNumber !== 0 || eocd.centralDirectoryDiskStart !== 0) {
        throw new Error(`multi-disk zips aren't supported`);
      }

      return await CentralDirectoryFile.centralDirectoryFileFromFileHandle(
        fileHandle,
        eocd.centralDirectoryOffset,
      );
    } finally {
      await fileHandle.close();
    }
  }

  private async assertValidMagicNumber(fileHandle: fs.promises.FileHandle): Promise<void> {
    const magicNumber = await this.readMagicNumber(fileHandle);
    if (
      !new Set([
        // At least one file in the zip
        LocalFileRecord.LOCAL_FILE_HEADER_SIGNATURE.toString('hex'),
        // No files in the zip
        EndOfCentralDirectoryRecord.CENTRAL_DIRECTORY_END_SIGNATURE.toString('hex'),
        // The zip is spanned
        LocalFileRecord.DATA_DESCRIPTOR_SIGNATURE.toString('hex'),
      ]).has(magicNumber.toString('hex'))
    ) {
      throw new Error(`unknown zip file magic number: ${magicNumber.toString('hex')}`);
    }
  }

  private async readMagicNumber(fileHandle: fs.promises.FileHandle): Promise<Buffer<ArrayBuffer>> {
    const buffer = Buffer.allocUnsafe(4);
    await fileHandle.read({ buffer, position: 0 });
    return buffer;
  }

  /**
   * WARN: It's the caller's responsibility to close the stream!
   */
  async compressedStream(centralDirectoryFile: CentralDirectoryFile): Promise<stream.Readable> {
    if (centralDirectoryFile.compressedSize === 0 && centralDirectoryFile.uncompressedSize === 0) {
      // There's no need to open the file, it will be an empty stream
      return stream.Readable.from([]);
    }

    const fileHandle = await fs.promises.open(this.filePath, 'r');
    let localFileRecord: LocalFileRecord;
    try {
      localFileRecord = await LocalFileRecord.localFileRecordFromFileHandle(
        fileHandle,
        centralDirectoryFile.localFileHeaderRelativeOffset,
      );
    } finally {
      await fileHandle.close();
    }

    return fs.createReadStream(this.filePath, {
      // TODO(cemmer): providing `fd` doesn't seem to work right
      start: localFileRecord.localFileDataRelativeOffset,
      end: localFileRecord.localFileDataRelativeOffset + centralDirectoryFile.compressedSize - 1,
    });
  }

  /**
   * WARN: It's the caller's responsibility to close the stream!
   */
  async uncompressedStream(centralDirectoryFile: CentralDirectoryFile): Promise<stream.Readable> {
    switch (centralDirectoryFile.compressionMethod) {
      case CompressionMethod.STORE: {
        return this.compressedStream(centralDirectoryFile);
      }
      case CompressionMethod.DEFLATE: {
        const inflater = zlib.createInflateRaw();
        const compressedStream = (await this.compressedStream(centralDirectoryFile)).on(
          'error',
          (err: Error) => inflater.emit('error', err),
        );
        return compressedStream.pipe(inflater);
      }
      case CompressionMethod.ZSTD_DEPRECATED:
      case CompressionMethod.ZSTD: {
        const decompressor = new zstd.DecompressStream();
        const compressedStream = (await this.compressedStream(centralDirectoryFile)).on(
          'error',
          (err: Error) => decompressor.emit('error', err),
        );
        return compressedStream.pipe(decompressor);
      }
      default: {
        throw new Error(
          `unsupported compression method: ${CompressionMethodInverted[centralDirectoryFile.compressionMethod]}`,
        );
      }
    }
  }
}
