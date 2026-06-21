import type { ValidationResultValue } from '../../packages/torrentzip/index.js';
import type FileCache from '../cache/fileCache.js';
import type Logger from '../console/logger.js';
import { LogLevel } from '../console/logLevel.js';
import MultiBar from '../console/multiBar.js';
import IgirException from '../exceptions/igirException.js';
import type Archive from '../models/files/archives/archive.js';
import type ArchiveEntry from '../models/files/archives/archiveEntry.js';
import ArchiveFile from '../models/files/archives/archiveFile.js';
import Chd from '../models/files/archives/chd/chd.js';
import ChdBinCue from '../models/files/archives/chd/chdBinCue.js';
import ChdGdi from '../models/files/archives/chd/chdGdi.js';
import ChdRaw from '../models/files/archives/chd/chdRaw.js';
import Gcz from '../models/files/archives/dolphin/gcz.js';
import Rvz from '../models/files/archives/dolphin/rvz.js';
import Wia from '../models/files/archives/dolphin/wia.js';
import Gzip from '../models/files/archives/gzip.js';
import Cso from '../models/files/archives/maxcso/cso.js';
import Dax from '../models/files/archives/maxcso/dax.js';
import Zso from '../models/files/archives/maxcso/zso.js';
import NkitIso from '../models/files/archives/nkitIso.js';
import Rar from '../models/files/archives/rar.js';
import SevenZip from '../models/files/archives/sevenZip/sevenZip.js';
import Z from '../models/files/archives/sevenZip/z.js';
import ZipSpanned from '../models/files/archives/sevenZip/zipSpanned.js';
import ZipX from '../models/files/archives/sevenZip/zipX.js';
import Tar from '../models/files/archives/tar.js';
import Zip from '../models/files/archives/zip.js';
import File from '../models/files/file.js';
import { ChecksumBitmask } from '../models/files/fileChecksums.js';
import type FileSignature from '../models/files/fileSignature.js';
import type ROMHeader from '../models/files/romHeader.js';
import type ROMPadding from '../models/files/romPadding.js';
import type { FsReadCallback } from '../streams/fsReadTransform.js';
import URLUtil from '../utils/urlUtil.js';

export const CacheMode = {
  RESPECT_CACHED_VALUE: 1,
  IGNORE_CACHED_VALUE: 2,
};
export type CacheModeKey = keyof typeof CacheMode;
export type CacheModeValue = (typeof CacheMode)[CacheModeKey];

/**
 * Factory that produces {@link File} and {@link ArchiveEntry} objects from filesystem paths.
 */
export default class FileFactory {
  private readonly fileCache: FileCache;
  private readonly logger: Logger;

  constructor(fileCache: FileCache, logger: Logger) {
    this.fileCache = fileCache;
    this.logger = logger;
  }

