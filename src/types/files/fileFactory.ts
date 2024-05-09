import fs from 'node:fs';
import path from 'node:path';

import Archive from './archives/archive.js';
import ArchiveEntry from './archives/archiveEntry.js';
import Rar from './archives/rar.js';
import SevenZip from './archives/sevenZip.js';
import Tar from './archives/tar.js';
import Zip from './archives/zip.js';
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
    if (Zip.SUPPORTED_FILES
      .flatMap(([exts]) => exts)
      .some((ext) => filePath.toLowerCase().endsWith(ext))
    ) {
      archive = new Zip(filePath);
    } else if (Tar.SUPPORTED_FILES
      .flatMap(([exts]) => exts)
      .some((ext) => filePath.toLowerCase().endsWith(ext))
    ) {
      archive = new Tar(filePath);
    } else if (Rar.SUPPORTED_FILES
      .flatMap(([exts]) => exts)
      .some((ext) => filePath.toLowerCase().endsWith(ext))
    ) {
      archive = new Rar(filePath);
    } else if (SevenZip.SUPPORTED_FILES
      .flatMap(([exts]) => exts)
      .some((ext) => filePath.toLowerCase().endsWith(ext))
    ) {
      archive = new SevenZip(filePath);
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
      ...Zip.SUPPORTED_FILES.flatMap(([, signatures]) => signatures),
      ...Tar.SUPPORTED_FILES.flatMap(([, signatures]) => signatures),
      ...Rar.SUPPORTED_FILES.flatMap(([, signatures]) => signatures),
      ...SevenZip.SUPPORTED_FILES.flatMap(([, signatures]) => signatures),
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
    if (Zip.SUPPORTED_FILES
      .flatMap(([, signatures]) => signatures)
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Zip(filePath);
    } else if (Tar.SUPPORTED_FILES
      .flatMap(([, signatures]) => signatures)
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Tar(filePath);
    } else if (Rar.SUPPORTED_FILES
      .flatMap(([, signatures]) => signatures)
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new Rar(filePath);
    } else if (SevenZip.SUPPORTED_FILES
      .flatMap(([, signatures]) => signatures)
      .some((sig) => fileSignature.subarray(0, sig.length).equals(sig))
    ) {
      archive = new SevenZip(filePath);
    } else {
      return undefined;
    }

    return FileCache.getOrComputeEntries(archive, checksumBitmask);
  }

  static isExtensionArchive(filePath: string): boolean {
    return [
      ...Zip.SUPPORTED_FILES.flatMap(([exts]) => exts),
      ...Tar.SUPPORTED_FILES.flatMap(([exts]) => exts),
      ...Rar.SUPPORTED_FILES.flatMap(([exts]) => exts),
      ...SevenZip.SUPPORTED_FILES.flatMap(([exts]) => exts),
    ].some((ext) => filePath.toLowerCase().endsWith(ext));
  }
}
