import ExpectedError from '../expectedError.js';
import Archive from './archives/archive.js';
import ArchiveEntry from './archives/archiveEntry.js';
import ArchiveFile from './archives/archiveFile.js';
import Gzip from './archives/gzip.js';
import Rar from './archives/rar.js';
import SevenZip from './archives/sevenZip.js';
import Tar from './archives/tar.js';
import Z from './archives/z.js';
import Zip from './archives/zip.js';
import ZipSpanned from './archives/zipSpanned.js';
import ZipX from './archives/zipX.js';
import File from './file.js';
import FileCache from './fileCache.js';
import { ChecksumBitmask } from './fileChecksums.js';
import FileSignature from './fileSignature.js';

export default class FileFactory {
  static async filesFrom(
    filePath: string,
    checksumBitmask: number = ChecksumBitmask.CRC32,
  ): Promise<File[]> {
    if (!this.isExtensionArchive(filePath)) {
      const entries = await this.entriesFromArchiveSignature(filePath, checksumBitmask);
      if (entries !== undefined) {
        return entries;
      }
      return [await this.fileFrom(filePath, checksumBitmask)];
    }

    try {
      const entries = await this.entriesFromArchiveExtension(filePath, checksumBitmask);
      if (entries !== undefined) {
        return entries;
      }
      return [await this.fileFrom(filePath, checksumBitmask)];
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new ExpectedError(`file doesn't exist: ${filePath}`);
      }
      if (typeof error === 'string') {
        throw new Error(error);
      }
      throw error;
    }
  }

  public static async fileFrom(
    filePath: string,
    checksumBitmask: number,
  ): Promise<File> {
    return FileCache.getOrComputeFileChecksums(filePath, checksumBitmask);
  }

  public static async archiveFileFrom(
    archive: Archive,
    checksumBitmask: number,
  ): Promise<ArchiveFile> {
    return new ArchiveFile(
      archive,
      await this.fileFrom(archive.getFilePath(), checksumBitmask),
    );
  }

  /**
   * Assuming we've already checked if the file path has a valid archive extension, assume that
   * archive extension is accurate and parse the archive.
   *
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  private static async entriesFromArchiveExtension(
    filePath: string,
    checksumBitmask: number,
    fileExt = filePath.replace(/.+?(?=(\.[a-zA-Z0-9]+)+)/, ''),
  ): Promise<ArchiveEntry<Archive>[] | undefined> {
    let archive: Archive;
    if (Zip.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new Zip(filePath);
    } else if (Tar.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new Tar(filePath);
    } else if (Rar.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new Rar(filePath);
    } else if (Gzip.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new Gzip(filePath);
    } else if (SevenZip.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new SevenZip(filePath);
    } else if (Z.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new Z(filePath);
    } else if (ZipSpanned.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new ZipSpanned(filePath);
    } else if (ZipX.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      archive = new ZipX(filePath);
    } else {
      return undefined;
    }

    return FileCache.getOrComputeArchiveChecksums(archive, checksumBitmask);
  }

  /**
   * Without knowing if the file is an archive or not, read its file signature, and if there is a
   * match then parse the archive.
   *
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  private static async entriesFromArchiveSignature(
    filePath: string,
    checksumBitmask: number,
  ): Promise<ArchiveEntry<Archive>[] | undefined> {
    let signature: FileSignature | undefined;
    try {
      const file = await File.fileOf({ filePath });
      signature = await file.createReadStream(
        async (stream) => FileSignature.signatureFromFileStream(stream),
      );
    } catch {
      // Fail silently on assumed I/O errors
      return undefined;
    }
    if (!signature) {
      return undefined;
    }

    return this.entriesFromArchiveExtension(
      filePath,
      checksumBitmask,
      signature.getExtension(),
    );
  }

  static isExtensionArchive(filePath: string): boolean {
    return [
      ...Zip.getExtensions(),
      ...Tar.getExtensions(),
      ...Rar.getExtensions(),
      // 7zip
      ...Gzip.getExtensions(),
      ...SevenZip.getExtensions(),
      ...Z.getExtensions(),
      ...ZipSpanned.getExtensions(),
      ...ZipX.getExtensions(),
    ].some((ext) => filePath.toLowerCase().endsWith(ext));
  }
}
