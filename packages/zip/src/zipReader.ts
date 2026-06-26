import fs from 'node:fs';

import ArchiveExtraDataRecord from './archiveExtraDataRecord.js';
import CentralDirectoryFileHeader from './centralDirectoryFileHeader.js';
import DataDescriptor from './dataDescriptor.js';
import EndOfCentralDirectory from './endOfCentralDirectory.js';
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
export default class ZipReader {
  private readonly zipFilePath: string;

  private _centralDirectoryFileHeaders?: CentralDirectoryFileHeader[];
  private _endOfCentralDirectoryRecord?: EndOfCentralDirectory;

  constructor(zipFilePath: string) {
    this.zipFilePath = zipFilePath;
  }

  /**
   * Return all central directory file headers.
   */
  async centralDirectoryFileHeaders(): Promise<CentralDirectoryFileHeader[]> {
    if (this._centralDirectoryFileHeaders !== undefined) {
      return this._centralDirectoryFileHeaders;
    }

    const fileHandle = await fs.promises.open(this.zipFilePath, 'r');
    try {
      const eocd = await this.endOfCentralDirectoryRecordFromFileHandle(fileHandle);
      this._centralDirectoryFileHeaders =
        await CentralDirectoryFileHeader.centralDirectoryFileFromFileHandle(
          this.zipFilePath,
          fileHandle,
          eocd,
        );
      return this._centralDirectoryFileHeaders;
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Return the archive extra data record that may appear between the last local file's data and the
   * start of the central directory, or undefined when there isn't one.
   */
  async archiveExtraDataRecord(): Promise<ArchiveExtraDataRecord | undefined> {
    const fileHandle = await fs.promises.open(this.zipFilePath, 'r');
    try {
      const endOfLocalFiles = await this.endOfLocalFiles(fileHandle);
      return await ArchiveExtraDataRecord.fromFileHandle(fileHandle, endOfLocalFiles);
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * Return the byte position immediately after the last local file's data and optional data
   * descriptor.
   */
  private async endOfLocalFiles(fileHandle: fs.promises.FileHandle): Promise<number> {
    const centralDirectoryFileHeaders = await this.centralDirectoryFileHeaders();
    if (centralDirectoryFileHeaders.length === 0) {
      return 0;
    }

    // The entry with the highest local file header offset is physically last, so its data end
    // (plus any data descriptor) marks the end of the local files region. Only this one entry's
    // local file header needs to be read.
    const lastCentralDirectoryFileHeader = centralDirectoryFileHeaders.reduce((last, current) =>
      current.localFileHeaderRelativeOffsetResolved() > last.localFileHeaderRelativeOffsetResolved()
        ? current
        : last,
    );

    const localFileHeader = await LocalFileHeader.localFileHeaderFromFileHandle(
      lastCentralDirectoryFileHeader,
      fileHandle,
    );
    const dataEnd =
      localFileHeader.getLocalFileDataRelativeOffset() + localFileHeader.compressedSizeResolved();
    if (!localFileHeader.hasDataDescriptor()) {
      return dataEnd;
    }

    const dataDescriptor = await DataDescriptor.fromFileHandle(
      fileHandle,
      dataEnd,
      localFileHeader.versionNeeded >= 45,
    );
    return dataEnd + dataDescriptor.raw.length;
  }

  private async assertValidMagicNumber(fileHandle: fs.promises.FileHandle): Promise<void> {
    const magicNumber = await this.readMagicNumber(fileHandle);
    if (
      // At least one file in the zip
      !magicNumber.equals(LocalFileHeader.LOCAL_FILE_HEADER_SIGNATURE) &&
      // No files in the zip
      !magicNumber.equals(EndOfCentralDirectory.END_OF_CENTRAL_DIRECTORY_RECORD_SIGNATURE) &&
      // The zip is spanned, and this ISN'T the first file
      !magicNumber.equals(DataDescriptor.DATA_DESCRIPTOR_SIGNATURE)
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
  async endOfCentralDirectoryRecord(): Promise<EndOfCentralDirectory> {
    if (this._endOfCentralDirectoryRecord !== undefined) {
      return this._endOfCentralDirectoryRecord;
    }

    const fileHandle = await fs.promises.open(this.zipFilePath, 'r');
    try {
      return await this.endOfCentralDirectoryRecordFromFileHandle(fileHandle);
    } finally {
      await fileHandle.close();
    }
  }

  private async endOfCentralDirectoryRecordFromFileHandle(
    fileHandle: fs.promises.FileHandle,
  ): Promise<EndOfCentralDirectory> {
    if (this._endOfCentralDirectoryRecord !== undefined) {
      return this._endOfCentralDirectoryRecord;
    }

    await this.assertValidMagicNumber(fileHandle);
    this._endOfCentralDirectoryRecord = await EndOfCentralDirectory.fromFileHandle(fileHandle);
    return this._endOfCentralDirectoryRecord;
  }
}
