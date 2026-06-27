import fs from 'node:fs';
import stream from 'node:stream';
import zlib from 'node:zlib';

import { logger } from '../../../console/logger.js';
import IgirException from '../../../exceptions/igirException.js';
import IOFile from '../../../models/files/ioFile.js';
import type { FsReadCallback } from '../../../streams/fsReadTransform.js';
import FileChecksums, { ChecksumBitmask, type ChecksumProps } from '../fileChecksums.js';
import Archive from './archive.js';
import ArchiveEntry from './archiveEntry.js';
import Tar from './tar.js';

interface GzipHeaderTrailer {
  fname?: string;
  crc32: string;
  size: number;
}

/**
 * A gzip-compressed file (or tarball), exposed as an archive with a single entry.
 */
export default class Gzip extends Archive {
  /**
   * Construct a new {@link Gzip} archive for the given file path.
   */
  protected new(filePath: string): Gzip {
    return new Gzip(filePath);
  }

  static getExtensions(): string[] {
    return ['.gz', '.gzip'];
  }

  getExtension(): string {
    return Gzip.getExtensions()[0];
  }

  /**
   * Returns true: gzip files support extraction.
   */
  canExtract(): boolean {
    return true;
  }

  /**
   * Returns true: gzip files carry an FNAME field for the original filename.
   */
  hasMeaningfulEntryPaths(): boolean {
    return true;
  }

  async getArchiveEntries(
    checksumBitmask: number,
    callback?: FsReadCallback,
    shouldForceChecksumCalculation = false,
  ): Promise<ArchiveEntry<Archive>[]> {
    // See if this file is actually a .tar.gz
    try {
      return await new Tar(this.getFilePath()).getArchiveEntries(checksumBitmask, callback);
    } catch {
      /* ignored */
    }

    const gzipHeaderTrailer = await this.getHeaderTrailerInfo();
    if (callback) {
      callback(0, gzipHeaderTrailer.size);
    }

    // Calculate checksums from the file's bytes if needed
    let checksums: ChecksumProps = {};
    if (
      checksumBitmask & ~ChecksumBitmask.CRC32 ||
      (shouldForceChecksumCalculation && checksumBitmask & ChecksumBitmask.CRC32)
    ) {
      checksums = await this.extractEntryToStream('', async (readable) => {
        return await FileChecksums.hashStream(readable, checksumBitmask, callback);
      });
    }
    const { crc32, ...checksumsWithoutCrc } = checksums;

    if (crc32 !== undefined && crc32 !== gzipHeaderTrailer.crc32) {
      logger.warn(
        `${this.getFilePath()}: gzip is invalid, the trailer has the CRC32 ${gzipHeaderTrailer.crc32} but it should be ${crc32}`,
      );
    }

    return [
      await ArchiveEntry.entryOf(
        {
          archive: this,
          entryPath: gzipHeaderTrailer.fname ?? '', // let CandidateExtensionCorrector sort it out
          size: gzipHeaderTrailer.size,
          crc32: crc32 ?? gzipHeaderTrailer.crc32,
          ...checksumsWithoutCrc,
        },
        checksumBitmask,
      ),
    ];
  }

  private async getHeaderTrailerInfo(): Promise<GzipHeaderTrailer> {
    const file = await IOFile.fileFrom(this.getFilePath(), 'r');
    try {
      const header = await file.readAt(0, 10);
      if (header[0] !== 0x1f || header[1] !== 0x8b) {
        // Not a valid gzip file
        throw new IgirException('missing gzip magic number');
      }
      const flags = header[3];

      let fname = '';
      if (flags & 0x08) {
        let offset = 10;
        if (flags & 0x04) {
          // Skip FEXTRA field
          offset += 2 + (await file.readAt(offset, 2)).readUInt16LE();
        }
        // Parse FNAME header
        while (!file.isEOF()) {
          fname += (await file.readAt(offset, 256)).toString('latin1');
          const nullByteIdx = fname.indexOf('\0');
          if (nullByteIdx !== -1) {
            fname = fname.slice(0, nullByteIdx);
            break;
          }
        }
      }

      const trailer = await file.readAt(file.getSize() - 8, 8);
      const crc32 = trailer.readUInt32LE().toString(16).toLowerCase();
      const size = trailer.readUInt32LE(4);

      return { fname, crc32, size };
    } finally {
      await file.close();
    }
  }

  /**
   * Decompress the gzip file to the given path.
   */
  async extractEntryToFile(_entryPath: string, extractedFilePath: string): Promise<void> {
    await stream.promises.pipeline(
      fs.createReadStream(this.getFilePath()),
      zlib.createGunzip(),
      fs.createWriteStream(extractedFilePath),
    );
  }

  /**
   * Decompress the gzip file and invoke the callback with a readable stream of the decompressed
   * bytes.
   */
  override async extractEntryToStream<T>(
    _entryPath: string,
    callback: (readable: stream.Readable) => Promise<T> | T,
  ): Promise<T> {
    const source = fs.createReadStream(this.getFilePath());
    const gunzip = zlib.createGunzip();
    const pipelinePromise = stream.promises.pipeline(source, gunzip);

    try {
      const result = await callback(gunzip);

      gunzip.destroy();
      source.destroy();
      try {
        await pipelinePromise;
      } catch (error) {
        // The .destroy() calls above can cause ABORT_ERR on Node.js <24.15, or
        // ERR_STREAM_PREMATURE_CLOSE on Node.js >=24.15
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ABORT_ERR' && code !== 'ERR_STREAM_PREMATURE_CLOSE') {
          throw error;
        }
      }

      return result;
    } catch (error) {
      gunzip.destroy();
      source.destroy();
      try {
        await pipelinePromise;
      } catch {
        /* ignored */
      }
      throw error;
    }
  }
}
