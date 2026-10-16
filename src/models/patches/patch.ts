import path from 'node:path';
import zlib from 'node:zlib';

import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import type IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';

/**
 * Base class for a ROM patch, carrying the patch file plus the pre/post checksums and size
 * that identify the source and result ROMs.
 */
export default abstract class Patch {
  // Enough bytes, at 7 bits each, for any UPS-style unsigned integer up to Number.MAX_SAFE_INTEGER
  private static readonly UPS_UINT_READ_AHEAD_SIZE = 8;

  private readonly file: File;

  private readonly crcBefore: string;

  private readonly crcAfter?: string;

  private readonly sizeAfter?: number;

  protected constructor(file: File, crcBefore: string, crcAfter?: string, sizeAfter?: number) {
    this.file = file;
    this.crcBefore = crcBefore.toLowerCase().padStart(8, '0');
    this.crcAfter = crcAfter?.toLowerCase().padStart(8, '0');
    this.sizeAfter = sizeAfter;
  }

  protected static getCrcFromPath(fileBasename: string): string {
    const matches = /(^|[^a-z0-9])(0x)?([a-f0-9]{8})([^a-z0-9]|$)/i.exec(fileBasename);
    if (matches && matches.length >= 3) {
      return matches[3].toLowerCase();
    }

    throw new IgirException(`couldn't parse base file CRC for patch: ${fileBasename}`);
  }

  getFile(): File {
    return this.file;
  }

  getCrcBefore(): string {
    return this.crcBefore;
  }

  getCrcAfter(): string | undefined {
    return this.crcAfter;
  }

  getSizeAfter(): number | undefined {
    return this.sizeAfter;
  }

  getRomName(): string {
    return path
      .parse(this.getFile().getExtractedFilePath())
      .name.replaceAll(new RegExp(this.getCrcBefore(), 'gi'), '')
      .replaceAll(/  +/g, ' ')
      .trim();
  }

  /**
   * Return a human-readable identifier for the patch.
   */
  toString(): string {
    return `${this.getFile().toString()} (${this.crcBefore} → ${this.crcAfter ?? '????????'}${this.sizeAfter !== undefined && this.sizeAfter > 0 ? `, ${FsUtil.sizeReadable(this.sizeAfter)}` : ''})`;
  }

  /**
   * A string hash code to uniquely identify this {@link Patch}.
   */
  hashCode(): string {
    return [
      this.constructor.name,
      this.getFile().hashCode(),
      this.crcBefore,
      this.crcAfter,
      this.sizeAfter,
    ].join('|');
  }

  abstract createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void>;

  /**
   * Read a BSDiff-style 64-bit little-endian sign-magnitude integer from a buffer at the given
   * offset, where the most significant bit is the sign and the remaining 63 bits are the
   * magnitude.
   */
  protected static readBsdiffInt(buffer: Buffer, offset: number): number {
    const magnitude =
      buffer.readUInt32LE(offset) + (buffer.readUInt32LE(offset + 4) & 0x7f_ff_ff_ff) * 2 ** 32;
    return buffer.readUInt8(offset + 7) & 0x80 ? -magnitude : magnitude;
  }

  /**
   * Calculate the CRC32 of the region [{@link start}, {@link end}) of a file, a chunk at a time.
   */
  protected static async crc32Range(ioFile: IOFile, start: number, end: number): Promise<string> {
    let crc = 0;
    let position = start;
    while (position < end) {
      const chunkSize = Math.min(end - position, Defaults.FILE_READING_CHUNK_SIZE);
      const chunk = await ioFile.readAt(position, chunkSize);
      crc = zlib.crc32(chunk, crc);
      position += chunkSize;
    }
    return (crc >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Read a UPS-style variable-length unsigned integer from the given file, advancing the read
   * position past the encoded value.
   */
  protected static async readUpsUint(
    ioFile: Pick<IOFile, 'peekNext' | 'skipNext'>,
  ): Promise<number> {
    let data = 0;
    let shift = 1;

    // Read ahead rather than byte-by-byte, encoded values are usually only a few bytes
    let bytes = await ioFile.peekNext(this.UPS_UINT_READ_AHEAD_SIZE);
    while (bytes.length > 0) {
      for (const [i, byte] of bytes.entries()) {
        data += (byte & 0x7f) * shift; // drop the left-most bit
        if (byte & 0x80) {
          // left-most bit is telling us this is the end
          ioFile.skipNext(i + 1);
          return data;
        }
        // Multiply rather than shift, as bitwise operators only work on 32-bit integers
        shift *= 128;
        data += shift;
      }
      ioFile.skipNext(bytes.length);
      bytes = await ioFile.peekNext(this.UPS_UINT_READ_AHEAD_SIZE);
    }

    return data;
  }
}
