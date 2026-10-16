import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import FsUtil from '../../utils/fsUtil.js';
import type File from '../files/file.js';
import Patch from './patch.js';

type PMSRReader = Pick<IOFile, 'getPosition' | 'getSize' | 'readNext'>;

/**
 * Reads forward through a part of a Yay0-compressed file.
 */
class Yay0Cursor {
  private readonly ioFile: IOFile;
  private position: number;

  constructor(ioFile: IOFile, position: number) {
    this.ioFile = ioFile;
    this.position = position;
  }

  /**
   * Read the next {@link size} bytes, or fewer if the file ends first.
   * @returns the bytes read
   */
  async read(size: number): Promise<Buffer> {
    const data = await this.ioFile.readAt(this.position, size);
    this.position += data.length;
    return data;
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
  private static readonly LINK_SIZE = 2;

  static readonly FILE_SIGNATURE = Buffer.from('Yay0');

  private readonly decompressedSize: number;
  private readonly commands: Yay0Cursor;
  private readonly links: Yay0Cursor;
  private readonly literals: Yay0Cursor;
  private readonly invalidException: () => IgirException;
  // Links can't reach back before the first byte, so only bytes already written are ever copied
  private readonly window = Buffer.allocUnsafe(Yay0Reader.WINDOW_SIZE);

  private position = 0;
  private copyDistance = 0;
  private copyRemaining = 0;

  // The current command byte, which has a bit per token: 1 for a literal byte, 0 for a link
  private command = 0;
  private commandMask = 0;
  // The current command byte's links and literal-stream bytes, read all at once
  private commandLinks: Buffer = Buffer.alloc(0);
  private commandLinksOffset = 0;
  private commandLiterals: Buffer = Buffer.alloc(0);
  private commandLiteralsOffset = 0;

  private constructor(
    patchIOFile: IOFile,
    decompressedSize: number,
    linkOffset: number,
    literalOffset: number,
    invalidException: () => IgirException,
  ) {
    this.decompressedSize = decompressedSize;
    this.commands = new Yay0Cursor(patchIOFile, Yay0Reader.HEADER_SIZE);
    this.links = new Yay0Cursor(patchIOFile, linkOffset);
    this.literals = new Yay0Cursor(patchIOFile, literalOffset);
    this.invalidException = invalidException;
  }

  /**
   * Parse the Yay0 header of {@link patchIOFile} and return a {@link Yay0Reader} for it.
   */
  static async readerFrom(
    patchIOFile: IOFile,
    invalidException: () => IgirException,
  ): Promise<Yay0Reader> {
    const header = await patchIOFile.readAt(0, this.HEADER_SIZE);
    if (header.length < this.HEADER_SIZE) {
      throw invalidException();
    }
    return new Yay0Reader(
      patchIOFile,
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

    let resultOffset = 0;
    while (resultOffset < result.length) {
      if (this.copyRemaining === 0) {
        if (this.commandMask === 0) {
          await this.readCommand();
        }
        if ((this.command & this.commandMask) === 0) {
          this.commandMask >>= 1;
          this.startCopy();
        } else {
          resultOffset += this.copyLiterals(result, resultOffset);
          continue;
        }
      }

      // Copy no further than the window wraps, and no further than the copy's distance, as a copy
      // longer than its distance repeats the bytes it has just written
      const copyStart = (this.position - this.copyDistance) % Yay0Reader.WINDOW_SIZE;
      const copySize = Math.min(
        this.copyRemaining,
        result.length - resultOffset,
        this.copyDistance,
        Yay0Reader.WINDOW_SIZE - copyStart,
      );
      this.window.copy(result, resultOffset, copyStart, copyStart + copySize);
      this.recordOutput(result, resultOffset, copySize);
      this.copyRemaining -= copySize;
      resultOffset += copySize;
    }

    return result;
  }

  /**
   * Read the next command byte, along with all of its links and literal-stream bytes. Tokens past
   * the end of the decompressed data are padding, so their links and literal-stream bytes can be
   * missing, and they're only found to be missing if they're used.
   */
  private async readCommand(): Promise<void> {
    const command = await this.commands.read(1);
    if (command.length === 0) {
      throw this.invalidException();
    }
    this.command = command.readUInt8();
    this.commandMask = 0x80;

    let literalCount = 0;
    for (let mask = 0x80; mask > 0; mask >>= 1) {
      if (this.command & mask) {
        literalCount += 1;
      }
    }
    this.commandLinks = await this.links.read((8 - literalCount) * Yay0Reader.LINK_SIZE);
    this.commandLinksOffset = 0;

    // A link with a length of 0 takes its length from the literal stream
    let longLinkCount = 0;
    for (let i = 0; i + 1 < this.commandLinks.length; i += Yay0Reader.LINK_SIZE) {
      if (this.commandLinks.readUInt8(i) >> 4 === 0) {
        longLinkCount += 1;
      }
    }
    this.commandLiterals = await this.literals.read(literalCount + longLinkCount);
    this.commandLiteralsOffset = 0;
  }

  /**
   * Copy the current command byte's next run of consecutive literal bytes, up to the end of
   * {@link result}.
   * @returns the number of bytes copied
   */
  private copyLiterals(result: Buffer, resultOffset: number): number {
    let literalCount = 0;
    while (
      this.commandMask > 0 &&
      (this.command & this.commandMask) !== 0 &&
      literalCount < result.length - resultOffset
    ) {
      literalCount += 1;
      this.commandMask >>= 1;
    }

    if (this.commandLiteralsOffset + literalCount > this.commandLiterals.length) {
      throw this.invalidException();
    }
    this.commandLiterals.copy(
      result,
      resultOffset,
      this.commandLiteralsOffset,
      this.commandLiteralsOffset + literalCount,
    );
    this.commandLiteralsOffset += literalCount;
    this.recordOutput(result, resultOffset, literalCount);
    return literalCount;
  }

  /**
   * Start copying a run of previously decompressed bytes.
   */
  private startCopy(): void {
    if (this.commandLinksOffset + Yay0Reader.LINK_SIZE > this.commandLinks.length) {
      throw this.invalidException();
    }
    const link = this.commandLinks.readUInt16BE(this.commandLinksOffset);
    this.commandLinksOffset += Yay0Reader.LINK_SIZE;
    const distance = (link & 0x0f_ff) + 1;
    let length = link >> 12;
    if (length === 0) {
      if (this.commandLiteralsOffset >= this.commandLiterals.length) {
        throw this.invalidException();
      }
      length = this.commandLiterals.readUInt8(this.commandLiteralsOffset) + 0x10;
      this.commandLiteralsOffset += 1;
    }
    length += 2;

    if (distance > this.position || this.position + length > this.decompressedSize) {
      throw this.invalidException();
    }
    this.copyDistance = distance;
    this.copyRemaining = length;
  }

  /**
   * Record the {@link size} decompressed bytes at {@link offset} of {@link output} in the window,
   * for later links to copy from.
   */
  private recordOutput(output: Buffer, offset: number, size: number): void {
    const windowStart = this.position % Yay0Reader.WINDOW_SIZE;
    const firstSize = Math.min(size, Yay0Reader.WINDOW_SIZE - windowStart);
    output.copy(this.window, windowStart, offset, offset + firstSize);
    // A run that wraps around the window continues at its start
    output.copy(this.window, 0, offset + firstSize, offset + size);
    this.position += size;
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

    await this.getFile().extractToIOFile(async (patchIOFile) => {
      const reader = await this.readerFrom(patchIOFile);

      const header = await reader.readNext(PMSRPatch.HEADER_SIZE);
      if (
        header.length < PMSRPatch.HEADER_SIZE ||
        !header.subarray(0, PMSRPatch.FILE_SIGNATURE.length).equals(PMSRPatch.FILE_SIGNATURE)
      ) {
        throw new IgirException(`PMSR patch header is invalid: ${this.getFile().toString()}`);
      }
      const recordCount = header.readUInt32BE(4);

      await inputRomFile.extractToFile(outputRomPath);
      const targetIOFile = await IOFile.fileFrom(outputRomPath, 'r+');
      try {
        await this.applyRecords(reader, recordCount, targetIOFile, callback);
      } finally {
        await targetIOFile.close();
      }
    });
  }

  private async readerFrom(patchIOFile: IOFile): Promise<PMSRReader> {
    // Star Rod can wrap the PMSR data in Yay0 compression
    const signature = await patchIOFile.peekNext(Yay0Reader.FILE_SIGNATURE.length);
    if (!signature.equals(Yay0Reader.FILE_SIGNATURE)) {
      return patchIOFile;
    }
    return await Yay0Reader.readerFrom(
      patchIOFile,
      () =>
        new IgirException(`PMSR patch Yay0 compression is invalid: ${this.getFile().toString()}`),
    );
  }

  private async applyRecords(
    reader: PMSRReader,
    recordCount: number,
    targetIOFile: IOFile,
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
        await targetIOFile.writeAt(data, offset + written);
        written += chunkSize;
      }

      if (callback !== undefined) {
        callback(Math.floor((reader.getPosition() / reader.getSize()) * targetIOFile.getSize()));
      }
    }
  }

  private truncatedException(): IgirException {
    return new IgirException(`PMSR patch is truncated: ${this.getFile().toString()}`);
  }
}