  /**
   * Return every {@link File} represented by a path, expanding archives into their entries when
   * the path is (or appears to be) an archive, and falling back to a single non-archive file
   * otherwise.
   */
  async filesFrom(
    filePath: string,
    fileChecksumBitmask: number = ChecksumBitmask.CRC32,
    entryChecksumBitmask = fileChecksumBitmask,
    callback?: FsReadCallback,
  ): Promise<File[]> {
    if (URLUtil.canParse(filePath)) {
      return [await File.fileOf({ filePath })];
    }

    if (!FileFactory.isExtensionArchive(filePath)) {
      const entries = await this.entriesFromArchiveSignature(
        filePath,
        entryChecksumBitmask,
        callback,
      );
      if (entries !== undefined) {
        return entries;
      }
      return [await this.fileFrom(filePath, fileChecksumBitmask, callback)];
    }

    try {
      const archives = this.archiveFromArchiveExtension(filePath);
      if (archives.length === 0) {
        // The file isn't actually an archive
        return [await this.fileFrom(filePath, fileChecksumBitmask, callback)];
      }
      const entries: ArchiveEntry<Archive>[] = [];
      let anyParsed = false;
      for (const archive of archives) {
        const result = await this.entriesFromArchive(
          archive,
          entryChecksumBitmask,
          CacheMode.RESPECT_CACHED_VALUE,
          callback,
        );
        if (result !== undefined) {
          anyParsed = true;
          for (const entry of result) {
            entries.push(entry);
          }
        }
      }
      if (!anyParsed) {
        // The file isn't actually an archive
        return [await this.fileFrom(filePath, fileChecksumBitmask)];
      }
      return entries;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new IgirException(`file doesn't exist: ${filePath}`);
      }
      if (typeof error === 'string') {
        throw new Error(error);
      }
      throw error;
    }
  }

  /**
   * Return a single {@link File} for a path, with its checksums computed per the given bitmask.
   */
  async fileFrom(
    filePath: string,
    checksumBitmask: number,
    callback?: FsReadCallback,
    cacheModeValue: CacheModeValue = CacheMode.RESPECT_CACHED_VALUE,
  ): Promise<File> {
    return await this.fileCache.getOrComputeFileChecksums(
      filePath,
      checksumBitmask,
      callback,
      cacheModeValue === CacheMode.IGNORE_CACHED_VALUE,
    );
  }

  /**
   * Wrap an {@link ArchiveEntry} into an {@link ArchiveFile} backed by the underlying archive
   * file with its checksums computed per the given bitmask.
   */
  async archiveFileFrom(
    archiveEntry: ArchiveEntry<Archive>,
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveFile> {
    return new ArchiveFile(
      archiveEntry,
      await this.fileFrom(archiveEntry.getFilePath(), checksumBitmask, callback),
    );
  }

  /**
   * Assuming we've already checked if the file path has a valid archive extension, assume that
   * archive extension is accurate and parse the archive.
   *
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  async entriesFromArchive<A extends Archive>(
    archive: A,
    checksumBitmask: number,
    cacheModeValue: CacheModeValue = CacheMode.RESPECT_CACHED_VALUE,
    callback?: FsReadCallback,
    forceChecksumCalculation = false,
  ): Promise<ArchiveEntry<A>[] | undefined> {
    try {
      return await this.fileCache.getOrComputeArchiveChecksums(
        archive,
        checksumBitmask,
        cacheModeValue === CacheMode.IGNORE_CACHED_VALUE,
        callback,
        forceChecksumCalculation,
      );
    } catch (error) {
      // The file at the given path may not be of the type asserted by the given extension, or it
      // may be an incomplete/corrupted file
      MultiBar.log(
        LogLevel.WARN,
        `${archive.getFilePath()}: failed to parse ${archive.getExtension()} file: ${error}`,
      );
      return undefined;
    }
  }

  private archiveFromArchiveExtension(
    filePath: string,
    fileExt = filePath.replace(/.+?(?=(\.[a-zA-Z0-9]+)+)/, ''),
  ): Archive[] {
    if (Zip.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Zip(filePath)];
    } else if (Tar.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Tar(filePath)];
    } else if (Rar.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Rar(filePath)];
    } else if (Gzip.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Gzip(filePath)];
    } else if (SevenZip.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new SevenZip(filePath)];
    } else if (Z.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Z(filePath)];
    } else if (ZipSpanned.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new ZipSpanned(filePath)];
    } else if (ZipX.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new ZipX(filePath)];
    } else if (Cso.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Cso(filePath)];
    } else if (Dax.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Dax(filePath)];
    } else if (Zso.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Zso(filePath)];
    } else if (Gcz.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Gcz(filePath)];
    } else if (Rvz.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Rvz(filePath)];
    } else if (Wia.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new Wia(filePath)];
    } else if (Chd.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      // Unfortunately, some CHDs such as GD-ROMs can be extracted to different formats (bin/cue,
      // gdi/bin/raw, etc.), so we may need to scan the file a few different ways
      return [new ChdBinCue(filePath), new ChdGdi(filePath), new ChdRaw(filePath)];
    } else if (NkitIso.getExtensions().some((ext) => fileExt.toLowerCase().endsWith(ext))) {
      return [new NkitIso(filePath)];
    }

    // The file path doesn't have a known archive extension
    return [];
  }

  /**
   * Without knowing if the file is an archive or not, read its file signature, and if there is a
   * match then parse the archive.
   *
   * This ordering should match {@link ROMScanner#archiveEntryPriority}
   */
  private async entriesFromArchiveSignature(
    filePath: string,
    checksumBitmask: number,
    callback?: FsReadCallback,
  ): Promise<ArchiveEntry<Archive>[] | undefined> {
    let signature: FileSignature | undefined;
    try {
      const file = await this.fileFrom(filePath, checksumBitmask, callback);
      signature = await this.fileCache.getOrComputeFileSignature(file);
    } catch {
      // Fail silently on assumed I/O errors
      return undefined;
    }

    if (!signature) {
      return undefined;
    }
    // Note that the signature might not be of an archive

    const archives = this.archiveFromArchiveExtension(filePath, signature.getExtension());
    if (archives.length === 0) {
      // The file isn't actually an archive
      return undefined;
    }
    const entries: ArchiveEntry<Archive>[] = [];
    let anyParsed = false;
    for (const archive of archives) {
      const result = await this.entriesFromArchive(
        archive,
        checksumBitmask,
        CacheMode.RESPECT_CACHED_VALUE,
        callback,
      );
      if (result !== undefined) {
        anyParsed = true;
        for (const entry of result) {
          entries.push(entry);
        }
      }
    }
    if (!anyParsed) {
      // The file isn't actually an archive
      return undefined;
    }
    return entries;
  }

  /**
   * Return true if the given file path ends with an extension recognized as a supported
   * archive format.
   */
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
      // Compressed images
      ...Cso.getExtensions(),
      ...Dax.getExtensions(),
      ...Zso.getExtensions(),
      ...Gcz.getExtensions(),
      ...Rvz.getExtensions(),
      ...Wia.getExtensions(),
      ...Chd.getExtensions(),
      ...NkitIso.getExtensions(),
    ].some((ext) => filePath.toLowerCase().endsWith(ext));
  }

  /**
   * Return the {@link ROMHeader} for a file if its contents match a known ROM header signature,
   * or undefined otherwise.
   */
  async headerFrom(file: File): Promise<ROMHeader | undefined> {
    return await this.fileCache.getOrComputeFileHeader(file);
  }

  /**
   * Return the {@link FileSignature} detected from the file's contents, or undefined if no
   * known signature matches.
   */
  async signatureFrom(file: File, callback?: FsReadCallback): Promise<FileSignature | undefined> {
    return await this.fileCache.getOrComputeFileSignature(file, callback);
  }

  /**
   * Return the set of {@link ROMPadding} entries describing trailing fill-byte padding that
   * could be stripped from the file to recover an unpadded ROM.
   */
  async paddingsFrom(file: File, callback?: FsReadCallback): Promise<ROMPadding[]> {
    return await this.fileCache.getOrComputeFilePaddings(file, callback);
  }

  /**
   * Return the TorrentZip validation result for a zip file, indicating whether its structure
   * conforms to the TorrentZip specification.
   */
  async tzValidationFrom(
    zip: Zip,
    cacheModeValue: CacheModeValue = CacheMode.RESPECT_CACHED_VALUE,
  ): Promise<ValidationResultValue> {
    return await this.fileCache.getOrComputeTzValidation(
      zip,
      cacheModeValue === CacheMode.IGNORE_CACHED_VALUE,
    );
  }
}
