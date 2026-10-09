import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

type PMSRReader = Pick<IOFile, 'getPosition' | 'getSize' | 'readNext'>;

/**
 * Reads forward through an {@link IOFile} from a position, a chunk at a time.
 */
class IOFileCursor {
  private readonly file: IOFile;
  private readonly eofException: () => IgirException;

  private position: number;
  private chunk: Buffer = Buffer.alloc(0);
  private chunkOffset = 0;

  constructor(file: IOFile, position: number, eofException: () => IgirException) {
    this.file = file;
    this.position = position;
    this.eofException = eofException;
  }

  /**
   * Read the next byte, throwing if the file ends first.
   */
  async readUInt8(): Promise<number> {
    if (this.chunkOffset >= this.chunk.length) {
      this.chunk = await this.file.readAt(this.position, Defaults.FILE_READING_CHUNK_SIZE);
      if (this.chunk.length === 0) {
        throw this.eofException();
      }
      this.position += this.chunk.length;
      this.chunkOffset = 0;
    }

    const value = this.chunk.readUInt8(this.chunkOffset);
    this.chunkOffset += 1;
    return value;
  }

  /**
   * Read the next big-endian 16-bit integer, throwing if the file ends first.
   */
  async readUInt16BE(): Promise<number> {
    return ((await this.readUInt8()) << 8) | (await this.readUInt8());
  }
}

/**
 * Reads the decompressed bytes of a Yay0-compressed file, without decompressing all of it at
 * once.
 * @see https://github.com/z64a/star-rod-classic/blob/463becb8bb15fe11da50405188edff3379997ebf/src/main/java/game/yay0/Yay0Helper.java
 */
class Yay0Reader implements PMSRReader {
  private static readonly HEADER_SIZE = 16;
  // Links can copy from at most 0x1000 bytes back
  private static readonly WINDOW_SIZE = 0x10_00;

  static readonly FILE_SIGNATURE = Buffer.from('Yay0');

  private readonly decompressedSize: number;
  private readonly commands: IOFileCursor;
  private readonly links: IOFileCursor;
  private readonly literals: IOFileCursor;
  private readonly invalidException: () => IgirException;
  private readonly window = Buffer.alloc(Yay0Reader.WINDOW_SIZE);

  private position = 0;
  private command = 0;
  private commandMask = 0;
  private copyDistance = 0;
  private copyRemaining = 0;

  private constructor(
    patchFile: IOFile,
    decompressedSize: number,
    linkOffset: number,
    literalOffset: number,
    invalidException: () => IgirException,
  ) {
    this.decompressedSize = decompressedSize;
    this.commands = new IOFileCursor(patchFile, Yay0Reader.HEADER_SIZE, invalidException);
    this.links = new IOFileCursor(patchFile, linkOffset, invalidException);
    this.literals = new IOFileCursor(patchFile, literalOffset, invalidException);
    this.invalidException = invalidException;
  }

  /**
   * Parse the Yay0 header of {@link patchFile} and return a {@link Yay0Reader} for it.
   */
  static async readerFrom(
    patchFile: IOFile,
    invalidException: () => IgirException,
  ): Promise<Yay0Reader> {
    const header = await patchFile.readAt(0, this.HEADER_SIZE);
    if (header.length < this.HEADER_SIZE) {
      throw invalidException();
    }
    return new Yay0Reader(
      patchFile,
      header.readUInt32BE(4),
      header.readUInt32BE(8),
      header.readUInt32BE(12),
      invalidException,
    );
  }

  getPosition(): number {
    return this.position;
  }

  getSize(): number {
    return this.decompressedSize;
  }

  /**
   * Read the next {@link size} decompressed bytes, or fewer if the decompressed data ends first.
   */
  async readNext(size: number): Promise<Buffer> {
    const result = Buffer.allocUnsafe(Math.min(size, this.decompressedSize - this.position));

    for (let resultOffset = 0; resultOffset < result.length; resultOffset += 1) {
      let value: number;
      if (this.copyRemaining === 0 && (await this.nextCommandIsLiteral())) {
        value = await this.literals.readUInt8();
      } else {
        if (this.copyRemaining === 0) {
          await this.startCopy();
        }
        value = this.window.readUInt8((this.position - this.copyDistance) % Yay0Reader.WINDOW_SIZE);
        this.copyRemaining -= 1;
      }

      result.writeUInt8(value, resultOffset);
      this.window.writeUInt8(value, this.position % Yay0Reader.WINDOW_SIZE);
      this.position += 1;
    }

    return result;
  }

