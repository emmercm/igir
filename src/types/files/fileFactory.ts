import fs from 'node:fs';
import path from 'node:path';

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
      return await this.entriesFromArchiveExtension(filePath, checksumBitmask);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`file doesn't exist: ${filePath}`);
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
    return FileCache.getOrComputeFile(filePath, checksumBitmask);
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
  ): Promise<ArchiveEntry<Archive>[]> {
    let archive: Archive;
    if (Zip.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Zip(filePath);
    } else if (Tar.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Tar(filePath);
    } else if (Rar.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Rar(filePath);
    } else if (Gzip.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Gzip(filePath);
    } else if (SevenZip.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new SevenZip(filePath);
    } else if (Z.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new Z(filePath);
    } else if (ZipSpanned.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new ZipSpanned(filePath);
    } else if (ZipX.getExtensions().some((ext) => filePath.toLowerCase().endsWith(ext))) {
      archive = new ZipX(filePath);
    } else {
      throw new Error(`unknown archive type: ${path.extname(filePath)}`);
    }

    return FileCache.getOrComputeEntries(archive, checksumBitmask);
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
    const maxSignatureLengthBytes = [
      ...Zip.getFileSignatures(),
      ...Tar.getFileSignatures(),
      ...Rar.getFileSignatures(),
      // 7zip
      ...Gzip.getFileSignatures(),
      ...SevenZip.getFileSignatures(),
      ...Z.getFileSignatures(),
      ...ZipSpanned.getFileSignatures(),
      ...ZipX.getFileSignatures(),
    ].reduce((max, signature) => Math.max(max, signature.length), 0);

    let fileSignature: Buffer;
    try {
      const stream = fs.createReadStream(filePath, { end: maxSignatureLengthBytes });
      fileSignature = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
      stream.destroy();
    } catch {
      // Fail silently on assumed I/O errors
      return undefined;
    }

    let archive: Archive;
    if (Zip.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Zip(filePath);
    } else if (Tar.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Tar(filePath);
    } else if (Rar.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Rar(filePath);
    } else if (Gzip.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Gzip(filePath);
    } else if (SevenZip.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new SevenZip(filePath);
    } else if (Z.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Z(filePath);
    } else if (ZipSpanned.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new ZipSpanned(filePath);
    } else if (ZipX.getFileSignatures()
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new ZipX(filePath);
    } else {
      return undefined;
    }

    return FileCache.getOrComputeEntries(archive, checksumBitmask);
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
