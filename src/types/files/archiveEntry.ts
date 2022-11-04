import path from 'path';
import { Readable } from 'stream';

import Constants from '../../constants.js';
import fsPoly from '../../polyfill/fsPoly.js';
import Archive from '../archives/archive.js';
import Patch from '../patches/patch.js';
import File from './file.js';
import FileHeader from './fileHeader.js';

export default class ArchiveEntry<A extends Archive> extends File {
  private readonly archive: A;

  private readonly entryPath: string;

  protected constructor(
    /** {@link File} */
    filePath: string,
    size: number,
    crc: string,
    crc32WithoutHeader: string,
    fileHeader: FileHeader | undefined,
    patch: Patch | undefined,
    /** {@link ArchiveEntry} */
    archive: A,
    entryPath: string,
  ) {
    super(
      filePath,
      size,
      crc,
      crc32WithoutHeader,
      fileHeader,
      patch,
    );
    this.archive = archive;
    this.entryPath = path.normalize(entryPath);
  }

  static async entryOf<A extends Archive>(
    archive: A,
    entryPath: string,
    size: number,
    crc: string,
    fileHeader?: FileHeader,
    patch?: Patch,
  ): Promise<ArchiveEntry<A>> {
    let finalCrcWithoutHeader = crc;
    if (fileHeader) {
      finalCrcWithoutHeader = await this.extractEntryToFile(
        archive,
        entryPath,
        async (localFile) => this.calculateCrc32(localFile, fileHeader),
      );
    }

    return new ArchiveEntry<A>(
      archive.getFilePath(),
      size,
      crc,
      finalCrcWithoutHeader,
      fileHeader,
      patch,
      archive,
      entryPath,
    );
  }

  getArchive(): A {
    return this.archive;
  }

  getExtractedFilePath(): string {
    return this.entryPath;
  }

  getEntryPath(): string {
    return this.entryPath;
  }

  async extractToFile<T>(callback: (localFile: string) => (T | Promise<T>)): Promise<T> {
    return ArchiveEntry.extractEntryToFile(this.getArchive(), this.getEntryPath(), callback);
  }

  async extractToTempFile<T>(
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    return ArchiveEntry.extractEntryToFile(this.getArchive(), this.getEntryPath(), callback);
  }

  private static async extractEntryToFile<T>(
    archive: Archive,
    entryPath: string,
    callback: (localFile: string) => (T | Promise<T>),
  ): Promise<T> {
    const tempDir = fsPoly.mkdtempSync(path.join(Constants.GLOBAL_TEMP_DIR, 'extract-file'));
    try {
      console.log(`extracting: ${archive.getFilePath()} | ${entryPath} -> ${tempDir}`);
      return await archive.extractEntryToFile(entryPath, tempDir, callback);
    } finally {
      console.log(`deleting extraction dir: ${tempDir}`);
      await fsPoly.rm(tempDir, { recursive: true });
    }
  }

  async extractToStream<T>(
    callback: (stream: Readable) => (T | Promise<T>),
    removeHeader = false,
  ): Promise<T> {
    const start = removeHeader && this.getFileHeader()
      ? this.getFileHeader()?.dataOffsetBytes || 0
      : 0;

    // Apply the patch if there is one
    if (this.getPatch()) {
      const patch = this.getPatch() as Patch;
      return patch.apply(this, async (tempFile) => File
        .createStreamFromFile(tempFile, start, callback));
    }

    // Don't extract to memory if this archive entry size is too large, or if we need to manipulate
    // the stream start point
    if (this.getSize() > Constants.MAX_STREAM_EXTRACTION_SIZE || start > 0) {
      return this.extractToFile(async (localFile) => File
        .createStreamFromFile(localFile, start, callback));
    }

    const tempDir = fsPoly.mkdtempSync(path.join(Constants.GLOBAL_TEMP_DIR, 'extract-stream'));
    try {
      return await this.archive.extractEntryToStream(this.getEntryPath(), tempDir, callback);
    } finally {
      await fsPoly.rm(tempDir, { recursive: true });
    }
  }

  async withFileName(fileNameWithoutExt: string): Promise<File> {
    return ArchiveEntry.entryOf(
      this.getArchive().withFileName(fileNameWithoutExt),
      this.getEntryPath(),
      this.getSize(),
      this.getCrc32(),
      this.getFileHeader(),
      this.getPatch(),
    );
  }

  async withExtractedFilePath(extractedNameWithoutExt: string): Promise<File> {
    const { base, ...parsedEntryPath } = path.parse(this.getEntryPath());
    parsedEntryPath.name = extractedNameWithoutExt;
    const entryPath = path.format(parsedEntryPath);

    return ArchiveEntry.entryOf(
      this.getArchive(),
      entryPath,
      this.getSize(),
      this.getCrc32(),
      this.getFileHeader(),
      this.getPatch(),
    );
  }

  async withFileHeader(fileHeader: FileHeader): Promise<File> {
    // Make sure the file actually has the header magic string
    const hasHeader = await this.extractToStream(
      async (stream) => fileHeader.fileHasHeader(stream),
    );
    if (!hasHeader) {
      return this;
    }

    return ArchiveEntry.entryOf(
      this.getArchive(),
      this.getEntryPath(),
      this.getSize(),
      this.getCrc32(),
      fileHeader,
      undefined, // don't allow a patch
    );
  }

  async withPatch(patch: Patch): Promise<File> {
    if (patch.getCrcBefore() !== this.getCrc32()) {
      return this;
    }

    return ArchiveEntry.entryOf(
      this.getArchive(),
      this.getEntryPath(),
      this.getSize(),
      this.getCrc32(),
      undefined, // don't allow a file header
      patch,
    );
  }

  toString(): string {
    return `${this.getFilePath()}|${this.entryPath}`;
  }

  equals(other: File): boolean {
    if (this === other) {
      return true;
    }
    if (!(other instanceof ArchiveEntry)) {
      return false;
    }
    if (!super.equals(other)) {
      return false;
    }
    return this.getEntryPath() === other.getEntryPath();
  }
}