  private async nextCommandIsLiteral(): Promise<boolean> {
    if (this.commandMask === 0) {
      this.command = await this.commands.readUInt8();
      this.commandMask = 0x80;
    }

    const isLiteral = (this.command & this.commandMask) !== 0;
    this.commandMask >>= 1;
    return isLiteral;
  }

  /**
   * Start copying a run of previously decompressed bytes.
   */
  private async startCopy(): Promise<void> {
    const link = await this.links.readUInt16BE();
    const distance = (link & 0x0f_ff) + 1;
    let length = link >> 12;
    if (length === 0) {
      length = (await this.literals.readUInt8()) + 0x10;
    }
    length += 2;

    if (distance > this.position || this.position + length > this.decompressedSize) {
      throw this.invalidException();
    }
    this.copyDistance = distance;
    this.copyRemaining = length;
  }
}

/**
 * Paper Mario Star Rod (PMSR) mod packages, which always patch Paper Mario (USA) v1.0.
 * @see https://github.com/z64a/star-rod-classic
 */
export default class PMSRPatch extends Patch {
  private static readonly HEADER_SIZE = 8;
  private static readonly RECORD_HEADER_SIZE = 8;
  private static readonly SOURCE_CRC32 = 'a7f5cd7e';
  private static readonly SOURCE_SIZE = 41_943_040;

  static readonly SUPPORTED_EXTENSIONS = ['.mod'];
  static readonly FILE_SIGNATURE = Buffer.from('PMSR');

  /**
   * Parse a .mod patch file and return a {@link PMSRPatch}.
   */
  static patchFrom(file: File): PMSRPatch {
    return new PMSRPatch(file, this.SOURCE_CRC32);
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    if (inputRomFile.getSize() !== PMSRPatch.SOURCE_SIZE) {
      throw new IgirException(
        `PMSR patch expected ROM size of ${FsUtil.sizeReadable(PMSRPatch.SOURCE_SIZE)}: ${this.getFile().toString()}`,
      );
    }

    await this.getFile().extractToIOFile(async (patchFile) => {
      const reader = await this.readerFrom(patchFile);

      const header = await reader.readNext(PMSRPatch.HEADER_SIZE);
      if (
        header.length < PMSRPatch.HEADER_SIZE ||
        !header.subarray(0, PMSRPatch.FILE_SIGNATURE.length).equals(PMSRPatch.FILE_SIGNATURE)
      ) {
        throw new IgirException(`PMSR patch header is invalid: ${this.getFile().toString()}`);
      }
      const recordCount = header.readUInt32BE(4);

      await inputRomFile.extractToFile(outputRomPath);
      const targetFile = await IOFile.fileFrom(outputRomPath, 'r+');
      try {
        await this.applyRecords(reader, recordCount, targetFile, callback);
      } finally {
        await targetFile.close();
      }
    });
  }

  private async readerFrom(patchFile: IOFile): Promise<PMSRReader> {
    // Star Rod can wrap the PMSR data in Yay0 compression
    const signature = await patchFile.peekNext(Yay0Reader.FILE_SIGNATURE.length);
    if (!signature.equals(Yay0Reader.FILE_SIGNATURE)) {
      return patchFile;
    }
    return await Yay0Reader.readerFrom(
      patchFile,
      () =>
        new IgirException(`PMSR patch Yay0 compression is invalid: ${this.getFile().toString()}`),
    );
  }

  private async applyRecords(
    reader: PMSRReader,
    recordCount: number,
    targetFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    for (let i = 0; i < recordCount; i += 1) {
      const recordHeader = await reader.readNext(PMSRPatch.RECORD_HEADER_SIZE);
      if (recordHeader.length < PMSRPatch.RECORD_HEADER_SIZE) {
        throw this.truncatedException();
      }
      const offset = recordHeader.readUInt32BE(0);
      const length = recordHeader.readUInt32BE(4);

      // Records can be large, so copy them a chunk at a time
      let written = 0;
      while (written < length) {
        const chunkSize = Math.min(length - written, Defaults.FILE_READING_CHUNK_SIZE);
        const data = await reader.readNext(chunkSize);
        if (data.length < chunkSize) {
          throw this.truncatedException();
        }
        await targetFile.writeAt(data, offset + written);
        written += chunkSize;
      }

      if (callback !== undefined) {
        callback(Math.floor((reader.getPosition() / reader.getSize()) * targetFile.getSize()));
      }
    }
  }

  private truncatedException(): IgirException {
    return new IgirException(`PMSR patch is truncated: ${this.getFile().toString()}`);
  }
}
