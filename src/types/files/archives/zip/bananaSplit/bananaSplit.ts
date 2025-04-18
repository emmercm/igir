import fs from 'node:fs';

import CentralDirectoryFileHeader from './centralDirectoryFileHeader.js';
import EndOfCentralDirectoryRecord from './endOfCentralDirectoryRecord.js';
import LocalFileHeader from './localFileHeader.js';

/**
 * Why did I make the terrible choice of writing my own zip decompression library? Because neither
 * `unzipper` nor `yauzl` can handle Zstandard as of writing, and neither provide a way to access
 * the compressed stream.
 * @see https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * @see https://en.wikipedia.org/wiki/ZIP_(file_format)
 * @see https://libzip.org/specifications/appnote_iz.txt
 * @see https://libzip.org/specifications/extrafld.txt
 * @see https://romvault.com/trrntzip_explained.pdf
 */
export default class BananaSplit {
  private readonly zipFilePath: string;

  private _endOfCentralDirectoryRecord?: EndOfCentralDirectoryRecord;

  constructor(filePath: string) {
    this.zipFilePath = filePath;
  }

  /**
   * Return all central directory file headers.
   */
  async centralDirectoryFileHeaders(): Promise<CentralDirectoryFileHeader[]> {
    const fileHandle = await fs.promises.open(this.zipFilePath, 'r');
    try {
      const eocd = await this.endOfCentralDirectoryRecordFromFileHandle(fileHandle);
      return await CentralDirectoryFileHeader.centralDirectoryFileFromFileHandle(
        this.zipFilePath,
        fileHandle,
        eocd,
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
        LocalFileHeader.LOCAL_FILE_HEADER_SIGNATURE.toString('hex'),
        // No files in the zip
        EndOfCentralDirectoryRecord.CENTRAL_DIRECTORY_END_SIGNATURE.toString('hex'),
        // The zip is spanned, and this ISN'T the first file
        LocalFileHeader.DATA_DESCRIPTOR_SIGNATURE.toString('hex'),
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
   * Return the end of central directory record.
   */
  async endOfCentralDirectoryRecord(): Promise<EndOfCentralDirectoryRecord> {
    const fileHandle = await fs.promises.open(this.zipFilePath, 'r');
    try {
      return await this.endOfCentralDirectoryRecordFromFileHandle(fileHandle);
    } finally {
      await fileHandle.close();
    }
  }

  private async endOfCentralDirectoryRecordFromFileHandle(
    fileHandle: fs.promises.FileHandle,
  ): Promise<EndOfCentralDirectoryRecord> {
    if (this._endOfCentralDirectoryRecord !== undefined) {
      return this._endOfCentralDirectoryRecord;
    }

    await this.assertValidMagicNumber(fileHandle);
    this._endOfCentralDirectoryRecord =
      await EndOfCentralDirectoryRecord.fromFileHandle(fileHandle);
    return this._endOfCentralDirectoryRecord;
  }
}
