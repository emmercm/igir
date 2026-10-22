import fs from 'node:fs';
import stream from 'node:stream';
import zlib from 'node:zlib';

import * as tar from 'tar';

import { logger } from '../../../console/logger.js';
import IgirException from '../../../exceptions/igirException.js';
import type { FsReadCallback } from '../../../streams/fsReadTransform.js';
import FsUtil from '../../../utils/fsUtil.js';
import StreamUtil from '../../../utils/streamUtil.js';
import FileChecksums, { ChecksumBitmask, type ChecksumProps } from '../fileChecksums.js';
import type { ArchiveEntryRef } from './archive.js';
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

  getExtensions(): string[] {
    return Gzip.getExtensions();
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
    // See if this file is actually a .tar.gz. Only try when it starts with a tar header: the tar
    // parser buffers a plain gzipped file, which takes hours on a disc-sized image.
    if (await this.isTar()) {
      try {
        return await new Tar(this.getFilePath()).getArchiveEntries(checksumBitmask, callback);
      } catch {
        // ignored
      }
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
      checksums = await this.extractEntryToStream(
        { entryPath: '', size: gzipHeaderTrailer.size },
        async (readable) => {
          return await FileChecksums.hashStream(readable, checksumBitmask, callback);
        },
      );
    } else if (callback) {
      // The trailer's CRC32 is used, so there's nothing to read
      callback(gzipHeaderTrailer.size);
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

  /**
   * Whether the decompressed stream starts with a tar header, judged by the header's checksum,
   * which every tar format (v7, ustar, GNU, pax) carries.
   */
  private async isTar(): Promise<boolean> {
    try {
      const header = await this.readEntryFirstBytes({ entryPath: '' }, 512);
      return header.length === 512 && new tar.Header(header).cksumValid;
    } catch {
      return false;
    }
  }

  private async getHeaderTrailerInfo(): Promise<GzipHeaderTrailer> {
    const fileHandle = await fs.promises.open(this.getFilePath(), 'r');
    try {
      const header = await Gzip.readAt(fileHandle, 0, 10);
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
          offset += 2 + (await Gzip.readAt(fileHandle, offset, 2)).readUInt16LE();
        }
        // Parse FNAME header
        let chunk = await Gzip.readAt(fileHandle, offset, 256);
        while (chunk.length > 0) {
          const nullByteIdx = chunk.indexOf(0x00);
          if (nullByteIdx !== -1) {
            fname += chunk.subarray(0, nullByteIdx).toString('latin1');
            break;
          }
          fname += chunk.toString('latin1');
          offset += chunk.length;
          chunk = await Gzip.readAt(fileHandle, offset, 256);
        }
      }

      const { size: fileSize } = await fileHandle.stat();
      const trailer = await Gzip.readAt(fileHandle, fileSize - 8, 8);
      const crc32 = trailer.readUInt32LE().toString(16).toLowerCase().padStart(8, '0');
      const size = trailer.readUInt32LE(4);

      return { fname, crc32, size };
    } finally {
      await fileHandle.close();
    }
  }

  /**
   * @returns up to {@link size} bytes starting at {@link position}, fewer at the end of the file
   */
  private static async readAt(
    fileHandle: fs.promises.FileHandle,
    position: number,
    size: number,
  ): Promise<Buffer> {
    const buffer = Buffer.allocUnsafe(size);
    const { bytesRead } = await fileHandle.read(buffer, 0, size, position);
    return buffer.subarray(0, bytesRead);
  }

  /**
   * Decompress the gzip file to the given path.
   */
  async extractEntryToFile(entryRef: ArchiveEntryRef, extractedFilePath: string): Promise<void> {
    const { readChunkSize, gunzipChunkSize } = await this.getChunkSizes(entryRef);
    await stream.promises.pipeline(
      fs.createReadStream(this.getFilePath(), { highWaterMark: readChunkSize }),
      zlib.createGunzip({ chunkSize: gunzipChunkSize }),
      fs.createWriteStream(extractedFilePath),
    );
  }

  /**
   * Decompress the gzip file and invoke the callback with a readable stream of the decompressed
   * bytes.
   */
  protected override async streamEntry<T>(
    entryRef: ArchiveEntryRef,
    callback: (source: stream.Readable) => Promise<T>,
    byteCount?: number,
  ): Promise<T> {
    const { readChunkSize, gunzipChunkSize } = await this.getChunkSizes(entryRef, byteCount);
    return await StreamUtil.pipelineSafe(
      fs.createReadStream(this.getFilePath(), { highWaterMark: readChunkSize }),
      zlib.createGunzip({ chunkSize: gunzipChunkSize }),
      callback,
    );
  }

  /**
   * Pick the chunk sizes to read and decompress the entry with, or only its leading
   * {@link byteCount} bytes, so that neither allocates more memory than necessary.
   * @returns the read stream's and the gunzip stream's chunk sizes, in bytes
   */
  private async getChunkSizes(
    entryRef: ArchiveEntryRef,
    byteCount?: number,
  ): Promise<{ readChunkSize: number; gunzipChunkSize: number }> {
    const compressedSize = await FsUtil.size(this.getFilePath());
    // The trailer only holds the last member's size, modulo 4GiB, so it can understate the
    // uncompressed size. Compression rarely makes data larger, so the compressed size is a safe
    // lower bound.
    const uncompressedSize =
      entryRef.size === undefined ? undefined : Math.max(entryRef.size, compressedSize);
    return {
      readChunkSize: Gzip.getStreamChunkSize(compressedSize, byteCount),
      // One byte more than the output, so zlib doesn't allocate a second buffer just to finish,
      // and no less than zlib allows
      gunzipChunkSize: Math.max(
        zlib.constants.Z_MIN_CHUNK,
        Gzip.getStreamChunkSize(
          uncompressedSize === undefined ? undefined : uncompressedSize + 1,
          byteCount,
        ),
      ),
    };
  }
}
